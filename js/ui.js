// ---------- Interfaccia: barra strumenti, contatori, messaggi ----------
const TOOL_INFO = {
  hand:      { label: 'Mano', desc: 'Sposta la mappa. Clic su un edificio per aprire il suo pannello (merce, lavoratori, destinazioni).' },
  road:      { label: 'Strada', cost: PATHS.road.cost, desc: 'Strada a doppio senso.' },
  oneway:    { label: 'Senso unico', cost: PATHS.oneway.cost, desc: 'Le auto vanno solo nel verso della freccia: trascina nella direzione di marcia (R per un tile solo). Ripassa al contrario per girarla.' },
  highway:   { label: 'Autostrada', cost: PATHS.highway.cost, desc: 'Le auto vanno più del doppio più veloci. Passaci sopra per trasformare una strada in autostrada.' },
  hwBridge:  { label: 'Ponte autostrada (per tile)', cost: BRIDGE.hwCostPerTile, desc: "Come il ponte, ma sopra c'è un'autostrada: le auto ci vanno veloci come in autostrada. Clicca una sponda e poi l'altra (o trascina)." },
  bridge:    { label: 'Ponte (per tile)', cost: BRIDGE.costPerTile, desc: "Passa sopra fiumi, valli, strade, binari e case basse. Clicca una sponda e poi l'altra (o trascina): sale da solo quanto serve." },
  tunnel:    { label: 'Tunnel (per tile)', cost: TUNNEL.costPerTile, desc: "Passa sotto colline e montagne, sempre dritto. Metti il mouse ai piedi della collina: vedi già dove esce (in azzurro)." },
  dirt:      { label: 'Strada di terra', cost: PATHS.dirt.cost, desc: 'Costa poco, ma le auto vanno più piano.' },
  rail:      { label: 'Binari', cost: PATHS.rail.cost, desc: 'Binari per i treni (i treni arriveranno più avanti).' },
  field:     { label: 'Campo coltivabile', cost: COSTS.field, desc: 'Campo della fattoria.' },
  house:     { label: 'Casa', cost: BUILDINGS.house.cost, desc: 'Ci abitano fino a ' + HOUSE_CAPACITY + ' persone, che arrivano in auto dalla strada principale. Lavorano nelle attività entro ' + JOB_RADIUS + ' tile e comprano nei negozi vicini.' },
  farm:      { label: 'Fattoria (2x2)', cost: BUILDINGS.farm.cost, desc: 'Coltiva i campi che scegli intorno (grano, carote, patate, mais, pomodori, cavoli, cotone). Le verdure si vendono anche fresche al supermercato; il cotone va alla fabbrica tessile.' },
  warehouse: { label: 'Magazzino alimenti (2x2)', cost: BUILDINGS.warehouse.cost, desc: 'Conserva cibo e animali: scegli cosa accetta e dove mandarlo (uscita). Fabbriche alimentari e supermercati vengono a prendere qui quello che gli serve.' },
  goodsWarehouse: { label: 'Magazzino merci (2x2)', cost: BUILDINGS.goodsWarehouse.cost, desc: 'Conserva tutto quello che non è cibo: legno, mobili, cotone, lana, tessuti, vestiti ed energia. Scegli cosa accetta e dove mandarlo; segheria, fabbriche e negozi vengono a prendere qui quello che gli serve.' },
  textileMill: { label: 'Fabbrica tessile (2x2)', cost: BUILDINGS.textileMill.cost, desc: 'Trasforma il cotone delle fattorie in filati e tessuto. Con cotone e lana delle pecore fa le stoffe lavorate, che servono per giacche, scarpe e cappotti.' },
  clothingFactory: { label: 'Fabbrica di abbigliamento (2x2)', cost: BUILDINGS.clothingFactory.cost, desc: 'Cuce i vestiti con i filati, il tessuto e le stoffe lavorate della fabbrica tessile.' },
  clothingStore: { label: 'Negozio di abbigliamento (2x2)', cost: BUILDINGS.clothingStore.cost, desc: 'Vende vestiti e scarpe agli abitanti vicini: per ogni vendita incassi le tasse.' },
  factory:   { label: 'Fabbrica alimentare (2x2)', cost: BUILDINGS.factory.cost, desc: 'Trasforma i raccolti in cibo confezionato.' },
  bakery:    { label: 'Panificio', cost: BUILDINGS.bakery.cost, desc: 'Fa pane, biscotti e torte con la farina della fabbrica alimentare e li vende al banco agli abitanti vicini.' },
  supermarket: { label: 'Supermercato (2x2)', cost: BUILDINGS.supermarket.cost, desc: 'Vende cibo agli abitanti vicini: per ogni vendita incassi le tasse.' },
  livestock: { label: 'Allevamento (2x2)', cost: BUILDINGS.livestock.cost, desc: "Scegli cosa allevare nel pannello: mucche (latte per il caseificio, bovini per il macello), polli (uova, polli per il macello), maiali (per il macello) o pecore (lana per la fabbrica tessile). Mucche, polli e maiali vogliono l'erba; le pecore stanno anche in montagna." },
  dairy:     { label: 'Caseificio (2x2)', cost: BUILDINGS.dairy.cost, desc: "Trasforma il latte degli allevamenti di mucche in latticini." },
  slaughterhouse: { label: 'Macello e carne (2x2)', cost: BUILDINGS.slaughterhouse.cost, desc: 'Trasforma gli animali degli allevamenti in carne.' },
  forestry:  { label: 'Azienda forestale (2x2)', cost: BUILDINGS.forestry.cost, desc: 'Taglia legna nei boschi vicini: mettila accanto a una foresta (gli alberi restano). Più bosco = più legno.' },
  sawmill:   { label: 'Segheria (2x2)', cost: BUILDINGS.sawmill.cost, desc: "Trasforma i tronchi dell'azienda forestale in legname." },
  furnitureFactory: { label: 'Fabbrica di mobili (2x2)', cost: BUILDINGS.furnitureFactory.cost, desc: 'Costruisce mobili con le assi e i pannelli della segheria.' },
  furnitureStore: { label: "Mercato dell'arredamento (2x2)", cost: BUILDINGS.furnitureStore.cost, desc: 'Vende mobili (e legname) agli abitanti vicini: per ogni vendita incassi le tasse. I mobili si comprano più di rado ma costano di più.' },
  charcoalKiln: { label: 'Carbonaia', cost: BUILDINGS.charcoalKiln.cost, desc: "Fa il carbone bruciando piano la legna sotto la terra: legna da ardere dall'azienda forestale." },
  coalPlant: { label: 'Centrale a carbone (2x2)', cost: BUILDINGS.coalPlant.cost, desc: 'Brucia il carbone della carbonaia e produce tanta energia per la rete elettrica.' },
  pylon: { label: 'Traliccio', cost: BUILDINGS.pylon.cost, desc: 'Alta tensione: si collega ai tralicci entro ' + ELEC.pylonRange + ' tile e alle sottostazioni entro ' + ELEC.linkRange + '. Anche sull\'acqua. Trascinando li metti in fila. Sul bordo della mappa compra e vende la corrente fuori.' },
  pole: { label: 'Palo della luce', cost: BUILDINGS.pole.cost, desc: 'Bassa tensione di legno: porta la corrente delle strade fino a ' + ELEC.poleRange + ' tile (fra un palo e l\'altro) e a chi è entro ' + ELEC.poleReach + ' tile. Trascinando li metti in fila.' },
  substation: { label: 'Sottostazione elettrica', cost: BUILDINGS.substation.cost, desc: "Trasforma l'alta tensione in bassa (per case e attività) e al contrario. Si collega a un traliccio entro " + ELEC.linkRange + ' tile e alla bassa tensione: una strada accanto (cavi sotto le strade) o un palo della luce. Niente lavoratori.' },
  solarPlant: { label: 'Centrale solare (2x2)', cost: BUILDINGS.solarPlant.cost, desc: 'Pannelli solari: energia pulita senza materie prime, basta un lavoratore.' },
  windPlant: { label: 'Centrale eolica (2x2)', cost: BUILDINGS.windPlant.cost, desc: "Pale eoliche: energia senza materie prime. Più in alto la costruisci, più vento c'è e più energia fa. La strada si può collegare da qualsiasi lato." },
  oilWell:   { label: 'Pozzo petrolifero', cost: BUILDINGS.oilWell.cost, desc: 'Estrae il petrolio grezzo da un giacimento a terra (con lo strumento in mano vedi le zone scure dove ce n\'è).' },
  oilPlatform: { label: 'Piattaforma petrolifera (2x2)', cost: BUILDINGS.oilPlatform.cost, desc: "Si costruisce sull'acqua sopra un giacimento. Il personale vive a bordo; una nave porta il petrolio al porto." },
  port:      { label: 'Porto (2x2)', cost: BUILDINGS.port.cost, desc: "Porto con magazzino marittimo per tutte le merci: davanti la strada, dietro l'acqua (R per ruotarlo). Le navi portano la merce agli altri porti (petroliere per petrolio e carburanti, portacontainer per il resto), i furgoni a magazzini, fabbriche e negozi." },
  refinery:  { label: 'Raffineria di petrolio (2x2)', cost: BUILDINGS.refinery.cost, desc: 'Trasforma il petrolio grezzo in benzina e gasolio.' },
  gasStation: { label: 'Distributore di carburante', cost: BUILDINGS.gasStation.cost, desc: 'Vende benzina e gasolio agli abitanti vicini: per ogni vendita incassi le tasse.' },
  waterWell: { label: "Pozzo dell'acqua", cost: BUILDINGS.waterWell.cost, desc: "Prende l'acqua dalle falde (zone azzurre): fino a " + WATER.well + ' unità. Va accanto a una strada (tubi sotto tutte le strade). 1 lavoratore.' },
  waterPlant: { label: "Depuratore dell'acqua di mare (2x2)", cost: BUILDINGS.waterPlant.cost, desc: "Toglie il sale all'acqua del mare: " + WATER.plant + ' unità. Il retro sul mare, davanti la strada. 3 lavoratori.' },
  sewage: { label: 'Scarico delle acque sporche (2x2)', cost: BUILDINGS.sewage.cost, desc: "In riva al mare (il retro sull'acqua): un tubo scarica in mare le acque sporche (fino a " + WATER.sewage + ' unità). Si collega ai tubi sotto le strade, anche con un tubo. Senza lavoratori. Intorno l\'acqua diventa marrone.' },
  pipe: { label: "Tubo dell'acqua", cost: COSTS.pipe, desc: "Tubo sotto terra: collega scarichi, pozzi ed edifici lontani ai tubi che passano sotto ogni strada. Con il tubo in mano vedi la mappa dei tubi." },
  busStop: { label: 'Fermata del bus', cost: BUILDINGS.busStop.cost, desc: 'Accanto a una strada. Chi abita entro ' + BUS.walk + ' tile va col bus a lavorare nelle attività vicine a un\'altra fermata dello stesso deposito, anche lontane. Le attività servite lavorano il ' + Math.round(BUS.boost * 100) + '% più in fretta.' },
  busDepot: { label: 'Deposito dei bus (2x2)', cost: BUILDINGS.busDepot.cost, desc: 'Da qui partono i bus per tutte le fermate che raggiunge per strada. 3 autisti.' },
  demolish:  { label: 'Demolisci', desc: 'Toglie edifici, strade, ponti, tunnel, campi e alberi. Trascinando toglie solo cose dello stesso tipo del primo clic. Un edificio demolito ti ridà il 75% del costo.' },
  raise:     { label: 'Alza terreno', cost: COSTS.terrain, desc: 'Alza il terreno di un livello (solo dove non ci sono strade o edifici).' },
  lower:     { label: 'Abbassa terreno', cost: COSTS.terrain, desc: "Abbassa il terreno di un livello; a quota 0 diventa acqua." },
  level:     { label: 'Livella terreno', cost: COSTS.terrain, desc: 'Trascina: porta tutto alla quota del primo tile.' },
};

