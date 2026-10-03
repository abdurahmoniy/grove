const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("grove", {
  request: (method, payload = {}) =>
    ipcRenderer.invoke("grove:request", method, payload),
  onChange: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("grove:changed", listener);
    return () => ipcRenderer.removeListener("grove:changed", listener);
  },
});
