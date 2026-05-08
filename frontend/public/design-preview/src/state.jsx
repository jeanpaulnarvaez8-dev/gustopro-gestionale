// Stato globale del prototipo: tavoli, ordini, ticket KDS, alerts, eventi simulati.
// Esposto come window.useStore() / window.simEngine.

const { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } = React;

// ─── Modello dati ────────────────────────────────────────────────────────────

// Zone Riva Beach Salento (dal prompt)
const ZONES = [
  { id: 'sala',    name: 'Sala da Pranzo', icon: 'Utensils', accent:'#C9A96E', tint:'rgba(201,169,110,0.06)' },
  { id: 'veranda', name: 'Veranda',        icon: 'Coffee',   accent:'#D4AF37', tint:'rgba(212,175,55,0.06)' },
  { id: 'mare',    name: 'Mare',           icon: 'Waves',    accent:'#3E7A93', tint:'rgba(62,122,147,0.08)' },
  { id: 'nettuno', name: 'Nettuno',        icon: 'Sparkles', accent:'#5B9BB5', tint:'rgba(91,155,181,0.07)' },
  { id: 'bar',     name: 'BAR',            icon: 'Coffee',   accent:'#B85C3C', tint:'rgba(184,92,60,0.07)' },
  { id: 'chiosco', name: 'Chiosco Bar',    icon: 'Coffee',   accent:'#B85C3C', tint:'rgba(184,92,60,0.05)' },
  { id: 'vip1',    name: 'VIP 1',          icon: 'Sparkles', accent:'#D4AF37', tint:'rgba(212,175,55,0.10)' },
  { id: 'vip2',    name: 'VIP 2',          icon: 'Sparkles', accent:'#E8C76B', tint:'rgba(232,199,107,0.10)' },
];

// Stati tavolo: free / occupied / reserved / dirty / parked
const STATUS = {
  free:     { label: 'Libero',       color: '#22C55E', short: 'OK',  textKey: 'libero' },
  occupied: { label: 'Occupato',     color: '#EF4444', short: 'OCC', textKey: 'occupato' },
  reserved: { label: 'Riservato',    color: '#3B82F6', short: 'PRE', textKey: 'riservato' },
  dirty:    { label: 'Da pulire',    color: '#EAB308', short: 'DIR', textKey: 'da-pulire' },
  parked:   { label: 'Parcheggiato', color: '#A855F7', short: 'PRK', textKey: 'parcheggiato' },
};

