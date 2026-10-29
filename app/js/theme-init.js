// Aplica el tema ANTES del primer pintado para que no haya parpadeo (AC12.4).
// Script clásico y bloqueante en el <head> (la política de seguridad no admite scripts
// en línea). Debe mantenerse equivalente a `resolveTheme` de settings.js.
(function () {
  var pref = 'light';                // claro por defecto (AC12.1)
  try {
    var stored = localStorage.getItem('lc.theme');
    if (stored === 'light' || stored === 'system' || stored === 'dark') pref = stored;
  } catch (e) { /* localStorage bloqueado: se queda el tema por defecto */ }

  var theme = pref;
  if (pref === 'system') {
    theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  var root = document.documentElement;
  root.setAttribute('data-theme', theme);

  try {
    var lang = localStorage.getItem('lc.lang');
    if (lang === 'es' || lang === 'en') root.setAttribute('lang', lang);
  } catch (e) { /* idem */ }

  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#14100d' : '#fff7ed');
})();
