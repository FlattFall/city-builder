// ---------- Finestra Produzione della città (tasto C) ----------
// Richiesta dell'utente: vedere tutte le produzioni della città. In alto la corrente (bilancio:
// in negativo se si compra da fuori, in positivo se se ne vende), i soldi al minuto per voce,
// poi ogni merce: prodotta, usata e venduta al minuto, in deposito, prodotta in totale.
let statsOpen = false, statsTimer = 0;
function statsIsOpen() { return statsOpen; }
function openStats() {
  if (!game.started) return;
  if (typeof closeManual === 'function') closeManual();
  if (typeof closeProgress === 'function') closeProgress();
  statsOpen = true;
  document.getElementById('stats').hidden = false;
  game.hover = null;
  renderStats();
}
function closeStats() { statsOpen = false; document.getElementById('stats').hidden = true; }
function toggleStats() { if (statsOpen) closeStats(); else openStats(); }
// aggiornata ogni secondo mentre è aperta (dal ciclo del gioco)
function statsUpdate(dt) {
  if (!statsOpen) return;
  statsTimer -= dt;
  if (statsTimer > 0) return;
  statsTimer = 1;
  const sc = document.querySelector('#stats .ov-body');
  const top = sc ? sc.scrollTop : 0;
  renderStats();
  if (sc) sc.scrollTop = top;
}

// energia: somma dei sistemi (corrente prodotta, consumata, comprata e venduta)
function energySummary() {
  const E = game.elec, out = { gen: 0, demand: 0, imported: 0, exported: 0, wasted: 0, short: 0 };
  if (!E || !E.systems) return out;
  for (const s of E.systems.values()) {
    out.gen += s.gen; out.demand += s.demand; out.imported += s.imported; out.exported += s.exported;
    if (!s.outside) { out.wasted += Math.max(0, s.gen - s.demand); out.short += Math.max(0, s.demand - s.gen); }
  }
  return out;
}

