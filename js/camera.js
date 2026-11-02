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
}

// Coordinate "mondo" (senza quota) -> tile
function tileFromWorld(wx, wy) {
  const a = wx / (TW / 2), b = (wy - TH / 2) / (TH / 2);
  return { x: Math.floor((a + b) / 2 + 0.5), y: Math.floor((b - a) / 2 + 0.5) };
}

// Tile sotto il mouse, tenendo conto delle quote
function pickTile(mx, my) {
  const z = zoomLevel();
  const wx = (mx - cam.x) / z, wy = (my - cam.y) / z;
  for (let e = game.maxElev; e >= 0; e--) {
    const p = tileFromWorld(wx, wy + e * STEP);
    if (inMap(p.x, p.y) && game.map[p.y][p.x].elev === e) return p;
  }
  return null;
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