// Gruppi della barra: il tasto numerico sceglie il gruppo (premuto di nuovo passa al prossimo)
const TOOL_GROUPS = [
  { key: '1', id: 'hand',     label: 'Mano',      tools: ['hand'] },
  { key: '2', id: 'paths',    label: 'Strade',    tools: ['road', 'oneway', 'highway', 'bridge', 'hwBridge', 'tunnel', 'dirt', 'rail'] },
  { key: '3', id: 'homes',    label: 'Città',     tools: ['house', 'busStop', 'busDepot', 'waterWell', 'waterPlant', 'sewage', 'pipe'] },
  { key: '4', id: 'industry', label: 'Agroalimentare', tools: ['farm', 'livestock',
    'warehouse', 'factory', 'dairy', 'slaughterhouse', 'bakery', 'supermarket'] },
  { key: '5', id: 'wood',     label: 'Legno',     tools: ['forestry', 'sawmill', 'furnitureFactory', 'furnitureStore', 'goodsWarehouse'] },
  { key: '6', id: 'textile',  label: 'Tessile',   tools: ['textileMill', 'clothingFactory', 'clothingStore', 'goodsWarehouse'] },
  { key: '7', id: 'oil',      label: 'Petrolio',  tools: ['oilWell', 'oilPlatform', 'port', 'refinery', 'gasStation', 'goodsWarehouse'] },
  { key: '8', id: 'energy',   label: 'Energia',   tools: ['pylon', 'pole', 'substation', 'solarPlant', 'windPlant', 'coalPlant', 'charcoalKiln'] },
  { key: '9', id: 'demolish', label: 'Demolisci', tools: ['demolish', 'raise', 'lower', 'level'] },
];
const groupChoice = {};   // gruppo -> ultimo strumento scelto
const ICONS = {};         // strumento -> immagine (data URL)
const GOOD_ICONS = {};    // merce -> piccola immagine (data URL)

