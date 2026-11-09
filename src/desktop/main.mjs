import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  shell,
  Menu,
} from "electron";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { Vault } from "../core/vault.mjs";
import { ProviderRegistry } from "../providers/registry.mjs";
import { ConnectorController } from "../core/controller.mjs";
import { createConnectorServer } from "../core/server.mjs";
import { publicError, fail } from "../core/errors.mjs";
import { createTray } from "./tray.mjs";
import { RequestHistory } from "../core/history.mjs";

const here = dirname(fileURLToPath(import.meta.url));
app.setName("Bring AI");
// Unsigned Electron development and the packaged app have different OS keychain
// identities. Never make them read each other's encrypted credential records.
if (!app.isPackaged) {
  app.setPath("userData", join(app.getPath("appData"), "Bring AI Development"));
}
if (!app.isPackaged && process.env.BRING_AI_DEVTOOLS_PORT)
  app.commandLine.appendSwitch(
    "remote-debugging-port",
    process.env.BRING_AI_DEVTOOLS_PORT,
  );
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let window, controller, providers, server, startupError, tray, history;
  let quitting = false,
    quitReady = false;
  let viewRequest = { name: "main", sequence: 0 };
  const uiURL = new URL("./ui/index.html", import.meta.url).href;
  const show = (view) => {
    if (window) {
      if (view === "main" || view === "history") {
        viewRequest = { name: view, sequence: viewRequest.sequence + 1 };
        notify();
      }
      app.dock?.show();
      window.show();
      window.focus();
    }
  };
  const snapshot = () => ({
    ...controller?.snapshot(),
    startupError,
    viewRequest,
    detected: {
      available: !!providers?.detected,
      ready: !!providers?.detected?.ready,
    },
    signingIn: !!providers?.chatgpt.pending,
    clients: providers?.clientStatus || {},
    clientSetup: providers?.setup.state,
    port: 4360,
    launchAtLogin: app.getLoginItemSettings().openAtLogin,
  });
  const notify = () => {
    if (window && !window.isDestroyed())
      window.webContents.send("bring-ai:change", snapshot());
    tray?.refresh();
  };
  const launchAtLogin = (value) => {
    app.setLoginItemSettings({ openAtLogin: !!value, args: ["--background"] });
    notify();
  };
  app.on("second-instance", show);
  // A protocol link only opens this app. It never approves or selects an account.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    try {
      const u = new URL(url);
      if (
        u.protocol === "bringai:" &&
        u.hostname === "pair" &&
        /^\/[a-f0-9]{48}$/.test(u.pathname)
      )
        show();
    } catch {}
  });
  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "Outlet",
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
          {
            label: "Edit",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "selectAll" },
            ],
          },
          {
            label: "Window",
            submenu: [{ role: "minimize" }, { role: "close" }],
          },
        ]),
      );
      try {
        if (
          !(await safeStorage.isAsyncEncryptionAvailable()) ||
          (process.platform === "linux" &&
            safeStorage.getSelectedStorageBackend() === "basic_text")
        )
          fail(
            "keychain_unavailable",
            "Outlet needs an unlocked system keychain to protect sign-in credentials.",
            503,
          );
        const vault = await new Vault(
          join(app.getPath("userData"), "protected"),
          {
            encrypt: (value) => safeStorage.encryptStringAsync(value),
            decrypt: (value) => safeStorage.decryptStringAsync(value),
          },
        ).open();
        providers = new ProviderRegistry(vault, {
          openExternal: (url) => shell.openExternal(url),
        });
        history = new RequestHistory(vault, { onChange: notify });
        controller = new ConnectorController({ providers, history });
        controller.on("change", notify);
        providers.on("change", notify);
        server = createConnectorServer(controller);
        await new Promise((resolve, reject) => {
          server.once("error", reject);
          server.listen(4360, "127.0.0.1", resolve);
        });
        controller.on("change", () => {
          if (controller.snapshot().pairings.length) show();
        });
        providers.detect().catch(() => {});
        if (app.isPackaged) app.setAsDefaultProtocolClient("bringai");
      } catch (e) {
        startupError =
          e.code === "EADDRINUSE"
            ? "Port 4360 is in use. Close the other connector and reopen Outlet."
            : publicError(e).message;
      }
      ipcMain.handle("bring-ai:action", async (event, action, input = {}) => {
        if (
          event.sender !== window?.webContents ||
          event.senderFrame !== window.webContents.mainFrame ||
          event.senderFrame.url !== uiURL
        )
          throw new Error("Untrusted desktop caller");
        try {
          if (action === "snapshot") return { ok: true, value: snapshot() };
          if (!controller)
            fail(
              "unavailable",
              startupError || "The connector is unavailable.",
            );
          switch (action) {
            case "connectClient":
              await providers.connectClient(input.provider);
              break;
            case "cancelClientLogin":
            case "cancelClientSetup":
              providers.setup.cancel();
              break;
            case "openClientLogin":
              await providers.setup.openLogin();
              break;
            case "clientModel":
              await providers.clientModel(input.provider, input.model);
              break;
            case "clearHistory":
              await history.clear();
              break;
            case "installationHelp": {
              const url = {
                codex: "https://developers.openai.com/codex/cli/",
                claude: "https://code.claude.com/docs/en/setup",
              }[input.provider];
              if (!url) fail("invalid_provider", "Choose Codex or Claude.");
              await shell.openExternal(url);
              break;
            }
            case "detect":
              await providers.detect();
              break;
            case "codex":
              await providers.connectCodex();
              break;
            case "signIn":
              await providers.signIn(input.id);
              break;
            case "cancelSignIn":
              providers.chatgpt.cancelSignIn();
              break;
            case "models":
              await providers.refreshModels(input.id);
              break;
            case "model":
              await providers.model(input.id, input.model);
              break;
            case "disconnect": {
              controller.revokeProfile(input.id);
              const result = await providers.disconnect(input.id);
              if (!result.confirmed)
                return {
                  ok: false,
                  error: {
                    message:
                      "Signed out locally. Remote revocation was not confirmed; disconnect Bring AI in ChatGPT Settings.",
                  },
                };
              break;
            }
            case "approve":
              controller.approve(input.id, input.profileId, {
                minutes: input.minutes,
                requests: input.requests,
              });
              break;
            case "deny":
              controller.deny(input.id);
              break;
            case "revoke":
              controller.revoke(input.id);
              break;
            case "pause":
              controller.pause(input.value);
              break;
            case "launchAtLogin":
              launchAtLogin(input.value);
              break;
            case "usage":
              await shell.openExternal("https://chatgpt.com/settings/usage");
              break;
            default:
              fail("invalid_action", "Unknown desktop action.");
          }
          notify();
          return { ok: true };
        } catch (e) {
          return { ok: false, error: publicError(e) };
        }
      });
      function createWindow() {
        window = new BrowserWindow({
          show: false,
          width: 560,
          height: 540,
          minWidth: 420,
          minHeight: 460,
          backgroundColor: "#fafafa",
          title: "Outlet",
          webPreferences: {
            preload: join(here, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });
        window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        window.webContents.on("will-navigate", (event, url) => {
          if (url !== uiURL) event.preventDefault();
        });
        window.loadURL(uiURL);
        window.once("ready-to-show", () => {
          if (
            !tray ||
            startupError ||
            !(
              process.argv.includes("--background") ||
              app.getLoginItemSettings().wasOpenedAtLogin
            )
          )
            show();
        });
        window.on("close", (event) => {
          if (!quitReady && tray) {
            event.preventDefault();
            window.hide();
            app.dock?.hide();
          }
        });
        window.on("closed", () => {
          window = null;
        });
      }
      createWindow();
      try {
        tray = createTray({
          getState: snapshot,
          show: () => show("main"),
          history: () => show("history"),
          pause: (value) => controller?.pause(value),
          revokeAll: () => {
            for (const grant of controller?.snapshot().grants || [])
              controller.revoke(grant.id);
          },
          launchAtLogin,
          quit: () => app.quit(),
        });
      } catch {
        // A desktop without a tray must retain a visible window and normal Quit.
      }
      if (
        tray &&
        !startupError &&
        (process.argv.includes("--background") ||
          app.getLoginItemSettings().wasOpenedAtLogin)
      ) {
        window.hide();
        app.dock?.hide();
      }
      app.on("activate", () => (window ? show() : createWindow()));
      app.on("window-all-closed", () => app.quit());
      app.on("before-quit", (event) => {
        if (!quitReady) {
          event.preventDefault();
          if (quitting) return;
          quitting = true;
          providers?.close();
          controller?.close();
          server?.close();
          server?.closeAllConnections();
          Promise.allSettled([
            providers?.setup.cancelAndWait(),
            history?.flush(),
          ]).finally(() => {
            quitReady = true;
            app.quit();
          });
          return;
        }
        quitting = true;
        tray?.destroy();
        tray = null;
      });
    })
    .catch(() => app.quit());
}
