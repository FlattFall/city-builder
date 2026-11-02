// ---------- Salvataggi ----------
// Le partite sono salvate nello spazio dati dell'app (localStorage): nella versione
// programma restano sul PC, nella versione web restano in quel browser.
const SAVE_KEY = 'citybuilder.saves.v1';

function readSaves() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || []; } catch (e) { return []; }
}

function writeSaves(list) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
}

// Compressione semplice: "aaaab" -> [["a",4],["b",1]] (le mappe hanno lunghe file uguali)
function rle(str) {
  const out = [];
  for (let i = 0; i < str.length;) {
    let j = i;
    while (j < str.length && str[j] === str[i]) j++;
    out.push([str[i], j - i]);
    i = j;
  }
  return out;
}
function unrle(runs) { return runs.map(([ch, n]) => ch.repeat(n)).join(''); }

const PATH_CODES = { road: '1', dirt: '2', rail: '3' };
const PATH_FROM_CODE = { 1: 'road', 2: 'dirt', 3: 'rail' };

// La mappa diventa testo compatto: un carattere per tile per tipo, quota, percorso e campo
function serializeGame() {
  let types = '', elev = '', paths = '', fields = '';
  const buildings = [];
  for (let y = 0; y < game.size; y++)
    for (let x = 0; x < game.size; x++) {
      const t = game.map[y][x];
      types += t.type;
      elev += t.elev.toString(36);
      paths += t.path ? PATH_CODES[t.path] : '0';
      fields += t.field ? '1' : '0';
      const b = t.building;
      if (b && b.ax === x && b.ay === y) buildings.push([x, y, b.kind, b.variant]);
    }
  return { v: 2, seed: game.seed, size: game.size, money: game.money,
    types: rle(types), elev: rle(elev), paths: rle(paths), fields: rle(fields), buildings };
}

// Salva la partita: se viene da un salvataggio lo sovrascrive, altrimenti ne crea uno nuovo
function saveGame() {
  const list = readSaves();
  const now = new Date();
  let entry = game.saveId && list.find(s => s.id === game.saveId);
  if (!entry) {
    entry = { id: 's' + now.getTime(), name: 'Città ' + game.seed };
    list.unshift(entry);
  }
  entry.date = now.toISOString();
  entry.roads = game.roads;
  entry.houses = game.houses;
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
  // versione 1 (prime prove): testo non compresso e solo strade asfaltate
  const types = d.v >= 2 ? unrle(d.types) : d.types;
  const elev = d.v >= 2 ? unrle(d.elev) : d.elev;
  const paths = d.v >= 2 ? unrle(d.paths) : d.roads;
  const fields = d.v >= 2 ? unrle(d.fields) : '';
  game.size = d.size;
  game.seed = d.seed;
  game.money = d.money;
  game.map = [];
  let i = 0;
  for (let y = 0; y < d.size; y++) {
    const row = [];
    for (let x = 0; x < d.size; x++, i++) {
      row.push({ type: +types[i], elev: parseInt(elev[i], 36), path: PATH_FROM_CODE[paths[i]] || null,
        field: fields[i] === '1', building: null, rb: null });
    }
    game.map.push(row);
  }
  for (const [x, y, kind, variant] of d.buildings) {
    if (!BUILDINGS[kind]) continue;
    const b = { kind, variant, ax: x, ay: y };
    for (const p of footprint(kind, x, y)) if (inMap(p.x, p.y)) game.map[p.y][p.x].building = b;
  }
  recount();
  game.hover = null;
  game.saveId = id;
  game.dirty = false;
  game.started = true;
  return true;
}

function deleteSave(id) {
  writeSaves(readSaves().filter(s => s.id !== id));
  if (game.saveId === id) game.saveId = null;
}
