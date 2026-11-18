// ---------- Pannello degli edifici e modalità campi ----------
// Con la Mano, un clic su un edificio apre il suo pannello:
//  - Casa: abitanti e lavoro
//  - Fattoria: coltura, campi, crescita, inventario, dove mandare il raccolto
//  - Magazzino: scorte e cosa accetta (griglia di immagini)
//  - Fabbrica / Panificio: ricette attivabili, materie prime, prodotti, dove mandarli
//  - Supermercato: clienti, merce sugli scaffali, vendite e tasse
let panelTimer = 0;
let panelLive = [];      // funzioni che aggiornano numeri e barre senza ricostruire i pulsanti
let panelShape = '';     // quando cambia (nuovo edificio, coltura, ...) il pannello si ricostruisce

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// testo che si aggiorna da solo
function liveText(tag, cls, fn) {
  const e = el(tag, cls, fn());
  panelLive.push(() => { const t = fn(); if (e.textContent !== t) e.textContent = t; });
  return e;
}

function bar(valueFn, max) {
  const b = el('div', 'pbar');
  const f = el('div', 'pbar-fill');
  const upd = () => { f.style.width = Math.round(100 * Math.min(1, valueFn() / max)) + '%'; };
  upd(); panelLive.push(upd);
  b.appendChild(f);
  return b;
}

function goodImg(g, cls) {
  const i = el('img', cls || 'gicon');
  i.src = GOOD_ICONS[g]; i.alt = GOODS[g].name; i.title = GOODS[g].name;
  return i;
}

// elenco di merci con icona e quantità (che si aggiorna)
function goodsList(mapFn, emptyText) {
  const box = el('div', 'pgoods');
  const keys = Object.keys(mapFn());
  if (!keys.length) box.appendChild(el('div', 'pnote', emptyText));
  for (const g of keys) {
    const row = el('div', 'pgood');
    row.append(goodImg(g), el('span', null, GOODS[g].name), liveText('b', null, () => String(mapFn()[g] || 0)));
    box.appendChild(row);
  }
  return box;
}

// cosa determina la forma del pannello (se cambia si ricostruisce)
function panelShapeOf(b) {
  if (!b) return '';
  const others = [...game.buildings.values()].filter(w => w.kind !== 'house').map(w => w.id).join(',');
  return [b.id, b.crop, b.animal, b.name, JSON.stringify(b.dests || []), b.fields, others, b.residents >= HOUSE_CAPACITY, !!b.unreachable, accessTiles(b).length,
    !!b.incoming, Object.keys(b.store || {}).join(), Object.keys(b.input || {}).join(),
    JSON.stringify(b.accept || {}), JSON.stringify(b.recipes || {}), JSON.stringify(b.split || {}), b.vans || 0, b.level || 0,
    b.kind === 'house' ? JSON.stringify(b.happyWhy || {}) : '', b.kind === 'townHall' ? JSON.stringify(cityHappyWhy()) + taxRate() : ''].join('|');
}

function openBuildingPanel(b) {
  if (game.selected !== b.id) subOpen = null;
  game.selected = b.id;
  document.getElementById('panel').hidden = false;
  renderPanel();
  requestDraw();
}

function closePanel() {
  closeSubpanel();
  game.selected = null;
  document.getElementById('panel').hidden = true;
  requestDraw();
}

function panelIsOpen() { return !document.getElementById('panel').hidden; }

function onBuildingRemoved(b) {
  if (game.selected === b.id) closePanel();
  for (const o of game.buildings.values()) if (o.split && o.dests) { o.dests = o.dests.filter(id => game.buildings.has(id)); cleanSplit(o); }
}

// Destinazioni possibili per la merce di un edificio, con raggiungibilità su strada
const destGroupOpen = new Map();   // gruppi delle destinazioni aperti/chiusi (edificio:tipo)
function destChoices(b) {
  const from = accessTiles(b);
  return [...game.buildings.values()].filter(w => w !== b && destKindsOf(b).includes(w.kind))
    .map(w => bySea(b, w) ? { w, ok: !!waterRoute(shipStarts(b), dockTiles(w)), sea: true } : { w, ok: !!findRoute(from, accessTiles(w)) });
}

// ---------- Pannello semplice (richiesta dell'utente: prima era troppo pieno di informazioni) ----------
// In alto una riga di stato (va tutto bene, o il problema più importante con "Come fare?"), poi tre numeri
// (lavoratori, livello, furgoni) e due schede: Produzione (cosa entra -> cosa esce) e Spedizioni
// (solo le destinazioni scelte, le altre con "+ Aggiungi destinazione"). Le spiegazioni lunghe stanno nel Manuale.
const panelTab = {};          // scheda aperta per tipo di edificio: 'prod' o 'ship'
let destPickOpen = false;     // elenco "+ Aggiungi destinazione" aperto
const STATUS_TITLE = { noWorkers: 'Senza lavoratori', fewWorkers: 'Pochi lavoratori', noRoad: 'Nessuna strada', full: 'Deposito pieno',
  noInput: 'Mancano materie prime', empty: 'Scaffali vuoti', noWater: 'Senza acqua', noPower: 'Senza corrente', theft: 'Furto!', unhappy: 'Abitanti scontenti' };
