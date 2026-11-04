# City Builder - note per Claude

Gioco city builder isometrico in stile retro, in JavaScript + Canvas 2D, impacchettato con Electron per Windows. L'utente parla italiano: testi del gioco e risposte in italiano.

## Struttura
- `index.html` + `style.css`: pagina e interfaccia (barra in alto, barra strumenti con sottomenu, info tile, toast, menu).
- `js/`: script classici (niente moduli ES, così funziona anche aprendo il file con doppio clic). L'ordine in `index.html` conta: config, noise, terrain, game, bridges, roadgen, camera, sprite-data, sprites, render, render-energy, vehicles, economy, ui, panel, progress, manual, input, save, menu, i18n, i18n-en, i18n-es, app.
  - `config.js` costanti: grandezze mappa (`MAP_SIZES`: 128, 256, 512, 1024), terreno, `PATHS` (strada, terra, binari), `BUILDINGS` (casa e panificio 1x1, le altre attività 2x2), abitanti, `CROPS`, `FARM`, costi
  - `game.js` stato (`game`) e regole: percorsi, rampe, rotonde, edifici, `checkTool` / `useTool` / `canUseTool`, `recount()`
  - `render.js` disegno (ordine del pittore, solo tile visibili sullo schermo); `requestDraw()` per ridisegnare
  - `render-energy.js` edifici del settore energia e petrolio (`cyl` = cilindro, `drawParts1` per 1x1, `drawParts2` con cilindri e quota `z`), `drawOilSpot`
  - `camera.js` camera, zoom, `pickTile` (tiene conto delle quote)
  - `input.js` mouse e tastiera; `ui.js` barra strumenti (gruppi, icone, sottomenu) e HUD
  - `roadgen.js` strada principale generata con la mappa (A* da bordo a bordo)
  - `vehicles.js` auto e furgoni, percorsi su strada, arrivo abitanti, produzione delle fattorie (`simUpdate`)
  - `panel.js` pannello degli edifici (clic con la Mano) e modalità campi
  - `save.js` salvataggi; `menu.js` menu principale/pausa
  - `progress.js` sblocchi a pagamento (finestra P); `manual.js` manuale (finestra M)
- `main.js` finestra Electron; `.github/workflows/build.yml` crea l'.exe su GitHub Actions.

## Tile
`{ type, elev, path (null/'road'/'oneway'/'highway'/'dirt'/'rail'), dir (solo senso unico: 0-3), main (strada principale, non demolibile), field, farm (id fattoria del campo), building, rb, bridge ({ id, i } se sopra c'è un ponte) }`. Usare `setPath()` per cambiare il percorso (aggiorna `game.pathKeys`, usato per calcolare in fretta le rotonde) e poi `updateRoundabouts()`.

## Rampe, collegamenti, anteprima e picking
- Ogni tile ha 4 angoli (N, E, S, W) con un'altezza: `cornerHeights(x, y)`. Piatto = tutti uguali.
- Reti: strade (asfalto + terra) e binari sono reti separate (`netOf`, `sameNet`).
- Un percorso diventa rampa (`rampDir`) se un solo vicino della stessa rete è a +1 livello e ai lati non ci sono percorsi della stessa rete allo stesso livello.
- Due percorsi sono collegati (`roadLinked`) se sono della stessa rete e il bordo in comune ha la stessa altezza.
- Anteprima: `withPreview` costruisce per finta, disegna e annulla. Anteprima e contorno si disegnano in ordine, subito dopo il loro tile, così i blocchi davanti li coprono (scelta dell'utente). Contorno rientrato di 0.1; per gli edifici 2x2 è disegnato sul tile più avanti dell'impronta.
- `pickTile` tratta ogni tile come una colonna dal suolo al punto più alto (edifici compresi) e prende quella disegnata per ultima. Sotto un ponte la colonna ha un buco: `p.deck` = true sull'impalcato, false sotto (la ruspa toglie la casa sotto senza toccare il ponte). Con Mano e Demolisci la scelta è precisa al pixel (`pickTileExact`): i tile candidati si ridisegnano dal più avanti in una tela 1x1 sotto il mouse e vince il primo che colora il pixel, così un edificio alto copre solo quello che copre davvero (l'utente non riusciva a demolire quello che si vede dietro gli edifici). L'anteprima del tunnel com'era (`planTunnel(game.hover)`, disegnata tile per tile) all'utente va bene così: non cambiarla.

