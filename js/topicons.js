// ---------- Icone dei pulsanti in alto (richiesta dell'utente: niente emoji, icone disegnate nello stile del gioco) ----------
// Manuale, sottosuolo, produzione, progressi, menu, schermo intero e velocità: disegnate qui in pixel art
// (32x32, mostrate a 18 px). Sul computer icona + scritta, sul telefono solo l'icona (style.css: body.touch .tlabel).
const TOP_ICONS = {};
function topIcon(draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  draw(c, R);
  return cv.toDataURL();
}
(() => {
  const OUT = '#14151f';
  // manuale: libro aperto con le pagine scritte
  TOP_ICONS.manual = topIcon((c, R) => {
    R(3, 7, 26, 20, OUT); R(4, 8, 24, 18, '#8a4a20');                 // copertina
    R(5, 7, 10, 18, OUT); R(17, 7, 10, 18, OUT);
    R(6, 8, 9, 16, '#f4ecd8'); R(17, 8, 9, 16, '#e8dcc0');            // pagine
    R(15, 7, 2, 19, '#5a3214');                                       // dorso
    for (let i = 0; i < 5; i++) { R(7, 11 + i * 3, 7, 1, '#9a8f7a'); R(18, 11 + i * 3, 7 - (i === 4 ? 3 : 0), 1, '#9a8f7a'); }
    R(22, 4, 3, 9, '#d94141'); R(22, 13, 1, 1, '#d94141'); R(24, 13, 1, 1, '#d94141');   // segnalibro
  });
  // sottosuolo: terra a strati con un tubo azzurro e una goccia
  TOP_ICONS.under = topIcon((c, R) => {
    R(2, 5, 28, 6, OUT); R(3, 6, 26, 4, '#5dae3a');                   // erba
    R(2, 10, 28, 19, OUT); R(3, 10, 26, 18, '#8a5a32');               // terra
    R(3, 20, 26, 1, '#6b4428'); R(5, 14, 2, 1, '#6b4428'); R(22, 24, 3, 1, '#6b4428');
    R(3, 15, 26, 5, OUT); R(3, 16, 26, 3, '#4faaff'); R(3, 16, 26, 1, '#9fd3ff');   // tubo
    R(9, 15, 2, 5, '#2f6fb3'); R(21, 15, 2, 5, '#2f6fb3');           // giunti
    c.fillStyle = OUT; c.beginPath(); c.moveTo(16, 21); c.lineTo(20, 27); c.arc(16, 27, 4, 0, Math.PI); c.closePath(); c.fill();
    c.fillStyle = '#4faaff'; c.beginPath(); c.moveTo(16, 22.5); c.lineTo(19, 27); c.arc(16, 27, 3, 0, Math.PI); c.closePath(); c.fill();
  });
  // produzione: grafico a barre
  TOP_ICONS.stats = topIcon((c, R) => {
    R(3, 27, 26, 2, OUT); R(3, 4, 2, 25, OUT);
    const bar = (x, h, col, dark) => { R(x - 1, 27 - h - 1, 7, h + 1, OUT); R(x, 27 - h, 5, h, col); R(x + 3, 27 - h, 2, h, dark); };
    bar(8, 9, '#ffd966', '#e0a820'); bar(15, 15, '#5dae3a', '#3f7a2a'); bar(22, 20, '#4faaff', '#2f6fb3');
  });
  // progressi: lucchetto aperto dorato
  TOP_ICONS.progress = topIcon((c, R) => {
    c.strokeStyle = OUT; c.lineWidth = 5; c.beginPath(); c.arc(12, 11, 6, Math.PI, 0); c.lineTo(18, 14); c.stroke();
    c.strokeStyle = '#b5b5b5'; c.lineWidth = 2.5; c.beginPath(); c.arc(12, 11, 6, Math.PI, 0); c.lineTo(18, 14); c.stroke();
    c.lineCap = 'butt'; R(4, 10, 3, 4, OUT); R(5, 11, 1, 3, '#b5b5b5');
    R(8, 14, 20, 15, OUT); R(9, 15, 18, 13, '#ffd34d'); R(9, 15, 18, 2, '#ffe680'); R(22, 15, 5, 13, '#e0a820');
    R(16, 19, 4, 4, OUT); R(17, 22, 2, 4, OUT);
  });
  // menu: tre barre
  TOP_ICONS.menu = topIcon((c, R) => {
    for (const y of [6, 14, 22]) { R(4, y, 24, 6, OUT); R(5, y + 1, 22, 4, '#f4f4f4'); R(5, y + 4, 22, 1, '#b8bec6'); }
  });
  // schermo intero / esci: quattro angoli a L (verso fuori = entra, verso dentro = esci)
  const corners = inward => topIcon((c, R) => {
    // L con lo spigolo in (x, y) e i bracci lunghi 9 verso dx/dy, spessi 3
    const L = (x, y, dx, dy, col, g) => {
      const hx = dx > 0 ? x : x - 9, vy = dy > 0 ? y : y - 9, ox = dx > 0 ? x : x - 3, oy = dy > 0 ? y : y - 3;
      R(hx - g, oy - g, 9 + 2 * g, 3 + 2 * g, col); R(ox - g, vy - g, 3 + 2 * g, 9 + 2 * g, col);
    };
    const pts = inward ? [[13, 13, -1, -1], [19, 13, 1, -1], [13, 19, -1, 1], [19, 19, 1, 1]]
                       : [[4, 4, 1, 1], [28, 4, -1, 1], [4, 28, 1, -1], [28, 28, -1, -1]];
    for (const [x, y, dx, dy] of pts) L(x, y, dx, dy, OUT, 1);
    for (const [x, y, dx, dy] of pts) L(x, y, dx, dy, '#f4f4f4', 0);
  });
  TOP_ICONS.fullscreen = corners(false);
  TOP_ICONS.exitFullscreen = corners(true);
  // velocità: pausa e frecce di gioco
  const tri = (c, x) => { c.fillStyle = OUT; c.beginPath(); c.moveTo(x - 1, 6); c.lineTo(x + 11, 16); c.lineTo(x - 1, 26); c.closePath(); c.fill();
    c.fillStyle = '#f4f4f4'; c.beginPath(); c.moveTo(x + 1, 9.5); c.lineTo(x + 8, 16); c.lineTo(x + 1, 22.5); c.closePath(); c.fill(); };
  TOP_ICONS.speed0 = topIcon((c, R) => { R(8, 6, 7, 20, OUT); R(17, 6, 7, 20, OUT); R(9, 7, 5, 18, '#f4f4f4'); R(18, 7, 5, 18, '#f4f4f4'); });
  TOP_ICONS.speed1 = topIcon(c => tri(c, 11));
  TOP_ICONS.speed2 = topIcon(c => { tri(c, 5); tri(c, 16); });
  TOP_ICONS.speed5 = topIcon(c => { c.scale(0.8, 1); tri(c, 1); tri(c, 13); tri(c, 25); });
})();

