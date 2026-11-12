// ---------- Lingue: italiano (originale), inglese, spagnolo ----------
// Il testo nel codice è in italiano: TR('testo') lo traduce nella lingua scelta usando i
// dizionari di i18n-en.js e i18n-es.js (chiave = la frase italiana). I pezzi che cambiano
// si scrivono come {nome}: TR('Lavoratori: {n}', { n: 3 }).
// I nomi nei dati (edifici, merci, colture, strumenti...) vengono tradotti una volta sola da
// applyLanguage() (si ricorda l'italiano per poter tornare indietro).
const LANGS = { it: 'Italiano', en: 'English', es: 'Español' };
const DICT = { it: {} };          // i18n-en.js e i18n-es.js aggiungono DICT.en e DICT.es
const TOOL_TEXT = {};             // testi degli strumenti per lingua: TOOL_TEXT.en.house = { label, desc }
const LANG_KEY = 'citybuilder.lang';
let LANG = 'it';
const missingText = new Set();    // frasi senza traduzione (le controlla il test)

function TR(s, p) {
  let out = s;
  if (LANG !== 'it') {
    const d = DICT[LANG] && DICT[LANG][s];
    if (d != null) out = d; else if (s && /[a-zà-ú]/i.test(s)) missingText.add(s);
  }
  if (p) out = out.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? p[k] : m));
  return out;
}
function LOCALE() { return { it: 'it-IT', en: 'en-US', es: 'es-ES' }[LANG]; }
function money(n) { return Math.floor(n).toLocaleString(LOCALE()) + ' €'; }

// Nomi nei dati: si salva l'italiano la prima volta, poi si traduce
function trField(obj, field, value) {
  const key = '_it_' + field;
  if (obj[key] === undefined) obj[key] = obj[field];
  obj[field] = value !== undefined ? value : TR(obj[key]);
}
function applyLanguage() {
  for (const o of Object.values(BUILDINGS)) trField(o, 'name');
  for (const o of Object.values(PATHS)) trField(o, 'name');
  for (const o of Object.values(GOODS)) trField(o, 'name');
  for (const o of Object.values(CROPS)) trField(o, 'name');
  for (const o of Object.values(LIVESTOCK)) trField(o, 'animal');
  for (const o of MAP_SIZES) { trField(o, 'name'); trField(o, 'desc'); }
  for (const g of TOOL_GROUPS) trField(g, 'label');
  for (const u of UNLOCKS) { trField(u, 'sector'); if (u.name) trField(u, 'name'); if (u.desc) trField(u, 'desc'); }
  for (const ch of MANUAL) trField(ch, 'title');
  if (!applyLanguage.terrainIt) applyLanguage.terrainIt = TERRAIN_NAMES.slice();
  applyLanguage.terrainIt.forEach((n, i) => { TERRAIN_NAMES[i] = TR(n); });
  // strumenti: etichetta e descrizione per lingua (le descrizioni contengono numeri del gioco)
  const tt = TOOL_TEXT[LANG] || {};
  for (const [id, info] of Object.entries(TOOL_INFO)) {
    const tr = LANG === 'it' ? null : tt[id];
    trField(info, 'label', tr ? tr.label : info._it_label !== undefined ? info._it_label : info.label);
    trField(info, 'desc', tr && tr.desc ? tr.desc : info._it_desc !== undefined ? info._it_desc : info.desc);
    if (LANG !== 'it' && !tr) missingText.add('TOOL_INFO.' + id);
  }
  translateDom();
  document.documentElement.lang = LANG;
}

// Testi fissi della pagina: data-i18n = testo, data-i18n-html = testo con <br>, data-i18n-title = suggerimento
function translateDom() {
  for (const el of document.querySelectorAll('[data-i18n]')) {
    if (el.dataset.it === undefined) el.dataset.it = el.textContent;
    el.textContent = TR(el.dataset.it);
  }
  for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = TR(el.dataset.i18nPh);   // testo d'esempio dei campi
  for (const el of document.querySelectorAll('[data-i18n-html]')) {
    if (el.dataset.it === undefined) el.dataset.it = el.innerHTML;
    el.innerHTML = TR(el.dataset.it);
  }
}

function initLanguage() {
  let l = null;
  try { l = localStorage.getItem(LANG_KEY); } catch (e) { /* niente memoria: lingua predefinita */ }
  LANG = LANGS[l] ? l : 'es';   // senza una scelta salvata si parte in spagnolo (richiesta dell'utente), su PC e telefono
  applyLanguage();
}

// Cambio di lingua anche a partita aperta: si rifanno barra, pannello e finestre
function setLanguage(l) {
  if (!LANGS[l]) return;
  LANG = l;
  try { localStorage.setItem(LANG_KEY, l); } catch (e) { /* la scelta vale solo per questa volta */ }
  applyLanguage();
  const tool = game.tool;
  document.getElementById('toolbar').textContent = '';
  closeSubmenu();
  buildToolbar();
  if (tool && !toolLocked(tool)) setTool(tool);
  refreshLocks();
  updateHud();
  refreshSpeed();
  refreshKeyLabels();
  if (panelIsOpen()) renderPanel();
  if (manualIsOpen()) renderManual();
  if (progressIsOpen()) renderProgress();
  if (statsIsOpen()) renderStats();
  if (menuIsOpen()) showMenuPage(document.querySelector('.menu-page:not([hidden])').dataset.page);
  requestDraw();
}