const statusIconUrl = {};
function statusIcon(st) {
  if (!statusIconUrl[st]) { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.scale(2, 2); drawStatusIcon(x, st, 8, 8); statusIconUrl[st] = c.toDataURL(); }
  return statusIconUrl[st];
}
function hasShipping(b) { return !!b.dests && destKindsOf(b).length > 0; }
// la spiegazione del problema (quella che prima stava sempre scritta nel pannello)
function statusHelp(b, st) {
  if (st === 'noWorkers' || st === 'fewWorkers') return TR('Servono abitanti che vivano entro {n} tile per lavorare qui.', { n: jobRadiusOf(b.kind) });
  if (st === 'noRoad') return b.kind !== 'house' ? TR("L'entrata non è collegata a una strada.") : !accessTiles(b).length ? TR('Nessuna strada accanto alla casa.') : TR('Non è collegata alla strada principale.');
  if (st === 'full') return b.kind === 'farm' ? TR('Inventario pieno: la crescita è ferma.') : isProcessor(b) ? TR('Deposito prodotti pieno: scegli dove mandarli.') : TR('Deposito pieno: scegli dove mandare la merce.');
  if (st === 'noInput') {
    if (b.kind === 'busStop') return TR('🚌 Nessun deposito dei bus raggiunge questa fermata per strada.');
    if (POWER[b.kind] && POWER[b.kind].fuel) return TR('Senza carbone è spenta: mandalo qui dalla carbonaia o mettilo in un magazzino merci.');
    const L = natureOf(b);
    if (L && L.trees) return TR('Nessun bosco vicino: mettila accanto a una foresta.');
    return TR('Mancano materie prime: mandale qui da una fattoria o mettile in un magazzino.');
  }
  if (st === 'empty') return TR('Scaffali vuoti: mandagli merce o mettila in un magazzino.');
  if (st === 'theft') return b.theftCop ? TR('Un ladro ha colpito qui: la polizia sta arrivando.') : TR('Un ladro ha colpito qui. Costruisci una stazione di polizia vicino (entro {n} tile): i furti calano e i ladri vengono arrestati.', { n: POLICE.radius });
  if (st === 'unhappy') {
    const why = b.happyWhy || {};
    const worst = Object.keys(why).filter(k => why[k] < 0).sort((p, q) => why[p] - why[q]).slice(0, 3).map(k => TR(HAPPY_LABELS[k]).toLowerCase());
    return TR('Qui la gente è scontenta ({list}). Se resta così, nessuno viene ad abitarci e chi c\'è se ne va.', { list: worst.join(', ') || '-' });
  }
  if (st === 'noWater') {
    if (b.kind === 'sewage') return TR("Non collegato: trascina un tubo dell'acqua fino a una strada.");
    if (b.kind === 'waterWell' || b.kind === 'waterPlant') return TR('Non collegata: serve una strada accanto.');
    const n = waterNetOf(b);
    const why = b.wnet == null ? TR('collegala a una strada (i tubi sono sotto le strade)')
      : !n || !n.supply ? TR("serve un pozzo dell'acqua o un depuratore collegato alle stesse strade")
      : !n.sewer ? TR('serve uno scarico delle acque sporche collegato alle stesse strade')
      : TR("l'acqua non basta per tutti: costruisci altre fonti o scarichi");
    return TR('💧 Senza acqua: {why}.', { why }) + ' ' + (b.kind === 'house' ? TR('La casa si riempie solo fino a {n} abitanti.', { n: WATER.dryHouse }) : TR('Lavora più piano ({n}%).', { n: Math.round(WATER.drySpeed * 100) }));
  }
  if (st === 'noPower') {
    if (b.kind === 'substation') return b.hv == null ? TR('Manca il traliccio: mettine uno entro {n} tile.', { n: ELEC.linkRange }) : TR('Non collegata alla bassa tensione: mettila accanto a una strada o a un palo della luce entro {n} tile.', { n: ELEC.poleReach });
    if (POWER[b.kind]) return TR('Non collegata: serve una strada accanto o un palo della luce entro {n} tile.', { n: ELEC.poleReach });
    return b.lv == null ? TR('⚡ Senza corrente: collegala a una strada (i cavi sono sotto le strade) o a un palo della luce.') : TR('⚡ Senza corrente: la sua rete non ha centrali né collegamento fuori mappa.');
  }
  return '';
}
function statusSection(box, b) {
  const row = el('div', 'pstatus'), img = el('img', 'pstatus-ic'), txt = el('span', 'pstatus-txt'), fix = el('button', 'pfix', TR('Come fare?'));
  const help = el('div', 'pnote phelp');
  let open = false;
  const upd = () => {
    const st = buildingStatus(b);
    row.className = 'pstatus ' + (st ? 'warn' : 'ok');
    img.hidden = !st; if (st) img.src = statusIcon(st);
    const t = st ? TR(STATUS_TITLE[st]) : b.kind === 'house' || BUILDINGS[b.kind].infra ? '✓ ' + TR('Tutto a posto') : '✓ ' + TR('Al lavoro: tutto a posto');
    if (txt.textContent !== t) txt.textContent = t;
    fix.hidden = !st;
    const h = st ? statusHelp(b, st) : '';
    if (help.textContent !== h) help.textContent = h;
    help.hidden = !st || !open;
  };
  fix.addEventListener('click', () => { open = !open; upd(); });
  row.append(img, txt, fix);
  upd(); panelLive.push(upd);
  box.append(row, help);
}
// tre numeri: lavoratori, livello (con Migliora), furgoni (con +)
function chipsSection(box, b) {
  const items = [];
  const chip = (label, valFn, btn) => { const c = el('div', 'pchip'); c.append(el('span', null, label), liveText('b', null, valFn)); if (btn) c.appendChild(btn); items.push(c); return c; };
  if (JOBS[b.kind]) chip(TR('Lavoratori'), () => (b.workers || 0) + '/' + JOBS[b.kind]);
  if (canUpgrade(b)) {
    const lv = b.level || 0;
    let up = null;
    if (lv < UPGRADE.max) {
      up = el('button', 'pbuy pupgrade', TR('Migliora'));
      up.appendChild(el('small', 'pcost', money(upgradeCost(b))));
      up.title = TR('Poi lavora a velocità x{n}', { n: UPGRADE.speed[lv + 1].toLocaleString(LOCALE()) }) + (b.kind === 'livestock' ? ' - ' + TR('più animali') : '');
      up.addEventListener('click', () => { const r = buyUpgrade(b); if (r.msg) toast(r.msg); renderPanel(); });
    }
    chip(TR('Livello'), () => '★'.repeat(lv) + '☆'.repeat(UPGRADE.max - lv), up).classList.add('pstars');
  }
  if (hasShipping(b)) {
    const ship = BUILDINGS[b.kind].water;
    let buy = null;
    if (vanCount(b) < VANS_MAX) {
      buy = el('button', 'pbuy', '+ ' + TR('Compra'));
      buy.appendChild(el('small', 'pcost', money(VAN_PRICE)));
      buy.title = TR(ship ? '+ Compra una nave ({m})' : '+ Compra un furgone ({m})', { m: money(VAN_PRICE) });
      buy.addEventListener('click', () => { const r = buyVan(b); if (r.msg) toast(r.msg); b.retry = 0; renderPanel(); });
    }
    chip(TR(ship ? 'Navi' : 'Furgoni'), () => vanCount(b) + '/' + VANS_MAX, buy);
  }
  if (!items.length) return;
  const row = el('div', 'pchips');
  row.style.gridTemplateColumns = 'repeat(' + items.length + ', 1fr)';
  row.append(...items);
  box.appendChild(row);
}
// cosa entra -> cosa esce
function flowBox(left, right) {
  const f = el('div', 'pflow');
  const a = el('div', 'pflow-col'), c = el('div', 'pflow-col');
  a.appendChild(left); c.appendChild(right);
  f.append(a, el('span', 'parrow', '→'), c);
  return f;
}
// barra con due scritte sotto (a sinistra e a destra), che si aggiornano
function barWithLabels(valueFn, max, leftFn, rightFn) {
  const w = el('div');
  w.appendChild(bar(valueFn, max));
  const l = el('div', 'pbarlbl');
  l.append(liveText('span', null, leftFn), liveText('span', null, rightFn || (() => '')));
  w.appendChild(l);
  return w;
}
// pulsante con solo l'icona (il nome compare passando sopra; resta nascosto nel testo per chi non vede)
function iconChoice(g, name, cls) {
  const btn = el('button', 'pchoice picon' + (cls ? ' ' + cls : ''));
  btn.title = name;
  btn.append(goodImg(g), el('span', 'psr', name));
  return btn;
}

