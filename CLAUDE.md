# City Builder - note per Claude

Gioco city builder isometrico in stile retro, in JavaScript + Canvas 2D, impacchettato con Electron per Windows. L'utente parla italiano: testi del gioco e risposte in italiano.

## Struttura
- `index.html` + `style.css`: pagina e interfaccia (barra in alto, barra strumenti con sottomenu, info tile, toast, menu).
- `js/`: script classici (niente moduli ES, così funziona anche aprendo il file con doppio clic). L'ordine in `index.html` conta: config, noise, terrain, game, camera, render, ui, input, save, menu, app.
  - `config.js` costanti: grandezze mappa (`MAP_SIZES`, la più piccola 128), terreno, `PATHS` (strada, terra, binari), `BUILDINGS` (casa 1x1, fattoria e magazzino 2x2), costi
  - `game.js` stato (`game`) e regole: percorsi, rampe, rotonde, edifici, `checkTool` / `useTool` / `canUseTool`, `recount()`
  - `render.js` disegno (ordine del pittore, solo tile visibili sullo schermo); `requestDraw()` per ridisegnare
  - `camera.js` camera, zoom, `pickTile` (tiene conto delle quote)
  - `input.js` mouse e tastiera; `ui.js` barra strumenti (gruppi, icone, sottomenu) e HUD
  - `save.js` salvataggi; `menu.js` menu principale/pausa
- `main.js` finestra Electron; `.github/workflows/build.yml` crea l'.exe su GitHub Actions.

## Tile
`{ type, elev, path (null/'road'/'dirt'/'rail'), field, building, rb }`. Usare `setPath()` per cambiare il percorso (aggiorna `game.pathKeys`, usato per calcolare in fretta le rotonde) e poi `updateRoundabouts()`.

## Rampe, collegamenti, anteprima e picking
- Ogni tile ha 4 angoli (N, E, S, W) con un'altezza: `cornerHeights(x, y)`. Piatto = tutti uguali.
- Reti: strade (asfalto + terra) e binari sono reti separate (`netOf`, `sameNet`).
- Un percorso diventa rampa (`rampDir`) se un solo vicino della stessa rete è a +1 livello e ai lati non ci sono percorsi della stessa rete allo stesso livello.
- Due percorsi sono collegati (`roadLinked`) se sono della stessa rete e il bordo in comune ha la stessa altezza.
- Anteprima: `withPreview` costruisce per finta, disegna e annulla. Anteprima e contorno si disegnano in ordine, subito dopo il loro tile, così i blocchi davanti li coprono (scelta dell'utente). Contorno rientrato di 0.1; per gli edifici 2x2 è disegnato sul tile più avanti dell'impronta.
- `pickTile` tratta ogni tile come una colonna dal suolo al punto più alto (edifici compresi) e prende quella disegnata per ultima.

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
- `save.js`: localStorage (`citybuilder.saves.v1`), formato v2 con stringhe compresse (RLE) per tipo, quota, percorso, campo + lista edifici; legge anche il formato v1.

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
- Treni sui binari, economia (fattoria -> magazzino), crescita della città, sprite PNG.
