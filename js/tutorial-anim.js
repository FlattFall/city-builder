// ---------- Animazioni del tutorial (richiesta dell'utente: il tutorial deve far vedere cosa fare) ----------
// Ogni passo ha una scena animata in loop, disegnata con le STESSE funzioni del gioco (drawHouse, drawFarm,
// drawRoad, drawVehicle...): una mano prende lo strumento, lo porta sulla mappa (anteprima trasparente,
// verde = va bene, rossa = no), clicca e si vede il risultato (auto, acqua nei tubi, fili, campi, furgone).
// Sotto la scena tre righe numerate dicono cosa sta succedendo: quella in corso è accesa (onPhase).
const TA = { W: 330, H: 230, S: 1.55 };
let taT = 0, taC = null, taG = { w: 6, h: 4 }, taO = [0, 0];
let taEnts = [], taOver = [], taKeys = [], taClicks = [], taTools = [], taHolds = [];
const taImgs = {};
function taImg(id) {
  if (!taImgs[id] && ICONS[id]) { taImgs[id] = new Image(); taImgs[id].src = ICONS[id]; }
  return taImgs[id];
}
const taK = (t0, d) => Math.max(0, Math.min(1, (taT - t0) / d));
const taEase = f => f * f * (3 - 2 * f);
const taBack = f => { const s = 1.9; f -= 1; return f * f * ((s + 1) * f + s) + 1; };   // rimbalzo quando compare
const taW = (x, y, h = 0) => iso(0, 0, x, y, h);
const taScr = (sx, sy) => [(sx - taO[0]) / TA.S, (sy - taO[1]) / TA.S];   // punto dello schermo -> coordinate della scena

// Avvia l'animazione del passo `kind` nel canvas; onPhase(i) dice quale riga è in corso. Restituisce lo stop.
function startTutAnim(cv, kind, onPhase) {
  const c = cv.getContext('2d');
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  cv.width = TA.W * dpr; cv.height = TA.H * dpr;
  const sc = TA_SCENES[kind] || TA_SCENES.intro;
  let raf = 0, t0 = performance.now(), stopped = false, last = 0, phase = -1;
  const frame = now => {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    if (now - last < 30) return;   // ~30 fotogrammi al secondo bastano
    last = now;
    const t = window.TA_FIXED_T != null ? window.TA_FIXED_T : ((now - t0) / 1000) % sc.dur;   // TA_FIXED_T: per le prove
    const sD = DETAIL, sF = FINE, sA = animT, sS = animSeen;
    try {
      DETAIL = true; FINE = true; animT = now / 1000;
      taFrame(c, dpr, sc, t);
    } catch (e) { if (window.TA_DEBUG) console.error(e); /* una scena non deve rompere il gioco */ }
    DETAIL = sD; FINE = sF; animT = sA; animSeen = sS;
    c.setTransform(1, 0, 0, 1, 0, 0);
    const ph = (sc.ph || []).filter(x => t >= x).length;
    if (ph !== phase) { phase = ph; if (onPhase) onPhase(ph); }
  };
  raf = requestAnimationFrame(frame);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}

function taFrame(c, dpr, sc, t) {
  taC = c; taT = t; taG = sc.grid || { w: 6, h: 4 };
  taEnts = []; taOver = []; taKeys = []; taClicks = []; taTools = []; taHolds = [];
  taO = [TA.W / 2 - (taG.w - taG.h) * TW / 4 * TA.S, sc.oy || 58];
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.globalAlpha = 1; c.setLineDash([]); c.lineCap = 'butt';
  const g = c.createLinearGradient(0, 0, 0, TA.H); g.addColorStop(0, '#20263f'); g.addColorStop(1, '#151827');
  c.fillStyle = g; c.fillRect(0, 0, TA.W, TA.H);
  c.setTransform(dpr * TA.S, 0, 0, dpr * TA.S, dpr * taO[0], dpr * taO[1]);
  c.imageSmoothingEnabled = false;
  c.save(); sc.draw(t); c.restore();                    // terreno subito, edifici e veicoli in taEnts
  taEnts.sort((a, b) => a.d - b.d);
  for (const e of taEnts) { c.save(); e.f(); c.restore(); }
  for (const f of taOver) { c.save(); f(); c.restore(); }
  taDrawHand();
  c.setTransform(dpr, 0, 0, dpr, 0, 0);                 // da qui coordinate dello schermo
  c.save(); taDrawToolBtn(); if (sc.ui) sc.ui(t); c.restore();
  const fade = Math.max(1 - t / 0.35, (t - (sc.dur - 0.4)) / 0.4);   // dissolvenza tra un giro e l'altro
  if (fade > 0) { c.fillStyle = 'rgba(21,24,39,' + Math.min(1, fade).toFixed(2) + ')'; c.fillRect(0, 0, TA.W, TA.H); }
}

