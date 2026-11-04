// ---------- Sprite in pixel art ----------
// Gli sprite sono disegnati per tile da 64x32 pixel: due pixel dello sprite per ogni unità
// del mondo (che ha tile 32x16). Allo zoom normale (x2) e a x4 si vedono pixel perfetti.
const SPRITE_SCALE = 2;
const SPRITES = {};

for (const [name, d] of Object.entries(SPRITE_DATA)) {
  const img = new Image();
  SPRITES[name] = { ...d, img, ready: false };
  img.onload = () => {
    SPRITES[name].ready = true;
    if (typeof onSpritesLoaded === 'function') onSpritesLoaded(name);
    if (typeof requestDraw === 'function') requestDraw();
  };
  img.src = d.src;
}

// Copia dello sprite con il colore "maschera" (rosso 255, verde 0, blu = tono x 40) sostituito da
// una scala di toni del colore scelto: così ogni auto ha la sua carrozzeria. Le copie restano in memoria.
const tintCacheImg = new Map();
function tintedSprite(name, color) {
  const s = SPRITES[name];
  if (!s || !s.ready) return null;
  const key = name + color;
  let cv = tintCacheImg.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = s.img.width; cv.height = s.img.height;
  const c = cv.getContext('2d');
  c.drawImage(s.img, 0, 0);
  const data = c.getImageData(0, 0, cv.width, cv.height), p = data.data;
  const tones = [0.45, 0.2, 0, -0.2, -0.4, -0.58].map(f => {
    const h = shade(color, f), n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  });
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] && p[i] === 255 && p[i + 1] === 0) {
      const t = tones[Math.min(5, Math.round(p[i + 2] / 40))];
      p[i] = t[0]; p[i + 1] = t[1]; p[i + 2] = t[2];
    }
  }
  c.putImageData(data, 0, 0);
  tintCacheImg.set(key, cv);
  return cv;
}

// Come drawSprite, ma con un'immagine già ricolorata (stessa griglia dello sprite "name")
function drawSpriteImage(c, name, img, col, row, wx, wy) {
  const s = SPRITES[name], [cw, ch] = s.cell, [ax, ay] = s.anchor;
  const smooth = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = c.getTransform().a < SPRITE_SCALE;
  c.drawImage(img, col * cw, row * ch, cw, ch, wx - ax / SPRITE_SCALE, wy - ay / SPRITE_SCALE, cw / SPRITE_SCALE, ch / SPRITE_SCALE);
  c.imageSmoothingEnabled = smooth;
}

// Disegna la cella (col, row) dello sprite con l'angolo in alto del tile nel punto mondo (wx, wy).
// Restituisce false se l'immagine non è ancora pronta (così si usa il disegno di riserva).
function drawSprite(c, name, col, row, wx, wy) {
  const s = SPRITES[name];
  if (!s || !s.ready) return false;
  const [cw, ch] = s.cell, [ax, ay] = s.anchor;
  const scale = c.getTransform().a;
  const smooth = c.imageSmoothingEnabled;
  c.imageSmoothingEnabled = scale < SPRITE_SCALE;   // rimpicciolito: sfumato, altrimenti pixel netti
  c.drawImage(s.img, (col % s.cols) * cw, (row % s.rows) * ch, cw, ch,
    wx - ax / SPRITE_SCALE, wy - ay / SPRITE_SCALE, cw / SPRITE_SCALE, ch / SPRITE_SCALE);
  c.imageSmoothingEnabled = smooth;
  return true;
}
