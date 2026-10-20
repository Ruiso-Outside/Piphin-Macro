// Ferramentas do Piphin Macro para a IA (Piphin LLM, pelo Piphin Hub). Declaradas no module.json ("tools").
// A IA descreve a macro com nomes de teclas ("E", "F6", "Ctrl+Shift+Q", "Mouse4") e passos simples;
// aqui isso vira o formato das macros do app (códigos de tecla do Windows, passos t: "key" | "click" | ...).
const CLICKER_ID = "autoclicker"; // o mesmo de lib/macros.js

const VK = { enter: 13, space: 32, tab: 9, esc: 27, escape: 27, backspace: 8, shift: 16, ctrl: 17, control: 17, alt: 18, win: 91,
  lshift: 160, rshift: 161, lctrl: 162, rctrl: 163, lalt: 164, ralt: 165, capslock: 20, up: 38, down: 40, left: 37, right: 39,
  insert: 45, delete: 46, del: 46, home: 36, end: 35, pageup: 33, pagedown: 34, printscreen: 44, pause: 19,
  mouse1: 1, leftclick: 1, mouse2: 2, rightclick: 2, mouse3: 4, middleclick: 4, mouse4: 5, mouse5: 6,
  "-": 189, "=": 187, ",": 188, ".": 190, ";": 186, "/": 191, "'": 222, "[": 219, "]": 221, "\\": 220, "`": 192,
  // apelidos em português
  "espaço": 32, espaco: 32, "seta para cima": 38, "seta para baixo": 40, "seta para esquerda": 37, "seta para direita": 39,
  "botão esquerdo": 1, "botão direito": 2, "botão do meio": 4 };
const NAMES = { 1: "Botão esquerdo", 2: "Botão direito", 4: "Botão do meio", 5: "Mouse 4", 6: "Mouse 5", 13: "Enter", 32: "Espaço", 9: "Tab", 27: "Esc",
  8: "Backspace", 16: "Shift", 17: "Ctrl", 18: "Alt", 160: "Shift esq.", 162: "Ctrl esq.", 164: "Alt esq.", 38: "↑", 40: "↓", 37: "←", 39: "→", 20: "Caps Lock" };
const MODS = { ctrl: 1, control: 1, alt: 2, shift: 4, win: 8 };
const BUTTONS = { left: 1, right: 2, middle: 4, x1: 5, x2: 6, mouse4: 5, mouse5: 6 }; // os mesmos números da tela (web/macro.js)

function vkOf(name) {
  const k = String(name || "").trim().toLowerCase();
  if (!k) return 0;
  if (/^[a-z0-9]$/.test(k)) return k.toUpperCase().charCodeAt(0);
  let m = k.match(/^f([1-9]|1[0-9]|2[0-4])$/); if (m) return 111 + Number(m[1]);
  m = k.match(/^(?:numpad|num)\s*([0-9])$/); if (m) return 96 + Number(m[1]);
  m = k.match(/^vk\s*(\d{1,3})$/); if (m) return Math.min(255, Number(m[1]));
  if (VK[k] !== undefined) return VK[k];
  if (VK[k.replace(/\s+/g, "")] !== undefined) return VK[k.replace(/\s+/g, "")];
  throw new Error(`Tecla desconhecida: "${name}". Use nomes como A, 1, F6, Space, Enter, Shift, Ctrl, Up, Numpad1, Mouse4.`);
}
function keyName(vk) {
  if (NAMES[vk]) return NAMES[vk];
  if ((vk >= 65 && vk <= 90) || (vk >= 48 && vk <= 57)) return String.fromCharCode(vk);
  if (vk >= 112 && vk <= 135) return "F" + (vk - 111);
  if (vk >= 96 && vk <= 105) return "Num " + (vk - 96);
  return "tecla " + vk;
}
function parseHotkey(text) {
  if (!text) return null;
  const parts = String(text).split("+").map((p) => p.trim()).filter(Boolean);
  let mods = 0, vk = 0;
  for (const p of parts) {
    const low = p.toLowerCase();
    if (MODS[low] && parts.length > 1 && p !== parts[parts.length - 1]) mods |= MODS[low];
    else vk = vkOf(p);
  }
  if (!vk) throw new Error(`Atalho inválido: "${text}"`);
  if ((vk === 1 || vk === 2) && !mods) throw new Error("O botão esquerdo ou direito do mouse sozinho atrapalha o uso do PC: combine com Ctrl, Alt ou Shift, ou use Mouse4, Mouse5 ou uma tecla F.");
  return { vk, mods };
}
const hotkeyName = (h) => (h && h.vk ? ["Ctrl", "Alt", "Shift", "Win"].filter((_, i) => (h.mods || 0) & (1 << i)).map((n) => n + " + ").join("") + keyName(h.vk) : "sem atalho");
const n = (v, def, min, max) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def; };

