# City Builder - note per Claude

Gioco city builder isometrico in stile retro, in JavaScript + Canvas 2D, impacchettato con Electron per Windows. L'utente parla italiano: testi del gioco e risposte in italiano.

## Struttura
- `index.html` + `style.css`: pagina e interfaccia (barra in alto, barra strumenti con sottomenu, info tile, toast, menu).
- `js/`: script classici (niente moduli ES, così funziona anche aprendo il file con doppio clic). L'ordine in `index.html` conta: config, noise, terrain, game, roadgen, camera, render, vehicles, economy, ui, panel, input, save, menu, app.
  - `config.js` costanti: grandezze mappa (`MAP_SIZES`: 128, 256, 512, 1024), terreno, `PATHS` (strada, terra, binari), `BUILDINGS` (casa 1x1, fattoria e magazzino 2x2), abitanti, `CROPS`, `FARM`, costi
  - `game.js` stato (`game`) e regole: percorsi, rampe, rotonde, edifici, `checkTool` / `useTool` / `canUseTool`, `recount()`
  - `render.js` disegno (ordine del pittore, solo tile visibili sullo schermo); `requestDraw()` per ridisegnare
  - `camera.js` camera, zoom, `pickTile` (tiene conto delle quote)
  - `input.js` mouse e tastiera; `ui.js` barra strumenti (gruppi, icone, sottomenu) e HUD
  - `roadgen.js` strada principale generata con la mappa (A* da bordo a bordo)
  - `vehicles.js` auto e furgoni, percorsi su strada, arrivo abitanti, produzione delle fattorie (`simUpdate`)
  - `panel.js` pannello degli edifici (clic con la Mano) e modalità campi
  - `save.js` salvataggi; `menu.js` menu principale/pausa
- `main.js` finestra Electron; `.github/workflows/build.yml` crea l'.exe su GitHub Actions.

## Tile
`{ type, elev, path (null/'road'/'dirt'/'rail'), main (strada principale, non demolibile), field, farm (id fattoria del campo), building, rb }`. Usare `setPath()` per cambiare il percorso (aggiorna `game.pathKeys`, usato per calcolare in fretta le rotonde) e poi `updateRoundabouts()`.

