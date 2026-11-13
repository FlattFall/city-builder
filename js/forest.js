// ---------- Azienda forestale: taglio degli alberi e ricrescita (richiesta dell'utente) ----------
// Quando l'azienda lavora, ogni tanto un boscaiolo taglia un albero nella sua zona: l'albero si piega e
// cade, resta il ceppo con il tronco a terra, poi ricresce un alberello che diventa grande. È solo
// grafica: il tile resta bosco e conta per la produzione (più bosco nella zona = più legno, `forestRatio`).
// I tagli non si salvano (dopo un caricamento gli alberi sono tutti in piedi).
const FOREST_CUT = { every: 6, fall: 3, stump: 20, grow: 40, maxActive: 2, maxRatio: 1.5 };

function forestCuts() {
  if (!game.treeCuts || game.treeCuts.map !== game.map) { game.treeCuts = new Map(); game.treeCuts.map = game.map; game.forestT = 0; }
  return game.treeCuts;
}
// produzione dell'azienda in base agli alberi nella zona: 100% con L.trees tile di bosco, fino a +50% con più bosco
function forestRatio(b, L) { return Math.min(FOREST_CUT.maxRatio, (b.trees || 0) / L.trees); }

// Chiamata da updateLivestock mentre l'azienda lavora
function forestTick(b, L, dt, working) {
  const cuts = forestCuts();
  if (!working) return;
  b.cutTimer = (b.cutTimer || FOREST_CUT.every * Math.random()) - dt;
  if (b.cutTimer > 0) return;
  b.cutTimer = FOREST_CUT.every * (0.7 + Math.random() * 0.6);
  let active = 0;
  for (const c of cuts.values()) if (c.by === b.id && game.forestT - c.t0 < FOREST_CUT.fall + FOREST_CUT.stump) active++;
  if (active >= FOREST_CUT.maxActive) return;
  const d = BUILDINGS[b.kind], R = L.radius, cand = [];
  for (let y = b.ay - R; y < b.ay + d.h + R; y++) for (let x = b.ax - R; x < b.ax + d.w + R; x++) {
    if (!inMap(x, y) || game.map[y][x].type !== T.FOREST || game.map[y][x].building) continue;
    if (cuts.has(y * game.size + x)) continue;
    cand.push(y * game.size + x);
  }
  if (!cand.length) return;
  cuts.set(cand[Math.floor(Math.random() * cand.length)], { t0: game.forestT, by: b.id });
}
// Stato del taglio di un tile: null = albero normale; { phase: 'fall'|'stump'|'grow', f: 0..1 }
function treeCutState(x, y) {
  const cuts = game.treeCuts;
  if (!cuts || !cuts.size || cuts.map !== game.map) return null;
  const k = y * game.size + x, c = cuts.get(k);
  if (!c) return null;
  const e = (game.forestT || 0) - c.t0, F = FOREST_CUT;
  if (e < F.fall) return { phase: 'fall', f: e / F.fall };
  if (e < F.fall + F.stump) return { phase: 'stump', f: (e - F.fall) / F.stump };
  if (e < F.fall + F.stump + F.grow) return { phase: 'grow', f: (e - F.fall - F.stump) / F.grow };
  cuts.delete(k);
  return null;
}
// per la vista da lontano (farcache): cambia quando cambia la fase
function treeCutSig(x, y) {
  const s = treeCutState(x, y);
  if (!s) return 0;
  return s.phase === 'fall' ? 1 : s.phase === 'stump' ? 2 : 3 + Math.floor(s.f * 4);
}

