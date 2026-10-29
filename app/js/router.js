// Router por hash: "#/" (inicio), "#/lista/<id>" (una lista) y "#/cuenta" (cuenta y sincronización) y "#/ajustes" (tema e idioma).

export function parseHash(hash) {
  const m = /^#\/lista\/(.+)$/.exec(hash || '');
  if (m) {
    try { return { name: 'list', id: decodeURIComponent(m[1]) }; } catch (_) { /* hash mal formado */ }
  }
  if (hash === '#/cuenta') return { name: 'account' };
  if (hash === '#/ajustes') return { name: 'settings' };
  return { name: 'home' };
}

export function listHash(id) {
  return '#/lista/' + encodeURIComponent(id);
}

export const ACCOUNT_HASH = '#/cuenta';
export const SETTINGS_HASH = '#/ajustes';

export function createRouter(onRoute) {
  const handle = () => onRoute(parseHash(location.hash));
  window.addEventListener('hashchange', handle);
  return { start: handle };
}
