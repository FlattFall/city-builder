// Test automatico: apre il gioco in Chromium e prova strade, demolizione, zoom e click.
// Uso:  node tools/smoke-test.js   (serve il pacchetto "playwright" installato)
const path = require('path');
const { chromium } = require('playwright');

function check(cond, msg) {
  console.log((cond ? 'OK   ' : 'FAIL ') + msg);
  if (!cond) process.exitCode = 1;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());

  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(url);
  await page.waitForTimeout(300);
  await page.screenshot({ path: process.env.SHOTS + '/1-start.png' });

  // 0. all'avvio c'è il menu principale, senza "Riprendi"; Esc non lo chiude
  const m0 = await page.evaluate(() => ({ open: !document.getElementById('menu').hidden, resume: !document.getElementById('m-resume').hidden, started: game.started }));
  check(m0.open && !m0.resume && !m0.started, 'avvio: menu aperto, senza Riprendi');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => !document.getElementById('menu').hidden), 'avvio: Esc non chiude il menu senza una mappa');
  await page.click('#m-options');
  check(await page.isVisible('text=Ci stiamo lavorando'), 'Opzioni: messaggio "ci stiamo lavorando"');
  await page.keyboard.press('Escape');
  await page.click('#m-new');
  check(await page.isVisible('#m-size-128') && await page.isVisible('#m-size-1024'), 'Nuova mappa: 4 grandezze (da 128 a 1024)');
  await page.click('#m-size-128');
  await page.waitForFunction(() => game.started);
  const m1 = await page.evaluate(() => ({ open: !document.getElementById('menu').hidden, started: game.started }));
  check(!m1.open && m1.started, 'Nuova mappa: menu chiuso e partita iniziata');

  // 1. il picking deve restituire il tile giusto (per i tile non coperti da altri)
  const pick = await page.evaluate(() => {
    let ok = 0, tot = 0, hidden = 0;
    for (let i = 0; i < 600; i++) {
      const x = Math.floor(hash(i, 1, 7) * game.size), y = Math.floor(hash(i, 2, 7) * game.size);
      const t = game.map[y][x];
      if (t.type === T.WATER) continue;
      // centro della faccia superiore, in coordinate schermo
      const z = zoomLevel();
      const sx = cam.x + (x - y) * TW / 2 * z;
      const sy = cam.y + ((x + y) * TH / 2 - t.elev * STEP + TH / 2) * z;
      const p = pickTile(sx, sy);
      tot++;
      if (p && p.x === x && p.y === y) ok++;
      // un tile può essere nascosto da un tile disegnato dopo (davanti e più alto): è normale
      else if (p && (p.y > y || (p.y === y && p.x > x))) hidden++;
    }
    return { ok, hidden, tot };
  });
  check(pick.ok + pick.hidden === pick.tot, `picking: ${pick.ok} giusti, ${pick.hidden} nascosti da colline, ${pick.tot - pick.ok - pick.hidden} sbagliati`);

  // 2. trova un blocco 6x6 di terra edificabile, visibile sullo schermo, il più vicino al centro
  const run = await page.evaluate(() => {
    const N = game.size, z = zoomLevel();
    const buildable = t => t.type === T.SAND || t.type === T.GRASS || t.type === T.FOREST;
    const onScreen = (x, y) => {
      const t = game.map[y][x];
      const sx = cam.x + (x - y) * TW / 2 * z, sy = cam.y + ((x + y) * TH / 2 - t.elev * STEP + TH / 2) * z;
      return sx > 80 && sx < view.w - 80 && sy > 120 && sy < view.h - 140;
    };
    let best = null, bestD = Infinity;
    for (let seed = 1; seed <= 60 && !best; seed++) {
    newGame(seed); centerCamera(); requestDraw();
    for (let y = 8; y < N - 14; y++)
      for (let x = 8; x < N - 14; x++) {
        let good = true;
        for (let j = 0; j < 6 && good; j++) for (let i = 0; i < 6 && good; i++) {
          if (!buildable(game.map[y + j][x + i]) || game.map[y + j][x + i].path || !onScreen(x + i, y + j)) good = false;
          if (good && game.map[y + j][x + i].elev !== game.map[y][x].elev) good = false; // blocco piatto
        }
        const d = Math.abs(x + 2 - N / 2) + Math.abs(y + 2 - N / 2);
        if (good && d < bestD) { best = { x, y }; bestD = d; }
      }
    }
    updateHud();
    return best;
  });
  check(!!run, 'trovato un blocco 6x6 edificabile e visibile');

  const screenOf = (x, y) => page.evaluate(([x, y]) => {
    const t = game.map[y][x], z = zoomLevel();
    return { x: cam.x + (x - y) * TW / 2 * z, y: cam.y + ((x + y) * TH / 2 - t.elev * STEP + TH / 2) * z };
  }, [x, y]);

  const money0 = await page.evaluate(() => game.money);
  const roads0 = await page.evaluate(() => game.roads); // la strada principale c'è già

  // 3. strumento strada (tasto 2): trascina lungo la fila
  await page.keyboard.press('2');
  const a = await screenOf(run.x, run.y), b = await screenOf(run.x + 5, run.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  const roads = await page.evaluate(() => game.roads);
  check(roads - roads0 === 6, `strade costruite trascinando: ${roads - roads0} (attese 6)`);

  // 4. una strada diagonale trascinata deve restare collegata (percorso a 4 direzioni)
  const c = await screenOf(run.x, run.y), d = await screenOf(run.x + 3, run.y + 3);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(d.x, d.y, { steps: 12 });
  await page.mouse.up();
  const roads2 = await page.evaluate(() => game.roads);
  check(roads2 > roads, `strada diagonale: ora ${roads2} strade`);

  // 5. soldi scalati
  const money1 = await page.evaluate(() => game.money);
  check(money1 < money0, `soldi scalati: ${money0} -> ${money1}`);

  // 6. casa (tasto 3) su un tile libero accanto alla fila
  await page.keyboard.press('3');
  const houseSpot = { x: run.x + 4, y: run.y + 5 }; // angolo del blocco, lontano dalle strade
  const h = await screenOf(houseSpot.x, houseSpot.y);
  await page.mouse.click(h.x, h.y);
  const houses = await page.evaluate(() => game.houses);
  check(houses === 1, `casa costruita: ${houses}`);

  await page.mouse.move(5, 5);
  await page.mouse.move(a.x, a.y + 90);
  await page.screenshot({ path: process.env.SHOTS + '/2-built.png' });

  // 7. zoom con la rotella e screenshot ravvicinato
  await page.mouse.move(a.x + 40, a.y);
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(150);
  await page.screenshot({ path: process.env.SHOTS + '/3-zoom.png' });

  // 8. demolizione (tasto 5): casa e strade
  await page.keyboard.press('5');
  await page.keyboard.press('Escape'); // chiude il sottomenu che si apre col tasto 5
  const roadsBefore = await page.evaluate(() => game.roads);
  const a2 = await screenOf(run.x, run.y), b2 = await screenOf(run.x + 5, run.y);
  await page.mouse.move(a2.x, a2.y);
  await page.mouse.down();
  await page.mouse.move(b2.x, b2.y, { steps: 12 });
  await page.mouse.up();
  const h2 = await screenOf(houseSpot.x, houseSpot.y);
  await page.mouse.click(h2.x, h2.y);
  const after = await page.evaluate(() => ({ roads: game.roads, houses: game.houses }));
  check(after.roads < roadsBefore, `demolizione strade: ${roadsBefore} -> ${after.roads}`);
  check(after.houses === 0, `demolizione casa: ${after.houses} rimaste`);

  // 9. "Mano": trascinare sposta la mappa; tasto destro sposta la mappa
  await page.keyboard.press('1');
  const cam0 = await page.evaluate(() => ({ x: cam.x, y: cam.y }));
  await page.mouse.move(600, 400);
  await page.mouse.down();
  await page.mouse.move(500, 350, { steps: 5 });
  await page.mouse.up();
  const cam1 = await page.evaluate(() => ({ x: cam.x, y: cam.y }));
  check(cam1.x !== cam0.x, 'strumento Mano: la mappa si sposta');

  // 10. salva, modifica, carica: torna com'era al salvataggio
  await page.keyboard.press('Escape');
  check(await page.isVisible('#m-resume') && await page.isVisible('#m-save'), 'in partita il menu mostra Riprendi e Salva');
  await page.screenshot({ path: process.env.SHOTS + '/1b-pause-menu.png' });
  const savedRoads = await page.evaluate(() => game.roads);
  await page.click('#m-save');
  check(await page.isVisible('text=Partita salvata'), 'Salva partita: messaggio di conferma');
  await page.click('#m-resume');
  await page.evaluate(([x, y]) => { buildRoad(x, y + 3); buildRoad(x + 1, y + 3); game.dirty = true; }, [run.x, run.y]);
  await page.keyboard.press('Escape');
  await page.click('#m-load');
  await page.screenshot({ path: process.env.SHOTS + '/1c-load-menu.png' });
  await page.click('.save-row button:text("Carica")');
  const loaded = await page.evaluate(() => ({ roads: game.roads, open: !document.getElementById('menu').hidden }));
  check(loaded.roads === savedRoads && !loaded.open, `Carica mappa: strade ${loaded.roads} (salvate ${savedRoads})`);

  // 10b. nuova mappa dal menu azzera la città
  await page.keyboard.press('Escape');
  await page.click('#m-new');
  await page.click('#m-size-256');
  await page.waitForFunction(() => game.size === 256 && !menuIsOpen());
  const reset = await page.evaluate(() => ({ h: game.houses, m: game.money,
    onlyMain: [...game.pathKeys].every(k => game.map[(k / game.size) | 0][k % game.size].main), main: game.roads }));
  check(reset.onlyMain && reset.main > 0 && reset.h === 0, `nuova mappa: solo la strada principale (${reset.main} tile), case ${reset.h}, fondi ${reset.m}`);
  check(await page.evaluate(() => game.size === 256 && game.map.length === 256), 'nuova mappa 256x256');

  // 11. rampe: cerca A (livello e), B davanti ad A in una direzione (livello e+1), C dietro ad A (livello e)
  const ramp = await page.evaluate(() => {
    const ok = t => t.type === T.SAND || t.type === T.GRASS || t.type === T.FOREST;
    const N = game.size;
    for (let y = 3; y < N - 3; y++) for (let x = 3; x < N - 3; x++) for (let d = 0; d < 4; d++) {
      const A = game.map[y][x], D = DIRS[d];
      const B = game.map[y + D.dy][x + D.dx], C = game.map[y - D.dy][x - D.dx];
      const s1 = DIRS[(d + 1) % 4], s2 = DIRS[(d + 3) % 4];
      const S1 = game.map[y + s1.dy][x + s1.dx], S2 = game.map[y + s2.dy][x + s2.dx];
      if (ok(A) && ok(B) && ok(C) && ok(S1) && ok(S2) && B.elev === A.elev + 1 && C.elev === A.elev && S1.elev === A.elev) {
        // costruisce C, A, B (strada che sale dritta)
        for (const [px, py] of [[x - D.dx, y - D.dy], [x, y], [x + D.dx, y + D.dy]]) buildRoad(px, py);
        const res = {
          x, y, d,
          rampDir: rampDir(x, y),
          upLinked: roadLinked(x, y, d) && roadLinked(x + D.dx, y + D.dy, (d + 2) % 4),
          downLinked: roadLinked(x, y, (d + 2) % 4),
          corners: cornerHeights(x, y), elev: A.elev,
        };
        // strada laterale allo stesso livello: la rampa deve sparire (strade parallele sotto un dislivello)
        buildRoad(x + s1.dx, y + s1.dy);
        res.flatWithSide = rampDir(x, y) === -1 && !roadLinked(x, y, d);
        demolish(x + s1.dx, y + s1.dy);
        res.rampBack = rampDir(x, y) === d;
        return res;
      }
    }
    return null;
  });
  check(!!ramp, 'trovato un punto con dislivello di 1 per provare la rampa');
  if (ramp) {
    check(ramp.rampDir === ramp.d, `la strada in basso diventa rampa (direzione ${ramp.rampDir}, attesa ${ramp.d})`);
    check(ramp.upLinked && ramp.downLinked, 'la rampa è collegata sopra e sotto');
    check(Math.max(...ramp.corners) === ramp.elev + 1 && Math.min(...ramp.corners) === ramp.elev, 'angoli della rampa: ' + ramp.corners.join(','));
    check(ramp.flatWithSide, 'con una strada di lato allo stesso livello resta piatta e non si collega');
    check(ramp.rampBack, 'demolita la strada di lato, torna rampa');

    // screenshot ravvicinato della rampa (zoom 4)
    await page.evaluate(([x, y]) => {
      cam.zi = ZOOMS.length - 1;
      const z = zoomLevel(), t = game.map[y][x];
      cam.x = view.w / 2 - (x - y) * TW / 2 * z;
      cam.y = view.h / 2 - ((x + y) * TH / 2 - t.elev * STEP) * z;
      game.hover = null; requestDraw();
    }, [ramp.x, ramp.y]);
    await page.waitForTimeout(100);
    await page.screenshot({ path: process.env.SHOTS + '/4-ramp.png' });
  }

  // 12. picking sulle pareti: un punto su una parete deve dare il tile a cui appartiene la parete
  const wall = await page.evaluate(() => {
    // un dirupo costruito apposta: una fila a quota 6 con davanti terreno a quota 2
    newGame(1, 128); centerCamera();
    const c = game.size / 2;
    for (let y = c - 2; y <= c + 4; y++) for (let x = c - 3; x <= c + 9; x++)
      Object.assign(game.map[y][x], { type: T.GRASS, elev: y <= c ? 6 : 2, path: null, building: null });
    recount();
    const z = zoomLevel();
    let ok = 0, tot = 0;
    for (let y = 1; y < game.size - 1 && tot < 300; y++) for (let x = 1; x < game.size - 1 && tot < 300; x++) {
      const t = game.map[y][x];
      const f = game.map[y + 1][x]; // vicino davanti a sinistra
      // (se il tile davanti-davanti è alto quanto noi copre davvero la parete: lo saltiamo)
      if (t.elev - f.elev < 2 || game.map[y + 1][x + 1].elev >= t.elev || t.building || f.building) continue;
      // punto a metà della parete sinistra (sotto il bordo S-W)
      const wxp = (x - y) * TW / 2 - TW / 4;
      const wyp = (x + y) * TH / 2 + TH * 3 / 4 - t.elev * STEP + STEP * 0.75;
      const p = pickTile(cam.x + wxp * z, cam.y + wyp * z);
      tot++;
      if (p && p.x === x && p.y === y) ok++;
    }
    return { ok, tot };
  });
  check(wall.tot > 0 && wall.ok === wall.tot, `picking sulle pareti: ${wall.ok}/${wall.tot}`);

  // 13. anteprima casa su un tile parzialmente coperto da un blocco davanti (screenshot)
  await page.keyboard.press('3');
  const covered = await page.evaluate(() => {
    const ok = t => t.type === T.SAND || t.type === T.GRASS || t.type === T.FOREST;
    for (let y = 30; y < game.size - 30; y++) for (let x = 30; x < game.size - 30; x++) {
      const t = game.map[y][x], front = game.map[y + 1][x + 1];
      // blocco davanti più alto di 1: copre la metà bassa del tile, la metà alta resta visibile
      if (ok(t) && !t.road && !t.building && front.elev === t.elev + 1 &&
          game.map[y][x + 1].elev <= t.elev && game.map[y + 1][x].elev <= t.elev) return { x, y, elev: t.elev };
    }
    return null;
  });
  if (covered) {
    const pos = await page.evaluate(([x, y]) => {
      cam.zi = ZOOMS.length - 1;
      const z = zoomLevel(), t = game.map[y][x];
      cam.x = view.w / 2 - (x - y) * TW / 2 * z;
      cam.y = view.h / 2 - ((x + y) * TH / 2 - t.elev * STEP) * z;
      // punto vicino all'angolo in alto del tile (la parte visibile)
      return { x: cam.x + (x - y) * TW / 2 * z, y: cam.y + ((x + y) * TH / 2 - t.elev * STEP + 3) * z };
    }, [covered.x, covered.y]);
    await page.mouse.move(pos.x, pos.y);
    const hov = await page.evaluate(() => game.hover);
    check(hov && hov.x === covered.x && hov.y === covered.y, 'il tile parzialmente coperto si seleziona dalla parte visibile');
    await page.screenshot({ path: process.env.SHOTS + '/5-preview-covered.png' });
  }

  // 14. rotonde: terreno artificiale con un gradino (quota 3 dietro, quota 2 davanti)
  const rb = await page.evaluate(() => {
    newGame(1);
    const N = game.size, c = N / 2;
    for (const row of game.map) for (const t of row) { t.type = T.GRASS; t.path = null; t.field = false; t.building = null; } game.pathKeys = new Set();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) game.map[y][x].elev = y < c ? 3 : 2;
    recount();
    const r = {};
    // in piano, con una strada che entra da ovest
    const fx = c - 8, fy = c + 4;
    for (const [x, y] of [[fx, fy], [fx + 1, fy], [fx, fy + 1], [fx + 1, fy + 1], [fx - 1, fy]]) buildRoad(x, y);
    r.flat = !!game.map[fy][fx].rb && game.map[fy][fx].rb.slope === -1 && roadLinked(fx - 1, fy, 1);
    // sul gradino: 2 sopra (y = c-1, quota 3) e 2 sotto (y = c, quota 2), strade che entrano
    // da sopra, da sotto e dai due lati della parte bassa (con altri due tile dopo le rampe laterali)
    const sx = c + 2, sy = c - 1;
    for (const [x, y] of [[sx, sy], [sx + 1, sy], [sx, sy + 1], [sx + 1, sy + 1], [sx, sy - 1], [sx + 1, sy + 2],
                          [sx + 2, sy + 1], [sx + 3, sy + 1], [sx - 1, sy + 1], [sx - 2, sy + 1]]) buildRoad(x, y);
    // i 2 tile bassi sono inclinati (nessun terreno aggiunto), quelli alti piani
    r.slope = rampDir(sx, sy + 1) === 0 && rampDir(sx + 1, sy + 1) === 0 && rampDir(sx, sy) === -1 &&
              cornerHeights(sx, sy + 1).join() === '3,3,2,2';
    r.slopeLinks = roadLinked(sx, sy - 1, 2) && roadLinked(sx + 1, sy + 2, 0) && roadLinked(sx, sy + 1, 0);
    r.sideLinks = roadLinked(sx + 2, sy + 1, 3) && roadLinked(sx + 3, sy + 1, 3) &&
                  roadLinked(sx - 1, sy + 1, 1) && roadLinked(sx - 2, sy + 1, 1);
    r.count = game.roundabouts;
    // demolendo un pezzo la rotonda sparisce
    demolish(fx, fy);
    r.removed = !game.map[fy + 1][fx + 1].rb && game.roundabouts === 1;
    return r;
  });
  check(rb.flat, 'rotonda in piano creata e collegata alla strada che entra');
  check(rb.slope, 'rotonda sul gradino: i 2 tile bassi inclinati, senza terreno aggiunto');
  check(rb.slopeLinks, 'rotonda sul gradino collegata sopra, sotto e al suo interno');
  check(rb.sideLinks, 'rotonda sul gradino collegata anche dai lati della parte inclinata');
  check(rb.count === 2, `rotonde contate: ${rb.count}`);
  check(rb.removed, 'demolendo un pezzo, la rotonda torna strada normale');

  // 15. binari, strade di terra, campi, fattoria e magazzino
  const more = await page.evaluate(() => {
    const N = game.size, c = N / 2, r = {};
    // binari che salgono il gradino (quota 3 dietro, 2 davanti) e incrociano una strada vicina
    for (let y = c - 3; y <= c + 2; y++) useTool('rail', c - 20, y);
    r.railRamp = rampDir(c - 20, c) === 0 && roadLinked(c - 20, c, 0) && roadLinked(c - 20, c + 1, 0);
    buildRoad(c - 19, c + 2);
    r.railNotRoad = !roadLinked(c - 20, c + 2, 1);
    useTool('dirt', c - 18, c + 2);
    r.dirtToRoad = roadLinked(c - 19, c + 2, 1);
    r.rails = game.rails;
    // campi
    useTool('field', c - 10, c + 10); useTool('field', c - 9, c + 10);
    r.fields = game.fields === 2 && !useTool('road', c - 10, c + 10).ok;
    // fattoria 2x2: occupa 4 tile, non si sovrappone, la ruspa la toglie tutta
    r.farm = useTool('farm', c - 6, c + 10).ok && game.map[c + 11][c - 5].building === game.map[c + 10][c - 6].building;
    r.overlap = !useTool('warehouse', c - 5, c + 11).ok;
    r.wh = useTool('warehouse', c - 2, c + 10).ok && game.industries === 2;
    demolish(c - 5, c + 11);
    r.farmGone = !game.map[c + 10][c - 6].building && game.industries === 1;
    return r;
  });
  check(more.railRamp, 'binari: rampa sul gradino, collegati sopra e sotto');
  check(more.railNotRoad, 'binari e strade sono reti separate');
  check(more.dirtToRoad, 'strada di terra collegata alla strada asfaltata');
  check(more.fields, 'campi coltivabili (e niente strada sopra un campo)');
  check(more.farm && more.overlap, 'fattoria 2x2 su 4 tile, senza sovrapposizioni');
  check(more.wh, 'magazzino alimenti costruito');
  check(more.farmGone, 'la ruspa demolisce tutta la fattoria');

  // 16. salva e ricarica con tutti i tipi (binari, terra, campi, edifici grandi)
  const rt = await page.evaluate(() => {
    const before = JSON.stringify([game.roads, game.rails, game.fields, game.houses, game.industries, game.roundabouts]);
    game.saveId = null; saveGame();
    const id = game.saveId;
    newGame(5);
    loadGame(id);
    const after = JSON.stringify([game.roads, game.rails, game.fields, game.houses, game.industries, game.roundabouts]);
    return { before, after };
  });
  check(rt.before === rt.after, 'salva/carica conserva tutto: ' + rt.after + (rt.before === rt.after ? '' : ' (prima ' + rt.before + ')'));

  // 17. barra: tasto 2 di nuovo passa alla strada di terra, il sottomenu si apre
  await page.keyboard.press('2');
  const t1 = await page.evaluate(() => game.tool);
  await page.keyboard.press('2');
  const t2 = await page.evaluate(() => game.tool);
  check(t2 !== t1 && await page.isVisible('#submenu'), `tasto 2 ripetuto: ${t1} -> ${t2}, sottomenu aperto`);
  await page.click('#submenu .sub[data-tool="rail"]');
  check(await page.evaluate(() => game.tool) === 'rail' && !(await page.isVisible('#submenu')), 'clic nel sottomenu sceglie i binari');

  // 18. strada principale: c'è sempre e collega i due bordi; non si può demolire
  const mr = await page.evaluate(() => {
    const r = { ok: 0, tot: 0 };
    for (let s = 11; s <= 20; s++) {
      newGame(s, 128); r.tot++;
      const e = game.entries;
      const onEdge = p => p.x === 0 || p.y === 0 || p.x === game.size - 1 || p.y === game.size - 1;
      if (e.length === 2 && onEdge(e[0]) && onEdge(e[1]) && findRoute([[e[0].x, e[0].y]], [[e[1].x, e[1].y]])) r.ok++;
    }
    const e = game.entries[0];
    r.noDemolish = !useTool('demolish', e.x, e.y).ok && roadAt(e.x, e.y);
    return r;
  });
  check(mr.ok === mr.tot, `strada principale da bordo a bordo: ${mr.ok}/${mr.tot} mappe`);
  check(mr.noDemolish, 'la strada principale non si può demolire');

  // scena di prova: terreno piano, strada da bordo a bordo con una rotonda e una rampa
  const scene = () => page.evaluate(() => {
    clearVehicles(); newGame(1, 128);
    const N = game.size, c = N / 2;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = game.map[y][x];
      Object.assign(t, { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, rb: null, elev: x > c + 12 ? 3 : 2 });
    }
    recount(); game.money = 1e6;
    for (let x = 0; x < N; x++) { useTool('road', x, c); game.map[c][x].main = true; }
    useTool('road', c - 20, c + 1); useTool('road', c - 19, c + 1);   // rotonda sul percorso
    game.entries = [{ x: 0, y: c }, { x: N - 1, y: c }];
    return c;
  });

  // 19. livellamento: buco di 1 e di 2 tile riempito, buco di 3 con discesa e salita
  const lv = await page.evaluate(() => {
    newGame(1, 128);
    const y = 20, r = {};
    for (let x = 0; x < 40; x++) for (let yy = y - 1; yy <= y + 1; yy++) Object.assign(game.map[yy][x], { type: T.GRASS, elev: 3, path: null, building: null, field: false });
    recount();
    const setLow = xs => xs.forEach(x => { game.map[y][x].elev = 2; });
    setLow([3]); setLow([10, 11]); setLow([20, 21, 22]);
    for (let x = 1; x <= 25; x++) useTool('road', x, y);
    r.one = game.map[y][3].elev === 3;
    r.two = game.map[y][10].elev === 3 && game.map[y][11].elev === 3;
    r.three = game.map[y][21].elev === 2 && rampDir(20, y) === 3 && rampDir(22, y) === 1 && rampDir(21, y) === -1 &&
      roadLinked(19, y, 1) && roadLinked(20, y, 1) && roadLinked(22, y, 1);
    return r;
  });
  check(lv.one, 'livellamento: alto-basso-alto, il terreno sotto si alza');
  check(lv.two, 'livellamento: alto-basso-basso-alto, il terreno sotto si alza');
  check(lv.three, 'tre tile bassi: discesa, tratto dritto e salita, tutto collegato');

  // 20. abitanti: le auto arrivano da fuori mappa (anche passando rotonda e rampa) fino alle case
  await scene();
  const pop = await page.evaluate(() => {
    const c = game.size / 2;
    const xs = [c - 30, c - 25, c + 20];          // case prima della rotonda, dopo la rotonda, dopo la rampa
    for (const x of xs) useTool('house', x, c - 1);
    useTool('house', c - 10, c - 5);                // casa senza strada: non si riempie
    let maxCars = 0;
    for (let i = 0; i < 60 * 20; i++) { simUpdate(0.05); maxCars = Math.max(maxCars, vehicles.length); }
    const hs = [...game.buildings.values()].filter(b => b.kind === 'house');
    return { pop: game.population, res: hs.map(b => b.residents), cars: maxCars, lonely: hs[3].unreachable === true || accessTiles(hs[3]).length === 0 };
  });
  check(pop.pop === 3 * 4 && pop.cars > 0, `abitanti arrivati in auto: ${pop.pop} (${pop.res.join(', ')})`);
  check(pop.res[3] === 0 && pop.lonely, 'una casa senza strada resta vuota');
  check(await page.evaluate(() => document.getElementById('population').textContent) === String(pop.pop), 'contatore abitanti aggiornato');

  // 21. fattoria: campi assegnati, coltura scelta dal pannello, furgone fino al magazzino
  const fm = await page.evaluate(() => {
    const c = game.size / 2, r = {};
    game.rotation = 2;                              // entrata verso la strada (dietro)
    useTool('farm', c - 40, c + 1);
    const farm = game.buildings.get(game.fieldMode);
    r.fieldMode = !!farm && game.tool === 'field';
    for (let x = c - 42; x <= c - 37; x++) for (let y = c + 3; y <= c + 4; y++) useTool('field', x, y);
    r.far = !useTool('field', c - 40, c + 20).ok;      // troppo lontano
    exitFieldMode();
    r.fields = farm.fields;
    useTool('warehouse', c - 34, c + 1);
    openBuildingPanel(farm);
    return r;
  });
  check(fm.fieldMode, 'dopo la fattoria si scelgono i campi');
  check(fm.fields === 12 && fm.far, `campi assegnati alla fattoria: ${fm.fields}, lontano rifiutato`);
  await page.click('#panel .pchoice:text("Patate")');
  await page.click('#panel .pchoice:text("Magazzino #")');
  const del = await page.evaluate(() => {
    const farm = [...game.buildings.values()].find(b => b.kind === 'farm');
    const wh = [...game.buildings.values()].find(b => b.kind === 'warehouse');
    const r = { crop: farm.crop, storage: farm.storage === wh.id };
    for (let i = 0; i < 200 * 20; i++) simUpdate(0.05);
    r.stock = wh.stock.potato; r.inv = farm.inventory; r.workers = [farm.workers, wh.workers];
    // senza magazzino l'inventario si riempie fino al limite e poi si ferma
    farm.storage = null;
    for (let i = 0; i < 400 * 10; i++) simUpdate(0.1);
    r.capped = farm.inventory === FARM.inventoryCap;
    return r;
  });
  check(del.crop === 'potato' && del.storage, 'pannello: coltura patate e magazzino scelti');
  check(del.stock > 0, `il furgone ha portato le patate al magazzino: ${del.stock} (lavoratori fattoria/magazzino ${del.workers})`);
  check(del.capped, 'inventario della fattoria limitato a ' + 100);
  await page.screenshot({ path: process.env.SHOTS + '/5b-farm-panel.png' });

  // 22. salva e ricarica tutto (abitanti, fattoria, magazzino, strada principale) in poco spazio
  const sv = await page.evaluate(() => {
    const snap = () => JSON.stringify([game.population, game.roads, game.fields,
      [...game.buildings.values()].sort((a, b) => a.id - b.id).map(b => [b.id, b.kind, b.residents, b.crop, b.storage, b.inventory, b.stock && b.stock.potato]),
      game.entries, [...game.pathKeys].filter(k => game.map[(k / game.size) | 0][k % game.size].main).length]);
    const before = snap();
    game.saveId = null; saveGame(); const id = game.saveId;
    newGame(9, 128); loadGame(id);
    const after = snap();
    newGame(4, 1024); game.saveId = null; saveGame();
    const size = JSON.stringify(readSaves().find(s => s.id === game.saveId)).length;
    return { same: before === after, size };
  });
  check(sv.same, 'salva/carica conserva abitanti, fattoria, magazzino e strada principale');
  check(sv.size < 200000, `salvataggio di una mappa 1024x1024: ${Math.round(sv.size / 1024)} KB`);

  // 23. strumenti del terreno: alza, abbassa (fino all'acqua), livella trascinando
  const tr = await page.evaluate(() => {
    newGame(1, 128); game.money = 1e6;
    const y = 30, r = {};
    for (let x = 10; x < 20; x++) Object.assign(game.map[y][x], { type: T.GRASS, elev: 2, path: null, building: null, field: false });
    useTool('raise', 10, y); useTool('raise', 10, y);
    r.raise = game.map[y][10].elev === 4;
    useTool('lower', 11, y); useTool('lower', 11, y);
    r.water = game.map[y][11].elev === 0 && game.map[y][11].type === T.WATER && !useTool('lower', 11, y).ok;
    useTool('raise', 11, y);
    r.sand = game.map[y][11].type === T.SAND && game.map[y][11].elev === 1;
    game.levelTarget = null;
    for (let x = 10; x <= 15; x++) useTool('level', x, y);   // il primo tile (quota 4) decide
    r.level = [10, 11, 12, 13, 14, 15].every(x => game.map[y][x].elev === 4);
    useTool('road', 16, y);
    r.blocked = !useTool('raise', 16, y).ok;
    return r;
  });
  check(tr.raise, 'Alza terreno');
  check(tr.water, 'Abbassa terreno fino al mare (poi diventa acqua)');
  check(tr.sand, 'alzando l\'acqua si crea sabbia');
  check(tr.level, 'Livella: tutti i tile alla quota del primo');
  check(tr.blocked, 'non si modella sotto una strada');

  // 24. montagna, rotazione, entrata unica, lavoratori, costruire dietro un edificio
  await scene();
  const mt = await page.evaluate(() => {
    const c = game.size / 2, r = {};
    for (let y = c + 10; y < c + 14; y++) for (let x = c + 10; x < c + 14; x++) game.map[y][x].type = T.ROCK;
    r.noFarm = !useTool('farm', c + 10, c + 10).ok;
    r.house = useTool('house', c + 12, c + 12).ok;
    // fattoria lontana dalle case: niente lavoratori, niente crescita
    game.rotation = 0;
    useTool('farm', c + 40, c + 3); exitFieldMode();
    const farm = [...game.buildings.values()].find(b => b.kind === 'farm');
    for (let x = c + 39; x <= c + 43; x++) useTool('field', x, c + 6);
    farm.fields = farmFieldCount(farm);
    // entrata con rotazione 0: davanti a sinistra (tile ax, ay+1 -> strada su ay+2)
    const ent = entranceOf(farm);
    r.entrance = ent.x === c + 40 && ent.y === c + 4 && ent.rx === c + 40 && ent.ry === c + 5;
    r.noAccess = accessTiles(farm).length === 0;          // la strada è dietro, non all'entrata
    for (let i = 0; i < 60 * 10; i++) simUpdate(0.1);
    r.noWorkers = (farm.workers || 0) === 0 && farm.growth === 0;
    // ruotata di 2: entrata verso la strada (dietro)
    game.rotation = 2;
    useTool('warehouse', c + 44, c + 1);
    const wh = [...game.buildings.values()].find(b => b.kind === 'warehouse');
    r.whAccess = accessTiles(wh).length === 1 && wh.rot === 2;
    // casa vicino alla fattoria: arrivano abitanti e lavoratori
    useTool('house', c + 42, c - 1); useTool('house', c + 38, c - 1);
    for (let i = 0; i < 40 * 20; i++) simUpdate(0.05);
    r.workers = farm.workers;
    r.unemployed = game.population - game.employed;
    r.hud = document.getElementById('unemployed').textContent === String(r.unemployed);
    return r;
  });
  check(mt.noFarm && mt.house, 'in montagna: casa sì, fattoria no');
  check(mt.entrance && mt.noAccess, 'entrata unica della fattoria (strada dietro = non collegata)');
  check(mt.noWorkers, 'fattoria senza abitanti vicini: niente lavoratori, niente crescita');
  check(mt.whAccess, 'magazzino ruotato con l\'entrata verso la strada');
  check(mt.workers > 0 && mt.hud, `lavoratori dalla casa vicina: ${mt.workers}, disoccupati ${mt.unemployed}`);
  await page.keyboard.press('3');
  const rot0 = await page.evaluate(() => game.rotation);
  await page.keyboard.press('r');
  check(await page.evaluate(() => game.rotation) === (rot0 + 1) % 4 && await page.isVisible('#rotate-btn'), 'tasto R ruota, pulsante Ruota visibile');
  // dietro una casa si può costruire: il tile dietro va selezionato anche se la casa lo copre
  const behind = await page.evaluate(() => {
    const c = game.size / 2, hx = c + 20, hy = c - 3;
    useTool('house', hx, hy);
    game.tool = 'road';
    // punto sullo schermo del tile dietro (hx-1, hy-1), coperto dal disegno della casa
    const t = game.map[hy - 1][hx - 1], z = zoomLevel();
    const px = cam.x + ((hx - 1) - (hy - 1)) * TW / 2 * z, py = cam.y + (((hx - 1) + (hy - 1)) * TH / 2 - t.elev * STEP + TH / 2 + 2) * z;
    const p = pickTile(px, py);
    return p && p.x === hx - 1 && p.y === hy - 1;
  });
  check(behind, 'si può scegliere (e costruire) il tile dietro una casa');

  check(errors.length === 0, 'nessun errore in console' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})();
