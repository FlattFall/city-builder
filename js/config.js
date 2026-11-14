// ---------- Impostazioni generali del gioco ----------
const TW = 32, TH = 16;   // dimensioni del rombo di un tile
const STEP = 8;           // altezza in pixel di un livello di quota
const MAP_SIZES = [       // grandezze tra cui scegliere quando si crea una mappa
  { size: 128, name: 'Piccola', desc: 'Per iniziare: si gioca in fretta', preview: 14 },
  { size: 256, name: 'Media', desc: 'Equilibrata: spazio per tutte le industrie', preview: 20 },
  { size: 512, name: 'Grande', desc: 'Tanto spazio per grandi città', preview: 28 },
  { size: 1024, name: 'Enorme', desc: 'Gigantesca: serve un computer potente', preview: 38 },
];
const ZOOMS = [0.5, 1, 2, 3, 4, 6];   // l'ultimo (6) aggiunto su richiesta dell'utente: uno zoom ancora più vicino

// ---------- Terreno ----------
const T = { WATER: 0, SAND: 1, GRASS: 2, FOREST: 3, ROCK: 4, SNOW: 5 };
const TERRAIN_NAMES = ['Acqua', 'Sabbia', 'Erba', 'Foresta', 'Roccia', 'Neve'];
const COLORS = {
  [T.WATER]:  ['#2f6fb3', '#265b96', '#1f4a7c'],
  [T.SAND]:   ['#e8d28a', '#c9b06b', '#a8904f'],
  [T.GRASS]:  ['#5aa845', '#478a38', '#386f2d'],
  [T.FOREST]: ['#3f8f3a', '#327530', '#265c26'],
  [T.ROCK]:   ['#8a8478', '#6f695f', '#58534b'],
  [T.SNOW]:   ['#f2f5f8', '#c9d2dc', '#a5b0bd'],
};
// [superficie, parete sinistra, parete destra]

// ---------- Percorsi (si trascinano per costruirne tanti) ----------
// net = rete: le strade (asfalto e terra) si collegano tra loro, i binari solo con i binari
// speed = quanto vanno veloci le auto (1 = normale); oneway = senso unico (direzione t.dir)
const PATHS = {
  road: { name: 'Strada', net: 'road', cost: 10, speed: 1 },
  oneway: { name: 'Strada a senso unico', net: 'road', cost: 12, speed: 1, oneway: true },
  highway: { name: 'Autostrada', net: 'road', cost: 30, speed: 2.2 },
  dirt: { name: 'Strada di terra', net: 'road', cost: 4, speed: 0.7 },
  rail: { name: 'Binari', net: 'rail', cost: 15 },
};
// Ponti: si trascinano da una sponda all'altra (dritti, lunghi quanto si vuole).
// Salgono di un livello per tile dalle teste del ponte; sotto devono restare almeno
// clear livelli liberi (clearPath se sotto c'è una strada o un binario).
const BRIDGE = { costPerTile: 40, hwCostPerTile: 70, clearPath: 2, speed: 1 };   // ponte autostrada: più caro, velocità dell'autostrada
// Tunnel: dritti, dentro colline e montagne; l'uscita si vede in anteprima prima di costruire
const TUNNEL = { costPerTile: 80 };