## Rampe, collegamenti, anteprima e picking
- Ogni tile ha 4 angoli (N, E, S, W) con un'altezza: `cornerHeights(x, y)`. Piatto = tutti uguali.
- Reti: strade (asfalto + terra) e binari sono reti separate (`netOf`, `sameNet`).
- Un percorso diventa rampa (`rampDir`) se un solo vicino della stessa rete è a +1 livello e ai lati non ci sono percorsi della stessa rete allo stesso livello.
- Due percorsi sono collegati (`roadLinked`) se sono della stessa rete e il bordo in comune ha la stessa altezza.
- Anteprima: `withPreview` costruisce per finta, disegna e annulla. Anteprima e contorno si disegnano in ordine, subito dopo il loro tile, così i blocchi davanti li coprono (scelta dell'utente). Contorno rientrato di 0.1; per gli edifici 2x2 è disegnato sul tile più avanti dell'impronta.
- `pickTile` tratta ogni tile come una colonna dal suolo al punto più alto (edifici compresi) e prende quella disegnata per ultima.

## Livellamento e strada principale
- `fillDips`: lungo una strada dritta, 1 o 2 tile più bassi tra due tile alla stessa quota vengono alzati (scelta dell'utente); con 3 o più bassi restano le rampe (discesa, tratto piano, salita).
- `generateMainRoad` (in `newGame`): A* con stato (tile, direzione) e le stesse regole delle rampe (si sale solo dritti, dopo una discesa si va dritti); l'acqua diventa terrapieno di sabbia a quota 1; le curve costano di più per avere rettilinei. `game.entries` = le due estremità sul bordo.

## Abitanti, veicoli, fattorie
- Le case (capienza `HOUSE_CAPACITY`) vengono riempite da auto che partono dalle entrate e arrivano su una strada accanto alla casa (`findRoute`: BFS sulle strade collegate; nelle rotonde si gira solo in senso antiorario, `RB_NEXT`). Corsia di destra, distanza di sicurezza (`blockedAhead`). `game.population` = abitanti arrivati.
- Fattoria: dopo averla piazzata si entra in modalità campi (`game.fieldMode`), i campi entro `FARM.fieldRadius` vengono assegnati (`t.farm`). Coltura, crescita (`growth` 0..1, raccolto a 1), inventario limitato (`FARM.inventoryCap`), magazzino di destinazione (`storage`); il furgone parte con almeno `vanMinLoad` e torna indietro.
- Pannello: costruito una volta; numeri e barre si aggiornano sul posto (`panelLive`), si ricostruisce solo se cambia la forma (`panelShapeOf`), altrimenti i clic si perderebbero.

## Terreno, rotazione, entrate, lavoro
- Strumenti Alza / Abbassa / Livella nel gruppo 5 (solo su tile senza edifici e percorsi; `setElevation`: quota 0 = acqua, acqua alzata = sabbia). Livella: la quota la decide il primo tile della passata (`game.levelTarget`, azzerato a ogni mousedown).
- Si costruisce anche in montagna (roccia, neve), ma la fattoria vuole erba (niente montagna né sabbia).
- `game.rotation` (tasto R o pulsante Ruota) si applica agli edifici; `rotUV` ruota il riquadro 2x2. Fattoria e magazzino si disegnano con `drawParts` (parti descritte senza rotazione, entrata sul lato +v); porte e insegne solo se la faccia guarda verso lo schermo.
- `entranceOf(b)`: una sola entrata per fattoria e magazzino; `accessTiles` usa solo il tile di strada davanti all'entrata. L'anteprima e la selezione mostrano l'entrata (verde = strada c'è, giallo = manca).
- Lavoro: `JOBS` (fattoria 4, magazzino 2) presi dagli abitanti delle case entro `JOB_RADIUS` (`updateJobs`, ogni secondo). La fattoria cresce in proporzione al personale; il magazzino senza personale non riceve. Icona rossa/arancione sopra le attività senza abbastanza lavoratori. HUD: Fondi, Abitanti, Disoccupati, Case, Industrie.
- Grafica del terreno: colori più chiari in alto e più scuri in basso (`tint`), bordo scuro sui lati dietro dove il terreno scende.
- `clampCamera()` (chiamata a ogni `drawFrame`): il centro dello schermo resta dentro la mappa, non si scorre fuori dai bordi.
- WASD/frecce: tasti tenuti premuti (`keysHeld`), movimento continuo in `panWithKeys(dt)` dal ciclo del gioco, anche in diagonale con due tasti.
- `pickTile` conta l'altezza degli edifici solo con Mano e Demolisci, così con gli altri strumenti si costruisce dietro gli edifici.

## Economia (economy.js)
- `GOODS` (6 colture, 6 prodotti della fabbrica, 3 del panificio; `price` = vendibile al supermercato), `RECIPES` (fabbrica, panificio), `CAPS` (store/input per tipo), `DEST_KINDS`.
- Ogni attività ha `store` (merce pronta) e, se trasforma, `input`. `initEconomy(b)` prepara i dati e converte i vecchi salvataggi (`inventory`, `stock`).
- Spinta: fattoria/fabbrica/panificio mandano la merce alla destinazione `storage` (`pushGoods`, almeno `VAN_MIN_LOAD` in totale). Rifornimento: fabbrica/panificio/supermercato chiedono ai magazzini (`pullGoods`); il supermercato lascia la precedenza ai produttori per le merci che trasformano (es. farina). `expect` = merce già in viaggio verso un edificio (riserva lo spazio).
- `sendGoods`: furgone dall'entrata alla destinazione e ritorno; un furgone per edificio (`b.van`).
- Magazzino: `accept[g] === false` = rifiuta. Ricette: `recipes[out] === false` = spenta.
- Supermercato: clienti = abitanti entro `SHOP.radius`; ogni `SHOP.tick` compra `buyRate` dei clienti; tasse `TAX_RATE` del prezzo a `game.money`.
- `buildingStatus(b)`: icone noWorkers/fewWorkers/full/noInput/empty (`drawWorkerIcons`).
- Icone delle merci: `GOOD_ICONS` (`drawGoodIcon` in ui.js), usate nei pannelli.

## Rotonde
- Rotonde circolari (l'utente ha provato quelle quadrate e la piazzola rialzata: non gli piacevano). Un 2x2 di strade asfaltate diventa rotonda (`t.rb = { ax, ay, slope, low }`), in piano o su un gradino di 1 (2 tile sopra, 2 sotto): i tile bassi sono rampe, senza aggiungere terreno.
- Le strade che entrano di lato nella parte inclinata "si piegano": in `cornerHeights` gli angoli in comune con un tile basso di rotonda prendono la sua altezza (adattatore), così si collegano.
- `drawRoundabout` disegna isola e corsia per quarti, ritagliati sul rombo del tile (allargato di poco per non lasciare righe).

## Edifici
- Impronta da (ax, ay) verso +x e +y; tutti i tile puntano allo stesso oggetto `{ kind, variant, ax, ay }`. Serve terreno piano e libero. Gli edifici grandi si disegnano sul tile più avanti dell'impronta (`drawBuildingOn`), con `box` e `gableRoof`.

## Barra strumenti
- `TOOL_GROUPS` in `ui.js`: 1 Mano, 2 Strade (strada, terra, binari, campo), 3 Case, 4 Industrie (fattoria, magazzino alimenti), 5 Demolisci. Il tasto numerico ripetuto passa al prossimo strumento del gruppo. Le icone sono disegnate con le funzioni di `render.js` (`buildIcons`).

## Menu e salvataggi
- `menu.js`: menu principale/pausa (Riprendi e Salva solo se `game.started`), Nuova mappa (scelta grandezza), Carica, Opzioni ("ci stiamo lavorando"), Esci (`window.close()` in Electron). Esc apre/chiude il menu (prima chiude il sottomenu).
- `save.js`: localStorage (`citybuilder.saves.v1`), formato v3: si ricrea il terreno dal seed e si salvano solo differenze (`game.base`), percorsi, campi, edifici con i loro dati, entrate. Legge anche v1/v2. I veicoli non si salvano.

## Pubblicazione e prove
- `.github/workflows/pages.yml` pubblica su GitHub Pages ad ogni push su main (https://flattfall.github.io/city-builder/).
- `avvia.bat` (CRLF): git pull + npm start. In Electron F5 ricarica.

## Aggiungere uno strumento
1. Definizione in `config.js` (`PATHS` o `BUILDINGS`, oppure un costo in `COSTS`).
2. Regole in `checkTool` / `toolCost` / `useTool` (`game.js`), disegno in `render.js`.
3. Voce in `TOOL_INFO` e in un gruppo di `TOOL_GROUPS` (`ui.js`), icona in `buildIcons`. Salvataggio in `save.js` se serve un nuovo campo.

## Test
`node tools/smoke-test.js` (serve `playwright`; `SHOTS=cartella` per gli screenshot). Copre menu, grandezze, picking, strade, rampe, rotonde, binari, campi, edifici 2x2, demolizione, salvataggi e barra.

## Da fare / idee
- Prestazioni: con zoom molto lontano si disegnano tanti tile ad ogni movimento del mouse; si può mettere in memoria la mappa a blocchi (chunk) e ridisegnare solo l'anteprima.
- Treni sui binari, prezzi/tasse regolabili, bisogni degli abitanti (cibo, felicità), sprite PNG.
