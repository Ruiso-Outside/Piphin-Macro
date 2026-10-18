const { contextBridge, ipcRenderer } = require("electron");

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld("macro", {
  version: call("app:version"),
  snapshot: call("macro:snapshot"),
  start: call("macro:start"),
  save: call("macro:save"),
  remove: call("macro:delete"),
  run: call("macro:run"),
  test: call("macro:test"),
  stop: call("macro:stop"),
  stopAll: call("macro:stopAll"),
  settings: call("macro:settings"),
  pause: call("macro:pause"),
  recStart: call("macro:recStart"),
  recStop: call("macro:recStop"),
  lab: call("macro:lab"),
  capture: call("macro:capture"),
  exportMacros: call("macro:export"),
  importMacros: call("macro:import"),
  onChanged: (fn) => ipcRenderer.on("macro:changed", () => fn()),
  onLoop: (fn) => ipcRenderer.on("macro:loop", (_e, l) => fn(l)),
  onInput: (fn) => ipcRenderer.on("macro:input", (_e, list) => fn(list)),
  onRecorded: (fn) => ipcRenderer.on("macro:recorded", (_e, r) => fn(r)),
  onNotice: (fn) => ipcRenderer.on("macro:notice", (_e, n) => fn(n)),
});