// ---------- Icone delle merci (24x24) ----------
function drawGoodIcon(c, g) {
  const circle = (x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
  const ell = (x, y, rx, ry, col, rot) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); c.fill(); };
  const shape = (pts, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(...pts[0]); for (const p of pts.slice(1)) c.lineTo(...p); c.closePath(); c.fill(); };
  const rect = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const line2 = (x0, y0, x1, y1) => { c.strokeStyle = '#5a3a22'; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
  const sack = (col, mark) => { // sacco di farina con un simbolo
    shape([[6, 6], [18, 6], [20, 21], [4, 21]], col); rect(8, 3, 8, 4, shade(col, -0.15));
    ell(12, 14, 3, 4, mark);
  };
  const wood = '#b07a48', woodD = '#7a5030', woodL = '#e3c48a';
  const cloth = (col, dark) => [col, dark || shade(col, -0.25)];
  switch (g) {
    case 'coal':
      for (const [x, y, r] of [[8, 16, 5], [16, 16, 5], [12, 10, 5]]) { circle(x, y, r, '#2b2b30'); circle(x - 1.5, y - 1.5, 1.6, '#5a5a62'); } break;
    case 'crude':
      rect(6, 4, 12, 18, '#2b2b30'); rect(6, 4, 12, 2, '#4a4a52'); rect(6, 11, 12, 1.5, '#4a4a52'); rect(6, 18, 12, 1.5, '#4a4a52');
      shape([[12, 8], [9.5, 13], [12, 15], [14.5, 13]], '#8a6a3a'); break;
    case 'gasoline': case 'diesel': {
      const col = g === 'gasoline' ? '#d94141' : '#3fa34d';
      shape([[5, 8], [10, 3], [19, 3], [19, 21], [5, 21]], col); rect(12, 5, 5, 3, shade(col, -0.3));
      rect(7, 11, 10, 6, '#f2f2f2'); rect(9, 13, 6, 2, col); rect(3, 4, 4, 2, '#8f959d'); break; }
    case 'cotton':
      rect(11, 12, 2, 10, '#6b8f3a'); for (const [x, y] of [[8, 9], [16, 9], [12, 5]]) { circle(x, y, 4, '#f4f2ea'); circle(x - 1, y - 1, 1.5, '#ffffff'); }
      shape([[9, 13], [12, 11], [15, 13], [12, 15]], '#5a7a2a'); break;
    case 'yarn':
      circle(8, 14, 6, '#d94f8a'); circle(16, 12, 6, '#3f6fd9');
      for (const [x, y, col] of [[8, 14, '#b03a6c'], [16, 12, '#2f55a8']]) { c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); c.arc(x, y, 3.5, 0, Math.PI * 1.5); c.stroke(); } break;
    case 'fabric':
      shape([[3, 7], [19, 4], [21, 17], [5, 20]], '#e8e2d4'); shape([[5, 20], [21, 17], [21, 20], [6, 22]], '#c9c0ae');
      for (let i = 0; i < 4; i++) { const t = i / 4 + 0.12; line2(3 + 2 * t, 7 + 13 * t, 19 + 2 * t, 4 + 13 * t); } break;
    case 'cloth':
      for (const [y, col] of [[15, '#8a6a4a'], [10, '#5a6f8a'], [5, '#a04a4a']]) { rect(3, y, 18, 5, col); rect(3, y, 18, 1, shade(col, 0.3)); } break;
    case 'shirts': {
      const [a, d] = cloth('#3fa34d');
      shape([[7, 4], [10, 4], [12, 6], [14, 4], [17, 4], [22, 9], [19, 12], [17, 10], [17, 21], [7, 21], [7, 10], [5, 12], [2, 9]], a);
      rect(7, 19, 10, 2, d); break; }
    case 'trousers':
      shape([[6, 3], [18, 3], [19, 22], [14, 22], [12, 9], [10, 22], [5, 22]], '#3f5fa8'); rect(6, 3, 12, 2, '#2f4a85'); break;
    case 'jackets':
      shape([[7, 3], [17, 3], [21, 8], [20, 22], [4, 22], [3, 8]], '#8a5a3a'); shape([[10, 3], [14, 3], [12, 12]], '#f2f5f8');
      rect(11.5, 12, 1, 10, '#5a3a22'); break;
    case 'shoes':
      shape([[3, 14], [10, 13], [14, 16], [21, 17], [21, 20], [3, 20]], '#6b4424'); rect(3, 19, 18, 2, '#2b2b33'); rect(5, 11, 5, 3, '#6b4424'); break;
    case 'coats':
      shape([[7, 2], [17, 2], [21, 7], [21, 23], [3, 23], [3, 7]], '#5a5a6b'); shape([[10, 2], [14, 2], [12, 9]], '#d9d2c2');
      for (const y of [11, 15, 19]) circle(13.5, y, 1, '#c9a46a'); break;
    case 'logs':
      for (const [y, x0] of [[15, 3], [9, 6]]) { rect(x0, y - 3, 14, 6, '#8a5a32'); ell(x0 + 14, y, 3, 3, '#d9b98a'); ell(x0 + 14, y, 1.2, 1.2, '#a8854f'); } break;
    case 'firewood':
      for (const [x, y] of [[4, 15], [11, 15], [7.5, 9]]) { ell(x + 4, y, 4, 3.5, '#d9b98a'); ell(x + 4, y, 1.5, 1.2, '#a8854f'); }
      shape([[13, 4], [16, 9], [11, 9]], '#e8a33a'); break;
    case 'planks':
      for (const y of [7, 12, 17]) { rect(3, y, 18, 4, woodL); rect(3, y + 3, 18, 1, '#c4a46c'); } break;
    case 'beams':
      rect(2, 9, 20, 6, wood); rect(2, 9, 20, 2, woodL); rect(6, 5, 4, 14, woodD); rect(14, 5, 4, 14, woodD); break;
    case 'panels':
      shape([[4, 6], [18, 3], [20, 18], [6, 21]], '#d9b98a'); shape([[4, 6], [18, 3], [18, 5], [4, 8]], '#f0d9a8');
      for (const t of [0.35, 0.65]) shape([[5 + 14 * t, 6 - 3 * t + 1], [6 + 14 * t, 6 - 3 * t + 1], [7 + 14 * t, 20 - 3 * t], [6 + 14 * t, 20 - 3 * t]], '#c4a46c'); break;
    case 'tables':
      rect(3, 8, 18, 3, wood); rect(4, 11, 2, 9, woodD); rect(18, 11, 2, 9, woodD); rect(3, 7, 18, 1, woodL); break;
    case 'chairs':
      rect(7, 3, 2, 17, woodD); rect(7, 3, 10, 2, wood); rect(7, 11, 11, 3, wood); rect(16, 14, 2, 6, woodD); rect(9, 14, 2, 6, woodD); break;
    case 'wardrobes':
      rect(5, 2, 14, 20, wood); rect(5, 2, 14, 2, woodL); line2(12, 4, 12, 22); circle(10.5, 12, 0.9, '#f2d14a'); circle(13.5, 12, 0.9, '#f2d14a'); break;
    case 'beds':
      rect(2, 12, 20, 5, wood); rect(2, 8, 3, 12, woodD); rect(19, 11, 3, 9, woodD); rect(5, 9, 6, 3, '#f2f5f8'); rect(5, 11, 14, 2, '#3f6fd9'); break;
    case 'kitchens':
      rect(2, 10, 20, 11, '#e8e8e8'); rect(2, 8, 20, 2, '#8a8f96'); rect(4, 12, 7, 8, woodL); rect(13, 12, 7, 8, woodL);
      rect(5, 3, 6, 5, '#9fd3e8'); circle(16, 5, 2, '#5c5c66'); break;
    case 'wheat':
      rect(11, 8, 2, 14, '#9c7a2a');
      for (const y of [5, 9, 13]) { ell(9, y, 2.2, 3.5, '#e0b84a', -0.5); ell(15, y, 2.2, 3.5, '#e0b84a', 0.5); }
      ell(12, 3.5, 2, 3, '#e0b84a'); break;
    case 'carrot':
      shape([[7, 8], [17, 8], [12, 22]], '#f08a24');
      shape([[9, 8], [8, 2], [12, 6], [16, 2], [15, 8]], '#4caf50'); break;
    case 'potato':
      ell(12, 13, 8, 6, '#b08850', 0.3); circle(9, 12, 1, '#7a5a30'); circle(14, 15, 1, '#7a5a30'); circle(15, 10, 1, '#7a5a30'); break;
    case 'corn':
      shape([[12, 2], [5, 20], [12, 17], [19, 20]], '#5dae3a'); ell(12, 11, 4, 8, '#f2d14a');
      for (const y of [6, 9, 12, 15]) rect(9, y, 6, 1, '#d9a62a'); break;
    case 'tomato':
      circle(12, 14, 8, '#d94141'); circle(9, 11, 2, '#f07070');
      shape([[12, 5], [8, 8], [12, 7], [16, 8]], '#4caf50'); break;
    case 'cabbage':
      circle(12, 13, 9, '#6fbf4a'); circle(12, 13, 6, '#9be07a'); circle(12, 13, 3, '#c8f0b0'); break;
    case 'flour': sack('#efe6d2', '#e0b84a'); break;
    case 'cornFlour': sack('#f2d97a', '#e8a33a'); break;
    case 'chips':
      shape([[5, 4], [19, 4], [18, 21], [6, 21]], '#d94141'); ell(12, 12, 5, 4, '#f2d14a'); rect(5, 4, 14, 2, '#a83030'); break;
    case 'carrotPack':
      rect(4, 7, 16, 13, '#3f6fd9'); rect(4, 7, 16, 3, '#2f55b0'); shape([[8, 12], [16, 12], [12, 19]], '#f08a24'); break;
    case 'sauce':
      rect(7, 5, 10, 3, '#e8e8e8'); shape([[6, 8], [18, 8], [18, 21], [6, 21]], '#c83232'); rect(8, 12, 8, 5, '#f2f5f8');
      circle(12, 14.5, 2, '#d94141'); break;
    case 'pasta':
      rect(4, 6, 16, 14, '#f2e3a0'); rect(4, 6, 16, 3, '#3f6fd9');
      c.strokeStyle = '#d9a62a'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(7, 14); c.bezierCurveTo(9, 11, 11, 17, 13, 14); c.bezierCurveTo(15, 11, 17, 17, 18, 14); c.stroke(); break;
    case 'bread':
      ell(12, 14, 9, 6, '#b8783a'); ell(12, 12.5, 8, 4.5, '#d9a05a');
      c.strokeStyle = '#8a5a2a'; c.lineWidth = 1;
      for (const x of [8, 12, 16]) { c.beginPath(); c.moveTo(x - 1, 10); c.lineTo(x + 1, 15); c.stroke(); } break;
    case 'biscuits':
      circle(9, 13, 6, '#d9a05a'); circle(15, 11, 6, '#e8b874');
      for (const [x, y] of [[13, 9], [16, 12], [17, 9], [8, 12], [10, 15]]) circle(x, y, 0.9, '#7a4a20'); break;
    case 'milk':
      rect(9, 3, 6, 3, '#3f6fd9'); shape([[8, 6], [16, 6], [17, 10], [17, 21], [7, 21], [7, 10]], '#f6f6f6');
      rect(7, 13, 10, 4, '#8fc6e8'); break;
    case 'eggs':
      ell(9, 14, 4.5, 6, '#f2e6d0'); ell(15.5, 13, 4.5, 6, '#fbf4e6'); break;
    case 'wool':
      circle(12, 13, 8, '#f4f1e8'); c.strokeStyle = '#c9c4b8'; c.lineWidth = 1;
      for (const r2 of [3, 5.5]) { c.beginPath(); c.arc(12, 13, r2, 0.3, 4.5); c.stroke(); } break;
    case 'cattle':
      ell(12, 13, 8, 7, '#f2f2f2'); ell(9, 11, 2.5, 2, '#2b2b33'); ell(15, 16, 2, 1.6, '#2b2b33');
      ell(12, 18, 4, 2.5, '#f0a0b0'); shape([[4, 7], [7, 5], [7, 9]], '#d9c3a0'); shape([[20, 7], [17, 5], [17, 9]], '#d9c3a0'); break;
    case 'poultry':
      ell(12, 14, 7, 6, '#f6f6f2'); circle(16, 8, 3.5, '#f6f6f2'); shape([[18, 5], [20, 7], [17, 6]], '#d94141');
      shape([[19, 8], [22, 9], [19, 10]], '#e8a33a'); rect(10, 19, 1, 3, '#e8a33a'); rect(14, 19, 1, 3, '#e8a33a'); break;
    case 'pigs':
      circle(12, 13, 8, '#f0a0b0'); ell(12, 15, 3.5, 2.5, '#e8899a'); circle(11, 15, 0.8, '#a05060'); circle(13, 15, 0.8, '#a05060');
      shape([[5, 6], [8, 4], [9, 8]], '#e8899a'); shape([[19, 6], [16, 4], [15, 8]], '#e8899a'); break;
    case 'cheese':
      shape([[3, 16], [19, 9], [21, 18], [5, 21]], '#f2d14a'); shape([[3, 16], [19, 9], [17, 7]], '#f8e27a');
      circle(10, 17, 1.5, '#d9a62a'); circle(16, 16, 1.2, '#d9a62a'); break;
    case 'butter':
      rect(4, 9, 16, 10, '#f8e8a0'); rect(4, 9, 16, 3, '#fff4c8'); rect(4, 15, 16, 4, '#3f6fd9'); break;
    case 'yogurt':
      shape([[6, 7], [18, 7], [16, 21], [8, 21]], '#f6f6f6'); rect(6, 5, 12, 3, '#e8889a'); rect(8, 12, 8, 4, '#e8889a'); break;
    case 'freshMeat':
      ell(12, 13, 9, 6.5, '#c83232', -0.3); ell(12, 13, 6, 4, '#e05050', -0.3); ell(8, 15, 2.5, 2, '#f4e4d4'); break;
    case 'sausages':
      for (const [x, y] of [[8, 9], [14, 12], [9, 16]]) { ell(x, y, 5.5, 2.5, '#b05a3a', 0.4); ell(x - 1, y - 1, 3, 1, '#d07a5a', 0.4); } break;
    case 'ham':
      shape([[5, 8], [17, 5], [21, 13], [12, 21], [5, 16]], '#e8899a'); shape([[14, 7], [17, 5], [21, 13], [18, 14]], '#f4e4d4');
      rect(17, 16, 5, 2, '#f4e4d4'); break;
    case 'packedMeat':
      rect(3, 8, 18, 12, '#f2f5f8'); rect(5, 10, 14, 8, '#d94141'); ell(12, 14, 4, 2.5, '#e86a6a'); rect(3, 8, 18, 2, '#9fd3e8'); break;
    case 'cakes':
      shape([[4, 12], [20, 12], [20, 20], [4, 20]], '#f5d0d8'); rect(4, 15, 16, 2, '#e8889a');
      shape([[4, 12], [20, 12], [17, 8], [7, 8]], '#fff4f6'); circle(12, 7, 2.2, '#d94141'); break;
  }
}

