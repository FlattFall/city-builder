// ---------- Municipio, felicità, ladri e polizia (richiesta dell'utente) ----------
// MUNICIPIO (uno per città): dal suo pannello si regolano le tasse sulle vendite (game.taxRate, da TAX.min a
// TAX.max). Più tasse = più soldi dai negozi ma gente meno felice.
// FELICITÀ: ogni casa ha un valore 0..100 (h.happy) fatto di pezzi (h.happyWhy): acqua, corrente, lavoro,
// negozi vicini, sicurezza (polizia), furti recenti, tasse, fabbriche vicine, municipio, bus. La città = media
// pesata sugli abitanti (game.happy, nella barra in alto). Gente felice compra di più; sotto HAPPY.noArrive
// non arriva nessuno in quella casa, sotto HAPPY.leave la gente se ne va (in auto, fuori dalla mappa).
// Città piccola (meno di HAPPY.grace abitanti): si arriva e si resta comunque, così si comincia con le case.
// LADRI: ogni tanto (più spesso nelle città grandi) un ladro colpisce una casa o un negozio: si vede scappare
// (omino a righe con il sacco) e sopra l'edificio compare l'icona del furto. Senza polizia vicina ruba i soldi
// e la felicità del quartiere scende; con una stazione di polizia entro POLICE.radius i furti sono molto più
// rari, l'auto della polizia (sirena blu e rossa) arriva e il ladro viene arrestato.
const TAX = { min: 0.2, max: 0.9, step: 0.05 };
const HAPPY = { base: 50, grace: 40, noArrive: 25, leave: 20, unhappy: 30, every: 2, leaveChance: 0.06, noise: 3 };
const POLICE = { radius: 16, carSpeed: 1.9 };
const CRIME = { every: 14, minPop: 24, perResident: 0.0035, max: 0.75, policeCut: 0.3, stealMin: 80, stealPer: 2, stealMax: 1500, memory: 90, radius: 7, icon: 14 };
const HAPPY_LABELS = { water: 'Acqua', power: 'Corrente', jobs: 'Lavoro', shops: 'Negozi vicini', safety: 'Sicurezza', crime: 'Furti recenti',
  taxes: 'Tasse', noise: 'Fabbriche vicine', hall: 'Municipio', bus: 'Bus' };

function happyColor(v) { return v >= 65 ? '#a7f070' : v >= 40 ? '#ffd966' : '#ff7b6b'; }
function cityState() {
  if (!game.crime || game.crime.map !== game.map) game.crime = { map: game.map, thefts: 0, caught: 0, stolen: 0, t: CRIME.every };
  return game.crime;
}
function townHallOf() { for (const b of game.buildings.values()) if (b.kind === 'townHall') return b; return null; }
function isNoisy(b) { return isProcessor(b) || b.kind === 'coalPlant' || b.kind === 'refinery' || b.kind === 'port' || b.kind === 'oilWell'; }
// stazione di polizia che protegge (x, y): con agenti e entro il raggio
function policeFor(b) {
  let best = null, bd = Infinity;
  for (const p of game.buildings.values()) {
    if (p.kind !== 'police' || !(p.workers > 0)) continue;
    const d = distToBuilding(p, b.ax, b.ay);
    if (d <= POLICE.radius && d < bd) { bd = d; best = p; }
  }
  return best;
}

