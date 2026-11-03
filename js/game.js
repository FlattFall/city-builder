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
  population: 0,   // abitanti in città
  entries: [],     // estremità della strada principale sul bordo: da qui arrivano le auto
  buildings: new Map(), // id -> edificio
  nextId: 1,
  fieldMode: null, // id della fattoria a cui si stanno assegnando i campi
  rotation: 0,     // rotazione (0-3) dei prossimi edifici
  pathDir: 1,      // direzione (0-3) della prossima strada a senso unico
  bridges: new Map(), // id -> ponte (vedi bridges.js)
  nextBridgeId: 1,
  bridgePlan: null,   // ponte che si sta trascinando (anteprima)
  levelTarget: null, // quota scelta dallo strumento Livella
  employed: 0,     // abitanti che lavorano
  base: null,      // terreno appena generato { type, elev } per salvare solo le differenze
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
  if (p) { t.main = false; game.pathKeys.add(y * game.size + x); } // "principale" lo segna solo il generatore
  else {
    game.pathKeys.delete(y * game.size + x); t.rb = null; t.main = false; delete t.dir;
    if (typeof onRoadRemoved === 'function') onRoadRemoved(x, y);
    // una testa di ponte senza strada: il ponte non serve più
    if (typeof bridgesAtHead === 'function') for (const h of bridgesAtHead(x, y)) removeBridge(h.b);
  }
}

// ---------- Livellamento sotto le strade ----------
// Lungo una strada dritta, un "buco" di 1 o 2 tile tra due tile alla stessa quota viene
// riempito: il terreno sotto si alza e la strada resta in piano. Con 3 o più tile bassi
// non si riempie: la strada scende con una rampa, fa il tratto basso e risale.
function fillDips(x, y) {
  const filled = [];
  const same = (ax, ay) => inMap(ax, ay) && sameNet(x, y, ax, ay);
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    for (const len of [3, 4]) {               // finestre di 3 (1 basso) e 4 tile (2 bassi)
      for (let k = -(len - 1); k <= 0; k++) {  // tutte le finestre che contengono (x, y)
        const tiles = [];
        for (let i = 0; i < len; i++) tiles.push([x + (k + i) * dx, y + (k + i) * dy]);
        if (!tiles.every(([tx, ty]) => same(tx, ty))) continue;
        const ends = [tiles[0], tiles[len - 1]].map(([tx, ty]) => game.map[ty][tx].elev);
        if (ends[0] !== ends[1]) continue;
        const mids = tiles.slice(1, -1);
        if (!mids.every(([tx, ty]) => game.map[ty][tx].elev < ends[0])) continue;
        for (const [tx, ty] of mids) { game.map[ty][tx].elev = ends[0]; filled.push([tx, ty]); }
      }
    }
  }
  return filled;
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