// ---------- Descrizioni (nel sottomenu, prima di scegliere) ----------
// Testo scritto a mano + la catena di montaggio presa dai dati: ricette, cosa produce, cosa vende, dove manda
function goodList(m) { return Object.entries(m).map(([g, n]) => (n > 1 ? n + ' ' : '') + GOODS[g].name.toLowerCase()).join(' + '); }
function chainLines(id) {
  const out = [];
  if (RECIPES[id]) out.push(...RECIPES[id].map(r => goodList(r.in) + ' → ' + GOODS[r.out].name.toLowerCase()));
  if (NATURE[id]) out.push(TR('Produce: {list} (ogni {n} s)', { list: goodList(NATURE[id].out), n: NATURE[id].every }));
  if (id === 'livestock') for (const A of Object.values(LIVESTOCK)) out.push(A.animal + ': ' + TR('{list} (ogni {n} s)', { list: goodList(A.out), n: A.every }));
  if (POWER[id]) out.push(TR('Energia: {n}', { n: POWER[id].out }) + (POWER[id].perLevel ? ' ' + TR('(+{a} per livello di quota, fino a {b})', { a: POWER[id].perLevel, b: POWER[id].max }) : '') +
    (POWER[id].fuel ? ', ' + TR('brucia 1 {g} ogni {n} s', { g: GOODS[POWER[id].fuel].name.toLowerCase(), n: POWER[id].burn }) : ''));
  if (COUNTER[id]) out.push(TR('Vende al banco: {list} (abitanti entro {r} tile)', { list: Object.keys(GOODS).filter(g => GOODS[g].cat === COUNTER[id].cat).map(g => GOODS[g].name.toLowerCase()).join(', '), r: COUNTER[id].radius }));
  if (SHOPS[id]) out.push(TR('Vende:') + ' ' + Object.keys(GOODS).filter(g => shopOf(g) === id).map(g => GOODS[g].name.toLowerCase()).join(', '));
  if (DEST_KINDS[id]) out.push(TR('Manda la merce a:') + ' ' + DEST_KINDS[id].map(k => BUILDINGS[k].name.toLowerCase()).join(', '));
  if (JOBS[id]) out.push(TR('Lavoratori: {n}', { n: JOBS[id] }));
  return out;
}
function showToolDesc(id) {
  const box = document.getElementById('subdesc');
  if (!box) return;
  box.textContent = '';
  const t = document.createElement('b');
  t.textContent = TOOL_INFO[id].label + (TOOL_INFO[id].cost ? ' - ' + TOOL_INFO[id].cost + ' €' : '');
  const d = document.createElement('div');
  d.textContent = TOOL_INFO[id].desc || '';
  box.append(t, d);
  for (const l of chainLines(id)) { const li = document.createElement('div'); li.className = 'chain'; li.textContent = l; box.appendChild(li); }
}