// Disegno di un tile di bosco con il taglio: (sx, sy) come drawTree
function drawForestTile(c, sx, sy, x, y) {
  const s = treeCutState(x, y);
  if (!s) { drawTree(c, sx, sy, x, y); return; }
  animSeen = true;
  const ox = Math.round((hash(x, y, 5) - 0.5) * 10), oy = Math.round((hash(x, y, 9) - 0.5) * 4);
  const bx = Math.round(sx) + ox, by = Math.round(sy) + 8 + oy;   // piede dell'albero (come in drawTree)
  const stump = () => {
    c.fillStyle = 'rgba(10,30,10,0.2)'; c.beginPath(); c.ellipse(bx + 1, by, 3, 1.3, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5b3a1e'; c.fillRect(bx - 1.5, by - 2, 3, 2);
    c.fillStyle = '#c99a62'; c.beginPath(); c.ellipse(bx, by - 2, 1.5, 0.7, 0, 0, Math.PI * 2); c.fill();
  };
  if (s.phase === 'fall') {
    // boscaiolo che colpisce con l'ascia, poi l'albero si piega e cade di lato
    const chop = Math.min(1, s.f / 0.55), fall = Math.max(0, (s.f - 0.55) / 0.45);
    const ang = fall * fall * 1.45;
    c.save(); c.translate(bx, by); c.rotate(ang); c.translate(-bx, -by);
    c.globalAlpha = 1 - Math.max(0, fall - 0.85) / 0.15 * 0.6;
    drawTree(c, sx, sy, x, y);
    c.restore();
    if (fall > 0) stump();
    drawLumberjack(c, bx - 5, by + 1, chop < 1 ? Math.sin(game.forestT * 14) : -0.6);
    return;
  }
  if (s.phase === 'stump') {
    stump();
    // il tronco tagliato a terra, che sparisce piano (portato via)
    if (s.f < 0.6) {
      c.globalAlpha = 1 - s.f / 0.6;
      c.fillStyle = '#6b4428'; c.beginPath(); c.moveTo(bx + 2, by - 1); c.lineTo(bx + 10, by + 2); c.lineTo(bx + 10, by + 3.5); c.lineTo(bx + 2, by + 0.5); c.closePath(); c.fill();
      c.fillStyle = '#c99a62'; c.beginPath(); c.ellipse(bx + 10, by + 2.7, 0.9, 0.9, 0, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    }
    return;
  }
  // ricrescita: alberello che diventa grande
  const g = 0.25 + 0.75 * s.f;
  c.save(); c.translate(bx, by); c.scale(g, g); c.translate(-bx, -by);
  drawTree(c, sx, sy, x, y);
  c.restore();
}
// omino con l'elmetto giallo e l'ascia (swing = -1..1)
function drawLumberjack(c, x, y, swing) {
  c.fillStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.ellipse(x, y, 1.6, 0.8, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#3a3a40'; c.lineWidth = 0.75; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x - 0.4, y - 2); c.lineTo(x - 0.5, y); c.moveTo(x + 0.4, y - 2); c.lineTo(x + 0.5, y); c.stroke();
  c.fillStyle = '#d94141'; c.fillRect(x - 0.9, y - 4.2, 1.8, 2.3);           // camicia a quadri rossa
  c.fillStyle = '#9a2a2a'; c.fillRect(x - 0.9, y - 3.3, 1.8, 0.4);
  c.fillStyle = '#f1c9a5'; c.beginPath(); c.arc(x, y - 4.9, 0.75, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffd34d'; c.beginPath(); c.arc(x, y - 5.1, 0.8, Math.PI, Math.PI * 2); c.fill();   // elmetto
  // ascia: manico dalla spalla, lama in fondo
  const a = -0.9 + swing * 0.9, hx = x + 0.6, hy = y - 3.8, ex = hx + Math.cos(a) * 3.6, ey = hy + Math.sin(a) * 3.6;
  c.strokeStyle = '#8a5a32'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(hx, hy); c.lineTo(ex, ey); c.stroke();
  c.fillStyle = '#b8bec6'; c.beginPath(); c.arc(ex, ey, 0.9, 0, Math.PI * 2); c.fill();
  c.lineCap = 'butt';
}

// Con l'azienda forestale in mano: quanti alberi ci sono nella zona e quanto produrrebbe (testo sullo schermo)
function drawForestPreview(c, h) {
  if (!inMap(h.x, h.y)) return;
  const L = FORESTRY.forestry, n = treesNear({ kind: 'forestry', ax: h.x, ay: h.y }, L.radius);
  const pct = Math.round(Math.min(FOREST_CUT.maxRatio, n / L.trees) * 100);
  const z = zoomLevel(), p = iso(h.x, h.y, 1, 1, game.map[h.y][h.x].elev);
  const sx = p[0] * z + Math.round(cam.x), sy = p[1] * z + Math.round(cam.y) + 26;
  const text = TR('Alberi nella zona: {n} - produzione {p}%', { n, p: pct });
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.font = 'bold 13px monospace';
  const w = c.measureText(text).width + 16;
  c.fillStyle = 'rgba(20,24,40,0.85)'; c.fillRect(sx - w / 2, sy - 11, w, 22);
  c.strokeStyle = pct >= 100 ? '#8dff7a' : pct > 0 ? '#ffd966' : '#ff7a6a'; c.lineWidth = 2; c.strokeRect(sx - w / 2, sy - 11, w, 22);
  c.fillStyle = '#f4f4f4'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, sx, sy + 1);
  c.restore();
}