// ---------- Edifici (w x h = tile occupati) ----------
const BUILDINGS = {
  house:     { name: 'Casa', w: 1, h: 1, cost: 100, height: 22, group: 'homes' },
  farm:      { name: 'Fattoria', w: 2, h: 2, cost: 500, height: 34, group: 'industry', grass: true, jobRadius: 22 },   // i contadini possono abitare più lontano (richiesta dell'utente)
  livestock: { name: 'Allevamento', w: 2, h: 2, cost: 600, height: 22, group: 'industry' },   // l'animale si sceglie nel pannello
  warehouse: { name: 'Magazzino alimenti', w: 2, h: 2, cost: 400, height: 20, group: 'industry' },
  factory:   { name: 'Fabbrica alimentare', w: 2, h: 2, cost: 1500, height: 40, group: 'industry' },
  bakery:    { name: 'Panificio', w: 1, h: 1, cost: 400, height: 18, group: 'industry' },
  dairy:     { name: 'Caseificio', w: 2, h: 2, cost: 1200, height: 26, group: 'industry' },
  slaughterhouse: { name: 'Macello e industria della carne', w: 2, h: 2, cost: 1400, height: 24, group: 'industry' },
  supermarket: { name: 'Supermercato', w: 2, h: 2, cost: 1200, height: 20, group: 'industry', wide: true },   // wide: strada su tutte e due le caselle davanti
  // settore forestale e del legno
  forestry:  { name: 'Azienda forestale', w: 2, h: 2, cost: 800, height: 20, group: 'wood' },
  sawmill:   { name: 'Segheria', w: 2, h: 2, cost: 1300, height: 24, group: 'wood' },
  furnitureFactory: { name: 'Fabbrica di mobili', w: 2, h: 2, cost: 1800, height: 28, group: 'wood' },
  furnitureStore: { name: "Mercato dell'arredamento", w: 2, h: 2, cost: 1500, height: 22, group: 'wood' },
  goodsWarehouse: { name: 'Magazzino merci', w: 2, h: 2, cost: 400, height: 20, group: 'wood' },   // tutto quello che non è cibo
  // settore tessile
  textileMill: { name: 'Fabbrica tessile', w: 2, h: 2, cost: 1600, height: 30, group: 'textile' },
  clothingFactory: { name: 'Fabbrica di abbigliamento', w: 2, h: 2, cost: 1700, height: 24, group: 'textile' },
  clothingStore: { name: 'Negozio di abbigliamento', w: 2, h: 2, cost: 1300, height: 20, group: 'textile' },
  // settore energia e petrolio
  // rete elettrica (gruppo Energia): tralicci e sottostazioni, senza lavoratori né strada (infra: non contano tra le industrie)
  pylon:      { name: 'Traliccio', w: 1, h: 1, cost: 80, height: 46, group: 'power', infra: true, anyWater: true },   // anche sull'acqua
  pole:       { name: 'Palo della luce', w: 1, h: 1, cost: 20, height: 24, group: 'power', infra: true },          // palo di legno: bassa tensione
  substation: { name: 'Sottostazione elettrica', w: 1, h: 1, cost: 900, height: 20, group: 'power', infra: true },   // vuole la strada, ma niente lavoratori (va da sola)
  charcoalKiln: { name: 'Carbonaia', w: 1, h: 1, cost: 600, height: 16, group: 'energy' },
  coalPlant:  { name: 'Centrale a carbone', w: 2, h: 2, cost: 4000, height: 44, group: 'energy' },
  solarPlant: { name: 'Centrale solare', w: 2, h: 2, cost: 5000, height: 10, group: 'energy' },
  windPlant:  { name: 'Centrale eolica', w: 2, h: 2, cost: 4500, height: 60, group: 'energy', anySide: true },   // strada da qualsiasi lato
  oilWell:    { name: 'Pozzo petrolifero', w: 1, h: 1, cost: 1500, height: 26, group: 'energy', oil: true },
  oilPlatform: { name: 'Piattaforma petrolifera', w: 2, h: 2, cost: 6000, height: 52, group: 'energy', oil: true, water: true },   // sull'acqua
  port:       { name: 'Porto', w: 2, h: 2, cost: 3500, height: 30, group: 'energy', coast: true },   // il retro sull'acqua
  refinery:   { name: 'Raffineria di petrolio', w: 2, h: 2, cost: 6000, height: 44, group: 'energy' },
  gasStation: { name: 'Distributore di carburante', w: 1, h: 1, cost: 1200, height: 14, group: 'energy' },
  // acqua (richiesta dell'utente): tubi sotto tutte le strade; pozzo sulle falde, depuratore sul mare, scarico sull'acqua
  waterWell:  { name: "Pozzo dell'acqua", w: 1, h: 1, cost: 700, height: 18, group: 'water', groundwater: true },
  waterPlant: { name: "Depuratore dell'acqua di mare", w: 2, h: 2, cost: 12000, height: 22, group: 'water', coast: true },   // il retro sul mare
  sewage:     { name: 'Scarico delle acque sporche', w: 2, h: 2, cost: 800, height: 16, group: 'water', infra: true, coast: true },   // in riva al mare: il tubo scarica dal retro
  // bus (richiesta dell'utente): portano la gente a lavorare da una fermata all'altra
  busStop:    { name: 'Fermata del bus', w: 1, h: 1, cost: 150, height: 14, group: 'bus', infra: true },
  busDepot:   { name: 'Deposito dei bus', w: 2, h: 2, cost: 2500, height: 22, group: 'bus' },
};
// Acqua: consumo per abitante e per attività; quanto dà una fonte con tutto il personale; quanto
// porta via uno scarico. Senza acqua le case si riempiono solo a metà e le attività lavorano più piano.
const WATER = { required: true, perResident: 1, perBusiness: 3, well: 100, plant: 1500, sewage: 600, dryHouse: 2, drySpeed: 0.6 };
// Bus: dalle case vicine a una fermata (entro `walk` tile) si va a lavorare nelle attività vicine a
// un'altra fermata dello stesso deposito, a qualsiasi distanza; con il bus i lavoratori arrivano
// riposati e puntuali: le attività servite lavorano `boost` più in fretta.
const BUS = { walk: 6, boost: 0.15, every: 25, perDepot: 2, speed: 1.3,
  stopTime: 2.2, maxWait: 5, maxOff: 5 };   // sosta alla fermata (s), quanti aspettano al massimo, quanti scendono al massimo