// ---------- Icone: disegnate con le stesse funzioni del gioco ----------
function makeIcon(draw) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 48;
  const c = cv.getContext('2d');
  draw(c);
  return cv.toDataURL();
}

// un tile visto da vicino: scala s, centrato in basso
function tileIcon(drawTop, scale) {
  return makeIcon(c => {
    const s = scale || 1.4;   // la casa usa una scala più piccola: con 1.4 il tetto usciva in alto ed era tagliato
    c.setTransform(s, 0, 0, s, 32, 46 - (TH + 4) * s);
    const P = (u, v) => iso(0, 0, u, v, 0);
    const W = P(0, 1), S = P(1, 1), E = P(1, 0), down = p => [p[0], p[1] + 4];
    poly(c, [W, S, down(S), down(W)], COLORS[T.GRASS][1]);   // pareti del blocchetto
    poly(c, [S, E, down(E), down(S)], COLORS[T.GRASS][2]);
    drawTop(c, P);
  });
}

function bigIcon(drawBuilding, ground) {
  return makeIcon(c => {
    const s = 0.85;
    c.setTransform(s, 0, 0, s, 32, 46 - 2 * TH * s);
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const P = (a, b) => iso(0, 0, u + a, v + b, 0);
      poly(c, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], ground);
    }
    drawBuilding(c);
  });
}