// Spedizioni: le destinazioni scelte (con distanza e ✕), "+ Aggiungi destinazione" con le altre divise per tipo,
// i furgoni (verde = in viaggio) e, se due destinazioni prendono la stessa merce, le percentuali
function shipSection(box, b) {
  const choices = destChoices(b);
  const setDests = ids => { b.dests = ids; cleanSplit(b); b.retry = 0; b.status = ''; game.dirty = true; renderPanel(); };
  const distOf = w => Math.round(Math.hypot(w.ax - b.ax, w.ay - b.ay));
  const whereText = ({ w, ok, sea }) => ok ? TR('{n} tile', { n: distOf(w) }) : sea ? TR("nessuna via d'acqua") : TR('nessuna strada');
  const chosen = b.dests.map(id => choices.find(ch => ch.w.id === id)).filter(Boolean);
  const goods = goodsOut(b), one = goods.length === 1 && b.split && b.split[goods[0]];
  if (!chosen.length) box.appendChild(el('div', 'pnote', TR('Nessuna destinazione: la merce resta qui.')));
  for (const ch of chosen) {
    const row = el('div', 'pdest-row' + (ch.ok ? '' : ' bad'));
    const ic = el('img'); ic.src = ICONS[ch.w.kind] || ''; ic.alt = '';
    row.append(ic, el('span', 'pdest-name', buildingName(ch.w) + (ch.sea ? ' 🚢' : '')), el('small', null, whereText(ch)));
    if (one) row.appendChild(el('b', 'pdest-pct', (one[ch.w.id] || 0) + '%'));
    const x = el('button', 'pdest-x', '✕'); x.title = TR('Togli');
    x.addEventListener('click', () => setDests(b.dests.filter(id => id !== ch.w.id)));
    row.appendChild(x);
    box.appendChild(row);
  }
  const others = choices.filter(ch => !b.dests.includes(ch.w.id));
  if (others.length) {
    const open = destPickOpen || !chosen.length;
    const add = el('button', 'padd' + (open ? ' open' : ''), TR('+ Aggiungi destinazione'));
    add.addEventListener('click', () => { destPickOpen = !open; renderPanel(); });
    box.appendChild(add);
    if (open) {
      const pick = el('div', 'ppick');
      const byKind = new Map();
      for (const ch of others) { if (!byKind.has(ch.w.kind)) byKind.set(ch.w.kind, []); byKind.get(ch.w.kind).push(ch); }
      for (const [kind, group] of byKind) {
        group.sort((p, q) => distOf(p.w) - distOf(q.w));
        const head = el('div', 'ppick-head'); const ic = el('img'); ic.src = ICONS[kind] || ''; ic.alt = '';
        head.append(ic, el('span', null, BUILDINGS[kind].name));
        if (group.length > 1) {
          const all = el('button', 'pgroup-all', TR('Tutti'));
          all.addEventListener('click', () => setDests([...new Set(b.dests.concat(group.filter(ch => ch.ok).map(ch => ch.w.id)))]));
          head.appendChild(all);
        }
        pick.appendChild(head);
        for (const ch of group) {
          const it = el('button', 'pchoice pdest' + (ch.ok ? '' : ' bad'));
          it.append(el('span', 'pdest-name', buildingName(ch.w) + (ch.sea ? ' 🚢' : '')), el('span', 'pdest-dist', whereText(ch)));
          it.addEventListener('click', () => { destPickOpen = false; setDests(b.dests.concat(ch.w.id)); });
          pick.appendChild(it);
        }
      }
      box.appendChild(pick);
    }
  } else if (!choices.length) box.appendChild(el('div', 'pnote', TR('Costruisci {list}.', { list: destKindsOf(b).map(k => BUILDINGS[k].name.toLowerCase()).join(', ') })));
  // furgoni: un rettangolino per ognuno (verde = in viaggio), i posti liberi tratteggiati
  const vr = el('div', 'pvanrow');
  vr.appendChild(el('span', null, TR(BUILDINGS[b.kind].water ? 'Navi' : 'Furgoni') + ':'));
  const boxes = [];
  for (let i = 0; i < VANS_MAX; i++) { const v = el('i', 'pvan'); boxes.push(v); vr.appendChild(v); }
  const info = el('small');
  vr.appendChild(info);
  const upd = () => {
    const out = vehicles.filter(v => v.from === b.id).length, n = vanCount(b);
    boxes.forEach((v, i) => { v.className = 'pvan' + (i >= n ? ' empty' : i < out ? ' out' : ''); });
    const t = b.status || (out ? TR('{n} in viaggio', { n: out }) : b.dests.length ? TR('Il furgone parte con almeno {n} unità', { n: VAN_MIN_LOAD }) : '');
    if (info.textContent !== t) info.textContent = t;
  };
  upd(); panelLive.push(upd);
  box.appendChild(vr);
  // percentuali: solo quando due destinazioni accese prendono la stessa merce
  if (goods.some(g => b.dests.filter(id => { const w = game.buildings.get(id); return w && takesGood(w, g); }).length >= 2)) splitSection(box, b);
}

