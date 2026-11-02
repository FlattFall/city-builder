// ---------- Disegno ----------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const ROAD_COLOR = '#5c5c66';
const RAMP_LIGHT = '#6b6b76';   // rampa che sale verso il fondo (guarda verso di noi)
const RAMP_DARK = '#4d4d57';    // rampa che sale verso il davanti
const CURB_COLOR = '#a0a0a8';
const LANE_COLOR = '#e8d24a';

const HOUSE_STYLES = [
  { l: '#d9c3a0', r: '#b39d7c', roof: '#b5473a', lip: '#8f372d' },
  { l: '#e6d9c2', r: '#c0b399', roof: '#4a6fa5', lip: '#385782' },
  { l: '#c9d6b8', r: '#a4b394', roof: '#8a5a3a', lip: '#6b432a' },
];

function poly(c, pts, color) {
  c.fillStyle = color; c.strokeStyle = color; c.lineWidth = 1;
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath(); c.fill(); c.stroke();
}

function line(c, a, b, color) {
  c.strokeStyle = color; c.lineWidth = 1;
  c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
}

// Punto (u, v) del tile (x, y) all'altezza h (in livelli) -> coordinate mondo
function iso(x, y, u, v, h) {
  return [(x + u - y - v) * TW / 2, (x + u + y + v) * TH / 2 - h * STEP];
}

// Altezza dentro al tile, interpolata tra i 4 angoli (serve per le rampe)
function heightIn(h, u, v) {
  return h[0] * (1 - u) * (1 - v) + h[1] * u * (1 - v) + h[2] * u * v + h[3] * (1 - u) * v;
}

// Funzione che trasforma (u, v) del tile in un punto sullo schermo, seguendo la sua superficie
function surface(x, y) {
  const h = cornerHeights(x, y);
  return (u, v) => iso(x, y, u, v, heightIn(h, u, v));
}

function drawTree(c, sx, sy, x, y) {
  const ox = Math.round((hash(x, y, 5) - 0.5) * 10);
  const oy = Math.round((hash(x, y, 9) - 0.5) * 4);
  const bx = Math.round(sx) + ox, by = Math.round(sy) + 8 + oy;
  c.fillStyle = '#5b3a1e'; c.fillRect(bx - 1, by - 3, 2, 4);
  c.fillStyle = '#1f5a24'; c.fillRect(bx - 4, by - 9, 8, 6);
  c.fillStyle = '#2f7a30'; c.fillRect(bx - 3, by - 12, 6, 4);
  c.fillStyle = '#4a9a3c'; c.fillRect(bx - 1, by - 14, 3, 3);
}

// Strada: cordoli sui lati non collegati, linea gialla verso i vicini collegati.
// P(u, v) segue la superficie del tile, quindi funziona anche sulle rampe.
function drawRoad(c, x, y, P) {
  const edges = [[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [0, 1]], [[0, 1], [0, 0]]];
  const mids = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
  const center = P(0.5, 0.5);
  for (let d = 0; d < 4; d++) {
    if (roadLinked(x, y, d)) line(c, center, P(...mids[d]), LANE_COLOR);
    else line(c, P(...edges[d][0]), P(...edges[d][1]), CURB_COLOR);
  }
}

function drawHouse(c, sx, sy, variant) {
  const s = HOUSE_STYLES[variant % HOUSE_STYLES.length];
  const hw = 12, hh = 6, h = 14;
  const cx = sx, cy = sy + TH / 2;
  const L = [cx - hw, cy], B = [cx, cy + hh], R = [cx + hw, cy], Tp = [cx, cy - hh];
  const up = (p, d) => [p[0], p[1] - d];

  poly(c, [L, B, up(B, h), up(L, h)], s.l);
  poly(c, [B, R, up(R, h), up(B, h)], s.r);
  poly(c, [up(Tp, h), up(R, h), up(B, h), up(L, h)], s.roof);
  poly(c, [up(L, h), up(B, h), up(B, h - 2), up(L, h - 2)], s.lip);
  poly(c, [up(B, h), up(R, h), up(R, h - 2), up(B, h - 2)], s.lip);

  c.fillStyle = '#2b3a4d';
  for (const t of [0.3, 0.7]) {
    c.fillRect(Math.round(L[0] + (B[0] - L[0]) * t) - 1, Math.round(L[1] + (B[1] - L[1]) * t - h * 0.5) - 1, 2, 3);
    c.fillRect(Math.round(B[0] + (R[0] - B[0]) * t) - 1, Math.round(B[1] + (R[1] - B[1]) * t - h * 0.5) - 1, 2, 3);
  }
}

// Parete sul lato davanti verso la direzione d (1 = destra/SE, 2 = sinistra/SW):
// va dal bordo del tile fino al bordo del vicino (o al suolo fuori mappa)
function drawWall(c, x, y, h, d, color) {
  const [ka, kb] = d === 1 ? [1, 2] : [3, 2];
  const na = neighborCornerHeight(x, y, d, ka), nb = neighborCornerHeight(x, y, d, kb);
  const ba = Math.min(h[ka], na), bb = Math.min(h[kb], nb);
  if (h[ka] <= ba && h[kb] <= bb) return;
  const [ua, va] = CORNERS[ka], [ub, vb] = CORNERS[kb];
  poly(c, [iso(x, y, ua, va, h[ka]), iso(x, y, ub, vb, h[kb]), iso(x, y, ub, vb, bb), iso(x, y, ua, va, ba)], color);
}