## Livellamento e strada principale
- `fillDips`: lungo una strada dritta, 1 o 2 tile più bassi tra due tile alla stessa quota vengono alzati (scelta dell'utente); con 3 o più bassi restano le rampe (discesa, tratto piano, salita).
- La strada principale delle mappe nuove è un'autostrada (`MAIN_PATH` in roadgen.js, anche le teste del suo ponte; richiesta dell'utente: auto più veloci). Non si può declassare (`checkTool`); i salvataggi di prima restano com'erano.
- `generateMainRoad` (in `newGame`): A* con stato (tile, direzione) e le stesse regole delle rampe (si sale solo dritti, dopo una discesa si va dritti); l'acqua diventa terrapieno di sabbia a quota 1; le curve costano di più per avere rettilinei. `game.entries` = le due estremità sul bordo.

## Abitanti, veicoli, fattorie
- Le case (capienza `HOUSE_CAPACITY`) vengono riempite da auto che partono dalle entrate e arrivano su una strada accanto alla casa (`findRoute`: BFS sulle strade collegate; nelle rotonde si gira solo in senso antiorario, `RB_NEXT`). Corsia di destra, distanza di sicurezza (`blockedAhead`). `game.population` = abitanti arrivati.
- Fattoria: dopo averla piazzata si entra in modalità campi (`game.fieldMode`), i campi entro `FARM.fieldRadius` vengono assegnati (`t.farm`). Coltura, crescita (`growth` 0..1, raccolto a 1), inventario limitato (`FARM.inventoryCap`), destinazioni (`dests`, anche più di una); il furgone parte con almeno `vanMinLoad` e torna indietro.
- Pannello: costruito una volta; numeri e barre si aggiornano sul posto (`panelLive`), si ricostruisce solo se cambia la forma (`panelShapeOf`), altrimenti i clic si perderebbero.

## Terreno, rotazione, entrate, lavoro
- Strumenti Alza / Abbassa / Livella nel gruppo 8 (Demolisci) (solo su tile senza edifici e percorsi; `setElevation`: quota 0 = acqua, acqua alzata = sabbia). Livella: la quota la decide il primo tile della passata (`game.levelTarget`, azzerato a ogni mousedown).
- Si costruisce anche in montagna (roccia, neve), ma la fattoria vuole erba (niente montagna né sabbia).
- `game.rotation` (tasto R o pulsante Ruota) si applica agli edifici; `rotUV` ruota il riquadro 2x2. Fattoria e magazzino si disegnano con `drawParts` (parti descritte senza rotazione, entrata sul lato +v); porte e insegne solo se la faccia guarda verso lo schermo.
- `entranceOf(b)`: una sola entrata per fattoria e magazzino; `accessTiles` usa solo il tile di strada davanti all'entrata. L'anteprima e la selezione mostrano l'entrata (verde = strada c'è, giallo = manca).
- Lavoro: `JOBS` (fattoria 4, magazzino 2) presi dagli abitanti delle case entro `JOB_RADIUS` (`updateJobs`, ogni secondo). La fattoria cresce in proporzione al personale; il magazzino senza personale non riceve. Icona rossa/arancione sopra le attività senza abbastanza lavoratori. HUD: Fondi, Abitanti, Disoccupati, Case, Industrie.
- Grafica del terreno: colori più chiari in alto e più scuri in basso (`tint`), bordo scuro sui lati dietro dove il terreno scende.
- `clampCamera()` (chiamata a ogni `drawFrame`): il centro dello schermo resta dentro la mappa, non si scorre fuori dai bordi.
- WASD/frecce: tasti tenuti premuti (`keysHeld`), movimento continuo in `panWithKeys(dt)` dal ciclo del gioco, anche in diagonale con due tasti.
- `pickTile` conta l'altezza degli edifici solo con Mano e Demolisci, così con gli altri strumenti si costruisce dietro gli edifici.

