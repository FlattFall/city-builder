// ---------- Stato e regole del gioco ----------
const game = {
  map: null,
  seed: 0,
  size: MAP_SIZE,
  maxElev: 0,
  money: START_MONEY,
  tool: 'hand',
  roads: 0,
  houses: 0,
  hover: null,   // tile sotto il mouse { x, y }
};

function inMap(x, y) { return x >= 0 && y >= 0 && x < game.size && y < game.size; }
function elevAt(x, y) { return inMap(x, y) ? game.map[y][x].elev : 0; }
function roadAt(x, y) { return inMap(x, y) && game.map[y][x].road; }

// Dove si può costruire (niente acqua, roccia o neve)
function isBuildable(t) { return t.type === T.SAND || t.type === T.GRASS || t.type === T.FOREST; }

function spend(cost) {
  if (game.money < cost) return false;
  game.money -= cost;
  return true;
}

function newGame(seed) {
  game.seed = seed;
  game.map = generateTerrain(seed, game.size);
  game.money = START_MONEY;
  game.roads = 0;
  game.houses = 0;
  game.hover = null;
  game.maxElev = 0;
  for (const row of game.map) for (const t of row) if (t.elev > game.maxElev) game.maxElev = t.elev;
}

// Il tile permette l'azione dello strumento? (usato anche per l'anteprima verde/rossa)
function canUseTool(tool, x, y) {
  if (!inMap(x, y)) return false;
  const t = game.map[y][x];
  switch (tool) {
    case 'road':     return !t.road && !t.building && isBuildable(t);
    case 'house':    return !t.road && !t.building && isBuildable(t);
    case 'demolish': return !!t.building || t.road || t.type === T.FOREST;
    default:         return true;
  }
}

// Ogni azione restituisce { ok, msg?, silent? }
function buildRoad(x, y) {
  if (!inMap(x, y)) return { ok: false, silent: true };
  const t = game.map[y][x];
  if (t.road) return { ok: false, silent: true };
  if (t.building) return { ok: false, msg: "C'è già un edificio" };
  if (!isBuildable(t)) return { ok: false, msg: 'Qui non si può costruire una strada' };
  if (!spend(COSTS.road)) return { ok: false, msg: 'Fondi insufficienti' };
  t.road = true;
  if (t.type === T.FOREST) t.type = T.GRASS; // gli alberi vengono rimossi
  game.roads++;
  return { ok: true };
}

function buildHouse(x, y) {
  if (!inMap(x, y)) return { ok: false, silent: true };
  const t = game.map[y][x];
  if (t.building) return { ok: false, silent: true };
  if (t.road) return { ok: false, msg: "C'è una strada: demolisci prima" };
  if (!isBuildable(t)) return { ok: false, msg: 'Qui non si può costruire' };
  if (!spend(COSTS.house)) return { ok: false, msg: 'Fondi insufficienti' };
  t.building = { kind: 'house', variant: Math.floor(hash(x, y, 3) * 3) };
  if (t.type === T.FOREST) t.type = T.GRASS;
  game.houses++;
  return { ok: true };
}

// Priorità: edificio > strada > alberi
function demolish(x, y) {
  if (!inMap(x, y)) return { ok: false, silent: true };
  const t = game.map[y][x];
  if (t.building) {
    if (!spend(COSTS.demolishHouse)) return { ok: false, msg: 'Fondi insufficienti' };
    t.building = null; game.houses--;
    return { ok: true };
  }
  if (t.road) {
    if (!spend(COSTS.demolishRoad)) return { ok: false, msg: 'Fondi insufficienti' };
    t.road = false; game.roads--;
    return { ok: true };
  }
  if (t.type === T.FOREST) {
    if (!spend(COSTS.clearForest)) return { ok: false, msg: 'Fondi insufficienti' };
    t.type = T.GRASS;
    return { ok: true };
  }
  return { ok: false, silent: true };
}

function useTool(tool, x, y) {
  switch (tool) {
    case 'road':     return buildRoad(x, y);
    case 'house':    return buildHouse(x, y);
    case 'demolish': return demolish(x, y);
  }
  return { ok: false, silent: true };
}
