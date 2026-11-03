# City Builder

City builder isometrico in stile retro: terreno generato, strada principale, strade con rampe e rotonde, binari, case con abitanti che arrivano in auto, fattorie con campi e furgoni che portano il cibo ai magazzini.

## Provare l'ultima versione (il modo più veloce)

Ad ogni modifica, GitHub pubblica da solo la versione web del gioco in un paio di minuti:

**https://flattfall.github.io/city-builder/**

Basta aprire il link (o premere F5 se è già aperto). Lo stato della pubblicazione si vede in **Actions** > **Versione web**.

## Avviarlo come programma, sempre aggiornato

Una volta sola:
1. Installa **Node.js** (versione LTS) da https://nodejs.org e **Git** da https://git-scm.com
2. Apri un terminale nella cartella dove vuoi il gioco ed esegui:
   ```
   git clone https://github.com/FlattFall/city-builder.git
   ```

Da quel momento fai doppio clic su **`avvia.bat`** nella cartella `city-builder`: scarica le novità da GitHub e apre il gioco. Se il gioco è già aperto e hai aggiornato i file, premi **F5** per ricaricarlo.

## Creare l'eseguibile (.exe)

Con GitHub: **Actions** > **Build Windows** > **Run workflow**, poi scarica l'.exe dalla sezione **Artifacts**.

Sul tuo PC: `npm install` e poi `npm run dist`; l'.exe compare nella cartella `dist/`.

## Comandi nel gioco

- Esc o il pulsante **Menu**: Riprendi, Salva partita, Nuova mappa (4 grandezze: 128, 256, 512, 1024), Carica mappa, Opzioni, Esci
- Barra in basso (tasti 1-5; premendo di nuovo lo stesso numero passi alla scelta successiva del gruppo):
  1. **Mano**: trascina la mappa
  2. **Strade**: strada, senso unico, autostrada, ponte, tunnel, strada di terra, binari (i campi si mettono dalla fattoria)
  3. **Case**
  4. **Industrie**: fattoria, allevamenti (mucche, polli, maiali, pecore), magazzino alimenti, fabbrica alimentare, caseificio, macello, panificio, supermercato
  5. **Legno**: azienda forestale, segheria, fabbrica di mobili, mercato dell'arredamento
  6. **Demolisci**: demolisci, alza terreno, abbassa terreno, livella terreno
- **R** (o il pulsante Ruota): ruota l'edificio prima di costruirlo
- Strade, binari, campi, case e demolizione si trascinano per fare più tile
- Tasto destro o centrale + trascina, oppure WASD/frecce: muovi la mappa
- Rotella: zoom
- F11: schermo intero, F5: ricarica (nella versione programma)

Le partite salvate restano sul PC (versione programma) o nel browser usato (versione web).

## Città e fattorie

- Ogni mappa nuova ha una **strada principale** da un bordo all'altro: da lì arrivano i nuovi abitanti.
- Costruisci **case** vicino a una strada collegata: arrivano le auto e il contatore **Abitanti** sale (4 per casa).
- Fattoria e magazzino hanno **una sola entrata** (segnata in giallo/verde quando li piazzi): la strada va collegata lì. Ruotali con **R**.
- Le attività hanno bisogno di **lavoratori**: abitanti che vivono entro 12 tile. Senza lavoratori compare un'icona rossa. In alto vedi i **disoccupati**.
- Piazza una **fattoria** (non in montagna: serve l'erba) e disegna i suoi **campi** (entro il riquadro tratteggiato), poi premi Fatto. Un raccolto ogni 2 minuti con tutto il personale.
- Con la **Mano**, clic sulla fattoria: scegli **grano, carote o patate** e il **magazzino** dove portare il cibo. Il furgone ci va se c'è una strada. L'inventario della fattoria ha un limite (100).
- Colture: grano, carote, patate, mais, pomodori, cavoli. Il raccolto va a un **magazzino** o alla **fabbrica alimentare**.
- **Fabbrica alimentare**: grano → farina, patate → patatine confezionate, carote → carote confezionate, pomodori → salsa, mais → farina di mais, grano + pomodori → pasta. Ricette accendibili dal pannello.
- **Panificio**: farina → pane, biscotti, torte.
- **Allevamenti**: mucche → latte e carne, polli → uova e carne, maiali → carne, pecore → lana (le pecore si possono mettere anche in montagna).
- **Caseificio**: latte → formaggio, burro, yogurt.
- **Macello e industria della carne**: animali → carne fresca, salsicce, prosciutto, carne confezionata.
- Ogni attività può mandare la merce a più destinazioni (scegline una o più nel pannello).
- **Magazzino**: scegli con le immagini cosa accetta e, nella sezione Uscita, dove mandare le scorte. Fabbrica, panificio e supermercato si riforniscono dai magazzini.
- **Supermercato**: riceve verdure dalle fattorie, pane dai panifici, carne dai macelli, formaggi dal caseificio, prodotti confezionati dalle fabbriche; vende agli abitanti vicini e incassi il 30% del prezzo come tasse.
- Icone sopra gli edifici: strada sbarrata = casa (o attività) non collegata alla strada, persona = mancano lavoratori, casse = deposito pieno, cassa vuota = mancano materie prime, scaffale = supermercato vuoto.

## Strade e binari

- Una strada (o un binario) che sale dritta di un livello crea una **rampa**.
- Se la strada passa sopra un buco di 1 o 2 tile, il terreno sotto si alza e la strada resta dritta; con 3 tile bassi scende, fa un tratto piano e risale.
- Strade asfaltate e di terra si collegano tra loro; i binari solo con i binari.
- Un quadrato **2x2** di strade asfaltate diventa una **rotonda**, anche su un gradino (2 tile sopra e 2 sotto): le strade si collegano da tutti i lati.

Il codice è diviso in file dentro `js/`: vedi `CLAUDE.md` per la struttura.

## Grafica
La casa è uno sprite in pixel art (tile 64x32) in `assets/sprites/house.png`. Si può ridisegnare con Aseprite/LibreSprite/Piskel mantenendo la stessa griglia (4 rotazioni x 3 colori, celle 64x84) e poi lanciare `node tools/sprites/build.js`.

## Strade e ponti
- **Senso unico**: la freccia va nella direzione in cui trascini (con un clic: tasto R). Ripassa al contrario per girarla.
- **Autostrada**: le auto vanno più veloci (la terra le rallenta). Passandoci sopra trasformi una strada in autostrada.
- **Ponte**: trascina da una sponda all'altra, oppure clicca su una sponda e poi sull'altra (tasto destro annulla). Dritto e lungo quanto vuoi; sale da solo quanto serve per passare sopra fiumi, valli, strade, binari e case basse. I pilastri non toccano mai le strade.
- **Tunnel**: clicca ai piedi di una collina o montagna; l'anteprima mostra già dove esce (in azzurro). Sempre dritto; R cambia direzione.
- Se demolisci una casa, chi ci abitava va in auto in un'altra casa libera o se ne va dalla mappa; le auto in viaggio cambiano strada invece di sparire.

## Settore del legno
- **Azienda forestale**: mettila accanto a un bosco; produce tronchi e legna da ardere (più bosco = più legno, gli alberi restano).
- **Segheria**: tronchi → assi di legno, travature, pannelli di legno.
- **Fabbrica di mobili**: assi e pannelli → tavoli, sedie, armadi, letti, mobili da cucina.
- **Mercato dell'arredamento**: vende i mobili (e il legname) agli abitanti vicini; tu incassi le tasse.
- Nei menu, passando il mouse su un edificio, vedi a cosa serve e la sua catena di montaggio.
