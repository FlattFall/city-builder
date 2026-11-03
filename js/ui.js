// ---------- Interfaccia: barra strumenti, contatori, messaggi ----------
const TOOL_INFO = {
  hand:      { label: 'Mano' },
  road:      { label: 'Strada', cost: PATHS.road.cost },
  dirt:      { label: 'Strada di terra', cost: PATHS.dirt.cost },
  rail:      { label: 'Binari', cost: PATHS.rail.cost },
  field:     { label: 'Campo coltivabile', cost: COSTS.field },
  house:     { label: 'Casa', cost: BUILDINGS.house.cost },
  farm:      { label: 'Fattoria (2x2)', cost: BUILDINGS.farm.cost },
  warehouse: { label: 'Magazzino alimenti (2x2)', cost: BUILDINGS.warehouse.cost },
  factory:   { label: 'Fabbrica alimentare (2x2)', cost: BUILDINGS.factory.cost },
  bakery:    { label: 'Panificio', cost: BUILDINGS.bakery.cost },
  supermarket: { label: 'Supermercato (2x2)', cost: BUILDINGS.supermarket.cost },
  cowFarm:   { label: 'Allevamento di mucche', cost: BUILDINGS.cowFarm.cost },
  chickenFarm: { label: 'Allevamento di polli', cost: BUILDINGS.chickenFarm.cost },
  pigFarm:   { label: 'Allevamento di maiali', cost: BUILDINGS.pigFarm.cost },
  sheepFarm: { label: 'Allevamento di pecore', cost: BUILDINGS.sheepFarm.cost },
  dairy:     { label: 'Caseificio (2x2)', cost: BUILDINGS.dairy.cost },
  slaughterhouse: { label: 'Macello e carne (2x2)', cost: BUILDINGS.slaughterhouse.cost },
  demolish:  { label: 'Demolisci' },
  raise:     { label: 'Alza terreno', cost: COSTS.terrain },
  lower:     { label: 'Abbassa terreno', cost: COSTS.terrain },
  level:     { label: 'Livella terreno', cost: COSTS.terrain },
};

// Gruppi della barra: il tasto numerico sceglie il gruppo (premuto di nuovo passa al prossimo)
const TOOL_GROUPS = [
  { key: '1', id: 'hand',     label: 'Mano',      tools: ['hand'] },
  { key: '2', id: 'paths',    label: 'Strade',    tools: ['road', 'dirt', 'rail', 'field'] },
  { key: '3', id: 'homes',    label: 'Case',      tools: ['house'] },
  { key: '4', id: 'industry', label: 'Industrie', tools: ['farm', 'cowFarm', 'chickenFarm', 'pigFarm', 'sheepFarm',
    'warehouse', 'factory', 'dairy', 'slaughterhouse', 'bakery', 'supermarket'] },
  { key: '5', id: 'demolish', label: 'Demolisci', tools: ['demolish', 'raise', 'lower', 'level'] },
];
const groupChoice = {};   // gruppo -> ultimo strumento scelto
const ICONS = {};         // strumento -> immagine (data URL)
const GOOD_ICONS = {};    // merce -> piccola immagine (data URL)

