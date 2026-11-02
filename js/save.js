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

// La mappa diventa testo compatto: un carattere per tile per tipo, quota e strada
function serializeGame() {
  let types = '', elev = '', roads = '';
  const buildings = [];
  for (let y = 0; y < game.size; y++)
    for (let x = 0; x < game.size; x++) {
      const t = game.map[y][x];
      types += t.type;
      elev += t.elev.toString(36);
      roads += t.road ? '1' : '0';
      if (t.building) buildings.push([x, y, t.building.kind, t.building.variant]);
    }
  return { seed: game.seed, size: game.size, money: game.money, types, elev, roads, buildings };
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
  game.size = d.size;
  game.seed = d.seed;
  game.money = d.money;
  game.map = [];
  game.roads = 0; game.houses = 0; game.maxElev = 0;
  let i = 0;
  for (let y = 0; y < d.size; y++) {
    const row = [];
    for (let x = 0; x < d.size; x++, i++) {
      const t = { type: +d.types[i], elev: parseInt(d.elev[i], 36), road: d.roads[i] === '1', building: null };
      if (t.road) game.roads++;
      if (t.elev > game.maxElev) game.maxElev = t.elev;
      row.push(t);
    }
    game.map.push(row);
  }
  for (const [x, y, kind, variant] of d.buildings) {
    game.map[y][x].building = { kind, variant };
    game.houses++;
  }
  updateRoundabouts();
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