// Merci che escono da un edificio (per la distribuzione)
function goodsOut(b) {
  const set = new Set(Object.keys(b.store || {}));
  if (b.kind === 'farm' && b.crop) set.add(b.crop);
  const N = natureOf(b);
  if (N && N.out) for (const g of Object.keys(N.out)) set.add(g);
  for (const r of RECIPES[b.kind] || []) if (b.recipes[r.out] !== false) set.add(r.out);
  for (const g of Object.keys(b.split || {})) set.add(g);
  // magazzino: tutte le merci che accetta, anche se adesso è vuoto (richiesta dell'utente:
  // la distribuzione si sceglie prima che arrivi la merce)
  if (isWarehouse(b)) for (const g of Object.keys(GOODS)) if (warehouseTakes(b.kind, g) && b.accept[g] !== false) set.add(g);
  return [...set].filter(g => GOODS[g]);
}

// Distribuzione per merce: per ogni merce che può andare a più destinazioni accese si sceglie
// "Automatica" (come prima) o la percentuale per ogni destinazione (es. 50% e 50%, o 100% a una).
function splitSection(box, b, inSub) {
  const rows = goodsOut(b).map(g => ({ g, ws: b.dests.map(id => game.buildings.get(id)).filter(w => w && takesGood(w, g)) }))
    .filter(r => r.ws.length >= 2);
  if (!inSub) box.appendChild(el('div', 'plabel', TR('Distribuzione per merce')));
  // tante merci (es. un magazzino con due uscite): la distribuzione va nella finestra a parte
  if (!inSub && rows.length > 3) { box.appendChild(subButton('split', TR('Distribuzione ({n} merci)', { n: rows.length }))); return; }
  if (!rows.length) {   // la sezione si vede sempre, con la spiegazione di come accenderla
    box.appendChild(el('div', 'pnote psplit', TR('Accendi almeno due destinazioni che accettano la stessa merce: qui potrai decidere quanta ne va a ognuna (es. 50% e 50%, o 100% a una sola).')));
    return;
  }
  for (const { g, ws } of rows) {
    const sp = b.split && b.split[g];
    const card = el('div', 'psplit');
    const head = el('div', 'psplit-head');
    head.append(goodImg(g), el('span', null, GOODS[g].name));
    const mode = el('button', 'pchoice psplit-mode' + (sp ? ' active' : ''), sp ? TR('Personalizzata') : TR('Automatica'));
    mode.title = sp ? TR('Clic per tornare alla distribuzione automatica') : TR('Clic per scegliere quanto mandare a ogni destinazione');
    mode.addEventListener('click', () => {
      b.split = b.split || {};
      if (sp) delete b.split[g];
      else {   // si parte con parti uguali
        const o = {}; let left = 100;
        ws.forEach((w, i) => { const v = i === ws.length - 1 ? left : Math.floor(100 / ws.length); o[w.id] = v; left -= v; });
        b.split[g] = o;
      }
      if (b.sent) delete b.sent[g];
      b.retry = 0; game.dirty = true; renderPanel();
    });
    head.appendChild(mode);
    card.appendChild(head);
    if (sp) {
      for (const w of ws) {
        const v = sp[w.id] || 0;
        const r = el('div', 'psplit-row');
        const minus = el('button', 'pstep', '−'), plus = el('button', 'pstep', '+');
        // la somma resta 100: quello che si aggiunge qui si toglie agli altri (e viceversa)
        const change = d => {
          const others = ws.filter(o => o !== w);
          if (d > 0) {
            let need = Math.min(d, 100 - v);
            for (const o of others.slice().sort((a, c) => (sp[c.id] || 0) - (sp[a.id] || 0))) {
              const take = Math.min(need, sp[o.id] || 0); sp[o.id] = (sp[o.id] || 0) - take; sp[w.id] = (sp[w.id] || 0) + take; need -= take;
              if (!need) break;
            }
          } else {
            const give = Math.min(-d, v);
            if (!give) return;
            const o = others.slice().sort((a, c) => (sp[a.id] || 0) - (sp[c.id] || 0))[0];
            sp[o.id] = (sp[o.id] || 0) + give; sp[w.id] = v - give;
          }
          b.retry = 0; game.dirty = true; renderPanel();
        };
        minus.addEventListener('click', () => change(-10));
        plus.addEventListener('click', () => change(10));
        const fill = el('div', 'pbar-fill'); fill.style.width = v + '%';
        const barEl = el('div', 'pbar psplit-bar'); barEl.appendChild(fill);
        r.append(el('span', 'psplit-name', buildingName(w)), minus, el('b', 'psplit-pct', v + '%'), plus);
        card.append(r, barEl);
      }
      if (ws.every(w => !sp[w.id])) card.appendChild(el('div', 'pwarn', TR('Questa merce non va da nessuna parte: metti almeno una percentuale.')));
    } else card.appendChild(el('div', 'pnote', TR('Va alla destinazione che ne ha bisogno.')));
    box.appendChild(card);
  }
}