// ---- felicità ----
function houseHappiness(h, ctx) {
  const why = {};
  if (WATER.required) why.water = (h.watered || 0) >= 0.5 ? 8 : -12;
  why.power = (h.powered || 0) >= 0.5 ? 8 : -12;
  if (h.residents > 0) why.jobs = Math.round(((h.employed || 0) / h.residents - 0.5) * 20);
  let shops = 0;
  for (const s of ctx.shops) if (distToBuilding(s, h.ax, h.ay) <= SHOPS[s.kind].radius) shops |= 1 << Object.keys(SHOPS).indexOf(s.kind);
  const kinds = shops ? shops.toString(2).split('1').length - 1 : 0;
  why.shops = kinds ? 6 + 2 * Math.min(3, kinds - 1) : -10;
  const cop = ctx.police.some(p => distToBuilding(p, h.ax, h.ay) <= POLICE.radius);
  why.safety = cop ? 10 : game.population < CRIME.minPop ? 0 : -Math.min(18, 4 + Math.round(game.population / 50));
  if (h.crimeT > 0) why.crime = -Math.round(15 * h.crimeT / CRIME.memory);
  why.taxes = Math.round((TAX_RATE - taxRate()) * 60);
  if (ctx.noisy.some(n => distToBuilding(n, h.ax, h.ay) <= HAPPY.noise)) why.noise = -10;
  if (ctx.hall) why.hall = 5;
  if (game.bus && game.bus.near && game.bus.near.has(h.id)) why.bus = 4;
  let v = HAPPY.base;
  for (const k in why) v += why[k];
  h.happyWhy = why;
  h.happy = Math.max(0, Math.min(100, v));
}
function happyBlocksArrival(h) { return game.population >= HAPPY.grace && h.happy != null && h.happy < HAPPY.noArrive; }
function updateHappiness() {
  const all = [...game.buildings.values()];
  const ctx = {
    shops: all.filter(b => SHOPS[b.kind] && b.workers > 0),
    police: all.filter(b => b.kind === 'police' && b.workers > 0),
    noisy: all.filter(isNoisy),
    hall: all.some(b => b.kind === 'townHall' && b.workers > 0),
  };
  let sum = 0, n = 0;
  for (const h of all) if (h.kind === 'house') {
    houseHappiness(h, ctx);
    sum += h.happy * (h.residents || 0); n += h.residents || 0;
    // gente infelice: ogni tanto una famiglia se ne va (in auto, fuori dalla mappa)
    if (game.population >= HAPPY.grace && h.happy < HAPPY.leave && h.residents > 0 && Math.random() < HAPPY.leaveChance) {
      h.residents--; game.population--;
      const starts = accessTiles(h);
      if (starts.length) leaveMap({ kind: 'car', color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)] }, starts);
      updateHud();
    }
  }
  game.happy = n ? sum / n : null;
  updateHud();
}
// i negozi vendono di più quando la gente è felice (da 0.6 a 1.4 volte)
function happyBuy() { return game.happy == null ? 1 : 0.6 + 0.8 * game.happy / 100; }
// media dei pezzi della felicità su tutta la città (per il municipio)
function cityHappyWhy() {
  const sum = {}; let n = 0;
  for (const h of game.buildings.values()) if (h.kind === 'house' && h.happyWhy && h.residents) {
    for (const k in h.happyWhy) sum[k] = (sum[k] || 0) + h.happyWhy[k] * h.residents;
    n += h.residents;
  }
  for (const k in sum) sum[k] = Math.round(sum[k] / n);
  return sum;
}