// ---- terreno ----
const TA_GRASS = ['#5aa838', '#60b03d'], TA_EARTH = ['#8a5a32', '#6b4428'], TA_SEA = ['#3a7fc4', '#2a5f9c', '#234f85'];
// kind(x, y) -> 'grass' | 'road-x' | 'road-y' | 'sea' | 'soil' | 'void' | colore; height(x, y) = quota
function taGround(kind, height) {
  const c = taC, H = (x, y) => (x < 0 || y < 0 || x >= taG.w || y >= taG.h) ? null : (kind(x, y) === 'void' ? null : (height ? height(x, y) : 0));
  for (let y = 0; y < taG.h; y++) for (let x = 0; x < taG.w; x++) {
    const k = kind(x, y), h = H(x, y);
    if (h == null) continue;
    const P = (u, v) => iso(x, y, u, v, h), sea = k === 'sea';
    // scarpate verso i tile più bassi (o il bordo del plastico)
    const wall = (hn, a, b, col) => { const low = hn == null ? h - 0.75 : hn; if (low < h) poly(c, [iso(x, y, a[0], a[1], h), iso(x, y, b[0], b[1], h), iso(x, y, b[0], b[1], low), iso(x, y, a[0], a[1], low)], col); };
    wall(H(x, y + 1), [0, 1], [1, 1], sea ? TA_SEA[1] : TA_EARTH[0]);
    wall(H(x + 1, y), [1, 1], [1, 0], sea ? TA_SEA[2] : TA_EARTH[1]);
    const q = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
    if (k === 'road-x' || k === 'road-y') {
      poly(c, q, ROAD_COLOR);
      drawRoad(c, P, k === 'road-x' ? [false, true, false, true] : [true, false, true, false], x, y, true);
    } else if (sea) {
      poly(c, q, TA_SEA[0]);
      for (let i = 0; i < 2; i++) {   // increspature
        const f = (hash(x, y, i) + animT * 0.12) % 1, v = 0.25 + 0.5 * hash(x, y, i + 5), p = P(0.15 + f * 0.6, v);
        c.fillStyle = 'rgba(190,225,255,' + (0.6 * Math.sin(f * Math.PI)).toFixed(2) + ')'; c.fillRect(p[0], p[1], 3, 0.6);
      }
    } else if (k === 'soil') {
      poly(c, q, SOIL);
    } else if (k === 'grass') {
      poly(c, q, TA_GRASS[(x + y) & 1]);
      c.fillStyle = '#4c9530';
      for (let i = 0; i < 3; i++) { const p = P(0.15 + 0.7 * hash(x, y, i), 0.15 + 0.7 * hash(x, y, i + 9)); c.fillRect(p[0], p[1], 0.8, 1.2); }
    } else poly(c, q, k);
    aline(c, q[0], q[1], '#000000', 0.07); aline(c, q[0], q[3], '#000000', 0.07);
  }
}
function taTileTint(x, y, col, h = 0, inset = 0.06) {
  const a = inset, b = 1 - inset;
  poly(taC, [iso(x, y, a, a, h), iso(x, y, b, a, h), iso(x, y, b, b, h), iso(x, y, a, b, h)], col);
}
function taOutline(x, y, w, hgt, col, h = 0) {
  const c = taC, q = [iso(x, y, 0, 0, h), iso(x, y, w, 0, h), iso(x, y, w, hgt, h), iso(x, y, 0, hgt, h)];
  c.strokeStyle = col; c.lineWidth = 1.1; c.setLineDash([2.5, 1.5]); c.lineDashOffset = -animT * 6;
  c.beginPath(); c.moveTo(...q[0]); for (const p of q.slice(1)) c.lineTo(...p); c.closePath(); c.stroke(); c.setLineDash([]);
}

// ---- edifici (funzioni vere del gioco) ----
const TA_B = {
  house: { s: 1, f: (c, x, y, h, o) => drawHouse(c, x, y, h, o.v || 0, o.rot || 0) },
  waterWell: { s: 1, f: (c, x, y, h) => drawWaterWell(c, x, y, h, 0) },
  pylon: { s: 1, f: (c, x, y, h) => drawPylon(c, x, y, h, false) },
  substation: { s: 1, f: (c, x, y, h, o) => drawSubstation(c, x, y, h, o.rot || 0) },
  farm: { s: 2, g: GROUND.farm, f: (c, x, y, h, o) => drawFarm(c, x, y, h, o.rot || 0) },
  supermarket: { s: 2, g: GROUND.supermarket, f: (c, x, y, h, o) => drawSupermarket(c, x, y, h, o.rot || 0) },
  factory: { s: 2, g: GROUND.factory, f: (c, x, y, h, o) => drawFactory(c, x, y, h, o.rot || 0) },
  sewage: { s: 2, g: '#9a9a92', f: (c, x, y, h, o) => { drawSewage(c, x, y, h, o.rot || 0, o.flow || 0); if (sewageBackFront(o.rot || 0)) drawSewagePipe(c, { ax: x, ay: y, rot: o.rot || 0, flow: o.flow || 0 }, h); } },
};
// Edificio che compare al clic `tc`: prima l'anteprima trasparente (verde, o rossa con o.bad), poi il rimbalzo
function taBld(kind, x, y, tc, o = {}) {
  const B = TA_B[kind], c = taC, h = o.h || 0, t = taT, s = B.s;
  if (tc == null) tc = -9;
  const gFrom = o.gFrom != null ? o.gFrom : tc - 0.7, gTo = o.gTo != null ? o.gTo : tc;
  const built = !o.bad && t >= tc;
  if (!built && (t < gFrom || t >= gTo)) return false;
  const anchor = iso(x, y, s / 2, s / 2, h);
  taEnts.push({ d: x + y + 2 * (s - 1) + (o.dz || 0), f: () => {
    if (!built) {   // anteprima
      const a = Math.min(1, (t - gFrom) / 0.25);
      c.globalAlpha = a; taOutline(x, y, s, s, o.bad ? '#ff5a5a' : '#8dff6a', h);
      poly(c, [iso(x, y, 0, 0, h), iso(x, y, s, 0, h), iso(x, y, s, s, h), iso(x, y, 0, s, h)], o.bad ? 'rgba(255,70,70,0.3)' : 'rgba(120,255,90,0.25)');
      c.globalAlpha = 0.55 * a; B.f(c, x, y, h, o); c.globalAlpha = a;
      if (o.bad) { const p = iso(x, y, s / 2, s / 2, h + 2.4); c.lineCap = 'round'; c.strokeStyle = '#141826'; c.lineWidth = 3.4; const X = () => { c.beginPath(); c.moveTo(p[0] - 4, p[1] - 4); c.lineTo(p[0] + 4, p[1] + 4); c.moveTo(p[0] + 4, p[1] - 4); c.lineTo(p[0] - 4, p[1] + 4); c.stroke(); }; X(); c.strokeStyle = '#ff5a5a'; c.lineWidth = 2; X(); }
      return;
    }
    const f = Math.min(1, (t - tc) / 0.4);
    if (B.g) for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) taTileTint(x + i, y + j, B.g, h, 0);
    if (f < 1) {   // polvere e rimbalzo
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, r = (6 + 9 * f) * s; c.fillStyle = 'rgba(230,220,200,' + (0.7 * (1 - f)).toFixed(2) + ')'; c.beginPath(); c.arc(anchor[0] + Math.cos(a) * r, anchor[1] + Math.sin(a) * r * 0.5, 2.2 * (1 - f) + 0.6, 0, Math.PI * 2); c.fill(); }
      const k = 0.35 + 0.65 * taBack(f);
      c.translate(anchor[0], anchor[1]); c.scale(k, k); c.translate(-anchor[0], -anchor[1]);
    }
    B.f(c, x, y, h, o);
  } });
  return built;
}