// ---------- Abitanti ----------
const HOUSE_CAPACITY = 4;      // abitanti per casa
const MOVE_IN_EVERY = 1.2;     // secondi tra l'arrivo di un'auto e la successiva
const MAX_CARS = 40;           // auto in giro al massimo (per le prestazioni)
const CAR_SPEED = 1.8;         // tile al secondo
const VAN_SPEED = 1.4;

// ---------- Agricoltura ----------
const CROPS = {
  wheat:   { name: 'Grano',    ripe: '#d9b44a', young: '#9cc94a' },
  carrot:  { name: 'Carote',   ripe: '#f08a24', young: '#5dae3a' },
  potato:  { name: 'Patate',   ripe: '#7a9a3a', young: '#5dae3a' },
  corn:    { name: 'Mais',     ripe: '#e8c84a', young: '#6fbf3a' },
  tomato:  { name: 'Pomodori', ripe: '#d94141', young: '#5dae3a' },
  cabbage: { name: 'Cavoli',   ripe: '#8fd16a', young: '#5dae3a' },
  cotton:  { name: 'Cotone',   ripe: '#f4f2ea', young: '#6fbf3a' },   // non si mangia: va alla fabbrica tessile
};
const FARM = {
  fieldRadius: 6,     // i campi devono stare entro questa distanza (in tile) dalla fattoria
  inventoryCap: 100,  // inventario massimo della fattoria
  cycleSec: 240,      // secondi dalla semina al raccolto (con tutto il personale; prima 120: il supermercato si riempiva troppo in fretta)
  yieldPerField: 1,   // unità raccolte per ogni campo (prima 4: con il deposito pieno 12 campi rendevano quasi come 170)
  vanCapacity: 25,    // quanto porta il furgone in un viaggio
  vanMinLoad: 10,     // il furgone parte quando c'è almeno questo
};
const WAREHOUSE_CAPACITY = 1000;