// passos da IA -> passos do app; "repeat" com passos dentro vira bloco repetir ... fim
function toSteps(list, depth = 0) {
  if (!Array.isArray(list)) throw new Error("steps precisa ser uma lista de passos");
  if (depth > 4) throw new Error("Blocos de repetição aninhados demais");
  const out = [];
  for (const s of list) {
    const type = String((s && s.type) || "").toLowerCase();
    switch (type) {
      case "key": {
        const act = ["down", "up"].includes(s.action) ? s.action : "press";
        out.push({ t: "key", vk: vkOf(s.key), act, ...(act === "press" ? { hold: n(s.hold_ms, 30, 0, 10000) } : {}) });
        break;
      }
      case "click": {
        const act = ["down", "up"].includes(s.action) ? s.action : "click";
        out.push({ t: "click", btn: BUTTONS[String(s.button || "left").toLowerCase()] || 1, act,
          ...(act === "click" ? { hold: n(s.hold_ms, 25, 0, 10000), count: n(s.count, 1, 1, 100) } : {}) });
        break;
      }
      case "wait": {
        const ms = n(s.ms, 100, 0, 3600000), max = n(s.max_ms, 0, 0, 3600000);
        out.push({ t: "wait", ms, ...(max > ms ? { max } : {}) });
        break;
      }
      case "move":
        out.push({ t: "move", mode: s.relative ? "rel" : "abs", x: Math.round(n(s.x, 0, -20000, 20000)), y: Math.round(n(s.y, 0, -20000, 20000)), dur: n(s.duration_ms, 0, 0, 60000) });
        break;
      case "scroll":
        out.push({ t: "wheel", dir: s.horizontal ? "h" : "v", amount: n(s.amount, 1, -100, 100) });
        break;
      case "text":
        if (s.text) out.push({ t: "text", text: String(s.text).slice(0, 2000), gap: n(s.gap_ms, 15, 0, 1000) });
        break;
      case "repeat":
        out.push({ t: "loop", times: n(s.times, 2, 0, 100000) }, ...toSteps(s.steps || [], depth + 1), { t: "end" });
        break;
      default:
        throw new Error(`Tipo de passo desconhecido: "${s && s.type}". Use key, click, wait, move, scroll, text ou repeat.`);
    }
  }
  return out;
}

const BTN_NAME = { 1: "esquerdo", 2: "direito", 4: "do meio", 5: "Mouse 4", 6: "Mouse 5" };
function describeSteps(steps) {
  return steps.map((s) => {
    switch (s.t) {
      case "key": return s.act === "press" ? `apertar ${keyName(s.vk)}` : `${s.act === "down" ? "segurar" : "soltar"} ${keyName(s.vk)}`;
      case "click": return s.act === "click" ? `clique ${BTN_NAME[s.btn] || ""}${s.count > 1 ? ` ×${s.count}` : ""}` : `${s.act === "down" ? "segurar" : "soltar"} botão ${BTN_NAME[s.btn] || ""}`;
      case "wait": return s.max ? `esperar ${s.ms}–${s.max} ms` : `esperar ${s.ms} ms`;
      case "move": return s.mode === "rel" ? `mover o mouse ${s.x},${s.y}` : `mover o mouse para ${s.x},${s.y}`;
      case "wheel": return `rolar ${s.amount}`;
      case "text": return `digitar "${String(s.text).slice(0, 40)}"`;
      case "pixel": return `esperar a cor ${s.color} em ${s.x},${s.y}`;
      case "loop": return `repetir ${s.times ? s.times + "×" : "sempre"} {`;
      case "end": return "}";
      default: return s.t;
    }
  }).join(", ");
}

const MODE_NAME = { once: "uma vez por atalho", repeat: "repete N vezes", toggle: "liga/desliga no atalho", hold: "enquanto segurar o atalho" };