// ---- veicoli e passanti (disegno vero del gioco) ----
function taVehicle(kind, mx, my, dx, col, alpha = 1) {
  if (alpha <= 0) return;
  taEnts.push({ d: mx + my - 0.6, f: () => { taC.globalAlpha = alpha; drawVehicle(taC, { kind, pos: { mx, my, h: 0 }, pts: [[0, 0], [dx, 0]], seg: 0, color: col, stripe: '#3fa34d' }); } });
}
// veicolo che va da x0 a x1 lungo la strada in riga `row` (tiene la destra) tra t0 e t0 + d; sparisce piano all'arrivo
function taDrive(kind, row, x0, x1, t0, d, col) {
  if (taT < t0 || taT > t0 + d + 0.5) return 0;
  const f = taK(t0, d), dir = x1 > x0 ? 1 : -1, x = x0 + (x1 - x0) * (f < 0.8 ? f / 0.8 * 0.88 : 0.88 + 0.12 * taEase((f - 0.8) / 0.2));
  taVehicle(kind, x, row + 0.5 + 0.2 * dir, dir, col, Math.min(1, (taT - t0) / 0.3, (t0 + d + 0.5 - taT) / 0.4));
  return f;
}
function taPed(mx, my, dx, i) {
  const cols = [['#d94141', '#2b3a67'], ['#3f6fd9', '#3b3b3b'], ['#e8c23a', '#5a3d2b'], ['#3fa34d', '#2b2b33']][i % 4];
  taEnts.push({ d: mx + my - 0.6, f: () => drawPed(taC, { pos: { mx, my, h: 0 }, pts: [[0, 0], [dx, 0]], seg: 0, step: taT * 9 + i, shirt: cols[0], pants: cols[1], skin: '#f1c9a5' }) });
}

// ---- scritte e segni sopra la scena ----
function taFloat(x, y, h, text, t0, col = '#a7f070') {   // scritta che sale e svanisce
  const f = taK(t0, 1.4); if (f <= 0 || f >= 1) return;
  taOver.push(() => { const c = taC, p = iso(0, 0, x, y, h); c.globalAlpha = f < 0.15 ? f / 0.15 : 1 - Math.max(0, (f - 0.6) / 0.4);
    c.font = 'bold 8px monospace'; c.textAlign = 'center'; c.lineJoin = 'round'; c.lineWidth = 2.2; c.strokeStyle = '#141826'; c.strokeText(text, p[0], p[1] - f * 12); c.fillStyle = col; c.fillText(text, p[0], p[1] - f * 12); });
}
function taIcon(st, x, y, hpx, until) {   // icona di stato sopra un edificio (pulsa); sparisce a `until`
  if (until != null && taT >= until + 0.3) return;
  taOver.push(() => { const c = taC, p = iso(0, 0, x, y, 0), k = until != null && taT >= until ? 1 - (taT - until) / 0.3 : 1;
    const s = (1 + 0.12 * Math.sin(taT * 6)) * k; c.translate(p[0], p[1] - hpx); c.scale(s, s); drawStatusIcon(c, st, 0, 0); });
}
function taCheck(x, y, hpx, t0) {   // spunta verde
  if (taT < t0) return;
  taOver.push(() => { const c = taC, p = iso(0, 0, x, y, 0), s = taBack(Math.min(1, (taT - t0) / 0.3));
    c.translate(p[0], p[1] - hpx); c.scale(s, s); c.fillStyle = '#3fa34d'; c.strokeStyle = '#141826'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, 5.5, 0, Math.PI * 2); c.fill(); c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-2.6, 0.2); c.lineTo(-0.7, 2.2); c.lineTo(2.8, -2); c.stroke(); });
}
function taLabel(x, y, h, text, col = '#ffd966') {   // etichetta fissa
  taOver.push(() => { const c = taC, p = iso(0, 0, x, y, h); c.font = 'bold 6.5px monospace'; const w = c.measureText(text).width + 6;
    p[0] = Math.max((4 - taO[0]) / TA.S + w / 2, Math.min((TA.W - 4 - taO[0]) / TA.S - w / 2, p[0]));
    c.fillStyle = 'rgba(20,24,40,0.88)'; c.fillRect(p[0] - w / 2, p[1] - 5.5, w, 10); c.strokeStyle = col; c.lineWidth = 0.6; c.strokeRect(p[0] - w / 2, p[1] - 5.5, w, 10);
    c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, p[0], p[1] - 0.3); c.textBaseline = 'alphabetic'; });
}
// linea che avanza lungo dei punti (tubi, cavi): f 0..1 = quanta se ne vede; poi palline che corrono
function taFlowLine(pts, f, col, width, dots, dotCol) {
  if (f <= 0) return;
  f = Math.min(1, f);
  taOver.push(() => { const c = taC; let tot = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); tot += l; }
    const at = d => { for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const k = Math.min(1, d / seg[i]); return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]; } d -= seg[i]; } };
    c.strokeStyle = col; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(...pts[0]);
    let done = 0; const want = tot * f;
    for (let i = 0; i < seg.length; i++) { if (done + seg[i] <= want) { c.lineTo(...pts[i + 1]); done += seg[i]; } else { c.lineTo(...at(want)); break; } }
    c.stroke();
    if (dots) for (let i = 0; i < dots; i++) { const d = ((taT * 0.45 + i / dots) % 1) * tot; if (d > want) continue; const p = at(d); c.fillStyle = dotCol; c.beginPath(); c.arc(p[0], p[1], width * 0.75, 0, Math.PI * 2); c.fill(); }
  });
}
function taBolt(c, col) { c.fillStyle = col; c.strokeStyle = '#141826'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(1, -6); c.lineTo(-3.4, 0.8); c.lineTo(-0.4, 0.8); c.lineTo(-1.6, 6); c.lineTo(3.4, -1.2); c.lineTo(0.4, -1.2); c.closePath(); c.fill(); c.stroke(); }

