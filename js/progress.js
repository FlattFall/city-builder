// ---------- Progressi: cosa è sbloccato ----------
// In una mappa nuova si parte con poco (strade, case, fattoria, magazzino alimenti, supermercato):
// il resto si sblocca pagando, nella finestra Progressi (tasto P). Alcune cose ne vogliono
// prima un'altra (needs). I salvataggi di prima (senza "unlocked") hanno tutto sbloccato.
const START_TOOLS = ['hand', 'road', 'dirt', 'house', 'farm', 'warehouse', 'supermarket', 'field', 'demolish', 'raise', 'lower', 'level',
  'pylon', 'pole', 'substation', 'waterWell', 'sewage', 'pipe'];   // anche l'acqua: pozzo e scarico da subito   // corrente: tralicci, pali e sottostazione sbloccati da subito (richiesta dell'utente)
const START_CROPS = ['wheat', 'carrot', 'potato'];

const UNLOCKS = [
  // strade
  { id: 'oneway', sector: 'Strade', tools: ['oneway'], cost: 1500 },
  { id: 'bridge', sector: 'Strade', tools: ['bridge'], cost: 4000 },
  { id: 'highway', sector: 'Strade', tools: ['highway'], cost: 6000 },
  { id: 'hwBridge', sector: 'Strade', tools: ['hwBridge'], cost: 6000, needs: ['bridge', 'highway'] },
  { id: 'tunnel', sector: 'Strade', tools: ['tunnel'], cost: 7000, needs: ['bridge'] },
  { id: 'rail', sector: 'Strade', tools: ['rail'], cost: 5000 },
  { id: 'bus', sector: 'Strade', tools: ['busStop', 'busDepot'], cost: 3000, desc: 'Fermate e deposito dei bus: la gente va a lavorare anche lontano da casa.' },
  { id: 'waterPlant', sector: 'Energia', tools: ['waterPlant'], cost: 15000, desc: "Depuratore dell'acqua di mare: tanta acqua per le città grandi." },
  // agroalimentare
  { id: 'crops', sector: 'Agroalimentare', name: 'Nuove colture', crops: ['corn', 'tomato', 'cabbage'], cost: 2000,
    desc: 'Mais, pomodori e cavoli per le fattorie.' },
  { id: 'factory', sector: 'Agroalimentare', tools: ['factory'], cost: 4000 },
  { id: 'bakery', sector: 'Agroalimentare', tools: ['bakery'], cost: 3000, needs: ['factory'] },
  { id: 'livestock', sector: 'Agroalimentare', tools: ['livestock'], cost: 4000 },
  { id: 'dairy', sector: 'Agroalimentare', tools: ['dairy'], cost: 5000, needs: ['livestock'] },
  { id: 'slaughterhouse', sector: 'Agroalimentare', tools: ['slaughterhouse'], cost: 5500, needs: ['livestock'] },
  // legno
  { id: 'forestry', sector: 'Legno', tools: ['forestry', 'goodsWarehouse'], cost: 6000,
    desc: 'Azienda forestale e magazzino merci.' },
  { id: 'sawmill', sector: 'Legno', tools: ['sawmill'], cost: 7000, needs: ['forestry'] },
  { id: 'furnitureStore', sector: 'Legno', tools: ['furnitureStore'], cost: 7000, needs: ['sawmill'] },
  { id: 'furnitureFactory', sector: 'Legno', tools: ['furnitureFactory'], cost: 10000, needs: ['sawmill'] },
  // tessile
  { id: 'textileMill', sector: 'Tessile', tools: ['textileMill', 'goodsWarehouse'], crops: ['cotton'], cost: 9000,
    desc: 'Fabbrica tessile, magazzino merci e la coltura del cotone.' },
  { id: 'clothingFactory', sector: 'Tessile', tools: ['clothingFactory'], cost: 11000, needs: ['textileMill'] },
  { id: 'clothingStore', sector: 'Tessile', tools: ['clothingStore'], cost: 8000, needs: ['clothingFactory'] },
  // energia e petrolio
  { id: 'charcoalKiln', sector: 'Energia', tools: ['charcoalKiln'], cost: 3000, needs: ['forestry'] },
  { id: 'coalPlant', sector: 'Energia', tools: ['coalPlant'], cost: 8000, needs: ['charcoalKiln'] },
  { id: 'solarPlant', sector: 'Energia', tools: ['solarPlant'], cost: 10000 },
  { id: 'windPlant', sector: 'Energia', tools: ['windPlant'], cost: 9000 },
  { id: 'oilWell', sector: 'Petrolio', tools: ['oilWell', 'goodsWarehouse'], cost: 6000, desc: 'Pozzo petrolifero (e magazzino merci).' },
  { id: 'refinery', sector: 'Petrolio', tools: ['refinery'], cost: 12000, needs: ['oilWell'] },
  { id: 'gasStation', sector: 'Petrolio', tools: ['gasStation'], cost: 5000, needs: ['refinery'] },
  { id: 'port', sector: 'Petrolio', tools: ['port'], cost: 8000 },
  { id: 'oilPlatform', sector: 'Petrolio', tools: ['oilPlatform'], cost: 9000, needs: ['port', 'oilWell'] },
];
const UNLOCK_BY_ID = Object.fromEntries(UNLOCKS.map(u => [u.id, u]));