function buildIcons() {
  for (const g of Object.keys(GOODS)) {
    const cv = document.createElement('canvas');
    cv.width = 24; cv.height = 24;
    drawGoodIcon(cv.getContext('2d'), g);
    GOOD_ICONS[g] = cv.toDataURL();
  }
  const diamond = (c, P, color) => poly(c, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], color);
  const straight = [false, true, false, true];
  ICONS.road = tileIcon((c, P) => { diamond(c, P, ROAD_COLOR); drawRoad(c, P, straight, 3, 7, true); });
  ICONS.oneway = tileIcon((c, P) => { diamond(c, P, ROAD_COLOR); drawOneway(c, P, straight, 1, 3, 7, true); });
  ICONS.highway = tileIcon((c, P) => { diamond(c, P, HW_COLORS[0]); drawHighway(c, P, straight, 3, 7, true); });
  ICONS.bridge = tileIcon((c, P) => {
    diamond(c, P, COLORS[T.WATER][0]);
    const fake = { d: 1, e: [0.6, 0.6] };
    drawBridgeSpan(c, 0, 0, fake, 1);
  });
  ICONS.hwBridge = tileIcon((c, P) => {
    diamond(c, P, COLORS[T.WATER][0]);
    drawBridgeSpan(c, 0, 0, { d: 1, e: [0.6, 0.6], path: 'highway' }, 1);
  });
  // tunnel: collina rocciosa nella metà dietro, bocca ad arco sul fianco davanti, strada che ci entra
  ICONS.tunnel = tileIcon((c, P) => {
    diamond(c, P, COLORS[T.GRASS][0]);
    const V = 0.5, H = 15;                                   // fianco della collina (v = V), alta H pixel
    const R = (u, v) => iso(0, 0, u, v, 0);
    poly(c, [R(0.3, V), R(0.7, V), R(0.7, 1), R(0.3, 1)], ROAD_COLOR);           // strada davanti alla bocca
    line(c, R(0.5, V + 0.08), R(0.5, 0.95), LANE_COLOR);
    box(c, 0, 0, 0, 0, 0, 1, V, H, { l: COLORS[T.ROCK][1], r: COLORS[T.ROCK][2], t: COLORS[T.GRASS][0] });
    const at = (u, z) => iso(0, 0, u, V, z / STEP);           // punto sul fianco: u lungo il fianco, z in pixel
    const arch = (u0, u1, zs, zt) => {
      const pts = [at(u0, 0)];
      for (let k = 0; k <= 10; k++) { const u = u0 + (u1 - u0) * k / 10; pts.push(at(u, zs + (zt - zs) * Math.sin(Math.PI * k / 10))); }
      pts.push(at(u1, 0));
      return pts;
    };
    poly(c, arch(0.22, 0.78, 7, 12), '#c9c4ba');              // cornice di pietra
    poly(c, arch(0.3, 0.7, 5.5, 9.5), '#16161c');             // galleria buia
    for (const [u, v] of [[0.15, 0.15], [0.7, 0.25]]) {       // due cespugli sulla collina
      const [x, y] = iso(0, 0, u, v, H / STEP);
      c.fillStyle = '#3f8f3a'; c.beginPath(); c.arc(x, y - 1.5, 2.2, 0, Math.PI * 2); c.fill();
    }
  });
  ICONS.dirt = tileIcon((c, P) => { diamond(c, P, DIRT_COLORS[0]); drawDirt(c, P, straight, 3, 7, true); });
  ICONS.rail = tileIcon((c, P) => { diamond(c, P, COLORS[T.GRASS][0]); drawRail(c, P, straight); });
  ICONS.field = tileIcon((c, P) => { diamond(c, P, SOIL); drawField(c, P, 'wheat', 3); });
  ICONS.house = tileIcon((c, P) => { diamond(c, P, COLORS[T.GRASS][0]); drawHouse(c, 0, 0, 0, 0, 0); }, 1.15);
  ICONS.farm = bigIcon(c => drawFarm(c, 0, 0, 0, 0), GROUND.farm);
  ICONS.warehouse = bigIcon(c => drawWarehouse(c, 0, 0, 0, 0), GROUND.warehouse);
  ICONS.factory = bigIcon(c => drawFactory(c, 0, 0, 0, 0), GROUND.factory);
  ICONS.supermarket = bigIcon(c => drawSupermarket(c, 0, 0, 0, 0), GROUND.supermarket);
  ICONS.dairy = bigIcon(c => drawDairy(c, 0, 0, 0, 0), GROUND.dairy);
  ICONS.slaughterhouse = bigIcon(c => drawSlaughterhouse(c, 0, 0, 0, 0), GROUND.slaughterhouse);
  ICONS.livestock = bigIcon(c => drawLivestock(c, 0, 0, 0, 0, 'cowFarm'), GROUND.cowFarm);
  ICONS.forestry = bigIcon(c => drawForestry(c, 0, 0, 0, 0), GROUND.forestry);
  ICONS.sawmill = bigIcon(c => drawSawmill(c, 0, 0, 0, 0), GROUND.sawmill);
  ICONS.furnitureFactory = bigIcon(c => drawFurnitureFactory(c, 0, 0, 0, 0), GROUND.furnitureFactory);
  ICONS.furnitureStore = bigIcon(c => drawFurnitureStore(c, 0, 0, 0, 0), GROUND.furnitureStore);
  ICONS.goodsWarehouse = bigIcon(c => drawWarehouse(c, 0, 0, 0, 0, true), GROUND.goodsWarehouse);
  ICONS.textileMill = bigIcon(c => drawTextileMill(c, 0, 0, 0, 0), GROUND.textileMill);
  ICONS.clothingFactory = bigIcon(c => drawClothingFactory(c, 0, 0, 0, 0), GROUND.clothingFactory);
  ICONS.clothingStore = bigIcon(c => drawClothingStore(c, 0, 0, 0, 0), GROUND.clothingStore);
  ICONS.charcoalKiln = tileIcon((c, P) => { diamond(c, P, GROUND.charcoalKiln); drawCharcoalKiln(c, 0, 0, 0, 0); });
  ICONS.oilWell = tileIcon((c, P) => { diamond(c, P, GROUND.oilWell); drawOilWell(c, 0, 0, 0, 0); });
  ICONS.gasStation = tileIcon((c, P) => { diamond(c, P, GROUND.gasStation); drawGasStation(c, 0, 0, 0, 0); });
  ICONS.coalPlant = bigIcon(c => drawCoalPlant(c, 0, 0, 0, 0), GROUND.coalPlant);
  ICONS.pylon = tileIcon((c, P) => { diamond(c, P, COLORS[T.GRASS][0]); drawPylon(c, 0, 0, 0, true); }, 0.85);
  ICONS.pole = tileIcon((c, P) => { diamond(c, P, COLORS[T.GRASS][0]); drawPole(c, 0, 0, 0, true); }, 0.7);
  ICONS.waterWell = tileIcon((c, P) => { diamond(c, P, COLORS[T.GRASS][0]); drawWaterWell(c, 0, 0, 0, 0); }, 1.1);
  ICONS.sewage = bigIcon(c => drawSewage(c, 0, 0, 0, 0, 1), '#9a9a92');
  ICONS.pipe = tileIcon((c, P) => { diamond(c, P, COLORS[T.GRASS][0]); const m = P(0.5, 0.5); c.strokeStyle = '#4faaff'; c.lineWidth = 3; c.beginPath(); c.moveTo(...P(0, 0.5)); c.lineTo(...P(1, 0.5)); c.stroke(); c.fillStyle = '#4faaff'; c.beginPath(); c.arc(m[0], m[1], 2.5, 0, Math.PI * 2); c.fill(); });
  ICONS.busStop = tileIcon((c, P) => { diamond(c, P, COLORS[T.GRASS][0]); drawBusStop(c, 0, 0, 0, 0); }, 1.1);
  ICONS.waterPlant = bigIcon(c => drawWaterPlant(c, 0, 0, 0, 0), '#9a9a92');
  ICONS.busDepot = bigIcon(c => drawBusDepot(c, 0, 0, 0, 0), '#9a9a92');
  ICONS.substation = tileIcon((c, P) => { diamond(c, P, COLORS[T.GRASS][0]); drawSubstation(c, 0, 0, 0, 0); }, 1.3);
  ICONS.solarPlant = bigIcon(c => drawSolarPlant(c, 0, 0, 0, 0), GROUND.solarPlant);
  ICONS.windPlant = makeIcon(c => {   // più piccola: le torri sono alte
    const s = 0.52;
    c.setTransform(s, 0, 0, s, 32, 47 - 2 * TH * s);
    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const P = (a, b) => iso(0, 0, u + a, v + b, 0); poly(c, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], COLORS[T.GRASS][0]); }
    drawWindPlant(c, 0, 0, 0, 0);
  });
  ICONS.oilPlatform = bigIcon(c => drawOilPlatform(c, 0, 0, 0, 0), COLORS[T.WATER][0]);
  ICONS.port = bigIcon(c => drawPort(c, 0, 0, 0, 0), GROUND.port);
  ICONS.refinery = bigIcon(c => drawRefinery(c, 0, 0, 0, 0), GROUND.refinery);
  ICONS.bakery = tileIcon((c, P) => { diamond(c, P, COLORS[T.GRASS][0]); drawBakery(c, 0, 0, 0, 0); });

  // terreno: blocchetto con freccia su, freccia giù, oppure piano
  const terrainIcon = (hgt, mark) => tileIcon((c, P) => {
    const up = p => [p[0], p[1] - hgt];
    const W = P(0, 1), S = P(1, 1), E = P(1, 0);
    poly(c, [W, S, up(S), up(W)], COLORS[T.GRASS][1]);
    poly(c, [S, E, up(E), up(S)], COLORS[T.GRASS][2]);
    poly(c, [up(P(0, 0)), up(E), up(S), up(W)], COLORS[T.GRASS][0]);
    const m = up(P(0.5, 0.5));
    c.strokeStyle = '#ffffff'; c.fillStyle = '#ffffff'; c.lineWidth = 1.6;
    if (mark === 'up' || mark === 'down') {
      const dir = mark === 'up' ? -1 : 1;
      c.beginPath(); c.moveTo(m[0], m[1] - 5 * dir); c.lineTo(m[0], m[1] + 3 * dir); c.stroke();
      c.beginPath(); c.moveTo(m[0], m[1] + 6 * dir); c.lineTo(m[0] - 3.5, m[1] + 2 * dir); c.lineTo(m[0] + 3.5, m[1] + 2 * dir); c.closePath(); c.fill();
    } else {
      for (const o of [-1.8, 1.8]) { c.beginPath(); c.moveTo(m[0] - 5, m[1] + o); c.lineTo(m[0] + 5, m[1] + o); c.stroke(); }
    }
  });
  ICONS.raise = terrainIcon(7, 'up');
  ICONS.lower = terrainIcon(0, 'down');
  ICONS.level = terrainIcon(3, 'flat');

  // mano (per spostare la mappa)
  ICONS.hand = makeIcon(c => {
    const parts = [[19, 12, 5, 16], [25, 8, 5, 20], [31, 9, 5, 19], [37, 13, 5, 15], [19, 24, 23, 15], [13, 27, 8, 6]];
    c.fillStyle = '#6b3f22';
    for (const [x, y, w, h] of parts) c.fillRect(x - 1, y - 1, w + 2, h + 2);
    c.fillStyle = '#f1c27d';
    for (const [x, y, w, h] of parts) c.fillRect(x, y, w, h);
    c.fillStyle = '#d9a35f';
    c.fillRect(20, 35, 21, 3);
  });

  // ruspa (per demolire)
  ICONS.demolish = makeIcon(c => {
    c.fillStyle = '#3a3a3a'; c.fillRect(13, 31, 34, 9);          // cingoli
    c.fillStyle = '#8a8f96';
    for (const x of [16, 23, 30, 37, 43]) c.fillRect(x, 34, 3, 3);
    c.fillStyle = '#f2c230'; c.fillRect(17, 20, 28, 11);         // corpo
    c.fillStyle = '#c99a17'; c.fillRect(17, 28, 28, 3);
    c.fillStyle = '#f2c230'; c.fillRect(28, 9, 13, 11);          // cabina
    c.fillStyle = '#9fd3e8'; c.fillRect(30, 11, 9, 6);
    c.fillStyle = '#8a8f96'; c.fillRect(6, 19, 6, 19);           // lama
    c.fillStyle = '#6b7077'; c.fillRect(11, 24, 7, 3);
  });
}

