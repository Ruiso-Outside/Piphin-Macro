// Gera dist/piphin-module-macro-<versão>.zip: o Piphin Macro como módulo do Piphin Hub.
// O motor (lib/) e as telas (web/) são os mesmos do app separado; module/ tem só o que muda dentro do Hub.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const stage = path.join(root, "dist", "module-stage");
const out = path.join(root, "dist", `piphin-module-macro-${pkg.version}.zip`);

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(path.join(stage, "web"), { recursive: true });
fs.mkdirSync(path.join(stage, "icons"), { recursive: true });

const manifest = JSON.parse(fs.readFileSync(path.join(root, "module", "module.json"), "utf8"));
manifest.version = pkg.version;
fs.writeFileSync(path.join(stage, "module.json"), JSON.stringify(manifest, null, 2));
fs.copyFileSync(path.join(root, "module", "backend.js"), path.join(stage, "backend.js"));
fs.cpSync(path.join(root, "lib"), path.join(stage, "lib"), { recursive: true });
for (const f of ["style.css", "app.js", "macro.js"]) fs.copyFileSync(path.join(root, "web", f), path.join(stage, "web", f));
fs.cpSync(path.join(root, "module", "web"), path.join(stage, "web"), { recursive: true });
fs.copyFileSync(path.join(root, "icons", "macro.png"), path.join(stage, "icons", "macro.png"));

fs.rmSync(out, { force: true });
const tar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
execFileSync(tar, ["-a", "-c", "-f", out, "-C", stage, "."], { stdio: "inherit" });
fs.rmSync(stage, { recursive: true, force: true });
console.log("módulo:", out, `(${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