// ---------- Icone delle merci (24x24) ----------
function drawGoodIcon(c, g) {
  const circle = (x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
  const ell = (x, y, rx, ry, col, rot) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); c.fill(); };
  const shape = (pts, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(...pts[0]); for (const p of pts.slice(1)) c.lineTo(...p); c.closePath(); c.fill(); };
  const rect = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const sack = (col, mark) => { // sacco di farina con un simbolo
    shape([[6, 6], [18, 6], [20, 21], [4, 21]], col); rect(8, 3, 8, 4, shade(col, -0.15));
    ell(12, 14, 3, 4, mark);
  };
  switch (g) {
    case 'wheat':
      rect(11, 8, 2, 14, '#9c7a2a');
      for (const y of [5, 9, 13]) { ell(9, y, 2.2, 3.5, '#e0b84a', -0.5); ell(15, y, 2.2, 3.5, '#e0b84a', 0.5); }
      ell(12, 3.5, 2, 3, '#e0b84a'); break;
    case 'carrot':
      shape([[7, 8], [17, 8], [12, 22]], '#f08a24');
      shape([[9, 8], [8, 2], [12, 6], [16, 2], [15, 8]], '#4caf50'); break;
    case 'potato':
      ell(12, 13, 8, 6, '#b08850', 0.3); circle(9, 12, 1, '#7a5a30'); circle(14, 15, 1, '#7a5a30'); circle(15, 10, 1, '#7a5a30'); break;
    case 'corn':
      shape([[12, 2], [5, 20], [12, 17], [19, 20]], '#5dae3a'); ell(12, 11, 4, 8, '#f2d14a');
      for (const y of [6, 9, 12, 15]) rect(9, y, 6, 1, '#d9a62a'); break;
    case 'tomato':
      circle(12, 14, 8, '#d94141'); circle(9, 11, 2, '#f07070');
      shape([[12, 5], [8, 8], [12, 7], [16, 8]], '#4caf50'); break;
    case 'cabbage':
      circle(12, 13, 9, '#6fbf4a'); circle(12, 13, 6, '#9be07a'); circle(12, 13, 3, '#c8f0b0'); break;
    case 'flour': sack('#efe6d2', '#e0b84a'); break;
    case 'cornFlour': sack('#f2d97a', '#e8a33a'); break;
    case 'chips':
      shape([[5, 4], [19, 4], [18, 21], [6, 21]], '#d94141'); ell(12, 12, 5, 4, '#f2d14a'); rect(5, 4, 14, 2, '#a83030'); break;
    case 'carrotPack':
      rect(4, 7, 16, 13, '#3f6fd9'); rect(4, 7, 16, 3, '#2f55b0'); shape([[8, 12], [16, 12], [12, 19]], '#f08a24'); break;
    case 'sauce':
      rect(7, 5, 10, 3, '#e8e8e8'); shape([[6, 8], [18, 8], [18, 21], [6, 21]], '#c83232'); rect(8, 12, 8, 5, '#f2f5f8');
      circle(12, 14.5, 2, '#d94141'); break;
    case 'pasta':
      rect(4, 6, 16, 14, '#f2e3a0'); rect(4, 6, 16, 3, '#3f6fd9');
      c.strokeStyle = '#d9a62a'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(7, 14); c.bezierCurveTo(9, 11, 11, 17, 13, 14); c.bezierCurveTo(15, 11, 17, 17, 18, 14); c.stroke(); break;
    case 'bread':
      ell(12, 14, 9, 6, '#b8783a'); ell(12, 12.5, 8, 4.5, '#d9a05a');
      c.strokeStyle = '#8a5a2a'; c.lineWidth = 1;
      for (const x of [8, 12, 16]) { c.beginPath(); c.moveTo(x - 1, 10); c.lineTo(x + 1, 15); c.stroke(); } break;
    case 'biscuits':
      circle(9, 13, 6, '#d9a05a'); circle(15, 11, 6, '#e8b874');
      for (const [x, y] of [[13, 9], [16, 12], [17, 9], [8, 12], [10, 15]]) circle(x, y, 0.9, '#7a4a20'); break;
    case 'milk':
      rect(9, 3, 6, 3, '#3f6fd9'); shape([[8, 6], [16, 6], [17, 10], [17, 21], [7, 21], [7, 10]], '#f6f6f6');
      rect(7, 13, 10, 4, '#8fc6e8'); break;
    case 'eggs':
      ell(9, 14, 4.5, 6, '#f2e6d0'); ell(15.5, 13, 4.5, 6, '#fbf4e6'); break;
    case 'wool':
      circle(12, 13, 8, '#f4f1e8'); c.strokeStyle = '#c9c4b8'; c.lineWidth = 1;
      for (const r2 of [3, 5.5]) { c.beginPath(); c.arc(12, 13, r2, 0.3, 4.5); c.stroke(); } break;
    case 'cattle':
      ell(12, 13, 8, 7, '#f2f2f2'); ell(9, 11, 2.5, 2, '#2b2b33'); ell(15, 16, 2, 1.6, '#2b2b33');
      ell(12, 18, 4, 2.5, '#f0a0b0'); shape([[4, 7], [7, 5], [7, 9]], '#d9c3a0'); shape([[20, 7], [17, 5], [17, 9]], '#d9c3a0'); break;
    case 'poultry':
      ell(12, 14, 7, 6, '#f6f6f2'); circle(16, 8, 3.5, '#f6f6f2'); shape([[18, 5], [20, 7], [17, 6]], '#d94141');
      shape([[19, 8], [22, 9], [19, 10]], '#e8a33a'); rect(10, 19, 1, 3, '#e8a33a'); rect(14, 19, 1, 3, '#e8a33a'); break;
    case 'pigs':
      circle(12, 13, 8, '#f0a0b0'); ell(12, 15, 3.5, 2.5, '#e8899a'); circle(11, 15, 0.8, '#a05060'); circle(13, 15, 0.8, '#a05060');
      shape([[5, 6], [8, 4], [9, 8]], '#e8899a'); shape([[19, 6], [16, 4], [15, 8]], '#e8899a'); break;
    case 'cheese':
      shape([[3, 16], [19, 9], [21, 18], [5, 21]], '#f2d14a'); shape([[3, 16], [19, 9], [17, 7]], '#f8e27a');
      circle(10, 17, 1.5, '#d9a62a'); circle(16, 16, 1.2, '#d9a62a'); break;
    case 'butter':
      rect(4, 9, 16, 10, '#f8e8a0'); rect(4, 9, 16, 3, '#fff4c8'); rect(4, 15, 16, 4, '#3f6fd9'); break;
    case 'yogurt':
      shape([[6, 7], [18, 7], [16, 21], [8, 21]], '#f6f6f6'); rect(6, 5, 12, 3, '#e8889a'); rect(8, 12, 8, 4, '#e8889a'); break;
    case 'freshMeat':
      ell(12, 13, 9, 6.5, '#c83232', -0.3); ell(12, 13, 6, 4, '#e05050', -0.3); ell(8, 15, 2.5, 2, '#f4e4d4'); break;
    case 'sausages':
      for (const [x, y] of [[8, 9], [14, 12], [9, 16]]) { ell(x, y, 5.5, 2.5, '#b05a3a', 0.4); ell(x - 1, y - 1, 3, 1, '#d07a5a', 0.4); } break;
    case 'ham':
      shape([[5, 8], [17, 5], [21, 13], [12, 21], [5, 16]], '#e8899a'); shape([[14, 7], [17, 5], [21, 13], [18, 14]], '#f4e4d4');
      rect(17, 16, 5, 2, '#f4e4d4'); break;
    case 'packedMeat':
      rect(3, 8, 18, 12, '#f2f5f8'); rect(5, 10, 14, 8, '#d94141'); ell(12, 14, 4, 2.5, '#e86a6a'); rect(3, 8, 18, 2, '#9fd3e8'); break;
    case 'cakes':
      shape([[4, 12], [20, 12], [20, 20], [4, 20]], '#f5d0d8'); rect(4, 15, 16, 2, '#e8889a');
      shape([[4, 12], [20, 12], [17, 8], [7, 8]], '#fff4f6'); circle(12, 7, 2.2, '#d94141'); break;
  }
}