// Punto più alto del tile (serve per capire cosa c'è sotto il mouse). Con withBuildings conta
// anche l'altezza degli edifici: serve per cliccarli con la Mano o la ruspa, ma quando si
// costruisce si devono poter scegliere anche i tile dietro un edificio.
function topHeightPx(x, y, withBuildings) {
  const t = game.map[y][x];
  const b = withBuildings && t.building ? BUILDINGS[t.building.kind].height : 0;
  const over = withBuildings && bridgeOver(t);
  const deck = over ? Math.max(...over.e) * STEP + 3 : 0;
  return Math.max(Math.max(...cornerHeights(x, y)) * STEP + b, deck);
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

function buildingAt(x, y) { return inMap(x, y) ? game.map[y][x].building : null; }

// distanza (in tile) di un punto dall'impronta di un edificio
function distToBuilding(b, x, y) {
  const d = BUILDINGS[b.kind];
  const dx = Math.max(b.ax - x, 0, x - (b.ax + d.w - 1));
  const dy = Math.max(b.ay - y, 0, y - (b.ay + d.h - 1));
  return Math.max(dx, dy);
}

// Fattoria a cui assegnare un campo in (x, y): quella in modalità campi, altrimenti la più vicina
function farmForField(x, y) {
  const fm = game.fieldMode && game.buildings.get(game.fieldMode);
  if (fm) return distToBuilding(fm, x, y) <= FARM.fieldRadius ? fm : null;
  let best = null, bd = Infinity;
  for (const b of game.buildings.values()) {
    if (b.kind !== 'farm') continue;
    const d = distToBuilding(b, x, y);
    if (d <= FARM.fieldRadius && d < bd) { best = b; bd = d; }
  }
  return best;
}

function farmFieldCount(farm) {
  let n = 0;
  const R = FARM.fieldRadius, d = BUILDINGS.farm;
  for (let y = farm.ay - R; y < farm.ay + d.h + R; y++)
    for (let x = farm.ax - R; x < farm.ax + d.w + R; x++)
      if (inMap(x, y) && game.map[y][x].field && game.map[y][x].farm === farm.id) n++;
  return n;
}

// Dati iniziali di un edificio appena costruito
function newBuilding(kind, x, y) {
  const b = { id: game.nextId++, kind, variant: houseVariant(x, y), ax: x, ay: y, rot: game.rotation || 0 };
  if (kind === 'house') { b.residents = 0; b.incoming = 0; }
  if (kind === 'farm') { b.crop = 'wheat'; b.growth = 0; b.fields = 0; }
  return initEconomy(b);
}

// ---------- Rotazione ed entrata ----------
// Gli edifici 2x2 si disegnano in un riquadro (u, v da 0 a 2); rot (0-3) lo gira di 90° alla volta
function rotUV(u, v, r) {
  switch (r & 3) {
    case 0: return [u, v];
    case 1: return [2 - v, u];
    case 2: return [2 - u, 2 - v];
    default: return [v, 2 - u];
  }
}

// Fattoria e magazzino hanno una sola entrata: il tile dell'impronta da cui si entra e il tile
// fuori (dove deve esserci la strada). Senza rotazione l'entrata è davanti a sinistra.
function entranceOf(b) {
  if (BUILDINGS[b.kind].w === 1) return null;
  const inn = rotUV(0.5, 1.5, b.rot || 0), out = rotUV(0.5, 2.5, b.rot || 0);
  const x = b.ax + Math.floor(inn[0]), y = b.ay + Math.floor(inn[1]);
  const rx = b.ax + Math.floor(out[0]), ry = b.ay + Math.floor(out[1]);
  return { x, y, rx, ry, d: DIRS.findIndex(D => D.dx === rx - x && D.dy === ry - y) };
}

function footprint(kind, ax, ay) {
  const b = BUILDINGS[kind], out = [];
  for (let y = ay; y < ay + b.h; y++) for (let x = ax; x < ax + b.w; x++) out.push({ x, y });
  return out;
}

// Dove si può costruire: tutto tranne l'acqua (anche in montagna, su roccia e neve)
function isBuildable(t) { return t.type !== T.WATER; }
function isMountain(t) { return t.type === T.ROCK || t.type === T.SNOW; }

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
  game.buildings = new Map();
  game.nextId = 1;
  game.fieldMode = null;
  game.dirty = false;
  game.saveId = null;
  game.hover = null;
  resetBridges();
  if (typeof clearVehicles === 'function') clearVehicles();
  rememberBaseTerrain();
  game.entries = generateMainRoad(); // la strada principale fa parte della mappa nuova
  recount();
}

// Copia del terreno com'era appena generato: nei salvataggi si scrivono solo le differenze
function rememberBaseTerrain() {
  const N = game.size;
  const type = new Uint8Array(N * N), elev = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    type[y * N + x] = game.map[y][x].type;
    elev[y * N + x] = game.map[y][x].elev;
  }
  game.base = { type, elev };
}

