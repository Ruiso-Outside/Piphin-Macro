// Piphin Macro: processo principal do Electron.
const { app, BrowserWindow, ipcMain, shell, dialog, Notification, nativeImage, Tray, Menu } = require("electron");
const path = require("path");
const U = require("./lib/util");
const { Macros } = require("./lib/macros");

app.setAppUserModelId("studio.piphin.macro");
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const ICON = path.join(__dirname, "icons", "macro.png");
let win = null;
let macros = null;
let tray = null;
let trayHinted = false;
let quitting = false;

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 580,
    backgroundColor: "#0b0a12",
    title: "Piphin Macro",
    icon: nativeImage.createFromPath(ICON),
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#0b0a12", symbolColor: "#c4b5fd", height: 40 },
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, "web", "index.html"));
  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:")) e.preventDefault(); });
  // com atalhos ativos, fechar a janela só esconde (as macros continuam funcionando na bandeja)
  win.on("close", (e) => {
    if (quitting || !macros.settings.keepInTray || !macros.hasActiveHotkeys()) return;
    e.preventDefault();
    win.hide();
    showTray();
  });
}

const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
const showWin = () => { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); };

// Toda chamada do renderer devolve { ok, data } ou { ok:false, error }
function handle(name, fn) {
  ipcMain.handle(name, async (_e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (e) { return { ok: false, error: e.message || String(e) }; }
  });
}

function registerIpc() {
  handle("app:version", () => app.getVersion());
  handle("macro:snapshot", () => macros.snapshot());
  handle("macro:start", () => macros.start());
  handle("macro:save", (def) => macros.saveMacro(def));
  handle("macro:delete", (id) => macros.deleteMacro(id));
  handle("macro:run", (id, opts) => macros.run(id, { once: !!(opts && opts.once) }));
  handle("macro:test", (id) => macros.test(id));
  handle("macro:stop", (id) => macros.stop(id));
  handle("macro:stopAll", () => macros.stopAll());
  handle("macro:settings", (patch) => macros.setSettings(patch));
  handle("macro:pause", (on) => macros.setHotkeysPaused(on));
  handle("macro:recStart", (opts) => macros.startRecording(opts));
  handle("macro:recStop", () => macros.stopRecording("button", win ? win.getBounds() : null));
  handle("macro:lab", (on, moves) => macros.setLab(on, moves));
  // posição do mouse, cor do pixel ou processo em foco, depois de alguns segundos (para dar tempo de ir ao jogo)
  handle("macro:capture", async (kind, delay) => {
    await macros.start();
    if (delay) await new Promise((r) => setTimeout(r, delay * 1000));
    if (kind === "fg") return { process: (await macros.engine.ask("fg"))[0] };
    const [x, y, color] = await macros.engine.ask("pix", "", "");
    return { x: +x, y: +y, color };
  });
  handle("macro:export", async (ids) => {
    const list = macros.list.filter((m) => ids.includes(m.id));
    const r = await dialog.showSaveDialog(win, { title: "Exportar macros", defaultPath: (list.length === 1 ? list[0].name : "macros") + ".piphin-macro.json",
      filters: [{ name: "Macros do Piphin", extensions: ["json"] }] });
    if (r.canceled || !r.filePath) return false;
    U.writeJson(r.filePath, { schema: 1, macros: list });
    return true;
  });
  handle("macro:import", async () => {
    const r = await dialog.showOpenDialog(win, { title: "Importar macros", properties: ["openFile"], filters: [{ name: "Macros do Piphin", extensions: ["json"] }] });
    if (r.canceled || !r.filePaths[0]) return 0;
    return macros.importMacros(U.readJson(r.filePaths[0], null));
  });
}

function initMacros() {
  macros = new Macros({ userDir: app.getPath("userData") });
  let batch = [];
  let flushing = null;
  macros.on("changed", () => { send("macro:changed"); updateTray(); });
  macros.on("loop", (l) => send("macro:loop", l));
  macros.on("recorded", (r) => { send("macro:recorded", r); if (win && !win.isVisible()) win.show(); });
  macros.on("notice", (n) => {
    send("macro:notice", n);
    if (n.kind === "panic" && win && !win.isFocused() && Notification.isSupported()) new Notification({ title: "Piphin Macro", body: n.text, icon: ICON }).show();
  });
  // eventos do analisador vão em lotes (o mouse pode gerar centenas por segundo)
  macros.on("input", (e) => {
    batch.push(e);
    if (!flushing) flushing = setTimeout(() => { send("macro:input", batch); batch = []; flushing = null; }, 50);
  });
  macros.boot();
}

// Ícone na bandeja: aparece quando a janela é escondida com atalhos ativos
function showTray() {
  if (tray) return;
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.on("click", showWin);
  updateTray();
  if (!trayHinted) {
    trayHinted = true;
    tray.displayBalloon({ title: "Piphin Macro", content: "As macros continuam ativas aqui na bandeja. Clique no ícone para abrir.", iconType: "info" });
  }
}

function updateTray() {
  if (!tray || !macros) return;
  const running = Object.keys(macros.running).length;
  tray.setToolTip(`Piphin Macro · atalhos ${macros.settings.armed ? "ligados" : "desligados"}${running ? ` · ${running} em execução` : ""}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Abrir o Piphin Macro", click: showWin },
    { type: "separator" },
    { label: "Atalhos ligados", type: "checkbox", checked: !!macros.settings.armed, click: (i) => macros.setSettings({ armed: i.checked }) },
    { label: "Parar todas as macros", enabled: running > 0, click: () => macros.stopAll() },
    { type: "separator" },
    { label: "Sair", click: () => { quitting = true; app.quit(); } },
  ]));
}

app.whenReady().then(() => {
  initMacros();
  registerIpc();
  createWindow();
});

app.on("before-quit", () => { quitting = true; });
app.on("will-quit", () => { if (macros) macros.shutdown(); });
app.on("second-instance", showWin);
app.on("window-all-closed", () => app.quit());
