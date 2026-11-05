// ---------- Salvataggi ----------
// Le partite sono salvate nello spazio dati dell'app (localStorage): nella versione
// programma restano sul PC, nella versione web restano in quel browser.
// Formato 3: il terreno si ricrea dal seed e si salvano solo le differenze (terreno
// modificato, percorsi, campi, edifici), così anche le mappe 1024x1024 occupano poco.
const SAVE_KEY = 'citybuilder.saves.v1';

function readSaves() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || []; } catch (e) { return []; }
}

function writeSaves(list) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
}

// (formato 2) "aaaab" -> [["a",4],["b",1]]
function unrle(runs) { return runs.map(([ch, n]) => ch.repeat(n)).join(''); }

const PATH_CODES = { road: 1, dirt: 2, rail: 3, oneway: 4, highway: 5 };
const PATH_FROM_CODE = { 1: 'road', 2: 'dirt', 3: 'rail', 4: 'oneway', 5: 'highway' };

// dati da salvare di un edificio (senza quelli che valgono solo mentre si gioca)
function buildingData(b) {
  const out = {};
  for (const [k, v] of Object.entries(b)) if (k[0] !== '_' && !['incoming', 'van', 'status', 'retry', 'unreachable', 'workers', 'employed', 'expect', 'full', 'noInput', 'empty', 'pullTimer', 'customers'].includes(k)) out[k] = v;
  return out;
}

function serializeGame() {
  const N = game.size, base = game.base;
  const diffs = [], paths = [], fields = [], pipes = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const t = game.map[y][x], i = y * N + x;
      if (t.type !== base.type[i] || t.elev !== base.elev[i]) diffs.push([x, y, t.type, t.elev]);
      if (t.path) paths.push(t.path === 'oneway' ? [x, y, PATH_CODES[t.path], t.main ? 1 : 0, t.dir ?? 1] : [x, y, PATH_CODES[t.path], t.main ? 1 : 0]);
      if (t.field) fields.push([x, y, t.farm || 0]);
      if (t.pipe) pipes.push(i);
    }
  return {
    v: 3, seed: game.seed, size: N, money: game.money, nextId: game.nextId,
    entries: game.entries, diffs, paths, fields, pipes,
    buildings: [...game.buildings.values()].map(buildingData),
    unlocked: game.unlocked ? [...game.unlocked] : undefined,   // assente = tutto sbloccato
    bridges: [...game.bridges.values()].map(b => ({ id: b.id, kind: b.kind || 'bridge', x0: b.x0, y0: b.y0, d: b.d, n: b.n, e: b.e, main: b.main || undefined, path: b.path || undefined })),
  };
}

// Salva la partita: se viene da un salvataggio lo sovrascrive, altrimenti ne crea uno nuovo
// name = nome scelto dal giocatore (richiesta dell'utente); asNew = salva come nuova partita
function currentSaveName() {
  const e = game.saveId && readSaves().find(s => s.id === game.saveId);
  return e ? e.name : TR('Città {n}', { n: game.seed });
}
function saveGame(name, asNew) {
  const list = readSaves();
  const now = new Date();
  let entry = !asNew && game.saveId && list.find(s => s.id === game.saveId);
  if (!entry) {
    entry = { id: 's' + now.getTime(), name: TR('Città {n}', { n: game.seed }) };
    list.unshift(entry);
  }
  if (name && name.trim()) entry.name = name.trim().slice(0, 40);
  entry.date = now.toISOString();
  entry.roads = game.roads;
  entry.houses = game.houses;
  entry.population = game.population;
  entry.size = game.size;
  entry.data = serializeGame();
  if (!writeSaves(list)) return false;
  game.saveId = entry.id;
  game.dirty = false;
  return true;
}