// Ricalcola contatori, quota massima e rotonde guardando tutta la mappa
function recount() {
  game.roads = game.rails = game.fields = game.houses = game.industries = 0;
  game.population = 0;
  game.employed = 0;
  game.maxElev = 0;
  game.pathKeys = new Set();
  game.buildings = new Map();
  for (let y = 0; y < game.size; y++)
    for (let x = 0; x < game.size; x++) {
      const t = game.map[y][x];
      if (t.elev > game.maxElev) game.maxElev = t.elev;
      if (t.path) { game.pathKeys.add(y * game.size + x); if (t.path === 'rail') game.rails++; else game.roads++; }
      if (t.field) game.fields++;
      if (t.building && t.building.ax === x && t.building.ay === y) {
        const b = t.building;
        game.buildings.set(b.id, b);
        if (b.id >= game.nextId) game.nextId = b.id + 1;
        if (b.kind === 'house') { game.houses++; game.population += b.residents || 0; } else game.industries++;
      }
    }
  updateRoundabouts();
  for (const b of game.buildings.values()) if (b.kind === 'farm') b.fields = farmFieldCount(b);
  updateJobs();
}

// ---------- Lavoro ----------
// Ogni attività prende i lavoratori tra gli abitanti delle case vicine (entro JOB_RADIUS).
// Chi abita in città ma non lavora è disoccupato.
function updateJobs() {
  const all = [...game.buildings.values()];
  const houses = all.filter(b => b.kind === 'house');
  for (const h of houses) h.employed = 0;
  let total = 0;
  for (const b of all.sort((a, c) => a.id - c.id)) {
    if (!JOBS[b.kind]) continue;
    b.workers = 0;
    for (const h of houses) {
      if (b.workers >= JOBS[b.kind]) break;
      if (distToBuilding(b, h.ax, h.ay) > JOB_RADIUS) continue;
      const take = Math.min((h.residents || 0) - h.employed, JOBS[b.kind] - b.workers);
      if (take <= 0) continue;
      h.employed += take; b.workers += take; total += take;
    }
  }
  game.employed = total;
}

