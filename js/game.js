// ---------- Stato e regole del gioco ----------
const game = {
  map: null,
  seed: 0,
  size: MAP_SIZES[0].size,
  maxElev: 0,
  money: START_MONEY,
  tool: 'hand',
  roads: 0,        // strade (asfalto + terra)
  rails: 0,        // binari
  fields: 0,       // campi coltivabili
  houses: 0,
  industries: 0,   // fattorie, magazzini...
  roundabouts: 0,
  hover: null,     // tile sotto il mouse { x, y }
  started: false,  // false finché non si crea o carica una mappa (all'avvio c'è solo il menu)
  dirty: false,    // ci sono modifiche non salvate
  saveId: null,    // salvataggio da cui viene la partita (per sovrascriverlo)
  pathKeys: new Set(), // tile con un percorso (y * size + x): così le rotonde si calcolano in fretta
};

function inMap(x, y) { return x >= 0 && y >= 0 && x < game.size && y < game.size; }
function elevAt(x, y) { return inMap(x, y) ? game.map[y][x].elev : 0; }

// ---------- Percorsi: strade, strade di terra, binari ----------
function pathAt(x, y) { return inMap(x, y) ? game.map[y][x].path : null; }
function netOf(p) { return p ? PATHS[p].net : null; }
function roadAt(x, y) { return netOf(pathAt(x, y)) === 'road'; }
// due tile hanno un percorso della stessa rete (strada con strada, binario con binario)
function sameNet(x, y, nx, ny) {
  const a = netOf(pathAt(x, y));
  return !!a && a === netOf(pathAt(nx, ny));
}

function setPath(x, y, p) {
  const t = game.map[y][x];
  t.path = p;
  if (p) game.pathKeys.add(y * game.size + x);
  else { game.pathKeys.delete(y * game.size + x); t.rb = null; }
}

// ---------- Direzioni, angoli e rampe ----------
// Direzioni dei vicini: 0 = NE (y-1), 1 = SE (x+1), 2 = SW (y+1), 3 = NW (x-1)
const DIRS = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];
// Angoli del rombo in coordinate (u, v) dentro al tile: 0 = N (in alto), 1 = E, 2 = S, 3 = W
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0]]; // angoli sul lato verso ogni direzione
function cornerIndex(u, v) { return u === 0 ? (v === 0 ? 0 : 3) : (v === 0 ? 1 : 2); }

// Un percorso diventa rampa verso la direzione d se:
//  - il vicino in direzione d è della stessa rete e più alto di 1 livello (e c'è solo un vicino così)
//  - ai lati non ci sono percorsi della stessa rete allo stesso livello (la rampa sale dritta)
// Restituisce la direzione (0-3) oppure -1 se il tile è piatto.
function rampDir(x, y) {
  const t = game.map[y][x];
  if (!t.path) return -1;
  if (t.rb) return t.rb.low ? t.rb.slope : -1; // nelle rotonde decide la rotonda
  const e = t.elev;
  let dir = -1;
  for (let i = 0; i < 4; i++) {
    const nx = x + DIRS[i].dx, ny = y + DIRS[i].dy;
    if (sameNet(x, y, nx, ny) && game.map[ny][nx].elev === e + 1) {
      if (dir !== -1) return -1;
      dir = i;
    }
  }
  if (dir === -1) return -1;
  for (const side of [(dir + 1) % 4, (dir + 3) % 4]) {
    const nx = x + DIRS[side].dx, ny = y + DIRS[side].dy;
    if (sameNet(x, y, nx, ny) && game.map[ny][nx].elev === e) return -1;
  }
  return dir;
}

// Altezza (in livelli) dei 4 angoli del tile: uguali se piatto, due alzati di 1 se è una rampa.
// Una strada piana accanto alla parte inclinata di una rotonda "si piega": gli angoli
// in comune seguono la rotonda, così si collega anche di lato senza aggiungere terreno.
function cornerHeights(x, y) {
  if (!inMap(x, y)) return [0, 0, 0, 0];
  const t = game.map[y][x], e = t.elev;
  const h = [e, e, e, e];
  const d = rampDir(x, y);
  if (d >= 0) {
    const { dx, dy } = DIRS[d];
    for (let i = 0; i < 4; i++) {
      const [u, v] = CORNERS[i];
      if ((dx === 1 && u === 1) || (dx === -1 && u === 0) || (dy === 1 && v === 1) || (dy === -1 && v === 0)) h[i] = e + 1;
    }
    return h;
  }
  if (t.path && !t.rb) {
    for (let i = 0; i < 4; i++) {
      const { dx, dy } = DIRS[i], nx = x + dx, ny = y + dy;
      if (!inMap(nx, ny) || !sameNet(x, y, nx, ny)) continue;
      const n = game.map[ny][nx];
      if (!n.rb || !n.rb.low) continue;
      const nh = cornerHeights(nx, ny); // è una rotonda: non torna qui
      for (const k of EDGES[i]) {
        const [u, v] = CORNERS[k];
        const hv = nh[cornerIndex(u - dx, v - dy)];
        if (Math.abs(hv - e) <= 1) h[k] = hv;
      }
    }
  }
  return h;
}