// ---------- Merci ----------
// cat: raw = dai campi, food = dalla fabbrica, bakery = dal panificio...
// price = prezzo di vendita (le merci senza prezzo non si vendono); shop = negozio dove si
// vendono (se manca: supermercato)
// Prezzi (richiesta dell'utente: lavorare una merce deve rendere di più che venderla così com'è):
// ogni prodotto vale almeno 1,5 volte (di solito 2) le sue materie prime; le tasse sono il 50% del
// prezzo e i prezzi sono pari, così "ti dà" è un numero intero. value = quanto vale una merce che
// non si vende (serve solo per fare questi conti; il test lo controlla).
const GOODS = {
  wheat:      { name: 'Grano', cat: 'raw', value: 2 },
  carrot:     { name: 'Carote', cat: 'raw', price: 2 },        // le verdure si vendono anche fresche
  potato:     { name: 'Patate', cat: 'raw', price: 2 },
  corn:       { name: 'Mais', cat: 'raw', price: 2 },
  tomato:     { name: 'Pomodori', cat: 'raw', price: 4 },
  cabbage:    { name: 'Cavoli', cat: 'raw', price: 4 },
  milk:       { name: 'Latte', cat: 'animal', price: 4 },
  eggs:       { name: 'Uova', cat: 'animal', price: 4 },
  wool:       { name: 'Lana', cat: 'fiber', value: 3 },
  cotton:     { name: 'Cotone', cat: 'fiber', value: 2 },
  cattle:     { name: 'Bovini', cat: 'animal', value: 8 },              // animali per il macello
  poultry:    { name: 'Polli', cat: 'animal', value: 4 },
  pigs:       { name: 'Maiali', cat: 'animal', value: 6 },
  flour:      { name: 'Farina', cat: 'food', price: 6 },
  chips:      { name: 'Patatine confezionate', cat: 'food', price: 6 },
  carrotPack: { name: 'Carote confezionate', cat: 'food', price: 6 },
  sauce:      { name: 'Salsa di pomodoro', cat: 'food', price: 10 },
  cornFlour:  { name: 'Farina di mais', cat: 'food', price: 6 },
  pasta:      { name: 'Pasta', cat: 'food', price: 14 },
  bread:      { name: 'Pane', cat: 'bakery', price: 12 },
  biscuits:   { name: 'Biscotti', cat: 'bakery', price: 14 },
  cakes:      { name: 'Torte', cat: 'bakery', price: 28 },
  cheese:     { name: 'Formaggio', cat: 'dairy', price: 18 },
  butter:     { name: 'Burro', cat: 'dairy', price: 16 },
  yogurt:     { name: 'Yogurt', cat: 'dairy', price: 10 },
  freshMeat:  { name: 'Carne fresca', cat: 'meat', price: 18 },
  sausages:   { name: 'Salsicce', cat: 'meat', price: 14 },
  ham:        { name: 'Prosciutto', cat: 'meat', price: 16 },
  packedMeat: { name: 'Carne confezionata', cat: 'meat', price: 10 },
  logs:       { name: 'Tronchi', cat: 'wood', value: 2 },
  firewood:   { name: 'Legna da ardere', cat: 'wood', price: 4 },
  planks:     { name: 'Assi di legno', cat: 'lumber', price: 6, shop: 'furnitureStore' },
  beams:      { name: 'Travature', cat: 'lumber', price: 6, shop: 'furnitureStore' },
  panels:     { name: 'Pannelli di legno', cat: 'lumber', price: 10, shop: 'furnitureStore' },
  tables:     { name: 'Tavoli', cat: 'furniture', price: 30, shop: 'furnitureStore' },
  chairs:     { name: 'Sedie', cat: 'furniture', price: 16, shop: 'furnitureStore' },
  wardrobes:  { name: 'Armadi', cat: 'furniture', price: 56, shop: 'furnitureStore' },
  beds:       { name: 'Letti', cat: 'furniture', price: 50, shop: 'furnitureStore' },
  kitchens:   { name: 'Mobili da cucina', cat: 'furniture', price: 80, shop: 'furnitureStore' },
  yarn:       { name: 'Filati', cat: 'textile', value: 5 },
  fabric:     { name: 'Tessuto', cat: 'textile', value: 9 },
  cloth:      { name: 'Stoffe lavorate', cat: 'textile', value: 11 },   // cotone + lana: per i capi più pesanti
  shirts:     { name: 'Magliette', cat: 'clothing', price: 30, shop: 'clothingStore' },
  trousers:   { name: 'Pantaloni', cat: 'clothing', price: 38, shop: 'clothingStore' },
  jackets:    { name: 'Giacche', cat: 'clothing', price: 44, shop: 'clothingStore' },
  shoes:      { name: 'Scarpe', cat: 'clothing', price: 36, shop: 'clothingStore' },
  coats:      { name: 'Cappotti', cat: 'clothing', price: 56, shop: 'clothingStore' },
  coal:       { name: 'Carbone', cat: 'energy', value: 12 },                  // dalla carbonaia: per la centrale a carbone
  crude:      { name: 'Petrolio grezzo', cat: 'energy', value: 3 },          // da pozzi e piattaforme: per la raffineria
  gasoline:   { name: 'Benzina', cat: 'fuel', price: 14, shop: 'gasStation' },
  diesel:     { name: 'Gasolio', cat: 'fuel', price: 12, shop: 'gasStation' },
};
function shopOf(g) { return GOODS[g].price ? (GOODS[g].shop || 'supermarket') : null; }

