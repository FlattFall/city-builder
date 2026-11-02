// ---------- Disegno ----------
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

const ROAD_COLOR = '#5c5c66';
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

function line(c, x1, y1, x2, y2, color) {
  c.strokeStyle = color; c.lineWidth = 1;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
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

// Strada: cordoli sui lati senza strada vicina, linea gialla verso i vicini collegati
function drawRoad(c, x, y, sx, sy) {
  const hw = TW / 2, hh = TH / 2;
  const cx = sx, cy = sy + hh;
  const ne = roadAt(x, y - 1), se = roadAt(x + 1, y), sw = roadAt(x, y + 1), nw = roadAt(x - 1, y);

  if (!ne) line(c, sx, sy, sx + hw, sy + hh, CURB_COLOR);
  if (!se) line(c, sx + hw, sy + hh, sx, sy + TH, CURB_COLOR);
  if (!sw) line(c, sx, sy + TH, sx - hw, sy + hh, CURB_COLOR);
  if (!nw) line(c, sx - hw, sy + hh, sx, sy, CURB_COLOR);

  if (ne) line(c, cx, cy, sx + hw / 2, sy + hh / 2, LANE_COLOR);
  if (se) line(c, cx, cy, sx + hw / 2, sy + hh + hh / 2, LANE_COLOR);
  if (sw) line(c, cx, cy, sx - hw / 2, sy + hh + hh / 2, LANE_COLOR);
  if (nw) line(c, cx, cy, sx - hw / 2, sy + hh / 2, LANE_COLOR);
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

function drawTile(c, x, y, detail) {
  const t = game.map[y][x];
  const sx = (x - y) * TW / 2;
  const sy = (x + y) * TH / 2 - t.elev * STEP;
  const col = COLORS[t.type];

  // pareti visibili: sinistra verso (x, y+1), destra verso (x+1, y)
  const wl = (t.elev - elevAt(x, y + 1)) * STEP;
  const wr = (t.elev - elevAt(x + 1, y)) * STEP;
  if (wl > 0) poly(c, [[sx - TW / 2, sy + TH / 2], [sx, sy + TH], [sx, sy + TH + wl], [sx - TW / 2, sy + TH / 2 + wl]], col[1]);
  if (wr > 0) poly(c, [[sx, sy + TH], [sx + TW / 2, sy + TH / 2], [sx + TW / 2, sy + TH / 2 + wr], [sx, sy + TH + wr]], col[2]);

  // superficie
  poly(c, [[sx, sy], [sx + TW / 2, sy + TH / 2], [sx, sy + TH], [sx - TW / 2, sy + TH / 2]], t.road ? ROAD_COLOR : col[0]);

  if (t.road) { drawRoad(c, x, y, sx, sy); return; }

  if (detail) {
    c.fillStyle = col[1];
    for (let i = 0; i < 3; i++) {
      const px = Math.round(sx + (hash(x, y, 20 + i) - 0.5) * 16);
      const py = Math.round(sy + 5 + (hash(x, y, 40 + i) - 0.5) * 6);
      c.fillRect(px, py, 1, 1);
    }
  }

  if (t.building) { drawHouse(c, sx, sy, t.building.variant); return; }
  if (t.type === T.FOREST) drawTree(c, sx, sy, x, y);
}

function drawHover(c) {
  const h = game.hover;
  if (!h) return;
  const t = game.map[h.y][h.x];
  const sx = (h.x - h.y) * TW / 2;
  const sy = (h.x + h.y) * TH / 2 - t.elev * STEP;
  let color = '#ffffff';
  if (game.tool === 'demolish') color = canUseTool('demolish', h.x, h.y) ? '#ffb347' : '#888888';
  else if (game.tool !== 'hand') color = canUseTool(game.tool, h.x, h.y) ? '#5dff7a' : '#ff5d5d';
  c.strokeStyle = color; c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(sx, sy); c.lineTo(sx + TW / 2, sy + TH / 2);
  c.lineTo(sx, sy + TH); c.lineTo(sx - TW / 2, sy + TH / 2); c.closePath();
  c.stroke();
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
  // dal fondo al fronte (ordine del pittore)
  for (let y = r.y0; y <= r.y1; y++)
    for (let x = r.x0; x <= r.x1; x++)
      drawTile(ctx, x, y, detail);

  drawHover(ctx);
}

// Ridisegna al prossimo frame (evita di disegnare più volte inutilmente)
let needsDraw = true;
function requestDraw() { needsDraw = true; }