// ---- ladri ----
function crimeTick(dt) {
  const C = cityState();
  for (const b of game.buildings.values()) {
    if (b.theftT > 0) b.theftT -= dt;
    if (b.crimeT > 0) b.crimeT -= dt;
  }
  if ((C.t -= dt) > 0) return;
  C.t = CRIME.every * (0.7 + Math.random() * 0.6);
  if (game.population < CRIME.minPop) return;
  const targets = [...game.buildings.values()].filter(b => (b.kind === 'house' && b.residents > 0) || (SHOPS[b.kind] && b.workers > 0) || b.kind === 'bakery');
  if (!targets.length) return;
  const t = targets[Math.floor(Math.random() * targets.length)];
  const cop = policeFor(t);
  const chance = Math.min(CRIME.max, game.population * CRIME.perResident) * (cop ? CRIME.policeCut : 1);
  if (Math.random() > chance) return;
  commitTheft(t, cop);
}
function commitTheft(t, cop) {
  const C = cityState();
  C.thefts++;
  t.theftT = CRIME.icon;
  t.theftCop = !!cop;
  const thief = spawnThief(t);
  // con la polizia: arriva l'auto, il ladro viene arrestato e i soldi restano
  let route = null;
  if (cop) route = findRoute(accessTiles(cop), accessTiles(t));
  if (route) {
    spawnVehicle({ kind: 'police', from: cop.id, tiles: route, pts: routePoints(route, false), speed: POLICE.carSpeed, color: '#f4f4f4',
      arrive() {
        if (thief && peds.includes(thief)) peds = peds.filter(p => p !== thief);
        C.caught++;
        const tb = game.buildings.get(t.id);
        if (tb) tb.theftT = Math.min(tb.theftT, 2);
        toast(TR('Ladro arrestato vicino a {name}', { name: buildingLabel(t) }));
        const back = findRoute(route.slice(-1), accessTiles(cop));
        const st = game.buildings.get(cop.id);
        if (back && st) spawnVehicle({ kind: 'police', from: cop.id, tiles: back, pts: routePoints(back, false), speed: POLICE.carSpeed * 0.7, color: '#f4f4f4', calm: true, arrive() {}, cancel() {} });
      },
      cancel() {} });
    for (const h of game.buildings.values()) if (h.kind === 'house' && distToBuilding(h, t.ax, t.ay) <= CRIME.radius / 2) h.crimeT = Math.max(h.crimeT || 0, CRIME.memory / 3);
    return;
  }
  // senza polizia: il ladro scappa con i soldi e il quartiere ha paura
  const amount = Math.min(CRIME.stealMax, CRIME.stealMin + Math.round(game.population * CRIME.stealPer));
  game.money -= amount; C.stolen += amount;
  if (typeof noteMoney === 'function') noteMoney('thefts', -amount);
  for (const h of game.buildings.values()) if (h.kind === 'house' && distToBuilding(h, t.ax, t.ay) <= CRIME.radius) h.crimeT = CRIME.memory;
  toast(TR('Furto a {name}: rubati {m}. Una stazione di polizia vicina li fermerebbe.', { name: buildingLabel(t), m: money(amount) }));
  updateHud();
}
// il ladro: omino vestito a righe con il sacco, esce dall'edificio e scappa veloce
function spawnThief(t) {
  const doors = pedDoors(t);
  if (!doors.length) return null;
  const walk = planWalk({ b: t, doors }, w => w === t ? 0 : 1, 5);
  if (!walk) return null;
  const p = newPed(pedPoints(walk));
  Object.assign(p, { thief: true, shirt: '#2b2b33', pants: '#1b1b20', hair: '#1b1b1b', bag: true, speed: PEDS.speed * 1.9 });
  peds.push(p);
  return p;
}

let happyTimer = 0;
function cityUpdate(dt) {
  if ((happyTimer -= dt) <= 0) { happyTimer = HAPPY.every; updateHappiness(); }
  crimeTick(dt);
  // senza municipio le tasse tornano quelle di partenza
  if (game.taxRate != null && !townHallOf()) game.taxRate = null;
}