// ---------- Strumenti ----------
// Controlla se lo strumento si può usare: null se sì, altrimenti { msg?, silent? }
function checkTool(tool, x, y) {
  if (!inMap(x, y)) return { silent: true };
  const t = game.map[y][x];
  if (PATHS[tool]) {
    // senso unico già fatto: ripassandoci sopra si cambia la direzione
    if (t.path === tool) return (PATHS[tool].oneway && t.dir !== game.pathDir) ? null : { silent: true };
    if (t.path) {
      // una strada si può trasformare in un'altra (es. strada -> autostrada), ma non in binario
      if (netOf(t.path) !== 'road' || PATHS[tool].net !== 'road') return { msg: "C'è già " + (t.path === 'rail' ? 'un binario' : 'una strada') };
      if (t.main && (PATHS[tool].oneway || tool === 'dirt')) return { msg: 'La strada principale resta a doppio senso e asfaltata' };
      return null;
    }
    if (bridgeOver(t) && deckMin(bridgeOver(t), t.bridge.i) < t.elev + BRIDGE.clearPath)
      return { msg: "Sotto il ponte non c'è abbastanza spazio" };
    if (t.building) return { msg: "C'è già un edificio" };
    if (t.field) return { msg: "C'è un campo: demolisci prima" };
    if (!isBuildable(t)) return { msg: 'Qui non si può costruire' };
    return null;
  }
  if (tool === 'raise' || tool === 'lower' || tool === 'level') {
    if (t.building || t.path) return { msg: 'Libera il terreno prima di modellarlo' };
    if (t.bridge) return { msg: isTunnel(bridgeAt(x, y)) ? "Sotto c'è un tunnel" : "Sopra c'è un ponte" };
    if (tool === 'raise' && t.elev >= MAX_ELEV) return { msg: 'Più in alto non si può' };
    if (tool === 'lower' && t.type === T.WATER) return { msg: 'Più in basso non si può' };
    if (tool === 'level' && game.levelTarget != null && t.elev === game.levelTarget) return { silent: true };
    return null;
  }
  if (tool === 'field') {
    // i campi si mettono solo dalla fattoria (modalità campi)
    if (!game.fieldMode) return { msg: 'I campi si mettono dalla fattoria' };
    // un campo già fatto ma senza fattoria si può assegnare a una fattoria vicina
    if (t.field) return (!t.farm && farmForField(x, y)) ? null : { silent: true };
    if (game.fieldMode && !farmForField(x, y)) return { msg: 'Troppo lontano dalla fattoria (max ' + FARM.fieldRadius + ' tile)' };
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
      const over = bridgeOver(q);   // sotto un ponte ci stanno solo le case basse (1x1)
      if (over && (b.w > 1 || deckMin(over, q.bridge.i) < q.elev + buildingClear(tool))) return { msg: 'Sotto il ponte non c\'è abbastanza spazio' };
      if (q.building || q.path || q.field || !isBuildable(q))
        return { msg: b.w > 1 ? 'Serve uno spazio libero ' + b.w + 'x' + b.h : 'Qui non si può costruire' };
      if (q.elev !== t.elev) return { msg: 'Serve un terreno piano ' + b.w + 'x' + b.h };
      if (b.grass && isMountain(q)) return { msg: 'In montagna fa troppo freddo e non c\'è erba' };
      if (b.grass && q.type === T.SAND) return { msg: 'Serve erba, non sabbia' };
    }
    return null;
  }
  if (tool === 'bridge' || tool === 'tunnel') {
    if (t.building || t.bridge || !isBuildable(t) || (t.path && netOf(t.path) !== 'road')) return { msg: 'Qui non può partire un ' + (tool === 'bridge' ? 'ponte' : 'tunnel') };
    return null;
  }
  if (tool === 'demolish') {
    const over = bridgeOver(t);
    if (over) return over.main ? { msg: 'La strada principale non si può demolire' } : null;   // prima si toglie il ponte
    if (t.bridge && !t.building && !t.path && !t.field && t.type !== T.FOREST) return null;  // poi il tunnel sotto
    if (!t.building && t.path && t.main) return { msg: 'La strada principale non si può demolire' };
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
  if (PATHS[tool]) return t.path === tool ? 0 : PATHS[tool].cost + (t.path ? 0 : forest);
  if (tool === 'field') return t.field ? 0 : COSTS.field;
  if (tool === 'raise' || tool === 'lower') return COSTS.terrain;
  if (tool === 'level') return COSTS.terrain * Math.abs((game.levelTarget ?? t.elev) - t.elev);
  if (BUILDINGS[tool]) return BUILDINGS[tool].cost;
  if (tool === 'demolish') {
    if (bridgeOver(t)) return COSTS.demolishPath * (bridgeOver(t).n - 1);
    if (t.building) return COSTS.demolishBuilding;
    if (t.path) return COSTS.demolishPath;
    if (t.bridge && t.type !== T.FOREST && !t.field) return COSTS.demolishPath * (bridgeAt(x, y).n - 1);
    if (t.field) return COSTS.demolishField;
    return COSTS.clearForest;
  }
  return 0;
}