function unlockName(u) { return u.name || TOOL_INFO[u.tools[0]].label.replace(/ \(.*\)$/, ''); }
function isUnlocked(id) { return !game.unlocked || game.unlocked.has(id); }
function unlockAll() { game.unlocked = new Set(UNLOCKS.map(u => u.id)); refreshLocks(); }
// Codice segreto "makemoney" (scritto sulla tastiera durante la partita): sblocca tutto e dà 10 milioni,
// per provare il gioco senza accumulare soldi. Prima era il tasto I, ma i giocatori lo premevano per sbaglio
// (richiesta dell'utente). Il codice non è scritto da nessuna parte nel gioco.
const CHEAT_CODE = 'makemoney';
let cheatBuf = '';
function cheatTyped(k) {
  if (k.length !== 1) return false;
  cheatBuf = (cheatBuf + k.toLowerCase()).slice(-CHEAT_CODE.length);
  if (cheatBuf !== CHEAT_CODE) return false;
  cheatBuf = '';
  cheatUnlockAll();
  return true;
}
function cheatUnlockAll() {
  if (!game.started) return;
  unlockAll();
  game.money += 10000000;   // e 10 milioni di fondi per provare tutto (richiesta dell'utente)
  game.dirty = true;
  updateHud();
  if (progressIsOpen()) renderProgress();
  toast(TR('Tutto sbloccato e 10 milioni di fondi'));
}
function resetUnlocks() { game.unlocked = new Set(); }

// Uno strumento è bloccato se non è tra quelli iniziali e nessuno sblocco che lo contiene è stato preso
function toolLocked(tool) {
  if (!game.unlocked || START_TOOLS.includes(tool)) return false;
  const us = UNLOCKS.filter(u => u.tools && u.tools.includes(tool));
  return us.length > 0 && !us.some(u => game.unlocked.has(u.id));
}
function cropLocked(crop) {
  if (!game.unlocked || START_CROPS.includes(crop)) return false;
  const us = UNLOCKS.filter(u => u.crops && u.crops.includes(crop));
  return us.length > 0 && !us.some(u => game.unlocked.has(u.id));
}
// Lo sblocco più economico che dà questo strumento (per dire al giocatore cosa gli serve)
function unlockFor(tool) {
  return UNLOCKS.filter(u => u.tools && u.tools.includes(tool)).sort((a, b) => a.cost - b.cost)[0];
}
function missingNeeds(u) { return (u.needs || []).filter(n => !isUnlocked(n)); }

function buyUnlock(id) {
  const u = UNLOCK_BY_ID[id];
  if (!u || isUnlocked(id)) return { ok: false, msg: TR('Già sbloccato') };
  const miss = missingNeeds(u);
  if (miss.length) return { ok: false, msg: TR('Prima sblocca: {list}', { list: miss.map(n => unlockName(UNLOCK_BY_ID[n])).join(', ') }) };
  if (game.money < u.cost) return { ok: false, msg: TR('Fondi insufficienti (servono {m})', { m: money(u.cost) }) };
  game.money -= u.cost;
  game.unlocked.add(id);
  game.dirty = true;
  updateHud();
  refreshLocks();
  return { ok: true, msg: TR('Sbloccato: {x}', { x: unlockName(u) }) };
}

// Barra strumenti: lucchetto sugli strumenti bloccati
function refreshLocks() {
  for (const g of TOOL_GROUPS) {
    const b = document.getElementById('group-' + g.id);
    if (!b) continue;
    b.classList.toggle('locked', g.tools.every(toolLocked));
  }
  const sm = document.getElementById('submenu');
  if (sm && !sm.hidden) for (const b of sm.querySelectorAll('.sub')) markLockedSub(b, b.dataset.tool);
  if (toolLocked(game.tool)) setTool('hand');
  if (progressIsOpen()) renderProgress();
}
function markLockedSub(b, id) {
  const locked = toolLocked(id);
  b.classList.toggle('locked', locked);
  const small = b.querySelector('small');
  if (small) small.textContent = locked ? '🔒 ' + money(unlockFor(id).cost) + ' (P)' : (TOOL_INFO[id].cost ? money(TOOL_INFO[id].cost) : '');
}