// Ricette: in = materie prime consumate, out = prodotto (1 unità per ciclo)
const RECIPES = {
  factory: [
    { in: { wheat: 1 }, out: 'flour' },
    { in: { potato: 1 }, out: 'chips' },
    { in: { carrot: 1 }, out: 'carrotPack' },
    { in: { tomato: 1 }, out: 'sauce' },
    { in: { corn: 1 }, out: 'cornFlour' },
    { in: { wheat: 1, tomato: 1 }, out: 'pasta' },
  ],
  bakery: [
    { in: { flour: 1 }, out: 'bread' },
    { in: { flour: 1 }, out: 'biscuits' },
    { in: { flour: 2 }, out: 'cakes' },
  ],
  dairy: [
    { in: { milk: 2 }, out: 'cheese' },
    { in: { milk: 2 }, out: 'butter' },
    { in: { milk: 1 }, out: 'yogurt' },
  ],
  sawmill: [
    { in: { logs: 1 }, out: 'planks' },
    { in: { logs: 1 }, out: 'beams' },
    { in: { logs: 2 }, out: 'panels' },
  ],
  furnitureFactory: [
    { in: { planks: 2 }, out: 'tables' },
    { in: { planks: 1 }, out: 'chairs' },
    { in: { panels: 2, planks: 1 }, out: 'wardrobes' },
    { in: { planks: 2, panels: 1 }, out: 'beds' },
    { in: { panels: 3, planks: 1 }, out: 'kitchens' },
  ],
  textileMill: [
    { in: { cotton: 1 }, out: 'yarn' },
    { in: { cotton: 2 }, out: 'fabric' },
    { in: { cotton: 1, wool: 1 }, out: 'cloth' },
  ],
  clothingFactory: [
    { in: { fabric: 1, yarn: 1 }, out: 'shirts' },
    { in: { fabric: 2 }, out: 'trousers' },
    { in: { cloth: 1, fabric: 1 }, out: 'jackets' },
    { in: { cloth: 1, yarn: 1 }, out: 'shoes' },
    { in: { cloth: 2, yarn: 1 }, out: 'coats' },
  ],
  charcoalKiln: [   // la legna brucia piano sotto la terra e diventa carbone
    { in: { firewood: 2 }, out: 'coal' },   // solo la legna da ardere: i tronchi servono alla segheria
  ],
  refinery: [
    { in: { crude: 2 }, out: 'gasoline' },
    { in: { crude: 2 }, out: 'diesel' },
  ],
  slaughterhouse: [
    { in: { cattle: 1 }, out: 'freshMeat' },
    { in: { pigs: 1 }, out: 'sausages' },
    { in: { pigs: 1 }, out: 'ham' },
    { in: { poultry: 1 }, out: 'packedMeat' },
  ],
};
const PRODUCE_TICK = { factory: 4, bakery: 5, dairy: 5, slaughterhouse: 6, sawmill: 5, furnitureFactory: 8, textileMill: 5, clothingFactory: 7, charcoalKiln: 6, refinery: 6 };   // secondi per ciclo con tutto il personale