// Ogni azione restituisce { ok, msg?, silent? }
function useTool(tool, x, y) {
  // Livella: il primo tile della passata decide la quota per tutti gli altri
  if (tool === 'level' && game.levelTarget == null && inMap(x, y)) { game.levelTarget = game.map[y][x].elev; return { ok: false, silent: true }; }
  const bad = checkTool(tool, x, y);
  if (bad) return { ok: false, msg: bad.msg, silent: bad.silent };
  if (!spend(toolCost(tool, x, y))) return { ok: false, msg: 'Fondi insufficienti' };
  const t = game.map[y][x];

  if (PATHS[tool]) {
    if (t.path === tool) { t.dir = game.pathDir; return { ok: true }; }   // senso unico girato
    const replacing = !!t.path, main = t.main;
    if (t.type === T.FOREST) t.type = T.GRASS; // gli alberi vengono rimossi
    setPath(x, y, tool);
    t.main = main;                              // la strada principale resta principale
    if (PATHS[tool].oneway) t.dir = game.pathDir; else delete t.dir;
    if (!replacing) {
      if (tool === 'rail') game.rails++; else game.roads++;
      fillDips(x, y);
    }
    updateRoundabouts();
  } else if (tool === 'field') {
    if (t.type === T.FOREST) t.type = T.GRASS;
    if (!t.field) game.fields++;
    t.field = true;
    const farm = farmForField(x, y);
    t.farm = farm ? farm.id : null;
    if (farm) farm.fields = farmFieldCount(farm);
  } else if (BUILDINGS[tool]) {
    const b = newBuilding(tool, x, y);
    for (const p of footprint(tool, x, y)) {
      const q = game.map[p.y][p.x];
      if (q.type === T.FOREST) q.type = T.GRASS;
      q.building = b;
    }
    game.buildings.set(b.id, b);
    if (tool === 'house') game.houses++; else game.industries++;
    if (tool === 'farm' && typeof onFarmPlaced === 'function') onFarmPlaced(b);
  } else if (tool === 'raise' || tool === 'lower' || tool === 'level') {
    const target = tool === 'raise' ? t.elev + 1 : tool === 'lower' ? t.elev - 1 : game.levelTarget;
    setElevation(x, y, target);
  } else if (tool === 'demolish') {
    // priorità: ponte > edificio > percorso > campo > alberi > tunnel sotto
    const tun = t.bridge && !bridgeOver(t) ? bridgeAt(x, y) : null;
    if (bridgeOver(t)) removeBridge(bridgeOver(t));
    else if (t.building) removeBuilding(t.building);
    else if (t.path) {
      if (t.path === 'rail') game.rails--; else game.roads--;
      setPath(x, y, null);
      updateRoundabouts();
    } else if (t.field) {
      const farm = t.farm && game.buildings.get(t.farm);
      t.field = false; t.farm = null;
      game.fields--;
      if (farm) farm.fields = farmFieldCount(farm);
    } else if (t.type === T.FOREST || !tun) {
      t.type = t.type === T.FOREST ? T.GRASS : t.type;
    } else removeBridge(tun);
  }
  return { ok: true };
}

// Toglie un edificio: chi ci abitava se ne va, i campi della fattoria restano senza padrone,
// le fattorie che portavano il cibo a un magazzino demolito non hanno più destinazione
function removeBuilding(b) {
  for (const p of footprint(b.kind, b.ax, b.ay)) game.map[p.y][p.x].building = null;
  game.buildings.delete(b.id);
  if (b.kind === 'house') { game.houses--; game.population -= b.residents || 0; } else game.industries--;
  if (b.kind === 'farm') {
    const R = FARM.fieldRadius;
    for (let y = b.ay - R; y < b.ay + 2 + R; y++) for (let x = b.ax - R; x < b.ax + 2 + R; x++)
      if (inMap(x, y) && game.map[y][x].farm === b.id) game.map[y][x].farm = null;
    if (game.fieldMode === b.id) game.fieldMode = null;
  }
  // chi mandava merce qui non ha più destinazione
  for (const f of game.buildings.values()) if (f.dests) f.dests = f.dests.filter(id => id !== b.id);
  if (typeof removeVehiclesFor === 'function') removeVehiclesFor(b.id, b);
  if (typeof onBuildingRemoved === 'function') onBuildingRemoved(b);
}

// Cambia la quota di un tile: sotto il livello del mare diventa acqua, l'acqua alzata diventa sabbia
function setElevation(x, y, e) {
  const t = game.map[y][x];
  e = Math.max(0, Math.min(MAX_ELEV, e));
  if (e === 0) {
    if (t.field) { t.field = false; t.farm = null; game.fields--; }
    t.type = T.WATER;
  } else if (t.type === T.WATER) t.type = T.SAND;
  t.elev = e;
  if (e > game.maxElev) game.maxElev = e;
}

// Scorciatoie (usate anche dai test)
function buildRoad(x, y) { return useTool('road', x, y); }
function demolish(x, y) { return useTool('demolish', x, y); }
