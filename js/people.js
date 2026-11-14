// ---------- Passanti (richiesta dell'utente: gente che si muove per la città) ----------
// Escono dalle case abitate (o dalle attività) e camminano sui marciapiedi fino a un edificio vicino
// raggiungibile a piedi (negozi, lavoro, fermate del bus, altre case), poi ci entrano e spariscono.
// Non si salvano; non contano nell'economia: sono solo per dare vita alle strade.
// Usano gli stessi punti dei veicoli ([mx, my, quota, velocità, livello]) e si disegnano con loro
// (vehiclesByTile), così edifici e terreno davanti li coprono.
const PEDS = {
  perResident: 0.15,  // passanti in giro per abitante
  max: 120,           // al massimo (prestazioni)
  every: 0.35,        // secondi tra un'uscita e l'altra
  range: 16,          // tile di strada al massimo a piedi
  speed: 0.42,        // tile al secondo
  side: 0.38,         // distanza dal centro della strada (sul marciapiede)
};
const PED_SHIRTS = ['#d94141', '#3f6fd9', '#e8c23a', '#3fa34d', '#f2f2f2', '#8e5bd1', '#e07b39', '#2fa3a3', '#e86fa0'];
const PED_PANTS = ['#2b3a5c', '#3a3a40', '#5a4630', '#4a5560', '#1f2a44'];
const PED_SKIN = ['#f1c9a5', '#e0ac85', '#c68a5e', '#8d5a3b', '#f5d6bc'];
const PED_HAIR = ['#2b1d12', '#5a3a1e', '#d9b44a', '#1b1b1b', '#8a4a20', '#b5b5b5'];

let peds = [], pedTimer = 0, pedOrigins = null, pedOriginsTimer = 0;
function clearPeds() { peds = []; pedTimer = 0; pedOrigins = null; }

function pedWalkable(x, y) {
  if (!inMap(x, y)) return false;
  const t = game.map[y][x];
  return !!t.path && t.path !== 'rail' && t.path !== 'highway';   // niente pedoni in autostrada
}
// tile di strada su un lato dell'edificio (con il tile dell'edificio da cui si esce)
function pedDoors(b) {
  const out = [];
  for (const p of footprint(b.kind, b.ax, b.ay)) for (let d = 0; d < 4; d++) {
    const nx = p.x + DIRS[d].dx, ny = p.y + DIRS[d].dy;
    if (pedWalkable(nx, ny) && game.map[ny][nx].building !== b) out.push({ x: nx, y: ny, bx: p.x, by: p.y, d });
  }
  return out;
}
function pedTarget(b) {
  const d = BUILDINGS[b.kind];
  if (b.kind === 'busStop') return 2;
  if (d.infra || d.water || POWER[b.kind] || b.kind === 'waterWell' || b.kind === 'sewage') return 0;
  if (SHOPS[b.kind]) return 4;          // ai negozi si va più volentieri
  if (b.kind === 'house') return 1;
  return 2;                             // lavoro
}
function rebuildPedOrigins() {
  pedOrigins = [];
  for (const b of game.buildings.values()) {
    const w = b.kind === 'house' ? Math.min(4, b.residents || 0) : (b.staff || 0) > 0 || SHOPS[b.kind] ? 1 : 0;
    if (!w || !pedTarget(b)) continue;
    const doors = pedDoors(b);
    if (doors.length) for (let i = 0; i < w; i++) pedOrigins.push({ b, doors });
  }
}

