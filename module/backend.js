// Piphin Macro como módulo do Piphin Hub: o mesmo motor do app separado (lib/), rodando dentro do Hub.
// As macros ficam em %APPDATA%\Piphin Macro\macros.json, as mesmas do app separado.
const path = require("path");
const U = require("./lib/util");
const { Macros } = require("./lib/macros");
const aiTools = require("./ai-tools");

exports.activate = (ctx) => {
  const macros = new Macros({ userDir: path.join(process.env.APPDATA, "Piphin Macro") });

  // com atalhos ativos, fechar a janela do Hub só esconde (as macros continuam funcionando)
  const keepAlive = () => ctx.host.keepAlive(macros.settings.keepInTray && macros.hasActiveHotkeys(), "atalhos do Piphin Macro").catch(() => {});

  let batch = [];
  let flushing = null;
  macros.on("changed", () => { ctx.emit("macro:changed"); keepAlive(); });
  macros.on("loop", (l) => ctx.emit("macro:loop", l));
  macros.on("recorded", (r) => { ctx.emit("macro:recorded", r); ctx.host.focus().catch(() => {}); });
  macros.on("notice", (n) => {
    ctx.emit("macro:notice", n);
    if (n.kind === "panic") ctx.host.notify("Piphin Macro", n.text).catch(() => {});
  });
  // eventos do analisador vão em lotes (o mouse pode gerar centenas por segundo)
  macros.on("input", (e) => {
    batch.push(e);
    if (!flushing) flushing = setTimeout(() => { ctx.emit("macro:input", batch); batch = []; flushing = null; }, 50);
  });

  ctx.handle("app:version", () => ctx.version);
  ctx.handle("macro:snapshot", () => macros.snapshot());
  ctx.handle("macro:start", () => macros.start());
  ctx.handle("macro:save", (def) => macros.saveMacro(def));
  ctx.handle("macro:delete", (id) => macros.deleteMacro(id));
  ctx.handle("macro:run", (id, opts) => macros.run(id, { once: !!(opts && opts.once) }));
  ctx.handle("macro:test", (id) => macros.test(id));
  ctx.handle("macro:stop", (id) => macros.stop(id));
  ctx.handle("macro:stopAll", () => macros.stopAll());
  ctx.handle("macro:settings", (patch) => macros.setSettings(patch));
  ctx.handle("macro:pause", (on) => macros.setHotkeysPaused(on));
  ctx.handle("macro:recStart", (opts) => macros.startRecording(opts));
  ctx.handle("macro:recStop", async () => macros.stopRecording("button", await ctx.host.windowBounds()));
  ctx.handle("macro:lab", (on, moves) => macros.setLab(on, moves));
  // posição do mouse, cor do pixel ou processo em foco, depois de alguns segundos (para dar tempo de ir ao jogo)
  ctx.handle("macro:capture", async (kind, delay) => {
    await macros.start();
    if (delay) await new Promise((r) => setTimeout(r, delay * 1000));
    if (kind === "fg") return { process: (await macros.engine.ask("fg"))[0] };
    const [x, y, color] = await macros.engine.ask("pix", "", "");
    return { x: +x, y: +y, color };
  });
  ctx.handle("macro:export", async (ids) => {
    const list = macros.list.filter((m) => ids.includes(m.id));
    const file = await ctx.host.saveDialog({ title: "Exportar macros", defaultPath: (list.length === 1 ? list[0].name : "macros") + ".piphin-macro.json",
      filters: [{ name: "Macros do Piphin", extensions: ["json"] }] });
    if (!file) return false;
    U.writeJson(file, { schema: 1, macros: list });
    return true;
  });
  ctx.handle("macro:import", async () => {
    const files = await ctx.host.openDialog({ title: "Importar macros", properties: ["openFile"], filters: [{ name: "Macros do Piphin", extensions: ["json"] }] });
    if (!files || !files[0]) return 0;
    return macros.importMacros(U.readJson(files[0], null));
  });

  // ferramentas para a IA (Piphin LLM): listar, criar e ajustar macros; declaradas no module.json
  aiTools.register(ctx, macros);

  ctx.onStop(() => macros.shutdown());
  macros.boot();
  keepAlive();
};
