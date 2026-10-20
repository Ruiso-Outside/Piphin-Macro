// Dentro do Piphin Hub: a mesma API window.macro do app separado, falando com o motor do módulo.
(() => {
  const call = (ch) => (...args) => piphin.invoke(ch, ...args);
  const on = (ch) => (fn) => piphin.on(ch, fn);
  window.macro = {
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
    onChanged: on("macro:changed"),
    onLoop: on("macro:loop"),
    onInput: on("macro:input"),
    onRecorded: on("macro:recorded"),
    onNotice: on("macro:notice"),
  };
})();
