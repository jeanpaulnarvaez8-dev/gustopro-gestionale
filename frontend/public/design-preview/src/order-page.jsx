// Presa Ordine — tablet 10" landscape, 2 colonne menu+carrello
// Persona: cameriere | Momento: tavolo S4 occupato da 67 min, deve aggiungere/modificare item
// Eventi: emette `order-item-added`; ascolta `item-status-updated`

const { useState: oS, useMemo: oM, useEffect: oE } = React;

function AllergenBadge({ code, alert }){
  return <AllergenIcon code={code} size={alert ? 22 : 18}/>;
}
window.AllergenBadge = AllergenBadge;

function StatusPill({ status }){
  const map = {
    A: { label:'Attesa',     color:'var(--warn)', bg:'rgba(234,179,8,0.15)' },
    P: { label:'Produzione', color:'var(--gold)', bg:'rgba(212,175,55,0.15)' },
    C: { label:'Consegnato', color:'var(--ok)',   bg:'rgba(34,197,94,0.15)' },
  };
  const m = map[status];
  return (
    <span style={{
      display:'inline-flex',alignItems:'center',gap:5,
      padding:'3px 8px',borderRadius:999,fontSize:11,fontWeight:700,
      background:m.bg,color:m.color,letterSpacing:'0.04em'
    }}>
      <span style={{width:6,height:6,borderRadius:3,background:m.color}}/>
      {status} · {m.label}
    </span>
  );
}
window.StatusPill = StatusPill;

function MenuItemCard({ item, onAdd }){
  return (
    <button onClick={()=>onAdd(item)} style={{
      background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,
      padding:14,textAlign:'left',cursor:'pointer',
      display:'flex',flexDirection:'column',gap:8,minHeight:110,
      transition:'all 120ms'
    }}
    onMouseDown={e=>e.currentTarget.style.transform='scale(0.98)'}
    onMouseUp={e=>e.currentTarget.style.transform=''}
    onMouseLeave={e=>e.currentTarget.style.transform=''}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
        <div style={{fontSize:14,fontWeight:600,lineHeight:1.25,color:'var(--text)',fontFamily:'var(--serif)',letterSpacing:'-0.005em'}}>{item.name}</div>
        <div style={{
          width:32,height:32,borderRadius:16,background:'var(--gold)',
          display:'flex',alignItems:'center',justifyContent:'center',color:'#1A1A1A',flexShrink:0
        }}><Plus size={18} stroke={2.6}/></div>
      </div>
      <div style={{flex:1}}/>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
        <div style={{fontSize:15,fontWeight:800,color:'var(--gold)'}} className="tnum">
          {item.byWeight ? `${formatEur(item.pricePerKg)}/kg` : formatEur(item.price)}
        </div>
        <div style={{display:'flex',gap:3,flexWrap:'wrap',justifyContent:'flex-end'}}>
          {item.allergens.slice(0,4).map(a => <AllergenBadge key={a} code={a}/>)}
        </div>
      </div>
    </button>
  );
}

function CartLine({ line, onChange, onDelete }){
  return (
    <div style={{
      background:'rgba(255,255,255,0.025)',border:'1px solid var(--border)',borderRadius:10,
      padding:10,display:'flex',flexDirection:'column',gap:8
    }}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:600,lineHeight:1.3}}>{line.name}</div>
          {line.mods?.length > 0 && (
            <div style={{fontSize:11,color:'var(--gold)',marginTop:3,fontWeight:500}}>
              {line.mods.map(m=>'· '+m).join(' ')}
            </div>
          )}
          {line.allergens.length > 0 && (
            <div style={{display:'flex',gap:3,marginTop:6,flexWrap:'wrap'}}>
              {line.allergens.map(a => <AllergenBadge key={a} code={a}/>)}
            </div>
          )}
        </div>
        <StatusPill status={line.status}/>
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:0,
          background:'rgba(0,0,0,0.3)',borderRadius:8,padding:2}}>
          <button onClick={()=>onChange({...line, qty:Math.max(1,line.qty-1)})}
            disabled={line.status!=='A' && line.status!=='P'}
            style={{width:36,height:36,border:0,borderRadius:6,background:'transparent',
              color: (line.status==='C') ? 'var(--text-3)' : 'var(--text)',cursor:'pointer',
              display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Minus size={16}/>
          </button>
          <span style={{minWidth:30,textAlign:'center',fontWeight:700,fontSize:14}} className="tnum">{line.qty}</span>
          <button onClick={()=>onChange({...line, qty:line.qty+1})}
            disabled={line.status==='C'}
            style={{width:36,height:36,border:0,borderRadius:6,background:'transparent',
              color: (line.status==='C') ? 'var(--text-3)' : 'var(--text)',cursor:'pointer',
              display:'flex',alignItems:'center',justifyContent:'center'}}>
            <Plus size={16}/>
          </button>
        </div>
        <div style={{fontSize:14,fontWeight:700,color:'var(--text)'}} className="tnum">
          {formatEur(line.price * line.qty)}
        </div>
        {line.status === 'A' && (
          <button onClick={()=>onDelete(line)} style={{
            width:36,height:36,border:'1px solid var(--border)',borderRadius:8,
            background:'transparent',color:'var(--text-3)',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center'
          }}><Trash size={14}/></button>
        )}
      </div>
    </div>
  );
}

