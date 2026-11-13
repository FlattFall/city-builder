// ---------- Animazioni del tutorial (richiesta dell'utente: il tutorial deve far vedere cosa fare) ----------
// Ogni passo ha una piccola scena isometrica animata in loop: una mano (il cursore) sceglie lo strumento,
// lo mette sulla mappa e si vede il risultato (le auto che arrivano, l'acqua nei tubi, i fili della corrente,
// i campi, il furgone che porta la verdura...). Disegnata con il canvas, con le icone vere del gioco (ICONS).
const TA = { W: 320, H: 150, tw: 40, th: 20 };
const taImgs = {};
function taImg(id) {
  if (!taImgs[id] && ICONS[id]) { taImgs[id] = new Image(); taImgs[id].src = ICONS[id]; }
  return taImgs[id];
}
// Avvia l'animazione del passo `kind` nel canvas; restituisce la funzione per fermarla
function startTutAnim(cv, kind) {
  const c = cv.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = TA.W * dpr; cv.height = TA.H * dpr;
  let raf = 0, t0 = performance.now(), stopped = false;
  const frame = now => {
    if (stopped) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, TA.W, TA.H);
    try { (TA_SCENES[kind] || TA_SCENES.intro)(c, (now - t0) / 1000); } catch (e) { /* una scena non deve rompere il gioco */ }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}

