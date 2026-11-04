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
  // i test più vecchi provano tutti gli strumenti: le mappe nuove hanno tutto sbloccato
  // (i progressi si provano alla fine con la newGame vera, __newGame)
  await page.evaluate(() => { window.__oilAt = oilAt; window.__newGame = newGame; newGame = (...a) => { __newGame(...a); unlockAll(); }; });
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
  await page.keyboard.press('Escape');   // chiude il sottomenu (copre una parte della mappa)
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

  // 8. demolizione (tasto 8): casa e strade
  await page.keyboard.press('8');
  await page.keyboard.press('Escape'); // chiude il sottomenu che si apre col tasto 8
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
    const N = game.size;
    // terreno libero, lontano da altre strade (altrimenti la rampa cambia per colpa loro)
    const free = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const t = game.map[y + dy] && game.map[y + dy][x + dx]; if (!t || t.path || t.bridge || t.building) return false; } return true; };
    const ok = t => (t.type === T.SAND || t.type === T.GRASS || t.type === T.FOREST);
    for (let y = 3; y < N - 3; y++) for (let x = 3; x < N - 3; x++) for (let d = 0; d < 4; d++) {
      const A = game.map[y][x], D = DIRS[d];
      const B = game.map[y + D.dy][x + D.dx], C = game.map[y - D.dy][x - D.dx];
      const s1 = DIRS[(d + 1) % 4], s2 = DIRS[(d + 3) % 4];
      const S1 = game.map[y + s1.dy][x + s1.dx], S2 = game.map[y + s2.dy][x + s2.dx];
      if (ok(A) && ok(B) && ok(C) && ok(S1) && ok(S2) && B.elev === A.elev + 1 && C.elev === A.elev && S1.elev === A.elev && free(x, y)) {
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
    // campi: senza fattoria non si possono mettere
    r.noLoose = !useTool('field', c - 10, c + 10).ok && game.fields === 0;
    // fattoria 2x2: occupa 4 tile, non si sovrappone, la ruspa la toglie tutta
    r.farm = useTool('farm', c - 6, c + 10).ok && game.map[c + 11][c - 5].building === game.map[c + 10][c - 6].building;
    useTool('field', c - 9, c + 10); useTool('field', c - 8, c + 10); exitFieldMode();
    r.fields = r.noLoose && game.fields === 2 && !useTool('road', c - 9, c + 10).ok;
    r.overlap = !useTool('warehouse', c - 5, c + 11).ok;
    r.wh = useTool('warehouse', c - 2, c + 10).ok && game.industries === 2;
    demolish(c - 5, c + 11);
    r.farmGone = !game.map[c + 10][c - 6].building && game.industries === 1;
    return r;
  });
  check(more.railRamp, 'binari: rampa sul gradino, collegati sopra e sotto');
  check(more.railNotRoad, 'binari e strade sono reti separate');
  check(more.dirtToRoad, 'strada di terra collegata alla strada asfaltata');
  check(more.fields, 'campi solo dalla fattoria (e niente strada sopra un campo)');
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
  await page.click('#panel .pchoice:has-text("Patate")');
  await page.click('#panel .pchoice:text("Magazzino alimenti (")');
  const del = await page.evaluate(() => {
    const farm = [...game.buildings.values()].find(b => b.kind === 'farm');
    const wh = [...game.buildings.values()].find(b => b.kind === 'warehouse');
    const r = { crop: farm.crop, storage: farm.dests.includes(wh.id) };
    for (let i = 0; i < 200 * 20; i++) simUpdate(0.05);
    r.stock = wh.store.potato || 0; r.inv = sumOf(farm.store); r.workers = [farm.workers, wh.workers];
    // senza magazzino l'inventario si riempie fino al limite e poi si ferma
    farm.dests = []; farm.store = { potato: 80 };
    for (let i = 0; i < 400 * 10; i++) simUpdate(0.1);
    const crop = farm.fields * FARM.yieldPerField;   // si ferma quando il prossimo raccolto intero non ci sta
    r.capped = sumOf(farm.store) <= farmCap(farm) && sumOf(farm.store) > farmCap(farm) - crop && farm.full;
    return r;
  });
  check(del.crop === 'potato' && del.storage, 'pannello: coltura patate e magazzino scelti');
  check(del.stock > 0, `il furgone ha portato le patate al magazzino: ${del.stock} (lavoratori fattoria/magazzino ${del.workers})`);
  check(del.capped, 'inventario della fattoria limitato (si ferma prima di un raccolto che non ci sta)');
  await page.screenshot({ path: process.env.SHOTS + '/5b-farm-panel.png' });

  // 22. salva e ricarica tutto (abitanti, fattoria, magazzino, strada principale) in poco spazio
  const sv = await page.evaluate(() => {
    const snap = () => JSON.stringify([game.population, game.roads, game.fields,
      [...game.buildings.values()].sort((a, b) => a.id - b.id).map(b => [b.id, b.kind, b.residents, b.crop, JSON.stringify(b.dests || []), JSON.stringify(b.store || {}), JSON.stringify(b.accept || {})]),
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
    useTool('farm', c + 40, c + 3);
    const farm = [...game.buildings.values()].find(b => b.kind === 'farm');
    for (let x = c + 39; x <= c + 43; x++) useTool('field', x, c + 6);
    exitFieldMode();
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

  // 25. limiti ai bordi: trascinando o con i tasti non si esce dalla mappa
  await page.keyboard.press('1');
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(200, 300); await page.mouse.down();
    await page.mouse.move(1200, 700, { steps: 4 }); await page.mouse.up();
  }
  for (let i = 0; i < 80; i++) await page.keyboard.press('w');
  await page.waitForTimeout(100);
  const edge = await page.evaluate(() => {
    const z = zoomLevel(), cx = (view.w / 2 - cam.x) / z, cy = (view.h / 2 - cam.y) / z;
    const a = cx / (TW / 2), b = cy / (TH / 2), tx = (a + b) / 2, ty = (b - a) / 2;
    return { tx, ty, N: game.size };
  });
  check(edge.tx >= -0.01 && edge.ty >= -0.01 && edge.tx <= edge.N + 0.01 && edge.ty <= edge.N + 0.01,
    `telecamera dentro la mappa (centro su ${edge.tx.toFixed(1)}, ${edge.ty.toFixed(1)})`);
  await page.screenshot({ path: process.env.SHOTS + '/6-edge.png' });

  // 25. WASD: movimento continuo, anche con due tasti insieme (diagonale), sempre dentro i bordi
  await page.evaluate(() => { newGame(2, 128); cam.zi = 2; centerCamera(); });
  const k0 = await page.evaluate(() => ({ x: cam.x, y: cam.y }));
  await page.keyboard.down('w'); await page.keyboard.down('a');
  await page.waitForTimeout(400);
  const k1 = await page.evaluate(() => ({ x: cam.x, y: cam.y }));
  await page.keyboard.up('a');
  await page.waitForTimeout(6000);                 // tenendo W a lungo si arriva al bordo
  await page.keyboard.up('w');
  const k2 = await page.evaluate(() => {
    const z = zoomLevel(), cx = (view.w / 2 - cam.x) / z, cy = (view.h / 2 - cam.y) / z;
    const a = cx / (TW / 2), b = cy / (TH / 2);
    return { tx: (a + b) / 2, ty: (b - a) / 2, n: game.size };
  });
  check(k1.x > k0.x + 50 && k1.y > k0.y + 50, `W + A insieme: la mappa si muove in diagonale (${Math.round(k1.x - k0.x)}, ${Math.round(k1.y - k0.y)})`);
  check(k2.tx >= -0.01 && k2.ty >= -0.01 && k2.tx <= k2.n + 0.01 && k2.ty <= k2.n + 0.01, `WASD si ferma al bordo della mappa (centro ${k2.tx.toFixed(1)}, ${k2.ty.toFixed(1)})`);

  // 26. catena alimentare: fattoria -> fabbrica -> magazzino -> supermercato (tasse), panificio con la farina
  const ch = await page.evaluate(() => {
    clearVehicles(); newGame(1, 128);
    const N = game.size, c = N / 2, r = {};
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, rb: null, elev: 2 });
    recount(); game.money = 1e6;
    for (let x = 0; x < N; x++) { useTool('road', x, c); game.map[c][x].main = true; }
    game.entries = [{ x: 0, y: c }, { x: N - 1, y: c }];
    game.rotation = 2;
    useTool('farm', c - 8, c + 1); exitFieldMode();
    useTool('factory', c - 5, c + 1); useTool('warehouse', c - 2, c + 1);
    useTool('supermarket', c + 1, c + 1); useTool('bakery', c + 4, c + 1);
    game.rotation = 0;
    for (let x = c - 9; x <= c + 6; x++) useTool('house', x, c - 1);
    const B = k => [...game.buildings.values()].find(b => b.kind === k || b.animal === k);
    const farm = B('farm'), fac = B('factory'), wh = B('warehouse'), sm = B('supermarket'), bk = B('bakery');
    r.crops = Object.keys(CROPS).join(',');
    farm.crop = 'wheat'; farm.store = { wheat: 60 };
    farm.dests = [fac.id]; fac.dests = [wh.id]; bk.dests = [sm.id];
    wh.dests = [fac.id, sm.id, bk.id];   // il magazzino rifornisce solo chi ha scelto come uscita
    wh.store = { tomato: 40, cabbage: 30 };
    wh.accept.chips = false;
    r.refuses = freeFor(wh, 'chips') === 0 && freeFor(wh, 'flour') > 0;
    const money0 = game.money;
    let flourSeen = 0, pastaSeen = 0;
    for (let i = 0; i < 240 * 10; i++) {
      simUpdate(0.1);
      flourSeen = Math.max(flourSeen, (fac.store.flour || 0) + (wh.store.flour || 0));
      pastaSeen = Math.max(pastaSeen, (fac.store.pasta || 0) + (wh.store.pasta || 0) + (sm.store.pasta || 0));
    }
    r.flour = flourSeen > 0; r.pasta = pastaSeen > 0;
    r.bakery = sumOf(bk.store) + (sm.sold || 0) > 0 && Object.keys(bk.store).some(g => GOODS[g].cat === 'bakery');
    r.sold = sm.sold; r.taxes = sm.taxes; r.income = game.money - money0;
    // fabbrica senza materie prime: stato "mancano materie prime"; deposito pieno: stato "pieno"
    fac.input = {}; fac.noInput = false; fac.dests = [];
    for (let i = 0; i < 100; i++) simUpdate(0.1);
    r.noInput = buildingStatus(fac) === 'noInput';
    fac.input = { wheat: 100 }; fac.store = { flour: CAPS.factory.store };
    for (let i = 0; i < 20; i++) simUpdate(0.1);
    r.full = buildingStatus(fac) === 'full';
    // salvataggio con le merci
    game.saveId = null; saveGame(); const id = game.saveId;
    const before = JSON.stringify([fac.recipes, fac.store, wh.accept, sm.taxes]);
    loadGame(id);
    const f2 = [...game.buildings.values()].find(b => b.kind === 'factory'), w2 = [...game.buildings.values()].find(b => b.kind === 'warehouse'), s2 = [...game.buildings.values()].find(b => b.kind === 'supermarket');
    r.saved = JSON.stringify([f2.recipes, f2.store, w2.accept, s2.taxes]) === before;
    return r;
  });
  check(ch.crops === 'wheat,carrot,potato,corn,tomato,cabbage,cotton', 'colture: grano, carote, patate, mais, pomodori, cavoli, cotone');
  check(ch.refuses, 'il magazzino rifiuta quello che non accetta');
  check(ch.flour && ch.pasta, 'la fabbrica fa farina e pasta (grano + pomodori)');
  check(ch.bakery, 'il panificio usa la farina per pane, biscotti e torte');
  check(ch.sold > 0 && ch.taxes > 0 && ch.income >= ch.taxes, `supermercato: ${ch.sold} venduti, ${ch.taxes} € di tasse`);
  check(ch.noInput && ch.full, 'icone di stato: mancano materie prime / deposito pieno');
  check(ch.saved, 'salva/carica conserva ricette, merci, scelte del magazzino e tasse');

  // 27. allevamenti -> caseificio e macello -> supermercato; verdure dirette dalla fattoria
  const an = await page.evaluate(() => {
    clearVehicles(); newGame(1, 128);
    const N = game.size, c = N / 2, r = {};
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, rb: null, elev: 2 });
    recount(); game.money = 1e6;
    for (let x = 0; x < N; x++) { useTool('road', x, c); game.map[c][x].main = true; }
    game.entries = [{ x: 0, y: c }, { x: N - 1, y: c }];
    game.rotation = 2;
    for (const [k, x] of [['cowFarm', -12], ['chickenFarm', -9], ['pigFarm', -6], ['sheepFarm', -3], ['dairy', 0], ['slaughterhouse', 3], ['supermarket', 6], ['farm', 9]]) {
      // gli allevamenti sono un solo edificio: l'animale si sceglie dopo
      useTool(LIVESTOCK[k] ? 'livestock' : k, c + x, c + 1);
      if (LIVESTOCK[k]) setAnimal(game.map[c + 1][c + x].building, k);
      if (k === 'farm') exitFieldMode();
    }
    game.rotation = 0;
    for (let x = c - 13; x <= c + 10; x++) useTool('house', x, c - 1);
    const B = k => [...game.buildings.values()].find(b => b.kind === k || b.animal === k);
    const cow = B('cowFarm'), chk = B('chickenFarm'), pig = B('pigFarm'), sh = B('sheepFarm'), da = B('dairy'), sl = B('slaughterhouse'), sm = B('supermarket'), fa = B('farm');
    // le mucche mandano il latte al caseificio e i bovini al macello: due destinazioni
    cow.dests = [da.id, sl.id]; chk.dests = [sl.id, sm.id]; pig.dests = [sl.id];
    da.dests = [sm.id]; sl.dests = [sm.id];
    fa.crop = 'tomato'; fa.store = { tomato: 30 }; fa.dests = [sm.id];
    let seen = {};
    for (let i = 0; i < 300 * 10; i++) {
      simUpdate(0.1);
      for (const b of [da, sl, sm]) for (const g of Object.keys(b.store)) seen[g] = true;
      for (const g of Object.keys(da.input || {})) seen['in:' + g] = true;
      for (const g of Object.keys(sl.input || {})) seen['in:' + g] = true;
    }
    r.seen = seen; r.wool = sh.store.wool || 0; r.sold = sm.sold; r.taxes = sm.taxes;
    r.sheepMountain = (() => { for (let y = c + 20; y < c + 22; y++) for (let x = c; x < c + 2; x++) game.map[y][x].type = T.ROCK;
      if (!useTool('livestock', c, c + 20).ok) return false;
      const lv = game.map[c + 20][c].building;
      return lv.animal === 'sheepFarm' && !setAnimal(lv, 'cowFarm') && lv.animal === 'sheepFarm'; })();
    // casa senza strada: simbolo "non collegata"; casa collegata: nessun simbolo
    useTool('house', c + 30, c + 15);
    const lonely = [...game.buildings.values()].find(b => b.kind === 'house' && b.ax === c + 30);
    const linked = [...game.buildings.values()].find(b => b.kind === 'house' && b.ax === c - 13);
    r.noRoad = buildingStatus(lonely) === 'noRoad' && buildingStatus(linked) === null;
    // strada vicina ma non collegata alla principale: dopo un po' il simbolo resta
    for (let y = c + 10; y <= c + 15; y++) useTool('road', c + 31, y);
    for (let i = 0; i < 100; i++) simUpdate(0.1);
    r.island = buildingStatus(lonely) === 'noRoad';
    // vecchio salvataggio con una sola destinazione ("storage")
    const old = initEconomy({ id: 99, kind: 'farm', crop: 'wheat', storage: 5, inventory: 7 });
    r.migrate = old.dests.join() === '5' && old.store.wheat === 7 && !('storage' in old);
    return r;
  });
  const S = an.seen;
  check(S['in:milk'] && S.cheese && S.butter && S.yogurt, 'caseificio: latte -> formaggio, burro, yogurt');
  check(S['in:cattle'] && S['in:pigs'] && S['in:poultry'] && S.freshMeat && S.sausages && S.ham && S.packedMeat,
    'macello: bovini, maiali, polli -> carne fresca, salsicce, prosciutto, carne confezionata');
  check(an.wool > 0, `le pecore fanno la lana: ${an.wool}`);
  check(S.tomato && an.sold > 0 && an.taxes > 0, `supermercato con verdure dalla fattoria, carne e latticini: ${an.sold} venduti, ${an.taxes} € di tasse`);
  check(an.sheepMountain, 'pecore anche in montagna, mucche no');
  check(an.noRoad && an.island, 'simbolo "non collegata" sulle case senza strada o scollegate');
  check(an.migrate, 'vecchi salvataggi: destinazione singola convertita');

  // 28. magazzino con uscita: manda le scorte alle destinazioni scelte; niente giro tra due magazzini
  const wo = await page.evaluate(() => {
    clearVehicles(); newGame(1, 128);
    const N = game.size, c = N / 2, r = {};
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, rb: null, elev: 2 });
    recount(); game.money = 1e6;
    for (let x = 0; x < N; x++) { useTool('road', x, c); game.map[c][x].main = true; }
    game.entries = [{ x: 0, y: c }, { x: N - 1, y: c }];
    game.rotation = 2;
    for (const [k, x] of [['warehouse', -6], ['warehouse', -3], ['supermarket', 0]]) useTool(k, c + x, c + 1);
    game.rotation = 0;
    for (let x = c - 7; x <= c + 2; x++) useTool('house', x, c - 1);
    const ws = [...game.buildings.values()].filter(b => b.kind === 'warehouse'), sm = [...game.buildings.values()].find(b => b.kind === 'supermarket');
    const [w1, w2] = ws;
    r.noSelf = !destChoices(w1).some(d => d.w === w1) && destChoices(w1).some(d => d.w === sm);
    w1.store = { cheese: 40, wheat: 40 };
    w1.dests = [sm.id];
    for (let i = 0; i < 600; i++) simUpdate(0.1);
    r.toShop = (sm.store.cheese || 0) + sm.sold > 0 && (w1.store.wheat || 0) === 40;   // il grano il supermercato non lo vende
    clearVehicles();
    w1.store = { wheat: 30 }; w2.store = {}; w1.dests = [w2.id]; w2.dests = [w1.id]; w1.van = w2.van = null; w1.retry = w2.retry = 0;
    for (let i = 0; i < 100; i++) simUpdate(0.1);
    r.noLoop = !w1.van && !w2.van && /vicenda/.test(w1.status);
    return r;
  });
  check(wo.noSelf && wo.toShop, 'magazzino: uscita verso il supermercato (solo merce che accetta)');
  check(wo.noLoop, 'due magazzini non si mandano la merce a vicenda');

  // 29. senso unico, autostrada, ponti
  const rd = await page.evaluate(() => {
    clearVehicles(); newGame(1, 128);
    const N = game.size, c = N / 2, r = {};
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, rb: null, bridge: null, elev: 2 });
    recount(); resetBridges(); game.money = 1e7;
    for (let x = 0; x < N; x++) { useTool('road', x, c); game.map[c][x].main = true; }
    game.entries = [{ x: 0, y: c }, { x: N - 1, y: c }];
    // autostrada al posto della strada principale: resta principale, niente strade in più
    const roads0 = game.roads;
    r.upgrade = useTool('highway', 10, c).ok && game.map[c][10].path === 'highway' && game.map[c][10].main && game.roads === roads0;
    r.mainNoOneway = !useTool('oneway', 11, c).ok;
    for (let x = 30; x < 50; x++) useTool('highway', x, c);
    const fast = routePoints(findRoute([[30, c]], [[49, c]]));
    const slow = routePoints(findRoute([[60, c]], [[79, c]]));
    const time = pts => { const v = { pts, seg: 0, s: 0, speed: CAR_SPEED }; let t = 0; while (!moveVehicle(v, 0.05)) t += 0.05; return t; };
    r.faster = time(fast) < time(slow) * 0.6;
    // senso unico trascinato verso +x (anche il primo tile), poi verso -x su un'altra fila
    game.tool = 'oneway'; lastTile = null; paintedNow.clear();
    paintTo({ x: 20, y: c - 5 }); paintTo({ x: 26, y: c - 5 });
    r.dragDir = [20, 21, 25, 26].every(x => game.map[c - 5][x].path === 'oneway' && game.map[c - 5][x].dir === 1);
    lastTile = null; paintedNow.clear();
    paintTo({ x: 26, y: c - 7 }); paintTo({ x: 20, y: c - 7 });
    r.dragBack = [20, 23, 26].every(x => game.map[c - 7][x].dir === 3);
    game.tool = 'hand';
    r.onewayRoute = !!findRoute([[20, c - 5]], [[26, c - 5]]) && !findRoute([[26, c - 5]], [[20, c - 5]]);
    // ripassando al contrario la freccia si gira (gratis)
    const m0 = game.money; game.pathDir = 3;
    r.flip = useTool('oneway', 22, c - 5).ok && game.map[c - 5][22].dir === 3 && game.money === m0;
    // ponte sopra un fiume (acqua da x 40 a 44, righe c+6..c+40)
    for (let y = c + 3; y < c + 40; y++) for (let x = 40; x <= 44; x++) Object.assign(game.map[y][x], { type: T.WATER, elev: 0 });
    for (let y = c + 1; y <= c + 10; y++) useTool('road', 36, y);
    for (let x = 37; x <= 39; x++) useTool('road', x, c + 10);
    const pl = planBridge({ x: 39, y: c + 10 }, { x: 45, y: c + 10 });
    r.plan = pl.ok && pl.n === 6 && pl.e.every(e => e === 2);
    r.bridge = buildBridge(pl).ok && game.bridges.size === 1 && !!game.map[c + 10][42].bridge;
    useTool('road', 46, c + 10); useTool('house', 46, c + 11);
    const house = [...game.buildings.values()].find(b => b.kind === 'house');
    const route = findRoute(entryTiles(), accessTiles(house));
    r.overRiver = !!route && route.some(([x, y, L]) => x === 42 && L === 1);
    for (let i = 0; i < 600 && !house.residents; i++) simUpdate(0.1);
    r.arrived = house.residents > 0;
    // cavalcavia sopra una strada: sale di 2 livelli, sotto le auto passano
    for (let x = 60; x <= 70; x++) useTool('road', x, c + 20);
    for (const y of [c + 17, c + 23]) useTool('road', 65, y);
    r.tooShort = !planBridge({ x: 65, y: c + 19 }, { x: 65, y: c + 21 }).ok;
    const over = planBridge({ x: 65, y: c + 17 }, { x: 65, y: c + 23 });
    r.overPlan = over.ok && over.e.join() === '2,3,4,4,3,2';
    buildBridge(over);
    const under = findRoute([[60, c + 20]], [[70, c + 20]]);
    const across = findRoute([[65, c + 17]], [[65, c + 23]]);
    r.overpass = !!under && under.every(([, , L]) => !L) && !!across && across.some(([x, y, L]) => y === c + 20 && L === 1)
      && !findRoute([[65, c + 17]], [[60, c + 20]]);   // dal ponte non si scende sulla strada sotto
    r.noBuildUnder = !useTool('house', 65, c + 19).ok && !useTool('raise', 65, c + 19).ok;
    // salva e ricarica: ponti, sensi unici e autostrade restano
    saveGame();
    const sid = game.saveId;
    loadGame(sid);
    r.saved = game.bridges.size === 2 && !!game.map[c + 20][65].bridge && game.map[c - 5][21].dir === 1 && game.map[c - 7][21].dir === 3
      && game.map[c][35].path === 'highway' && !!findRoute([[65, c + 17]], [[65, c + 23]]);
    deleteSave(sid);
    // demolire un pezzo del ponte lo toglie tutto; demolire la testa pure
    useTool('demolish', 65, c + 19);
    r.demolish = game.bridges.size === 1 && !game.map[c + 20][65].bridge;
    useTool('demolish', 39, c + 10);
    r.headGone = game.bridges.size === 0;
    return r;
  });
  check(rd.upgrade && rd.mainNoOneway, 'strada principale trasformata in autostrada (ma non in senso unico)');
  check(rd.faster, 'in autostrada le auto vanno più veloci');
  check(rd.dragDir && rd.dragBack, 'senso unico nella direzione in cui si trascina');
  check(rd.onewayRoute && rd.flip, 'senso unico: si va solo nel verso della freccia; ripassando si gira');
  check(rd.plan && rd.bridge && rd.overRiver, 'ponte sopra il fiume, le auto ci passano sopra');
  check(rd.arrived, 'abitanti arrivati passando sul ponte');
  check(rd.tooShort && rd.overPlan && rd.overpass, 'cavalcavia: sale sopra la strada, sotto si passa, niente incrocio');
  check(rd.noBuildUnder, 'sotto il ponte niente edifici e niente terreno modellato');
  check(rd.saved, 'salvataggio con ponti, sensi unici e autostrade');
  check(rd.demolish && rd.headGone, 'demolizione del ponte (anche togliendo la testa)');

  // 30. traslochi quando si demolisce una casa, ponti della strada principale, tunnel
  const mv = await page.evaluate(() => {
    clearVehicles(); newGame(1, 128);
    const N = game.size, c = N / 2, r = {};
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, rb: null, bridge: null, elev: 2 });
    recount(); resetBridges(); game.money = 1e7;
    for (let x = 0; x < N; x++) { useTool('road', x, c); game.map[c][x].main = true; }
    game.entries = [{ x: 0, y: c }, { x: N - 1, y: c }];
    useTool('house', 20, c - 1); useTool('house', 40, c - 1);
    const [h1, h2] = [...game.buildings.values()];
    h1.residents = 3; recount();
    const pop0 = game.population;
    // chi abita nella casa demolita prende l'auto e va nell'altra casa
    useTool('demolish', 20, c - 1);
    r.carOut = vehicles.some(v => v.target === h2.id && v.people === 3) && h2.incoming === 3;
    for (let i = 0; i < 400 && h2.residents < 3; i++) simUpdate(0.1);
    r.moved = h2.residents === 3 && game.population === pop0;
    // un'auto diretta a una casa demolita non sparisce: se non c'è posto esce dalla mappa
    clearVehicles(); h2.residents = 4; h2.incoming = 0;
    useTool('house', 60, c - 1);
    const h3 = [...game.buildings.values()].find(b => b.ax === 60);
    const route = findRoute(entryTiles(), accessTiles(h3));
    h3.incoming = 2;
    spawnVehicle({ kind: 'car', target: h3.id, people: 2, tiles: route, pts: routePoints(route, true), ptOff: 1, speed: CAR_SPEED, color: '#d94141', arrive() {}, cancel() {} });
    for (let i = 0; i < 20; i++) simUpdate(0.1);
    const car = vehicles[0];
    useTool('demolish', 60, c - 1);
    r.redirected = vehicles.includes(car) && car.target === null;
    for (let i = 0; i < 600 && vehicles.includes(car); i++) simUpdate(0.1);
    const last = car.pts[car.pts.length - 1];
    r.leftMap = !vehicles.includes(car) && (last[0] < 0 || last[0] > N);
    // furgone diretto a un edificio demolito: torna indietro con la merce
    clearVehicles();
    game.rotation = 2;
    useTool('warehouse', 80, c + 1); useTool('supermarket', 90, c + 1);
    for (let x = 78; x <= 92; x++) useTool('house', x, c - 1);
    updateJobs();
    const wh = [...game.buildings.values()].find(b => b.kind === 'warehouse'), sm = [...game.buildings.values()].find(b => b.kind === 'supermarket');
    wh.store = { cheese: 30 };
    sendGoods(wh, sm, 'cheese', 20);
    for (let i = 0; i < 10; i++) simUpdate(0.1);
    const van = vehicles.find(v => v.kind === 'van' && v.from === wh.id && v.to === sm.id);   // wh.van = quanti furgoni in giro
    useTool('demolish', 90, c + 1);
    r.vanBack = vehicles.includes(van) && van.to === null;
    for (let i = 0; i < 600 && wh.van; i++) simUpdate(0.1);
    r.goodsBack = !wh.van && (wh.store.cheese || 0) >= 30;
    // tunnel: collina alta da x 100 a 106, entrata a x 99
    for (let y = c + 5; y < c + 15; y++) for (let x = 100; x <= 106; x++) game.map[y][x].elev = x === 100 || x === 106 ? 4 : 6;
    for (let y = c + 1; y <= c + 9; y++) useTool('road', 98, y);
    useTool('road', 99, c + 9);
    const tp = planTunnel({ x: 99, y: c + 9 }, 1);
    r.tunnelPlan = tp.ok && tp.n === 8 && tp.tiles[8].x === 107;
    r.tunnel = buildBridge(tp).ok;
    useTool('road', 108, c + 9); useTool('house', 108, c + 10);
    const th = [...game.buildings.values()].find(b => b.kind === 'house' && b.ax === 108);
    const tr = findRoute(entryTiles(), accessTiles(th));
    r.throughTunnel = !!tr && tr.some(([x, , L]) => x === 103 && L === 1);
    r.onTop = useTool('road', 103, c + 9).ok && !useTool('lower', 102, c + 9).ok;
    r.noHill = !planTunnel({ x: 50, y: c + 20 }, 1).ok;
    saveGame(); const sid = game.saveId; loadGame(sid); deleteSave(sid);
    r.tunnelSaved = [...game.bridges.values()].some(b => b.kind === 'tunnel');
    useTool('demolish', 99, c + 9);
    r.tunnelGone = ![...game.bridges.values()].some(b => b.kind === 'tunnel');
    // casa sotto un ponte alto: ci sta
    useTool('road', 30, c + 19); useTool('road', 30, c + 29);
    r.houseFirst = useTool('house', 30, c + 24).ok;
    const hb = planBridge({ x: 30, y: c + 19 }, { x: 30, y: c + 29 });
    r.houseUnder = r.houseFirst && hb.ok && buildBridge(hb).ok && !useTool('warehouse', 30, c + 22).ok && !useTool('house', 30, c + 21).ok;   // dove il ponte è basso no
    return r;
  });
  check(mv.carOut && mv.moved, 'casa demolita: gli abitanti vanno in auto in un\'altra casa');
  check(mv.redirected && mv.leftMap, 'auto diretta a una casa demolita: non sparisce, esce dalla mappa');
  check(mv.vanBack && mv.goodsBack, 'furgone verso un edificio demolito: torna indietro con la merce');
  check(mv.tunnelPlan && mv.tunnel && mv.throughTunnel, 'tunnel dritto sotto la collina, le auto ci passano');
  check(mv.onTop && mv.noHill, 'strade sopra il tunnel sì, terreno modellato no; senza collina niente tunnel');
  check(mv.tunnelSaved && mv.tunnelGone, 'tunnel salvato e demolito togliendo la testa');
  check(mv.houseUnder, 'case basse sotto un ponte alto (edifici grandi no)');
  // strada principale: sull'acqua ponti con i pilastri invece della sabbia
  const mr2 = await page.evaluate(() => {
    let bridges = 0, wet = 0, ok = 0, maps = 0;
    for (let s = 1; s <= 40; s++) {
      clearVehicles(); newGame(s, 128); maps++;
      for (const b of game.bridges.values()) if (b.main) {
        bridges++;
        for (let i = 1; i < b.n; i++) { const [x, y] = bridgeTile(b, i); if (game.map[y][x].type === T.WATER) wet++; }
      }
      const [a, b] = game.entries;
      if (a && b && findRoute([[a.x, a.y]], [[b.x, b.y]])) ok++;
    }
    return { bridges, wet, ok, maps };
  });
  check(mr2.bridges > 0 && mr2.wet > 0, `strada principale: ${mr2.bridges} ponti sull'acqua in 40 mappe`);
  check(mr2.ok === mr2.maps, `strada principale percorribile da un bordo all'altro: ${mr2.ok}/${mr2.maps}`);

  // 31. settore del legno, descrizioni, ruspa precisa
  const wd = await page.evaluate(() => {
    clearVehicles(); newGame(1, 128);
    const N = game.size, c = N / 2, r = {};
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, rb: null, bridge: null, elev: 2 });
    recount(); resetBridges(); game.money = 1e7;
    for (let x = 0; x < N; x++) { useTool('road', x, c); game.map[c][x].main = true; }
    game.entries = [{ x: 0, y: c }, { x: N - 1, y: c }];
    // bosco dietro l'azienda forestale
    for (let y = c + 4; y < c + 9; y++) for (let x = 8; x < 16; x++) game.map[y][x].type = T.FOREST;
    game.rotation = 2;
    const B = {};
    for (const [k, x] of [['forestry', 10], ['sawmill', 20], ['furnitureFactory', 30], ['furnitureStore', 40], ['forestry', 60]]) {
      useTool(k, x, c + 1); B[k + x] = [...game.buildings.values()].find(b => b.ax === x);
    }
    game.rotation = 0;
    for (let x = 6; x <= 64; x++) useTool('house', x, c - 1);
    for (const h of game.buildings.values()) if (h.kind === 'house') h.residents = 4;
    recount(); updateJobs();
    const fo = B.forestry10, sw = B.sawmill20, ff = B.furnitureFactory30, fs = B.furnitureStore40, bare = B.forestry60;
    fo.dests = [sw.id]; sw.dests = [ff.id]; ff.dests = [fs.id];
    const seen = {};
    for (let i = 0; i < 4000; i++) {
      simUpdate(0.1);
      for (const b of [sw, ff, fs]) for (const g of Object.keys(b.store).concat(Object.keys(b.input || {}))) seen[g] = true;
    }
    r.seen = seen; r.sold = fs.sold; r.taxes = fs.taxes; r.trees = fo.trees;
    r.bare = bare.trees === 0 && buildingStatus(bare) === 'noInput' && !sumOf(bare.store);
    r.accepts = freeFor(fs, 'tables') > 0 && freeFor(fs, 'cheese') === 0 && freeFor(game.buildings.get([...game.buildings.values()].find(b => b.kind === 'supermarket')?.id) || { kind: 'supermarket', store: {} }, 'planks') === 0;
    // ruspa: trascinando dalla casa verso la strada si tolgono solo case
    game.tool = 'demolish'; lastTile = null;
    paintTo({ x: 6, y: c - 1 }); paintTo({ x: 9, y: c - 1 }); paintTo({ x: 9, y: c });
    r.dragKind = !buildingAt(7, c - 1) && !buildingAt(9, c - 1) && roadAt(9, c) && roadAt(8, c);
    // strade: una passata che non parte da una strada non trasforma quelle che incrocia
    game.tool = 'highway'; lastTile = null; game.convertRoads = false;
    paintTo({ x: 70, y: c - 3 }); paintTo({ x: 70, y: c + 3 });
    r.noConvert = game.map[c][70].path === 'road' && game.map[c - 3][70].path === 'highway';
    game.convertRoads = undefined; game.tool = 'hand';
    // casa sotto un ponte: cliccando sotto si toglie la casa, il ponte resta
    useTool('road', 90, c + 3); useTool('road', 90, c + 13); useTool('house', 90, c + 8);
    buildBridge(planBridge({ x: 90, y: c + 3 }, { x: 90, y: c + 13 }));
    game.pickDeck = false; useTool('demolish', 90, c + 8); game.pickDeck = undefined;
    r.underBridge = !buildingAt(90, c + 8) && !!game.map[c + 8][90].bridge;
    return r;
  });
  check(['logs', 'planks', 'beams', 'panels'].every(g => wd.seen[g]) && ['tables', 'chairs', 'wardrobes', 'beds', 'kitchens'].some(g => wd.seen[g]),
    'filiera del legno: tronchi -> assi/travature/pannelli -> mobili: ' + Object.keys(wd.seen).join(', '));
  check(wd.sold > 0 && wd.taxes > 0, `mercato dell'arredamento: venduti ${wd.sold}, tasse ${wd.taxes} €`);
  check(wd.trees > 0 && wd.bare, 'azienda forestale: lavora solo con il bosco vicino');
  check(wd.accepts, 'ogni negozio prende solo le sue merci');
  check(wd.dragKind, 'ruspa: trascinando toglie solo il tipo di cosa del primo clic');
  check(wd.noConvert, 'una strada trascinata non trasforma quelle che incrocia');
  check(wd.underBridge, 'casa sotto il ponte demolita senza togliere il ponte');
  await page.keyboard.press('5');
  const desc1 = await page.textContent('#subdesc');
  await page.hover('#submenu .sub[data-tool="sawmill"]');
  const desc2 = await page.textContent('#subdesc');
  await page.keyboard.press('Escape');
  check(/Azienda forestale/.test(desc1) && /tronchi/.test(desc1) && /Segheria/.test(desc2) && /assi di legno/.test(desc2), 'descrizione dello strumento nel menu (con la catena di montaggio)');

  // 32. ruspa precisa al pixel: si toglie quello che si vede dietro un edificio, senza toccarlo
  const px = await page.evaluate(() => {
    clearVehicles(); newGame(1, 128);
    const N = game.size, c = N / 2, r = {};
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, rb: null, bridge: null, elev: 2 });
    recount(); resetBridges(); game.money = 1e7; game.started = true;
    for (let x = c - 3; x <= c + 3; x++) useTool('road', x, c - 1);   // strada dietro
    useTool('house', c, c);                                             // casa davanti
    game.rotation = 2; useTool('factory', c + 2, c + 1); game.rotation = 0;   // edificio alto davanti
    game.tool = 'demolish';
    const z = zoomLevel();
    cam.x = view.w / 2; cam.y = view.h / 2 - (2 * c * TH / 2) * z; requestDraw(); drawFrame();
    const exact = pickTileExact;
    let found = null;
    for (let my = 0; my < view.h && !found; my += 2) for (let mx = 0; mx < view.w && !found; mx += 2) {
      const now = pickTile(mx, my);
      if (!now || now.y !== c - 1 || !roadAt(now.x, now.y)) continue;
      pickTileExact = () => null; const before = pickTile(mx, my); pickTileExact = exact;
      if (before && game.map[before.y][before.x].building) found = { mx, my, t: now };
    }
    r.found = !!found;
    if (found) {
      lastTile = null; paintTo(pickTile(found.mx, found.my));
      r.roadGone = !roadAt(found.t.x, found.t.y) && game.houses === 1 && game.industries === 1;
    }
    // e cliccando sulla casa si toglie la casa
    const [hx, hy] = iso(c, c, 0.5, 0.5, 2 + 1.2);
    const hp = pickTile(Math.round(hx * z + cam.x), Math.round(hy * z + cam.y));
    r.houseHit = !!hp && game.map[hp.y][hp.x].building && game.map[hp.y][hp.x].building.kind === 'house';
    game.tool = 'hand';
    return r;
  });
  check(px.found && px.roadGone, 'ruspa: si demolisce la strada che si vede dietro un edificio, l\'edificio resta');
  check(px.houseHit, 'ruspa: cliccando sulla casa si prende la casa');

  // 33. settore tessile, due magazzini, nomi degli edifici
  const tx = await page.evaluate(() => {
    clearVehicles(); newGame(1, 128);
    const N = game.size, c = N / 2, r = {};
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, rb: null, bridge: null, elev: 2 });
    recount(); resetBridges(); game.money = 1e7; game.started = true;
    for (let x = 0; x < N; x++) { useTool('road', x, c); game.map[c][x].main = true; }
    game.entries = [{ x: 0, y: c }, { x: N - 1, y: c }];
    game.rotation = 2;
    const B = {};
    for (const [k, x] of [['farm', 8], ['sheepFarm', 14], ['textileMill', 20], ['clothingFactory', 26], ['clothingStore', 32], ['warehouse', 40], ['goodsWarehouse', 46]]) {
      useTool(LIVESTOCK[k] ? 'livestock' : k, x, c + 1); if (k === 'farm') exitFieldMode(); B[k] = [...game.buildings.values()].find(b => b.ax === x);
      if (LIVESTOCK[k]) setAnimal(B[k], k);
    }
    game.rotation = 0;
    for (let x = 6; x <= 50; x++) useTool('house', x, c - 1);
    for (const h of game.buildings.values()) if (h.kind === 'house') h.residents = 4;
    recount(); updateJobs();
    const { farm, sheepFarm, textileMill, clothingFactory, clothingStore, warehouse, goodsWarehouse } = B;
    r.split = freeFor(warehouse, 'cheese') > 0 && freeFor(warehouse, 'cotton') === 0 && freeFor(warehouse, 'planks') === 0
      && freeFor(goodsWarehouse, 'cotton') > 0 && freeFor(goodsWarehouse, 'wool') > 0 && freeFor(goodsWarehouse, 'cheese') === 0;
    farm.crop = 'cotton'; farm.store = { cotton: 60 }; farm.dests = [textileMill.id];
    sheepFarm.dests = [textileMill.id]; textileMill.dests = [clothingFactory.id]; clothingFactory.dests = [clothingStore.id];
    const seen = {};
    for (let i = 0; i < 5000; i++) {
      if (i % 100 === 0) addTo(farm.store, 'cotton', 10);
      simUpdate(0.1);
      for (const b of [textileMill, clothingFactory, clothingStore]) for (const g of Object.keys(b.store).concat(Object.keys(b.input || {}))) seen[g] = true;
    }
    r.seen = Object.keys(seen).join(', '); r.sold = clothingStore.sold;
    r.wool = !!seen.wool && !!seen.cloth;
    // nome scelto dal giocatore: nei pulsanti delle destinazioni e nel salvataggio
    goodsWarehouse.name = 'Deposito Nord';
    saveGame(); const sid = game.saveId; loadGame(sid); deleteSave(sid);
    const gw = [...game.buildings.values()].find(b => b.kind === 'goodsWarehouse');
    r.nameSaved = gw.name === 'Deposito Nord';
    return r;
  });
  check(tx.split, 'magazzino alimenti solo cibo, magazzino merci solo merci');
  check(/yarn/.test(tx.seen) && /fabric/.test(tx.seen) && /cloth/.test(tx.seen) && /(shirts|trousers|jackets|shoes|coats)/.test(tx.seen), 'filiera tessile: ' + tx.seen);
  check(tx.wool, 'la lana serve per le stoffe lavorate');
  check(tx.sold > 0, `negozio di abbigliamento: venduti ${tx.sold}`);
  check(tx.nameSaved, 'nome dell\'edificio salvato');
  // cambiare nome dal pannello (con la tastiera, senza far partire i tasti del gioco)
  await page.evaluate(() => openBuildingPanel([...game.buildings.values()].find(b => b.kind === 'textileMill')));
  await page.click('#panel .prename');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Filanda 1');
  await page.keyboard.press('Enter');
  const rn = await page.evaluate(() => ({ name: [...game.buildings.values()].find(b => b.kind === 'textileMill').name,
    title: document.querySelector('#panel .pname').textContent, tool: game.tool }));
  check(rn.name === 'Filanda 1' && rn.title === 'Filanda 1' && rn.tool === 'hand', 'cambio nome dal pannello: ' + JSON.stringify(rn));
  await page.evaluate(() => closePanel());
  const bar = await page.evaluate(() => [...document.querySelectorAll('#toolbar .lbl')].map(e => e.textContent).join(','));
  check(bar === 'Mano,Strade,Case,Agroalimentare,Legno,Tessile,Energia,Demolisci', 'barra: ' + bar);

  // 34. allevamento unico: scelta dell'animale dal pannello, vecchi salvataggi convertiti
  const lvs = await page.evaluate(() => {
    clearVehicles(); newGame(1, 128);
    const N = game.size, c = N / 2, r = {};
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, rb: null, bridge: null, elev: 2 });
    recount(); resetBridges(); game.money = 1e7; game.started = true;
    useTool('livestock', 20, 20);
    const b = game.map[20][20].building;
    r.default = b.kind === 'livestock' && b.animal === 'cowFarm';
    r.pigs = setAnimal(b, 'pigFarm') && b.animal === 'pigFarm';
    // salvataggio "vecchio" con un allevamento di polli separato
    saveGame(); const sid = game.saveId;
    const list = JSON.parse(localStorage.getItem('citybuilder.saves.v1'));
    const e = list.find(x => x.id === sid);
    e.data.buildings[0].kind = 'chickenFarm'; delete e.data.buildings[0].animal;
    localStorage.setItem('citybuilder.saves.v1', JSON.stringify(list));
    loadGame(sid); deleteSave(sid);
    const b2 = game.map[20][20].building;
    r.migrated = b2 && b2.kind === 'livestock' && b2.animal === 'chickenFarm';
    openBuildingPanel(b2);
    return r;
  });
  await page.click('#panel .pchoice:has-text("Pecore")');
  const lvs2 = await page.evaluate(() => { const b = game.map[20][20].building; closePanel(); return b.animal; });
  check(lvs.default && lvs.pigs, 'allevamento unico: mucche all\'inizio, poi si cambia animale');
  check(lvs.migrated, 'vecchi salvataggi: allevamento di polli convertito');
  check(lvs2 === 'sheepFarm', 'scelta dell\'animale dal pannello: ' + lvs2);

  // 40. progressi: mappa nuova con poco sbloccato, si paga per il resto
  const pg = await page.evaluate(() => {
    clearVehicles(); __newGame(1, 128); game.started = true; refreshLocks();
    const N = game.size, c = N / 2, r = {};
    for (let y = c - 10; y < c + 10; y++) for (let x = c - 10; x < c + 10; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, rb: null, elev: 2 });
    recount();
    r.start = !toolLocked('road') && !toolLocked('house') && !toolLocked('farm') && !toolLocked('warehouse') && !toolLocked('supermarket') && !toolLocked('demolish');
    r.locked = toolLocked('factory') && toolLocked('highway') && toolLocked('textileMill') && cropLocked('cotton') && cropLocked('corn') && !cropLocked('wheat');
    r.noBuild = !useTool('factory', c, c).ok && !useTool('highway', c - 5, c - 5).ok;
    r.lockIcon = document.getElementById('group-wood').classList.contains('locked') && !document.getElementById('group-homes').classList.contains('locked');
    r.needs = !buyUnlock('bakery').ok;                               // prima la fabbrica alimentare
    game.money = 3000; r.poor = !buyUnlock('factory').ok && game.money === 3000;
    game.money = 50000; r.buy = buyUnlock('factory').ok && game.money === 50000 - UNLOCK_BY_ID.factory.cost && !toolLocked('factory');
    r.build = useTool('factory', c, c).ok;
    r.bakery = buyUnlock('bakery').ok && !toolLocked('bakery');
    r.shared = buyUnlock('forestry').ok && !toolLocked('goodsWarehouse') && toolLocked('textileMill');   // il magazzino merci viene con il legno
    r.cotton = buyUnlock('textileMill').ok && !cropLocked('cotton');
    game.saveId = null; saveGame(); const id = game.saveId;
    const before = [...game.unlocked].sort().join(',');
    loadGame(id);
    r.saved = [...game.unlocked].sort().join(',') === before && toolLocked('highway');
    // un salvataggio di prima (senza "unlocked") ha tutto sbloccato
    const list = readSaves(), e = list.find(x => x.id === id);
    delete e.data.unlocked; writeSaves(list);
    loadGame(id);
    r.old = !toolLocked('highway') && !toolLocked('clothingStore') && !cropLocked('cotton');
    deleteSave(id);
    __newGame(2, 128); refreshLocks();
    r.reset = toolLocked('factory') && game.unlocked.size === 0;
    return r;
  });
  check(pg.start && pg.locked, 'progressi: mappa nuova con strade, case, fattoria, magazzino e supermercato; il resto bloccato');
  check(pg.noBuild && pg.lockIcon, 'strumenti bloccati: non si costruiscono e hanno il lucchetto nella barra');
  check(pg.needs && pg.poor, 'sblocco rifiutato senza il requisito o senza soldi');
  check(pg.buy && pg.build && pg.bakery, 'sblocco pagato: la fabbrica si costruisce, poi il panificio');
  check(pg.shared && pg.cotton, 'magazzino merci con il legno; cotone con la fabbrica tessile');
  check(pg.saved && pg.old && pg.reset, 'progressi salvati; vecchi salvataggi tutto sbloccato; mappa nuova da capo');

  // 41. finestre: P progressi, M manuale (tutti i capitoli), Esc chiude
  await page.evaluate(() => { game.money = 50000; closePanel && panelIsOpen() && closePanel(); });
  await page.keyboard.press('p');
  const w1 = await page.evaluate(() => ({ open: !document.getElementById('progress').hidden, cards: document.querySelectorAll('#progress .pg-card').length === UNLOCKS.length }));
  await page.click('#unlock-oneway');
  const w2 = await page.evaluate(() => !toolLocked('oneway') && document.querySelector('#progress [data-unlock="oneway"]').classList.contains('owned'));
  await page.keyboard.press('Escape');
  const w3 = await page.evaluate(() => document.getElementById('progress').hidden && document.getElementById('menu').hidden);
  await page.keyboard.press('m');
  const pages = await page.evaluate(() => MANUAL.map(m => m.id));
  let manOk = await page.evaluate(() => !document.getElementById('manual').hidden);
  for (const id of pages) {
    await page.click('#manual-nav button[data-page="' + id + '"]');
    manOk = manOk && await page.evaluate(() => document.getElementById('manual-body').children.length > 1);
  }
  await page.keyboard.press('m');
  const w4 = await page.evaluate(() => document.getElementById('manual').hidden);
  // strumento bloccato nella barra: il clic apre i progressi su quello sblocco
  await page.keyboard.press('5');
  await page.click('#submenu .sub[data-tool="sawmill"]');
  const w5 = await page.evaluate(() => !document.getElementById('progress').hidden && !!document.querySelector('#progress .pg-card.focus[data-unlock="sawmill"]') && game.tool !== 'sawmill');
  await page.keyboard.press('Escape');
  check(w1.open && w1.cards && w2 && w3, 'tasto P: finestra progressi, sblocco con il clic, Esc chiude');
  check(manOk && w4 && pages.length >= 10, 'tasto M: manuale con ' + pages.length + ' capitoli, M chiude');
  check(w5, 'clic su uno strumento bloccato: si apre lo sblocco giusto');

  // 42. tutte le merci con prezzo si vendono (catena completa, poi tutto via magazzini)
  for (const mode of ['shop', 'warehouse']) {
    const ec = await page.evaluate((mode) => {
      clearVehicles(); newGame(1, 128);
      const N = game.size, c = N / 2;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, rb: null, elev: 2 });
      recount(); game.money = 1e7;
      for (let x = 0; x < N; x++) { useTool('road', x, c); game.map[c][x].main = true; useTool('road', x, c - 3); }
      game.entries = [{ x: 0, y: c }, { x: N - 1, y: c }];
      oilAt = () => 1;   // petrolio ovunque per la prova
      const list = [...Object.keys(CROPS).map(k => ['farm', k]), ...Object.keys(LIVESTOCK).map(k => ['livestock', k]),
        ['oilWell'], ['charcoalKiln'], ['coalPlant'], ['refinery'], ['gasStation'],
        ['forestry'], ['factory'], ['bakery'], ['dairy'], ['slaughterhouse'], ['supermarket'], ['furnitureStore'], ['clothingStore'],
        ['warehouse'], ['goodsWarehouse'], ['sawmill'], ['furnitureFactory'], ['textileMill'], ['clothingFactory']];
      game.rotation = 2;
      let x = c - 40;
      for (const [k, a] of list) {
        useTool(k, x, c + 1);
        if (k === 'farm') exitFieldMode();
        const b = game.map[c + 1][x].building;
        if (k === 'farm') b.crop = a;
        if (k === 'livestock') setAnimal(b, a);
        if (k === 'forestry') for (let xx = x - 3; xx <= x + 5; xx++) game.map[c + 3][xx].type = T.FOREST;
        x += BUILDINGS[k].w + 1;
      }
      game.rotation = 0;
      for (let hx = c - 44; hx <= x + 4; hx++) { useTool('house', hx, c - 1); useTool('house', hx, c - 2); }
      for (const h of game.buildings.values()) if (h.kind === 'house') h.residents = HOUSE_CAPACITY;
      recount();
      const all = [...game.buildings.values()].filter(b => b.kind !== 'house');
      const rank = b => mode === 'shop' ? (SHOPS[b.kind] ? 0 : isProcessor(b) ? 1 : 2) : (isProcessor(b) ? 0 : SHOPS[b.kind] ? 1 : 2);
      for (const b of all) {
        let d = all.filter(o => o !== b && destKindsOf(b).includes(o.kind));
        if (mode === 'warehouse' && !isWarehouse(b)) d = d.filter(isWarehouse);
        if (isWarehouse(b)) d = d.filter(o => !isWarehouse(o));
        b.dests = d.sort((p, q) => rank(p) - rank(q)).map(o => o.id);
      }
      const shops = all.filter(b => SHOPS[b.kind]), sold = {}, prev = new Map(shops.map(s => [s.id, { ...s.store }]));
      for (let i = 0; i < 2000 * 10; i++) {
        for (const b of all) if (b.kind === 'farm' && sumOf(b.store) < 30) addTo(b.store, b.crop, 20);
        simUpdate(0.1);
        for (const s of shops) {
          for (const [g, q] of Object.entries(prev.get(s.id))) if (q > (s.store[g] || 0)) sold[g] = true;
          prev.set(s.id, { ...s.store });
        }
      }
      return Object.keys(GOODS).filter(g => GOODS[g].price && !sold[g]);
    }, mode);
    // con i negozi per primi le merci lavorate non si fanno (va bene); via magazzini le materie prime
    // con prezzo vanno prima alle fabbriche: si controllano i due insiemi insieme
    if (mode === 'shop') var unsoldShop = ec; else {
      const never = ec.filter(g => unsoldShop.includes(g));
      check(never.length === 0, 'ogni merce con prezzo si vende' + (never.length ? ': mai vendute ' + never.join(', ') : '') + ' (anche passando dai magazzini: invendute ' + (ec.join(', ') || 'nessuna') + ')');
      check(['pasta', 'cheese', 'ham', 'beds', 'kitchens', 'coats'].every(g => !ec.includes(g)), 'via magazzini arrivano ai negozi anche pasta, formaggi, carne, letti, cucine, cappotti');
    }
  }

  // 43. la strada principale di una mappa nuova è un'autostrada (auto più veloci) e resta tale
  const hw = await page.evaluate(() => {
    clearVehicles(); __newGame(7, 128); unlockAll();
    let main = 0, hwy = 0;
    for (const row of game.map) for (const t of row) if (t.main && t.path) { main++; if (t.path === 'highway') hwy++; }
    const e = game.entries[0], t = game.map[e.y][e.x];
    game.convertRoads = true;
    const keep = !!checkTool('road', e.x, e.y) && t.path === 'highway';
    return { main, hwy, keep };
  });
  check(hw.main > 50 && hw.hwy === hw.main && hw.keep, `strada principale = autostrada (${hw.hwy}/${hw.main} tile), non si declassa`);

  // 44. ponti autostrada: quelli della strada principale e quelli costruiti con lo strumento
  const hb = await page.evaluate(() => {
    const r = {};
    let found = null;
    for (let seed = 1; seed < 80 && !found; seed++) {
      clearVehicles(); __newGame(seed, 128); unlockAll();
      found = [...game.bridges.values()].find(b => b.main && b.kind === 'bridge');
    }
    r.found = !!found;
    if (found) {
      const heads = [0, found.n].map(i => game.map[bridgeTile(found, i)[1]][bridgeTile(found, i)[0]].path);
      r.main = found.path === 'highway' && heads.every(p => p === 'highway');
      const tiles = []; for (let i = 0; i <= found.n; i++) { const [x, y] = bridgeTile(found, i); tiles.push([x, y, i > 0 && i < found.n ? 1 : 0]); }
      r.speed = routePoints(tiles).filter(p => p[4] === 1).every(p => p[3] === PATHS.highway.speed);
    }
    clearVehicles(); newGame(3, 128);
    const N = game.size, c = N / 2;
    for (let y = c - 8; y < c + 8; y++) for (let x = c - 8; x < c + 8; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, building: null, elev: 2, bridge: null });
    for (let x = c - 3; x <= c + 3; x++) Object.assign(game.map[c][x], { type: T.WATER, elev: 0 });
    const plan = planBridge({ x: c - 4, y: c }, { x: c + 4, y: c }, 'highway');
    const roadCost = planBridge({ x: c - 4, y: c }, { x: c + 4, y: c }, 'road').cost;
    const m0 = game.money;
    r.built = plan.ok && buildBridge(plan).ok && m0 - game.money === plan.cost && plan.cost > roadCost;
    const b = bridgeAt(c, c);
    r.hw = b && b.path === 'highway' && game.map[c][c - 4].path === 'highway';
    game.saveId = null; saveGame(); const id = game.saveId; loadGame(id); deleteSave(id);
    r.saved = bridgeAt(c, c) && bridgeAt(c, c).path === 'highway';
    r.tool = !toolLocked('hwBridge') && TOOL_GROUPS[1].tools.includes('hwBridge');
    return r;
  });
  check(hb.found && hb.main && hb.speed, 'il ponte della strada principale è un ponte autostrada (teste autostrada, auto veloci)');
  check(hb.built && hb.hw && hb.saved && hb.tool, 'strumento Ponte autostrada: costa di più, si salva '+ '');

  // 45. energia e petrolio: carbonaia -> centrale a carbone, solare, eolica, bollette;
  //     pozzo e piattaforma -> nave -> porto -> raffineria -> distributore
  const en = await page.evaluate(() => {
    clearVehicles(); newGame(5, 128);
    const N = game.size, c = N / 2, r = {};
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, rb: null, elev: 2, bridge: null });
    game.bridges = new Map(); rebuildBridgeIndex(); recount(); game.money = 1e7;
    // senza petrolio non si costruisce il pozzo
    const realOil = window.__oilAt;
    oilAt = () => 0; r.noOil = !useTool('oilWell', 10, 10).ok;
    oilAt = () => 1;
    r.platformLand = !useTool('oilPlatform', 10, 20).ok;
    for (let y = c + 6; y < N; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.WATER, elev: 0 });
    for (let x = 0; x < N; x++) { useTool('road', x, c); game.map[c][x].main = true; }
    game.entries = [{ x: 0, y: c }, { x: N - 1, y: c }];
    game.rotation = 0; r.portWrong = !useTool('port', c + 10, c + 4).ok;   // davanti all'acqua, non dietro
    const place = [];
    game.rotation = 2;
    let x = c - 30;
    for (const k of ['forestry', 'charcoalKiln', 'coalPlant', 'solarPlant', 'windPlant', 'oilWell', 'refinery', 'gasStation']) {
      const ok = useTool(k, x, c + 1); place.push(k + ':' + ok.ok);
      if (k === 'forestry') for (let xx = x - 2; xx <= x + 3; xx++) for (const yy of [c + 3, c + 4]) game.map[yy][xx].type = T.FOREST;
      x += BUILDINGS[k].w + 1;
    }
    game.rotation = 0;
    r.port = useTool('port', c + 10, c + 4).ok === false;   // ancora sbagliato
    game.rotation = 2; r.port = useTool('port', c + 10, c + 4).ok;   // entrata verso la strada (c+3? no): retro verso l'acqua
    game.rotation = 0; r.platform = useTool('oilPlatform', c + 10, c + 12).ok;
    r.placed = place.every(p => p.endsWith('true')) ? 'ok' : place.join(',');
    game.rotation = 0;
    for (let hx = c - 34; hx <= c + 16; hx++) { useTool('house', hx, c - 1); useTool('house', hx, c - 2); }
    for (let hx = 0; hx < N; hx++) useTool('road', hx, c - 3);
    for (const h of game.buildings.values()) if (h.kind === 'house') h.residents = HOUSE_CAPACITY;
    recount();
    const B = k => [...game.buildings.values()].find(b => b.kind === k);
    const fo = B('forestry'), ki = B('charcoalKiln'), cp = B('coalPlant'), so = B('solarPlant'), wi = B('windPlant'), we = B('oilWell'),
      re = B('refinery'), gs = B('gasStation'), po = B('port'), pl = B('oilPlatform');
    r.ids = [fo, ki, cp, so, wi, we, re, gs, po, pl].map(b => b ? 1 : 0).join('');
    if (r.ids !== '1111111111') return r;
    fo.dests = [ki.id]; ki.dests = [cp.id]; we.dests = [re.id]; pl.dests = [po.id]; po.dests = [re.id]; re.dests = [gs.id];
    updateJobs = (orig => () => { orig(); for (const b of [po, re, gs, cp, ki, fo, we, so, wi]) b.workers = JOBS[b.kind]; })(updateJobs);
    const money0 = game.money;
    let coal = 0, power = 0, ship = false, portCrude = 0, gen = 0;
    const gsPrev = {}; const sold = {};
    for (let i = 0; i < 1500 * 10; i++) {
      simUpdate(0.1);
      coal = Math.max(coal, (ki.store.coal || 0) + ((cp.input || {}).coal || 0));
      power = Math.max(power, cp.power || 0);
      ship = ship || vehicles.some(v => v.kind === 'ship' && v.load > 0);
      portCrude = Math.max(portCrude, po.store.crude || 0);
      gen = Math.max(gen, (game.grid || {}).gen || 0);
      for (const [g, q] of Object.entries(gsPrev)) if (q > (gs.store[g] || 0)) sold[g] = true;
      Object.assign(gsPrev, gs.store); for (const g of Object.keys(gsPrev)) if (!gs.store[g]) gsPrev[g] = 0;
    }
    Object.assign(r, { coal, power, ship, portCrude, gen, sold: Object.keys(sold).sort().join(','), bills: game.grid.bills, solar: so.power, wind: wi.power });
    r.windHigh = (() => { const lvl = wi.power; game.map[wi.ay][wi.ax].elev += 4; updatePower(wi, 0.1); const hi = wi.power; game.map[wi.ay][wi.ax].elev -= 4; return hi > lvl; })();
    // porto demolito mentre la nave viaggia: la nave torna alla piattaforma, il petrolio non sparisce
    pl.store = { crude: 40 }; pl.van = 0; pl.retry = 0; po.store = {}; po.expect = {};
    for (let i = 0; i < 50 && !vehicles.some(v => v.kind === 'ship' && v.load > 0); i++) simUpdate(0.1);
    const sh = vehicles.find(v => v.kind === 'ship' && v.load > 0);
    r.dbg = ['noship', pl.status, pl.van];
    if (sh) {
      for (let i = 0; i < 10; i++) simUpdate(0.1);
      useTool('demolish', po.ax, po.ay);
      const back = vehicles.find(v => v.kind === 'ship');
      for (let i = 0; i < 600 && vehicles.some(v => v.kind === 'ship'); i++) simUpdate(0.1);
      r.dbg = [!!back, pl.store.crude, vehicles.filter(v => v.kind === 'ship').length, back && back.load];
      r.shipBack = !!back && (pl.store.crude || 0) >= 40 - 0.001 && !vehicles.some(v => v.kind === 'ship');
    }
    oilAt = realOil;
    let rich = 0, n = 0;
    for (let y = 0; y < 128; y += 2) for (let x = 0; x < 128; x += 2) { n++; if (oilAt(x, y) > 0) rich++; }
    r.oilShare = rich / n;
    return r;
  });
  check(en.noOil && en.platformLand && en.portWrong, 'pozzo solo sul petrolio, piattaforma solo sull\'acqua, porto con il retro sull\'acqua');
  check(en.placed === 'ok' && en.ids === '1111111111', 'edifici dell\'energia costruiti (' + en.placed + ', ' + en.ids + ')');
  check(en.coal > 0 && en.power > 0, `carbonaia fa carbone (${en.coal}), la centrale lo brucia (${en.power} di energia)`);
  check(en.solar > 0 && en.wind > 0 && en.windHigh, `solare ${en.solar}, eolica ${en.wind} (di più in alto)`);
  check(en.gen > 0 && en.bills > 0, `rete elettrica: produzione ${en.gen}, bollette ${en.bills} €`);
  check(en.ship && en.portCrude > 0, 'la nave porta il petrolio dalla piattaforma al porto');
  check(en.sold === 'diesel,gasoline', 'raffineria -> distributore: benzina e gasolio venduti (' + en.sold + ')');
  check(en.shipBack, 'porto demolito: la nave torna alla piattaforma con il petrolio '+ (en.shipBack ? '' : ' ' + JSON.stringify(en.dbg)));
  check(en.oilShare > 0.05 && en.oilShare < 0.6, 'giacimenti di petrolio: ' + Math.round(en.oilShare * 100) + '% della mappa');

  // 46. tasto I: sblocca tutto
  await page.evaluate(() => { closeMenu(); clearVehicles(); __newGame(9, 128); game.started = true; enterGame(); });
  const i0 = await page.evaluate(() => toolLocked('refinery'));
  await page.keyboard.press('i');
  const i1 = await page.evaluate(() => !toolLocked('refinery') && !cropLocked('cotton') && UNLOCKS.every(u => isUnlocked(u.id)));
  check(i0 && i1, 'tasto I: sblocca tutto');

  // 47. lingue: inglese e spagnolo dal menu Opzioni, tutto tradotto, la scelta resta
  await page.keyboard.press('Escape');
  await page.click('#m-options');
  await page.click('#lang-en');
  const lgEn = await page.evaluate(() => ({ menu: document.getElementById('m-back-opt') ? '' : document.querySelector('.menu-page[data-page="options"] h2').textContent,
    group: TOOL_GROUPS[1].label, good: GOODS.wheat.name, build: BUILDINGS.farm.name, tool: TOOL_INFO.house.desc, top: document.querySelector('#topbar span span').textContent,
    msg: checkTool('farm', -1, -1) === null ? '' : TR('Fondi insufficienti'), stored: localStorage.getItem(LANG_KEY) }));
  await page.click('#lang-es');
  const lgEs = await page.evaluate(() => ({ group: TOOL_GROUPS[1].label, good: GOODS.wheat.name, title: document.querySelector('.menu-page[data-page="options"] h2').textContent }));
  const cover = await page.evaluate(() => {
    const out = {};
    for (const l of ['en', 'es']) {
      setLanguage(l); missingText.clear();
      for (const ch of MANUAL) openManual(ch.id);
      closeManual(); openProgress(); closeProgress();
      for (const b of game.buildings.values()) { openBuildingPanel(b); renderPanel(); }
      closePanel();
      for (const g of TOOL_GROUPS) { openSubmenu(g); for (const t of g.tools) showToolDesc(t); }
      closeSubmenu();
      out[l] = [...missingText];
    }
    return out;
  });
  await page.reload();
  await page.waitForTimeout(300);
  const kept = await page.evaluate(() => LANG === 'es' && document.getElementById('m-new').textContent === 'Nuevo mapa');
  await page.evaluate(() => setLanguage('it'));
  const back = await page.evaluate(() => GOODS.wheat.name === 'Grano' && TOOL_GROUPS[1].label === 'Strade' && document.getElementById('m-new').textContent === 'Nuova mappa');
  check(lgEn.group === 'Roads' && lgEn.good === 'Wheat' && lgEn.build === 'Farm' && lgEn.tool.startsWith('Up to') && lgEn.top === 'Funds:' && lgEn.stored === 'en', 'lingua inglese: barra, merci, edifici, descrizioni');
  check(lgEs.group === 'Carreteras' && lgEs.good === 'Trigo' && lgEs.title === 'Opciones', 'lingua spagnola');
  check(!cover.en.length && !cover.es.length, 'nessuna frase senza traduzione' + (cover.en.length || cover.es.length ? ': ' + JSON.stringify(cover) : ''));
  check(kept && back, 'la lingua scelta resta dopo il riavvio; si torna all\'italiano');

  // 48. porti: tutte le merci, da porto a porto in nave portacontainer
  const pp = await page.evaluate(() => {
    clearVehicles(); newGame(11, 128); unlockAll(); game.started = true; closeMenu();   // (dopo il riavvio del test 47 il menu è aperto)
    const N = game.size, c = N / 2, r = {};
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, rb: null, elev: 2, bridge: null });
    game.bridges = new Map(); rebuildBridgeIndex(); recount(); game.money = 1e7;
    for (let y = c + 3; y <= c + 12; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.WATER, elev: 0 });   // canale
    for (let x = 0; x < N; x++) { useTool('road', x, c); game.map[c][x].main = true; useTool('road', x, c + 15); }
    game.entries = [{ x: 0, y: c }, { x: N - 1, y: c }];
    game.rotation = 2; const ra = useTool('port', c - 20, c + 1); r.a = ra.ok; r.am = ra.msg;    // retro verso il canale (sotto)
    game.rotation = 0; const rb = useTool('port', c + 20, c + 13); r.b = rb.ok; r.bm = rb.msg;   // dall'altra parte del canale
    game.rotation = 2; useTool('farm', c - 26, c + 1); exitFieldMode();
    for (let hx = c - 34; hx <= c + 30; hx++) { useTool('house', hx, c - 1); useTool('house', hx, c + 16); }
    for (const h of game.buildings.values()) if (h.kind === 'house') h.residents = HOUSE_CAPACITY;
    recount();
    const B = k => [...game.buildings.values()].filter(b => b.kind === k);
    const [pa, pb] = B('port').sort((x, y) => x.ax - y.ax), fa = B('farm')[0];
    r.ids = !!(pa && pb && fa);
    if (!r.ids) return r;
    r.accepts = freeFor(pa, 'wheat') > 0 && freeFor(pa, 'tables') > 0 && freeFor(pa, 'crude') > 0;
    r.destOpts = destChoices(pa).some(o => o.w === pb && o.ok && o.sea) && destChoices(fa).some(o => o.w === pa && o.ok);
    fa.crop = 'wheat'; fa.store = { wheat: 60 }; fa.dests = [pa.id]; pa.dests = [pb.id];
    let cargo = false, tanker = false, landed = 0;
    for (let i = 0; i < 400 * 10; i++) {
      simUpdate(0.1);
      for (const v of vehicles) if (v.kind === 'ship' && v.load > 0) { if (v.shipType === 'cargo') cargo = true; else tanker = true; }
      landed = Math.max(landed, pb.store.wheat || 0);
    }
    Object.assign(r, { cargo, tanker, landed });
    // panello: senza numeri accanto al nome
    openBuildingPanel(pa); r.noNum = !/#\d/.test(document.getElementById('panel').textContent); closePanel();
    return r;
  });
  check(pp.a && pp.b && pp.ids && pp.accepts, 'porto: accetta tutte le merci (grano, mobili, petrolio)' + (pp.ids ? '' : ' ' + JSON.stringify(pp)));
  check(pp.destOpts, 'porto: tra le destinazioni l\'altro porto (via mare) e i produttori possono mandare al porto');
  check(pp.cargo && !pp.tanker && pp.landed > 0, `da porto a porto: nave portacontainer, ${pp.landed} grano arrivato`);
  check(pp.noNum, 'pannello senza numeri accanto ai nomi');

  // 49. centrale eolica: la strada si collega da qualsiasi lato
  const windSides = await page.evaluate(() => {
    const out = [];
    for (let side = 0; side < 4; side++) {
      clearVehicles(); newGame(12, 128); unlockAll(); game.started = true;
      const N = game.size, c = N / 2;
      for (let y = c - 6; y < c + 6; y++) for (let x = c - 6; x < c + 6; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, building: null, elev: 2, bridge: null });
      game.rotation = 0; useTool('windPlant', c, c);
      const roads = [[c, c - 1], [c + 2, c], [c, c + 2], [c - 1, c]][side];
      useTool('road', roads[0], roads[1]);
      out.push(accessTiles(game.map[c][c].building).length > 0);
    }
    return out;
  });
  check(windSides.every(Boolean), 'centrale eolica: strada collegata su tutti e 4 i lati (' + windSides.join(',') + ')');

  // 50. segnala un bug: pagina nel menu, apre GitHub con titolo e testo già scritti
  await page.evaluate(() => { window.__opened = null; window.open = (u) => { window.__opened = u; return null; }; openMenu('main'); });
  await page.click('#m-bug');
  await page.fill('#bug-text', 'Il porto non riceve la merce\nprovato due volte');
  await page.fill('#bug-name', 'Tester');
  await page.click('#bug-send');
  const bug = await page.evaluate(() => {
    const u = window.__opened ? new URL(window.__opened) : null;
    return { url: u && u.origin + u.pathname, title: u && u.searchParams.get('title'), body: u && u.searchParams.get('body'), msg: document.getElementById('menu-msg').textContent };
  });
  await page.keyboard.press('Escape');
  check(bug.url === 'https://github.com/FlattFall/city-builder/issues/new' && bug.title === '[Bug] Il porto non riceve la merce', 'segnalazione: apre GitHub con il titolo giusto');
  check(bug.body && bug.body.includes('provato due volte') && bug.body.includes('Tester') && bug.body.includes('Versione:') && bug.msg.length > 0, 'segnalazione: testo, nome e informazioni del gioco allegati');

  // 51. nomi con numero (il primo senza) e distribuzione per merce in percentuale
  const sp = await page.evaluate(() => {
    clearVehicles(); newGame(13, 128); unlockAll(); game.started = true;
    const N = game.size, c = N / 2;
    for (let y = c - 10; y < c + 10; y++) for (let x = c - 10; x < c + 10; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, elev: 2, bridge: null });
    game.rotation = 0;
    useTool('farm', c, c); game.fieldMode = null;
    useTool('warehouse', c + 4, c); useTool('warehouse', c - 4, c); useTool('warehouse', c, c + 4);
    const f = game.map[c][c].building, w1 = game.map[c][c + 4].building, w2 = game.map[c][c - 4].building, w3 = game.map[c + 4][c].building;
    const r = { names: [buildingName(w1), buildingName(w2), buildingName(w3)] };
    removeBuilding(w2); useTool('warehouse', c - 4, c);
    const w4 = game.map[c][c - 4].building; r.reuse = buildingName(w4);
    removeBuilding(w3);
    f.dests = [w1.id, w4.id];
    for (const w of [w1, w4]) w.workers = 2;
    f.workers = 4;
    openBuildingPanel(f);
    const btn = [...document.querySelectorAll('#panel .psplit-mode')][0];
    r.ui = !!btn; btn.click();
    r.half = JSON.stringify(f.split.wheat);
    document.querySelectorAll('#panel .psplit-row')[0].querySelectorAll('.pstep')[1].click();   // + sulla prima: 60 / 40
    r.sixty = f.split.wheat[w1.id] === 60 && f.split.wheat[w4.id] === 40;
    closePanel();
    // si prova la scelta: sendGoods finto che conta dove va
    const real = sendGoods, sent = {};
    sendGoods = (from, to, g, q) => { addTo(from.store, g, -q); sent[to.id] = (sent[to.id] || 0) + q; return true; };
    const run = () => { for (let i = 0; i < 200; i++) { f.store = { wheat: 10 }; f.van = 0; f.retry = 0; pushGoods(f); } };
    f.split.wheat = { [w1.id]: 50, [w4.id]: 50 }; delete f.sent; run();
    r.fifty = [sent[w1.id], sent[w4.id]];
    for (const k in sent) delete sent[k];
    f.split.wheat = { [w1.id]: 100, [w4.id]: 0 }; delete f.sent; run();
    r.all = [sent[w1.id] || 0, sent[w4.id] || 0];
    sendGoods = real;
    return r;
  });
  check(sp.names.join('|') === 'Magazzino alimenti|Magazzino alimenti 2|Magazzino alimenti 3' && sp.reuse === 'Magazzino alimenti 2', 'nomi: il primo senza numero, poi 2, 3 (demolito il 2, il nuovo riprende il 2): ' + sp.names.join(', ') + ' / ' + sp.reuse);
  check(sp.ui && sp.half.includes('50') && sp.sixty, 'distribuzione: pannello con Automatica/Personalizzata, 50/50 e + porta a 60/40');
  check(Math.abs(sp.fifty[0] - sp.fifty[1]) <= 10 && sp.fifty[0] > 0, `distribuzione 50/50: ${sp.fifty.join(' / ')}`);
  check(sp.all[0] > 0 && sp.all[1] === 0, `distribuzione 100/0: ${sp.all.join(' / ')}`);

  // 52. ruspa su un edificio con della merce: prima chiede, poi demolisce; vuoto si demolisce subito
  const dq = await page.evaluate(() => {
    clearVehicles(); newGame(14, 128); unlockAll(); game.started = true;
    const N = game.size, c = N / 2;
    for (let y = c - 8; y < c + 8; y++) for (let x = c - 8; x < c + 8; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, elev: 2, bridge: null });
    useTool('warehouse', c, c); useTool('warehouse', c + 4, c);
    const full = game.map[c][c].building; full.store = { wheat: 25 };
    setTool('demolish');
    lastTile = null; paintTo({ x: c + 4, y: c }); lastTile = null;
    const r = { emptyGone: !game.map[c][c + 4].building };
    paintTo({ x: c, y: c }); lastTile = null;
    r.asked = confirmIsOpen() && !!game.map[c][c].building && document.getElementById('confirm-text').textContent.includes('25');
    document.getElementById('confirm-no').click();
    r.kept = !confirmIsOpen() && !!game.map[c][c].building;
    paintTo({ x: c, y: c }); lastTile = null;
    document.getElementById('confirm-yes').click();
    r.gone = !confirmIsOpen() && !game.map[c][c].building;
    setTool('hand');
    return r;
  });
  check(dq.emptyGone && dq.asked && dq.kept && dq.gone, 'ruspa: chiede conferma per un edificio con merce (Annulla lo tiene, Demolisci lo toglie), vuoto subito: ' + JSON.stringify(dq));

  // 53. supermercato con due caselle di entrata, rimborso del 75%, finestra "cosa accetta", navi distanziate
  const misc = await page.evaluate(() => {
    clearVehicles(); newGame(15, 128); unlockAll(); game.started = true;
    const N = game.size, c = N / 2, r = {};
    for (let y = c - 8; y < c + 8; y++) for (let x = c - 8; x < c + 8; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, elev: 2, bridge: null });
    game.rotation = 0; useTool('supermarket', c, c);
    const sm = game.map[c][c].building;
    r.ents = entrancesOf(sm).length;
    const e2 = entrancesOf(sm)[1]; useTool('road', e2.rx, e2.ry);
    r.second = accessTiles(sm).length === 1;
    const m0 = game.money; setTool('demolish'); lastTile = null; paintTo({ x: c, y: c }); lastTile = null; setTool('hand');
    r.refund = game.money - m0 === Math.floor(BUILDINGS.supermarket.cost * 0.75);
    useTool('warehouse', c, c); const w = game.map[c][c].building;
    openBuildingPanel(w);
    r.noGrid = !document.querySelector('#panel .gtoggle');
    document.querySelector('#panel .psub-open').click();
    r.sub = !document.getElementById('subpanel').hidden && document.querySelectorAll('#subpanel .gtoggle').length > 3;
    document.querySelector('#subpanel .gtoggle').click();
    r.toggled = Object.values(w.accept).includes(false) && !document.getElementById('subpanel').hidden;
    closePanel(); r.closed = document.getElementById('subpanel').hidden;
    return r;
  });
  check(misc.ents === 2 && misc.second, 'supermercato: strada su tutte e due le caselle davanti');
  check(misc.refund, 'demolire un edificio ridà il 75% del costo');
  check(misc.noGrid && misc.sub && misc.toggled && misc.closed, '"cosa accetta" in una finestra che si apre e si chiude: ' + JSON.stringify(misc));

  // 54. navi da porto a porto: mai una sopra l'altra, e nessuna resta ferma
  const sh = await page.evaluate(() => {
    clearVehicles(); newGame(11, 128); unlockAll(); game.started = true; if (menuIsOpen()) closeMenu();
    const N = game.size, c = N / 2;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, rb: null, elev: 2, bridge: null });
    game.bridges = new Map(); rebuildBridgeIndex(); recount(); game.money = 1e7;
    for (let y = c + 3; y <= c + 12; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.WATER, elev: 0 });
    for (let x = 0; x < N; x++) { useTool('road', x, c); game.map[c][x].main = true; useTool('road', x, c + 15); }
    game.entries = [{ x: 0, y: c }, { x: N - 1, y: c }];
    game.rotation = 2; useTool('port', c - 20, c + 1); game.rotation = 0; useTool('port', c + 20, c + 13);
    for (let hx = c - 34; hx <= c + 30; hx++) { useTool('house', hx, c - 1); useTool('house', hx, c + 16); }
    for (const h of game.buildings.values()) if (h.kind === 'house') h.residents = HOUSE_CAPACITY;
    recount();
    const [pa, pb] = [...game.buildings.values()].filter(b => b.kind === 'port').sort((x, y) => x.ax - y.ax);
    pa.store = { wheat: 120, tables: 100 }; pa.dests = [pb.id];
    let close = 0, maxWait = 0;
    for (let i = 0; i < 4000; i++) {
      simUpdate(0.1);
      const ss = vehicles.filter(v => v.kind === 'ship');
      for (let a = 0; a < ss.length; a++) { maxWait = Math.max(maxWait, ss[a].waited || 0); for (let b = a + 1; b < ss.length; b++) {
        const p = vehiclePos(ss[a]), q = vehiclePos(ss[b]); if (Math.hypot(p.mx - q.mx, p.my - q.my) < 0.3) close++; } }
    }
    for (let i = 0; i < 3000 && vehicles.some(v => v.kind === 'ship'); i++) simUpdate(0.1);
    return { close, maxWait, left: vehicles.filter(v => v.kind === "ship").length, landed: sumOf(pb.store), st: pa.status, w: pa.workers + "/" + pb.workers, ps: JSON.stringify(pa.store) };
  });
  check(sh.close === 0 && sh.left === 0 && sh.landed > 0, `navi: mai sovrapposte (${sh.close}), tutte tornate (${sh.left} in mare), merce arrivata ${sh.landed} ${JSON.stringify(sh)}`);

  // 55. raccolto in proporzione ai campi; il magazzino rifornisce solo chi ha scelto come uscita
  const bal = await page.evaluate(() => {
    const r = {};
    const fake = n => { const f = { kind: 'farm', crop: 'carrot', fields: n, growth: 0.999, workers: JOBS.farm, store: {}, dests: [] }; updateFarm(f, 1); return sumOf(f.store); };
    r.small = fake(12); r.big = fake(172);
    clearVehicles(); newGame(16, 128); unlockAll(); game.started = true; if (menuIsOpen()) closeMenu();
    const N = game.size, c = N / 2;
    for (let y = c - 10; y < c + 10; y++) for (let x = c - 10; x < c + 10; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, elev: 2, bridge: null });
    for (let x = c - 10; x < c + 10; x++) useTool('road', x, c + 2);
    game.rotation = 0; useTool('warehouse', c - 6, c); useTool('supermarket', c, c);
    const wh = game.map[c][c - 6].building, sm = game.map[c][c].building;
    wh.store = { carrot: 50 }; wh.workers = 2; sm.workers = 2;
    for (let i = 0; i < 100; i++) { wh.workers = 2; sm.workers = 2; sm.pullTimer = 0; pullGoods(sm); }
    r.notChosen = (wh.store.carrot || 0) === 50 && !vehicles.some(v => v.kind === 'van');
    wh.dests = [sm.id]; sm.pullTimer = 0; pullGoods(sm);
    r.chosen = (wh.store.carrot || 0) < 50;
    return r;
  });
  check(bal.small === 12 && bal.big === 172, `raccolto in proporzione ai campi: 12 campi = ${bal.small}, 172 campi = ${bal.big}`);
  check(bal.notChosen && bal.chosen, 'il supermercato prende dal magazzino solo se il magazzino lo ha come uscita');

  // 56. furgoni: dal magazzino non escono due insieme e non si passano attraverso
  const vq = await page.evaluate(() => {
    clearVehicles(); newGame(17, 128); unlockAll(); game.started = true; if (menuIsOpen()) closeMenu();
    const N = game.size, c = N / 2;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, rb: null, elev: 2, bridge: null });
    game.bridges = new Map(); rebuildBridgeIndex(); recount(); game.money = 1e7;
    for (let x = 0; x < N; x++) { useTool('road', x, c); game.map[c][x].main = true; }
    game.entries = [{ x: 0, y: c }, { x: N - 1, y: c }];
    game.rotation = 2; useTool('warehouse', c - 30, c + 1); useTool('supermarket', c + 30, c + 1); useTool('factory', c + 20, c + 1);
    for (let hx = c - 34; hx <= c + 34; hx++) useTool('house', hx, c - 1);
    for (const h of game.buildings.values()) if (h.kind === 'house') h.residents = HOUSE_CAPACITY;
    recount();
    const B = k => [...game.buildings.values()].find(b => b.kind === k);
    const wh = B('warehouse'), sm = B('supermarket'), fa = B('factory');
    wh.store = { carrot: 200, potato: 200, wheat: 200 }; wh.dests = [sm.id, fa.id];
    let overlap = 0, vans = 0;
    for (let i = 0; i < 3000; i++) {
      simUpdate(0.1);
      const vs = vehicles.filter(v => v.kind === 'van');
      vans = Math.max(vans, vs.length);
      for (let a = 0; a < vs.length; a++) for (let b2 = a + 1; b2 < vs.length; b2++) {
        if (vehicleDir(vs[a]) !== vehicleDir(vs[b2])) continue;
        const p = vehiclePos(vs[a]), q = vehiclePos(vs[b2]);
        if (Math.hypot(p.mx - q.mx, p.my - q.my) < 0.4) overlap++;
      }
    }
    return { overlap, vans, sold: sm.sold };
  });
  check(vq.vans >= 2 && vq.overlap === 0, `furgoni: mai uno sopra l'altro nella stessa direzione (${vq.overlap}, fino a ${vq.vans} furgoni insieme)`);

  // 57. velocità del gioco, tasto I con 10 milioni, distribuzione del magazzino vuoto
  const sp2 = await page.evaluate(() => {
    clearVehicles(); newGame(18, 128); game.started = true; if (menuIsOpen()) closeMenu();
    const r = { speed1: game.speed === 1 };
    const m0 = game.money; cheatUnlockAll(); r.money = game.money - m0 === 10000000;
    const N = game.size, c = N / 2;
    for (let y = c - 10; y < c + 10; y++) for (let x = c - 10; x < c + 10; x++) Object.assign(game.map[y][x], { type: T.GRASS, path: null, main: false, field: false, farm: null, building: null, elev: 2, bridge: null });
    game.rotation = 0; useTool('warehouse', c - 6, c); useTool('supermarket', c, c); useTool('factory', c, c + 4);
    const wh = game.map[c][c - 6].building, sm = game.map[c][c].building, fa = game.map[c + 4][c].building;
    wh.store = {}; wh.dests = [sm.id, fa.id];
    openBuildingPanel(wh);
    r.splitUi = document.querySelectorAll('#panel .psplit-mode, #panel .psub-open').length > 1;
    closePanel();
    document.querySelector('#speed-btns button[data-speed="5"]').click();
    r.fast = game.speed === 5 && document.querySelector('#speed-btns button[data-speed="5"]').classList.contains('active');
    document.querySelector('#speed-btns button[data-speed="0"]').click();
    r.paused = game.speed === 0;
    setSpeed(1);
    return r;
  });
  await page.keyboard.press('Space');
  const paused2 = await page.evaluate(() => { const p = game.speed === 0; setSpeed(1); return p; });
  check(sp2.speed1 && sp2.fast && sp2.paused && paused2, 'velocità: pausa, normale, super rapido (pulsanti e Spazio)');
  check(sp2.money, 'tasto I: sblocca tutto e dà 10 milioni');
  check(sp2.splitUi, 'magazzino vuoto con due uscite: c\'è già la distribuzione per merce');

  check(errors.length === 0, 'nessun errore in console' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})();