// Layout tavoli su un canvas 1600x900 (viewBox SVG)
// Forme: circle / square / rect — coordinate plausibili per il Riva Beach
const TABLES_INIT = [
  // Sala da Pranzo (sx alto)
  { id: 'S1',  zone:'sala', x: 140, y: 130, w: 90,  h: 90,  shape:'circle', seats:4, status:'occupied', sinceMin:42, lastCourseMin:8,  waiter:'Marco',  ordersTotal:142.50 },
  { id: 'S2',  zone:'sala', x: 280, y: 130, w: 90,  h: 90,  shape:'circle', seats:4, status:'free' },
  { id: 'S3',  zone:'sala', x: 420, y: 130, w: 90,  h: 90,  shape:'circle', seats:4, status:'reserved', reservedFor:'Bianchi · 21:30' },
  { id: 'S4',  zone:'sala', x: 140, y: 260, w: 130, h: 80,  shape:'rect',   seats:6, status:'occupied', sinceMin:67, lastCourseMin:22, waiter:'Giulia', ordersTotal:284.00, alert:'late' },
  { id: 'S5',  zone:'sala', x: 320, y: 260, w: 130, h: 80,  shape:'rect',   seats:6, status:'dirty' },
  { id: 'S6',  zone:'sala', x: 500, y: 260, w: 90,  h: 90,  shape:'circle', seats:4, status:'occupied', sinceMin:18, lastCourseMin:3, waiter:'Marco', ordersTotal:64.00 },

  // Veranda (centro alto)
  { id: 'V1',  zone:'veranda', x: 700, y: 140, w: 80, h: 80, shape:'square', seats:2, status:'free' },
  { id: 'V2',  zone:'veranda', x: 810, y: 140, w: 80, h: 80, shape:'square', seats:2, status:'occupied', sinceMin:24, lastCourseMin:6, waiter:'Luca', ordersTotal:48.50 },
  { id: 'V3',  zone:'veranda', x: 920, y: 140, w: 80, h: 80, shape:'square', seats:2, status:'parked', waiter:'Luca' },
  { id: 'V4',  zone:'veranda', x: 700, y: 250, w: 80, h: 80, shape:'square', seats:2, status:'reserved', reservedFor:'Rossi · 22:00' },
  { id: 'V5',  zone:'veranda', x: 810, y: 250, w: 80, h: 80, shape:'square', seats:2, status:'free' },
  { id: 'V6',  zone:'veranda', x: 920, y: 250, w: 80, h: 80, shape:'square', seats:2, status:'occupied', sinceMin:55, lastCourseMin:11, waiter:'Giulia', ordersTotal:96.00 },

  // Mare (sx basso) - tavoli sulla spiaggia
  { id: 'M1',  zone:'mare', x: 140, y: 480, w: 90,  h: 90, shape:'circle', seats:4, status:'occupied', sinceMin:33, lastCourseMin:5, waiter:'Marco', ordersTotal:118.00 },
  { id: 'M2',  zone:'mare', x: 280, y: 480, w: 90,  h: 90, shape:'circle', seats:4, status:'occupied', sinceMin:71, lastCourseMin:28, waiter:'Marco', ordersTotal:198.00, alert:'mandatory' },
  { id: 'M3',  zone:'mare', x: 420, y: 480, w: 90,  h: 90, shape:'circle', seats:4, status:'free' },
  { id: 'M4',  zone:'mare', x: 140, y: 620, w: 130, h: 80, shape:'rect',   seats:8, status:'occupied', sinceMin:48, lastCourseMin:14, waiter:'Giulia', ordersTotal:312.50 },
  { id: 'M5',  zone:'mare', x: 320, y: 620, w: 130, h: 80, shape:'rect',   seats:8, status:'free' },

  // Nettuno (centro basso)
  { id: 'N1',  zone:'nettuno', x: 700, y: 480, w: 100, h: 100, shape:'circle', seats:6, status:'occupied', sinceMin:12, lastCourseMin:2, waiter:'Luca', ordersTotal:42.00 },
  { id: 'N2',  zone:'nettuno', x: 850, y: 480, w: 100, h: 100, shape:'circle', seats:6, status:'reserved', reservedFor:'Verdi · 21:00' },
  { id: 'N3',  zone:'nettuno', x: 700, y: 620, w: 250, h: 80, shape:'rect',   seats:12, status:'occupied', sinceMin:38, lastCourseMin:9, waiter:'Marco', ordersTotal:486.00 },

  // BAR (dx alto)
  { id: 'B1',  zone:'bar', x: 1100, y: 130, w: 70, h: 70, shape:'square', seats:2, status:'occupied', sinceMin:14, lastCourseMin:4, waiter:'Sara', ordersTotal:22.00 },
  { id: 'B2',  zone:'bar', x: 1190, y: 130, w: 70, h: 70, shape:'square', seats:2, status:'free' },
  { id: 'B3',  zone:'bar', x: 1280, y: 130, w: 70, h: 70, shape:'square', seats:2, status:'occupied', sinceMin:8, lastCourseMin:1, waiter:'Sara', ordersTotal:14.50 },
  { id: 'B4',  zone:'bar', x: 1370, y: 130, w: 70, h: 70, shape:'square', seats:2, status:'free' },

  // Chiosco Bar (dx alto-medio)
  { id: 'C1',  zone:'chiosco', x: 1100, y: 250, w: 70, h: 70, shape:'square', seats:2, status:'free' },
  { id: 'C2',  zone:'chiosco', x: 1190, y: 250, w: 70, h: 70, shape:'square', seats:2, status:'dirty' },
  { id: 'C3',  zone:'chiosco', x: 1280, y: 250, w: 70, h: 70, shape:'square', seats:2, status:'free' },
  { id: 'C4',  zone:'chiosco', x: 1370, y: 250, w: 70, h: 70, shape:'square', seats:2, status:'occupied', sinceMin:22, lastCourseMin:7, waiter:'Sara', ordersTotal:36.00 },

  // VIP 1 (dx basso)
  { id: 'P1',  zone:'vip1', x: 1100, y: 480, w: 200, h: 100, shape:'rect', seats:8, status:'occupied', sinceMin:88, lastCourseMin:18, waiter:'Giulia', ordersTotal:642.00 },

  // VIP 2 (dx basso)
  { id: 'P2',  zone:'vip2', x: 1100, y: 620, w: 200, h: 100, shape:'rect', seats:8, status:'reserved', reservedFor:'Caputo · 21:15' },
];

