// ---------- Impostazioni: tasti e volume (menu Opzioni) ----------
// Tasti: ogni azione ha un tasto che si può cambiare (clic sul tasto, poi premi quello nuovo).
// Frecce, 1-8 ed Esc restano fissi. Il volume si salva già, anche se i suoni non ci sono ancora.
const KEY_ACTIONS = [
  { id: 'up', label: 'Muovi la mappa su', def: 'w' },
  { id: 'left', label: 'Muovi la mappa a sinistra', def: 'a' },
  { id: 'down', label: 'Muovi la mappa giù', def: 's' },
  { id: 'right', label: 'Muovi la mappa a destra', def: 'd' },
  { id: 'rotate', label: 'Ruota edificio', def: 'r' },
  { id: 'pause', label: 'Pausa / riprendi', def: ' ' },
  { id: 'manual', label: 'Manuale', def: 'm' },
  { id: 'progress', label: 'Progressi', def: 'p' },
  { id: 'stats', label: 'Produzione della città', def: 'c' },
  { id: 'underground', label: 'Sottosuolo (tubi)', def: 'u' },
];
const SETTINGS_KEY = 'citybuilder.settings';
const settings = { keys: {}, volume: { music: 70, sfx: 80 } };
let keyListening = null;   // azione che aspetta il nuovo tasto

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    if (s.keys) settings.keys = s.keys;
    if (s.volume) Object.assign(settings.volume, s.volume);
  } catch (e) { /* niente memoria: valori di base */ }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* vale solo per questa volta */ }
}
function keyOf(id) { return settings.keys[id] ?? KEY_ACTIONS.find(a => a.id === id).def; }
// quale azione fa questo tasto (e.key in minuscolo)
function actionOfKey(k) { const a = KEY_ACTIONS.find(a => keyOf(a.id) === k); return a ? a.id : null; }
function keyName(k) {
  const names = { ' ': TR('Spazio'), arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', enter: TR('Invio'), tab: 'Tab', shift: 'Shift', control: 'Ctrl', alt: 'Alt', backspace: '⌫' };
  return names[k] || (k.length === 1 ? k.toUpperCase() : k);
}
// spostamento della mappa per un tasto: frecce sempre, più i tasti scelti
function panDir(k) {
  const fixed = { arrowup: [0, 1], arrowdown: [0, -1], arrowleft: [1, 0], arrowright: [-1, 0] };
  if (fixed[k]) return fixed[k];
  return { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] }[actionOfKey(k)] || null;
}

// Pulsanti e aiuto che mostrano i tasti
function refreshKeyLabels() {
  const set = (id, text) => setTopLabel(id, text);   // icona + scritta (topicons.js)
  set('manual-btn', TR('Manuale') + ' (' + keyName(keyOf('manual')) + ')');
  set('progress-btn', TR('Progressi') + ' (' + keyName(keyOf('progress')) + ')');
  set('stats-btn', TR('Produzione') + ' (' + keyName(keyOf('stats')) + ')');
  set('under-btn', TR('Sottosuolo') + ' (' + keyName(keyOf('underground')) + ')');
  const help = document.getElementById('help');
  if (help) help.innerHTML = TR('Sinistro: usa lo strumento<br>Mano: trascina la mappa, clic su edificio = info<br>Destro/centrale + trascina: muovi | Rotella: zoom<br>{up}{left}{down}{right}/frecce: muovi | 1-9: strumenti | {r}: ruota<br>{m}: manuale | {p}: progressi | Esc: menu<br>{sp}: pausa | ▶ ▶▶ ▶▶▶ in alto: velocità', {
    up: keyName(keyOf('up')), left: keyName(keyOf('left')), down: keyName(keyOf('down')), right: keyName(keyOf('right')),
    r: keyName(keyOf('rotate')), m: keyName(keyOf('manual')), p: keyName(keyOf('progress')), sp: keyName(keyOf('pause')) });
}

// ---------- Pagina Opzioni ----------
function renderSettings() {
  const vol = document.getElementById('volume-list');
  if (vol) {
    vol.textContent = '';
    for (const [k, label] of [['music', 'Musica'], ['sfx', 'Effetti sonori']]) {
      const row = document.createElement('label');
      row.className = 'set-row';
      const name = document.createElement('span'); name.textContent = TR(label);
      const r = document.createElement('input'); r.type = 'range'; r.min = 0; r.max = 100; r.value = settings.volume[k]; r.id = 'vol-' + k;
      const val = document.createElement('b'); val.textContent = settings.volume[k] + '%';
      r.addEventListener('input', () => { settings.volume[k] = +r.value; val.textContent = r.value + '%'; saveSettings(); });
      row.append(name, r, val);
      vol.appendChild(row);
    }
  }
  const list = document.getElementById('key-list');
  if (!list) return;
  list.textContent = '';
  for (const a of KEY_ACTIONS) {
    const row = document.createElement('div');
    row.className = 'set-row';
    const name = document.createElement('span'); name.textContent = TR(a.label);
    const btn = document.createElement('button');
    btn.className = 'key-btn' + (keyListening === a.id ? ' listening' : '');
    btn.dataset.action = a.id;
    btn.textContent = keyListening === a.id ? TR('Premi un tasto...') : keyName(keyOf(a.id));
    btn.addEventListener('click', () => { keyListening = keyListening === a.id ? null : a.id; renderSettings(); });
    row.append(name, btn);
    list.appendChild(row);
  }
  for (const [k, label] of [['1 - 9', 'Gruppi della barra'], ['↑ ↓ ← →', 'Muovi la mappa'], ['Esc', 'Menu e chiudi le finestre']]) {
    const row = document.createElement('div');
    row.className = 'set-row fixed';
    const name = document.createElement('span'); name.textContent = TR(label);
    const key = document.createElement('span'); key.className = 'key-fixed'; key.textContent = k;
    row.append(name, key);
    list.appendChild(row);
  }
}
function setKey(id, k) {
  const other = actionOfKey(k);
  if (other && other !== id) settings.keys[other] = keyOf(id);   // il tasto era già usato: si scambiano
  settings.keys[id] = k;
  saveSettings();
  refreshKeyLabels();
}
function resetKeys() { settings.keys = {}; keyListening = null; saveSettings(); refreshKeyLabels(); renderSettings(); }

function initSettings() {
  loadSettings();
  // mentre si aspetta il nuovo tasto: il primo tasto premuto (Esc annulla; 1-8 e frecce non si possono usare)
  addEventListener('keydown', e => {
    if (!keyListening) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const k = e.key.toLowerCase();
    if (k === 'escape') { keyListening = null; renderSettings(); return; }
    if (/^[1-9]$/.test(k) || k.startsWith('arrow')) { toast(TR('Questo tasto è già usato dal gioco')); return; }
    setKey(keyListening, k);
    keyListening = null;
    renderSettings();
  }, true);
  const reset = document.getElementById('keys-reset');
  if (reset) reset.addEventListener('click', resetKeys);
  refreshKeyLabels();
}
