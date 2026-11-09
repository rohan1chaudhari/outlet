import { Tray, Menu, nativeImage } from "electron";

function trayIcon() {
  const size = 32;
  const pixels = Buffer.alloc(size * size * 4);
  const line = (x1, y1, x2, y2) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let step = 0; step <= steps; step++) {
      const x = Math.round(x1 + ((x2 - x1) * step) / steps);
      const y = Math.round(y1 + ((y2 - y1) * step) / steps);
      for (let dx = 0; dx < 2; dx++)
        for (let dy = 0; dy < 2; dy++)
          pixels[((y + dy) * size + x + dx) * 4 + 3] = 255;
    }
  };
  // The README's bracket-and-arrow mark at 2× menu-bar resolution.
  for (const segment of [
    [7, 5, 3, 5],
    [3, 5, 3, 25],
    [3, 25, 7, 25],
    [25, 5, 29, 5],
    [29, 5, 29, 25],
    [29, 25, 25, 25],
    [9, 15, 22, 15],
    [17, 10, 22, 15],
    [22, 15, 17, 20],
  ])
    line(...segment);
  const image = nativeImage.createFromBitmap(pixels, {
    width: size,
    height: size,
    scaleFactor: 2,
  });
  image.setTemplateImage(process.platform === "darwin");
  return image;
}

export function createTray({
  getState,
  show,
  history,
  pause,
  revokeAll,
  launchAtLogin,
  quit,
}) {
  const tray = new Tray(trayIcon());
  const refresh = () => {
    const state = getState();
    const status = state.startupError
      ? "Unavailable"
      : state.paused
        ? "Paused"
        : "Running";
    tray.setToolTip(`Bring AI · ${status}`);
    const actions = () => [
      { label: `Bring AI · ${status}`, enabled: false },
      { label: "Open Bring AI", click: show },
      { label: "History…", click: history },
      { type: "separator" },
      {
        label: "Pause AI access",
        type: "checkbox",
        checked: !!state.paused,
        enabled: !state.startupError,
        click: (item) => pause(item.checked),
      },
      {
        label: "Revoke all web apps",
        enabled: state.grants?.length > 0,
        click: revokeAll,
      },
      {
        label: "Open at login",
        type: "checkbox",
        checked: !!state.launchAtLogin,
        click: (item) => launchAtLogin(item.checked),
      },
      { type: "separator" },
      {
        label: "Quit Bring AI",
        accelerator: "CommandOrControl+Q",
        click: quit,
      },
    ];
    tray.setContextMenu(Menu.buildFromTemplate(actions()));
    // Keep the same actions available from the app menu when its window is open.
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "Bring AI",
          submenu: [{ role: "about" }, { type: "separator" }, ...actions()],
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
        { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] },
      ]),
    );
  };
  tray.on("double-click", show);
  refresh();
  return { refresh, destroy: () => tray.destroy() };
}