function loadGame(id) {
  const entry = readSaves().find(s => s.id === id);
  if (!entry) return false;
  const d = entry.data;
  clearVehicles();
  game.size = d.size;
  game.seed = d.seed;
  game.money = d.money;
  game.fieldMode = null;
  game.selected = null;
  resetBridges();

  if (d.v >= 3) {
    game.map = generateTerrain(d.seed, d.size);
    rememberBaseTerrain();
    for (const [x, y, type, elev] of d.diffs) { game.map[y][x].type = type; game.map[y][x].elev = elev; }
    for (const [x, y, code, main, dir] of d.paths) {
      const t = game.map[y][x];
      t.path = PATH_FROM_CODE[code]; t.main = !!main;
      if (t.path === 'oneway') t.dir = dir ?? 1;
    }
    for (const b of d.bridges || []) {
      game.bridges.set(b.id, b);
      for (let i = 1; i < b.n; i++) { const [x, y] = bridgeTile(b, i); if (inMap(x, y)) game.map[y][x].bridge = { id: b.id, i }; }
      if (b.id >= game.nextBridgeId) game.nextBridgeId = b.id + 1;
    }
    rebuildBridgeIndex();
    for (const [x, y, farm] of d.fields) { game.map[y][x].field = true; game.map[y][x].farm = farm || null; }
    for (const i of d.pipes || []) { const x = i % d.size, y = (i - x) / d.size; if (inMap(x, y)) game.map[y][x].pipe = true; }
    for (const bd of d.buildings) {
      if (LIVESTOCK[bd.kind]) { bd.animal = bd.kind; bd.kind = 'livestock'; }   // allevamenti separati di prima
      if (!BUILDINGS[bd.kind]) continue;
      if (bd.kind === 'sewage' && game.map[bd.ay] && game.map[bd.ay][bd.ax] && game.map[bd.ay][bd.ax].type === T.WATER) continue;   // vecchio scarico 1x1 sull'acqua: non c'è più
      const b = initEconomy(Object.assign({}, bd, bd.kind === 'house' ? { incoming: 0 } : {}));
      for (const p of footprint(b.kind, b.ax, b.ay)) if (inMap(p.x, p.y)) game.map[p.y][p.x].building = b;
    }
    game.entries = d.entries || [];
    game.grid = null; game.stats = null;
    game.unlocked = Array.isArray(d.unlocked) ? new Set(d.unlocked) : null;   // salvataggi di prima: tutto sbloccato
    game.nextId = d.nextId || 1;
  } else {
    // formati 1 e 2 (prime prove): mappa intera in testo, niente strada principale
    const types = d.v >= 2 ? unrle(d.types) : d.types;
    const elev = d.v >= 2 ? unrle(d.elev) : d.elev;
    const paths = d.v >= 2 ? unrle(d.paths) : d.roads;
    const fields = d.v >= 2 ? unrle(d.fields) : '';
    game.map = generateTerrain(d.seed, d.size);
    rememberBaseTerrain();
    let i = 0;
    for (let y = 0; y < d.size; y++)
      for (let x = 0; x < d.size; x++, i++) {
        const t = game.map[y][x];
        t.type = +types[i]; t.elev = parseInt(elev[i], 36);
        t.path = PATH_FROM_CODE[paths[i]] || null; t.field = fields[i] === '1';
      }
    game.nextId = 1;
    for (const [x, y, kind, variant] of d.buildings) {
      if (!BUILDINGS[kind]) continue;
      const b = newBuilding(kind, x, y);
      b.variant = variant;
      for (const p of footprint(kind, x, y)) if (inMap(p.x, p.y)) game.map[p.y][p.x].building = b;
    }
    game.entries = [];
  }
  recount();
  game.hover = null;
  game.saveId = id;
  game.dirty = false;
  game.started = true;
  return true;
}

function renameSave(id, name) {
  const list = readSaves(), e = list.find(s => s.id === id);
  if (!e || !name || !name.trim()) return false;
  e.name = name.trim().slice(0, 40);
  return writeSaves(list);
}

function deleteSave(id) {
  writeSaves(readSaves().filter(s => s.id !== id));
  if (game.saveId === id) game.saveId = null;
}