// Percorso a piedi: BFS sulle strade (con le rampe: roadLinked) fino a un edificio vicino a caso
// weight(edificio) = quanto è probabile come meta (di base pedTarget); minDist = tile minimi di cammino
function planWalk(o, weight = pedTarget, minDist = 2) {
  const N = game.size, start = o.doors[Math.floor(Math.random() * o.doors.length)];
  const k0 = start.y * N + start.x, par = new Map([[k0, -1]]), dist = new Map([[k0, 0]]);
  const queue = [k0], goals = [];
  while (queue.length) {
    const k = queue.shift(), x = k % N, y = (k - x) / N, dd = dist.get(k);
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
      if (!inMap(nx, ny)) continue;
      const nb = game.map[ny][nx].building;
      if (nb && nb !== o.b && dd >= minDist) {
        const w = weight(nb);
        if (w) goals.push({ k, nb, bx: nx, by: ny, w });
      }
      const nk = ny * N + nx;
      if (dd >= PEDS.range || par.has(nk) || !pedWalkable(nx, ny) || !roadLinked(x, y, d)) continue;
      par.set(nk, k); dist.set(nk, dd + 1); queue.push(nk);
    }
  }
  if (!goals.length) return null;
  let tot = 0;
  for (const g of goals) tot += g.w;
  let r = Math.random() * tot, goal = goals[0];
  for (const g of goals) { r -= g.w; if (r <= 0) { goal = g; break; } }
  const tiles = [];
  for (let k = goal.k; k !== -1; k = par.get(k)) { const x = k % N; tiles.push([x, (k - x) / N]); }
  tiles.reverse();
  return { tiles, from: [start.bx, start.by], to: [goal.bx, goal.by], dest: goal.nb };
}
// punti sul marciapiede di destra (come routePoints ma più in fuori), con l'uscita dalla porta
// dell'edificio di partenza e l'entrata in quello di arrivo
function pedPoints(walk) {
  const { tiles, from, to } = walk;
  const dirOf = (a, b) => DIRS.findIndex(D => D.dx === b[0] - a[0] && D.dy === b[1] - a[1]);
  const right = d => [-DIRS[d].dy, DIRS[d].dx];
  const n = tiles.length, pts = [], o = PEDS.side;
  const P = (mx, my) => pts.push([mx, my, surfaceHeight(mx, my), 1, 0]);
  const dStart = dirOf(from, tiles[0]), dEnd = dirOf(tiles[n - 1], to);
  const S = DIRS[dStart], E = DIRS[dEnd];
  P(from[0] + 0.5 + S.dx * 0.25, from[1] + 0.5 + S.dy * 0.25);                  // porta (poco dentro l'edificio)
  P(tiles[0][0] + 0.5 - S.dx * o, tiles[0][1] + 0.5 - S.dy * o);                  // marciapiede dal lato della porta
  for (let i = 0; i < n; i++) {
    const [x, y] = tiles[i];
    const dIn = i > 0 ? dirOf(tiles[i - 1], tiles[i]) : dStart;
    const dOut = i < n - 1 ? dirOf(tiles[i], tiles[i + 1]) : dEnd;
    const ri = right(dIn), ro = right(dOut);
    if (dIn === dOut) P(x + 0.5 + ro[0] * o, y + 0.5 + ro[1] * o);
    else if (dIn !== (dOut + 2) % 4) P(x + 0.5 + (ri[0] + ro[0]) * o, y + 0.5 + (ri[1] + ro[1]) * o);   // angolo
    if (i < n - 1) { const m = MID_UV[dOut]; P(x + m[0] + ro[0] * o, y + m[1] + ro[1] * o); }
  }
  const [lx, ly] = tiles[n - 1];
  P(lx + 0.5 + E.dx * o, ly + 0.5 + E.dy * o);                                    // marciapiede dal lato dell'arrivo
  P(to[0] + 0.5 - E.dx * 0.25, to[1] + 0.5 - E.dy * 0.25);                         // dentro la porta
  return pts;
}
function newPed(pts) {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  return { kind: 'ped', pts, seg: 0, s: 0, speed: PEDS.speed * (0.85 + Math.random() * 0.3),
    shirt: pick(PED_SHIRTS), pants: pick(PED_PANTS), skin: pick(PED_SKIN), hair: pick(PED_HAIR),
    step: Math.random() * 6, bag: Math.random() < 0.25 };
}
function spawnPed() {
  if (!pedOrigins || !pedOrigins.length) return;
  const o = pedOrigins[Math.floor(Math.random() * pedOrigins.length)];
  if (!game.buildings.has(o.b.id)) return;
  const walk = planWalk(o);
  if (!walk) return;
  const p = newPed(pedPoints(walk));
  if (walk.dest.kind === 'busStop') p.stop = walk.dest.id;   // va a prendere il bus
  peds.push(p);
}
function pedsUpdate(dt) {
  if ((pedOriginsTimer -= dt) <= 0) { pedOriginsTimer = 3; rebuildPedOrigins(); }
  const want = Math.min(PEDS.max, Math.floor((game.population || 0) * PEDS.perResident));
  if ((pedTimer -= dt) <= 0) { pedTimer = PEDS.every; if (peds.length < want) spawnPed(); }
  if (!peds.length) return;
  const keep = [];
  for (const p of peds) {
    if (p.waiting != null) {   // aspetta il bus sotto la pensilina (bus.js lo fa salire); se la fermata sparisce o il bus non passa più, se ne va
      const s = game.buildings.get(p.waiting);
      if (s && s.depot && (p.waitT -= dt) > 0) keep.push(p);
      continue;
    }
    if (p.board && !vehicles.includes(p.board)) continue;   // il bus non c'è più
    p.step += dt * p.speed * 14;
    if (!moveVehicle(p, dt)) { keep.push(p); continue; }
    // arrivato a una fermata servita: aspetta lì (al massimo BUS.maxWait persone), fermo, girato verso la strada
    const s = p.stop != null && !p.board ? game.buildings.get(p.stop) : null;
    if (s && s.depot && peds.filter(q => q.waiting === s.id).length < BUS.maxWait) {
      const e = p.pts[p.pts.length - 1], k = (Math.random() - 0.5) * 0.3;
      const along = Math.abs(e[0] - (s.ax + 0.5)) > Math.abs(e[1] - (s.ay + 0.5));   // la porta è su un lato in x: ci si mette in fila lungo y
      const q = [e[0] + (along ? 0 : k), e[1] + (along ? k : 0), e[2], 1, 0];
      p.pts = [q, q]; p.seg = 0; p.s = 0; p.waiting = s.id; p.waitT = 180; p.step = 0;
      keep.push(p);
    }
  }
  peds = keep;
}
// strada tolta sotto i piedi: chi ci passava entra nel primo edificio (sparisce piano, non si vede)
function pedsOnRoadRemoved(x, y) {
  peds = peds.filter(p => !p.pts.some(q => Math.floor(q[0]) === x && Math.floor(q[1]) === y));
}

