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
    JSON.stringify(b.accept || {}), JSON.stringify(b.recipes || {}), JSON.stringify(b.split || {}), b.vans || 0, b.level || 0].join('|');
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
function destChoices(b) {
  const from = accessTiles(b);
  return [...game.buildings.values()].filter(w => w !== b && destKindsOf(b).includes(w.kind))
    .map(w => bySea(b, w) ? { w, ok: !!waterRoute(shipStarts(b), dockTiles(w)), sea: true } : { w, ok: !!findRoute(from, accessTiles(w)) });
}

// Destinazioni: se ne possono accendere più di una (clic per accendere/spegnere);
// ogni merce va alla prima destinazione accesa che la accetta
function destSection(box, b) {
  box.appendChild(el('div', 'plabel', (b.kind === 'farm' ? TR('Dove portare il raccolto (anche più di una)') : isWarehouse(b) ? TR('Uscita: dove mandare le scorte (anche più di una)') : TR('Dove mandare la merce (anche più di una)'))));
  const list = el('div', 'plist');
  const choices = destChoices(b);
  for (const { w, ok, sea } of choices) {
    const on = b.dests.includes(w.id);
    // niente numeri: il nome e la distanza (così due edifici uguali si distinguono)
    const dist = Math.round(Math.hypot(w.ax - b.ax, w.ay - b.ay));
    const name = buildingName(w) + ' (' + TR('{n} tile', { n: dist }) + ')' + (sea ? ' 🚢' : '');
    const btn = el('button', 'pchoice' + (on ? ' active' : ''), (on ? '✔ ' : '') + name + (ok ? '' : sea ? TR(" - nessuna via d'acqua") : TR(' - nessuna strada')));
    if (!ok) btn.classList.add('bad');
    btn.addEventListener('click', () => {
      b.dests = on ? b.dests.filter(id => id !== w.id) : b.dests.concat(w.id);
      cleanSplit(b);
      b.retry = 0; b.status = ''; game.dirty = true; renderPanel();
    });
    list.appendChild(btn);
  }
  box.appendChild(list);
  if (!choices.length) box.appendChild(el('div', 'pnote', TR('Costruisci {list}.', { list: destKindsOf(b).map(k => BUILDINGS[k].name.toLowerCase()).join(', ') })));
  if (b.dests.length) box.appendChild(liveText('div', 'pnote', () => b.status || (b.van ? TR('Furgone in viaggio') : TR('Il furgone parte con almeno {n} unità', { n: VAN_MIN_LOAD }))));
  box.appendChild(liveText('div', 'pnote', () => { const n = vehicles.filter(v => v.from === b.id).length; return n ? TR('In giro adesso: {n} (sulla mappa collegati con una linea azzurra)', { n }) : ''; }));
  // furgoni: si parte con 2, se ne comprano altri fino a 4
  const ship = BUILDINGS[b.kind].water;
  const vr = el('div', 'prow pvans');
  vr.appendChild(el('span', null, TR(ship ? 'Navi: {a} / {b}' : 'Furgoni: {a} / {b}', { a: vanCount(b), b: VANS_MAX })));
  if (vanCount(b) < VANS_MAX) {
    const buy = el('button', 'pchoice pbuy', TR(ship ? '+ Compra una nave ({m})' : '+ Compra un furgone ({m})', { m: money(VAN_PRICE) }));
    buy.addEventListener('click', () => { const r = buyVan(b); if (r.msg) toast(r.msg); b.retry = 0; renderPanel(); });
    vr.appendChild(buy);
  }
  box.appendChild(vr);
  splitSection(box, b);
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
  box.textContent = '';
  panelLive = [];
  panelShape = panelShapeOf(b);
  const head = el('div', 'phead');
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

  if (b.kind === 'house') {
    box.appendChild(liveText('div', 'prow', () => TR('Abitanti: {a} / {b}', { a: b.residents, b: houseCap(b) })));
    box.appendChild(bar(() => b.residents, HOUSE_CAPACITY));
    if (b.incoming) box.appendChild(liveText('div', 'pnote', () => TR('In arrivo: {n}', { n: b.incoming })));
    if (!accessTiles(b).length) box.appendChild(el('div', 'pwarn', TR('Nessuna strada accanto alla casa.')));
    else if (b.unreachable) box.appendChild(el('div', 'pwarn', TR('Non è collegata alla strada principale.')));
    else if (b.residents >= HOUSE_CAPACITY) box.appendChild(el('div', 'pnote', TR('Casa piena.')));
    box.appendChild(liveText('div', 'pnote', () => TR('Lavorano: {a} - disoccupati: {b}', { a: b.employed || 0, b: Math.max(0, b.residents - (b.employed || 0)) })));
  }

  if (JOBS[b.kind]) {
    box.appendChild(liveText('div', 'prow', () => TR('Lavoratori: {a} / {b}', { a: b.workers || 0, b: JOBS[b.kind] })));
    box.appendChild(bar(() => b.workers || 0, JOBS[b.kind]));
    box.appendChild(liveText('div', 'pwarn', () => (b.workers || 0) >= JOBS[b.kind] ? '' :
      TR('Servono abitanti che vivano entro {n} tile per lavorare qui.', { n: jobRadiusOf(b.kind) })));
    if (!accessTiles(b).length) box.appendChild(el('div', 'pwarn', TR("L'entrata non è collegata a una strada.")));
  }
  if (canUpgrade(b)) {   // miglioramenti: fino a 3, ognuno fa lavorare più in fretta
    const lv = b.level || 0, row = el('div', 'prow pvans');
    row.appendChild(el('span', null, TR('Miglioramenti:') + ' ' + '★'.repeat(lv) + '☆'.repeat(UPGRADE.max - lv) +
      ' ' + TR('(velocità x{n})', { n: UPGRADE.speed[lv].toLocaleString(LOCALE()) })));
    if (lv < UPGRADE.max) {
      const up = el('button', 'pchoice pbuy pupgrade', TR('Migliora ({m})', { m: money(upgradeCost(b)) }));
      up.title = TR('Poi lavora a velocità x{n}', { n: UPGRADE.speed[lv + 1].toLocaleString(LOCALE()) }) + (b.kind === 'livestock' ? ' - ' + TR('più animali') : '');
      up.addEventListener('click', () => { const r = buyUpgrade(b); if (r.msg) toast(r.msg); renderPanel(); });
      row.appendChild(up);
    }
    box.appendChild(row);
  }

  if (isWarehouse(b)) {
    box.appendChild(liveText('div', 'prow', () => TR('Scorte: {a} / {b}', { a: sumOf(b.store), b: CAPS[b.kind].store })));
    box.appendChild(bar(() => sumOf(b.store), CAPS[b.kind].store));
    box.appendChild(goodsList(() => b.store, TR('Vuoto.')));
    // cosa accetta: in una finestra a parte che si apre e si chiude (richiesta dell'utente: occupava troppo spazio)
    const takes = Object.keys(GOODS).filter(g => warehouseTakes(b.kind, g));
    box.appendChild(subButton('accept', TR('Cosa accetta ({a} di {b})', { a: takes.filter(g => b.accept[g] !== false).length, b: takes.length })));
    if (b.kind === 'port' && !dockTiles(b).length) box.appendChild(el('div', 'pwarn', TR("Dietro il porto non c'è acqua: le navi non possono attraccare.")));
    box.appendChild(el('div', 'pnote', b.kind === 'port' ? TR('Magazzino marittimo: tutte le merci. Le navi arrivano dalle piattaforme e dagli altri porti; scegli un altro porto come destinazione per mandarci la merce in nave.') : b.kind === 'warehouse' ? TR('Solo cibo e animali. Manda la merce solo agli edifici che scegli qui sotto come uscita.')
      : TR('Solo merci (legno, mobili, cotone, lana, tessuti, vestiti, energia). Manda la merce solo agli edifici che scegli qui sotto come uscita.')));
    destSection(box, b);   // uscita: dove mandare le scorte
  }

  if (b.kind === 'farm') {
    box.appendChild(el('div', 'plabel', TR('Cosa coltivare')));
    const crops = el('div', 'pchoices pwrap');
    for (const [id, c] of Object.entries(CROPS)) {
      const locked = cropLocked(id);
      const btn = el('button', 'pchoice' + (b.crop === id ? ' active' : '') + (locked ? ' locked' : ''));
      btn.append(goodImg(id), el('span', null, (locked ? '🔒 ' : '') + c.name));
      if (locked) btn.title = TR('Bloccato: sbloccalo nei Progressi (P)');
      btn.addEventListener('click', () => {
        if (locked) { openProgress(UNLOCKS.find(u => u.crops && u.crops.includes(id)).id); return; }
        if (b.crop !== id) { b.crop = id; b.growth = 0; game.dirty = true; } // si riparte dalla semina
        renderPanel(); requestDraw();
      });
      crops.appendChild(btn);
    }
    box.appendChild(crops);

    const fr = el('div', 'prow', TR('Campi: {n}', { n: b.fields }) + ' ');
    const add = el('button', 'psmall', TR('Aggiungi campi'));
    add.addEventListener('click', () => enterFieldMode(b));
    fr.appendChild(add);
    box.appendChild(fr);
    if (!b.fields) box.appendChild(el('div', 'pwarn', TR('Senza campi la fattoria non produce.')));

    box.appendChild(liveText('div', 'prow', () => TR('Crescita: {n}%', { n: Math.floor(b.growth * 100) })));
    box.appendChild(el('div', 'pnote', TR('Raccolto: {n} unità ({f} campi) ogni {s} s con tutto il personale', { n: b.fields * FARM.yieldPerField, f: b.fields, s: FARM.cycleSec })));
    box.appendChild(bar(() => b.growth, 1));
    box.appendChild(liveText('div', 'prow', () => TR('Inventario: {a} / {b}', { a: sumOf(b.store), b: farmCap(b) })));
    box.appendChild(bar(() => sumOf(b.store), farmCap(b)));
    box.appendChild(goodsList(() => b.store, TR('Ancora niente raccolto.')));
    box.appendChild(liveText('div', 'pwarn', () => b.full ? TR('Inventario pieno: la crescita è ferma.') : ''));
    destSection(box, b);
  }

  if (b.kind === 'livestock') {
    box.appendChild(el('div', 'plabel', TR('Cosa allevare')));
    const row = el('div', 'pchoices pwrap');
    for (const [a, A] of Object.entries(LIVESTOCK)) {
      const ok = animalAllowed(b, a);
      const btn = el('button', 'pchoice' + (b.animal === a ? ' active' : '') + (ok ? '' : ' bad'));
      btn.append(goodImg(A.icon), el('span', null, A.animal));
      btn.title = ok ? TR('Produce: {list}', { list: Object.keys(A.out).map(g => GOODS[g].name.toLowerCase()).join(', ') }) : TR("Qui non c'è erba: solo pecore");
      btn.addEventListener('click', () => { if (setAnimal(b, a)) { game.dirty = true; renderPanel(); requestDraw(); } else toast(TR("In montagna e sulla sabbia non c'è erba: qui solo pecore")); });
      row.appendChild(btn);
    }
    box.appendChild(row);
  }

  if (natureOf(b)) {
    const L = natureOf(b);
    if (L.oil) {
      box.appendChild(liveText('div', 'prow', () => TR('Giacimento: {n}% (produce in proporzione)', { n: Math.round((b.oil ?? oilUnder(b.kind, b.ax, b.ay)) * 100) })));
      if (BUILDINGS[b.kind].water) box.appendChild(el('div', 'pnote', TR('Il personale vive a bordo. Scegli un porto come destinazione: una nave porta il petrolio.')));
    }
    if (L.trees) {
      box.appendChild(liveText('div', 'prow', () => TR('Bosco vicino: {n} tile (a pieno ritmo con {m}, entro {r} tile)', { n: b.trees || 0, m: L.trees, r: L.radius })));
      box.appendChild(liveText('div', 'pwarn', () => !b.trees ? TR('Nessun bosco vicino: mettila accanto a una foresta.') : ''));
    }
    const prod = el('div', 'prow', TR('Produce:') + ' ');
    for (const [g, q] of Object.entries(L.out)) { prod.appendChild(goodImg(g)); prod.appendChild(el('span', 'pdim', q + ' ')); }
    prod.appendChild(el('span', 'pdim', TR('ogni {n} s', { n: L.every })));
    box.appendChild(prod);
    box.appendChild(liveText('div', 'prow', () => TR('Prossima produzione: {n}%', { n: Math.floor((b.growth || 0) * 100) })));
    box.appendChild(bar(() => b.growth || 0, 1));
    box.appendChild(liveText('div', 'prow', () => TR('Deposito: {a} / {b}', { a: sumOf(b.store), b: CAPS[b.kind].store })));
    box.appendChild(goodsList(() => b.store, TR('Ancora niente.')));
    box.appendChild(liveText('div', 'pwarn', () => b.full ? TR('Deposito pieno: scegli dove mandare la merce.') : ''));
    destSection(box, b);
  }

  if (isProcessor(b)) {
    const recs = RECIPES[b.kind];
    box.appendChild(subButton('recipes', TR('Ricette ({a} di {b} accese)', { a: recs.filter(r => b.recipes[r.out] !== false).length, b: recs.length })));
    box.appendChild(liveText('div', 'prow', () => TR('Materie prime: {a} / {b}', { a: sumOf(b.input), b: CAPS[b.kind].input })));
    box.appendChild(goodsList(() => b.input, TR('Nessuna materia prima.')));
    box.appendChild(liveText('div', 'prow', () => TR('Prodotti pronti: {a} / {b}', { a: sumOf(b.store), b: CAPS[b.kind].store })));
    box.appendChild(bar(() => sumOf(b.store), CAPS[b.kind].store));
    box.appendChild(goodsList(() => b.store, TR('Ancora niente.')));
    box.appendChild(liveText('div', 'pwarn', () => b.full ? TR('Deposito prodotti pieno: scegli dove mandarli.') :
      b.noInput ? TR('Mancano materie prime: mandale qui da una fattoria o mettile in un magazzino.') : ''));
    destSection(box, b);
  }

  if (POWER[b.kind]) {
    const P = POWER[b.kind];
    box.appendChild(liveText('div', 'prow', () => TR('Energia prodotta: {n}', { n: b.power || 0 }) + (P.perLevel ? ' ' + TR('(quota {n})', { n: game.map[b.ay][b.ax].elev }) : '')));
    if (P.fuel) {
      box.appendChild(liveText('div', 'prow', () => GOODS[P.fuel].name + ': ' + ((b.input || {})[P.fuel] || 0) + ' / ' + CAPS[b.kind].input + ' ' + TR('(1 ogni {n} s)', { n: P.burn })));
      box.appendChild(bar(() => (b.input || {})[P.fuel] || 0, CAPS[b.kind].input));
      box.appendChild(liveText('div', 'pwarn', () => b.noInput ? TR('Senza carbone è spenta: mandalo qui dalla carbonaia o mettilo in un magazzino merci.') : ''));
    }
    netSection(box, b);
  }
  if (b.kind === 'pylon' || b.kind === 'pole' || b.kind === 'substation') netSection(box, b);

  if (COUNTER[b.kind]) {   // panificio: vende anche al banco
    const C = COUNTER[b.kind];
    box.appendChild(el('div', 'plabel', TR('Vendita al banco')));
    box.appendChild(liveText('div', 'prow', () => TR('Clienti (abitanti entro {r} tile): {n}', { r: C.radius, n: b.customers || 0 })));
    box.appendChild(liveText('div', 'prow', () => TR('Venduti: {n} - tasse incassate: {m}', { n: b.sold || 0, m: money(b.taxes || 0) })));
    box.appendChild(el('div', 'pnote', TR('Vende pane, biscotti e torte agli abitanti vicini; quello che avanza va alle destinazioni.')));
  }
  if (SHOPS[b.kind]) {
    const S = SHOPS[b.kind], cap = CAPS[b.kind].store;
    box.appendChild(liveText('div', 'prow', () => TR('Clienti (abitanti entro {r} tile): {n}', { r: S.radius, n: b.customers || 0 })));
    box.appendChild(liveText('div', 'prow', () => TR('Venduti: {n} - tasse incassate: {m}', { n: b.sold, m: money(b.taxes) })));
    box.appendChild(liveText('div', 'prow', () => TR('Scaffali: {a} / {b}', { a: sumOf(b.store), b: cap })));
    box.appendChild(bar(() => sumOf(b.store), cap));
    box.appendChild(goodsList(() => b.store, TR('Scaffali vuoti.')));
    box.appendChild(liveText('div', 'pwarn', () => b.empty ? TR('Scaffali vuoti: mandagli merce o mettila in un magazzino.') : ''));
    const sells = Object.keys(GOODS).filter(g => shopOf(g) === b.kind);
    const row = el('div', 'prow pwrapicons', TR('Vende:') + ' ');
    for (const g of sells) { const im = goodImg(g); im.title = GOODS[g].name; row.appendChild(im); }
    box.appendChild(row);
    box.appendChild(el('div', 'pnote', TR('Si rifornisce dai magazzini che lo hanno come uscita. Tasse: {n}% del prezzo.', { n: Math.round(TAX_RATE * 100) })));
  }
  if (isConsumer(b)) box.appendChild(liveText('div', (b.powered || 0) > 0.5 ? 'pnote' : 'pwarn', () => (b.powered || 0) > 0.5
    ? TR('⚡ Corrente: sì ({n}%)', { n: Math.round((b.powered || 0) * 100) })
    : b.lv == null ? TR('⚡ Senza corrente: collegala a una strada (i cavi sono sotto le strade) o a un palo della luce.')
    : TR('⚡ Senza corrente: la sua rete non ha centrali né collegamento fuori mappa.')));
  waterBusSection(box, b);
  renderSubpanel(b);
}

