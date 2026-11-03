// ---------- Impostazioni generali del gioco ----------
const TW = 32, TH = 16;   // dimensioni del rombo di un tile
const STEP = 8;           // altezza in pixel di un livello di quota
const MAP_SIZES = [       // grandezze tra cui scegliere quando si crea una mappa
  { size: 128, name: 'Piccola' },
  { size: 256, name: 'Media' },
  { size: 512, name: 'Grande' },
  { size: 1024, name: 'Enorme' },
];
const ZOOMS = [0.5, 1, 2, 3, 4];

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
const BRIDGE = { costPerTile: 40, clearPath: 2, speed: 1 };
// Tunnel: dritti, dentro colline e montagne; l'uscita si vede in anteprima prima di costruire
const TUNNEL = { costPerTile: 80 };

// ---------- Edifici (w x h = tile occupati) ----------
const BUILDINGS = {
  house:     { name: 'Casa', w: 1, h: 1, cost: 100, height: 22, group: 'homes' },
  farm:      { name: 'Fattoria', w: 2, h: 2, cost: 500, height: 34, group: 'industry', grass: true },
  cowFarm:   { name: 'Allevamento di mucche', w: 2, h: 2, cost: 700, height: 22, group: 'industry', grass: true },
  chickenFarm: { name: 'Allevamento di polli', w: 2, h: 2, cost: 450, height: 18, group: 'industry', grass: true },
  pigFarm:   { name: 'Allevamento di maiali', w: 2, h: 2, cost: 550, height: 18, group: 'industry', grass: true },
  sheepFarm: { name: 'Allevamento di pecore', w: 2, h: 2, cost: 500, height: 18, group: 'industry' },
  warehouse: { name: 'Magazzino alimenti', w: 2, h: 2, cost: 400, height: 20, group: 'industry' },
  factory:   { name: 'Fabbrica alimentare', w: 2, h: 2, cost: 1500, height: 40, group: 'industry' },
  bakery:    { name: 'Panificio', w: 1, h: 1, cost: 400, height: 18, group: 'industry' },
  dairy:     { name: 'Caseificio', w: 2, h: 2, cost: 1200, height: 26, group: 'industry' },
  slaughterhouse: { name: 'Macello e industria della carne', w: 2, h: 2, cost: 1400, height: 24, group: 'industry' },
  supermarket: { name: 'Supermercato', w: 2, h: 2, cost: 1200, height: 20, group: 'industry' },
  // settore forestale e del legno
  forestry:  { name: 'Azienda forestale', w: 2, h: 2, cost: 800, height: 20, group: 'wood' },
  sawmill:   { name: 'Segheria', w: 2, h: 2, cost: 1300, height: 24, group: 'wood' },
  furnitureFactory: { name: 'Fabbrica di mobili', w: 2, h: 2, cost: 1800, height: 28, group: 'wood' },
  furnitureStore: { name: "Mercato dell'arredamento", w: 2, h: 2, cost: 1500, height: 22, group: 'wood' },
};

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
};
const FARM = {
  fieldRadius: 6,     // i campi devono stare entro questa distanza (in tile) dalla fattoria
  inventoryCap: 100,  // inventario massimo della fattoria
  cycleSec: 120,      // secondi dalla semina al raccolto (con tutto il personale)
  yieldPerField: 4,   // unità raccolte per ogni campo
  vanCapacity: 25,    // quanto porta il furgone in un viaggio
  vanMinLoad: 10,     // il furgone parte quando c'è almeno questo
};
const WAREHOUSE_CAPACITY = 1000;