// Allevamenti: ogni "every" secondi (con tutto il personale) producono queste merci
// Un solo edificio "Allevamento": b.animal sceglie quale (le chiavi sono quelle dei vecchi
// allevamenti separati, così i salvataggi di prima si convertono). grass = vuole l'erba.
const LIVESTOCK = {
  cowFarm:     { animal: 'Mucche', every: 40, out: { milk: 6, cattle: 2 }, grass: true, icon: 'cattle' },
  chickenFarm: { animal: 'Polli', every: 30, out: { eggs: 8, poultry: 3 }, grass: true, icon: 'poultry' },
  pigFarm:     { animal: 'Maiali', every: 40, out: { pigs: 4 }, grass: true, icon: 'pigs' },
  sheepFarm:   { animal: 'Pecore', every: 45, out: { wool: 6 }, icon: 'wool' },
};
// Azienda forestale: taglia nei boschi vicini (gli alberi ricrescono, il bosco resta).
// Lavora a pieno ritmo con almeno "trees" tile di bosco entro "radius" tile.
const FORESTRY = { forestry: { every: 40, out: { logs: 6, firewood: 3 }, trees: 40, radius: 5 } };   // 100% con 40 tile di bosco nella zona, fino a 150% con di più
// Petrolio: pozzi a terra e piattaforme in mare, in proporzione al giacimento sotto (oilAt)
const OIL = { oilWell: { every: 30, out: { crude: 6 }, oil: true }, oilPlatform: { every: 30, out: { crude: 16 }, oil: true } };
const NATURE = Object.assign({}, FORESTRY, OIL);   // chi produce dalla natura (boschi; gli animali con natureOf)
// Cosa produce un edificio dalla natura: l'animale dell'allevamento o il bosco
function natureOf(b) { return b.kind === 'livestock' ? LIVESTOCK[b.animal] : NATURE[b.kind]; }

