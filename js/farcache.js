// ---------- Vista da lontano più fluida (richiesta dell'utente: con lo zoom più lontano andava a scatti) ----------
// Con lo zoom lontano si vedono decine di migliaia di tile: disegnarli tutti a ogni fotogramma era troppo.
// Il paesaggio fermo (terreno, strade, edifici, alberi, ponti) si disegna una volta in immagini quadrate
// di FAR_SIZE pixel ("piastrelle" dello schermo) e poi si copia: un fotogramma = poche drawImage.
// Ogni piastrella si disegna con lo stesso ordine del pittore dello schermo (paintTiles), ritagliata ai
// suoi bordi, così le piastrelle si attaccano senza giunte.
// Quando un tile cambia (strada, edificio, terreno, raccolto...) se ne accorge la "firma" del tile
// (tileSig): le piastrelle intorno si ridisegnano. Veicoli, anteprime e icone vanno sopra, a ogni fotogramma.
const FAR_CACHE = true;
const FAR_SIZE = 512;            // lato di una piastrella in pixel dello schermo
const FAR_OBJ_H = 130;           // quanto può salire un oggetto sopra il suo tile (pixel del mondo)
const FAR_MAX = 90;              // piastrelle in memoria al massimo (1 MB l'una)
const farCache = { z: 0, map: null, tiles: new Map(), sig: null, sigOk: null };

function farReset() { farCache.tiles.clear(); farCache.sig = null; }

// Tile che possono disegnare qualcosa nel rettangolo del mondo [wx0, wx1] x [wy0, wy1]
function farRange(wx0, wy0, wx1, wy1) {
  const N = game.size, hw = TW / 2, hh = TH / 2;
  const aMin = Math.floor(wx0 / hw) - 2, aMax = Math.ceil(wx1 / hw) + 2;               // a = x - y
  const sMin = Math.floor((wy0 - TH) / hh) - 2;                                          // s = x + y
  const sMax = Math.ceil((wy1 + (game.maxElev + 1) * STEP + FAR_OBJ_H) / hh) + 2;
  const y0 = Math.max(0, Math.floor((sMin - aMax) / 2)), y1 = Math.min(N - 1, Math.ceil((sMax - aMin) / 2));
  const rowA = y => Math.max(0, y + aMin, sMin - y), rowB = y => Math.min(N - 1, y + aMax, sMax - y);
  const visible = (x, y) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return false;
    const a = x - y, s = x + y;
    if (a < aMin || a > aMax || s < sMin || s > sMax) return false;
    const top = s * hh - game.map[y][x].elev * STEP - FAR_OBJ_H, bottom = s * hh + TH + 2;
    return bottom >= wy0 && top <= wy1;
  };
  return { y0, y1, rowA, rowB, visible };
}

// Firma di un tile: cambia quando cambia il suo aspetto da lontano
const FAR_PATH = { road: 1, oneway: 2, highway: 3, dirt: 4, rail: 5 };
function strCode(s) { let h = 0; if (s) for (let i = 0; i < s.length; i++) h = Math.imul(h, 31) + s.charCodeAt(i) | 0; return h; }
function tileSig(t, x, y) {
  let h = t.type + t.elev * 8 + (FAR_PATH[t.path] || 0) * 4096 + ((t.dir || 0) + 1) * 65536;
  if (t.field) {
    const f = t.farm && game.buildings.get(t.farm);
    h = Math.imul(h ^ 0x51ed, 31) + (f ? strCode(f.crop) + Math.min(3, Math.floor(f.growth * 4)) * 7 + f.id * 131 : 1) | 0;
  }
  const b = t.building;
  if (b) h = Math.imul(h ^ (b.id * 2654435761 | 0), 33) + (b.rot | 0) * 97 + (b.level | 0) * 389 + (b.flow > 0 ? 7 : 0)
    + ((b.feed ?? 9) + 1) * 1031 + (b.armV === false ? 3 : 0) + strCode(b.animal) | 0;
  if (t.bridge) {
    const br = game.bridges.get(t.bridge.id);
    h = Math.imul(h ^ (t.bridge.id * 7919 + t.bridge.i), 37) + (br ? strCode(br.path) + (br.e[t.bridge.i] | 0) * 13 : 0) | 0;
  }
  if (t.type === T.FOREST && game.treeCuts && game.treeCuts.size) h = Math.imul(h, 41) + treeCutSig(x, y) | 0;
  return h | 0;
}

