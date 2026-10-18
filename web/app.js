// Utilidades da interface do Piphin Macro (avisos e confirmação); as telas ficam em macro.js.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let modalResolve = null;
function confirmBox(title, html, okText = "Confirmar", danger = false) {
  return new Promise((resolve) => {
    modalResolve = resolve;
    $("#modalBox").innerHTML = `<h3>${esc(title)}</h3><p>${html}</p><div class="modal-actions">
      <button class="btn ghost" id="mNo">Cancelar</button><button class="btn ${danger ? "danger" : "primary"}" id="mYes">${esc(okText)}</button></div>`;
    $("#modal").hidden = false;
    $("#mNo").onclick = () => closeModal(false);
    $("#mYes").onclick = () => closeModal(true);
    $("#mYes").focus();
  });
}
function closeModal(v = false) {
  $("#modal").hidden = true;
  if (modalResolve) { modalResolve(v); modalResolve = null; }
}

function toast(msg, kind = "") {
  const t = document.createElement("div");
  t.className = "toast " + kind;
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), kind === "err" ? 7000 : 3500);
}

document.addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(false); });
macro.version().then((r) => { if (r.ok) $("#appVer").textContent = `Piphin Macro v${r.data}`; });
