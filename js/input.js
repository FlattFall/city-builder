// ---------- Input: mouse e tastiera ----------
// Sinistro = usa lo strumento (con "Mano": trascina la mappa)
// Destro o centrale (trascinando) = muovi la mappa

let panning = false, painting = false, lastX = 0, lastY = 0, lastTile = null;

// Percorso a 4 direzioni tra due tile, così le strade trascinate restano collegate
function tilePath(a, b) {
  const out = [{ x: a.x, y: a.y }];
  let x = a.x, y = a.y;
  while (x !== b.x || y !== b.y) {
    const dx = b.x - x, dy = b.y - y;
    if (Math.abs(dx) >= Math.abs(dy)) x += Math.sign(dx); else y += Math.sign(dy);
    out.push({ x, y });
  }
  return out;
}

function paintTo(tile) {
  // gli edifici grandi si piazzano uno per clic; percorsi, campi, case e ruspa si trascinano
  const big = BUILDINGS[game.tool] && BUILDINGS[game.tool].w > 1;
  if (big && lastTile) return;
  const path = (lastTile && !BUILDINGS[game.tool]) ? tilePath(lastTile, tile) : [tile];
  let changed = false;
  for (const p of path) {
    if (lastTile && p.x === lastTile.x && p.y === lastTile.y) continue;
    const r = useTool(game.tool, p.x, p.y);
    if (r.ok) { changed = true; game.dirty = true; }
    else if (r.msg) toast(r.msg);
  }
  lastTile = tile;
  if (changed) { updateHud(); requestDraw(); }
}

canvas.addEventListener('contextmenu', e => e.preventDefault());

let downX = 0, downY = 0, handDown = false;

canvas.addEventListener('mousedown', e => {
  closeSubmenu();
  if (e.button === 1 || e.button === 2 || (e.button === 0 && game.tool === 'hand')) {
    panning = true; lastX = e.clientX; lastY = e.clientY;
    downX = e.clientX; downY = e.clientY; handDown = e.button === 0;
    canvas.style.cursor = 'grabbing';
  } else if (e.button === 0) {
    painting = true;
    lastTile = null;
    game.levelTarget = null; // Livella: la quota la decide il primo tile
    const tile = pickTile(e.clientX, e.clientY);
    if (tile) paintTo(tile);
  }
});

addEventListener('mouseup', e => {
  // con la Mano, un clic (senza trascinare) su un edificio apre il suo pannello
  if (handDown && Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) < 5 && !menuIsOpen()) {
    const t = pickTile(e.clientX, e.clientY);
    const b = t && game.map[t.y][t.x].building;
    if (b) openBuildingPanel(b); else if (panelIsOpen()) closePanel();
  }
  handDown = false;
  panning = false; painting = false; lastTile = null;
  canvas.style.cursor = game.tool === 'hand' ? 'grab' : 'crosshair';
});

addEventListener('mousemove', e => {
  if (menuIsOpen()) return;
  if (panning) {
    cam.x += e.clientX - lastX; cam.y += e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
  }
  game.hover = pickTile(e.clientX, e.clientY);
  if (painting && game.hover) paintTo(game.hover);
  updateInfo();
  requestDraw();
});

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1 : -1);
  game.hover = pickTile(e.clientX, e.clientY);
  requestDraw();
}, { passive: false });

// (Esc apre il menu: vedi menu.js. Nuova mappa e caricamento sono nel menu.)
addEventListener('keydown', e => {
  if (menuIsOpen()) return; // con il menu aperto la tastiera non comanda il gioco
  const k = e.key.toLowerCase();
  const s = 48;
  if (selectGroupByKey(e.key)) { /* strumento scelto */ }
  else if (k === 'r') rotateTool();
  else if (k === 'w' || k === 'arrowup') cam.y += s;
  else if (k === 's' || k === 'arrowdown') cam.y -= s;
  else if (k === 'a' || k === 'arrowleft') cam.x += s;
  else if (k === 'd' || k === 'arrowright') cam.x -= s;
  else return;
  requestDraw();
});
