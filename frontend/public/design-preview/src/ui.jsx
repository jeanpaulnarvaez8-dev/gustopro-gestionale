// UI primitives: Topbar, NavRail, Toasts, BottomSheet, Modal, Onboarding hint, UndoBar
const { useState: uS, useEffect: uE, useRef: uR } = React;

// ─── Topbar ──────────────────────────────────────────────────────────────────
function Topbar({ onNavigate, page }){
  const s = useStore();
  const undo = s.undoStack[s.undoStack.length - 1];

  const NAV = [
    { id:'dashboard',    label:'Dashboard',    icon: <TrendingUp size={20}/> },
    { id:'tables',       label:'Sala',         icon: <MapPin size={20}/> },
    { id:'reservations', label:'Prenotazioni', icon: <Calendar size={20}/> },
    { id:'order',        label:'Ordine',       icon: <Receipt size={20}/> },
    { id:'kds',          label:'Cucina',       icon: <ChefHat size={20}/> },
    { id:'checkout',     label:'Cassa',        icon: <CreditCard size={20}/> },
    { id:'history',      label:'Storico',      icon: <Clock size={20}/> },
    { id:'inventory',    label:'Magazzino',    icon: <Building size={20}/> },
    { id:'closeday',     label:'Chiusura',     icon: <Flame size={20}/> },
    { id:'staff',        label:'Personale',    icon: <Users size={20}/> },
  ];

  return (
    <div className="noselect" style={{
      display:'flex',alignItems:'center',gap:12,padding:'10px 16px',
      background:'var(--surface)',borderBottom:'1px solid var(--border)',
      height:64,flexShrink:0
    }}>
      {/* Brand + tenant */}
      <div style={{display:'flex',alignItems:'center',gap:10,paddingRight:16,borderRight:'1px solid var(--border)'}}>
        <div style={{
          width:36,height:36,borderRadius:8,
          background:'linear-gradient(135deg,#D4AF37,#9c7e1f)',
          display:'flex',alignItems:'center',justifyContent:'center',
          fontWeight:800,color:'#1A1A1A',fontSize:15
        }}>GP</div>
        <div style={{display:'flex',flexDirection:'column',lineHeight:1.15}}>
          <div style={{fontSize:15,fontWeight:700,fontFamily:'var(--serif)',letterSpacing:'-0.01em'}}>GustoPro</div>
          <div style={{fontSize:11,color:'var(--gold)',display:'flex',alignItems:'center',gap:4}}>
            <Building size={11} stroke={2.4}/>{s.tenant.name}
          </div>
        </div>
      </div>

      {/* Nav modules */}
      <div className="scrollbar" style={{display:'flex',gap:4,alignItems:'center',overflowX:'auto',minWidth:0,flex:'1 1 auto'}}>
        {NAV.map(n => {
          const active = page === n.id;
          return (
            <button key={n.id} onClick={()=>onNavigate(n.id)} style={{
              flexShrink:0,
              display:'flex',alignItems:'center',gap:8,padding:'10px 14px',
              minHeight:44,border:'1px solid '+(active?'var(--gold-ring)':'transparent'),
              background: active ? 'var(--gold-soft)' : 'transparent',
              color: active ? 'var(--gold)' : 'var(--text-2)',
              borderRadius:10,fontWeight:600,fontSize:13,cursor:'pointer',
            }}>
              {n.icon}{n.label}
            </button>
          );
        })}
      </div>

      <div style={{flex:1}}/>

      {/* Status indicators */}
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        {s.user?.role === 'admin' && page === 'tables' && (
          <button onClick={()=>onNavigate('editor')} title="Editor planimetria (admin)" style={{
            display:'flex',alignItems:'center',gap:6,padding:'8px 12px',minHeight:40,
            background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
            color:'var(--text-2)',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer'
          }}>
            <Move size={14}/>Editor planimetria
          </button>
        )}
        <button title={s.online?'Online':'Offline'} onClick={()=>store.set({online:!s.online})}
          style={{
            display:'flex',alignItems:'center',gap:6,padding:'8px 12px',minHeight:40,
            background:s.online?'transparent':'rgba(212,175,55,0.12)',
            border:'1px solid '+(s.online?'var(--border)':'var(--gold-ring)'),
            color:s.online?'var(--text-2)':'var(--gold)',
            borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer'
          }}>
          {s.online ? <Wifi size={16}/> : <WifiOff size={16}/>}
          {s.online ? 'Online' : `Offline · ${s.syncQueue||3} in coda`}
        </button>

        {/* Notifiche */}
        <button onClick={()=>store.set({page:'tables'})} style={{
          position:'relative',width:40,height:40,
          background:'transparent',border:'1px solid var(--border)',borderRadius:8,
          color:'var(--text)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'
        }}>
          <Bell size={18}/>
          {s.alerts.length > 0 && (
            <span style={{
              position:'absolute',top:-4,right:-4,minWidth:18,height:18,padding:'0 5px',
              borderRadius:9,background:'var(--err)',color:'#fff',fontSize:10,fontWeight:800,
              display:'flex',alignItems:'center',justifyContent:'center',
              animation:'pulse-err 1.4s infinite'
            }}>{s.alerts.length}</span>
          )}
        </button>

        {/* User */}
        <div style={{display:'flex',alignItems:'center',gap:8,paddingLeft:8,borderLeft:'1px solid var(--border)'}}>
          <div style={{
            width:36,height:36,borderRadius:18,background:'#3a3a3a',
            display:'flex',alignItems:'center',justifyContent:'center',
            fontWeight:700,fontSize:13,color:'var(--text)'
          }}>{s.user.avatar}</div>
          <div style={{lineHeight:1.15}}>
            <div style={{fontSize:13,fontWeight:600}}>{s.user.name}</div>
            <div style={{fontSize:11,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{s.user.role}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
window.Topbar = Topbar;

// ─── Toast / alerts (overlay sticky in basso a dx) ──────────────────────────
function Toasts(){
  const s = useStore();
  const mandatory = s.alerts.find(a => a.kind === 'mandatory-course-alert');

  return (
    <>
      {/* Toast non-bloccanti in basso a dx */}
      <div style={{position:'fixed',right:16,bottom:16,display:'flex',flexDirection:'column',gap:8,zIndex:50,maxWidth:380}}>
        {s.alerts.filter(a => a.kind !== 'mandatory-course-alert').map(a => {
          const isWarn = a.kind === 'service-alert';
          const isErr = a.kind === 'service-escalation';
          const color = isErr ? 'var(--err)' : isWarn ? 'var(--warn)' : 'var(--gold)';
          return (
            <div key={a.id} style={{
              background:'var(--surface)',border:`1px solid ${color}`,
              borderLeft:`4px solid ${color}`,
              borderRadius:8,padding:'12px 14px',display:'flex',gap:10,alignItems:'flex-start',
              animation:'slide-up 200ms ease-out',boxShadow:'0 8px 24px rgba(0,0,0,0.4)'
            }}>
              <AlertTriangle size={18} style={{color,flexShrink:0,marginTop:1}}/>
              <div style={{flex:1,fontSize:13,color:'var(--text)',lineHeight:1.4}}>{a.text}</div>
              <button onClick={()=>store.set(st=>({...st,alerts:st.alerts.filter(x=>x.id!==a.id)}))}
                style={{background:'transparent',border:0,color:'var(--text-3)',cursor:'pointer',padding:2}}>
                <X size={14}/>
              </button>
            </div>
          );
        })}
      </div>

      {/* Modal bloccante mandatory-course-alert */}
      {mandatory && (
        <div style={{
          position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)',
          display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,animation:'fade-in 150ms'
        }}>
          <div style={{
            background:'var(--surface)',border:'2px solid var(--err)',borderRadius:14,
            padding:32,maxWidth:480,width:'90%',animation:'slide-up 250ms'
          }}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
              <div style={{width:44,height:44,borderRadius:22,background:'rgba(239,68,68,0.18)',
                display:'flex',alignItems:'center',justifyContent:'center'}}>
                <AlertTriangle size={24} style={{color:'var(--err)'}}/>
              </div>
              <div>
                <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--err)',fontWeight:800,textTransform:'uppercase'}}>Portata obbligatoria</div>
                <div style={{fontSize:20,fontWeight:700,marginTop:2}}>Tavolo M2 in ritardo</div>
              </div>
            </div>
            <div style={{color:'var(--text-2)',fontSize:14,lineHeight:1.5,marginBottom:24}}>
              {mandatory.text}. La prossima portata deve essere rilasciata adesso, oppure posticipa di 5 minuti.
            </div>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>{
                store.set(st=>({...st,alerts:st.alerts.filter(a=>a.id!==mandatory.id)}));
                pushUndo('Portata rilasciata · M2', ()=>{});
              }} style={{
                flex:1,minHeight:56,background:'var(--gold)',color:'#1A1A1A',border:0,
                borderRadius:10,fontSize:15,fontWeight:700,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:8
              }}>
                <Send size={18}/>Rilascia prossima portata
              </button>
              <button onClick={()=>store.set(st=>({...st,alerts:st.alerts.filter(a=>a.id!==mandatory.id)}))} style={{
                flex:1,minHeight:56,background:'transparent',color:'var(--text)',
                border:'1px solid var(--border-2)',borderRadius:10,fontSize:15,fontWeight:600,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:8
              }}>
                <Clock size={18}/>Posticipa 5 min
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
window.Toasts = Toasts;

// ─── Undo bar (centro basso, 10s) ───────────────────────────────────────────
function UndoBar(){
  const s = useStore();
  const u = s.undoStack[s.undoStack.length - 1];
  if (!u) return null;
  return (
    <div key={u.id} style={{
      position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%)',
      background:'#0e0e0e',border:'1px solid var(--gold-ring)',borderRadius:999,
      padding:'10px 8px 10px 18px',display:'flex',alignItems:'center',gap:14,zIndex:60,
      boxShadow:'0 12px 32px rgba(0,0,0,0.5)',animation:'slide-up 200ms'
    }}>
      <Check size={16} style={{color:'var(--gold)'}}/>
      <span style={{fontSize:13,color:'var(--text)'}}>{u.label}</span>
      <button onClick={()=>{ u.undoFn(); store.set(st=>({...st,undoStack:st.undoStack.filter(x=>x.id!==u.id)})); }}
        style={{
          background:'var(--gold)',color:'#1A1A1A',border:0,borderRadius:999,
          padding:'8px 16px',fontWeight:700,fontSize:13,cursor:'pointer',
          display:'flex',alignItems:'center',gap:6
        }}>
        <RefreshCw size={14}/>Annulla
      </button>
    </div>
  );
}
window.UndoBar = UndoBar;

// ─── Bottom sheet (variant 3 = griglia 2x2 con bottoni grandi) ──────────────
function BottomSheet({ open, onClose, table, onAction }){
  if (!open || !table) return null;
  const st = STATUS[table.status];

  // Azioni per stato — solo le pertinenti, mai tutto insieme
  let actions = [];
  if (table.status === 'free' || table.status === 'reserved'){
    actions = [
      { id:'open',  icon:<Plus size={28}/>,    label:'Apri conto',    primary:true,  hint:'Inizia il servizio' },
      { id:'reserve',icon:<Calendar size={28}/>, label:'Riserva',     hint:'Aggiungi prenotazione' },
    ];
  } else if (table.status === 'occupied'){
    actions = [
      { id:'order', icon:<Receipt size={28}/>,  label:'Apri ordine',   primary:true, hint:`${formatEur(table.ordersTotal||0)} · ${formatMin(table.sinceMin)}` },
      { id:'pay',   icon:<CreditCard size={28}/>, label:'Cassa',                     hint:'Vai al pagamento' },
      { id:'move',  icon:<Move size={28}/>,    label:'Sposta',                       hint:'Sposta il tavolo' },
      { id:'merge', icon:<Combine size={28}/>, label:'Unisci',                       hint:'Unisci a un altro' },
      { id:'park',  icon:<Pause size={28}/>,   label:'Parcheggia',                   hint:'Sospendi il conto' },
      { id:'split', icon:<Split size={28}/>,   label:'Dividi',                       hint:'Spezza il tavolo' },
    ];
  } else if (table.status === 'parked'){
    actions = [
      { id:'resume', icon:<Play size={28}/>,    label:'Riprendi',       primary:true, hint:'Continua il servizio' },
      { id:'free',   icon:<Check size={28}/>,   label:'Chiudi e libera', hint:'Servizio finito' },
    ];
  } else if (table.status === 'dirty'){
    actions = [
      { id:'free', icon:<Check size={28}/>, label:'Tavolo pulito', primary:true, hint:'Pronto per nuovi clienti' },
    ];
  }

  return (
    <>
      <div onClick={onClose} style={{
        position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',backdropFilter:'blur(2px)',
        zIndex:80,animation:'fade-in 150ms'
      }}/>
      <div style={{
        position:'fixed',left:0,right:0,bottom:0,zIndex:81,
        background:'var(--surface)',borderTop:'1px solid var(--border-2)',
        borderTopLeftRadius:18,borderTopRightRadius:18,
        padding:'14px 20px 24px',animation:'slide-up 220ms ease-out',
        boxShadow:'0 -20px 40px rgba(0,0,0,0.4)'
      }}>
        {/* Drag handle */}
        <div style={{width:48,height:5,borderRadius:3,background:'rgba(255,255,255,0.18)',margin:'0 auto 14px'}}/>

        {/* Header tavolo */}
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:18}}>
          <div style={{
            width:64,height:64,borderRadius:14,
            background:`${st.color}26`,border:`2px solid ${st.color}`,
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'
          }}>
            <div style={{fontSize:20,fontWeight:800,color:st.color,lineHeight:1}}>{table.id}</div>
            <div style={{fontSize:9,color:st.color,fontWeight:700,marginTop:2}}>{st.short}</div>
          </div>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{fontSize:22,fontWeight:700}}>Tavolo {table.id}</div>
              <span style={{fontSize:13,color:'var(--text-2)'}}>· {table.seats} posti</span>
            </div>
            <div style={{fontSize:13,color:st.color,fontWeight:600,marginTop:2,display:'flex',alignItems:'center',gap:8}}>
              <span style={{width:8,height:8,borderRadius:4,background:st.color}}/>
              {st.label}
              {table.status==='occupied' && <span style={{color:'var(--text-2)',fontWeight:500}}>· {table.waiter} · {formatMin(table.sinceMin)}</span>}
              {table.status==='reserved' && <span style={{color:'var(--text-2)',fontWeight:500}}>· {table.reservedFor}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{
            width:44,height:44,borderRadius:22,background:'rgba(255,255,255,0.04)',
            border:'1px solid var(--border)',color:'var(--text-2)',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center'
          }}><X size={20}/></button>
        </div>

        {/* Grid azioni — variant 3 (full grid) */}
        <div style={{
          display:'grid',
          gridTemplateColumns: actions.length <= 2 ? '1fr 1fr' : 'repeat(3, 1fr)',
          gap:10
        }}>
          {actions.map(a => (
            <button key={a.id} onClick={()=>onAction(a.id, table)} style={{
              minHeight: 96,
              background: a.primary ? 'var(--gold)' : 'rgba(255,255,255,0.04)',
              color: a.primary ? '#1A1A1A' : 'var(--text)',
              border: '1px solid '+(a.primary ? 'var(--gold)' : 'var(--border-2)'),
              borderRadius: 12, cursor:'pointer',
              display:'flex',flexDirection:'column',alignItems:'flex-start',justifyContent:'space-between',
              padding:'14px 16px',gap:8,textAlign:'left'
            }}>
              <div style={{opacity:a.primary?1:.85}}>{a.icon}</div>
              <div>
                <div style={{fontSize:15,fontWeight:700,lineHeight:1.15}}>{a.label}</div>
                {a.hint && <div style={{fontSize:11,opacity:.65,marginTop:3,fontWeight:500}}>{a.hint}</div>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
window.BottomSheet = BottomSheet;

// ─── Onboarding hint (la prima volta) ───────────────────────────────────────
function OnboardingHint({ shown, onDismiss }){
  if (!shown) return null;
  return (
    <div style={{
      position:'fixed',top:80,left:'50%',transform:'translateX(-50%)',zIndex:40,
      background:'#0e0e0e',border:'1px solid var(--gold-ring)',
      borderRadius:10,padding:'10px 14px',display:'flex',alignItems:'center',gap:10,
      animation:'slide-up 250ms',boxShadow:'0 8px 24px rgba(0,0,0,0.5)'
    }}>
      <Sparkles size={16} style={{color:'var(--gold)'}}/>
      <span style={{fontSize:13,color:'var(--text)'}}>
        <b>Tocca un tavolo</b> per aprirlo. Ogni colore = uno stato. Non puoi sbagliare.
      </span>
      <button onClick={onDismiss} style={{
        background:'var(--gold)',color:'#1A1A1A',border:0,borderRadius:6,
        padding:'6px 12px',fontSize:12,fontWeight:700,cursor:'pointer',marginLeft:8
      }}>Ok!</button>
    </div>
  );
}
window.OnboardingHint = OnboardingHint;

// ─── Legenda colori (sempre visibile) ───────────────────────────────────────
function StatusLegend({ compact = false }){
  return (
    <div style={{
      display:'flex',gap: compact?6:10,alignItems:'center',
      flexWrap:'wrap',padding: compact?'6px 10px':'8px 14px',
      background:'rgba(255,255,255,0.02)',border:'1px solid var(--border)',borderRadius:10,
    }}>
      {Object.entries(STATUS).map(([k,v]) => (
        <div key={k} style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--text-2)'}}>
          <span style={{width:10,height:10,borderRadius:5,background:v.color,boxShadow:`0 0 0 2px ${v.color}33`}}/>
          <b style={{color:'var(--text)',fontWeight:600}}>{v.label}</b>
        </div>
      ))}
    </div>
  );
}
window.StatusLegend = StatusLegend;