// ---- la mano ----
// copione: taPick (va sul pulsante e lo preme), taTap (va su un tile e clicca), taGo (va e basta), taDrag (trascina)
const TA_BTN = [34, TA.H - 26];
let taCur = 0;   // tempo dell'ultima mossa del copione
const taLast = () => taKeys[taKeys.length - 1].slice(1);
function taStart(t0 = 0.4) { taCur = t0; taKeys.push([0, ...taScr(TA.W - 46, TA.H - 30)]); }
function taPick(tool) {
  taKeys.push([taCur, ...taLast()], [taCur + 0.65, ...taScr(TA_BTN[0] + 6, TA_BTN[1] + 4)]);
  taClicks.push(taCur + 0.8); taTools.push([taCur + 0.8, tool]);
  taCur += 1.05;
  return taCur - 0.25;
}
function taGo(x, y, move = 0.8, h = 0) { taKeys.push([taCur, ...taLast()], [taCur + move, ...iso(0, 0, x, y, h)]); taCur += move; return taCur; }
function taTap(x, y, move = 0.8, h = 0) { taGo(x, y, move, h); taClicks.push(taCur + 0.15); taCur += 0.4; return taCur - 0.25; }
function taTapScr(sx, sy, move = 0.8) { taKeys.push([taCur, ...taLast()], [taCur + move, ...taScr(sx, sy)]); taCur += move; taClicks.push(taCur + 0.15); taCur += 0.4; return taCur - 0.25; }
function taDrag(tiles, per = 0.17, h = 0) {   // restituisce il momento in cui passa su ogni tile
  const times = []; taGo(tiles[0][0] + 0.5, tiles[0][1] + 0.5, 0.7, h);
  const from = taCur + 0.1; taCur += 0.25;
  for (const [x, y] of tiles) { taKeys.push([taCur, ...iso(0, 0, x + 0.5, y + 0.5, h)]); times.push(taCur); taCur += per; }
  taHolds.push([from, taCur]); taCur += 0.25;
  return times;
}
function taHandPos() {
  const K = taKeys; if (!K.length) return null;
  if (taT <= K[0][0]) return [K[0][1], K[0][2]];
  for (let i = 1; i < K.length; i++) if (taT <= K[i][0]) { const a = K[i - 1], b = K[i], d = b[0] - a[0], f = d > 0 ? taEase((taT - a[0]) / d) : 1;
    const arc = Math.sin(f * Math.PI) * Math.min(7, Math.hypot(b[1] - a[1], b[2] - a[2]) * 0.12);   // leggero arco: sembra una mano vera
    return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f - arc]; }
  return [K[K.length - 1][1], K[K.length - 1][2]];
}
function taDrawHand() {
  const p = taHandPos(); if (!p) return;
  const c = taC, t = taT;
  const press = taClicks.some(k => t >= k - 0.07 && t < k + 0.14) || taHolds.some(h => t >= h[0] && t < h[1]);
  for (const k of taClicks) { const f = (t - k) / 0.45; if (f > 0 && f < 1) { c.strokeStyle = 'rgba(255,217,102,' + (1 - f).toFixed(2) + ')'; c.lineWidth = 1.4 * (1 - f) + 0.4; c.beginPath(); c.ellipse(p[0], p[1], 2 + f * 9, 1 + f * 4.5, 0, 0, Math.PI * 2); c.stroke(); } }
  c.save(); c.translate(p[0], p[1] + (press ? 1 : 0)); const s = press ? 0.68 : 0.78; c.scale(s, s);
  c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(5, 21, 8, 2.6, 0, 0, Math.PI * 2); c.fill();
  // mano con l'indice puntato (punta in 0,0), guanto bianco con il polsino
  c.lineJoin = 'round'; c.fillStyle = '#ffffff'; c.strokeStyle = '#1a1c2c'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(-1.6, 1.5); c.quadraticCurveTo(-1.6, -0.4, 0.3, -0.4); c.quadraticCurveTo(2.2, -0.4, 2.2, 1.5); c.lineTo(2.2, 7.5);
  c.lineTo(8.6, 8.6); c.quadraticCurveTo(11.6, 9.3, 11.4, 12.2); c.lineTo(10.8, 17.6); c.lineTo(0.2, 17.6); c.lineTo(-4.8, 12.4); c.quadraticCurveTo(-5.8, 10.6, -4, 9.8); c.quadraticCurveTo(-2.6, 9.4, -1.6, 10.6); c.closePath(); c.fill(); c.stroke();
  c.lineWidth = 0.8; c.strokeStyle = '#b9bfd0'; c.beginPath(); c.moveTo(5.2, 9); c.lineTo(5.2, 12.2); c.moveTo(8.2, 9.6); c.lineTo(8.2, 12.4); c.stroke();
  c.fillStyle = '#3f6fd9'; c.strokeStyle = '#1a1c2c'; c.lineWidth = 1.5; c.beginPath(); c.rect(0.2, 17.6, 10.6, 3.4); c.fill(); c.stroke();
  c.restore();
}
// pulsante dello strumento in basso a sinistra, come nella barra del gioco: icona + nome
function taDrawToolBtn() {
  if (!taTools.length) return;
  const c = taC, t = taT;
  let cur = null, tOn = 0;
  for (const [tt, id] of [...taTools].sort((a, b) => a[0] - b[0])) if (t >= tt) { cur = id; tOn = tt; }
  const next = taTools.find(x => x[0] > t && !x[2]), show = !cur || (next && next[0] - t < 0.9) ? next[1] : cur;   // la mano sta arrivando: si vede il prossimo
  const isOn = show === cur, x = 8, y = TA.H - 46, bump = isOn && t - tOn < 0.18 ? 1.5 : 0;
  const name = (TOOL_INFO[show] ? TOOL_INFO[show].label : '').replace(/\s*\(.*\)/, '');
  let fs = 11; c.font = 'bold 11px monospace';
  while (fs > 8 && c.measureText(name).width > 150) { fs--; c.font = 'bold ' + fs + 'px monospace'; }
  const w = 52 + c.measureText(name).width + 10;
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x + 2, y + 3, w, 38);
  c.fillStyle = isOn ? '#4a4f78' : '#2c2f48'; c.fillRect(x, y + bump, w, 38);
  c.strokeStyle = isOn ? '#ffd966' : '#5a5f8a'; c.lineWidth = 2; c.strokeRect(x, y + bump, w, 38);
  const img = taImg(show); c.imageSmoothingEnabled = false;
  if (img && img.complete) c.drawImage(img, x + 2, y + 2 + bump, 46, 34.5);
  c.fillStyle = isOn ? '#ffd966' : '#e8ecf2'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(name, x + 52, y + 20 + bump); c.textBaseline = 'alphabetic';
}
function taHud(text, col = '#ffd966') {   // riquadro in alto a destra, come la barra del gioco
  const c = taC; c.font = 'bold 11px monospace'; const w = c.measureText(text).width + 14;
  c.fillStyle = 'rgba(20,24,40,0.85)'; c.fillRect(TA.W - w - 8, 8, w, 20); c.strokeStyle = '#44486b'; c.lineWidth = 1; c.strokeRect(TA.W - w - 8.5, 7.5, w, 20);
  c.fillStyle = col; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(text, TA.W - w - 1, 18.5); c.textBaseline = 'alphabetic';
}