// ---------- Barra strumenti ----------
function toolLabel(id) {
  const i = TOOL_INFO[id];
  return i.cost ? i.label + ' - ' + money(i.cost) : i.label;
}

function groupOf(tool, prefer) {
  const g = prefer && TOOL_GROUPS.find(gr => gr.id === prefer);
  return g && g.tools.includes(tool) ? g : TOOL_GROUPS.find(gr => gr.tools.includes(tool));
}

// Quando uno sprite finisce di caricarsi, rifà l'icona che lo usa
function onSpritesLoaded(name) {
  if (name !== 'house' || !ICONS.house) return;
  ICONS.house = tileIcon((c, P) => { poly(c, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], COLORS[T.GRASS][0]); drawHouse(c, 0, 0, 0, 0, 0); }, 1.15);
  const img = document.querySelector('#group-homes img');
  if (img) img.src = ICONS.house;
}

function buildToolbar() {
  buildIcons();
  const bar = document.getElementById('toolbar');
  for (const g of TOOL_GROUPS) {
    groupChoice[g.id] = g.tools[0];
    const b = document.createElement('button');
    b.className = 'tool';
    b.id = 'group-' + g.id;
    b.title = g.tools.map(toolLabel).join('\n');
    b.innerHTML = '<span class="num">' + g.key + '</span><img alt=""><span class="lbl' + (g.label.length > 10 ? ' long' : '') + '">' + g.label + '</span>' +
      (g.tools.length > 1 ? '<span class="more">▲</span>' : '');
    b.querySelector('img').src = ICONS[g.tools[0]];
    b.addEventListener('click', () => {
      b.blur();
      const open = document.getElementById('submenu').dataset.group;
      const id = firstFree(g, groupChoice[g.id]);
      if (id) setTool(id);
      if (!id && g.tools.length === 1) { openProgress(unlockFor(g.tools[0]).id); return; }
      if (g.tools.length > 1 && open !== g.id) openSubmenu(g); else closeSubmenu();
    });
    bar.appendChild(b);
  }
  setTool('hand');
}

