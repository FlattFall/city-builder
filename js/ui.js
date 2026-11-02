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
  { key: '4', id: 'industry', label: 'Industrie', tools: ['farm', 'warehouse'] },
  { key: '5', id: 'demolish', label: 'Demolisci', tools: ['demolish', 'raise', 'lower', 'level'] },
];
const groupChoice = {};   // gruppo -> ultimo strumento scelto
const ICONS = {};         // strumento -> immagine (data URL)

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
  const diamond = (c, P, color) => poly(c, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], color);
  const straight = [false, true, false, true];
  ICONS.road = tileIcon((c, P) => { diamond(c, P, ROAD_COLOR); drawRoad(c, P, straight); });
  ICONS.dirt = tileIcon((c, P) => { diamond(c, P, DIRT_COLORS[0]); drawDirt(c, P, straight); });
  ICONS.rail = tileIcon((c, P) => { diamond(c, P, COLORS[T.GRASS][0]); drawRail(c, P, straight); });
  ICONS.field = tileIcon((c, P) => { diamond(c, P, SOIL); drawField(c, P, 'wheat', 3); });
  ICONS.house = tileIcon((c, P) => { diamond(c, P, COLORS[T.GRASS][0]); drawHouse(c, 0, 0, 0); });
  ICONS.farm = bigIcon(c => drawFarm(c, 0, 0, 0), GROUND.farm);
  ICONS.warehouse = bigIcon(c => drawWarehouse(c, 0, 0, 0), GROUND.warehouse);

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