// ---- pezzi di disegno ----
const taO = { x: 160, y: 36 };   // dove sta il tile (0,0)
function taP(gx, gy, h = 0) { return [taO.x + (gx - gy) * TA.tw / 2, taO.y + (gx + gy) * TA.th / 2 - h]; }
function taTile(c, gx, gy, top, side) {
  const a = taP(gx, gy), b = taP(gx + 1, gy), d = taP(gx + 1, gy + 1), e = taP(gx, gy + 1);
  c.fillStyle = side || '#3f7a2a';
  c.beginPath(); c.moveTo(...e); c.lineTo(...d); c.lineTo(b[0], b[1]); c.lineTo(b[0], b[1] + 4); c.lineTo(d[0], d[1] + 4); c.lineTo(e[0], e[1] + 4); c.closePath(); c.fill();
  c.fillStyle = top;
  c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.lineTo(...d); c.lineTo(...e); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 0.6; c.stroke();
}
function taGround(c, w, h, fn) {   // fn(gx, gy) -> [colore, lato] o null (erba)
  for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) {
    const k = fn ? fn(gx, gy) : null;
    taTile(c, gx, gy, k ? k[0] : ((gx + gy) % 2 ? '#5dae3a' : '#62b43e'), k && k[1]);
  }
}
function taRoad(c, gx, gy) {
  taTile(c, gx, gy, '#4a4d57', '#3a3d45');
  const m1 = taP(gx, gy + 0.5), m2 = taP(gx + 1, gy + 0.5);
  c.strokeStyle = '#ffd34d'; c.lineWidth = 1; c.setLineDash([3, 3]);
  c.beginPath(); c.moveTo(m1[0], m1[1]); c.lineTo(m2[0], m2[1]); c.stroke(); c.setLineDash([]);
}
// icona del gioco appoggiata sul tile (size 1 o 2), con un "pop" quando compare (s 0..1)
function taBuilding(c, id, gx, gy, size = 1, s = 1) {
  const img = taImg(id);
  if (!img || !img.complete || s <= 0) return;
  const bottom = taP(gx + size, gy + size);
  const k = (TA.tw * size) / 45 * (s < 1 ? (0.6 + 0.55 * Math.sin(s * Math.PI * 0.85)) : 1);
  const w = 64 * k, h = 48 * k;
  c.globalAlpha = Math.min(1, s * 2);
  c.drawImage(img, bottom[0] - w / 2, bottom[1] + 4 * k - h + 2 * k, w, h);
  c.globalAlpha = 1;
}
// mano che indica (x, y = punta del dito); press = premuto
function taHand(c, x, y, press) {
  c.save(); c.translate(x, y + (press ? 2 : 0)); c.scale(press ? 0.92 : 1, press ? 0.92 : 1);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(4, 18, 7, 2.5, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff'; c.strokeStyle = '#1a1c2c'; c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(0, 0); c.lineTo(3, 0); c.lineTo(3, 7); c.lineTo(10, 8); c.quadraticCurveTo(12, 8.5, 12, 11); c.lineTo(11, 17);
  c.lineTo(1, 17); c.lineTo(-4, 11); c.lineTo(-3, 9); c.lineTo(0, 11); c.closePath();
  c.fill(); c.stroke();
  c.restore();
  if (press) { c.strokeStyle = 'rgba(255,217,102,0.9)'; c.lineWidth = 1.5; c.beginPath(); c.arc(x + 1, y, 6, 0, Math.PI * 2); c.stroke(); }
}
function taLerp(a, b, f) { f = Math.max(0, Math.min(1, f)); f = f * f * (3 - 2 * f); return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
function taTag(c, x, y, text, col = '#a7f070') {
  c.font = 'bold 10px monospace'; const w = c.measureText(text).width + 8;
  x = Math.max(w / 2 + 3, Math.min(TA.W - w / 2 - 3, x)); y = Math.max(11, y);
  c.fillStyle = 'rgba(20,24,40,0.9)'; c.fillRect(x - w / 2, y - 8, w, 14);
  c.strokeStyle = col; c.lineWidth = 1; c.strokeRect(x - w / 2, y - 8, w, 14);
  c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x, y - 1);
}
// pulsante della barra strumenti in basso a sinistra (la mano lo preme prima di costruire)
function taToolBtn(c, id, active) {
  c.fillStyle = active ? '#4a4f78' : '#2c2f48'; c.strokeStyle = active ? '#ffd966' : '#44486b'; c.lineWidth = 2;
  c.fillRect(6, TA.H - 40, 44, 34); c.strokeRect(6, TA.H - 40, 44, 34);
  const img = taImg(id); if (img && img.complete) c.drawImage(img, 8, TA.H - 40, 40, 30);
}
function taCar(c, path, f, col) {   // macchinina lungo una lista di punti (f 0..1)
  const n = path.length - 1, i = Math.min(n - 1, Math.floor(f * n)), lf = f * n - i;
  const p = taLerp(path[i], path[i + 1], lf);
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(p[0] - 4, p[1] - 1, 9, 3);
  c.fillStyle = col; c.fillRect(p[0] - 4, p[1] - 5, 9, 4);
  c.fillStyle = '#9fd3e8'; c.fillRect(p[0] - 2, p[1] - 7, 5, 2);
  return p;
}

// Una sequenza: la mano va sul pulsante, lo preme, va sul tile, preme -> l'edificio compare a `tb`
function taPlace(c, t, id, tile, t1 = 0.6) {
  const btn = [28, TA.H - 22], tgt = taP(tile[0] + 0.5, tile[1] + 0.5);
  const active = t > t1 + 0.4;
  taToolBtn(c, id, active);
  let hp, press = false;
  if (t < t1) hp = taLerp([TA.W - 30, TA.H - 10], btn, t / t1);
  else if (t < t1 + 0.4) { hp = btn; press = t < t1 + 0.25; }
  else if (t < t1 + 1.4) hp = taLerp(btn, tgt, (t - t1 - 0.4) / 1);
  else { hp = tgt; press = t < t1 + 1.7; }
  return { hand: () => taHand(c, hp[0], hp[1], press), built: t - (t1 + 1.5) };
}

const TA_SCENES = {
  // inizio: le case compaiono una dopo l'altra lungo la strada, arrivano le auto
  intro(c, T) {
    const t = T % 6;
    taGround(c, 6, 4, (x, y) => y === 2 ? ['#4a4d57', '#3a3d45'] : null);
    for (let x = 0; x < 6; x++) taRoad(c, x, 2);
    const order = [[0, 1], [2, 1], [4, 1], [1, 3], [3, 3], [5, 3]];
    order.forEach(([x, y], i) => taBuilding(c, i === 4 ? 'supermarket' : 'house', x, y, 1, Math.min(1, (t - i * 0.6) / 0.5)));
    const road = [taP(-0.5, 2.6), taP(6.5, 2.6)];
    if (t > 1) taCar(c, road, ((t - 1) / 4) % 1, '#3f6fd9');
    if (t > 2.5) taCar(c, road, ((t - 2.5) / 4) % 1, '#d94141');
    taTag(c, TA.W - 58, 18, TR('Città che cresce'));
  },
  // case accanto alla strada principale: le famiglie arrivano in auto
  house(c, T) {
    const t = T % 6.5;
    taGround(c, 6, 4);
    for (let x = 0; x < 6; x++) taRoad(c, x, 2);
    const sq = taPlace(c, t, 'house', [2, 1]);
    if (sq.built > 0) taBuilding(c, 'house', 2, 1, 1, Math.min(1, sq.built / 0.4));
    if (sq.built > 0.6) {
      const f = Math.min(1, (sq.built - 0.6) / 1.8);
      const p = taCar(c, [taP(-0.5, 2.6), taP(2.5, 2.6)], f, '#3f6fd9');
      if (f >= 1) taTag(c, p[0] + 4, p[1] - 30, TR('+4 abitanti'));
    }
    sq.hand();
  },
  // pozzo sulla zona azzurra accanto alla strada: l'acqua corre nei tubi sotto le strade
  waterWell(c, T) {
    const t = T % 6.5;
    const blue = (x, y) => (x >= 1 && x <= 3 && y <= 1) ? ['#6fb4e6', '#3f7aa8'] : null;
    taGround(c, 6, 4, blue);
    for (let x = 0; x < 6; x++) taRoad(c, x, 2);
    taBuilding(c, 'house', 4, 3);
    const sq = taPlace(c, t, 'waterWell', [2, 1]);
    if (sq.built > 0) {
      taBuilding(c, 'waterWell', 2, 1, 1, Math.min(1, sq.built / 0.4));
      for (let i = 0; i < 5; i++) {   // gocce che scorrono lungo la strada fino alla casa
        const f = ((sq.built * 0.5 + i / 5) % 1);
        const p = taLerp(taP(2.5, 2.5), taP(4.5, 2.5), f);
        c.fillStyle = '#4faaff'; c.beginPath(); c.arc(p[0], p[1], 2, 0, Math.PI * 2); c.fill();
      }
    }
    sq.hand();
    taTag(c, 70, 18, TR('Zona azzurra = falda'), '#9fd3ff');
  },
  // scarico in riva al mare, collegato con il tubo alla strada
  sewage(c, T) {
    const t = T % 7.5;
    taGround(c, 6, 4, (x, y) => x >= 4 ? ['#3a7fc4', '#2f6fb3'] : null);
    for (let y = 0; y < 4; y++) taRoad(c, 0, y);
    const sq = taPlace(c, t, 'sewage', [2, 1]);
    if (sq.built > 0) taBuilding(c, 'sewage', 2, 1, 2, Math.min(1, sq.built / 0.4));
    if (sq.built > 0.6) {   // il tubo si allunga dallo scarico alla strada
      const f = Math.min(1, (sq.built - 0.6) / 1.5);
      const a = taP(2, 1.6), b = taP(1, 1.6);
      const e = taLerp(a, b, f);
      c.strokeStyle = '#4faaff'; c.lineWidth = 3; c.beginPath(); c.moveTo(...a); c.lineTo(...e); c.stroke();
      if (f >= 1) taTag(c, b[0], b[1] - 16, TR('Collegato!'));
      const out = taP(5.2, 1.6);   // getto marrone in mare
      for (let i = 0; i < 2; i++) { const r = ((T * 0.7 + i / 2) % 1); c.strokeStyle = 'rgba(150,115,65,' + (1 - r) + ')'; c.beginPath(); c.ellipse(out[0], out[1], 3 + r * 10, 1.5 + r * 5, 0, 0, Math.PI * 2); c.stroke(); }
    }
    sq.hand();
  },
  // tralicci dal bordo della mappa alla città, poi la sottostazione accanto alla strada
  pylon(c, T) {
    const t = T % 8;
    taGround(c, 6, 4, (x, y) => x === 0 ? ['#2a2d3a', '#1f2230'] : null);
    for (let x = 1; x < 6; x++) taRoad(c, x, 3);
    taBuilding(c, 'house', 4, 2); taBuilding(c, 'house', 5, 2);
    const pts = [[1, 1], [2, 1], [3, 0]];
    const n = Math.min(3, Math.floor(t / 1.1));
    taToolBtn(c, n < 3 ? 'pylon' : 'substation', true);
    for (let i = 0; i < n; i++) taBuilding(c, 'pylon', pts[i][0], pts[i][1], 1, Math.min(1, (t - i * 1.1 - 0.4) / 0.4));
    c.strokeStyle = '#d6dbe0'; c.lineWidth = 1;
    for (let i = 1; i < n; i++) { const a = taP(pts[i - 1][0] + 0.5, pts[i - 1][1] + 0.5, 21), b = taP(pts[i][0] + 0.5, pts[i][1] + 0.5, 21); c.beginPath(); c.moveTo(...a); c.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 5, ...b); c.stroke(); }
    if (n >= 1) { const a = taP(-0.6, 1.5, 21), b = taP(pts[0][0] + 0.5, pts[0][1] + 0.5, 21); c.beginPath(); c.moveTo(...a); c.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 5, ...b); c.stroke(); }
    const st = t - 3.6;
    if (st > 0) taBuilding(c, 'substation', 3, 2, 1, Math.min(1, st / 0.4));
    let hp = n < 3 ? taP(pts[Math.min(2, n)][0] + 0.5, pts[Math.min(2, n)][1] + 0.5) : taP(3.5, 2.5);
    taHand(c, hp[0], hp[1], (t % 1.1) < 0.25 && t < 4);
    if (st > 0.8) {   // fulmine che corre lungo la strada fino alle case
      const f = ((st - 0.8) * 0.8) % 1, p = taLerp(taP(3.5, 3.5), taP(5.5, 3.5), f);
      c.fillStyle = '#ffd34d'; c.beginPath(); c.moveTo(p[0] - 2, p[1] - 6); c.lineTo(p[0] + 2, p[1] - 6); c.lineTo(p[0], p[1] - 2); c.lineTo(p[0] + 3, p[1] - 2); c.lineTo(p[0] - 2, p[1] + 4); c.lineTo(p[0], p[1] - 1); c.lineTo(p[0] - 3, p[1] - 1); c.closePath(); c.fill();
      taTag(c, TA.W - 70, 18, TR('Case con la corrente'), '#ffd34d');
    }
    taTag(c, 40, 30, TR('Bordo della mappa'), '#94b0c2');
  },
  // fattoria e campi intorno
  farm(c, T) {
    const t = T % 8;
    const fields = [[0, 0], [1, 0], [0, 1], [1, 1], [4, 0], [5, 0], [4, 1], [5, 1]];
    const sq = taPlace(c, t, 'farm', [2, 0], 0.5);
    const nf = sq.built > 0.6 ? Math.min(fields.length, Math.floor((sq.built - 0.6) / 0.35) + 1) : 0;
    const grow = Math.max(0, Math.min(1, (sq.built - 4) / 1.5));
    taGround(c, 6, 4, (x, y) => fields.slice(0, nf).some(f => f[0] === x && f[1] === y) ? [grow > 0.5 ? '#d9b44a' : '#8a5a32', '#6b4428'] : null);
    for (let x = 0; x < 6; x++) taRoad(c, x, 3);
    if (sq.built > 0) taBuilding(c, 'farm', 2, 0, 2, Math.min(1, sq.built / 0.4));
    taToolBtn(c, nf ? 'field' : 'farm', true);
    if (nf && nf < fields.length) { const f = fields[nf - 1], p = taP(f[0] + 0.5, f[1] + 0.5); taHand(c, p[0], p[1], true); }
    else sq.hand();
    if (nf >= fields.length) taTag(c, TA.W - 50, 18, grow > 0.5 ? TR('Raccolto!') : TR('Fatto'), '#ffd966');
  },
  // supermercato come destinazione: il furgone porta la verdura, le tasse diventano soldi
  supermarket(c, T) {
    const t = T % 7;
    taGround(c, 6, 4);
    for (let x = 0; x < 6; x++) taRoad(c, x, 2);
    taBuilding(c, 'farm', 0, 0, 2);
    taBuilding(c, 'house', 3, 3); taBuilding(c, 'house', 5, 3);
    const sq = taPlace(c, t, 'supermarket', [4, 0]);
    if (sq.built > 0) taBuilding(c, 'supermarket', 4, 0, 2, Math.min(1, sq.built / 0.4));
    if (sq.built > 0.5 && sq.built < 1.6) {   // finestra della fattoria: "Dove portare il raccolto" -> Supermercato
      c.fillStyle = 'rgba(38,43,68,0.95)'; c.fillRect(160, 40, 150, 44); c.strokeStyle = '#ffd966'; c.lineWidth = 2; c.strokeRect(160, 40, 150, 44);
      c.font = 'bold 9px monospace'; c.fillStyle = '#ffd966'; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(TR('Dove portare il raccolto'), 166, 50);
      c.fillStyle = sq.built > 1.1 ? '#4a4f78' : '#2c2f48'; c.fillRect(166, 58, 138, 18); c.strokeStyle = sq.built > 1.1 ? '#ffd966' : '#44486b'; c.strokeRect(166, 58, 138, 18);
      c.fillStyle = '#f4f4f4'; c.fillText((sq.built > 1.1 ? '✔ ' : '') + BUILDINGS.supermarket.name, 172, 67);
      taHand(c, 240, 68, sq.built > 1 && sq.built < 1.2);
    } else sq.hand();
    if (sq.built > 1.6) {
      const f = Math.min(1, (sq.built - 1.6) / 2.2);
      const p = taCar(c, [taP(1.5, 2.5), taP(4.5, 2.5)], f, '#f2f2f2');
      if (f >= 1) taTag(c, p[0], p[1] - 34, TR('+ tasse'), '#ffd966');
    }
  },
  // dopo: lavoratori e icone
  end(c, T) {
    const t = T % 5;
    taGround(c, 6, 4);
    for (let x = 0; x < 6; x++) taRoad(c, x, 2);
    taBuilding(c, 'house', 0, 1); taBuilding(c, 'house', 1, 1); taBuilding(c, 'factory', 3, 0, 2);
    const p = taP(4, 0, 38);
    c.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4);
    c.fillStyle = '#d94141'; c.beginPath(); c.arc(p[0], p[1], 7, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.fillRect(p[0] - 1, p[1] - 4, 2, 5); c.fillRect(p[0] - 1, p[1] + 2, 2, 2);
    c.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {   // lavoratori che vanno dalle case alla fabbrica
      const f = ((t / 2.5 + i / 3) % 1), q = taLerp(taP(1, 2.3), taP(3.5, 2.3), f);
      c.fillStyle = ['#d94141', '#3f6fd9', '#3fa34d'][i]; c.fillRect(q[0] - 1, q[1] - 5, 2.5, 3.5);
      c.fillStyle = '#f1c9a5'; c.beginPath(); c.arc(q[0] + 0.2, q[1] - 6.5, 1.2, 0, Math.PI * 2); c.fill();
    }
    taTag(c, p[0] + 40, p[1] - 4, TR('Cosa manca?'), '#ff9b6b');
  },
};
