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
  2. **Strade**: strada, strada di terra, binari, campo coltivabile
  3. **Case**
  4. **Industrie**: fattoria (2x2), magazzino alimenti (2x2)
  5. **Demolisci**: demolisci, alza terreno, abbassa terreno, livella terreno
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
- Clic su magazzino o casa per vederne scorte e abitanti.

## Strade e binari

- Una strada (o un binario) che sale dritta di un livello crea una **rampa**.
- Se la strada passa sopra un buco di 1 o 2 tile, il terreno sotto si alza e la strada resta dritta; con 3 tile bassi scende, fa un tratto piano e risale.
- Strade asfaltate e di terra si collegano tra loro; i binari solo con i binari.
- Un quadrato **2x2** di strade asfaltate diventa una **rotonda**, anche su un gradino (2 tile sopra e 2 sotto): le strade si collegano da tutti i lati.

Il codice è diviso in file dentro `js/`: vedi `CLAUDE.md` per la struttura.