## Economia (economy.js)
- `GOODS` (colture, prodotti animali, fabbrica, panificio, caseificio, carne; `price` = vendibile al supermercato), `RECIPES` (fabbrica, panificio, caseificio, macello: `isProcessor(b)` = ha ricette), `LIVESTOCK` (allevamenti: mucche latte+bovini, polli uova+polli, maiali, pecore lana; `updateLivestock`), `CAPS` (store/input per tipo), `DEST_KINDS`.
- `grass: true` in `BUILDINGS` = vuole erba (fattoria).
- Allevamento unico (`kind: 'livestock'`, `b.animal` = chiave di `LIVESTOCK`: cowFarm/chickenFarm/pigFarm/sheepFarm, i vecchi nomi degli allevamenti separati). L'animale si sceglie nel pannello (`setAnimal`, `animalAllowed`: mucche/polli/maiali vogliono l'erba, le pecore anche montagna e sabbia; `defaultAnimal`). `natureOf(b)` = produzione, `destKindsOf(b)` = destinazioni per animale. I salvataggi con i vecchi allevamenti separati vengono convertiti in `loadGame`. Richiesta dell'utente: menu più snello.
- Ogni attività ha `store` (merce pronta) e, se trasforma, `input`. `initEconomy(b)` prepara i dati e converte i vecchi salvataggi (`inventory`, `stock`).
- Spinta: chi produce manda la merce alle destinazioni `b.dests` (`pushGoods`: per ogni destinazione la merce più abbondante che accetta; almeno `VAN_MIN_LOAD` in totale). I vecchi salvataggi con `storage` vengono convertiti in `dests`. Rifornimento: fabbrica/panificio/supermercato chiedono ai magazzini (`pullGoods`); il supermercato lascia la precedenza ai produttori per le merci che trasformano (es. farina). `expect` = merce già in viaggio verso un edificio (riserva lo spazio).
- `sendGoods`: furgone dall'entrata alla destinazione e ritorno; un furgone per edificio (`b.van`).
- Magazzino: `accept[g] === false` = rifiuta. Ha anche un'uscita: `dests` (DEST_KINDS.warehouse: altri magazzini, fabbrica, panificio, caseificio, macello, supermercato), spinta con `pushGoods` se ha personale; due magazzini che si puntano a vicenda vengono saltati. Ricette: `recipes[out] === false` = spenta.
- Negozi (`SHOPS`: supermercato, mercato dell'arredamento): clienti = abitanti entro `radius`; ogni `tick` compra `buyRate` dei clienti; tasse `TAX_RATE` del prezzo. `shopOf(g)` = dove si vende la merce (`GOODS[g].shop`, se manca il supermercato).
- Due magazzini (`WAREHOUSE_CATS`, `isWarehouse`, `warehouseTakes`): alimenti (cibo e animali) e merci (legno, mobili, fibre, tessuti, vestiti). Il magazzino merci sta nei gruppi Legno e Tessile (`setTool(id, groupId)` si ricorda da quale gruppo lo si è scelto).
- Settore tessile (gruppo 6 Tessile): cotone (nuova coltura, cat 'fiber', solo verso fabbrica tessile o magazzino merci), fabbrica tessile (cotone -> filati, 2 cotone -> tessuto, cotone + lana -> stoffe lavorate: così la lana serve), fabbrica di abbigliamento (magliette, pantaloni, giacche, scarpe, cappotti; giacche/scarpe/cappotti vogliono le stoffe lavorate), negozio di abbigliamento (`SHOPS.clothingStore`). Le pecore mandano la lana al magazzino merci o alla fabbrica tessile.
- Nomi: `b.name` (scelto dal giocatore con il ✎ o clic sul titolo del pannello; `buildingName(b)`), usato nel pannello, nelle destinazioni, nei messaggi (`buildingLabel`) e salvato con l'edificio. Mentre si scrive il nome i tasti del gioco sono fermi e il pannello non si ricostruisce.
- Settore del legno (gruppo 5 Legno): azienda forestale (`FORESTRY`, in `NATURE` con gli allevamenti: produce tronchi e legna da ardere in proporzione ai tile di bosco entro `radius`, `b.trees`; senza bosco icona materie prime mancanti; gli alberi restano), segheria (tronchi -> assi, travature, pannelli), fabbrica di mobili (assi/pannelli -> tavoli, sedie, armadi, letti, mobili da cucina), mercato dell'arredamento (vende mobili e legname; la legna da ardere va al supermercato).
- `buildingStatus(b)`: icone noRoad/noWorkers/fewWorkers/full/noInput/empty (`drawWorkerIcons`). Casa: noRoad se non ha strada accanto o se `b.unreachable` (`checkHouseLinks` in vehicles.js: BFS dalle entrate della mappa ogni ~3 s).
- Correzioni dopo la prova completa dell'economia (tutte le catene insieme): nei trasformatori ogni materia prima ha la sua parte del deposito input (`activeInputs`, `freeFor`: prima la lana riempiva tutta la fabbrica tessile e il cotone non entrava più); le ricette fanno a turno (`b.turn`: prima letti e cucine non si facevano mai); i magazzini hanno più furgoni (`VANS`, `b.van` = quanti in giro, `vanOut`/`vanHome`/`vansBusy`) e ne tengono uno per le richieste; `pullGoods` chiede prima quello che manca e a parità va a turno (`b.pullTurn`); `pushGoods` verso un negozio porta quello che gli manca di più. Test: "ogni merce con prezzo si vende" (catena completa con i negozi per primi e poi tutto via magazzini). Latte, farina, assi e pannelli si vendono solo se non c'è una fabbrica che li vuole (precedenza alle fabbriche).
- Icone delle merci: `GOOD_ICONS` (`drawGoodIcon` in ui.js), usate nei pannelli.

## Grafica (tutto disegnato nel codice)
- Case e veicoli sono disegnati nel codice con `box` / `gableRoof` come magazzino e altri edifici (scelta dell'utente: stesso stile per tutto, niente sprite separati). `drawHouse(c, x, y, base, variant, rot)`: colori da `HOUSE_STYLES` (`l, r, roof, back, shutter`), un piano o due (`hash(x,y,42) > 0.6`), porta sul lato della rotazione, finestre con persiane solo sulle facce visibili, comignolo disegnato con il callback `mid` di `gableRoof(..., alongV, mid)` (tra la falda dietro e quella davanti), vialetto e cespugli. `drawVehicle` (vehicles.js): ombra, ruote = dischi nel piano del fianco (gomma, cerchione, mozzo, riflesso; quelle del fianco lontano prima della scocca, solo gomma; l'utente non vedeva bene le ruote a scatoletta), auto = scocca + abitacolo di vetro, furgone = cassone bianco con striscia; fari davanti / luci rosse dietro secondo `vehicleDir(v)`. Furgone: se marcia verso -u/-v (d 0 o 3) muso e cabina stanno dietro al cassone e si disegnano prima (prima si vedevano attraverso); la striscia è dipinta sulle due pareti visibili (niente scatola con coperchio). Controllo: furgoni e auto nelle 4 direzioni ingranditi.
- Case a due piani in pausa (scelta dell'utente): `TALL_HOUSES = false` in render.js; con true tornano (hash del tile > 0.6).
- Autostrada: niente strisce bianche di bordo e guardrail grigio metallo (l'utente non voleva la linea bianca sul bordo); restano tratteggio centrale e guardrail sui lati senza strada.
- Il sistema degli sprite resta ma è vuoto: `tools/sprites/build.js` ha `SHEETS = {}` (dentro c'è scritto come rimettere house.png e vehicles.png), `js/sprite-data.js` è generato vuoto, `js/sprites.js` (`drawSprite`, `tintedSprite`) non è usato. `tools/sprites/house.py` e `vehicles.py` restano come prova di pixel art.
- Strade (disegnate nel codice, non sprite, così vanno su rampe e ponti): grana dell'asfalto, marciapiedi lastricati con cordolo sui lati liberi, angoli di marciapiede tra due bracci collegati, mezzeria gialla tratteggiata (niente agli incroci, strisce di stop all'ingresso), tombini; autostrada con linee di bordo; terra con sassolini e ciuffi d'erba. Da lontano (`detail` falso, zoom < 1) la versione semplice per non rallentare.
- Grafica generale (render.js): `DETAIL` (zoom >= 1) e `FINE` (zoom >= 2) decidono quanto dettaglio disegnare (da lontano semplice per la velocità; icone sempre dettagliate). `box` ha righe di mattoni/doghe, spigolo chiaro, ombra alla base e contorno; `gableRoof` file di tegole e colmo (`roofLines`); `drawDoor` cornici e vetrate con divisori e riflesso; `drawWall` scarpate di terra sotto l'erba (`wallColor`) con bordo d'erba, strati e sassi; `terrainDetail` ciuffi e fiori, sabbia, crepe nella roccia, neve, onde; schiuma sulle rive; alberi pini/latifoglie con ombra (`drawTree`); binari con ghiaia. `aline` = linea sottile con trasparenza, `shadeC` = shade con memoria (usarlo nei disegni ripetuti). Niente tombini sulle strade: l'utente li vedeva come punti neri.
- Ordine dei pezzi negli edifici (`drawParts` -> `sortParts`/`partBefore`): un pezzo va prima di un altro se gli sta tutto dietro (u o v più piccoli); solo i pezzi che si sovrappongono a terra (camini, insegne dentro l'edificio) usano ancora la somma dell'angolo. Prima le casse davanti al magazzino finivano coperte dal capannone. Le decorazioni in `after` devono seguire la rotazione (`rotUV`/`rotVec`) e comparire solo sui lati visibili. Controllo visivo: tutti gli edifici nelle 4 rotazioni (script di prova con `useTool` a rotazione 0..3).
- Acqua animata: `animT` (secondi), tono che cambia a onde, increspature che scorrono e brillano (`waterDetail`), schiuma sulle rive che pulsa. `waterSeen` = nel fotogramma c'era acqua: allora `app.js` ridisegna ~8 volte al secondo (solo con zoom >= 1).

## Strade speciali e ponti
- `PATHS[p].speed`: autostrada 2.2, terra 0.7, resto 1; `routePoints` mette in ogni punto [mx, my, quota, velocità, livello] e `moveVehicle` usa la velocità del tratto.
- Una strada si può trasformare in un'altra della rete stradale passandoci sopra (es. strada -> autostrada), ma solo se la passata parte da una strada (`game.convertRoads`, deciso al mousedown): così trascinando una strada nuova non si rovinano quelle che incrocia. La principale resta principale ma non diventa senso unico né terra. Le rotonde si fanno solo con `road`.
- Senso unico: `t.dir` = direzione di marcia (quella del trascinamento, `paintTo` gira anche il primo tile; con un clic `rotationDir()` dal tasto R). Ripassando al contrario si gira. `onewayOk(t, d)`: vietato muoversi contro la freccia, di lato si entra/esce. Corsia al centro.
- Ponti (`bridges.js`, `kind: 'bridge'`): si trascinano dritti da testa a testa, oppure clic sulla prima sponda e clic sull'altra (tasto destro annulla). `planBridge` / `buildBridge`, anteprima `game.bridgePlan`. Quote `e[k]` sui bordi: salgono di 1 per tile dalle teste fino a quanto serve (sopra strade/binari `BRIDGE.clearPath` = 2 livelli liberi, sopra le case `buildingClear`, il terreno non deve bucare). Teste: anche su rampa se il lato verso il ponte è in piano (`headInfo`); un campo sulla testa viene tolto. Sotto: case 1x1 se ci stanno, niente edifici grandi né terreno modellato. Pilastri mai sopra strade/binari/case (l'utente non li voleva sulla strada).
- Tunnel (`kind: 'tunnel'`, stessa struttura dei ponti): un clic su un tile ai piedi di una collina; `planTunnel(a, rotationDir())` va dritto finché il terreno è più alto dell'entrata, l'uscita è il primo tile non più alto (anteprima: entrata verde, percorso tratteggiato, uscita azzurra, R cambia direzione). Dentro le auto non si vedono; bocche ad arco (`drawPortal`) sui lati visibili. Sopra il tunnel strade ed edifici sì, terreno modellato no.
- Strada principale: sull'acqua va dritta (A*) e diventa un ponte vero con i pilastri (`buildBridge(plan, { free, main })`, `b.main` = non demolibile); se il ponte non si può fare, terrapieno di sabbia come prima.
- Ponti autostrada: `b.path` = 'highway' (manca = strada normale, `bridgePath(b)`); strumento `hwBridge` (Ponte autostrada, `BRIDGE.hwCostPerTile`, sblocco con ponte + autostrada), `planBridge(a, b, path)`, `isBridgeTool`. Sopra si disegna l'autostrada e le auto vanno alla sua velocità (`routePoints`); teste costruite come autostrada. Il ponte della strada principale è sempre autostrada (richiesta dell'utente: tutta la principale veloce). `path` salvato con i ponti.
- Auto su due livelli: nodi `nodeKey(x, y, L)` (L = 1 sul ponte), `driveNeighbors(x, y, L)`; dalla testa si sale solo nella direzione del ponte, sul ponte si va avanti/indietro. `blockedAhead` ignora chi è a un'altra quota. Disegno: impalcato e auto sul ponte subito dopo il tile (`drawBridgeSpan`), auto a terra prima.
- Demolire un tile del ponte (o la strada di una testa) toglie tutto il ponte (`removeBridge`, `onBridgeRemoved`). Salvataggio: `bridges` e `dir` nei `paths` (codici 4 senso unico, 5 autostrada).

## Demolizioni e veicoli
- Ruspa: `demolishTarget(x, y)` = cosa toglierebbe ('bridge', 'building', 'path', 'field', 'tree', 'tunnel'). Il primo clic decide la categoria (`game.demolishCat`); trascinando si toglie solo quella (ponti e tunnel solo con il clic), così non si rompe tutto quello che c'è davanti.
- Una casa demolita: chi ci abitava riparte in auto (`relocate`) verso una casa con posto, altrimenti esce dalla mappa (`leaveMap`, `routePoints(..., toOutside)`). Le auto dirette lì vengono dirottate (`redirectVehicle` dal prossimo nodo, `vehicleNextNode` con `v.ptOff`). Furgoni verso un edificio demolito: tornano indietro e rimettono la merce; furgoni senza più casa escono dalla mappa. Non far mai sparire i veicoli di colpo (richiesta dell'utente).

## Attenzione (errori già fatti)
- Mai `open(p, 'w').write(open(p).read()...)` in Python: apre in scrittura prima di leggere e svuota il file. Leggere prima, poi scrivere.

## Rotonde
- Rotonde circolari (l'utente ha provato quelle quadrate e la piazzola rialzata: non gli piacevano). Un 2x2 di strade asfaltate diventa rotonda (`t.rb = { ax, ay, slope, low }`), in piano o su un gradino di 1 (2 tile sopra, 2 sotto): i tile bassi sono rampe, senza aggiungere terreno.
- Le strade che entrano di lato nella parte inclinata "si piegano": in `cornerHeights` gli angoli in comune con un tile basso di rotonda prendono la sua altezza (adattatore), così si collegano.
- `drawRoundabout` disegna isola e corsia per quarti, ritagliati sul rombo del tile (allargato di poco per non lasciare righe).

## Edifici
- Impronta da (ax, ay) verso +x e +y; tutti i tile puntano allo stesso oggetto `{ kind, variant, ax, ay }`. Serve terreno piano e libero. Gli edifici grandi si disegnano sul tile più avanti dell'impronta (`drawBuildingOn`), con `box` e `gableRoof`.

## Barra strumenti
- `TOOL_GROUPS` in `ui.js`: 1 Mano, 2 Strade (strada, senso unico, autostrada, ponte, tunnel, terra, binari; il campo non è nella barra: si usa solo in modalità campi della fattoria, `checkTool` lo rifiuta senza `game.fieldMode`, `setTool` accetta strumenti senza gruppo), 3 Case, 4 Agroalimentare (fattoria, allevamento (animale a scelta), magazzino, fabbrica alimentare, caseificio, macello, panificio, supermercato), 5 Legno (azienda forestale, segheria, fabbrica di mobili, mercato dell'arredamento, magazzino merci), 6 Tessile (fabbrica tessile, fabbrica di abbigliamento, negozio di abbigliamento, magazzino merci), 7 Energia (carbonaia, centrali a carbone/solare/eolica, pozzo, piattaforma, porto, raffineria, distributore, magazzino merci), 8 Demolisci. Strade ha anche il Ponte autostrada. L'aiuto (`#help`) sta in alto a sinistra: in basso la barra larga lo copriva. Nel sottomenu `#subdesc` mostra la descrizione (`TOOL_INFO[id].desc`) e la catena di montaggio presa dai dati (`chainLines`: ricette, produzione, cosa vende, dove manda, lavoratori) per lo strumento sotto il mouse. Il tasto numerico ripetuto passa al prossimo strumento del gruppo. Le icone sono disegnate con le funzioni di `render.js` (`buildIcons`).

## Energia e petrolio (gruppo 7 Energia; Demolisci è passato all'8)
- Carbonaia 1x1 (2 legna da ardere -> carbone; i tronchi no, servono alla segheria). Centrali (`POWER`): carbone (brucia 1 carbone ogni `burn` s, input in `b.input`, `updatePower`), solare, eolica (più energia in alto: `perLevel` per livello di quota). `b.power` = energia prodotta.
- Rete elettrica unica (`updateGrid` in `economyUpdate`): `game.grid` = { gen, demand (abitanti + `GRID.perBusiness` per attività), cover, bills }. Bollette ogni `GRID.billEvery` s; `gridBoost()` = attività fino al 25% più veloci con la corrente (fattorie, allevamenti, fabbriche). Niente penalità senza corrente (all'inizio non c'è). Non è nella barra in alto (l'utente la vuole con solo 5 voci): si vede nel pannello delle centrali.
- Petrolio: `oilAt(x, y)` (fbm dal seed, in mare soglia più bassa = più petrolio), `oilUnder`; pozzo 1x1 (a terra) e piattaforma 2x2 (`water: true`: tutta sull'acqua libera) in `NATURE` (`OIL`), producono in proporzione al giacimento (`b.oil`). Con pozzo/piattaforma in mano si vedono le macchie scure (`drawOilSpot`). La piattaforma non prende lavoratori dalle case (`staffOf` = 1 senza `JOBS`), `buildingStatus` senza strada/lavoratori.
- Porto 2x2 (`coast: true`): magazzino (`WAREHOUSE_CATS.port` = energia e carburanti, 3 furgoni); il retro (lato opposto all'entrata) deve dare sull'acqua: `dockTiles(b)` = le 2 caselle d'acqua dove attraccano le navi. La gru guarda sempre l'acqua (controllato nelle 4 rotazioni).
- Navi (vehicles.js): `sendGoods` da un edificio `water` chiama `sendByShip` (BFS sull'acqua `waterRoute`, punti `shipPoints` a quota 0, `SHIP_CAPACITY`), andata e ritorno con `vanOut`/`vanHome`. Porto demolito: la nave torna alla piattaforma con il carico (`redirectShip`). `drawShip`: scafo con prua, ponte, cisterne gialle, cabina con fumaiolo, scia.
- Raffineria (2 grezzo -> benzina / gasolio), distributore 1x1 (`SHOPS.gasStation`). Merci: carbone, petrolio grezzo (cat 'energy', senza prezzo), benzina e gasolio (cat 'fuel'). Il magazzino merci accetta anche energia e carburanti.
- Animazioni: pale eoliche, pompa del pozzo, fiamme, fumo: mettono `waterSeen = true` così `app.js` ridisegna.
- Sblocchi nel settore Energia (`UNLOCKS`); capitolo "Energia e petrolio" nel manuale.

## Progressi (progress.js, tasto P)
- Mappa nuova: solo `START_TOOLS` (mano, strada, terra, casa, fattoria, magazzino alimenti, supermercato, demolisci e terreno) e `START_CROPS` (grano, carote, patate). Il resto in `UNLOCKS` (settore, strumenti e/o colture, costo, `needs`): si paga nella finestra Progressi (`buyUnlock`). Richiesta dell'utente: all'inizio poche cose, le altre industrie si pagano.
- `game.unlocked` = Set degli sblocchi; `null` = tutto sbloccato (salvataggi di prima senza `unlocked`). `newGame` chiama `resetUnlocks`; salvato in `serializeGame`.
- `toolLocked(t)`, `cropLocked(c)`: `checkTool` rifiuta gli strumenti bloccati; nella barra lucchetto e icona grigia (`refreshLocks`, `markLockedSub`), clic su uno bloccato apre la finestra su quello sblocco; nel pannello della fattoria le colture bloccate hanno il lucchetto. Il magazzino merci viene sia con il legno sia con il tessile.
- La finestra si aggiorna con i fondi senza ricostruirsi (`progressLive` da `updateHud`).

## Manuale (manual.js, tasto M)
- `MANUAL`: capitoli (come si inizia, strade, case e lavoro, agricoltura, allevamento, trasformazione alimentare, legno, tessile, magazzini e furgoni, negozi e soldi, progressi, terreno, comandi) con icone del gioco. Catene, prezzi e numeri presi dai dati (`recipeRow`, `item`, `priceNote`), le icone di stato con `drawStatusIcon` (render.js). Se si aggiunge un settore, aggiungere il capitolo.
- M e P aprono/chiudono; Esc chiude prima manuale e progressi; con una delle due aperte gli altri tasti del gioco sono fermi. Pulsanti anche nella barra in alto.

## Lingue (i18n.js, i18n-en.js, i18n-es.js)
- Italiano, inglese, spagnolo: scelta nel menu Opzioni (`renderLangList`, `setLanguage`), salvata in localStorage (`citybuilder.lang`), si cambia anche a partita aperta (rifà barra, pannello, finestre).
- Il testo nel codice resta in italiano dentro `TR('frase', { n: 3 })` (NON `T`: `T` è l'elenco dei tipi di terreno). `DICT.en` / `DICT.es`: chiave = la frase italiana esatta, `{nome}` = pezzi che cambiano. Mai concatenare frasi: un'unica frase con i segnaposto.
- Nomi nei dati (edifici, merci, colture, animali, gruppi, grandezze, sblocchi, capitoli, terreno) tradotti da `applyLanguage()` con `trField` (si ricorda l'italiano in `_it_*`). Strumenti: `TOOL_TEXT.en/es[id] = { label, desc }` (le descrizioni usano le costanti del gioco). Testi fissi della pagina: `data-i18n` / `data-i18n-html`. Soldi con `money(n)` (formato della lingua).
- Nuovo testo: scriverlo con `TR(...)` e aggiungere la frase in tutti e due i dizionari. Il test "nessuna frase senza traduzione" (e `missingText`) dice cosa manca; script di controllo che cerca parole italiane nel testo visibile in inglese.
- Tasto I = sblocca tutto (`cheatUnlockAll`, richiesta dell'utente per provare il gioco senza accumulare soldi).

## Menu e salvataggi
- `menu.js`: menu principale/pausa (Riprendi e Salva solo se `game.started`), Nuova mappa (scelta grandezza), Carica, Opzioni (lingua; audio/grafica "ci stiamo lavorando"), Esci (`window.close()` in Electron). Esc apre/chiude il menu (prima chiude il sottomenu).
- `save.js`: localStorage (`citybuilder.saves.v1`), formato v3: si ricrea il terreno dal seed e si salvano solo differenze (`game.base`), percorsi, campi, edifici con i loro dati, entrate. Legge anche v1/v2. I veicoli non si salvano.

## Pubblicazione e prove
- `.github/workflows/pages.yml` pubblica su GitHub Pages ad ogni push su main (https://flattfall.github.io/city-builder/).
- `avvia.bat` (CRLF): git pull + npm start. In Electron F5 ricarica.

## Aggiungere uno strumento
1. Definizione in `config.js` (`PATHS` o `BUILDINGS`, oppure un costo in `COSTS`).
2. Regole in `checkTool` / `toolCost` / `useTool` (`game.js`), disegno in `render.js`.
3. Voce in `TOOL_INFO` e in un gruppo di `TOOL_GROUPS` (`ui.js`), icona in `buildIcons`. Salvataggio in `save.js` se serve un nuovo campo.

## Test
`node tools/smoke-test.js` (serve `playwright`; `SHOTS=cartella` per gli screenshot). Nei test `newGame` è avvolta da `unlockAll()` (i test vecchi usano tutti gli strumenti); i progressi si provano con la vera `__newGame`. Copre menu, grandezze, picking, strade, rampe, rotonde, binari, campi, edifici 2x2, demolizione, salvataggi e barra.

## Da fare / idee
- Prestazioni: con zoom molto lontano si disegnano tanti tile ad ogni movimento del mouse; si può mettere in memoria la mappa a blocchi (chunk) e ridisegnare solo l'anteprima.
- Prodotti senza sbocco: travature (solo vendita), farina di mais e cavoli (solo vendita). Idee: industria tessile, uova/burro al panificio.
- Treni sui binari, prezzi/tasse regolabili, bisogni degli abitanti (cibo, felicità), sprite in pixel art anche per gli altri edifici, strade e terreno.