// Mette le icone nei pulsanti: <img class="ticon"> + <span class="tlabel"> con la scritta
function initTopIcons() {
  const put = (id, icon) => {
    const b = document.getElementById(id);
    if (!b) return;
    let img = b.querySelector('img.ticon');
    if (!img) {
      const label = b.textContent.trim();
      b.textContent = '';
      img = document.createElement('img'); img.className = 'ticon'; img.alt = '';
      const sp = document.createElement('span'); sp.className = 'tlabel'; sp.textContent = label;
      if (b.hasAttribute('data-i18n')) { b.removeAttribute('data-i18n'); sp.setAttribute('data-i18n', ''); }
      b.append(img, sp);
      if (!label || id === 'fs-btn') sp.remove();   // schermo intero: solo l'icona
    }
    img.src = TOP_ICONS[icon];
  };
  put('manual-btn', 'manual'); put('under-btn', 'under'); put('stats-btn', 'stats'); put('progress-btn', 'progress'); put('menu-btn', 'menu');
  put('fs-btn', 'fullscreen');
  for (const b of document.querySelectorAll('#speed-btns button')) {
    b.textContent = '';
    const img = document.createElement('img'); img.className = 'ticon'; img.alt = ''; img.src = TOP_ICONS['speed' + b.dataset.speed];
    b.appendChild(img);
  }
}
// scritta di un pulsante con l'icona (settings.js: tasti scelti nelle Opzioni)
function setTopLabel(id, text) {
  const b = document.getElementById(id);
  if (!b) return;
  const sp = b.querySelector('.tlabel');
  if (sp) sp.textContent = text; else b.textContent = text;
  b.title = text;
}
initTopIcons();
