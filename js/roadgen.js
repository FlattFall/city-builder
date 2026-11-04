// La strada principale è un'autostrada (scelta dell'utente: le auto vanno più veloci)
const MAIN_PATH = 'highway';
// ---------- Strada principale ----------
// Ogni mappa nuova ha una strada che arriva da un bordo, attraversa l'isola seguendo il
// terreno ed esce dal bordo opposto. Sull'acqua passa su un ponte (dritto) con i pilastri;
// se lì un ponte non si può fare, su un terrapieno di sabbia.
// Da queste due estremità arrivano le auto dei nuovi abitanti.

// Coda con priorità (min-heap) per la ricerca del percorso
class MinHeap {
  constructor() { this.keys = []; this.vals = []; }
  get size() { return this.vals.length; }
  push(val, key) {
    const k = this.keys, v = this.vals;
    let i = v.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.keys, v = this.vals, top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (v.length) {
      let i = 0;
      const n = v.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

// Quota "di strada" di un tile: l'acqua conta come 1 (il terrapieno)
function roadgenElev(t) { return t.type === T.WATER ? 1 : t.elev; }

// Cerca il percorso migliore dal tile (sx, sy) al bordo opposto.
// Regole (le stesse delle rampe): si sale o si scende di un livello alla volta, si sale
// solo andando dritti e dopo una discesa si prosegue dritti, così ogni rampa funziona.
function mainRoadSearch(sx, sy, horizontal) {
  const N = game.size, S = N * N * 4;
  const g = new Float32Array(S).fill(Infinity);
  const came = new Int32Array(S).fill(-1);
  const closed = new Uint8Array(S);
  const heap = new MinHeap();
  const h = (x, y) => (horizontal ? N - 1 - x : N - 1 - y);
  const cost = t => (t.type === T.WATER ? 3 : t.type === T.FOREST ? 1.4 : t.type === T.ROCK ? 3 : 1);
  const d0 = horizontal ? 1 : 2;
  const s0 = (sy * N + sx) * 4 + d0;
  g[s0] = 0;
  heap.push(s0, h(sx, sy));
  while (heap.size) {
    const s = heap.pop();
    if (closed[s]) continue;
    closed[s] = 1;
    const dir = s & 3, k = s >> 2, x = k % N, y = (k / N) | 0;
    if (horizontal ? x === N - 1 : y === N - 1) {
      const path = [];
      for (let c = s; c !== -1; c = came[c]) { const kk = c >> 2; path.push([kk % N, (kk / N) | 0]); }
      return path.reverse();
    }
    const e = roadgenElev(game.map[y][x]);
    const wet = game.map[y][x].type === T.WATER;   // sull'acqua si va dritti (diventerà un ponte)
    const px = x - DIRS[dir].dx, py = y - DIRS[dir].dy;
    const cameDown = s !== s0 && inMap(px, py) && roadgenElev(game.map[py][px]) > e;
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (dir + 2) % 4) continue;
      if (cameDown && nd !== dir) continue;      // questo tile sarà una rampa: si va dritti
      if (wet && nd !== dir) continue;
      const nx = x + DIRS[nd].dx, ny = y + DIRS[nd].dy;
      if (!inMap(nx, ny)) continue;
      const nt = game.map[ny][nx];
      if (nt.type === T.SNOW) continue;
      const ne = roadgenElev(nt);
      if (Math.abs(ne - e) > 1) continue;
      if (ne > e && nd !== dir) continue;        // si sale solo andando dritti
      const ns = (ny * N + nx) * 4 + nd;
      const ng = g[s] + cost(nt) + (nd !== dir ? 2.5 : 0) + (ne !== e ? 1 : 0); // le curve costano: tratti lunghi e dritti
      if (ng < g[ns]) { g[ns] = ng; came[ns] = s; heap.push(ns, ng + 1.2 * h(nx, ny)); }
    }
  }
  return null;
}

// Crea la strada principale e restituisce le sue due estremità sul bordo
function generateMainRoad() {
  const N = game.size;
  let path = null;
  // prova alcune posizioni e direzioni finché trova un percorso
  for (let attempt = 0; attempt < 6 && !path; attempt++) {
    const horizontal = hash(game.seed, attempt, 1) < 0.5;
    const off = Math.floor((hash(game.seed, attempt, 2) - 0.5) * N / 3);
    const a = Math.max(1, Math.min(N - 2, Math.floor(N / 2) + off));
    path = horizontal ? mainRoadSearch(0, a, true) : mainRoadSearch(a, 0, false);
  }
  if (!path) return [];
  // tratti sull'acqua: dal tile di terra prima a quello dopo
  const wet = ([x, y]) => game.map[y][x].type === T.WATER;
  const runs = [];
  for (let i = 0; i < path.length; i++) {
    if (!wet(path[i])) continue;
    let j = i;
    while (j + 1 < path.length && wet(path[j + 1])) j++;
    runs.push([i, j]);
    i = j;
  }
  const isBridgeTile = new Set();
  for (const [i, j] of runs) if (i > 0 && j < path.length - 1) for (let k = i; k <= j; k++) isBridgeTile.add(k);
  path.forEach(([x, y], k) => {
    if (isBridgeTile.has(k)) return;   // qui ci va il ponte: l'acqua resta
    const t = game.map[y][x];
    if (t.type === T.WATER) { t.type = T.SAND; t.elev = 1; }  // terrapieno (acqua sul bordo della mappa)
    if (t.type === T.FOREST) t.type = T.GRASS;
    setPath(x, y, MAIN_PATH);
    t.main = true;
  });
  for (const [x, y] of path) if (game.map[y][x].path) fillDips(x, y);
  updateRoundabouts();
  for (const [i, j] of runs) {
    if (i === 0 || j === path.length - 1) continue;
    const a = path[i - 1], b = path[j + 1];
    const plan = planBridge({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }, MAIN_PATH);
    if (plan.ok) { buildBridge(plan, { free: true, main: true }); continue; }
    for (let k = i; k <= j; k++) {   // il ponte non va: terrapieno di sabbia come prima
      const [x, y] = path[k], t = game.map[y][x];
      t.type = T.SAND; t.elev = 1; setPath(x, y, MAIN_PATH); t.main = true;
    }
    updateRoundabouts();
  }
  return [{ x: path[0][0], y: path[0][1] }, { x: path[path.length - 1][0], y: path[path.length - 1][1] }];
}