// ---------- le scene ----------
// caps = le tre righe sotto la scena; ph = quando si passa alla seconda e alla terza
const taRoadRow = r => (x, y) => y === r ? 'road-x' : 'grass';
const TA_SCENES = {
  // benvenuto: la città che nasce un pezzo alla volta
  intro: { dur: 11, grid: { w: 7, h: 4 }, oy: 70,
    draw(t) {
      taGround(taRoadRow(2));
      const seq = [['house', 0, 1], ['house', 1, 1], ['waterWell', 2, 1], ['house', 1, 3], ['pylon', 3, 0], ['substation', 4, 1], ['house', 0, 3], ['supermarket', 5, 0], ['house', 3, 3], ['house', 4, 3]];
      seq.forEach(([k, x, y], i) => taBld(k, x, y, 0.5 + i * 0.6, { v: i, gFrom: 99, rot: y === 3 ? 2 : 0 }));
      const top = PYLON_TOP / STEP - 0.6;
      if (t > 3.5) taFlowLine([taW(1.5, -1.4, top + 0.6), taW(3.5, 0.5, top)], taK(3.5, 0.5), '#d6dbe0', 0.7, 3, '#ffe37a');
      if (t > 4.1) taFlowLine([taW(3.5, 0.5, top), taW(4.5, 1.5, 2.2)], taK(4.1, 0.4), '#d6dbe0', 0.7, 2, '#ffe37a');
      for (let i = 0; i < 4; i++) taDrive(i === 2 ? 'van' : 'car', 2, i % 2 ? 7.2 : -0.4, i % 2 ? -0.2 : 7, 2 + i * 1.7, 3.2, CAR_COLORS[i]);
      if (t > 6.5) for (let i = 0; i < 3; i++) { const f = ((t - 6.5) / 4 + i / 3) % 1; taPed(0.5 + f * 5.5, 2.93, 1, i); }
    },
    ui(t) { taHud(TR('Abitanti: {n}', { n: Math.min(24, Math.max(0, Math.floor((t - 1.2) * 3.2))) })); } },

  // case accanto alla strada: le famiglie arrivano in auto dalla strada principale
  house: { dur: 10.5, ph: [1.2, 5.2],
    caps: ['Prendi la <b>Casa</b> (gruppo 3, Città)', 'Mettila <b>accanto alla strada</b>', 'Le famiglie arrivano in auto'],
    draw(t) {
      taGround(taRoadRow(2));
      taStart(); taPick('house');
      const spots = [[1, 1], [3, 1], [2, 3], [4, 3]], tc = spots.map(([x, y], i) => taTap(x + 0.5, y + 0.5, i ? 0.6 : 0.9));
      taGo(5.6, 0.4, 0.7);
      spots.forEach(([x, y], i) => {
        taBld('house', x, y, tc[i], { v: i, rot: y === 3 ? 2 : 0 });
        const t0 = 5.3 + i * 0.75, d = 1.2 + x * 0.3;
        taDrive('car', 2, -0.5, x + 0.5, t0, d, CAR_COLORS[i]);
        taFloat(x + 0.5, y + 0.5, 3.2, '+4', t0 + d);
      });
      if (t < 5) taLabel(0.4, 2.5, 1.7, TR('Strada principale'), '#c9d2e0');
      this.n = spots.filter(([x], i) => t > 5.3 + i * 0.75 + 1.2 + x * 0.3).length * 4;
    },
    ui() { taHud(TR('Abitanti: {n}', { n: this.n || 0 })); } },

  // pozzo: solo sulla falda (zona azzurra) e accanto a una strada; l'acqua corre sotto le strade
  waterWell: { dur: 11, ph: [1.2, 5.0],
    caps: ['Prendi il <b>Pozzo</b> (gruppo 3, Città)', 'Solo sulla <b>zona azzurra</b>, accanto a una strada', "L'acqua arriva alle case <b>sotto le strade</b>"],
    draw(t) {
      const blue = (x, y) => y <= 1 && x <= 2 && !(x === 0 && y === 0);
      taGround(taRoadRow(2));
      for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) if (blue(x, y)) taTileTint(x, y, 'rgba(60,150,230,' + (0.42 + 0.1 * Math.sin(t * 3 + x + y)).toFixed(2) + ')');
      taStart(); taPick('waterWell');
      const g0 = taGo(4.5, 1.5, 0.9); taCur += 0.9;          // fuori dalla falda: rosso
      const g1 = taCur, tc = taTap(1.5, 1.5, 0.8);            // sulla zona azzurra accanto alla strada: verde
      taGo(5.5, 0.3, 0.7);
      taBld('waterWell', 4, 1, null, { bad: true, gFrom: g0 - 0.3, gTo: g1 + 0.25 });
      taBld('waterWell', 1, 1, tc, { gFrom: g1 + 0.35 });
      const f = taK(tc + 0.5, 1.8), reach = 1.5 + f * 4.5;   // l'acqua avanza sotto la strada
      [[3, 1, 0], [5, 3, 1], [2, 3, 2]].forEach(([x, y, v]) => { taBld('house', x, y, null, { v, rot: y === 3 ? 2 : 0 }); const ok = t > tc + 0.5 && reach >= x + 0.5, when = tc + 0.5 + (x - 1) / 4.5 * 1.8;
        taIcon('noWater', x + 0.5, y + 0.5, 30, ok ? when : null); if (ok) taCheck(x + 0.5, y + 0.5, 30, when + 0.3); });
      if (t > tc + 0.3) {
        taFlowLine([taW(1.5, 1.9), taW(1.5, 2.5), taW(0, 2.5)], taK(tc + 0.3, 0.8), 'rgba(79,170,255,0.9)', 1.6, 2, '#d6efff');
        taFlowLine([taW(1.5, 2.5), taW(6, 2.5)], f, 'rgba(79,170,255,0.9)', 1.6, 5, '#d6efff');
      }
      if (t < g1 + 0.4 && t > 1) taLabel(1.5, 0.2, 2.2, TR('Falda'), '#9fd3ff');
    } },

  // scarico: in riva al mare con il retro sull'acqua, poi il tubo fino a una strada
  sewage: { dur: 11.5, ph: [1.2, 3.7], grid: { w: 7, h: 4 },
    caps: ['Prendi lo <b>Scarico</b> (gruppo 3, Città)', 'In <b>riva al mare</b>, con il retro sull\'acqua', 'Collegalo a una strada con il <b>Tubo</b>'],
    draw(t) {
      const sea = x => x >= 5;
      taGround((x, y) => sea(x) ? 'sea' : x === 0 ? 'road-y' : 'grass', x => sea(x) ? 0 : 1);
      let rot = 0; for (let r = 0; r < 4; r++) if (rotUV(1, -0.6, r)[0] > 2) rot = r;   // il retro verso il mare
      taStart(); taPick('sewage');
      const tc = taTap(4, 2, 0.9, 1);
      taPick('pipe');
      const td = taDrag([[2, 2], [1, 2], [0, 2]], 0.45, 1), tEnd = td[2] + 0.3;
      taGo(1.5, 3.6, 0.7, 1);
      const flow = t > tEnd ? 1 : 0;
      if (flow) for (const [x, y, a] of [[5, 1, 0.5], [5, 2, 0.6], [6, 1, 0.35], [6, 2, 0.4], [5, 0, 0.25], [5, 3, 0.25]]) taTileTint(x, y, 'rgba(122,88,44,' + (a * taK(tEnd, 1.5)).toFixed(2) + ')', 0, 0);
      taBld('sewage', 3, 1, tc, { rot, flow, h: 1 });
      taBld('house', 1, 0, null, { v: 1, h: 1, rot: 3 }); taBld('house', 2, 0, null, { v: 2, h: 1, rot: 3 });
      // il tubo sotto terra: fossa marrone e tubo azzurro che si allunga con la mano
      const p0 = taW(3, 2.5, 1), p1 = taW(0.5, 2.5, 1), f = t < td[0] ? 0 : Math.min(1, (t - td[0]) / (td[2] - td[0] + 0.2));
      if (f > 0) { taFlowLine([p0, p1], f, 'rgba(60,40,22,0.75)', 3.4); taFlowLine([p0, p1], f, '#4faaff', 1.7, flow ? 3 : 0, '#8a6a3a'); }
      if (t > tc + 0.4 && !flow) taIcon('noWater', 4, 2, 36, null);
      if (flow) { taCheck(4, 2, 36, tEnd); taFloat(1.2, 2.5, 2.6, TR('Collegato!'), tEnd); }
    } },

  // corrente: traliccio vicino al bordo (compra da fuori), altri tralicci, sottostazione accanto alla strada
  pylon: { dur: 12.5, ph: [3.0, 4.6], grid: { w: 7, h: 4 }, oy: 70,
    caps: ['Un <b>Traliccio</b> vicino al bordo: la corrente arriva da fuori', 'Altri tralicci verso la città', 'Una <b>Sottostazione</b> accanto alla strada'],
    draw(t) {
      taGround((x, y) => y === 2 ? 'road-x' : 'grass');
      taOver.push(() => { const c = taC, a = taW(0, 0), b = taW(0, 4); c.strokeStyle = '#7fd4ff'; c.lineWidth = 1.2; c.setLineDash([3, 2]); c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); });
      taLabel(0, 4.7, 0, TR('Bordo della mappa'), '#7fd4ff');
      taStart(); taPick('pylon');
      const c1 = taTap(0.5, 0.5, 0.9), c2 = taTap(2.5, 0.5, 0.7);
      taPick('substation');
      const c3 = taTap(4.5, 1.5, 0.9);
      taGo(6.6, 0.2, 0.7);
      taBld('pylon', 0, 0, c1); taBld('pylon', 2, 0, c2); taBld('substation', 4, 1, c3);
      const top = PYLON_TOP / STEP - 0.6, A = taW(0.5, 0.5, top), B = taW(2.5, 0.5, top), OUT = taW(-2.2, 0.5, top + 0.3), S = taW(4.5, 1.5, 2.2);
      const sag = (p, q) => [p, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + 4], q];
      if (t > c1 + 0.4) { taFlowLine([OUT, A], taK(c1 + 0.4, 0.4), '#d6dbe0', 0.7, 3, '#7fd4ff');
        taOver.push(() => { const c = taC, p = taW(-1.3, 0.5, top + 1.6), k = 0.85 + 0.15 * Math.sin(t * 8); c.translate(p[0], p[1]); c.scale(k, k); taBolt(c, '#7fd4ff'); }); }
      if (t > c2 + 0.4) taFlowLine(sag(A, B), taK(c2 + 0.4, 0.4), '#d6dbe0', 0.7, 3, '#ffe37a');
      const on = c3 + 0.9, f = taK(on, 1.6);
      if (t > c3 + 0.4) taFlowLine(sag(B, S), taK(c3 + 0.4, 0.4), '#d6dbe0', 0.7, 3, '#ffe37a');
      if (t > on) { taFlowLine([taW(4.5, 1.9), taW(4.5, 2.5), taW(7, 2.5)], taK(on, 0.9), 'rgba(255,211,77,0.9)', 1.3, 3, '#fff6c9'); taFlowLine([taW(4.5, 2.5), taW(0, 2.5)], f, 'rgba(255,211,77,0.9)', 1.3, 5, '#fff6c9'); }
      [[1, 3, 0], [3, 3, 1], [5, 3, 2], [6, 1, 3]].forEach(([x, y, v]) => { taBld('house', x, y, null, { v, rot: y === 3 ? 2 : 0 }); const when = on + Math.abs(4 - x) / 4.5 * 1.6, ok = t > when;
        taIcon('noPower', x + 0.5, y + 0.5, 30, ok ? when : null); if (ok) taCheck(x + 0.5, y + 0.5, 30, when + 0.3); });
    } },

  // fattoria: sull'erba con l'entrata sulla strada, poi i campi intorno e Fatto
  farm: { dur: 13, ph: [1.2, 3.4],
    caps: ['Prendi la <b>Fattoria</b> (gruppo 4): sull\'erba, entrata sulla strada', 'Trascina sui <b>campi</b> intorno e premi <b>Fatto</b>', 'Il raccolto cresce e il furgone lo porta via'],
    draw(t) {
      const path = [[1, 1], [1, 2], [0, 2], [0, 1], [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 1], [4, 2], [5, 2], [5, 1], [5, 0]];
      taStart(); taPick('farm');
      const tc = taTap(3, 2, 0.9);
      taTools.push([tc + 0.5, 'field', true]);
      const td = taDrag(path, 0.15), done = taTapScr(TA.W - 38, TA.H - 24, 0.7);
      taGo(5.8, 3.9, 0.6);
      const fieldAt = (x, y) => { const i = path.findIndex(p => p[0] === x && p[1] === y); return i >= 0 && t >= td[i] ? i : -1; };
      taGround((x, y) => y === 3 ? 'road-x' : fieldAt(x, y) >= 0 ? 'soil' : 'grass');
      const zone = t > tc + 0.4 && t < done;
      const stage = t < done + 0.3 ? 0 : Math.min(3, 1 + Math.floor((t - done - 0.3) / 1.1));
      for (const [x, y] of path) {
        if (fieldAt(x, y) >= 0) drawField(taC, (u, v) => iso(x, y, u, v, 0), 'wheat', stage);
        else if (zone) taTileTint(x, y, 'rgba(255,217,102,' + (0.22 + 0.08 * Math.sin(t * 5)).toFixed(2) + ')');
      }
      taBld('farm', 2, 1, tc);
      const ripe = done + 0.3 + 2.4;
      if (t > ripe) { taFloat(3, 2, 5, '+14', ripe, '#ffd966'); taDrive('van', 3, 3.2, 6.6, ripe + 0.6, 2.2, '#f2f2f2'); }
      this.done = done; this.zone = t > tc + 0.4;
    },
    ui(t) {   // pulsante "Fatto" della modalità campi
      if (!this.zone) return;
      const c = taC, on = t >= this.done, w = 58, x = TA.W - w - 8, y = TA.H - 36;
      c.fillStyle = on ? '#3f7a2a' : '#3a3f63'; c.fillRect(x, y, w, 26); c.strokeStyle = on ? '#a7f070' : '#ffd966'; c.lineWidth = 2; c.strokeRect(x, y, w, 26);
      c.font = 'bold 11px monospace'; c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(TR('Fatto'), x + w / 2, y + 13.5); c.textBaseline = 'alphabetic';
    } },

  // supermercato: vicino alle case, scelto come destinazione nel pannello della fattoria; furgoni e tasse
  supermarket: { dur: 14.5, ph: [1.2, 3.4], grid: { w: 7, h: 4 },
    caps: ['Costruisci il <b>Supermercato</b> vicino alle case', 'Clic sulla fattoria: scegli il supermercato come <b>destinazione</b>', 'I furgoni portano la merce e tu incassi le <b>tasse</b>'],
    draw(t) {
      taGround(taRoadRow(2));
      taStart(); taPick('supermarket');
      const tc = taTap(5, 1, 0.9);
      taPick('hand');
      const tf = taTap(1, 1, 0.8);                               // clic sulla fattoria: si apre il pannello
      const tp = taTapScr(TA.W - 80, 66, 0.8);                    // clic su "Supermercato" nel pannello
      taGo(3.2, 3.8, 0.7);
      taBld('farm', 0, 0, null); taBld('supermarket', 4, 0, tc);
      [[2, 1, 0], [3, 1, 1], [6, 1, 2], [0, 3, 3]].forEach(([x, y, v]) => taBld('house', x, y, null, { v, rot: y === 3 ? 2 : 0 }));
      if (t > tf && t < tp + 0.9) taOver.push(() => taOutline(0, 0, 2, 2, '#7fd4ff'));
      if (t > tp && t < tp + 1.8) taOver.push(() => { const c = taC, a = taW(1, 1, 3.5), b = taW(5, 1, 3.5); c.strokeStyle = 'rgba(127,212,255,' + (0.9 * (1 - taK(tp + 1.2, 0.6))).toFixed(2) + ')'; c.lineWidth = 1; c.setLineDash([3, 2]); c.lineDashOffset = -t * 10; c.beginPath(); c.moveTo(...a); c.quadraticCurveTo((a[0] + b[0]) / 2, a[1] - 22, ...b); c.stroke(); });
      const go = tp + 1.0, trip = 2.4;
      for (let k = 0; k < 2; k++) {
        const t0 = go + k * 2 * (trip + 0.4);
        taDrive('van', 2, 1.2, 5.2, t0, trip, '#f2f2f2');
        taDrive('van', 2, 5, 0.8, t0 + trip + 0.4, trip, '#f2f2f2');
      }
      const shop = go + trip + 0.6;
      if (t > shop) { for (let i = 0; i < 3; i++) { const f = ((t - shop) / 2.6 + i / 3) % 1, back = f > 0.5, x = back ? 5.2 - (f - 0.5) * 2 * 2.6 : 2.6 + f * 2 * 2.6; taPed(x, 2.93, back ? -1 : 1, i); }
        for (let k = 0; k < 4; k++) taFloat(5, 1, 5, '+10 €', shop + 0.4 + k * 1.1, '#ffd966'); }
      this.tf = tf; this.tp = tp; this.money = t > shop ? Math.min(4, Math.floor((t - shop + 0.7) / 1.1)) * 10 : 0;
    },
    ui(t) {
      taHud(TR('Fondi: {n} €', { n: (50000 + (this.money || 0)).toLocaleString('it-IT') }));
      if (t < this.tf + 0.15 || t > this.tp + 1.1) return;   // pannello della fattoria con la destinazione
      const c = taC, k = taBack(Math.min(1, (t - this.tf - 0.15) / 0.25)), x = TA.W - 150, y = 34, on = t >= this.tp;
      c.translate(x + 71, y + 30); c.scale(k, k); c.translate(-x - 71, -y - 30);
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(x + 3, y + 3, 142, 52);
      c.fillStyle = '#262b44'; c.fillRect(x, y, 142, 52); c.strokeStyle = '#ffd966'; c.lineWidth = 2; c.strokeRect(x, y, 142, 52);
      c.font = 'bold 10px monospace'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#ffd966'; c.fillText(TR('Destinazioni'), x + 8, y + 12);
      c.fillStyle = on ? '#3f5a3a' : '#3a3f63'; c.fillRect(x + 6, y + 22, 130, 24); c.strokeStyle = on ? '#a7f070' : '#5a5f8a'; c.lineWidth = 1.5; c.strokeRect(x + 6, y + 22, 130, 24);
      c.fillStyle = '#1a1c2c'; c.fillRect(x + 11, y + 28, 12, 12); c.strokeStyle = '#94b0c2'; c.lineWidth = 1; c.strokeRect(x + 11.5, y + 28.5, 12, 12);
      if (on) { c.strokeStyle = '#a7f070'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 13.5, y + 34); c.lineTo(x + 16.5, y + 37.5); c.lineTo(x + 22, y + 30.5); c.stroke(); }
      const img = taImg('supermarket'); if (img && img.complete) c.drawImage(img, x + 27, y + 23, 29, 22);
      c.fillStyle = '#f4f4f4'; c.font = '10px monospace'; let name = BUILDINGS.supermarket.name; if (name.length > 12) name = name.slice(0, 11) + '.'; c.fillText(name, x + 58, y + 34.5);
      c.textBaseline = 'alphabetic';
    } },

  // e adesso: le icone dicono cosa manca; servono case vicine per i lavoratori
  end: { dur: 12, ph: [2.2, 6.6], grid: { w: 7, h: 4 },
    caps: ['Un\'<b>icona</b> sopra un edificio dice cosa manca', 'Mancano lavoratori? Costruisci <b>case vicino</b>', 'Con i soldi sblocca nuovi settori in <b>Progressi</b>'],
    draw(t) {
      taGround(taRoadRow(2));
      taBld('factory', 4, 0, null);
      taStart(2.0); taPick('house');
      const spots = [[0, 1], [1, 1], [2, 1], [1, 3]], tc = spots.map(([x, y], i) => taTap(x + 0.5, y + 0.5, i ? 0.55 : 0.9));
      taGo(3.4, 3.9, 0.7);
      spots.forEach(([x, y], i) => taBld('house', x, y, tc[i], { v: i + 1, rot: y === 3 ? 2 : 0 }));
      const walk = tc[3] + 0.6, arrive = walk + 2.6;
      for (let i = 0; i < 4; i++) { const f = taK(walk + i * 0.25, 2.2); if (f > 0 && f < 1) taPed(0.6 + f * 4.2, 2.93, 1, i); }
      taIcon(t < arrive - 1 ? 'noWorkers' : 'fewWorkers', 5, 1, 46, t >= arrive ? arrive : null);
      if (t >= arrive) { taCheck(5, 1, 46, arrive + 0.3); taFloat(5, 1, 7.6, TR('Al lavoro!'), arrive + 0.2); }
      if (t < 2.2) taOver.push(() => { const c = taC, p = taW(5, 1, 0), r = 10 + 2 * Math.sin(t * 6); c.strokeStyle = 'rgba(255,217,102,0.9)'; c.lineWidth = 1.2; c.setLineDash([3, 2]); c.beginPath(); c.arc(p[0], p[1] - 46, r, 0, Math.PI * 2); c.stroke(); });
    } },
};