// Capienze: input = materie prime in attesa, store = merce pronta (o in deposito)
const CAPS = {
  farm: { store: 100 },
  warehouse: { store: WAREHOUSE_CAPACITY },
  factory: { input: 100, store: 60 },
  bakery: { input: 40, store: 40 },
  dairy: { input: 80, store: 50 },
  slaughterhouse: { input: 60, store: 50 },
  livestock: { store: 80 },
  supermarket: { store: 200 },
  forestry: { store: 80 }, sawmill: { input: 80, store: 50 }, furnitureFactory: { input: 80, store: 40 },
  furnitureStore: { store: 150 }, goodsWarehouse: { store: WAREHOUSE_CAPACITY },
  textileMill: { input: 80, store: 50 }, clothingFactory: { input: 80, store: 40 }, clothingStore: { store: 150 },
  charcoalKiln: { input: 40, store: 40 }, coalPlant: { input: 80 }, refinery: { input: 100, store: 60 },
  oilWell: { store: 60 }, oilPlatform: { store: 160 }, port: { store: 800 }, gasStation: { store: 120 },
};
// Centrali elettriche: out = energia prodotta (con tutto il personale). La centrale a carbone
// brucia 1 carbone ogni "burn" secondi; l'eolica rende di più in alto (perLevel per livello di quota).
const POWER = {
  coalPlant: { out: 80, fuel: 'coal', burn: 4 },
  solarPlant: { out: 30 },
  windPlant: { out: 16, perLevel: 4, max: 60 },
};
// Rete elettrica (una sola per tutta la mappa): consumo = abitanti + attività; le case pagano la
// bolletta, le attività con la corrente lavorano più in fretta (boost)
const GRID = { perResident: 1, perBusiness: 4, bill: 0.4, billEvery: 20, boost: 0.25 };
// Corrente (richiesta dell'utente): BASSA tensione nei cavi sotto tutte le strade e sui pali di legno
// (case, attività e centrali attaccate a una strada o vicino a un palo); ALTA tensione sui tralicci.
// La sottostazione (con lavoratori) collega le due. Un traliccio sul bordo della mappa porta fuori:
// la corrente che manca si compra (importPrice), quella in più si vende (exportPrice), ogni billEvery s.
const ELEC = { pylonRange: 7, linkRange: 3, poleRange: 5, poleReach: 2, importPrice: 0.3, exportPrice: 0.15, pylonSpacing: 5, poleSpacing: 4 };
// Due magazzini: alimenti (cibo e animali) e merci (legno, mobili, fibre, tessuti, vestiti)
const WAREHOUSE_CATS = {
  warehouse: ['raw', 'animal', 'food', 'bakery', 'dairy', 'meat'],
  goodsWarehouse: ['wood', 'lumber', 'furniture', 'fiber', 'textile', 'clothing', 'energy', 'fuel'],
  port: [...new Set(Object.values(GOODS).map(g => g.cat))],   // porto: magazzino marittimo, tutte le merci
};
// Dove può mandare la merce ogni attività (se ne possono scegliere più di una:
// ogni merce va alla prima destinazione che la accetta)
const ANIMAL_DESTS = ['warehouse', 'dairy', 'slaughterhouse', 'supermarket'];
const DEST_KINDS = {
  warehouse: ['warehouse', 'factory', 'bakery', 'dairy', 'slaughterhouse', 'supermarket'],
  goodsWarehouse: ['goodsWarehouse', 'sawmill', 'furnitureFactory', 'furnitureStore', 'textileMill', 'clothingFactory', 'clothingStore', 'supermarket',
    'charcoalKiln', 'coalPlant', 'refinery', 'gasStation'],
  forestry: ['goodsWarehouse', 'sawmill', 'charcoalKiln', 'supermarket'],
  charcoalKiln: ['coalPlant', 'goodsWarehouse', 'port'],
  oilWell: ['refinery', 'goodsWarehouse', 'port'],
  oilPlatform: ['port'],                               // dal mare solo in nave fino al porto
  port: ['refinery', 'coalPlant', 'goodsWarehouse', 'gasStation'],
  refinery: ['gasStation', 'goodsWarehouse', 'port'],
  sawmill: ['goodsWarehouse', 'furnitureFactory', 'furnitureStore'],
  furnitureFactory: ['goodsWarehouse', 'furnitureStore'],
  textileMill: ['goodsWarehouse', 'clothingFactory'],
  clothingFactory: ['goodsWarehouse', 'clothingStore'],
  farm: ['warehouse', 'goodsWarehouse', 'factory', 'textileMill', 'supermarket'],
  factory: ['warehouse', 'supermarket', 'bakery'],
  bakery: ['warehouse', 'supermarket'],
  dairy: ['warehouse', 'supermarket'],
  slaughterhouse: ['warehouse', 'supermarket'],
  // allevamento: dipende dall'animale (destKindsOf)
  cowFarm: ANIMAL_DESTS, chickenFarm: ANIMAL_DESTS, pigFarm: ANIMAL_DESTS, sheepFarm: ['goodsWarehouse', 'textileMill'],
};
// Il porto prende tutte le merci: tutti possono mandargliele, e lui le manda (in nave) agli altri
// porti o (in furgone) a magazzini, fabbriche e negozi
for (const list of Object.values(DEST_KINDS)) if (!list.includes('port')) list.push('port');
DEST_KINDS.port = [...new Set(['port', ...DEST_KINDS.warehouse, ...DEST_KINDS.goodsWarehouse, 'refinery', 'coalPlant', 'gasStation'])];

