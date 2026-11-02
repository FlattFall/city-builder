// ---------- Interfaccia: barra strumenti, contatori, messaggi ----------
const TOOLS = [
  { id: 'hand',     key: '1', label: 'Mano' },
  { id: 'road',     key: '2', label: 'Strada (' + COSTS.road + ')' },
  { id: 'house',    key: '3', label: 'Casa (' + COSTS.house + ')' },
  { id: 'demolish', key: '4', label: 'Demolisci' },
];

function buildToolbar() {
  const bar = document.getElementById('toolbar');
  for (const t of TOOLS) {
    const b = document.createElement('button');
    b.id = 'tool-' + t.id;
    b.innerHTML = '<span class="k">' + t.key + '</span> ' + t.label;
    b.addEventListener('click', () => setTool(t.id));
    bar.appendChild(b);
  }
  setTool('hand');
}

function setTool(id) {
  game.tool = id;
  for (const b of document.querySelectorAll('#toolbar button')) b.classList.toggle('active', b.id === 'tool-' + id);
  canvas.style.cursor = id === 'hand' ? 'grab' : 'crosshair';
  requestDraw();
}

function updateHud() {
  document.getElementById('money').textContent = game.money.toLocaleString('it-IT') + ' €';
  document.getElementById('roads').textContent = game.roads;
  document.getElementById('houses').textContent = game.houses;
  document.getElementById('seed').textContent = game.seed + ' (' + game.size + 'x' + game.size + ')';
}

function updateInfo() {
  const el = document.getElementById('info');
  const h = game.hover;
  if (!h) { el.textContent = '-'; return; }
  const t = game.map[h.y][h.x];
  let s = h.x + ',' + h.y + ' - ' + TERRAIN_NAMES[t.type] + ' (quota ' + t.elev + ')';
  if (t.road) s += ' - Strada';
  if (t.building) s += ' - Casa';
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