// Allergeni 14 UE
const ALLERGENS = ['GLU','LAT','UOV','PES','CRO','ARA','SOI','FRU','SED','SEN','SES','SOL','LUP','MOL'];

// Menu — categorie principali
const MENU_CATS = [
  { id:'antipasti', name:'Antipasti', icon:'Utensils' },
  { id:'primi',     name:'Primi',     icon:'ChefHat' },
  { id:'secondi',   name:'Secondi',   icon:'Flame' },
  { id:'pesce',     name:'Pesce',     icon:'Waves' },
  { id:'contorni',  name:'Contorni',  icon:'Sparkles' },
  { id:'dolci',     name:'Dolci',     icon:'Smile' },
  { id:'vini',      name:'Vini',      icon:'Coffee' },
  { id:'bibite',    name:'Bibite',    icon:'Coffee' },
];

const MENU = [
  { id:'i1', cat:'antipasti', name:'Crudo di Mare',          price:24.00, allergens:['PES','MOL','CRO'] },
  { id:'i2', cat:'antipasti', name:'Burrata e Pomodorini',   price:14.00, allergens:['LAT'] },
  { id:'i3', cat:'antipasti', name:'Polpo arrosto',          price:18.00, allergens:['MOL'] },
  { id:'i4', cat:'antipasti', name:'Fritturina di paranza',  price:16.00, allergens:['GLU','PES'] },

  { id:'i5', cat:'primi', name:'Spaghetti alle Vongole',     price:22.00, allergens:['GLU','MOL','SED'] },
  { id:'i6', cat:'primi', name:'Linguine Astice',            price:32.00, allergens:['GLU','CRO'] },
  { id:'i7', cat:'primi', name:'Risotto ai Frutti di Mare',  price:24.00, allergens:['LAT','MOL','CRO','PES'] },
  { id:'i8', cat:'primi', name:'Orecchiette Cime di Rapa',   price:14.00, allergens:['GLU'] },

  { id:'i9',  cat:'secondi', name:'Tagliata di Manzo',       price:28.00, allergens:[] },
  { id:'i10', cat:'secondi', name:'Pollo alla griglia',      price:18.00, allergens:[] },

  { id:'i11', cat:'pesce', name:'Branzino al sale',          price:0,     pricePerKg:65, byWeight:true, allergens:['PES'] },
  { id:'i12', cat:'pesce', name:'Orata in crosta',           price:0,     pricePerKg:55, byWeight:true, allergens:['PES'] },
  { id:'i13', cat:'pesce', name:'Spigola al forno',          price:0,     pricePerKg:60, byWeight:true, allergens:['PES'] },

  { id:'i14', cat:'contorni', name:'Patate al forno',        price:6.00,  allergens:[] },
  { id:'i15', cat:'contorni', name:'Insalata mista',         price:7.00,  allergens:[] },
  { id:'i16', cat:'contorni', name:'Verdure grigliate',      price:8.00,  allergens:[] },

  { id:'i17', cat:'dolci', name:'Tiramisù della Casa',       price:8.00,  allergens:['GLU','LAT','UOV'] },
  { id:'i18', cat:'dolci', name:'Pasticciotto Salentino',    price:6.00,  allergens:['GLU','LAT','UOV'] },
  { id:'i19', cat:'dolci', name:'Sorbetto Limone',           price:6.00,  allergens:[] },

  { id:'i20', cat:'vini', name:'Negroamaro Riserva (cl 75)', price:32.00, allergens:['SOL'] },
  { id:'i21', cat:'vini', name:'Primitivo di Manduria (cl 75)', price:38.00, allergens:['SOL'] },
  { id:'i22', cat:'vini', name:'Calice Bianco Salento',      price:6.00,  allergens:['SOL'] },

  { id:'i23', cat:'bibite', name:'Acqua Naturale 1L',        price:3.00,  allergens:[] },
  { id:'i24', cat:'bibite', name:'Acqua Frizzante 1L',       price:3.00,  allergens:[] },
  { id:'i25', cat:'bibite', name:'Coca-Cola',                price:4.00,  allergens:[] },
  { id:'i26', cat:'bibite', name:'Birra Raffo 33cl',         price:5.00,  allergens:['GLU'] },
];