function renderStats() {
  const box = document.getElementById('stats-body');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const sign = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString(LOCALE());
  const perMin = 60 / GRID.billEvery;   // bollette e corrente si pagano ogni billEvery secondi
  box.textContent = '';
  document.getElementById('stats-sub').textContent = TR('Abitanti: {n} - Fondi: {m}', { n: game.population || 0, m: money(game.money) });

  // --- Corrente
  box.appendChild(el('h3', 'pg-sector', '⚡ ' + TR('Corrente')));
  const en = energySummary(), bal = en.gen - en.demand;
  const cards = el('div', 'st-cards');
  const card = (label, value, cls, note) => {
    const c = el('div', 'st-card' + (cls ? ' ' + cls : ''));
    c.append(el('span', null, label), el('b', null, value));
    if (note) c.appendChild(el('small', null, note));
    cards.appendChild(c);
  };
  card(TR('Prodotta'), Math.round(en.gen).toLocaleString(LOCALE()));
  card(TR('Consumata'), Math.round(en.demand).toLocaleString(LOCALE()));
  card(TR('Bilancio'), sign(bal), bal < 0 ? 'neg' : bal > 0 ? 'pos' : '');
  if (en.imported > 0) card(TR('Comprata da fuori'), sign(-en.imported), 'neg', TR('{m} al minuto', { m: '−' + money(Math.round(en.imported * ELEC.importPrice * perMin)) }));
  if (en.exported > 0) card(TR('Venduta fuori'), sign(en.exported), 'pos', TR('{m} al minuto', { m: '+' + money(Math.round(en.exported * ELEC.exportPrice * perMin)) }));
  box.appendChild(cards);
  const note = (cls, text) => box.appendChild(el('div', cls, text));
  if (en.imported > 0) note('pwarn', TR('Le tue centrali non bastano: la corrente che manca si compra fuori mappa e i soldi scendono.'));
  if (en.exported > 0) note('pnote', TR('Le centrali fanno più corrente di quella che serve: quella in più va fuori mappa con i tralicci e si guadagna.'));
  if (en.wasted > 0) note('pwarn', TR('{n} di corrente in più non si vende: collega quelle centrali (strada, sottostazione e tralicci) fino al bordo della mappa per venderla.', { n: Math.round(en.wasted) }));
  if (en.short > 0) note('pwarn', TR('{n} di corrente mancano in reti senza collegamento fuori mappa: lì case e attività hanno poca corrente.', { n: Math.round(en.short) }));
  if (!en.gen && !en.demand) note('pnote', TR('Ancora nessuna rete elettrica.'));
  // centrali per tipo
  const plants = {};
  for (const b of game.buildings.values()) if (POWER[b.kind]) { const p = plants[b.kind] = plants[b.kind] || { n: 0, power: 0 }; p.n++; p.power += b.power || 0; }
  if (Object.keys(plants).length) {
    const t = el('table', 'man-table st-table');
    const h = el('tr'); for (const s of [TR('Centrale'), TR('Quante'), TR('Corrente')]) h.appendChild(el('th', null, s)); t.appendChild(h);
    for (const [k, p] of Object.entries(plants)) {
      const r = el('tr'), c0 = el('td');
      const im = el('img', 'st-icon'); im.src = ICONS[k]; im.alt = '';
      c0.append(im, document.createTextNode(' ' + BUILDINGS[k].name));
      r.append(c0, el('td', null, String(p.n)), el('td', null, String(Math.round(p.power))));
      t.appendChild(r);
    }
    box.appendChild(t);
  }

  // --- Soldi
  box.appendChild(el('h3', 'pg-sector', '€ ' + TR('Soldi al minuto')));
  const S = stats(), M = S.last ? S.last.money : null, scale = S.last ? 1 : (S.t > 5 ? STATS_WINDOW / S.t : 0);
  const mv = k => Math.round(((M || S.cur.money)[k] || 0) * scale);
  const mc = el('div', 'st-cards');
  let tot = 0;
  for (const [k, label] of [['taxes', TR('Tasse dei negozi')], ['bills', TR('Bollette')], ['export', TR('Corrente venduta')], ['import', TR('Corrente comprata')], ['accidents', TR('Incidenti stradali')]]) {
    const v = mv(k); tot += v;
    const c = el('div', 'st-card' + (v < 0 ? ' neg' : v > 0 ? ' pos' : ''));
    c.append(el('span', null, label), el('b', null, (v > 0 ? '+' : v < 0 ? '−' : '') + money(Math.abs(v))));
    mc.appendChild(c);
  }
  const ct = el('div', 'st-card ' + (tot < 0 ? 'neg' : tot > 0 ? 'pos' : ''));
  ct.append(el('span', null, TR('Totale')), el('b', null, (tot > 0 ? '+' : tot < 0 ? '−' : '') + money(Math.abs(tot))));
  mc.appendChild(ct);
  box.appendChild(mc);
  box.appendChild(el('div', 'pnote', S.last ? TR('Valori dell\'ultimo minuto di gioco.') : TR('Primo minuto: i valori sono una stima.')));

  // --- Merci
  box.appendChild(el('h3', 'pg-sector', '📦 ' + TR('Prodotti')));
  const stock = {};
  for (const b of game.buildings.values()) { for (const [g, q] of Object.entries(b.store || {})) addTo(stock, g, q); for (const [g, q] of Object.entries(b.input || {})) addTo(stock, g, q); }
  const goods = Object.keys(GOODS).filter(g => perMinute('made', g) || perMinute('used', g) || perMinute('sold', g) || stock[g] || S.total.made[g]);
  if (!goods.length) { box.appendChild(el('div', 'pnote', TR('Ancora nessuna produzione: costruisci fattorie e attività.'))); return; }
  const t = el('table', 'man-table st-table');
  const h = el('tr');
  for (const s of [TR('Merce'), TR('Prodotta al minuto'), TR('Usata al minuto'), TR('Venduta al minuto'), TR('In deposito'), TR('Prodotta in totale')]) h.appendChild(el('th', null, s));
  t.appendChild(h);
  const fmt = n => n ? (Math.round(n * 10) / 10).toLocaleString(LOCALE()) : '–';
  for (const g of goods) {
    const r = el('tr'), c0 = el('td');
    c0.append(goodImg(g), document.createTextNode(' ' + GOODS[g].name));
    r.append(c0, el('td', 'num', fmt(perMinute('made', g))), el('td', 'num', fmt(perMinute('used', g))), el('td', 'num', fmt(perMinute('sold', g))),
      el('td', 'num', fmt(stock[g] || 0)), el('td', 'num', fmt(S.total.made[g] || 0)));
    t.appendChild(r);
  }
  box.appendChild(t);
}

function initStats() {
  document.getElementById('stats-close').addEventListener('click', closeStats);
  document.getElementById('stats-btn').addEventListener('click', e => { e.target.blur(); toggleStats(); });
  const ub = document.getElementById('under-btn');
  if (ub) ub.addEventListener('click', e => { e.target.blur(); toggleUnderground(); });
  document.getElementById('stats').addEventListener('mousedown', e => { if (e.target.id === 'stats') closeStats(); });
}