// ---------- Icone: disegnate con le stesse funzioni del gioco ----------
function makeIcon(draw) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 48;
  const c = cv.getContext('2d');
  draw(c);
  return cv.toDataURL();
}

// un tile visto da vicino: scala s, centrato in basso
function tileIcon(drawTop) {
  return makeIcon(c => {
    const s = 1.4;
    c.setTransform(s, 0, 0, s, 32, 46 - (TH + 4) * s);
    const P = (u, v) => iso(0, 0, u, v, 0);
    const W = P(0, 1), S = P(1, 1), E = P(1, 0), down = p => [p[0], p[1] + 4];
    poly(c, [W, S, down(S), down(W)], COLORS[T.GRASS][1]);   // pareti del blocchetto
    poly(c, [S, E, down(E), down(S)], COLORS[T.GRASS][2]);
    drawTop(c, P);
  });
}

function bigIcon(drawBuilding, ground) {
  return makeIcon(c => {
    const s = 0.85;
    c.setTransform(s, 0, 0, s, 32, 46 - 2 * TH * s);
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const P = (a, b) => iso(0, 0, u + a, v + b, 0);
      poly(c, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], ground);
    }
    drawBuilding(c);
  });
}

function buildIcons() {
  for (const g of Object.keys(GOODS)) {
    const cv = document.createElement('canvas');
    cv.width = 24; cv.height = 24;
    drawGoodIcon(cv.getContext('2d'), g);
    GOOD_ICONS[g] = cv.toDataURL();
  }
  const diamond = (c, P, color) => poly(c, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], color);
  const straight = [false, true, false, true];
  ICONS.road = tileIcon((c, P) => { diamond(c, P, ROAD_COLOR); drawRoad(c, P, straight); });
  ICONS.dirt = tileIcon((c, P) => { diamond(c, P, DIRT_COLORS[0]); drawDirt(c, P, straight); });
  ICONS.rail = tileIcon((c, P) => { diamond(c, P, COLORS[T.GRASS][0]); drawRail(c, P, straight); });
  ICONS.field = tileIcon((c, P) => { diamond(c, P, SOIL); drawField(c, P, 'wheat', 3); });
  ICONS.house = tileIcon((c, P) => { diamond(c, P, COLORS[T.GRASS][0]); drawHouse(c, 0, 0, 0); });
  ICONS.farm = bigIcon(c => drawFarm(c, 0, 0, 0, 0), GROUND.farm);
  ICONS.warehouse = bigIcon(c => drawWarehouse(c, 0, 0, 0, 0), GROUND.warehouse);
  ICONS.factory = bigIcon(c => drawFactory(c, 0, 0, 0, 0), GROUND.factory);
  ICONS.supermarket = bigIcon(c => drawSupermarket(c, 0, 0, 0, 0), GROUND.supermarket);
  ICONS.dairy = bigIcon(c => drawDairy(c, 0, 0, 0, 0), GROUND.dairy);
  ICONS.slaughterhouse = bigIcon(c => drawSlaughterhouse(c, 0, 0, 0, 0), GROUND.slaughterhouse);
  for (const k of Object.keys(LIVESTOCK)) ICONS[k] = bigIcon(c => drawLivestock(c, 0, 0, 0, 0, k), GROUND[k]);
  ICONS.bakery = tileIcon((c, P) => { diamond(c, P, COLORS[T.GRASS][0]); drawBakery(c, 0, 0, 0, 0); });

  // terreno: blocchetto con freccia su, freccia giù, oppure piano
  const terrainIcon = (hgt, mark) => tileIcon((c, P) => {
    const up = p => [p[0], p[1] - hgt];
    const W = P(0, 1), S = P(1, 1), E = P(1, 0);
    poly(c, [W, S, up(S), up(W)], COLORS[T.GRASS][1]);
    poly(c, [S, E, up(E), up(S)], COLORS[T.GRASS][2]);
    poly(c, [up(P(0, 0)), up(E), up(S), up(W)], COLORS[T.GRASS][0]);
    const m = up(P(0.5, 0.5));
    c.strokeStyle = '#ffffff'; c.fillStyle = '#ffffff'; c.lineWidth = 1.6;
    if (mark === 'up' || mark === 'down') {
      const dir = mark === 'up' ? -1 : 1;
      c.beginPath(); c.moveTo(m[0], m[1] - 5 * dir); c.lineTo(m[0], m[1] + 3 * dir); c.stroke();
      c.beginPath(); c.moveTo(m[0], m[1] + 6 * dir); c.lineTo(m[0] - 3.5, m[1] + 2 * dir); c.lineTo(m[0] + 3.5, m[1] + 2 * dir); c.closePath(); c.fill();
    } else {
      for (const o of [-1.8, 1.8]) { c.beginPath(); c.moveTo(m[0] - 5, m[1] + o); c.lineTo(m[0] + 5, m[1] + o); c.stroke(); }
    }
  });
  ICONS.raise = terrainIcon(7, 'up');
  ICONS.lower = terrainIcon(0, 'down');
  ICONS.level = terrainIcon(3, 'flat');

  // mano (per spostare la mappa)
  ICONS.hand = makeIcon(c => {
    const parts = [[19, 12, 5, 16], [25, 8, 5, 20], [31, 9, 5, 19], [37, 13, 5, 15], [19, 24, 23, 15], [13, 27, 8, 6]];
    c.fillStyle = '#6b3f22';
    for (const [x, y, w, h] of parts) c.fillRect(x - 1, y - 1, w + 2, h + 2);
    c.fillStyle = '#f1c27d';
    for (const [x, y, w, h] of parts) c.fillRect(x, y, w, h);
    c.fillStyle = '#d9a35f';
    c.fillRect(20, 35, 21, 3);
  });

  // ruspa (per demolire)
  ICONS.demolish = makeIcon(c => {
    c.fillStyle = '#3a3a3a'; c.fillRect(13, 31, 34, 9);          // cingoli
    c.fillStyle = '#8a8f96';
    for (const x of [16, 23, 30, 37, 43]) c.fillRect(x, 34, 3, 3);
    c.fillStyle = '#f2c230'; c.fillRect(17, 20, 28, 11);         // corpo
    c.fillStyle = '#c99a17'; c.fillRect(17, 28, 28, 3);
    c.fillStyle = '#f2c230'; c.fillRect(28, 9, 13, 11);          // cabina
    c.fillStyle = '#9fd3e8'; c.fillRect(30, 11, 9, 6);
    c.fillStyle = '#8a8f96'; c.fillRect(6, 19, 6, 19);           // lama
    c.fillStyle = '#6b7077'; c.fillRect(11, 24, 7, 3);
  });
}