// ---------- Supermercato e tasse ----------
// Negozi: ogni "tick" secondi una parte (buyRate) degli abitanti entro "radius" compra qualcosa
function destKindsOf(b) { return DEST_KINDS[b.kind === 'livestock' ? b.animal : b.kind] || []; }

const SHOPS = {
  supermarket: { tick: 10, radius: 25, buyRate: 0.25 },
  furnitureStore: { tick: 20, radius: 30, buyRate: 0.06 },   // i mobili si comprano di rado
  clothingStore: { tick: 15, radius: 28, buyRate: 0.1 },
  gasStation: { tick: 15, radius: 30, buyRate: 0.08 },   // le auto degli abitanti fanno benzina
};
const SHOP = SHOPS.supermarket;
// Miglioramenti (richiesta dell'utente): fino a 3 per fattorie, allevamenti, aziende e fabbriche.
// speed[livello] = quanto più in fretta coltiva/produce/lavora; cost[livello] = parte del costo dell'edificio.
// Allevamento: a ogni miglioramento si vedono più animali (1 mucca all'inizio, 4 al massimo)
// Incidenti stradali (richiesta dell'utente: un po' di difficoltà, ma di rado): ogni `every` secondi
// c'è una probabilità `perVehicle` per ogni auto/furgone in strada (al massimo `maxChance`); i veicoli
// coinvolti restano fermi `stop` secondi (si forma la coda) e si paga tra `costMin` e `costMax`
const ACCIDENT = { every: 45, perVehicle: 0.006, maxChance: 0.3, stop: 12, costMin: 200, costMax: 600 };
const UPGRADE = { max: 3, speed: [1, 1.4, 1.8, 2.2], cost: [0.6, 1, 1.5] };
// Il panificio vende anche al banco (richiesta dell'utente): pane, biscotti e torte che fa lui,
// agli abitanti vicini, come un piccolo negozio (quello che avanza lo manda alle destinazioni)
const COUNTER = { bakery: { tick: 12, radius: 15, buyRate: 0.15, cat: 'bakery' } };
const TAX_RATE = 0.5;                                 // tasse sulle vendite che vanno al giocatore

// ---------- Lavoro ----------
// Persone che servono per far funzionare un'attività; lavorano lì gli abitanti delle case
// entro JOB_RADIUS tile
const JOBS = { farm: 4, warehouse: 2, factory: 6, bakery: 2, supermarket: 3,
  livestock: 3, dairy: 5, slaughterhouse: 5,
  forestry: 3, sawmill: 4, furnitureFactory: 5, furnitureStore: 3, goodsWarehouse: 2,
  textileMill: 5, clothingFactory: 5, clothingStore: 3,
  charcoalKiln: 2, coalPlant: 5, solarPlant: 1, windPlant: 1, oilWell: 2, port: 4, refinery: 6, gasStation: 2, waterWell: 1, waterPlant: 3, busDepot: 3 };
// la piattaforma petrolifera non prende lavoratori dalle case (il personale vive a bordo)
const JOB_RADIUS = 12;
function jobRadiusOf(kind) { return (BUILDINGS[kind] && BUILDINGS[kind].jobRadius) || JOB_RADIUS; }

// ---------- Modellare il terreno ----------
const MAX_ELEV = 14;

// ---------- Economia (valori provvisori) ----------
const START_MONEY = 50000;
const COSTS = {
  field: 5,
  pipe: 5,          // tubo dell'acqua (sotto terra) per collegare scarico, pozzi... alle strade
  demolishPath: 5,
  demolishBuilding: 20,
  demolishField: 1,
  clearForest: 2,
  terrain: 15,        // per ogni livello alzato o abbassato
};
