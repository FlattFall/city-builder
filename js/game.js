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

// ---------- Direzioni, angoli e rampe ----------
// Direzioni dei vicini: 0 = NE (y-1), 1 = SE (x+1), 2 = SW (y+1), 3 = NW (x-1)
const DIRS = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
// Angoli del rombo in coordinate (u, v) dentro al tile: 0 = N (in alto), 1 = E, 2 = S, 3 = W
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];
function cornerIndex(u, v) { return u === 0 ? (v === 0 ? 0 : 3) : (v === 0 ? 1 : 2); }

// Una strada diventa rampa verso la direzione d se:
//  - il vicino in direzione d è una strada più alta di 1 livello (e c'è solo un vicino così)
//  - ai lati non ci sono strade allo stesso livello (la rampa deve salire dritta)
// Restituisce la direzione (0-3) oppure -1 se il tile è piatto.
function rampDir(x, y) {
  if (!roadAt(x, y)) return -1;
  const e = game.map[y][x].elev;
  let dir = -1;
  for (let i = 0; i < 4; i++) {
    const nx = x + DIRS[i].dx, ny = y + DIRS[i].dy;
    if (roadAt(nx, ny) && game.map[ny][nx].elev === e + 1) {
      if (dir !== -1) return -1;
      dir = i;
    }
  }
  if (dir === -1) return -1;
  for (const side of [(dir + 1) % 4, (dir + 3) % 4]) {
    const nx = x + DIRS[side].dx, ny = y + DIRS[side].dy;
    if (roadAt(nx, ny) && game.map[ny][nx].elev === e) return -1;
  }
  return dir;
}

// Altezza (in livelli) dei 4 angoli del tile: uguali se piatto, due alzati di 1 se è una rampa
function cornerHeights(x, y) {
  if (!inMap(x, y)) return [0, 0, 0, 0];
  const e = game.map[y][x].elev;
  const h = [e, e, e, e];
  const d = rampDir(x, y);
  if (d >= 0) {
    const { dx, dy } = DIRS[d];
    for (let i = 0; i < 4; i++) {
      const [u, v] = CORNERS[i];
      if ((dx === 1 && u === 1) || (dx === -1 && u === 0) || (dy === 1 && v === 1) || (dy === -1 && v === 0)) h[i] = e + 1;
    }
  }
  return h;
}

// Altezza dell'angolo (u, v) del tile (x, y) vista dal vicino in direzione d
function neighborCornerHeight(x, y, d, k) {
  const { dx, dy } = DIRS[d];
  const [u, v] = CORNERS[k];
  return cornerHeights(x + dx, y + dy)[cornerIndex(u - dx, v - dy)];
}

// Due strade vicine sono collegate se il bordo in comune ha la stessa altezza
// (stesso livello, oppure rampa che arriva esattamente al livello del vicino)
function roadLinked(x, y, d) {
  const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
  if (!roadAt(x, y) || !roadAt(nx, ny)) return false;
  const h = cornerHeights(x, y);
  const edge = [[0, 1], [1, 2], [2, 3], [3, 0]][d]; // angoli sul lato verso d
  for (const k of edge) if (h[k] !== neighborCornerHeight(x, y, d, k)) return false;
  return true;
}

// Punto più alto del tile, compresi gli edifici (serve per capire cosa c'è sotto il mouse)
function topHeightPx(x, y) {
  const t = game.map[y][x];
  return Math.max(...cornerHeights(x, y)) * STEP + (t.building ? 16 : 0);
}

function houseVariant(x, y) { return Math.floor(hash(x, y, 3) * 3); }

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
  t.building = { kind: 'house', variant: houseVariant(x, y) };
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