// ---------- Barra strumenti ----------
function toolLabel(id) {
  const i = TOOL_INFO[id];
  return i.cost ? i.label + ' - ' + i.cost + ' €' : i.label;
}

function groupOf(tool) { return TOOL_GROUPS.find(g => g.tools.includes(tool)); }

// Quando uno sprite finisce di caricarsi, rifà l'icona che lo usa
function onSpritesLoaded(name) {
  if (name !== 'house' || !ICONS.house) return;
  ICONS.house = tileIcon((c, P) => { poly(c, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], COLORS[T.GRASS][0]); drawHouse(c, 0, 0, 0); });
  const img = document.querySelector('#group-homes img');
  if (img) img.src = ICONS.house;
}

function buildToolbar() {
  buildIcons();
  const bar = document.getElementById('toolbar');
  for (const g of TOOL_GROUPS) {
    groupChoice[g.id] = g.tools[0];
    const b = document.createElement('button');
    b.className = 'tool';
    b.id = 'group-' + g.id;
    b.title = g.tools.map(toolLabel).join('\n');
    b.innerHTML = '<span class="num">' + g.key + '</span><img alt=""><span class="lbl">' + g.label + '</span>' +
      (g.tools.length > 1 ? '<span class="more">▲</span>' : '');
    b.querySelector('img').src = ICONS[g.tools[0]];
    b.addEventListener('click', () => {
      b.blur();
      const open = document.getElementById('submenu').dataset.group;
      setTool(groupChoice[g.id]);
      if (g.tools.length > 1 && open !== g.id) openSubmenu(g); else closeSubmenu();
    });
    bar.appendChild(b);
  }
  setTool('hand');
}