// Altezza dell'angolo k del tile (x, y) vista dal vicino in direzione d
function neighborCornerHeight(x, y, d, k) {
  const { dx, dy } = DIRS[d];
  const [u, v] = CORNERS[k];
  return cornerHeights(x + dx, y + dy)[cornerIndex(u - dx, v - dy)];
}

// Due percorsi vicini sono collegati se sono della stessa rete e il bordo in comune
// ha la stessa altezza (stesso livello, rampa o strada piegata)
function roadLinked(x, y, d) {
  const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
  if (!sameNet(x, y, nx, ny)) return false;
  const h = cornerHeights(x, y);
  for (const k of EDGES[d]) if (h[k] !== neighborCornerHeight(x, y, d, k)) return false;
  return true;
}

// Punto più alto del tile, compresi gli edifici (serve per capire cosa c'è sotto il mouse)
function topHeightPx(x, y) {
  const t = game.map[y][x];
  return Math.max(...cornerHeights(x, y)) * STEP + (t.building ? BUILDINGS[t.building.kind].height : 0);
}

// ---------- Rotonde ----------
// Un quadrato 2x2 di strade asfaltate diventa una rotonda. Può essere in piano oppure su un
// gradino (2 tile sopra e 2 sotto, dislivello di 1): in quel caso i 2 tile bassi sono inclinati.
// Restituisce -1 se in piano, la direzione della salita (0-3) se sul gradino, null se non va bene.
function roundaboutSlope(x, y) {
  const a = game.map[y][x].elev, b = game.map[y][x + 1].elev;       // fila dietro (y)
  const c = game.map[y + 1][x].elev, d = game.map[y + 1][x + 1].elev; // fila davanti (y+1)
  if (a === b && b === c && c === d) return -1;
  if (a === c && b === d && b === a + 1) return 1; // sale verso +x (SE)
  if (a === c && b === d && a === b + 1) return 3; // sale verso -x (NW)
  if (a === b && c === d && c === a + 1) return 2; // sale verso +y (SW)
  if (a === b && c === d && a === c + 1) return 0; // sale verso -y (NE)
  return null;
}

// Ricalcola le rotonde (da chiamare quando cambia un percorso).
// Ogni tile di una rotonda riceve t.rb = { ax, ay, slope, low }: angolo del quadrato,
// direzione della salita (-1 se in piano) e se è uno dei tile bassi (inclinati).
function updateRoundabouts() {
  const N = game.size;
  const keys = [...game.pathKeys].sort((a, b) => a - b);
  for (const k of keys) game.map[(k / N) | 0][k % N].rb = null;
  let count = 0;
  for (const k of keys) {
    const x = k % N, y = (k / N) | 0;
    if (x >= N - 1 || y >= N - 1) continue;
    const tiles = [game.map[y][x], game.map[y][x + 1], game.map[y + 1][x], game.map[y + 1][x + 1]];
    if (tiles.some(t => t.path !== 'road' || t.rb)) continue;
    const slope = roundaboutSlope(x, y);
    if (slope === null) continue;
    const low = Math.min(...tiles.map(t => t.elev));
    for (const t of tiles) t.rb = { ax: x, ay: y, slope, low: slope >= 0 && t.elev === low };
    count++;
  }
  game.roundabouts = count;
}

function sameRoundabout(x, y, nx, ny) {
  if (!inMap(x, y) || !inMap(nx, ny)) return false;
  const a = game.map[y][x].rb, b = game.map[ny][nx].rb;
  return !!a && !!b && a.ax === b.ax && a.ay === b.ay;
}

// ---------- Edifici ----------
// Un edificio occupa w x h tile a partire dall'angolo (ax, ay) verso +x e +y.
// Tutti i tile occupati puntano allo stesso oggetto { kind, variant, ax, ay }.
function houseVariant(x, y) { return Math.floor(hash(x, y, 3) * 3); }

function footprint(kind, ax, ay) {
  const b = BUILDINGS[kind], out = [];
  for (let y = ay; y < ay + b.h; y++) for (let x = ax; x < ax + b.w; x++) out.push({ x, y });
  return out;
}

// Dove si può costruire (niente acqua, roccia o neve)
function isBuildable(t) { return t.type === T.SAND || t.type === T.GRASS || t.type === T.FOREST; }

function spend(cost) {
  if (game.money < cost) return false;
  game.money -= cost;
  return true;
}

function newGame(seed, size) {
  game.seed = seed;
  game.size = size || MAP_SIZES[0].size;
  game.map = generateTerrain(seed, game.size);
  game.money = START_MONEY;
  game.pathKeys = new Set();
  game.dirty = false;
  game.saveId = null;
  game.hover = null;
  recount();
}

