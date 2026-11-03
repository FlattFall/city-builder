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