// Ticket KDS iniziali (scenario stress)
const TICKETS_INIT = [
  { id:'T-401', table:'S4', zone:'sala',    seats:6, waiter:'Giulia', ageMin:22, kind:'cibo', items:[
    { id:1, name:'Spaghetti alle Vongole',  qty:2, status:'cooking', allergens:['GLU','MOL','SED'], mods:['senza aglio'] },
    { id:2, name:'Risotto ai Frutti di Mare',qty:1, status:'cooking', allergens:['LAT','MOL','CRO','PES'], mods:[] },
    { id:3, name:'Orecchiette Cime di Rapa',qty:3, status:'ready',   allergens:['GLU'], mods:[] },
  ]},
  { id:'T-402', table:'M2', zone:'mare',    seats:4, waiter:'Marco',  ageMin:28, kind:'cibo', items:[
    { id:1, name:'Linguine Astice',        qty:2, status:'cooking', allergens:['GLU','CRO'], mods:['allergia ARACHIDI'], allergyAlert:true },
    { id:2, name:'Branzino al sale (1.2kg)', qty:1, status:'cooking', allergens:['PES'], mods:[] },
  ]},
  { id:'T-403', table:'V2', zone:'veranda', seats:2, waiter:'Luca',   ageMin:6, kind:'cibo', items:[
    { id:1, name:'Burrata e Pomodorini',   qty:2, status:'ready',   allergens:['LAT'], mods:[] },
    { id:2, name:'Tagliata di Manzo',      qty:2, status:'cooking', allergens:[], mods:['ben cotta','senza rosmarino'] },
  ]},
  { id:'T-404', table:'N3', zone:'nettuno', seats:12, waiter:'Marco', ageMin:9, kind:'cibo', items:[
    { id:1, name:'Crudo di Mare',          qty:4, status:'cooking', allergens:['PES','MOL','CRO'], mods:[] },
    { id:2, name:'Polpo arrosto',          qty:3, status:'cooking', allergens:['MOL'], mods:[] },
    { id:3, name:'Fritturina di paranza',  qty:2, status:'cooking', allergens:['GLU','PES'], mods:[] },
  ]},
  { id:'T-405', table:'P1', zone:'vip1',   seats:8, waiter:'Giulia', ageMin:14, kind:'cibo', items:[
    { id:1, name:'Spigola al forno (2.4kg)', qty:1, status:'cooking', allergens:['PES'], mods:[] },
    { id:2, name:'Verdure grigliate',      qty:4, status:'ready',   allergens:[], mods:[] },
  ]},
];

// Carrello iniziale per il tavolo S4 (quello che apriamo nella OrderPage)
const CART_S4 = {
  tableId:'S4', covers:6, waiter:'Giulia', openedMin:67,
  items:[
    { id:101, menuId:'i5', name:'Spaghetti alle Vongole', qty:2, price:22, status:'P', mods:['senza aglio'], allergens:['GLU','MOL','SED'] },
    { id:102, menuId:'i7', name:'Risotto ai Frutti di Mare', qty:1, price:24, status:'P', mods:[], allergens:['LAT','MOL','CRO','PES'] },
    { id:103, menuId:'i8', name:'Orecchiette Cime di Rapa', qty:3, price:14, status:'C', mods:[], allergens:['GLU'] },
    { id:104, menuId:'i20', name:'Negroamaro Riserva', qty:1, price:32, status:'C', mods:[], allergens:['SOL'] },
    { id:105, menuId:'i23', name:'Acqua Naturale 1L', qty:2, price:3, status:'C', mods:[], allergens:[] },
  ],
};

// Toast/alerts iniziali
const ALERTS_INIT = [
  { id:'a1', kind:'service-alert', text:'Tavolo S4 · primi non rilasciati da 22 min', tableId:'S4', t: Date.now()-12000 },
  { id:'a2', kind:'mandatory-course-alert', text:'Tavolo M2 · pasta non rilasciata in cucina, urgente', tableId:'M2', t: Date.now()-3000 },
];

// ─── Store ──────────────────────────────────────────────────────────────────

function makeStore(){
  let state = {
    user: { name:'Giulia', role:'waiter', pin:true, avatar:'GR' },
    tenant: { slug:'rivabeach', name:'Riva Beach Salento' },
    online: true,
    syncQueue: 0,
    activeZone: 'all',
    tables: TABLES_INIT,
    tickets: TICKETS_INIT,
    cart: CART_S4,
    alerts: ALERTS_INIT,
    selectedTableId: null,
    sheetOpen: false,
    page: 'tables', // tables | order | kds | checkout | login
    undoStack: [], // azioni recenti reversibili
  };
  const subs = new Set();
  const get = () => state;
  const set = (patch) => {
    state = typeof patch==='function' ? patch(state) : { ...state, ...patch };
    subs.forEach(fn => fn(state));
  };
  const sub = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  return { get, set, sub };
}