// ---------- Finestra a parte: cosa accetta il magazzino / ricette della fabbrica ----------
let subOpen = null;   // 'accept', 'recipes' o null
function subButton(kind, text) {
  const btn = el('button', 'psub-open' + (subOpen === kind ? ' active' : ''), text + (subOpen === kind ? '  ◂' : '  ▸'));
  btn.title = TR('Apri o chiudi la finestra');
  btn.addEventListener('click', () => { subOpen = subOpen === kind ? null : kind; renderPanel(); });
  return btn;
}
function closeSubpanel() { subOpen = null; document.getElementById('subpanel').hidden = true; }
function renderSubpanel(b) {
  const box = document.getElementById('subpanel');
  const ok = b && ((subOpen === 'accept' && isWarehouse(b)) || (subOpen === 'recipes' && isProcessor(b)) || (subOpen === 'split' && b.dests));
  if (!ok) { box.hidden = true; if (subOpen && b) subOpen = null; return; }
  box.textContent = '';
  const head = el('div', 'phead');
  head.appendChild(el('b', 'pname', subOpen === 'accept' ? TR('Cosa accetta') : subOpen === 'split' ? TR('Distribuzione per merce') : TR('Ricette')));
  const x = el('button', 'pclose', '✕');
  x.addEventListener('click', () => { subOpen = null; renderPanel(); });
  head.appendChild(x);
  box.appendChild(head);
  if (subOpen === 'split') {
    box.appendChild(el('div', 'pnote', TR('Per ogni merce: Automatica, oppure Personalizzata con la percentuale per ogni uscita.')));
    splitSection(box, b, true);
  } else if (subOpen === 'accept') {
    box.appendChild(el('div', 'pnote', TR('Clic su una merce per accettarla o rifiutarla.')));
    const grid = el('div', 'pgrid');
    for (const g of Object.keys(GOODS).filter(g => warehouseTakes(b.kind, g))) {
      const on = b.accept[g] !== false;
      const btn = el('button', 'gtoggle' + (on ? ' on' : ''));
      btn.title = GOODS[g].name + (on ? TR(': accettato') : TR(': rifiutato'));
      btn.appendChild(goodImg(g));
      btn.addEventListener('click', () => { b.accept[g] = !on; game.dirty = true; renderPanel(); });
      grid.appendChild(btn);
    }
    box.appendChild(grid);
    const all = el('div', 'pchoices');
    for (const [lab, val] of [[TR('Tutto'), true], [TR('Niente'), false]]) {
      const bt = el('button', 'pchoice', lab);
      bt.addEventListener('click', () => { for (const g of Object.keys(GOODS).filter(g => warehouseTakes(b.kind, g))) b.accept[g] = val; game.dirty = true; renderPanel(); });
      all.appendChild(bt);
    }
    box.appendChild(all);
  } else {
    box.appendChild(el('div', 'pnote', TR('Clic su una ricetta per accenderla o spegnerla.')));
    for (const r of RECIPES[b.kind]) {
      const on = b.recipes[r.out] !== false;
      const row = el('button', 'precipe' + (on ? ' on' : ''));
      for (const [g, n] of Object.entries(r.in)) { if (n > 1) row.appendChild(el('span', 'pdim', n + 'x')); row.appendChild(goodImg(g)); }
      row.appendChild(el('span', 'parrow', '→'));
      row.append(goodImg(r.out), el('span', null, GOODS[r.out].name));
      row.addEventListener('click', () => { b.recipes[r.out] = !on; game.dirty = true; renderPanel(); });
      box.appendChild(row);
    }
  }
  box.hidden = false;
}