// ---------- Merci ----------
// cat: raw = dai campi, food = dalla fabbrica, bakery = dal panificio...
// price = prezzo di vendita (le merci senza prezzo non si vendono); shop = negozio dove si
// vendono (se manca: supermercato)
const GOODS = {
  wheat:      { name: 'Grano', cat: 'raw' },
  carrot:     { name: 'Carote', cat: 'raw', price: 2 },        // le verdure si vendono anche fresche
  potato:     { name: 'Patate', cat: 'raw', price: 2 },
  corn:       { name: 'Mais', cat: 'raw', price: 2 },
  tomato:     { name: 'Pomodori', cat: 'raw', price: 3 },
  cabbage:    { name: 'Cavoli', cat: 'raw', price: 3 },
  milk:       { name: 'Latte', cat: 'animal', price: 3 },
  eggs:       { name: 'Uova', cat: 'animal', price: 3 },
  wool:       { name: 'Lana', cat: 'animal' },
  cattle:     { name: 'Bovini', cat: 'animal' },              // animali per il macello
  poultry:    { name: 'Polli', cat: 'animal' },
  pigs:       { name: 'Maiali', cat: 'animal' },
  flour:      { name: 'Farina', cat: 'food', price: 4 },
  chips:      { name: 'Patatine confezionate', cat: 'food', price: 6 },
  carrotPack: { name: 'Carote confezionate', cat: 'food', price: 5 },
  sauce:      { name: 'Salsa di pomodoro', cat: 'food', price: 6 },
  cornFlour:  { name: 'Farina di mais', cat: 'food', price: 4 },
  pasta:      { name: 'Pasta', cat: 'food', price: 8 },
  bread:      { name: 'Pane', cat: 'bakery', price: 5 },
  biscuits:   { name: 'Biscotti', cat: 'bakery', price: 7 },
  cakes:      { name: 'Torte', cat: 'bakery', price: 12 },
  cheese:     { name: 'Formaggio', cat: 'dairy', price: 9 },
  butter:     { name: 'Burro', cat: 'dairy', price: 7 },
  yogurt:     { name: 'Yogurt', cat: 'dairy', price: 5 },
  freshMeat:  { name: 'Carne fresca', cat: 'meat', price: 10 },
  sausages:   { name: 'Salsicce', cat: 'meat', price: 8 },
  ham:        { name: 'Prosciutto', cat: 'meat', price: 12 },
  packedMeat: { name: 'Carne confezionata', cat: 'meat', price: 9 },
  logs:       { name: 'Tronchi', cat: 'wood' },
  firewood:   { name: 'Legna da ardere', cat: 'wood', price: 3 },
  planks:     { name: 'Assi di legno', cat: 'lumber', price: 6, shop: 'furnitureStore' },
  beams:      { name: 'Travature', cat: 'lumber', price: 7, shop: 'furnitureStore' },
  panels:     { name: 'Pannelli di legno', cat: 'lumber', price: 8, shop: 'furnitureStore' },
  tables:     { name: 'Tavoli', cat: 'furniture', price: 30, shop: 'furnitureStore' },
  chairs:     { name: 'Sedie', cat: 'furniture', price: 15, shop: 'furnitureStore' },
  wardrobes:  { name: 'Armadi', cat: 'furniture', price: 45, shop: 'furnitureStore' },
  beds:       { name: 'Letti', cat: 'furniture', price: 50, shop: 'furnitureStore' },
  kitchens:   { name: 'Mobili da cucina', cat: 'furniture', price: 80, shop: 'furnitureStore' },
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
  slaughterhouse: [
    { in: { cattle: 1 }, out: 'freshMeat' },
    { in: { pigs: 1 }, out: 'sausages' },
    { in: { pigs: 1 }, out: 'ham' },
    { in: { poultry: 1 }, out: 'packedMeat' },
  ],
};
const PRODUCE_TICK = { factory: 4, bakery: 5, dairy: 5, slaughterhouse: 6, sawmill: 5, furnitureFactory: 8 };   // secondi per ciclo con tutto il personale