const store = makeStore();
window.store = store;

function useStore(selector = (s)=>s){
  const [v, setV] = useState(() => selector(store.get()));
  useEffect(() => store.sub((s) => setV(selector(s))), []);
  return v;
}
window.useStore = useStore;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatMin(min){
  if (min == null) return '—';
  const m = Math.max(0, Math.floor(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m/60);
  return `${h}h ${m%60}m`;
}
function formatEur(n){ return '€ ' + n.toFixed(2).replace('.', ','); }

// Colore timer cibo: 0-15 verde, 15-20 giallo, >20 rosso
function ticketTimerColor(min, kind='cibo'){
  if (kind === 'bevande'){
    if (min < 5) return 'var(--ok)';
    if (min < 10) return 'var(--warn)';
    return 'var(--err)';
  }
  if (min < 15) return 'var(--ok)';
  if (min < 20) return 'var(--warn)';
  return 'var(--err)';
}

// Push undo e auto-clear dopo 10s
function pushUndo(label, undoFn){
  const id = 'u-' + Date.now() + Math.random().toString(36).slice(2,6);
  store.set(s => ({ ...s, undoStack:[...s.undoStack, { id, label, undoFn, t:Date.now() }] }));
  setTimeout(() => {
    store.set(s => ({ ...s, undoStack: s.undoStack.filter(u => u.id !== id) }));
  }, 10000);
}

// Cambia stato tavolo con event simulato + undo
function setTableStatus(tableId, newStatus, extra={}){
  const prev = store.get().tables.find(t => t.id === tableId);
  store.set(s => ({
    ...s,
    tables: s.tables.map(t => t.id === tableId
      ? { ...t, status:newStatus, ...extra,
          ...(newStatus==='free' ? { sinceMin:undefined,lastCourseMin:undefined,waiter:undefined,ordersTotal:undefined,alert:undefined,reservedFor:undefined } : {}) }
      : t)
  }));
  pushUndo(`Stato ${tableId} → ${STATUS[newStatus]?.label}`, () => {
    store.set(s => ({ ...s, tables: s.tables.map(t => t.id === tableId ? prev : t) }));
  });
}

window.helpers = { formatMin, formatEur, ticketTimerColor, pushUndo, setTableStatus, ZONES, STATUS, ALLERGENS, MENU_CATS, MENU };

// ─── Sim engine: timer scorrono, eventi finti Socket.io ─────────────────────

function simEngine(){
  // Tick 1s: avanza i tempi
  setInterval(() => {
    store.set(s => ({
      ...s,
      tables: s.tables.map(t => t.status === 'occupied'
        ? { ...t, sinceMin:(t.sinceMin||0) + 1/60, lastCourseMin:(t.lastCourseMin||0) + 1/60 }
        : t),
      tickets: s.tickets.map(tk => ({ ...tk, ageMin: tk.ageMin + 1/60 })),
    }));
  }, 1000);

  // Auto-cleanup alerts dopo 30s
  setInterval(() => {
    const now = Date.now();
    store.set(s => ({ ...s, alerts: s.alerts.filter(a => a.kind === 'mandatory-course-alert' || (now - a.t) < 30000) }));
  }, 1000);

  // Evento finto: nuovo ticket ogni ~45s in modo "vivo"
  setInterval(() => {
    const id = 'T-' + (400 + Math.floor(Math.random()*300));
    const tablesOcc = store.get().tables.filter(t => t.status === 'occupied');
    if (!tablesOcc.length) return;
    const tab = tablesOcc[Math.floor(Math.random()*tablesOcc.length)];
    const newTicket = {
      id, table:tab.id, zone:tab.zone, seats:tab.seats, waiter:tab.waiter || 'Marco',
      ageMin:0, kind:'cibo', isNew:true,
      items:[{ id:1, name:'Coperti & pane', qty:tab.seats, status:'cooking', allergens:['GLU'], mods:[] }],
    };
    store.set(s => ({ ...s, tickets:[newTicket, ...s.tickets].slice(0,8) }));
    setTimeout(() => store.set(s => ({ ...s, tickets: s.tickets.map(t => t.id === id ? { ...t, isNew:false } : t) })), 1800);
  }, 55000);
}
window.simEngine = simEngine;
