import { Tray, Menu, nativeImage } from "electron";

function trayIcon() {
  const size = 32;
  const pixels = Buffer.alloc(size * size * 4);
  // The Outlet mark at 2× menu-bar resolution: a rounded plate with two
  // slots and a spark cut out, so it works as a monochrome template image.
  const plate = (x, y) => {
    const [lo, hi, r] = [3, 28, 6];
    if (x < lo || x > hi || y < lo || y > hi) return false;
    const cx = x < lo + r ? lo + r : x > hi - r ? hi - r : x;
    const cy = y < lo + r ? lo + r : y > hi - r ? hi - r : y;
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  const slot = (x, y) =>
    y >= 8 && y <= 16 && ((x >= 10 && x <= 12) || (x >= 19 && x <= 21));
  const spark = (x, y) => {
    const dx = Math.abs(x - 15.5);
    const dy = Math.abs(y - 21.5);
    return dx + dy <= 2.5 || (dx <= 0.5 && dy <= 4) || (dy <= 0.5 && dx <= 4);
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (plate(x, y) && !slot(x, y) && !spark(x, y))
        pixels[(y * size + x) * 4 + 3] = 255;
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
    tray.setToolTip(`Outlet · ${status}`);
    const actions = () => [
      { label: `Outlet · ${status}`, enabled: false },
      { label: "Open Outlet", click: show },
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
        label: "Quit Outlet",
        accelerator: "CommandOrControl+Q",
        click: quit,
      },
    ];
    tray.setContextMenu(Menu.buildFromTemplate(actions()));
    // Keep the same actions available from the app menu when its window is open.
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "Outlet",
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