function openSubmenu(g) {
  const sm = document.getElementById('submenu');
  sm.textContent = '';
  sm.dataset.group = g.id;
  const desc = document.createElement('div');
  desc.id = 'subdesc';
  sm.appendChild(desc);
  for (const id of g.tools) {
    const b = document.createElement('button');
    b.className = 'sub' + (game.tool === id ? ' active' : '');
    b.dataset.tool = id;
    const img = document.createElement('img');
    img.src = ICONS[id]; img.alt = '';
    const lbl = document.createElement('span');
    lbl.textContent = TOOL_INFO[id].label;
    const cost = document.createElement('small');
    cost.textContent = TOOL_INFO[id].cost ? money(TOOL_INFO[id].cost) : '';
    b.append(img, lbl, cost);
    markLockedSub(b, id);
    b.addEventListener('click', () => {
      closeSubmenu();
      if (toolLocked(id)) openProgress(unlockFor(id).id);   // bloccato: si apre la finestra per sbloccarlo
      else setTool(id, g.id);
    });
    b.addEventListener('mouseenter', () => showToolDesc(id));
    sm.appendChild(b);
  }
  showToolDesc(g.tools.includes(game.tool) ? game.tool : g.tools[0]);
  sm.addEventListener('mouseleave', () => showToolDesc(g.tools.includes(game.tool) ? game.tool : g.tools[0]));
  // sopra il pulsante del gruppo
  const gb = document.getElementById('group-' + g.id).getBoundingClientRect();
  sm.hidden = false;
  const w = sm.offsetWidth;
  sm.style.left = Math.max(8, Math.min(innerWidth - w - 8, gb.left + gb.width / 2 - w / 2)) + 'px';
}

function closeSubmenu() {
  const sm = document.getElementById('submenu');
  sm.hidden = true;
  delete sm.dataset.group;
}

// Tasto numerico: sceglie il gruppo; se è già scelto passa allo strumento successivo del gruppo
function selectGroupByKey(key) {
  const g = TOOL_GROUPS.find(gr => gr.key === key);
  if (!g) return false;
  let id = firstFree(g, groupChoice[g.id]);
  if (g.tools.includes(game.tool) && g.tools.length > 1) {   // il prossimo strumento sbloccato del gruppo
    const i = g.tools.indexOf(game.tool);
    for (let k = 1; k <= g.tools.length; k++) { const t = g.tools[(i + k) % g.tools.length]; if (!toolLocked(t)) { id = t; break; } }
  }
  if (id) setTool(id);
  if (g.tools.length > 1) openSubmenu(g); else closeSubmenu();
  return true;
}

// Strumento del gruppo da scegliere: quello indicato se è sbloccato, altrimenti il primo sbloccato
function firstFree(g, id) { return !toolLocked(id) ? id : g.tools.find(t => !toolLocked(t)) || null; }

function setTool(id, groupId) {
  if (id !== 'field' && game.fieldMode && typeof exitFieldMode === 'function') exitFieldMode(true);
  game.tool = id;
  const g = groupOf(id, groupId);   // il campo non è in nessun gruppo: si usa solo dalla fattoria
  if (g) groupChoice[g.id] = id;
  for (const gr of TOOL_GROUPS) {
    const b = document.getElementById('group-' + gr.id);
    if (!b) continue;
    b.classList.toggle('active', !!g && gr.id === g.id);
    b.querySelector('img').src = ICONS[groupChoice[gr.id]];
  }
  for (const b of document.querySelectorAll('#submenu .sub')) b.classList.toggle('active', b.dataset.tool === id);
  const rotatable = !!BUILDINGS[id] || id === 'oneway' || id === 'tunnel';
  if (typeof bridgeStart !== 'undefined' && !isBridgeTool(id)) bridgeStart = null;
  game.bridgePlan = null;
  if (id === 'oneway') game.pathDir = rotationDir();
  const hint = id === 'oneway' ? '  |  ' + TR('trascina nel senso di marcia, R: gira la freccia')
    : isBridgeTool(id) ? '  |  ' + TR("trascina (o clicca) da una sponda all'altra")
    : id === 'tunnel' ? '  |  ' + TR('clicca ai piedi della collina (R: direzione)') : rotatable ? '  |  ' + TR('R: ruota') : '';
  const tn = document.getElementById('toolname');
  tn.textContent = toolLabel(id) + hint;
  const pm = document.createElement('span'); pm.id = 'planmsg'; tn.appendChild(pm);
  document.getElementById('rotate-btn').hidden = !rotatable;
  canvas.style.cursor = id === 'hand' ? 'grab' : 'crosshair';
  requestDraw();
}

// ---------- Contatori e informazioni ----------
// Barra in alto: fondi, abitanti, disoccupati (abitano qui ma non lavorano), case, industrie
function updateHud() {
  document.getElementById('money').textContent = money(game.money);
  document.getElementById('population').textContent = game.population;
  document.getElementById('unemployed').textContent = Math.max(0, game.population - (game.employed || 0));
  document.getElementById('houses').textContent = game.houses;
  document.getElementById('industries').textContent = game.industries;
  if (typeof progressLive === 'function') progressLive();
}

// Ruota i prossimi edifici di 90°
// Messaggio accanto al nome dello strumento: perché il ponte o il tunnel non si può fare
function setPlanMsg(plan) {
  const el = document.getElementById('planmsg');
  if (el) el.style.color = plan && plan.ok ? '#a7f070' : '#ff9b6b';
  if (el) el.textContent = plan && !plan.ok && plan.msg ? plan.msg : plan && plan.ok ? TR('Costo: {m}', { m: money(plan.cost) }) : '';
}

// Direzione del senso unico quando si clicca senza trascinare (cambia con R)
function rotationDir() { return [1, 2, 3, 0][game.rotation & 3]; }

function rotateTool() {
  game.rotation = (game.rotation + 1) % 4;
  game.pathDir = rotationDir();
  if (game.tool === 'tunnel' && game.hover) game.bridgePlan = planTunnel(game.hover, rotationDir());
  requestDraw();
}

function updateInfo() {
  const el = document.getElementById('info');
  if (!el) return; // la riga di informazioni sul tile non è più nella barra in alto
  const h = game.hover;
  if (!h) { el.textContent = '-'; return; }
  const t = game.map[h.y][h.x];
  let s = h.x + ',' + h.y + ' - ' + TERRAIN_NAMES[t.type] + ' ' + TR('(quota {n})', { n: t.elev });
  if (t.path) s += ' - ' + (t.main ? TR('Strada principale') : t.rb ? TR('Rotonda') : PATHS[t.path].name);
  if (t.field) s += ' - ' + TR('Campo');
  if (t.building) {
    const b = t.building;
    s += ' - ' + buildingName(b);
    if (b.kind === 'house') s += ' (' + b.residents + '/' + HOUSE_CAPACITY + ')';
  }
  el.textContent = s;
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}
