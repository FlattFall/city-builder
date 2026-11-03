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
// ---------- Scelta precisa al pixel (Mano e Demolisci) ----------
// Si ridisegnano i tile candidati, dal più avanti, in una tela di 1x1 pixel posizionata sotto il
// mouse: vince il primo che colora quel pixel. Così un edificio alto copre solo quello che copre
// davvero sullo schermo, e quello che si vede dietro (strade, case, alberi) si può cliccare.
const pickCanvas = document.createElement('canvas');
pickCanvas.width = pickCanvas.height = 1;
const pickCtx = pickCanvas.getContext('2d', { willReadFrequently: true });
function pixelHit(mx, my, draw) {
  const z = zoomLevel();
  pickCtx.setTransform(1, 0, 0, 1, 0, 0);
  pickCtx.clearRect(0, 0, 1, 1);
  pickCtx.setTransform(z, 0, 0, z, Math.round(cam.x) - mx, Math.round(cam.y) - my);
  pickCtx.imageSmoothingEnabled = false;
  draw(pickCtx);
  return pickCtx.getImageData(0, 0, 1, 1).data[3] > 40;
}
function pickTileExact(mx, my) {
  const z = zoomLevel();
  const wx = (mx - cam.x) / z, wy = (my - cam.y) / z;
  const maxDy = (game.maxElev + 10) * STEP + 48, seen = new Set(), cands = [];
  for (let dy = 0; dy <= maxDy; dy++) {
    const p = tileFromWorld(wx, wy + dy);
    if (!inMap(p.x, p.y) || topHeightPx(p.x, p.y, true) + 8 < dy) continue;
    const k = p.y * game.size + p.x;
    if (!seen.has(k)) { seen.add(k); cands.push(p); }
  }
  // gli edifici 2x2 si disegnano sul tile più avanti: anche quello è un candidato
  for (const p of cands.slice()) {
    const b = game.map[p.y][p.x].building;
    if (!b) continue;
    const d = BUILDINGS[b.kind], fx = b.ax + d.w - 1, fy = b.ay + d.h - 1, k = fy * game.size + fx;
    if (!seen.has(k)) { seen.add(k); cands.push({ x: fx, y: fy }); }
  }
  cands.sort((a, b) => (b.y - a.y) || (b.x - a.x));   // dal più avanti (disegnato per ultimo)
  for (const p of cands) {
    const t = game.map[p.y][p.x], over = bridgeOver(t);
    if (over && pixelHit(mx, my, c => drawBridgeSpan(c, p.x, p.y, over, t.bridge.i))) return { x: p.x, y: p.y, deck: true };
    if (pixelHit(mx, my, c => drawTile(c, p.x, p.y, false))) return over ? { x: p.x, y: p.y, deck: false } : { x: p.x, y: p.y };
  }
  return null;
}

// Sopra un ponte la colonna ha un buco: il terreno (con le case) e, più in alto, l'impalcato.
// p.deck = true se il mouse è sull'impalcato, false se è sotto il ponte.
function pickTile(mx, my) {
  const z = zoomLevel();
  const wx = (mx - cam.x) / z, wy = (my - cam.y) / z;
  const withBuildings = game.tool === 'hand' || game.tool === 'demolish';
  if (withBuildings) { const exact = pickTileExact(mx, my); if (exact) return exact; }
  const maxDy = (game.maxElev + 10) * STEP + 40;
  let best = null;
  for (let dy = 0; dy <= maxDy; dy++) {
    const p = tileFromWorld(wx, wy + dy);
    if (!inMap(p.x, p.y)) continue;
    const t = game.map[p.y][p.x], over = withBuildings && bridgeOver(t);
    let deck;
    if (over) {
      const i = t.bridge.i;
      const low = Math.min(over.e[i - 1], over.e[i]) * STEP - 4, top = Math.max(over.e[i - 1], over.e[i]) * STEP + 4;
      const ground = Math.max(...cornerHeights(p.x, p.y)) * STEP + (t.building ? BUILDINGS[t.building.kind].height : 0);
      if (dy >= low && dy <= top) deck = true;
      else if (dy <= ground) deck = false;
      else continue;
    } else if (topHeightPx(p.x, p.y, withBuildings) < dy) continue;
    if (!best || p.y > best.y || (p.y === best.y && p.x > best.x)) { best = p; if (over) best.deck = deck; }
    else if (over && deck && best.x === p.x && best.y === p.y) best.deck = true;   // se tocca anche l'impalcato vince lui
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