// Le piastrelle intorno al tile (x, y) (con i vicini: strade e pareti dipendono da loro) vanno ridisegnate
function farDirty(x, y, z) {
  const hw = TW / 2, hh = TH / 2;
  const wx0 = (x - y - 3) * hw, wx1 = (x - y + 3) * hw;
  const wy0 = (x + y - 2) * hh - (game.maxElev + 1) * STEP - FAR_OBJ_H, wy1 = (x + y + 4) * hh + TH;
  const cx0 = Math.floor(wx0 * z / FAR_SIZE), cx1 = Math.floor(wx1 * z / FAR_SIZE);
  const cy0 = Math.floor(wy0 * z / FAR_SIZE), cy1 = Math.floor(wy1 * z / FAR_SIZE);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) farCache.tiles.delete(cx + ',' + cy);
}

// Controllo delle firme nei tile che toccano le piastrelle visibili (con un margine di una piastrella)
function farCheck(z, cx0, cy0, cx1, cy1) {
  const N = game.size;
  let fresh = false;
  if (!farCache.sig || farCache.sig.length !== N * N) { farCache.sig = new Int32Array(N * N); farCache.sigOk = new Uint8Array(N * N); fresh = true; }
  const S = farCache.sig, ok = farCache.sigOk;
  const R = farRange((cx0 - 1) * FAR_SIZE / z, (cy0 - 1) * FAR_SIZE / z, (cx1 + 2) * FAR_SIZE / z, (cy1 + 2) * FAR_SIZE / z);
  for (let y = R.y0; y <= R.y1; y++) {
    const row = game.map[y];
    for (let x = R.rowA(y), xb = R.rowB(y); x <= xb; x++) {
      const k = y * N + x, g = tileSig(row[x], x, y);
      if (S[k] !== g || !ok[k]) {
        if (ok[k] && !fresh) farDirty(x, y, z);
        S[k] = g; ok[k] = 1;
      }
    }
  }
}

function farRender(cx, cy, z) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = FAR_SIZE;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.setTransform(z, 0, 0, z, -cx * FAR_SIZE, -cy * FAR_SIZE);
  const wx0 = cx * FAR_SIZE / z, wy0 = cy * FAR_SIZE / z, w = FAR_SIZE / z;
  const R = farRange(wx0, wy0, wx0 + w, wy0 + w);
  const N = game.size, none = new Map();
  paintTiles(N, R.y0, R.y1, R.rowA, R.rowB, R.visible, none, (x, y) => {
    drawTile(c, x, y, false);
    const tb = game.map[y][x].bridge;
    if (tb) {
      const br = game.bridges.get(tb.id);
      if (!isTunnel(br)) drawBridgeSpan(c, x, y, br, tb.i);
      else if (tb.i === 1) drawPortal(c, x, y, (br.d + 2) % 4, br.e[0]);
      if (isTunnel(br) && tb.i === br.n - 1) drawPortal(c, x, y, br.d, br.e[br.n - 1]);
    }
  });
  return cv;
}

// Disegna il paesaggio da lontano (ctx ha già la trasformazione della camera)
function drawFar(z) {
  if (farCache.z !== z || farCache.map !== game.map) { farReset(); farCache.z = z; farCache.map = game.map; }
  const ox = Math.round(cam.x), oy = Math.round(cam.y);
  const cx0 = Math.floor(-ox / FAR_SIZE), cx1 = Math.floor((view.w - ox) / FAR_SIZE);
  const cy0 = Math.floor(-oy / FAR_SIZE), cy1 = Math.floor((view.h - oy) / FAR_SIZE);
  farCheck(z, cx0, cy0, cx1, cy1);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    const key = cx + ',' + cy;
    let img = farCache.tiles.get(key);
    if (img) farCache.tiles.delete(key);   // in fondo alla coda: usata da poco
    else img = farRender(cx, cy, z);
    farCache.tiles.set(key, img);
    ctx.drawImage(img, ox + cx * FAR_SIZE, oy + cy * FAR_SIZE);
  }
  while (farCache.tiles.size > FAR_MAX) farCache.tiles.delete(farCache.tiles.keys().next().value);
  ctx.restore();
}