// Acqua e bus nel pannello (richiesta dell'utente)
function waterBusSection(box, b) {
  if (isWaterUser(b)) box.appendChild(liveText('div', (b.watered || 0) >= 0.5 ? 'pnote' : 'pwarn', () => {
    if ((b.watered || 0) >= 0.5) return TR('💧 Acqua: sì ({n}%)', { n: Math.round((b.watered || 0) * 100) });
    const n = waterNetOf(b);
    const why = b.wnet == null ? TR('collegala a una strada (i tubi sono sotto le strade)')
      : !n || !n.supply ? TR("serve un pozzo dell'acqua o un depuratore collegato alle stesse strade")
      : !n.sewer ? TR('serve uno scarico delle acque sporche collegato alle stesse strade')
      : TR("l'acqua non basta per tutti: costruisci altre fonti o scarichi");
    return TR('💧 Senza acqua: {why}.', { why }) + ' ' + (b.kind === 'house' ? TR('La casa si riempie solo fino a {n} abitanti.', { n: WATER.dryHouse }) : TR('Lavora più piano ({n}%).', { n: Math.round(WATER.drySpeed * 100) }));
  }));
  if (b.kind === 'waterWell' || b.kind === 'waterPlant') {
    box.appendChild(liveText('div', 'prow', () => TR("Acqua prodotta: {n}", { n: b.pumped || 0 }) + (b.kind === 'waterWell' ? ' ' + TR('(falda {n}%)', { n: Math.round((b.gw ?? groundwaterAt(b.ax, b.ay)) * 100) }) : '')));
    box.appendChild(liveText('div', 'pnote', () => { const n = waterNetOf(b); return n ? TR('Rete: acqua {a} - consumo {b} - scarichi {c}', { a: n.supply, b: n.demand, c: n.sewer }) : TR('Non collegata: serve una strada accanto.'); }));
  }
  if (b.kind === 'sewage') {
    box.appendChild(liveText('div', 'prow', () => TR('Acque sporche portate via: {a} / {b}', { a: Math.round(b.flow || 0), b: WATER.sewage })));
    box.appendChild(liveText('div', 'pwarn', () => b.wnet == null ? TR("Non collegato: trascina un tubo dell'acqua fino a una strada.") : ''));
    box.appendChild(el('div', 'pnote', TR("Più acqua sporca = macchia marrone più grande intorno allo scarico.")));
  }
  if (b.kind === 'busStop') box.appendChild(liveText('div', b.depot ? 'pnote' : 'pwarn', () => b.depot
    ? TR('🚌 Servita dal deposito: chi abita entro {n} tile va a lavorare con il bus.', { n: BUS.walk })
    : TR('🚌 Nessun deposito dei bus raggiunge questa fermata per strada.')));
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