function openSubmenu(g) {
  const sm = document.getElementById('submenu');
  sm.textContent = '';
  sm.dataset.group = g.id;
  for (const id of g.tools) {
    const b = document.createElement('button');
    b.className = 'sub' + (game.tool === id ? ' active' : '');
    b.dataset.tool = id;
    const img = document.createElement('img');
    img.src = ICONS[id]; img.alt = '';
    const lbl = document.createElement('span');
    lbl.textContent = TOOL_INFO[id].label;
    const cost = document.createElement('small');
    cost.textContent = TOOL_INFO[id].cost ? TOOL_INFO[id].cost + ' €' : '';
    b.append(img, lbl, cost);
    b.addEventListener('click', () => { setTool(id); closeSubmenu(); });
    sm.appendChild(b);
  }
  // sopra il pulsante del gruppo
  const gb = document.getElementById('group-' + g.id).getBoundingClientRect();
  sm.hidden = false;
  const w = sm.offsetWidth;
  sm.style.left = Math.max(8, Math.min(innerWidth - w - 8, gb.left + gb.width / 2 - w / 2)) + 'px';
}

function closeSubmenu() {
  const sm = document.getElementById('submenu');
  sm.hidden = true;
  delete sm.dataset.group;
}

// Tasto numerico: sceglie il gruppo; se è già scelto passa allo strumento successivo del gruppo
function selectGroupByKey(key) {
  const g = TOOL_GROUPS.find(gr => gr.key === key);
  if (!g) return false;
  let id = groupChoice[g.id];
  if (g.tools.includes(game.tool) && g.tools.length > 1) id = g.tools[(g.tools.indexOf(game.tool) + 1) % g.tools.length];
  setTool(id);
  if (g.tools.length > 1) openSubmenu(g); else closeSubmenu();
  return true;
}