// ---- pannello ----
function happyFactorRows(box, why) {
  const keys = Object.keys(HAPPY_LABELS).filter(k => why[k]);
  keys.sort((a, b) => why[a] - why[b]);
  const list = el('div', 'phappy-list');
  for (const k of keys) {
    const v = why[k];
    const r = el('div', 'phappy-row');
    r.append(el('span', null, TR(HAPPY_LABELS[k])), el('b', v > 0 ? 'up' : 'down', (v > 0 ? '+' : '') + v));
    list.appendChild(r);
  }
  box.appendChild(list);
}
function happyBar(box, valueFn, label) {
  const w = el('div', 'phappy');
  const head = el('div', 'phappy-head');
  head.append(el('span', null, label), liveText('b', null, () => { const v = valueFn(); return v == null ? '-' : Math.round(v) + '%'; }));
  const b = el('div', 'pbar'), f = el('div', 'pbar-fill');
  const upd = () => { const v = valueFn() ?? 0; f.style.width = Math.round(v) + '%'; f.style.background = happyColor(v); head.lastChild.style.color = happyColor(v); };
  upd(); panelLive.push(upd);
  b.appendChild(f);
  w.append(head, b);
  box.appendChild(w);
}
// casa: felicità con i pezzi che la fanno salire e scendere
function houseHappySection(box, h) {
  happyBar(box, () => h.happy, TR('Felicità'));
  if (h.happyWhy) happyFactorRows(box, h.happyWhy);
}
// municipio: tasse e felicità di tutta la città
function townHallSection(box, b) {
  box.appendChild(el('div', 'plabel', TR('Tasse sulle vendite')));
  const row = el('div', 'ptax');
  const minus = el('button', 'pstep', '−'), plus = el('button', 'pstep', '+');
  const set = d => { game.taxRate = Math.round(Math.max(TAX.min, Math.min(TAX.max, taxRate() + d)) * 100) / 100; game.dirty = true; updateHappiness(); renderPanel(); };
  minus.addEventListener('click', () => set(-TAX.step)); plus.addEventListener('click', () => set(TAX.step));
  const pct = Math.round(taxRate() * 100);
  row.append(minus, el('b', 'ptax-v', pct + '%'), plus);
  const eff = Math.round((TAX_RATE - taxRate()) * 60);
  row.appendChild(el('span', 'ptax-eff ' + (eff > 0 ? 'up' : eff < 0 ? 'down' : ''), TR('Felicità {n}', { n: (eff > 0 ? '+' : '') + eff })));
  box.appendChild(row);
  box.appendChild(el('div', 'pnote', TR('Più tasse = più soldi dai negozi, ma la gente è meno felice. Si parte dal {n}%.', { n: Math.round(TAX_RATE * 100) })));
  box.appendChild(el('div', 'plabel', TR('La città')));
  happyBar(box, () => game.happy, TR('Felicità media'));
  happyFactorRows(box, cityHappyWhy());
  const C = cityState();
  box.appendChild(liveText('div', 'pnote', () => TR('Furti: {a} - ladri arrestati: {b} - soldi rubati: {m}', { a: C.thefts, b: C.caught, m: money(C.stolen) })));
}
function policeSection(box, b) {
  const n = () => [...game.buildings.values()].filter(h => (h.kind === 'house' || SHOPS[h.kind]) && distToBuilding(b, h.ax, h.ay) <= POLICE.radius).length;
  box.appendChild(liveText('div', 'pnote', () => TR('Protegge {n} case e negozi entro {r} tile.', { n: n(), r: POLICE.radius })));
  const C = cityState();
  box.appendChild(liveText('div', 'pnote', () => TR('Ladri arrestati in città: {n}', { n: C.caught })));
}
// zona protetta dalla polizia (con la stazione in mano o selezionata): fArea in render.js

