// ---------- Disegni del settore energia e petrolio ----------
// Stesso stile degli altri edifici (box, contorni, parti ordinate con drawParts). Qui ci sono
// anche il cilindro (serbatoi, torri di raffreddamento, colonne) e le parti animate
// (pale eoliche, pompa del pozzo, fiamma): quando si vedono, animSeen = true fa ridisegnare.

// Cilindro verticale con centro (cu, cv) del riquadro, raggio r (in tile), alto hp pixel
function cyl(c, ax, ay, base, cu, cv, r, hp, col) {
  const [x0, y0] = iso(ax, ay, cu, cv, base), [x1, y1] = iso(ax, ay, cu, cv, base + hp / STEP);
  const rx = r * TW * 0.7071, ry = r * TH * 0.7071;
  c.fillStyle = col.l;                                    // metà sinistra (alla luce)
  c.beginPath(); c.moveTo(x1 - rx, y1); c.lineTo(x0 - rx, y0); c.ellipse(x0, y0, rx, ry, 0, Math.PI, Math.PI / 2, true); c.lineTo(x1, y1 + ry); c.closePath(); c.fill();
  c.fillStyle = col.r;                                    // metà destra (in ombra)
  c.beginPath(); c.moveTo(x1, y1 + ry); c.lineTo(x0, y0 + ry); c.ellipse(x0, y0, rx, ry, 0, Math.PI / 2, 0, true); c.lineTo(x1 + rx, y1); c.closePath(); c.fill();
  if (col.band) for (const f of col.band) {               // fasce colorate (camini, colonne)
    const yb = y0 + (y1 - y0) * f;
    c.fillStyle = col.bandColor || '#d94141';
    c.beginPath(); c.ellipse(x0, yb, rx, ry, 0, 0, Math.PI); c.lineTo(x0 - rx, yb - 1.4); c.ellipse(x0, yb - 1.4, rx, ry, 0, Math.PI, 0, true); c.closePath(); c.fill();
  }
  c.fillStyle = col.t;
  c.beginPath(); c.ellipse(x1, y1, rx, ry, 0, 0, Math.PI * 2); c.fill();
  if (col.hollow) { c.fillStyle = col.hollow; c.beginPath(); c.ellipse(x1, y1, rx * 0.75, ry * 0.75, 0, 0, Math.PI * 2); c.fill(); }
  if (DETAIL) {
    c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 0.4;
    c.beginPath(); c.ellipse(x1, y1, rx, ry, 0, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(x1 - rx, y1); c.lineTo(x0 - rx, y0); c.ellipse(x0, y0, rx, ry, 0, Math.PI, 0, true); c.lineTo(x1 + rx, y1); c.stroke();
    aline(c, [x1 - rx * 0.55, y1 + ry * 0.4], [x0 - rx * 0.55, y0 + ry * 0.4], '#ffffff', 0.25);   // riflesso
  }
  return base + hp / STEP;
}

// Parti di un edificio 1x1 (carbonaia, pozzo, distributore): come drawParts ma nel riquadro 1x1
function drawParts1(c, x, y, base, r, parts) {
  const items = parts.map((p, i) => {
    const b = rotBox(p.box.map(v => v * 2), r).map(v => v / 2);
    return { p, b, i, depth: b[2] + b[3] };
  });
  for (const { p, b } of sortParts(items)) {
    if (p.cyl) cyl(c, x, y, base + (p.z || 0) / STEP, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, Math.min(b[2] - b[0], b[3] - b[1]) / 2, p.h, p.col);
    else box(c, x, y, base + (p.z || 0) / STEP, b[0], b[1], b[2], b[3], p.h, p.col);
    if (p.after) p.after(b);
  }
}
// Parti 2x2 con anche i cilindri (cyl: true) e una quota di partenza (z, in pixel)
// group: pezzi che si sovrappongono (es. la gru: gambe, telaio, braccio) si ordinano tra loro come
// gruppo unico rispetto agli altri pezzi; dentro, dal basso verso l'alto e poi dal fondo al davanti
function drawParts2(c, ax, ay, base, r, parts, one) {   // one = edificio 1x1 (riquadri da 0 a 1)
  const rb = bx => one ? rotBox(bx.map(v => v * 2), r).map(v => v / 2) : rotBox(bx, r);
  const flat = [];
  for (const p of parts) {
    if (!p.group) { flat.push(p); continue; }
    const bs = p.group.map(q => q.box);
    flat.push({ box: [Math.min(...bs.map(b => b[0])), Math.min(...bs.map(b => b[1])), Math.max(...bs.map(b => b[2])), Math.max(...bs.map(b => b[3]))], group: p.group });
  }
  const items = flat.map((p, i) => { const b = rb(p.box); return { p, b, i, depth: b[2] + b[3] }; });
  for (const it of sortParts(items)) {
    if (!it.p.group) { drawPart2(c, ax, ay, base, r, it.p, it.b); continue; }
    const subs = it.p.group.map(q => { const b = rb(q.box); return { q, b, z: q.z || 0, depth: b[2] + b[3] }; })
      .sort((x, y) => x.z - y.z || x.depth - y.depth);
    for (const sub of subs) drawPart2(c, ax, ay, base, r, sub.q, sub.b);
  }
}
function drawPart2(c, ax, ay, base, r, p, b) {
  const z0 = base + (p.z || 0) / STEP;
  let top;
  if (p.cyl) top = cyl(c, ax, ay, z0, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2, Math.min(b[2] - b[0], b[3] - b[1]) / 2, p.h, p.col);
  else top = box(c, ax, ay, z0, b[0], b[1], b[2], b[3], p.h, p.col);
  if (p.roof) gableRoof(c, ax, ay, top, b[0] - 0.04, b[1] - 0.04, b[2] + 0.04, b[3] + 0.04, p.roof.rh, Object.assign({ gableL: p.col.l }, p.roof), (r & 1) === 1);
  if (p.doors) for (const d of p.doors) drawDoor(c, ax, ay, z0, r, p.box, d);
  if (p.after) p.after(b, top);
}

function smokePuff(c, x, y, k) {   // nuvolette di fumo che salgono piano
  if (!DETAIL) return;
  animSeen = true;
  for (let i = 0; i < 3; i++) {
    const t = (animT * 0.35 + i / 3 + k) % 1;
    c.fillStyle = 'rgba(210,210,215,' + (0.55 * (1 - t)).toFixed(2) + ')';
    c.beginPath(); c.arc(x + t * 5, y - t * 10, 1.4 + t * 2.4, 0, Math.PI * 2); c.fill();
  }
}

const CONCRETE = { l: '#c9c6bd', r: '#a8a59c', t: '#dcd9d0' };
const STEEL_PART = { l: '#b8bec6', r: '#8f959d', t: '#d6dbe0' };
const TANK = { l: '#f2f2ee', r: '#cfd1cc', t: '#e4e6e2' };
const CRANE = { l: '#e8c23a', r: '#c9a42a', t: '#f2d870' };

// Carbonaia 1x1: cumulo di terra a cupola che fuma, legna accatastata, sacchi di carbone
function drawCharcoalKiln(c, x, y, base, r) {
  const P = (u, v, h) => iso(x, y, u, v, base + h / STEP);
  const pile = { l: '#b07a48', r: '#8a5a32', t: '#c99a62' };
  drawParts1(c, x, y, base, r, [
    { box: [0.18, 0.18, 0.62, 0.62], h: 3, col: { l: '#6b5232', r: '#54401f', t: '#5a4630' } },
    { box: [0.24, 0.24, 0.56, 0.56], h: 3, z: 3, col: { l: '#5a4630', r: '#46361f', t: '#4a3a28' } },
    { box: [0.3, 0.3, 0.5, 0.5], h: 2.5, z: 6, col: { l: '#4a3a28', r: '#3a2c1c', t: '#2e2418' } },
    { box: [0.68, 0.16, 0.86, 0.6], h: 4, col: pile },                        // legna accatastata
    { box: [0.22, 0.7, 0.4, 0.86], h: 3, col: { l: '#3a3a40', r: '#2b2b30', t: '#4a4a52' } },   // sacchi di carbone
    { box: [0.46, 0.7, 0.62, 0.86], h: 3, col: { l: '#3a3a40', r: '#2b2b30', t: '#4a4a52' } },
  ]);
  const top = P(0.4, 0.4, 9);
  smokePuff(c, top[0], top[1], hash(x, y, 3));
}

// Centrale a carbone 2x2: capannone delle caldaie, ciminiera a strisce, torre di raffreddamento,
// mucchio di carbone vicino all'entrata
function drawCoalPlant(c, ax, ay, base, r) {
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  groundRect(c, ax, ay, base, [0.28, 1.45, 0.72, 2.0], r, '#6f6f6a');
  drawParts2(c, ax, ay, base, r, [
    { box: [0.12, 0.15, 1.05, 1.0], h: 18, col: { l: '#a8a39a', r: '#86827a', t: '#7a766e' },
      doors: [{ face: '+v', a: 0.35, b: 0.75, z1: 10, color: '#4a4a52' }, { face: '+u', a: 0.3, b: 0.8, z0: 11, z1: 15, color: '#9fd3e8' }] },
    { box: [0.62, 0.22, 0.86, 0.46], h: 46, cyl: true, col: { l: '#d8d4cc', r: '#b2aea6', t: '#3a3a40', hollow: '#1a1a1e', band: [0.8, 0.92], bandColor: '#d94141' },
      after(b, top) { const p = P((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, top); smokePuff(c, p[0], p[1], 0.3); } },
    { box: [1.2, 0.2, 1.85, 0.85], h: 30, cyl: true, col: { l: '#d6d3cb', r: '#aeaba3', t: '#bdbab2', hollow: '#6a6862' },
      after(b, top) { const p = P((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, top); smokePuff(c, p[0], p[1] - 1, 0.7); } },
    { box: [1.1, 1.15, 1.8, 1.75], h: 4, col: { l: '#2b2b30', r: '#202024', t: '#3a3a40' },
      after(b, top) { poly(c, [P(b[0] + 0.1, b[1] + 0.1, top), P(b[2] - 0.1, b[1] + 0.1, top), P((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, top + 0.6)], '#4a4a52'); } },
    { box: [1.05, 0.95, 1.2, 1.25], h: 10, col: STEEL_PART },   // nastro trasportatore
  ]);
}

// Centrale solare 2x2: file di pannelli inclinati e una cabina degli inverter
function drawSolarPlant(c, ax, ay, base, r) {
  const P = (u, v, h) => iso(ax, ay, u, v, base + h / STEP);
  box(c, ax, ay, base, 0.1, 0.1, 0.42, 0.38, 8, CONCRETE);
  for (let i = 0; i < 4; i++) {
    const v0 = 0.5 + i * 0.36, v1 = v0 + 0.24, u0 = i === 0 ? 0.52 : 0.12, u1 = 1.88;
    const q = [P(u0, v0, 5), P(u1, v0, 5), P(u1, v1, 2), P(u0, v1, 2)];
    for (const u of [u0 + 0.05, u1 - 0.05]) line(c, P(u, v1 - 0.02, 0), P(u, v1 - 0.02, 2), '#6b7077');   // gambe
    poly(c, q, '#2f4a85');
    poly(c, [P(u0, v1, 2), P(u1, v1, 2), P(u1, v1, 1.4), P(u0, v1, 1.4)], '#1f2f55');
    if (DETAIL) {
      for (let k = 1; k < 8; k++) { const u = u0 + (u1 - u0) * k / 8; aline(c, P(u, v0, 5), P(u, v1, 2), '#9fc3f0', 0.5); }
      aline(c, P(u0, (v0 + v1) / 2, 3.5), P(u1, (v0 + v1) / 2, 3.5), '#9fc3f0', 0.5);
      aline(c, P(u0 + 0.1, v0 + 0.03, 4.9), P(u0 + 0.5, v0 + 0.03, 4.9), '#ffffff', 0.6);   // riflesso
    }
  }
}

// Centrale eolica 2x2: due torri bianche con la navicella e le pale che girano
function drawWindPlant(c, ax, ay, base, r) {
  const P = (u, v, h) => iso(ax, ay, u, v, base + h / STEP);
  const spots = [[0.6, 0.6], [1.42, 1.42]];
  if (r & 1) spots.reverse();
  spots.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
  for (const [u, v] of spots) {
    box(c, ax, ay, base, u - 0.16, v - 0.16, u + 0.16, v + 0.16, 2, CONCRETE);
    const H = 52, b = P(u, v, 2), t = P(u, v, H);
    c.fillStyle = '#f2f4f6'; c.beginPath(); c.moveTo(b[0] - 1.6, b[1]); c.lineTo(t[0] - 0.7, t[1]); c.lineTo(t[0] + 0.7, t[1]); c.lineTo(b[0] + 1.6, b[1]); c.closePath(); c.fill();
    c.fillStyle = '#c9ced4'; c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(t[0], t[1]); c.lineTo(t[0] + 0.7, t[1]); c.lineTo(b[0] + 1.6, b[1]); c.closePath(); c.fill();
    box(c, ax, ay, base + H / STEP, u - 0.08, v - 0.14, u + 0.08, v + 0.1, 3, { l: '#f2f4f6', r: '#c9ced4', t: '#ffffff' });   // navicella
    const hub = P(u + 0.02, v + 0.12, H + 1.5);
    if (DETAIL) animSeen = true;
    const a0 = animT * 2.2 + u * 3;
    c.strokeStyle = '#fafbfc'; c.lineWidth = 1.3; c.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const a = a0 + k * Math.PI * 2 / 3;
      c.beginPath(); c.moveTo(hub[0], hub[1]); c.lineTo(hub[0] + Math.cos(a) * 13, hub[1] + Math.sin(a) * 13); c.stroke();
    }
    c.lineCap = 'butt';
    c.fillStyle = '#8f959d'; c.beginPath(); c.arc(hub[0], hub[1], 1, 0, Math.PI * 2); c.fill();
  }
}

// Pozzo petrolifero 1x1: pompa a cavalletto che fa su e giù, serbatoio
function drawOilWell(c, x, y, base, r) {
  const P = (u, v, h) => iso(x, y, u, v, base + h / STEP);
  drawParts1(c, x, y, base, r, [
    { box: [0.15, 0.2, 0.8, 0.5], h: 1.5, col: CONCRETE },
    { box: [0.55, 0.62, 0.85, 0.9], h: 9, cyl: true, col: { l: '#3a3a40', r: '#2b2b30', t: '#4a4a52' } },   // serbatoio
  ]);
  // cavalletto: piramide a A e bilanciere che oscilla (in coordinate del tile, lungo u o v secondo la rotazione)
  const alongU = (r & 1) === 0;
  const L = (a, w, h) => alongU ? P(0.2 + a * 0.55, 0.35 + w, h) : P(0.35 + w, 0.2 + a * 0.55, h);
  if (DETAIL) animSeen = true;
  const tilt = Math.sin(animT * 1.8) * 3;
  const pivot = L(0.5, 0, 12);
  for (const w of [-0.08, 0.08]) { line(c, L(0.35, w, 1.5), pivot, '#5a5a62'); line(c, L(0.65, w, 1.5), pivot, '#5a5a62'); }
  const head = L(0.05, 0, 12 + tilt), tail = L(0.95, 0, 12 - tilt);
  c.strokeStyle = '#2b2b33'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(...head); c.lineTo(...tail); c.stroke();
  c.fillStyle = '#e8c23a'; c.beginPath(); c.arc(head[0], head[1] + 1, 1.6, 0, Math.PI * 2); c.fill();   // testa di cavallo
  line(c, [head[0], head[1] + 2], L(0.05, 0, 1.5), '#2b2b33');                                        // asta
  c.fillStyle = '#d94141'; c.fillRect(tail[0] - 1.2, tail[1] - 0.5, 2.4, 2.4);                          // contrappeso
}

// Piattaforma petrolifera 2x2 sull'acqua: gambe gialle, ponte, torre di trivellazione,
// gru, eliporto, serbatoi e torcia con la fiamma
function drawOilPlatform(c, ax, ay, base, r) {
  const P = (u, v, h) => iso(ax, ay, u, v, base + h / STEP);
  const D = 12;   // altezza del ponte sull'acqua (pixel)
  const leg = { l: '#e8c23a', r: '#c9a42a', t: '#f2d870' };
  for (const [u, v] of [[0.25, 0.25], [1.75, 0.25], [0.25, 1.75], [1.75, 1.75]].sort((a, b) => a[0] + a[1] - b[0] - b[1])) {
    box(c, ax, ay, base - 0.2, u - 0.08, v - 0.08, u + 0.08, v + 0.08, D + 1.6, leg);
    if (DETAIL) { const w = P(u + 0.1, v + 0.1, 0); c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(w[0] - 2, w[1], 4, 0.6); }
  }
  box(c, ax, ay, base + D / STEP, 0.08, 0.08, 1.92, 1.92, 3, { l: '#6b7077', r: '#50545a', t: '#9aa1aa' });
  drawParts2(c, ax, ay, base, r, [
    { box: [0.2, 0.2, 0.7, 0.7], z: D + 3, h: 9, col: { l: '#f2f2f2', r: '#cfd1d4', t: '#d94141' },   // alloggi
      doors: [{ face: '+u', a: 0.3, b: 0.6, z0: D + 7, z1: D + 10, color: '#9fd3e8' }] },
    { box: [1.0, 0.2, 1.4, 0.6], z: D + 3, h: 2, col: { l: '#6b7077', r: '#50545a', t: '#8f959d' },   // torre di trivellazione: traliccio
      after(b, top) {
        const H = 34, cu = (b[0] + b[2]) / 2, cv = (b[1] + b[3]) / 2;
        const feet = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
        const z0 = (top - base) * STEP;   // quota del ponte (pixel sopra la base)
        const at = (f, z) => { const [fu, fv] = feet[f], s = z / H; return P(fu + (cu - fu) * s * 0.8, fv + (cv - fv) * s * 0.8, z0 + z); };
        c.lineWidth = 0.9;
        for (const order of [[0, 1], [0, 3], [1, 2], [3, 2]]) {   // prima le facce dietro, poi quelle davanti
          const [f1, f2] = order;
          c.strokeStyle = f1 === 0 ? '#a83030' : '#d94141';
          c.beginPath();
          for (let z = 0; z < H - 4; z += 6) { c.moveTo(...at(f1, z)); c.lineTo(...at(f2, z + 6)); c.moveTo(...at(f2, z)); c.lineTo(...at(f1, z + 6)); }
          c.stroke();
        }
        c.strokeStyle = '#d94141'; c.lineWidth = 1.2;
        for (let f = 0; f < 4; f++) { c.beginPath(); c.moveTo(...at(f, 0)); c.lineTo(...at(f, H)); c.stroke(); }
        const t = P(cu, cv, z0 + H + 2);
        c.fillStyle = '#f2f2f2'; c.fillRect(t[0] - 1.5, t[1] - 1, 3, 2.5);
      } },
    { box: [1.45, 1.2, 1.65, 1.4], z: D + 3, h: 6, cyl: true, col: TANK },
    { box: [1.45, 1.5, 1.65, 1.7], z: D + 3, h: 6, cyl: true, col: TANK },
    { box: [1.75, 0.3, 1.85, 0.4], z: D + 3, h: 22, col: STEEL_PART,   // torcia
      after(b, top) {
        const p = P((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, D + 25);
        if (DETAIL) animSeen = true;
        const fl = 2.5 + Math.sin(animT * 9) * 0.7;
        c.fillStyle = '#f2a33a'; c.beginPath(); c.ellipse(p[0], p[1] - fl, 1.6, fl, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff1a0'; c.beginPath(); c.ellipse(p[0], p[1] - fl * 0.7, 0.8, fl * 0.6, 0, 0, Math.PI * 2); c.fill();
      } },
  ]);
  // eliporto sul davanti (dopo la rotazione resta un angolo che si vede)
  const [hu, hv] = rotUV(0.65, 1.35, r);
  const hp = [P(hu - 0.32, hv, D + 3.05), P(hu, hv - 0.32, D + 3.05), P(hu + 0.32, hv, D + 3.05), P(hu, hv + 0.32, D + 3.05)];
  poly(c, hp, '#3f8f4a');
  if (DETAIL) { const m = P(hu, hv, D + 3.05); c.fillStyle = '#ffffff'; c.font = 'bold 4px monospace'; c.textAlign = 'center'; c.fillText('H', m[0], m[1] + 1.4); c.textAlign = 'left'; }
}

// Porto 2x2: banchina con la gru verso l'acqua (retro), magazzino marittimo, container e serbatoi
function drawPort(c, ax, ay, base, r) {
  groundRect(c, ax, ay, base, [0.06, 0.04, 1.94, 0.4], r, '#b0aca2');      // banchina sul retro
  groundRect(c, ax, ay, base, [0.28, 1.45, 0.72, 2.0], r, '#7b7f86');
  const crate = col => ({ l: col, r: shade(col, -0.25), t: shade(col, 0.15) });
  const bitt = { l: '#3a3a40', r: '#2b2b30', t: '#5a5a62' };
  drawParts2(c, ax, ay, base, r, [
    { box: [0.12, 0.55, 1.05, 1.4], h: 14, col: { l: '#7fa6c9', r: '#5f86a9', t: '#7fa6c9' },
      roof: { rh: 5, back: '#3a4f66', roof: '#4a6280', gable: '#5f86a9' },
      doors: [{ face: '+v', a: 0.3, b: 0.8, z1: 10, color: '#3a4250' }, { face: '+v', a: 0.86, b: 0.98, z0: 10, z1: 13, color: '#ffd966' }] },
    { box: [1.25, 0.6, 1.6, 0.95], h: 8, cyl: true, col: TANK },
    { box: [1.25, 1.05, 1.6, 1.4], h: 8, cyl: true, col: TANK },
    // container uno sopra l'altro: stesso posto, quindi gruppo (prima quello sotto)
    { group: [{ box: [1.3, 1.55, 1.85, 1.8], h: 5, col: crate('#d94141') }, { box: [1.3, 1.55, 1.85, 1.8], z: 5, h: 5, col: crate('#3f6fd9') }] },
    // gru a portale sulla banchina: 4 gambe, telaio in cima e il braccio che sporge sull'acqua
    { group: [
      ...[[0.5, 0.06], [1.42, 0.06], [0.5, 0.3], [1.42, 0.3]].map(([u, v]) => ({ box: [u, v, u + 0.07, v + 0.07], h: 24, col: CRANE })),
      { box: [0.5, 0.06, 1.49, 0.37], z: 24, h: 3, col: CRANE },
      { box: [0.93, -0.75, 1.06, 0.37], z: 27, h: 2, col: CRANE,
        after() {   // fune sottile con il gancio, appesa alla punta del braccio (prima era un blocco nero fuori posto)
          if (!DETAIL) return;
          const [hu, hv] = rotUV(1.0, -0.62, r), top = iso(ax, ay, hu, hv, base + 27 / STEP), bot = iso(ax, ay, hu, hv, base + 17 / STEP);
          c.strokeStyle = '#2b2b30'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(...top); c.lineTo(...bot); c.stroke();
          c.strokeStyle = '#3a3a40'; c.lineWidth = 0.8; c.beginPath(); c.arc(bot[0], bot[1] + 0.9, 0.9, -Math.PI * 0.1, Math.PI * 1.1); c.stroke();
        } },
    ] },
    // bitte d'ormeggio sul bordo della banchina (fuori dalla gru, così non si accavallano)
    { box: [0.17, 0.05, 0.23, 0.11], h: 2, col: bitt },
    { box: [1.72, 0.05, 1.78, 0.11], h: 2, col: bitt },
  ]);
}

// Raffineria 2x2: serbatoi bianchi, colonne di distillazione, tubazioni e torcia
function drawRefinery(c, ax, ay, base, r) {
  const P = (u, v, h) => iso(ax, ay, u, v, h);
  groundRect(c, ax, ay, base, [0.28, 1.45, 0.72, 2.0], r, '#6f6f6a');
  drawParts2(c, ax, ay, base, r, [
    { box: [0.1, 0.1, 0.7, 0.7], h: 12, cyl: true, col: TANK },
    { box: [0.1, 0.8, 0.6, 1.3], h: 10, cyl: true, col: TANK },
    { box: [0.95, 0.2, 1.15, 0.4], h: 40, cyl: true, col: { l: '#b8bec6', r: '#8f959d', t: '#d6dbe0', band: [0.3, 0.6, 0.9], bandColor: '#e8c23a' } },
    { box: [1.3, 0.25, 1.46, 0.41], h: 32, cyl: true, col: { l: '#b8bec6', r: '#8f959d', t: '#d6dbe0', band: [0.45, 0.85], bandColor: '#e8c23a' } },
    { box: [0.9, 0.55, 1.8, 0.7], z: 8, h: 2, col: { l: '#8f959d', r: '#6b7077', t: '#aab0b8' } },   // tubazioni
    { box: [1.0, 0.95, 1.7, 1.4], h: 10, col: { l: '#e6e1d3', r: '#c4bfb1', t: '#9aa1aa' },          // sala controllo
      doors: [{ face: '+v', a: 1.1, b: 1.3, z1: 7, color: '#4a4f5a' }, { face: '+v', a: 1.4, b: 1.6, z0: 4, z1: 8, color: '#9fd3e8' }] },
    { box: [1.75, 0.12, 1.85, 0.22], h: 36, col: STEEL_PART,
      after(b) {
        const p = P((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, base + 37 / STEP);
        if (DETAIL) animSeen = true;
        const fl = 2.5 + Math.sin(animT * 8) * 0.7;
        c.fillStyle = '#f2a33a'; c.beginPath(); c.ellipse(p[0], p[1] - fl, 1.6, fl, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff1a0'; c.beginPath(); c.ellipse(p[0], p[1] - fl * 0.7, 0.8, fl * 0.6, 0, 0, Math.PI * 2); c.fill();
      } },
  ]);
}

// Distributore 1x1: pensilina rossa su 4 pali, due colonnine, negozietto dietro
function drawGasStation(c, x, y, base, r) {
  const P = (u, v, h) => iso(x, y, u, v, base + h / STEP);
  drawParts1(c, x, y, base, r, [
    { box: [0.1, 0.1, 0.5, 0.42], h: 8, col: { l: '#f2f2ee', r: '#cfd1cc', t: '#9aa1aa' } },   // negozio
    { box: [0.55, 0.15, 0.62, 0.22], h: 16, col: STEEL_PART },                                   // cartello
    { box: [0.3, 0.55, 0.38, 0.65], h: 5, col: { l: '#d94141', r: '#a83030', t: '#e86a6a' } },   // colonnine
    { box: [0.62, 0.55, 0.7, 0.65], h: 5, col: { l: '#3fa34d', r: '#2f7f3a', t: '#5fc36d' } },
  ]);
  const s = P(0.585, 0.185, 16);
  c.fillStyle = '#e8c23a'; c.fillRect(s[0] - 2.5, s[1] - 3, 5, 3);
  // pensilina: tetto piatto sorretto da 4 pali
  for (const [u, v] of [[0.2, 0.48], [0.8, 0.48], [0.2, 0.85], [0.8, 0.85]]) line(c, P(u, v, 0), P(u, v, 10), '#c9ced4');
  box(c, x, y, base + 10 / STEP, 0.15, 0.45, 0.88, 0.9, 2, { l: '#d94141', r: '#a83030', t: '#f2f2f2' });
}

// Giacimenti di petrolio: con il pozzo o la piattaforma in mano si vedono le macchie scure
function drawOilSpot(c, x, y) {
  const o = oilAt(x, y);
  if (!o) return;
  const P = surface(x, y);
  c.fillStyle = 'rgba(20,16,12,' + (0.15 + 0.45 * o).toFixed(2) + ')';
  c.beginPath(); c.moveTo(...P(0.08, 0.08)); c.lineTo(...P(0.92, 0.08)); c.lineTo(...P(0.92, 0.92)); c.lineTo(...P(0.08, 0.92)); c.closePath(); c.fill();
}

// ---------- Rete elettrica: tralicci, sottostazione, fili ----------
// Traliccio dell'alta tensione: torre a traliccio (4 gambe che si stringono, controventi a X),
// due mensole con gli isolatori. Le mensole stanno di traverso rispetto ai fili (b.armV).
const PYLON_TOP = 44, PYLON_ARM = 34;
function pylonArmEnds(x, y, base, armV) {   // punti dove si attaccano i fili (due per lato)
  const P = (u, v) => iso(x, y, u, v, base + (PYLON_ARM - 3) / STEP);
  return armV ? [P(0.5, 0.08), P(0.5, 0.92)] : [P(0.08, 0.5), P(0.92, 0.5)];
}
function drawPylon(c, x, y, base, armV, onWater) {
  if (onWater) {   // sull'acqua: plinto di cemento che esce dall'acqua
    box(c, x, y, base - 0.15, 0.2, 0.2, 0.8, 0.8, 0.15 * STEP + 3, { l: '#a3a39b', r: '#86867f', t: '#bcbcb4', plain: true });
    base += 3 / STEP;
  }
  const P = (u, v, h) => iso(x, y, u, v, base + h / STEP);
  const at = h => { const k = h / PYLON_TOP, w = 0.22 - 0.16 * k; return [0.5 - w, 0.5 + w]; };   // gambe che si stringono
  const leg = (su, sv, h) => { const [a, b] = at(h); return P(su < 0 ? a : b, sv < 0 ? a : b, h); };
  const line = (p, q, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(...p); c.lineTo(...q); c.stroke(); };
  const STEEL_D = '#4d525a', STEEL_L = '#8c929b';
  // ombra a terra
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath(); for (const [u, v] of [[0.26, 0.26], [0.74, 0.26], [0.74, 0.74], [0.26, 0.74]]) { const p = P(u, v, 0); c.lineTo(...p); } c.closePath(); c.fill();
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const backFirst = legs.slice().sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
  const levels = [0, 10, 19, 27, PYLON_ARM, PYLON_TOP];
  for (const [su, sv] of backFirst) {
    const front = su + sv > 0;
    line(leg(su, sv, 0), leg(su, sv, PYLON_TOP), front ? STEEL_L : STEEL_D, DETAIL ? 1.1 : 1.3);
  }
  if (DETAIL) {   // controventi a X sulle due facce visibili, e i traversi
    for (const [a, b] of [[[-1, 1], [1, 1]], [[1, -1], [1, 1]]]) {
      for (let i = 0; i < levels.length - 1; i++) {
        const h0 = levels[i], h1 = levels[i + 1];
        line(leg(...a, h0), leg(...b, h1), STEEL_D, 0.5);
        line(leg(...b, h0), leg(...a, h1), STEEL_D, 0.5);
        line(leg(...a, h1), leg(...b, h1), STEEL_L, 0.6);
      }
    }
  }
  // mensole con gli isolatori
  for (const [h, len] of [[PYLON_ARM, 0.42], [PYLON_ARM + 7, 0.3]]) {
    const A = armV ? P(0.5, 0.5 - len, h) : P(0.5 - len, 0.5, h), B = armV ? P(0.5, 0.5 + len, h) : P(0.5 + len, 0.5, h);
    line(A, B, STEEL_L, 1.3);
    if (DETAIL) for (const p of [A, B]) { line(p, [p[0], p[1] + 3], '#d9dde2', 1.4); }   // isolatori
  }
  line(P(0.5, 0.5, PYLON_TOP), P(0.5, 0.5, PYLON_TOP + 4), STEEL_L, 1);   // punta
}

// Palo della luce di legno (bassa tensione): palo marrone con la traversa e due isolatori
const POLE_TOP = 22;
function drawPole(c, x, y, base, armV, feed) {
  const P = (u, v, h) => iso(x, y, u, v, base + h / STEP);
  const line = (p, q, col, w) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(...p); c.lineTo(...q); c.stroke(); };
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath(); c.ellipse(...P(0.5, 0.5, 0), 3, 1.5, 0, 0, Math.PI * 2); c.fill();
  if (feed) {   // collegato al cavo sotto la strada: pozzetto di cemento a terra dalla parte della strada
    const u = 0.5 + feed[0] * 0.28, v = 0.5 + feed[1] * 0.28;
    box(c, x, y, base, u - 0.1, v - 0.1, u + 0.1, v + 0.1, 2, { l: '#9a9a92', r: '#7f7f78', t: '#b4b4ac', plain: true });
  }
  line(P(0.5, 0.5, 0), P(0.5, 0.5, POLE_TOP + 2), '#4a3020', 2.6);
  line(P(0.5, 0.5, 0), P(0.5, 0.5, POLE_TOP + 2), '#7a5434', 1.4);
  const A = armV ? P(0.5, 0.28, POLE_TOP) : P(0.28, 0.5, POLE_TOP), B = armV ? P(0.5, 0.72, POLE_TOP) : P(0.72, 0.5, POLE_TOP);
  line(A, B, '#5e3f27', 1.6);
  for (const p of [A, B]) { c.fillStyle = '#d9dde2'; c.fillRect(p[0] - 0.8, p[1] - 2.5, 1.6, 2.5); }
  if (feed) {   // cavo che scende lungo il palo ed entra nel pozzetto (poi va sotto terra fino alla strada)
    const u = 0.5 + feed[0] * 0.28, v = 0.5 + feed[1] * 0.28;
    const top = P(0.5 + feed[0] * 0.05, 0.5 + feed[1] * 0.05, POLE_TOP - 1), mid = P(0.5 + feed[0] * 0.05, 0.5 + feed[1] * 0.05, 3), bot = P(u, v, 2);
    c.strokeStyle = '#1e1e22'; c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(...top); c.lineTo(...mid); c.lineTo(...bot); c.stroke();
  }
}
function poleArmEnds(x, y, base, armV) {
  const P = (u, v) => iso(x, y, u, v, base + (POLE_TOP + 2.5) / STEP);
  return armV ? [P(0.5, 0.28), P(0.5, 0.72)] : [P(0.28, 0.5), P(0.72, 0.5)];
}

// Sottostazione elettrica: piazzale recintato con due trasformatori, sostegni e una casetta di controllo
function drawSubstation(c, x, y, base, r) {
  const steel = { l: '#9aa0a8', r: '#7a8088', t: '#b8bec6' }, tr = { l: '#6f7a72', r: '#56605a', t: '#86918a' };
  // piazzale prima di tutto (è sotto a ogni altro pezzo); poi i pezzi che stanno uno sopra l'altro
  // (isolatori sui trasformatori, traversa sui sostegni) come gruppi: girando non si mescolano più
  box(c, x, y, base, 0.05, 0.05, 0.95, 0.95, 1, { l: '#a9a9a2', r: '#8f8f88', t: '#bdbdb5', plain: true });
  const ins = { l: '#c96a3a', r: '#a65530', t: '#d9844e' };
  drawParts2(c, x, y, base + 1 / STEP, r, [
    { group: [{ box: [0.14, 0.16, 0.44, 0.46], h: 9, col: tr }, { box: [0.22, 0.24, 0.36, 0.38], h: 3, z: 9, col: ins }] },   // trasformatori con isolatori
    { group: [{ box: [0.54, 0.16, 0.84, 0.46], h: 9, col: tr }, { box: [0.62, 0.24, 0.76, 0.38], h: 3, z: 9, col: ins }] },
    { box: [0.16, 0.58, 0.48, 0.86], h: 10, col: { l: '#e8dcc0', r: '#c9bc9e', t: '#b5473a' } },                               // casetta di controllo
    { group: [{ box: [0.6, 0.6, 0.65, 0.65], h: 18, col: steel }, { box: [0.78, 0.6, 0.83, 0.65], h: 18, col: steel },     // sostegni dei fili
      { box: [0.6, 0.8, 0.65, 0.85], h: 14, col: steel }, { box: [0.6, 0.6, 0.83, 0.65], h: 1.5, z: 16, col: steel }] },
  ], true);
  if (DETAIL) {   // recinzione sui due lati davanti
    const P = (u, v, h) => iso(x, y, u, v, base + h / STEP);
    c.strokeStyle = 'rgba(60,64,70,0.8)'; c.lineWidth = 0.6;
    for (const h of [2, 5]) {
      c.beginPath(); c.moveTo(...P(0.05, 0.95, h)); c.lineTo(...P(0.95, 0.95, h)); c.lineTo(...P(0.95, 0.05, h)); c.stroke();
    }
    for (let k = 0; k <= 6; k++) {
      const t = 0.05 + k * 0.15;
      c.beginPath(); c.moveTo(...P(t, 0.95, 1)); c.lineTo(...P(t, 0.95, 5.5)); c.stroke();
      c.beginPath(); c.moveTo(...P(0.95, t, 1)); c.lineTo(...P(0.95, t, 5.5)); c.stroke();
    }
    // cartello giallo di pericolo
    const s = P(0.95, 0.45, 4);
    c.fillStyle = '#ffd34d'; c.beginPath(); c.moveTo(s[0], s[1] - 2.5); c.lineTo(s[0] + 2.2, s[1] + 1.3); c.lineTo(s[0] - 2.2, s[1] + 1.3); c.closePath(); c.fill();
  }
}

// Fili: alta tensione tra i tralicci (due fili che pendono un po') e dal traliccio alla sottostazione;
// bassa tensione tra i pali di legno e dal palo agli edifici. Sopra la città, dopo tutti i tile.
function drawPowerLines(c) {
  const E = game.elec;
  if (!E) return;
  const elevOf = b => game.map[b.ay][b.ax].elev + (b.kind === 'pylon' && game.map[b.ay][b.ax].type === T.WATER ? 3 / STEP : 0);
  const sag = (p, q) => {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]), m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + 3 + d * 0.06];
    c.beginPath(); c.moveTo(...p); c.quadraticCurveTo(...m, ...q); c.stroke();
  };
  const pair = (ea, eb) => {   // si collegano i due capi più vicini fra loro (così i fili non si incrociano)
    const d0 = Math.hypot(ea[0][0] - eb[0][0], ea[0][1] - eb[0][1]) + Math.hypot(ea[1][0] - eb[1][0], ea[1][1] - eb[1][1]);
    const d1 = Math.hypot(ea[0][0] - eb[1][0], ea[0][1] - eb[1][1]) + Math.hypot(ea[1][0] - eb[0][0], ea[1][1] - eb[0][1]);
    if (d0 <= d1) { sag(ea[0], eb[0]); sag(ea[1], eb[1]); } else { sag(ea[0], eb[1]); sag(ea[1], eb[0]); }
  };
  const top = o => { const d = BUILDINGS[o.kind]; return o.kind === 'substation' ? iso(o.ax, o.ay, 0.7, 0.62, elevOf(o) + 17 / STEP) : iso(o.ax, o.ay, d.w / 2, d.h / 2, elevOf(o) + Math.min(d.height, 30) * 0.6 / STEP); };
  c.lineWidth = DETAIL ? 0.7 : 0.9; c.strokeStyle = 'rgba(28, 30, 36, 0.85)';
  for (const [a, b] of E.wires) pair(pylonArmEnds(a.ax, a.ay, elevOf(a), a.armV), pylonArmEnds(b.ax, b.ay, elevOf(b), b.armV));
  // tralicci sul bordo: i fili escono dalla mappa (si vede che la rete è collegata fuori)
  const N = game.size;
  for (const b of game.buildings.values()) {
    if (b.kind !== 'pylon') continue;
    const dx = b.ax === 0 ? -1 : b.ax === N - 1 ? 1 : 0, dy = b.ay === 0 ? -1 : b.ay === N - 1 ? 1 : 0;
    if (!dx && !dy) continue;
    const ends = pylonArmEnds(b.ax, b.ay, elevOf(b), b.armV);
    const o0 = iso(b.ax, b.ay, 0.5, 0.5, 0), o1 = iso(b.ax + dx * 4, b.ay + dy * 4, 0.5, 0.5, 0);
    const off = [o1[0] - o0[0], o1[1] - o0[1]];
    for (const e of ends) {
      const g = c.createLinearGradient(e[0], e[1], e[0] + off[0], e[1] + off[1]);
      // chiari: fuori dalla mappa lo sfondo è scuro e i fili neri non si vedrebbero
      g.addColorStop(0, 'rgba(28, 30, 36, 0.85)'); g.addColorStop(0.2, 'rgba(170, 180, 196, 0.9)'); g.addColorStop(1, 'rgba(170, 180, 196, 0)');
      c.strokeStyle = g; sag(e, [e[0] + off[0], e[1] + off[1] - 6]);
    }
    // fulmine azzurro dove i fili escono: la rete è collegata fuori mappa
    const m = [(ends[0][0] + ends[1][0]) / 2 + off[0] * 0.55, (ends[0][1] + ends[1][1]) / 2 + off[1] * 0.55 + 2];
    c.globalAlpha = 0.8 + 0.2 * Math.sin(animT * 3); animSeen = true;
    c.fillStyle = '#6fe3ff'; c.beginPath();
    c.moveTo(m[0] + 1.5, m[1] - 7); c.lineTo(m[0] - 3.5, m[1] + 0.5); c.lineTo(m[0] - 0.2, m[1] + 0.5); c.lineTo(m[0] - 1.5, m[1] + 7); c.lineTo(m[0] + 3.5, m[1] - 0.8); c.lineTo(m[0] + 0.2, m[1] - 0.8);
    c.closePath(); c.fill(); c.globalAlpha = 1;
    c.strokeStyle = 'rgba(28, 30, 36, 0.85)';
  }
  for (const [p, o] of E.links) sag(iso(p.ax, p.ay, 0.5, 0.5, elevOf(p) + (PYLON_ARM - 3) / STEP), top(o));
  c.lineWidth = DETAIL ? 0.6 : 0.8; c.strokeStyle = 'rgba(40, 32, 24, 0.8)';
  for (const [a, b] of E.lvWires) pair(poleArmEnds(a.ax, a.ay, elevOf(a), a.armV), poleArmEnds(b.ax, b.ay, elevOf(b), b.armV));
  for (const [p, o] of E.lvLinks) {
    const from = iso(p.ax, p.ay, 0.5, 0.5, elevOf(p) + POLE_TOP / STEP);
    sag(from, top(o));
  }
}
