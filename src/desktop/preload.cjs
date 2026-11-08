const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("bringAI", {
  action: (action, input) =>
    ipcRenderer.invoke("bring-ai:action", action, input),
  subscribe: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("bring-ai:change", handler);
    return () => ipcRenderer.removeListener("bring-ai:change", handler);
  },
});