// Allevamenti: ogni "every" secondi (con tutto il personale) producono queste merci
const LIVESTOCK = {
  cowFarm:     { animal: 'Mucche', every: 40, out: { milk: 6, cattle: 2 } },
  chickenFarm: { animal: 'Polli', every: 30, out: { eggs: 8, poultry: 3 } },
  pigFarm:     { animal: 'Maiali', every: 40, out: { pigs: 4 } },
  sheepFarm:   { animal: 'Pecore', every: 45, out: { wool: 6 } },
};
// Azienda forestale: taglia nei boschi vicini (gli alberi ricrescono, il bosco resta).
// Lavora a pieno ritmo con almeno "trees" tile di bosco entro "radius" tile.
const FORESTRY = { forestry: { every: 40, out: { logs: 6, firewood: 3 }, trees: 12, radius: 5 } };
const NATURE = Object.assign({}, LIVESTOCK, FORESTRY);   // chi produce dalla natura (animali, boschi)

// Capienze: input = materie prime in attesa, store = merce pronta (o in deposito)
const CAPS = {
  farm: { store: 100 },
  warehouse: { store: WAREHOUSE_CAPACITY },
  factory: { input: 100, store: 60 },
  bakery: { input: 40, store: 40 },
  dairy: { input: 80, store: 50 },
  slaughterhouse: { input: 60, store: 50 },
  cowFarm: { store: 80 }, chickenFarm: { store: 80 }, pigFarm: { store: 80 }, sheepFarm: { store: 80 },
  supermarket: { store: 200 },
  forestry: { store: 80 }, sawmill: { input: 80, store: 50 }, furnitureFactory: { input: 80, store: 40 },
  furnitureStore: { store: 150 },
};
// Dove può mandare la merce ogni attività (se ne possono scegliere più di una:
// ogni merce va alla prima destinazione che la accetta)
const ANIMAL_DESTS = ['warehouse', 'dairy', 'slaughterhouse', 'supermarket'];
const DEST_KINDS = {
  warehouse: ['warehouse', 'factory', 'bakery', 'dairy', 'slaughterhouse', 'supermarket', 'sawmill', 'furnitureFactory', 'furnitureStore'],
  forestry: ['warehouse', 'sawmill', 'supermarket'],
  sawmill: ['warehouse', 'furnitureFactory', 'furnitureStore'],
  furnitureFactory: ['warehouse', 'furnitureStore'],
  farm: ['warehouse', 'factory', 'supermarket'],
  factory: ['warehouse', 'supermarket', 'bakery'],
  bakery: ['warehouse', 'supermarket'],
  dairy: ['warehouse', 'supermarket'],
  slaughterhouse: ['warehouse', 'supermarket'],
  cowFarm: ANIMAL_DESTS, chickenFarm: ANIMAL_DESTS, pigFarm: ANIMAL_DESTS, sheepFarm: ANIMAL_DESTS,
};

// ---------- Supermercato e tasse ----------
// Negozi: ogni "tick" secondi una parte (buyRate) degli abitanti entro "radius" compra qualcosa
const SHOPS = {
  supermarket: { tick: 10, radius: 25, buyRate: 0.25 },
  furnitureStore: { tick: 20, radius: 30, buyRate: 0.06 },   // i mobili si comprano di rado
};
const SHOP = SHOPS.supermarket;
const TAX_RATE = 0.3;                                 // tasse sulle vendite che vanno al giocatore

// ---------- Lavoro ----------
// Persone che servono per far funzionare un'attività; lavorano lì gli abitanti delle case
// entro JOB_RADIUS tile
const JOBS = { farm: 4, warehouse: 2, factory: 6, bakery: 2, supermarket: 3,
  cowFarm: 3, chickenFarm: 2, pigFarm: 2, sheepFarm: 2, dairy: 5, slaughterhouse: 5,
  forestry: 3, sawmill: 4, furnitureFactory: 5, furnitureStore: 3 };
const JOB_RADIUS = 12;

// ---------- Modellare il terreno ----------
const MAX_ELEV = 14;

// ---------- Economia (valori provvisori) ----------
const START_MONEY = 50000;
const COSTS = {
  field: 5,
  demolishPath: 5,
  demolishBuilding: 20,
  demolishField: 1,
  clearForest: 2,
  terrain: 15,        // per ogni livello alzato o abbassato
};
