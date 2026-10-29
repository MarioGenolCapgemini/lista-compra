// Mini runner de pruebas sin dependencias. Funciona en navegador y en Node.

export function createRunner() {
  const tests = [];
  return {
    test(name, fn) { tests.push({ name, fn }); },
    async run() {
      const results = [];
      for (const t of tests) {
        try { await t.fn(); results.push({ name: t.name, ok: true }); }
        catch (e) { results.push({ name: t.name, ok: false, error: e.message }); }
      }
      return results;
    },
  };
}

const show = (v) => JSON.stringify(v);

export const assert = {
  ok(cond, msg) { if (!cond) throw new Error(msg || 'se esperaba un valor verdadero'); },
  equal(actual, expected, msg) {
    if (actual !== expected) throw new Error(`${msg || 'equal'}: esperado ${show(expected)}, recibido ${show(actual)}`);
  },
  deepEqual(actual, expected, msg) {
    if (show(actual) !== show(expected)) throw new Error(`${msg || 'deepEqual'}: esperado ${show(expected)}, recibido ${show(actual)}`);
  },
};

// Solo navegador: pinta los resultados en un elemento.
export function renderResults(results, el) {
  const failed = results.filter((r) => !r.ok).length;
  el.innerHTML =
    `<h2 style="color:${failed ? '#b3261e' : '#1f7a4d'}">${results.length - failed}/${results.length} pruebas OK</h2>` +
    '<ul style="font:14px system-ui;line-height:1.6;list-style:none;padding:0">' +
    results.map((r) =>
      `<li style="color:${r.ok ? '#1d2521' : '#b3261e'}">${r.ok ? '✔' : '✘'} ${r.name}` +
      `${r.ok ? '' : ' — ' + r.error}</li>`).join('') +
    '</ul>';
}