function setTool(id) {
  if (id !== 'field' && game.fieldMode && typeof exitFieldMode === 'function') exitFieldMode(true);
  game.tool = id;
  const g = groupOf(id);
  groupChoice[g.id] = id;
  for (const gr of TOOL_GROUPS) {
    const b = document.getElementById('group-' + gr.id);
    if (!b) continue;
    b.classList.toggle('active', gr.id === g.id);
    b.querySelector('img').src = ICONS[groupChoice[gr.id]];
  }
  for (const b of document.querySelectorAll('#submenu .sub')) b.classList.toggle('active', b.dataset.tool === id);
  const rotatable = !!BUILDINGS[id];
  document.getElementById('toolname').textContent = toolLabel(id) + (rotatable ? '  |  R: ruota' : '');
  document.getElementById('rotate-btn').hidden = !rotatable;
  canvas.style.cursor = id === 'hand' ? 'grab' : 'crosshair';
  requestDraw();
}

// ---------- Contatori e informazioni ----------
// Barra in alto: fondi, abitanti, disoccupati (abitano qui ma non lavorano), case, industrie
function updateHud() {
  document.getElementById('money').textContent = game.money.toLocaleString('it-IT') + ' €';
  document.getElementById('population').textContent = game.population;
  document.getElementById('unemployed').textContent = Math.max(0, game.population - (game.employed || 0));
  document.getElementById('houses').textContent = game.houses;
  document.getElementById('industries').textContent = game.industries;
}

// Ruota i prossimi edifici di 90°
function rotateTool() {
  game.rotation = (game.rotation + 1) % 4;
  requestDraw();
}

function updateInfo() {
  const el = document.getElementById('info');
  if (!el) return; // la riga di informazioni sul tile non è più nella barra in alto
  const h = game.hover;
  if (!h) { el.textContent = '-'; return; }
  const t = game.map[h.y][h.x];
  let s = h.x + ',' + h.y + ' - ' + TERRAIN_NAMES[t.type] + ' (quota ' + t.elev + ')';
  if (t.path) s += ' - ' + (t.main ? 'Strada principale' : t.rb ? 'Rotonda' : PATHS[t.path].name);
  if (t.field) s += ' - Campo' + (t.farm ? ' della fattoria' : ' (senza fattoria)');
  if (t.building) {
    const b = t.building;
    s += ' - ' + BUILDINGS[b.kind].name;
    if (b.kind === 'house') s += ' (' + b.residents + '/' + HOUSE_CAPACITY + ' abitanti)';
  }
  el.textContent = s;
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}