// ---- disegno ----
// Municipio: palazzo color pietra con il portico a colonne, la torre dell'orologio e la bandiera
function drawTownHall(c, ax, ay, base, r) {
  groundRect(c, ax, ay, base, [0.05, 0.05, 1.95, 1.95], r, '#c9c4b6');
  const stone = { l: '#efe6cf', r: '#d4c8a8', t: '#c9bfa5' }, white = { l: '#f8f6f0', r: '#dcd8cc', t: '#ffffff', plain: true };
  const glass = '#7fb0cf';
  const win = (face, list, z0, z1) => list.map(a => ({ face, a, b: a + 0.14, z0, z1, color: glass }));
  const cols = [0.52, 0.8, 1.12, 1.4].map(u => ({ box: [u, 1.36, u + 0.08, 1.44], h: 13, z: 2, col: white }));
  // orologio: un quadrante su ogni faccia della torre che guarda lo schermo, disegnato nel piano della faccia
  const clocks = (bx, top) => {   // bx già girato: le facce visibili sono +u e +v
    if (!DETAIL) return;
    const cu = (bx[0] + bx[2]) / 2, cv = (bx[1] + bx[3]) / 2, zc = top - 5 / STEP, R = 0.09, RZ = 2.6 / STEP;
    // un quadrante solo (con due sembravano due occhi): sul lato del portico se si vede, se no di fianco
    const vis = n => (n[0] === 0 && n[1] === 1) || (n[0] === 1 && n[1] === 0);
    const face = [rotVec(0, 1, r), rotVec(1, 0, r), rotVec(-1, 0, r)].find(vis);
    for (const [nu, nv] of [face]) {
      const fu = nu ? bx[2] + 0.002 : cu, fv = nv ? bx[3] + 0.002 : cv, tu = nv ? 1 : 0, tv = nu ? 1 : 0;
      const P = (a, z) => iso(ax, ay, fu + tu * a, fv + tv * a, zc + z);
      const ring = []; for (let k = 0; k < 18; k++) { const t = k / 18 * Math.PI * 2; ring.push(P(Math.cos(t) * R, Math.sin(t) * RZ)); }
      poly(c, ring, '#ffffff'); c.strokeStyle = '#3a3a40'; c.lineWidth = 0.6;
      c.beginPath(); ring.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); c.stroke();
      const t = animT * 0.2, o = P(0, 0), m = P(Math.cos(t) * R * 0.75, Math.sin(t) * RZ * 0.75), h = P(0, RZ * 0.55);
      c.beginPath(); c.moveTo(o[0], o[1]); c.lineTo(m[0], m[1]); c.moveTo(o[0], o[1]); c.lineTo(h[0], h[1]); c.stroke();
    }
  };
  drawParts2(c, ax, ay, base, r, [
    { box: [0.15, 0.2, 1.85, 1.28], h: 18, col: stone, doors: [
      { face: '+v', a: 0.88, b: 1.12, z1: 10, color: '#5a3d2b' },
      ...win('+v', [0.25, 1.61], 4, 10), ...win('+v', [0.25, 0.55, 0.88, 1.31, 1.61], 12, 16),
      ...win('-v', [0.25, 0.55, 0.88, 1.21, 1.51], 4, 10), ...win('-v', [0.25, 0.55, 0.88, 1.21, 1.51], 12, 16),
      ...win('+u', [0.35, 0.67, 0.99], 4, 10), ...win('+u', [0.35, 0.67, 0.99], 12, 16),
      ...win('-u', [0.35, 0.67, 0.99], 4, 10), ...win('-u', [0.35, 0.67, 0.99], 12, 16),
    ] },
    { group: [
      { box: [0.42, 1.28, 1.58, 1.58], h: 2, col: { l: '#d8d2c2', r: '#bdb6a6', t: '#e6e1d4', plain: true } },   // scalini
      ...cols,
      { box: [0.44, 1.28, 1.56, 1.5], h: 3, z: 15, col: stone, roof: { rh: 4, back: '#b9ad8e', roof: '#c9bfa5', gable: '#e6dcc0' } },   // frontone sopra le colonne
    ] },
    { box: [0.78, 0.5, 1.22, 0.94], h: 16, z: 18, col: stone, roof: { rh: 7, back: '#4f6b8a', roof: '#5f7fa3', gable: '#d4c8a8' }, after: clocks },
    // asta della bandiera sulla punta del tetto della torre (sul tetto grande in una rotazione finiva davanti alla torre)
    { box: [0.98, 0.7, 1.02, 0.74], h: 9, z: 37, col: { l: '#9aa0a8', r: '#7d838b', t: '#b4bac2', plain: true },
      after(bx, top) {   // bandiera che sventola
        const p = iso(ax, ay, bx[2], bx[3], top);
        const w = Math.sin(animT * 3) * 0.6; animSeen = true;
        c.fillStyle = '#3f6fd9'; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0] + 6, p[1] + 1 + w); c.lineTo(p[0] + 6, p[1] + 4 + w); c.lineTo(p[0], p[1] + 3); c.closePath(); c.fill();
        c.fillStyle = '#ffd966'; c.fillRect(p[0] + 2.3, p[1] + 1.6 + w * 0.5, 1.4, 1.2);
      } },
  ]);
}
// Stazione di polizia: edificio bianco con la fascia blu su tutti i lati, il distintivo, le luci sul
// tetto e la volante parcheggiata davanti (la stessa auto che gira per le strade, drawVehicle)
function drawPolice(c, ax, ay, base, r) {
  groundRect(c, ax, ay, base, [0.1, 1.28, 1.9, 1.95], r, '#55585f');
  const blue = { l: '#2f55b0', r: '#24448e', t: '#3f6fd9', plain: true };
  const glass = '#9fc4e0', band = '#2f55b0';
  const win = (face, list) => list.map(a => ({ face, a, b: a + 0.18, z0: 4, z1: 9, color: glass }));
  const blink = Math.floor(animT * 3) % 2;
  if (DETAIL) animSeen = true;
  const red = blink ? { l: '#ff4d4d', r: '#d93636', t: '#ff8080', plain: true } : { l: '#5a2020', r: '#4a1a1a', t: '#6a2a2a', plain: true };
  const blu = blink ? { l: '#2a3d70', r: '#22325c', t: '#2a3d70', plain: true } : { l: '#4d7dff', r: '#365ed9', t: '#80a4ff', plain: true };
  const fwd = rotVec(1, 0, r);
  drawParts2(c, ax, ay, base, r, [
    { box: [0.15, 0.15, 1.85, 1.2], h: 16, col: { l: '#e9eef3', r: '#c7cfd8', t: '#8a919c' }, doors: [
      { face: '+v', a: 0.15, b: 1.85, z0: 11, z1: 13, color: band }, { face: '-v', a: 0.15, b: 1.85, z0: 11, z1: 13, color: band },
      { face: '+u', a: 0.15, b: 1.2, z0: 11, z1: 13, color: band }, { face: '-u', a: 0.15, b: 1.2, z0: 11, z1: 13, color: band },
      { face: '+v', a: 0.35, b: 0.7, z1: 9, color: '#2b3f6b' },
      ...win('+v', [0.85, 1.15, 1.45]), ...win('-v', [0.35, 0.65, 0.95, 1.25, 1.55]),
      ...win('+u', [0.3, 0.75]), ...win('-u', [0.3, 0.75]),
    ] },
    { box: [0.7, 0.95, 1.3, 1.08], h: 4, z: 16, col: blue, after(bx, top) {   // insegna con il distintivo, sulla faccia che si vede
      if (!DETAIL) return;
      const n = rotVec(0, 1, r), seen = (n[0] === 0 && n[1] === 1) || (n[0] === 1 && n[1] === 0);
      if (!seen) return;
      const fu = n[0] > 0 ? bx[2] : (bx[0] + bx[2]) / 2, fv = n[1] > 0 ? bx[3] : (bx[1] + bx[3]) / 2;
      const p = iso(ax, ay, fu, fv, top - 2 / STEP);
      c.fillStyle = '#ffd966'; c.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 0.8 : 1.8; c.lineTo(p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr); }
      c.closePath(); c.fill();
    } },
    { box: [0.4, 0.4, 0.52, 0.52], h: 2, z: 16, col: red },
    { box: [0.56, 0.4, 0.68, 0.52], h: 2, z: 16, col: blu },
    { box: [1.4, 0.35, 1.44, 0.39], h: 10, z: 16, col: { l: '#9aa0a8', r: '#7d838b', t: '#b4bac2', plain: true } },   // antenna
    { box: [1.22, 1.5, 1.78, 1.74], h: 7, draw(b) {   // volante parcheggiata davanti (vera auto della polizia)
      const mx = ax + (b[0] + b[2]) / 2, my = ay + (b[1] + b[3]) / 2;
      drawVehicle(c, { kind: 'police', color: '#f4f4f4', calm: true, pos: { mx, my, h: base }, pts: [[mx, my], [mx + fwd[0], my + fwd[1]]], seg: 0 });
    } },
  ]);
}
// luci della sirena sull'auto della polizia (drawVehicle): rossa e blu che si alternano
function drawSirenLights(c, v, mx, my, h, f, sd) {
  if (!DETAIL) return;
  animSeen = true;
  const on = v.calm ? -1 : Math.floor(animT * 6) % 2;
  for (const [w, col] of [[-0.05, on === 0 ? '#ff4d4d' : '#6a2a2a'], [0.05, on === 1 ? '#4d7dff' : '#2a3d70']]) {
    const p = iso(0, 0, mx + sd[0] * w, my + sd[1] * w, h + 8 / STEP);
    c.fillStyle = v.calm ? (w < 0 ? '#c94040' : '#3f6fd9') : col; c.fillRect(p[0] - 0.8, p[1] - 0.6, 1.6, 1.2);
    if (!v.calm && ((w < 0 && on === 0) || (w > 0 && on === 1))) { c.fillStyle = w < 0 ? 'rgba(255,80,80,0.35)' : 'rgba(80,130,255,0.35)'; c.beginPath(); c.arc(p[0], p[1], 3.2, 0, Math.PI * 2); c.fill(); }
  }
}
