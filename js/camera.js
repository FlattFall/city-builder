// ---------- Camera: posizione, zoom, conversioni schermo <-> tile ----------
const view = { w: 0, h: 0 };
const cam = { x: 0, y: 0, zi: 2 };

function zoomLevel() { return ZOOMS[cam.zi]; }

function centerCamera() {
  cam.x = view.w / 2;
  cam.y = view.h / 2 - zoomLevel() * (game.size * TH / 2);
}

function zoomAt(mx, my, dir) {
  const old = zoomLevel();
  cam.zi = Math.min(ZOOMS.length - 1, Math.max(0, cam.zi + dir));
  const z = zoomLevel();
  cam.x = mx - (mx - cam.x) * z / old;
  cam.y = my - (my - cam.y) * z / old;
  clampCamera();
}

// Limiti ai bordi: il centro dello schermo deve restare sopra la mappa,
// così non si può scorrere nel vuoto fuori dal bordo
function clampCamera() {
  if (!game.map) return;
  const z = zoomLevel(), N = game.size;
  const cx = (view.w / 2 - cam.x) / z, cy = (view.h / 2 - cam.y) / z;   // centro in coordinate mondo
  // da mondo a tile (a quota 0), limiti, e di nuovo a mondo
  const a = cx / (TW / 2), b = cy / (TH / 2);
  const tx = Math.max(0, Math.min(N, (a + b) / 2)), ty = Math.max(0, Math.min(N, (b - a) / 2));
  const ncx = (tx - ty) * TW / 2, ncy = (tx + ty) * TH / 2;
  cam.x = view.w / 2 - ncx * z;
  cam.y = view.h / 2 - ncy * z;
}

// Coordinate "mondo" (senza quota) -> tile
function tileFromWorld(wx, wy) {
  const a = wx / (TW / 2), b = (wy - TH / 2) / (TH / 2);
  return { x: Math.floor((a + b) / 2 + 0.5), y: Math.floor((b - a) / 2 + 0.5) };
}

// Tile sotto il mouse, tenendo conto di quote, pareti ed edifici.
// Ogni tile è una "colonna" dal suolo fino al suo punto più alto: tra le colonne che
// contengono il punto vince quella disegnata per ultima (cioè quella davanti).
function pickTile(mx, my) {
  const z = zoomLevel();
  const wx = (mx - cam.x) / z, wy = (my - cam.y) / z;
  const withBuildings = game.tool === 'hand' || game.tool === 'demolish';
  const maxDy = (game.maxElev + 1) * STEP + 40;
  let best = null;
  for (let dy = 0; dy <= maxDy; dy++) {
    const p = tileFromWorld(wx, wy + dy);
    if (!inMap(p.x, p.y) || topHeightPx(p.x, p.y, withBuildings) < dy) continue;
    if (!best || p.y > best.y || (p.y === best.y && p.x > best.x)) best = p;
  }
  return best;
}

// Intervallo di tile visibili (per disegnare solo quelli necessari)
function visibleRange() {
  const z = zoomLevel();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [sx, sy] of [[0, 0], [view.w, 0], [0, view.h], [view.w, view.h]]) {
    const p = tileFromWorld((sx - cam.x) / z, (sy - cam.y) / z);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const m = game.maxElev + 8;
  return {
    x0: Math.max(0, minX - m), x1: Math.min(game.size - 1, maxX + m),
    y0: Math.max(0, minY - m), y1: Math.min(game.size - 1, maxY + m),
  };
}
