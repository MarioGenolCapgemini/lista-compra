// Pantalla de ajustes (spec 003, US15): tema, idioma y acceso a la cuenta.

import { escapeHtml, icon } from '../util.js';
import { ACCOUNT_HASH } from '../router.js';
import { t, LANGUAGES } from '../i18n/index.js';
import { THEMES } from '../settings.js';

// Cambiar de idioma repinta la pantalla entera (la monta de nuevo); así se devuelve el foco
// al grupo de idioma en lugar de perderlo.
let refocusLang = false;

function radioGroup(name, label, options, current) {
  return (
    `<fieldset class="setting"><legend class="setting-title">${escapeHtml(label)}</legend>` +
    '<div class="seg">' +
    options.map((o) =>
      '<label class="seg-opt">' +
      `<input type="radio" name="${name}" value="${escapeHtml(o.value)}"${o.value === current ? ' checked' : ''}>` +
      `<span>${escapeHtml(o.label)}</span></label>`).join('') +
    '</div></fieldset>'
  );
}

export function mountSettings(root, { settings, sync = null }) {
  const ac = new AbortController();
  const { signal } = ac;

  const themes = THEMES.map((v) => ({ value: v, label: t('theme.' + v) }));
  const langs = Object.entries(LANGUAGES).map(([code, l]) => ({ value: code, label: l.name })); // nombres nativos

  root.innerHTML =
    '<header class="topbar">' +
    `<a class="icon-btn" href="#/" aria-label="${escapeHtml(t('common.back'))}">${icon('back')}</a>` +
    `<h1>${escapeHtml(t('settings.title'))}</h1></header>` +
    '<main class="content settings">' +
    radioGroup('theme', t('settings.theme'), themes, settings.getTheme()) +
    radioGroup('lang', t('settings.language'), langs, settings.getLang()) +
    (sync
      ? `<a class="row-link" href="${ACCOUNT_HASH}"><strong>${escapeHtml(t('settings.account'))}</strong>` +
        `<span>${escapeHtml(t('settings.accountHint'))}</span></a>`
      : '') +
    '</main>';

  document.title = t('settings.docTitle');

  root.addEventListener('change', (e) => {
    const input = e.target;
    if (!input.matches('input[type="radio"]')) return;
    if (input.name === 'theme') settings.setTheme(input.value);        // AC12.2: al instante
    else if (input.name === 'lang') { refocusLang = true; settings.setLang(input.value); } // AC14.1
  }, { signal });

  if (refocusLang) {
    refocusLang = false;
    const checked = root.querySelector('input[name="lang"]:checked');
    if (checked) checked.focus();
  }

  return () => ac.abort();
}