function renderPanel() {
  const b = game.selected && game.buildings.get(game.selected);
  const box = document.getElementById('panel');
  if (!b) { closePanel(); return; }
  const scroll = box.scrollTop;
  box.textContent = '';
  panelLive = [];
  panelShape = panelShapeOf(b);
  const head = el('div', 'phead');
  const hicon = document.createElement('img'); hicon.className = 'phead-icon'; hicon.alt = '';
  hicon.src = (b.kind === 'livestock' && ICONS[b.animal]) || ICONS[b.kind] || '';
  head.appendChild(hicon);
  const title = el('b', 'pname', buildingName(b));
  title.title = TR('Clic per cambiare il nome');
  const pen = el('button', 'prename', '✎');
  pen.title = TR('Cambia nome');
  const startRename = () => {
    const inp = el('input', 'pnameinput');
    inp.value = buildingName(b); inp.maxLength = 28;
    let done = false;
    const finish = save => {
      if (done) return; done = true;
      const v = inp.value.trim();
      if (save) { delete b.name; if (v && v !== buildingName(b)) b.name = v; game.dirty = true; }   // uguale al nome automatico = nessun nome
      renderPanel(); requestDraw();
    };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
    title.replaceWith(inp); pen.remove();
    inp.focus(); inp.select();
  };
  title.addEventListener('click', startRename);
  pen.addEventListener('click', startRename);
  head.append(title, pen);
  const x = el('button', 'pclose', '✕');
  x.addEventListener('click', closePanel);
  head.appendChild(x);
  box.appendChild(head);

  statusSection(box, b);
  chipsSection(box, b);

  // schede: Produzione (o Scorte) e Spedizioni, solo per chi manda merce da qualche parte
  let prod = box;
  if (hasShipping(b)) {
    const tab = panelTab[b.kind] || 'prod';
    const tabs = el('div', 'ptabs');
    prod = el('div', 'ptab' + (tab === 'prod' ? ' on' : ''));
    const ship = el('div', 'ptab' + (tab === 'ship' ? ' on' : ''));
    for (const [id, label] of [['prod', isWarehouse(b) ? TR('Scorte') : TR('Produzione')], ['ship', TR('Spedizioni')]]) {
      const t = el('button', 'ptabbtn' + (tab === id ? ' on' : ''), label);
      t.dataset.tab = id;
      if (id === 'ship') { const n = b.dests.length; t.appendChild(el('small', 'ptab-n', String(n))); }
      t.addEventListener('click', () => { panelTab[b.kind] = id; renderPanel(); });
      tabs.appendChild(t);
    }
    box.append(tabs, prod, ship);
    shipSection(ship, b);
  }

  if (b.kind === 'house') {
    box.appendChild(barWithLabels(() => b.residents, HOUSE_CAPACITY, () => TR('Abitanti: {a} / {b}', { a: b.residents, b: houseCap(b) }), () => b.incoming ? TR('In arrivo: {n}', { n: b.incoming }) : ''));
    box.appendChild(liveText('div', 'pnote', () => TR('Lavorano: {a} - disoccupati: {b}', { a: b.employed || 0, b: Math.max(0, b.residents - (b.employed || 0)) })));
    houseHappySection(box, b);
  }
  if (b.kind === 'townHall') townHallSection(box, b);
  if (b.kind === 'police') policeSection(box, b);
  if (SCHOOLS[b.kind]) schoolSection(box, b);
  if (PARKS[b.kind]) parkSection(box, b);

  if (isWarehouse(b)) {
    prod.appendChild(goodsList(() => b.store, TR('Vuoto.')));
    prod.appendChild(barWithLabels(() => sumOf(b.store), CAPS[b.kind].store, () => TR('Scorte: {a} / {b}', { a: sumOf(b.store), b: CAPS[b.kind].store })));
    const takes = Object.keys(GOODS).filter(g => warehouseTakes(b.kind, g));
    prod.appendChild(subButton('accept', TR('Cosa accetta ({a} di {b})', { a: takes.filter(g => b.accept[g] !== false).length, b: takes.length })));
    if (b.kind === 'port' && !dockTiles(b).length) prod.appendChild(el('div', 'pwarn', TR("Dietro il porto non c'è acqua: le navi non possono attraccare.")));
  }

  if (b.kind === 'farm') {
    const left = el('div', 'pgood');
    if (b.crop) left.append(goodImg(b.crop), el('span', null, TR('Campi: {n}', { n: b.fields })));
    prod.appendChild(flowBox(left, goodsList(() => b.store, TR('Ancora niente raccolto.'))));
    prod.appendChild(barWithLabels(() => b.growth, 1, () => TR('Crescita: {n}%', { n: Math.floor(b.growth * 100) }), () => TR('Inventario: {a} / {b}', { a: sumOf(b.store), b: farmCap(b) })));
    const crops = el('div', 'picons');
    for (const [id, c] of Object.entries(CROPS)) {
      const locked = cropLocked(id);
      const btn = iconChoice(id, (locked ? '🔒 ' : '') + c.name, (b.crop === id ? 'active' : '') + (locked ? ' locked' : ''));
      if (locked) btn.title = c.name + ' - ' + TR('Bloccato: sbloccalo nei Progressi (P)');
      btn.addEventListener('click', () => {
        if (locked) { openProgress(UNLOCKS.find(u => u.crops && u.crops.includes(id)).id); return; }
        if (b.crop !== id) { b.crop = id; b.growth = 0; game.dirty = true; } // si riparte dalla semina
        renderPanel(); requestDraw();
      });
      crops.appendChild(btn);
    }
    prod.appendChild(crops);
    const fr = el('div', 'prow', TR('Campi: {n}', { n: b.fields }) + ' ');
    const add = el('button', 'psmall', '+ ' + TR('Aggiungi campi'));
    add.addEventListener('click', () => enterFieldMode(b));
    fr.appendChild(add);
    prod.appendChild(fr);
    if (!b.fields) prod.appendChild(el('div', 'pwarn', TR('Senza campi la fattoria non produce.')));
  }

  if (b.kind === 'livestock') {
    const row = el('div', 'picons');
    for (const [a, A] of Object.entries(LIVESTOCK)) {
      const ok = animalAllowed(b, a);
      const btn = iconChoice(A.icon, A.animal, (b.animal === a ? 'active' : '') + (ok ? '' : ' bad'));
      btn.title = A.animal + ' - ' + (ok ? TR('Produce: {list}', { list: Object.keys(A.out).map(g => GOODS[g].name.toLowerCase()).join(', ') }) : TR("Qui non c'è erba: solo pecore"));
      btn.addEventListener('click', () => { if (setAnimal(b, a)) { game.dirty = true; renderPanel(); requestDraw(); } else toast(TR("In montagna e sulla sabbia non c'è erba: qui solo pecore")); });
      row.appendChild(btn);
    }
    prod.appendChild(row);
  }

  if (natureOf(b)) {
    const L = natureOf(b);
    const left = el('div', 'pflow-make');
    for (const [g, q] of Object.entries(L.out)) { left.appendChild(goodImg(g)); left.appendChild(el('span', 'pdim', q + ' ')); }
    left.appendChild(el('span', 'pdim', TR('ogni {n} s', { n: L.every })));
    prod.prepend(flowBox(left, goodsList(() => b.store, TR('Ancora niente.'))));
    prod.appendChild(barWithLabels(() => b.growth || 0, 1, () => TR('Prossima produzione: {n}%', { n: Math.floor((b.growth || 0) * 100) }), () => TR('Deposito: {a} / {b}', { a: sumOf(b.store), b: CAPS[b.kind].store })));
    if (L.oil) prod.appendChild(liveText('div', 'pnote', () => TR('Giacimento: {n}% (produce in proporzione)', { n: Math.round((b.oil ?? oilUnder(b.kind, b.ax, b.ay)) * 100) })));
    if (L.trees) prod.appendChild(liveText('div', 'pnote', () => TR('Alberi nella zona: {n} - produzione {p}% (100% con {m} alberi, fino a 150%)', { n: b.trees || 0, p: Math.round(forestRatio(b, L) * 100), m: L.trees })));
  }

  if (isProcessor(b)) {
    prod.appendChild(flowBox(goodsList(() => b.input, TR('Nessuna materia prima.')), goodsList(() => b.store, TR('Ancora niente.'))));
    prod.appendChild(barWithLabels(() => sumOf(b.store), CAPS[b.kind].store, () => TR('Materie prime: {a} / {b}', { a: sumOf(b.input), b: CAPS[b.kind].input }), () => TR('Prodotti pronti: {a} / {b}', { a: sumOf(b.store), b: CAPS[b.kind].store })));
    prod.appendChild(el('div', 'plabel', TR('Ricette')));
    const recs = el('div', 'picons');
    for (const r of RECIPES[b.kind]) {
      const on = b.recipes[r.out] !== false;
      const btn = iconChoice(r.out, GOODS[r.out].name, (on ? 'active' : 'off') + ' precipe-ico');
      btn.title = GOODS[r.out].name + ' ← ' + Object.entries(r.in).map(([g, n]) => (n > 1 ? n + 'x ' : '') + GOODS[g].name).join(' + ') + ' - ' + TR('Clic per accendere o spegnere');
      btn.addEventListener('click', () => { b.recipes[r.out] = !on; game.dirty = true; renderPanel(); });
      recs.appendChild(btn);
    }
    prod.appendChild(recs);
  }

  if (POWER[b.kind]) {
    const P = POWER[b.kind];
    prod.appendChild(liveText('div', 'prow', () => TR('Energia prodotta: {n}', { n: b.power || 0 }) + (P.perLevel ? ' ' + TR('(quota {n})', { n: game.map[b.ay][b.ax].elev }) : '')));
    if (P.fuel) prod.appendChild(barWithLabels(() => (b.input || {})[P.fuel] || 0, CAPS[b.kind].input, () => GOODS[P.fuel].name + ': ' + ((b.input || {})[P.fuel] || 0) + ' / ' + CAPS[b.kind].input, () => TR('(1 ogni {n} s)', { n: P.burn })));
    netSection(prod, b);
  }
  if (b.kind === 'pylon' || b.kind === 'pole' || b.kind === 'substation') netSection(box, b);

  if (COUNTER[b.kind]) {   // panificio: vende anche al banco
    const C = COUNTER[b.kind];
    prod.appendChild(el('div', 'plabel', TR('Vendita al banco')));
    prod.appendChild(liveText('div', 'pnote', () => TR('Clienti (abitanti entro {r} tile): {n}', { r: C.radius, n: b.customers || 0 })));
    prod.appendChild(liveText('div', 'pnote', () => TR('Venduti: {n} - tasse incassate: {m}', { n: b.sold || 0, m: money(b.taxes || 0) })));
  }
  if (SHOPS[b.kind]) {
    const S = SHOPS[b.kind], cap = CAPS[b.kind].store;
    box.appendChild(goodsList(() => b.store, TR('Scaffali vuoti.')));
    box.appendChild(barWithLabels(() => sumOf(b.store), cap, () => TR('Scaffali: {a} / {b}', { a: sumOf(b.store), b: cap })));
    box.appendChild(liveText('div', 'pnote', () => TR('Clienti (abitanti entro {r} tile): {n}', { r: S.radius, n: b.customers || 0 })));
    box.appendChild(liveText('div', 'pnote', () => TR('Venduti: {n} - tasse incassate: {m}', { n: b.sold, m: money(b.taxes) })));
    const row = el('div', 'prow pwrapicons', TR('Vende:') + ' ');
    for (const g of Object.keys(GOODS).filter(g => shopOf(g) === b.kind)) row.appendChild(goodImg(g));
    box.appendChild(row);
  }
  waterBusSection(prod, b);
  renderSubpanel(b);
  box.scrollTop = scroll;
}