function OrderPage({ onBack }){
  const s = useStore();
  const [activeCat, setActiveCat] = oS('antipasti');
  const [search, setSearch] = oS('');
  const [weightFor, setWeightFor] = oS(null);
  const [comboOpen, setComboOpen] = oS(false);
  const [raceFor, setRaceFor] = oS(null);
  const [showCart, setShowCart] = oS(false); // mobile: toggle carrello

  // Race-condition demo: alla prima apertura del tavolo S4, mostra modal "in uso da Marco"
  oE(() => {
    const k = '_race_shown_' + (s.selectedTableId || 'S4');
    if (!sessionStorage.getItem(k)){
      sessionStorage.setItem(k, '1');
      setTimeout(()=>setRaceFor('Marco'), 600);
    }
  }, []);

  const tableId = s.selectedTableId || 'S4';
  const table = s.tables.find(x => x.id === tableId);
  const cart = s.cart;

  const items = oM(() => MENU.filter(m => m.cat === activeCat &&
    (!search || m.name.toLowerCase().includes(search.toLowerCase()))), [activeCat, search]);

  const totals = oM(() => {
    const sub = cart.items.reduce((a,b)=>a+b.price*b.qty, 0);
    const inAttesa = cart.items.filter(x=>x.status==='A').length;
    const inProd = cart.items.filter(x=>x.status==='P').length;
    const cons = cart.items.filter(x=>x.status==='C').length;
    return { sub, inAttesa, inProd, cons };
  }, [cart]);

  function addToCart(item){
    if (item.byWeight){ setWeightFor(item); return; }
    const newLine = {
      id: Date.now(),
      menuId: item.id,
      name: item.name,
      qty: 1,
      price: item.price,
      status: 'A',
      mods: [],
      allergens: item.allergens,
    };
    store.set(s => ({ ...s, cart: { ...s.cart, items:[...s.cart.items, newLine] } }));
    pushUndo(`+1 ${item.name}`, () => {
      store.set(s => ({ ...s, cart: { ...s.cart, items: s.cart.items.filter(x=>x.id !== newLine.id) } }));
    });
  }
  function confirmWeight(payload){
    const newLine = {
      id: Date.now(),
      menuId: payload.id,
      name: `${payload.name} (${payload.weightKg.toFixed(3)}kg)`,
      qty:1, price: payload.computedPrice, status:'A', mods:[], allergens: payload.allergens,
    };
    store.set(s => ({ ...s, cart: { ...s.cart, items:[...s.cart.items, newLine] } }));
    setWeightFor(null);
    pushUndo(`+1 ${payload.name} ${payload.weightKg.toFixed(2)}kg`, ()=>{});
  }
  function confirmCombo({ combo, picks }){
    const newLine = {
      id: Date.now(), menuId: combo.id,
      name: `${combo.name} (×1)`,
      qty:1, price: combo.price, status:'A',
      mods: Object.values(picks).map(p=>p.name),
      allergens: ['GLU','LAT','PES','MOL','CRO']
    };
    store.set(s => ({ ...s, cart: { ...s.cart, items:[...s.cart.items, newLine] } }));
    setComboOpen(false);
    pushUndo('Menu Degustazione aggiunto', ()=>{});
  }

  function changeLine(line){
    store.set(s => ({ ...s, cart: { ...s.cart, items: s.cart.items.map(x => x.id===line.id ? line : x) } }));
  }
  function deleteLine(line){
    const prev = cart.items;
    store.set(s => ({ ...s, cart: { ...s.cart, items: s.cart.items.filter(x => x.id !== line.id) } }));
    pushUndo(`Rimosso ${line.name}`, () => store.set(s => ({ ...s, cart:{ ...s.cart, items: prev } })));
  }
  function sendToKitchen(){
    const inAttesaCount = cart.items.filter(x=>x.status==='A').length;
    if (!inAttesaCount) return;
    store.set(s => ({ ...s, cart: { ...s.cart, items: s.cart.items.map(x => x.status==='A' ? {...x,status:'P'} : x) } }));
    pushUndo(`${inAttesaCount} portate inviate in cucina`, ()=>{});
  }

  // useEffect to detect mobile
  oE(() => {
    const onResize = () => { /* re-render trigger */ };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 720;

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'14px 20px',display:'flex',alignItems:'center',gap:14,borderBottom:'1px solid var(--border)'}}>
        <button onClick={onBack} style={{
          minHeight:44,minWidth:44,padding:'0 14px',
          background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
          borderRadius:10,color:'var(--text)',cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:600
        }}><ArrowLeft size={18}/>Sala</button>

        <div style={{display:'flex',alignItems:'center',gap:14,flex:1}}>
          <div style={{
            width:56,height:56,borderRadius:12,background:'rgba(239,68,68,0.18)',
            border:'2px solid var(--err)',
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'
          }}>
            <div style={{fontSize:18,fontWeight:800,color:'var(--err)'}}>{tableId}</div>
            <div style={{fontSize:9,color:'var(--err)',fontWeight:700}}>OCC</div>
          </div>
          <div>
            <div style={{display:'flex',alignItems:'baseline',gap:8}}>
              <span style={{fontSize:22,fontWeight:800}}>Tavolo {tableId}</span>
              <span style={{fontSize:13,color:'var(--text-2)'}}>· {table?.seats || 6} coperti · {cart.waiter}</span>
            </div>
            <div style={{fontSize:13,color:'var(--text-2)',marginTop:2,display:'flex',alignItems:'center',gap:8}}>
              <Clock size={14}/> Aperto da <b className="tnum" style={{color:'var(--text)'}}>{formatMin(table?.sinceMin || cart.openedMin)}</b>
              <span>· Ultimo invio in cucina <b className="tnum" style={{color:'var(--text)'}}>3 min fa</b></span>
            </div>
          </div>
        </div>

        {/* Status A/P/C summary */}
        <div style={{display:'flex',gap:6}}>
          <div style={{padding:'6px 12px',borderRadius:8,background:'rgba(234,179,8,0.12)',border:'1px solid rgba(234,179,8,0.3)'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--warn)',letterSpacing:'0.05em'}}>A · ATTESA</div>
            <div style={{fontSize:18,fontWeight:800,color:'var(--warn)'}} className="tnum">{totals.inAttesa}</div>
          </div>
          <div style={{padding:'6px 12px',borderRadius:8,background:'var(--gold-soft)',border:'1px solid var(--gold-ring)'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--gold)',letterSpacing:'0.05em'}}>P · PRODUZIONE</div>
            <div style={{fontSize:18,fontWeight:800,color:'var(--gold)'}} className="tnum">{totals.inProd}</div>
          </div>
          <div style={{padding:'6px 12px',borderRadius:8,background:'rgba(34,197,94,0.12)',border:'1px solid rgba(34,197,94,0.3)'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--ok)',letterSpacing:'0.05em'}}>C · CONSEGN.</div>
            <div style={{fontSize:18,fontWeight:800,color:'var(--ok)'}} className="tnum">{totals.cons}</div>
          </div>
        </div>
      </div>

      {/* Body 2 colonne (1 colonna su mobile, carrello come bottom sheet) */}
      <div style={{flex:1,display:'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 420px',
        overflow:'hidden'}}>
        {/* Colonna menu */}
        <div style={{display:'flex',flexDirection:'column',overflow:'hidden',
          borderRight: isMobile ? 'none' : '1px solid var(--border)'}}>
          {/* Categorie pillole */}
          <div className="scrollbar" style={{display:'flex',gap:6,padding:'12px 20px',overflowX:'auto',borderBottom:'1px solid var(--border)',alignItems:'center'}}>
            {MENU_CATS.map(c => {
              const isAct = activeCat === c.id;
              return (
                <button key={c.id} onClick={()=>setActiveCat(c.id)} style={{
                  flexShrink:0,minHeight:44,padding:'8px 16px',
                  border:'1px solid '+(isAct?'var(--gold-ring)':'var(--border)'),
                  background: isAct?'var(--gold-soft)':'rgba(255,255,255,0.02)',
                  color: isAct?'var(--gold)':'var(--text)',
                  borderRadius:999,fontSize:13,fontWeight:600,cursor:'pointer'
                }}>{c.name}</button>
              );
            })}
            <button onClick={()=>setComboOpen(true)} style={{
              flexShrink:0,minHeight:44,padding:'8px 14px',
              border:'1px solid var(--gold)',background:'var(--gold-soft)',color:'var(--gold)',
              borderRadius:999,fontSize:13,fontWeight:700,cursor:'pointer',
              display:'flex',alignItems:'center',gap:6
            }}><Sparkles size={14}/>Menu degustazione</button>
            <div style={{flex:1}}/>
            <div style={{position:'relative',flexShrink:0}}>
              <Search size={16} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text-3)'}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca piatto..."
                style={{
                  background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
                  borderRadius:999,padding:'8px 14px 8px 34px',color:'var(--text)',fontSize:13,
                  fontFamily:'inherit',outline:'none',minWidth:200
                }}/>
            </div>
          </div>

          {/* Items grid */}
          <div className="scrollbar" style={{
            flex:1,overflow:'auto',padding:16,
            display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10,
            alignContent:'start'
          }}>
            {items.map(item => <MenuItemCard key={item.id} item={item} onAdd={addToCart}/>)}
          </div>
        </div>

        {/* Colonna carrello (desktop = sempre, mobile = bottom sheet) */}
        {(!isMobile || showCart) && (
        <div style={{
          display:'flex',flexDirection:'column',overflow:'hidden',background:'var(--surface-2)',
          ...(isMobile ? {
            position:'fixed',left:0,right:0,bottom:0,top:0,zIndex:70
          } : {})
        }}>
          {isMobile && (
            <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
              <button onClick={()=>setShowCart(false)} style={{
                width:40,height:40,background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
                borderRadius:8,color:'var(--text)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'
              }}><ArrowLeft size={18}/></button>
              <div style={{fontSize:15,fontWeight:700}}>Comanda · {tableId}</div>
            </div>
          )}
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div style={{fontSize:14,fontWeight:700}}>Comanda</div>
            <div style={{fontSize:12,color:'var(--text-2)'}}>
              <span className="tnum">{cart.items.length}</span> portate
            </div>
          </div>
          <div className="scrollbar" style={{flex:1,overflow:'auto',padding:12,display:'flex',flexDirection:'column',gap:8}}>
            {cart.items.map(line => (
              <CartLine key={line.id} line={line} onChange={changeLine} onDelete={deleteLine}/>
            ))}
            {cart.items.length === 0 && (
              <div style={{textAlign:'center',color:'var(--text-3)',padding:'40px 20px',fontSize:13}}>
                Nessuna portata.<br/>Tocca un piatto a sinistra.
              </div>
            )}
          </div>
          <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)',display:'flex',justifyContent:'space-between',fontSize:13}}>
            <span style={{color:'var(--text-2)'}}>Subtotale</span>
            <span className="tnum" style={{fontWeight:700,fontSize:18}}>{formatEur(totals.sub)}</span>
          </div>

          {/* CTA invia in cucina (gold, fissa) */}
          <button onClick={sendToKitchen} disabled={!totals.inAttesa}
            style={{
              margin:12,minHeight:64,
              background: totals.inAttesa ? 'var(--gold)' : 'rgba(212,175,55,0.18)',
              color: totals.inAttesa ? '#1A1A1A' : 'var(--text-3)',
              border:0,borderRadius:12,fontSize:16,fontWeight:800,cursor:'pointer',
              display:'flex',alignItems:'center',justifyContent:'center',gap:10,
              boxShadow: totals.inAttesa ? '0 8px 24px rgba(212,175,55,0.25)' : 'none'
            }}>
            <Send size={20}/>
            {totals.inAttesa
              ? `Invia in cucina (${totals.inAttesa})`
              : 'Niente da inviare'}
          </button>

          <button onClick={()=>store.set({page:'checkout'})} style={{
            margin:'0 12px 12px',minHeight:48,
            background:'transparent',color:'var(--text)',
            border:'1px solid var(--border-2)',borderRadius:10,fontSize:14,fontWeight:600,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',gap:8
          }}>
            <CreditCard size={16}/>Vai alla cassa
          </button>
        </div>
        )}
      </div>

      {/* Mobile FAB carrello */}
      {isMobile && !showCart && cart.items.length > 0 && (
        <button onClick={()=>setShowCart(true)} style={{
          position:'fixed',right:16,bottom:24,zIndex:60,
          minHeight:56,padding:'0 20px',background:'var(--gold)',color:'#1A1A1A',border:0,
          borderRadius:28,fontSize:14,fontWeight:800,cursor:'pointer',
          display:'flex',alignItems:'center',gap:10,
          boxShadow:'0 12px 32px rgba(212,175,55,0.4)'
        }}>
          <Receipt size={20}/>Comanda · {cart.items.length}
          <span style={{fontWeight:700}} className="tnum">{formatEur(totals.sub)}</span>
        </button>
      )}

      {/* Modali */}
      <WeightModal open={!!weightFor} item={weightFor} onClose={()=>setWeightFor(null)} onConfirm={confirmWeight}/>
      <ComboWizard open={comboOpen} onClose={()=>setComboOpen(false)} onConfirm={confirmCombo}/>
      <RaceConditionModal open={!!raceFor} otherWaiter={raceFor||''} tableId={tableId}
        onCancel={()=>{ setRaceFor(null); onBack(); }}
        onTakeover={()=>{ setRaceFor(null); pushUndo(`Subentrato a ${raceFor} su ${tableId}`,()=>{}); }}/>
    </div>
  );
}
window.OrderPage = OrderPage;
