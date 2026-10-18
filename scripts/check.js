// Teste rápido sem interface: compila o motor, confere os ganchos e a precisão do tempo.
// Uso: npm run check   (envia só a tecla F24, que não faz nada no Windows)
const { Engine } = require("../lib/engine");

const e = new Engine();
const t0 = Date.now();
const fail = (msg) => { console.error("FALHOU:", msg); e.stop(); process.exit(1); };

e.start().then(async () => {
  console.log(`motor pronto em ${Date.now() - t0} ms · tela virtual ${e.screen.w}x${e.screen.h}`);
  console.log("janela em foco:", (await e.ask("fg"))[0] || "(nenhuma)");
  const seen = [];
  e.on("line", (f) => {
    if (f[0] === "k" && f[2] === "135") seen.push({ kind: f[1], src: f[5], t: +f[6] });
    if (f[0] === "end") {
      e.send("mon", 0, 0);
      const downs = seen.filter((x) => x.kind === "d").map((x) => x.t);
      const iv = downs.slice(1).map((t, i) => t - downs[i]);
      const avg = iv.reduce((a, b) => a + b, 0) / (iv.length || 1);
      console.log(`F24 x${downs.length} · intervalo médio ${avg.toFixed(2)} ms (esperado 50) · marcadas como Piphin: ${seen.every((x) => x.src === "2")}`);
      if (downs.length !== 10) fail("esperava 10 teclas");
      if (Math.abs(avg - 50) > 3) fail("tempo impreciso");
      console.log("ok");
      e.stop();
    }
  });
  e.send("mon", 1, 0);
  e.send("run", "check", 10, 0, "kp,135,20;w,30");
}).catch((err) => fail(err.message));
