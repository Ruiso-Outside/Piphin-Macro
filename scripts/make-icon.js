// Desenha o ícone do Piphin Macro: icons/macro.png (256) e icons/macro.ico (16-256).
// Uso: npm run icon   (usa o próprio Electron para desenhar; sem dependências)
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "icons");

function ico(pngs) {
  // ICO com entradas PNG (aceito desde o Windows Vista)
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = head.length;
  pngs.forEach(({ size, buf }, i) => {
    const e = 6 + i * 16;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += buf.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.buf)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL("about:blank");
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const out = await win.webContents.executeJavaScript(`(() => {
    const res = {};
    for (const s of ${JSON.stringify(sizes)}) {
      const c = document.createElement("canvas"); c.width = c.height = s;
      const g = c.getContext("2d"); const k = s / 256;
      // fundo: quadrado arredondado escuro
      const r = 56 * k;
      g.beginPath(); g.roundRect(8 * k, 8 * k, 240 * k, 240 * k, r);
      const bg = g.createLinearGradient(0, 0, s, s); bg.addColorStop(0, "#1d1640"); bg.addColorStop(1, "#0b0a12");
      g.fillStyle = bg; g.fill();
      g.lineWidth = Math.max(1, 3 * k); g.strokeStyle = "rgba(168,85,247,.55)"; g.stroke();
      // tecla com um cursor de mouse por cima (teclado + mouse)
      g.shadowColor = "#a855f7"; g.shadowBlur = 16 * k;
      g.lineWidth = Math.max(1.5, 10 * k); g.strokeStyle = "#a855f7";
      g.beginPath(); g.roundRect(46 * k, 58 * k, 132 * k, 132 * k, 26 * k); g.stroke();
      if (s >= 32) { g.lineWidth = Math.max(1, 5 * k); g.strokeStyle = "rgba(192,132,252,.6)";
        g.beginPath(); g.roundRect(70 * k, 80 * k, 84 * k, 74 * k, 14 * k); g.stroke(); }
      const cur = [[132, 112], [132, 222], [158, 196], [176, 236], [196, 227], [178, 188], [214, 186]];
      const cg = g.createLinearGradient(132 * k, 112 * k, 214 * k, 236 * k); cg.addColorStop(0, "#ffffff"); cg.addColorStop(1, "#e879f9");
      g.shadowColor = "#e879f9"; g.shadowBlur = 18 * k;
      g.fillStyle = cg; g.beginPath(); cur.forEach(([x, y], i) => i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)); g.closePath(); g.fill();
      g.shadowBlur = 0; g.lineJoin = "round"; g.lineWidth = Math.max(1, 6 * k); g.strokeStyle = "#0b0a12"; g.stroke();
      g.fillStyle = cg; g.fill();
      res[s] = c.toDataURL("image/png");
    }
    return res;
  })()`);
  const png = (s) => Buffer.from(out[s].split(",")[1], "base64");
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "macro.png"), png(256));
  fs.writeFileSync(path.join(OUT, "macro.ico"), ico(sizes.map((s) => ({ size: s, buf: png(s) }))));
  console.log("ícones gerados:", sizes.join(", "));
  app.exit(0);
});