// onlyTop = disegna solo la superficie e l'oggetto sopra (usato per l'anteprima)
function drawTile(c, x, y, detail, onlyTop) {
  const t = game.map[y][x];
  const h = cornerHeights(x, y);
  const col = COLORS[t.type];
  const P = (u, v) => iso(x, y, u, v, heightIn(h, u, v));

  if (!onlyTop) {
    drawWall(c, x, y, h, 2, col[1]); // sinistra, verso (x, y+1)
    drawWall(c, x, y, h, 1, col[2]); // destra, verso (x+1, y)
  }

  // superficie
  let top = col[0];
  if (t.road) {
    const r = rampDir(x, y);
    top = r < 0 ? ROAD_COLOR : (r === 0 || r === 3 ? RAMP_LIGHT : RAMP_DARK);
  }
  poly(c, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], top);

  if (t.road) { drawRoad(c, x, y, P); return; }

  const sx = (x - y) * TW / 2;
  const sy = (x + y) * TH / 2 - t.elev * STEP;
  if (detail && !onlyTop) {
    c.fillStyle = col[1];
    for (let i = 0; i < 3; i++) {
      const px = Math.round(sx + (hash(x, y, 20 + i) - 0.5) * 16);
      const py = Math.round(sy + 5 + (hash(x, y, 40 + i) - 0.5) * 6);
      c.fillRect(px, py, 1, 1);
    }
  }

  if (t.building) { drawHouse(c, sx, sy, t.building.variant); return; }
  if (t.type === T.FOREST && !onlyTop) drawTree(c, sx, sy, x, y);
}

// ---------- Anteprima (fantasma) di strada/casa sotto il mouse ----------
function previewTile() {
  const h = game.hover;
  if (!h || (game.tool !== 'road' && game.tool !== 'house')) return null;
  return canUseTool(game.tool, h.x, h.y) ? h : null;
}

// Tile da ridisegnare in anteprima: quello sotto il mouse e, per le strade, le strade vicine
// (possono cambiare forma, ad esempio diventare una rampa, o collegarsi alla nuova strada)
function previewTiles(p) {
  const list = [p];
  if (game.tool === 'road')
    for (const D of DIRS) if (roadAt(p.x + D.dx, p.y + D.dy)) list.push({ x: p.x + D.dx, y: p.y + D.dy });
  return list;
}

// Esegue draw() come se l'oggetto fosse già costruito, poi rimette tutto com'era
function withPreview(p, draw) {
  const t = game.map[p.y][p.x];
  const saved = { road: t.road, building: t.building };
  if (game.tool === 'road') t.road = true;
  else t.building = { kind: 'house', variant: houseVariant(p.x, p.y) };
  try { draw(); } finally { t.road = saved.road; t.building = saved.building; }
}

function drawHover(c) {
  const h = game.hover;
  if (!h) return;
  let color = '#ffffff';
  if (game.tool === 'demolish') color = canUseTool('demolish', h.x, h.y) ? '#ffb347' : '#888888';
  else if (game.tool !== 'hand') color = canUseTool(game.tool, h.x, h.y) ? '#5dff7a' : '#ff5d5d';

  const draw = () => {
    const P = surface(h.x, h.y);
    c.strokeStyle = color; c.lineWidth = 1.5;
    c.beginPath();
    const pts = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
    c.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
    c.closePath(); c.stroke();
  };
  // con l'anteprima il contorno segue la forma finale (es. la rampa)
  if (previewTile()) withPreview(h, draw); else draw();
}

function drawFrame() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1a1c2c';
  ctx.fillRect(0, 0, view.w, view.h);
  if (!game.map) return;

  const z = zoomLevel();
  ctx.setTransform(z, 0, 0, z, Math.round(cam.x), Math.round(cam.y));
  ctx.imageSmoothingEnabled = false;

  const r = visibleRange();
  const detail = z >= 1;
  const pv = previewTile();
  const pvList = pv ? previewTiles(pv) : [];
  const inPreview = (x, y) => pvList.some(p => p.x === x && p.y === y);

  // dal fondo al fronte (ordine del pittore)
  for (let y = r.y0; y <= r.y1; y++)
    for (let x = r.x0; x <= r.x1; x++) {
      drawTile(ctx, x, y, detail);
      // anteprima al suo posto: i blocchi davanti la coprono come farebbero con l'oggetto vero
      if (pv && inPreview(x, y)) {
        ctx.globalAlpha = 0.75;
        withPreview(pv, () => drawTile(ctx, x, y, detail, true));
        ctx.globalAlpha = 1;
      }
    }

  // anteprima "a raggi X": la parte coperta da blocchi davanti si vede in trasparenza
  if (pv) {
    ctx.globalAlpha = 0.4;
    withPreview(pv, () => { for (const p of pvList) drawTile(ctx, p.x, p.y, detail, true); });
    ctx.globalAlpha = 1;
  }

  drawHover(ctx);
}

// Ridisegna al prossimo frame (evita di disegnare più volte inutilmente)
let needsDraw = true;
function requestDraw() { needsDraw = true; }