// Ricalcola contatori, quota massima e rotonde guardando tutta la mappa
function recount() {
  game.roads = game.rails = game.fields = game.houses = game.industries = 0;
  game.maxElev = 0;
  game.pathKeys = new Set();
  for (let y = 0; y < game.size; y++)
    for (let x = 0; x < game.size; x++) {
      const t = game.map[y][x];
      if (t.elev > game.maxElev) game.maxElev = t.elev;
      if (t.path) { game.pathKeys.add(y * game.size + x); if (t.path === 'rail') game.rails++; else game.roads++; }
      if (t.field) game.fields++;
      if (t.building && t.building.ax === x && t.building.ay === y) {
        if (t.building.kind === 'house') game.houses++; else game.industries++;
      }
    }
  updateRoundabouts();
}

// ---------- Strumenti ----------
// Controlla se lo strumento si può usare: null se sì, altrimenti { msg?, silent? }
function checkTool(tool, x, y) {
  if (!inMap(x, y)) return { silent: true };
  const t = game.map[y][x];
  if (PATHS[tool]) {
    if (t.path === tool) return { silent: true };
    if (t.path) return { msg: "C'è già " + (t.path === 'rail' ? 'un binario' : 'una strada') };
    if (t.building) return { msg: "C'è già un edificio" };
    if (t.field) return { msg: "C'è un campo: demolisci prima" };
    if (!isBuildable(t)) return { msg: 'Qui non si può costruire' };
    return null;
  }
  if (tool === 'field') {
    if (t.field) return { silent: true };
    if (t.path || t.building) return { msg: 'Tile occupato' };
    if (t.type !== T.GRASS && t.type !== T.FOREST) return { msg: 'I campi vanno su erba o foresta' };
    return null;
  }
  if (BUILDINGS[tool]) {
    const b = BUILDINGS[tool];
    if (t.building && b.w === 1) return { silent: true };
    for (const p of footprint(tool, x, y)) {
      if (!inMap(p.x, p.y)) return { msg: 'Fuori dalla mappa' };
      const q = game.map[p.y][p.x];
      if (q.building || q.path || q.field || !isBuildable(q))
        return { msg: b.w > 1 ? 'Serve uno spazio libero ' + b.w + 'x' + b.h : 'Qui non si può costruire' };
      if (q.elev !== t.elev) return { msg: 'Serve un terreno piano ' + b.w + 'x' + b.h };
    }
    return null;
  }
  if (tool === 'demolish') {
    if (t.building || t.path || t.field || t.type === T.FOREST) return null;
    return { silent: true };
  }
  return { silent: true };
}

// Il tile permette l'azione dello strumento? (anteprima verde/rossa)
function canUseTool(tool, x, y) { return tool === 'hand' || !checkTool(tool, x, y); }

function toolCost(tool, x, y) {
  const t = game.map[y][x];
  const forest = t.type === T.FOREST ? COSTS.clearForest : 0;
  if (PATHS[tool]) return PATHS[tool].cost + forest;
  if (tool === 'field') return COSTS.field;
  if (BUILDINGS[tool]) return BUILDINGS[tool].cost;
  if (tool === 'demolish') {
    if (t.building) return COSTS.demolishBuilding;
    if (t.path) return COSTS.demolishPath;
    if (t.field) return COSTS.demolishField;
    return COSTS.clearForest;
  }
  return 0;
}

// Ogni azione restituisce { ok, msg?, silent? }
function useTool(tool, x, y) {
  const bad = checkTool(tool, x, y);
  if (bad) return { ok: false, msg: bad.msg, silent: bad.silent };
  if (!spend(toolCost(tool, x, y))) return { ok: false, msg: 'Fondi insufficienti' };
  const t = game.map[y][x];

  if (PATHS[tool]) {
    if (t.type === T.FOREST) t.type = T.GRASS; // gli alberi vengono rimossi
    setPath(x, y, tool);
    if (tool === 'rail') game.rails++; else game.roads++;
    updateRoundabouts();
  } else if (tool === 'field') {
    if (t.type === T.FOREST) t.type = T.GRASS;
    t.field = true;
    game.fields++;
  } else if (BUILDINGS[tool]) {
    const b = { kind: tool, variant: houseVariant(x, y), ax: x, ay: y };
    for (const p of footprint(tool, x, y)) {
      const q = game.map[p.y][p.x];
      if (q.type === T.FOREST) q.type = T.GRASS;
      q.building = b;
    }
    if (tool === 'house') game.houses++; else game.industries++;
  } else if (tool === 'demolish') {
    // priorità: edificio > percorso > campo > alberi
    if (t.building) {
      const b = t.building;
      for (const p of footprint(b.kind, b.ax, b.ay)) game.map[p.y][p.x].building = null;
      if (b.kind === 'house') game.houses--; else game.industries--;
    } else if (t.path) {
      if (t.path === 'rail') game.rails--; else game.roads--;
      setPath(x, y, null);
      updateRoundabouts();
    } else if (t.field) {
      t.field = false;
      game.fields--;
    } else {
      t.type = T.GRASS;
    }
  }
  return { ok: true };
}

// Scorciatoie (usate anche dai test)
function buildRoad(x, y) { return useTool('road', x, y); }
function demolish(x, y) { return useTool('demolish', x, y); }