function describe(m) {
  if (m.kind === "clicker") {
    const c = m.clicker || {};
    return { id: m.id, name: m.name, type: "autoclicker", enabled: !!m.enabled, hotkey: hotkeyName(m.hotkey), mode: m.mode === "hold" ? MODE_NAME.hold : MODE_NAME.toggle,
      clicks: `${c.cps}${c.cpsMax > c.cps ? "–" + c.cpsMax : ""} cliques/s, botão ${BTN_NAME[c.button] || c.button}${c.double ? ", clique duplo" : ""}` };
  }
  return { id: m.id, name: m.name, type: "macro", enabled: !!m.enabled, hotkey: hotkeyName(m.hotkey),
    mode: MODE_NAME[m.mode] + (m.mode === "repeat" ? ` (${m.repeat}×)` : ""), random_delay: m.jitter ? m.jitter + "%" : "não",
    only_in: m.process || "qualquer programa", steps: describeSteps(m.steps || []) };
}

function register(ctx, macros) {
  const conflict = (hk, selfId) => hk && macros.list.find((m) => m.id !== selfId && m.enabled && m.hotkey && m.hotkey.vk === hk.vk && (m.hotkey.mods || 0) === (hk.mods || 0));
  const tell = (text) => ctx.host.notify("Piphin Macro", text).catch(() => {});

  ctx.handle("tool:list_macros", () => ({ macros: macros.list.map(describe), panic_key: hotkeyName(macros.settings.panic), hotkeys_on: !!macros.settings.armed }));

  ctx.handle("tool:create_macro", (a) => {
    const steps = toSteps(a.steps);
    if (!steps.length) throw new Error("A macro precisa de pelo menos um passo");
    const hotkey = parseHotkey(a.hotkey);
    const old = a.replace ? macros.list.find((m) => m.kind !== "clicker" && m.name.toLowerCase() === String(a.replace).toLowerCase()) : null;
    if (a.replace && !old) throw new Error(`Não existe macro chamada "${a.replace}" para substituir`);
    const mode = ["once", "repeat", "toggle", "hold"].includes(a.mode) ? a.mode : "once";
    const def = { ...(old || {}), id: old ? old.id : undefined, kind: "macro", name: String(a.name || "Macro da IA").slice(0, 80), enabled: a.enabled !== false,
      hotkey, mode, repeat: n(a.repeat_times, 5, 1, 100000), jitter: n(a.random_delay_percent, 0, 0, 90), swallow: false,
      process: String(a.only_in_program || "").trim().slice(0, 80), steps };
    const clash = conflict(hotkey, def.id);
    const m = macros.saveMacro(def);
    tell(`${old ? "A IA alterou" : "A IA criou"} a macro "${m.name}"`);
    return { ok: true, [old ? "updated" : "created"]: describe(m),
      warnings: [!hotkey && "Sem atalho: a macro só roda pelo botão Testar no Piphin Macro.",
        clash && `O atalho ${hotkeyName(hotkey)} também é usado pela macro "${clash.name}".`,
        !macros.settings.armed && "Os atalhos estão desligados no Piphin Macro."].filter(Boolean),
      tip: `Para parar qualquer macro na hora: ${hotkeyName(macros.settings.panic)}. Dá para ajustar tudo no módulo Piphin Macro.` };
  });

  ctx.handle("tool:configure_autoclicker", (a) => {
    const m = macros.list.find((x) => x.id === CLICKER_ID);
    const c = { ...m.clicker };
    if (a.clicks_per_second !== undefined) c.cps = n(a.clicks_per_second, c.cps, 0.1, 200);
    c.cpsMax = a.max_clicks_per_second !== undefined ? Math.max(c.cps, n(a.max_clicks_per_second, c.cps, 0.1, 200)) : Math.max(c.cps, c.cpsMax || c.cps);
    if (a.button) c.button = BUTTONS[String(a.button).toLowerCase()] || c.button;
    if (a.double_click !== undefined) c.double = !!a.double_click;
    if (a.stop_after_clicks !== undefined) c.limit = n(a.stop_after_clicks, 0, 0, 1e9);
    const def = { ...m, clicker: c };
    if (a.hotkey) def.hotkey = parseHotkey(a.hotkey);
    if (a.mode) def.mode = a.mode === "hold" ? "hold" : "toggle";
    if (a.enabled !== undefined) def.enabled = !!a.enabled;
    const saved = macros.saveMacro(def);
    tell("A IA ajustou o autoclicker");
    return { ok: true, autoclicker: describe(saved) };
  });
}

module.exports = { register, toSteps, parseHotkey };
