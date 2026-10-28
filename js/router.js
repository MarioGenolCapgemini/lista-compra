// Router por hash: "#/" (inicio) y "#/lista/<id>" (una lista).

export function parseHash(hash) {
  const m = /^#\/lista\/(.+)$/.exec(hash || '');
  if (m) {
    try { return { name: 'list', id: decodeURIComponent(m[1]) }; } catch (_) { /* hash mal formado */ }
  }
  return { name: 'home' };
}

export function listHash(id) {
  return '#/lista/' + encodeURIComponent(id);
}

export function createRouter(onRoute) {
  const handle = () => onRoute(parseHash(location.hash));
  window.addEventListener('hashchange', handle);
  return { start: handle };
}