// Acqua e bus nel pannello (richiesta dell'utente)
function waterBusSection(box, b) {
  if (b.kind === 'waterWell' || b.kind === 'waterPlant') {
    box.appendChild(liveText('div', 'prow', () => TR("Acqua prodotta: {n}", { n: b.pumped || 0 }) + (b.kind === 'waterWell' ? ' ' + TR('(falda {n}%)', { n: Math.round((b.gw ?? groundwaterAt(b.ax, b.ay)) * 100) }) : '')));
    box.appendChild(liveText('div', 'pnote', () => { const n = waterNetOf(b); return n ? TR('Rete: acqua {a} - consumo {b} - scarichi {c}', { a: n.supply, b: n.demand, c: n.sewer }) : TR('Non collegata: serve una strada accanto.'); }));
  }
  if (b.kind === 'sewage') {
    box.appendChild(liveText('div', 'prow', () => TR('Acque sporche portate via: {a} / {b}', { a: Math.round(b.flow || 0), b: WATER.sewage })));

  }
  if (b.kind === 'busStop' && b.depot) box.appendChild(el('div', 'pnote', TR('🚌 Servita dal deposito: chi abita entro {n} tile va a lavorare con il bus.', { n: BUS.walk })));
  if (b.kind === 'busDepot') {
    box.appendChild(liveText('div', 'prow', () => TR('Fermate servite: {n}', { n: [...game.buildings.values()].filter(s => s.kind === 'busStop' && s.depot === b.id).length })));
    box.appendChild(liveText('div', 'prow', () => TR('Bus in giro: {a} / {b}', { a: vehicles.filter(v => v.kind === 'bus' && v.from === b.id).length, b: BUS.perDepot })));
  }
  if (b.kind !== 'house' && game.bus && game.bus.near.has(b.id) && !BUILDINGS[b.kind].infra && b.kind !== 'busDepot')
    box.appendChild(el('div', 'pnote', TR('🚌 Fermata del bus vicina: lavoratori anche da lontano e +{n}% di velocità.', { n: Math.round(BUS.boost * 100) })));
}