// Omino: ombra, gambe che si muovono, maglietta, braccia, testa con i capelli (eventuale borsa)
function drawPed(c, v) {
  if (!DETAIL) return;
  const { mx, my, h } = v.pos;
  const a = v.pts[v.seg], b = v.pts[Math.min(v.seg + 1, v.pts.length - 1)];
  const [x0, y0] = iso(0, 0, mx, my, h);
  // direzione di marcia sullo schermo
  let sx = ((b[0] - a[0]) - (b[1] - a[1])) * TW / 2, sy = ((b[0] - a[0]) + (b[1] - a[1])) * TH / 2;
  const L = Math.hypot(sx, sy) || 1; sx /= L; sy /= L;
  const sw = Math.sin(v.step), back = sy < 0;   // di spalle se va verso il fondo
  c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(x0, y0, 1.6, 0.8, 0, 0, Math.PI * 2); c.fill();
  const hip = [x0, y0 - 2], k = 0.9 * sw;
  c.lineCap = 'round';
  c.strokeStyle = v.pants; c.lineWidth = 0.75;
  c.beginPath(); c.moveTo(hip[0] - 0.35, hip[1]); c.lineTo(x0 - 0.35 + sx * k, y0 - 0.2 + sy * k * 0.5);
  c.moveTo(hip[0] + 0.35, hip[1]); c.lineTo(x0 + 0.35 - sx * k, y0 - 0.2 - sy * k * 0.5); c.stroke();
  // braccio dietro, corpo, braccio davanti
  const arm = (side, s) => {
    c.strokeStyle = v.skin; c.lineWidth = 0.5;
    c.beginPath(); c.moveTo(x0 + side * 0.85, y0 - 3.7); c.lineTo(x0 + side * 0.95 + sx * s * 0.7, y0 - 2.2 + sy * s * 0.35); c.stroke();
  };
  arm(-1, -sw);
  c.fillStyle = v.shirt;
  c.beginPath(); c.moveTo(x0 - 0.85, y0 - 4.1); c.lineTo(x0 + 0.85, y0 - 4.1); c.lineTo(x0 + 0.75, y0 - 1.9); c.lineTo(x0 - 0.75, y0 - 1.9); c.closePath(); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x0, y0 - 4.1, 0.85, 2.2);   // lato in ombra
  arm(1, sw);
  if (v.bag) { c.fillStyle = '#8a5a3a'; c.fillRect(x0 + 0.9 + sx * sw * 0.7 - 0.5, y0 - 2.4 + sy * sw * 0.35, 1, 1); }
  c.fillStyle = v.skin; c.beginPath(); c.arc(x0, y0 - 4.85, 0.75, 0, Math.PI * 2); c.fill();
  c.fillStyle = v.hair; c.beginPath();
  if (back) c.arc(x0, y0 - 4.85, 0.78, 0, Math.PI * 2);           // di spalle: tutta la nuca
  else c.arc(x0, y0 - 5.0, 0.78, Math.PI, Math.PI * 2);          // davanti: solo sopra
  c.fill();
  c.lineCap = 'butt';
  animSeen = true;
}