// ---------- Finestra Progressi (P) ----------
let progressOpen = false;
let progressFocus = null;   // sblocco da evidenziare (es. cliccato uno strumento bloccato)
function progressIsOpen() { return progressOpen; }

function openProgress(focus) {
  if (!game.started) return;
  if (typeof closeManual === 'function') closeManual();
  if (typeof closeStats === 'function') closeStats();
  progressOpen = true;
  progressFocus = focus || null;
  document.getElementById('progress').hidden = false;
  game.hover = null;
  renderProgress();
  const f = progressFocus && document.querySelector('#progress [data-unlock="' + progressFocus + '"]');
  if (f) f.scrollIntoView({ block: 'center' });
}
function closeProgress() { progressOpen = false; document.getElementById('progress').hidden = true; }
function toggleProgress() { if (progressOpen) closeProgress(); else openProgress(); }

function renderProgress() {
  const box = document.getElementById('progress-body');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  box.textContent = '';
  const done = UNLOCKS.filter(u => isUnlocked(u.id)).length;
  document.getElementById('progress-sub').textContent = TR('Sbloccati {a} di {b} - Fondi: {m}', { a: done, b: UNLOCKS.length, m: money(game.money) });
  const start = el('div', 'pg-start');
  start.append(el('b', null, TR('Già disponibili:') + ' '), document.createTextNode(START_TOOLS.filter(t => TOOL_INFO[t] && t !== 'field')
    .map(t => TOOL_INFO[t].label.replace(/ \(.*\)$/, '')).join(', ') + '; ' + TR('colture:') + ' ' + START_CROPS.map(c => CROPS[c].name).join(', ') + '.'));
  box.appendChild(start);
  for (const sector of [...new Set(UNLOCKS.map(u => u.sector))]) {
    box.appendChild(el('h3', 'pg-sector', sector));
    const grid = el('div', 'pg-grid');
    for (const u of UNLOCKS.filter(x => x.sector === sector)) {
      const owned = isUnlocked(u.id), miss = missingNeeds(u);
      const card = el('div', 'pg-card' + (owned ? ' owned' : miss.length ? ' wait' : '') + (progressFocus === u.id ? ' focus' : ''));
      card.dataset.unlock = u.id;
      const imgs = el('div', 'pg-imgs');
      for (const t of u.tools || []) { const i = el('img'); i.src = ICONS[t]; i.alt = ''; imgs.appendChild(i); }
      if (!u.tools) for (const c of u.crops) { const i = el('img', 'good'); i.src = GOOD_ICONS[c]; i.alt = ''; imgs.appendChild(i); }
      card.appendChild(imgs);
      card.appendChild(el('b', null, unlockName(u)));
      card.appendChild(el('div', 'pg-desc', u.desc || (TOOL_INFO[u.tools[0]].desc || '').split('. ')[0].replace(/\.$/, '') + '.'));
      if (miss.length) card.appendChild(el('div', 'pg-need', TR('Serve prima: {list}', { list: miss.map(n => unlockName(UNLOCK_BY_ID[n])).join(', ') })));
      if (owned) card.appendChild(el('div', 'pg-owned', '✓ ' + TR('Sbloccato')));
      else {
        const btn = el('button', 'pg-buy', TR('Sblocca - {m}', { m: money(u.cost) }));
        btn.id = 'unlock-' + u.id;
        btn.disabled = miss.length > 0 || game.money < u.cost;
        btn.addEventListener('click', () => { const r = buyUnlock(u.id); toast(r.msg); renderProgress(); });
        card.appendChild(btn);
      }
      grid.appendChild(card);
    }
    box.appendChild(grid);
  }
}

function initProgress() {
  document.getElementById('progress-close').addEventListener('click', closeProgress);
  document.getElementById('progress-btn').addEventListener('click', e => { e.target.blur(); toggleProgress(); });
  document.getElementById('progress').addEventListener('mousedown', e => { if (e.target.id === 'progress') closeProgress(); });
}

// Fondi cambiati mentre la finestra è aperta: aggiorna i pulsanti senza ricostruirla (i clic non si perdono)
function progressLive() {
  if (!progressOpen) return;
  const done = UNLOCKS.filter(u => isUnlocked(u.id)).length;
  document.getElementById('progress-sub').textContent = TR('Sbloccati {a} di {b} - Fondi: {m}', { a: done, b: UNLOCKS.length, m: money(game.money) });
  for (const u of UNLOCKS) {
    const b = document.getElementById('unlock-' + u.id);
    if (b) b.disabled = missingNeeds(u).length > 0 || game.money < u.cost;
  }
}