// La rete elettrica di una centrale, di un traliccio o di una sottostazione
function netSection(box, b) {
  const net = () => systemOf(b);
  box.appendChild(el('div', 'plabel', TR('Rete elettrica')));
  box.appendChild(liveText('div', 'prow', () => {
    if (b.kind === 'pylon') return b.hv == null ? '' : TR('Alta tensione - tralicci collegati: {n}', { n: game.elec.hvNets.get(b.hv).pylons });
    if (b.kind === 'pole') return b.lv == null ? TR('Palo da solo: mettilo entro {n} tile da una strada o da un altro palo.', { n: ELEC.poleRange }) : TR('Bassa tensione: porta la corrente a chi è entro {n} tile.', { n: ELEC.poleReach });
    if (b.lv == null) return TR('Non collegata: serve una strada accanto o un palo della luce entro {n} tile.', { n: ELEC.poleReach });
    return '';
  }));
  if (b.kind === 'substation') box.appendChild(liveText('div', b.works ? 'pnote' : 'pwarn', () => {
    if (b.hv == null) return TR('Manca il traliccio: mettine uno entro {n} tile.', { n: ELEC.linkRange });
    if (b.lv == null) return TR('Non collegata alla bassa tensione: mettila accanto a una strada o a un palo della luce entro {n} tile.', { n: ELEC.poleReach });
    return TR('Trasforma: alta tensione ⇄ bassa tensione (case e attività).');
  }));
  box.appendChild(liveText('div', 'prow', () => { const n = net(); return n ? TR('Centrali {p} - sottostazioni {s} - tralicci {t}', { p: n.plants, s: n.subs, t: n.pylons }) : ''; }));
  box.appendChild(liveText('div', 'prow', () => { const n = net(); return n ? TR('Produzione {a} - consumo {b} - coperto {c}%', { a: Math.round(n.gen), b: n.demand, c: Math.round(n.cover * 100) }) : ''; }));
  box.appendChild(bar(() => (net() || { cover: 0 }).cover, 1));
  box.appendChild(liveText('div', 'pnote', () => {
    const n = net();
    if (!n) return '';
    if (n.outside) return TR('Collegata fuori mappa: compra {a}, vende {b} di corrente (ogni {s} s: -{m} / +{v}).', { a: Math.round(n.imported), b: Math.round(n.exported), s: GRID.billEvery, m: money(n.imported * ELEC.importPrice), v: money(n.exported * ELEC.exportPrice) });
    if (n.gen > n.demand && POWER[b.kind]) return TR('Corrente in più: con una sottostazione e i tralicci fino al bordo della mappa la vendi fuori.');
    return n.gen < n.demand ? TR('Manca corrente: costruisci centrali o porta i tralicci fino al bordo della mappa per comprarla da fuori.') : '';
  }));
  box.appendChild(liveText('div', 'pnote', () => { const g = game.grid || {}; return TR('Bollette incassate: {m}. Corrente comprata: {c}. Corrente venduta: {v}. Con la corrente le attività lavorano fino al {n}% più in fretta.', { m: money(g.bills || 0), c: money(g.importCost || 0), v: money(g.exportIncome || 0), n: Math.round(GRID.boost * 100) }); }));
}

// aggiornamento del pannello aperto (chiamato dal ciclo del gioco)
function panelUpdate(dt) {
  if (!panelIsOpen()) return;
  panelTimer -= dt;
  if (panelTimer > 0) return;
  panelTimer = 0.25;
  const b = game.selected && game.buildings.get(game.selected);
  if (!b) { closePanel(); return; }
  const typing = document.activeElement && document.activeElement.classList.contains('pnameinput');
  if (panelShapeOf(b) !== panelShape && !typing) renderPanel();   // è cambiato qualcosa di importante (non mentre si scrive il nome)
  else for (const f of panelLive) f();                  // solo numeri e barre
}

// ---------- Modalità campi ----------
function enterFieldMode(farm) {
  game.fieldMode = farm.id;
  setTool('field');
  game.fieldMode = farm.id; // setTool potrebbe averla chiusa
  const fb = document.getElementById('fieldbar');
  fb.hidden = false;
  document.getElementById('fieldbar-text').textContent =
    buildingName(farm) + ': ' + TR('trascina sul terreno per mettere i campi (dentro il riquadro tratteggiato).');
  requestDraw();
}

function exitFieldMode(keepTool) {
  game.fieldMode = null;
  document.getElementById('fieldbar').hidden = true;
  if (!keepTool) setTool('hand');
  requestDraw();
}

// appena piazzata una fattoria si scelgono i suoi campi
function onFarmPlaced(b) { enterFieldMode(b); }

function initPanel() {
  document.getElementById('rotate-btn').addEventListener('click', e => { rotateTool(); e.target.blur(); });
  document.getElementById('fieldbar-done').addEventListener('click', () => exitFieldMode());
}
