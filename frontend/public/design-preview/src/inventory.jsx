// Magazzino & 86'd — inventario live con propagazione esauriti
const { useState: vS, useMemo: vM } = React;

const INV_SEED = [
  { id:'i1', name:'Vongole veraci',     cat:'Pesce',    stock:8.4,  unit:'kg',  min:3,    avg:6.2,   supplier:'Pescheria Tonti',   alert:false },
  { id:'i2', name:'Astice blu',         cat:'Pesce',    stock:2,    unit:'pz',  min:5,    avg:8,     supplier:'Pescheria Tonti',   alert:true },
  { id:'i3', name:'Branzino fresco',    cat:'Pesce',    stock:14,   unit:'pz',  min:8,    avg:12,    supplier:'Pescheria Tonti',   alert:false },
  { id:'i4', name:'Polpo',              cat:'Pesce',    stock:0,    unit:'kg',  min:4,    avg:5.5,   supplier:'Pescheria Tonti',   alert:true, ko:true },
  { id:'i5', name:'Mozzarella di bufala',cat:'Latticini',stock:1.8, unit:'kg',  min:3,    avg:4,     supplier:'Caseificio Andrano', alert:true },
  { id:'i6', name:'Pomodoro datterino', cat:'Verdura',  stock:18,   unit:'kg',  min:8,    avg:12,    supplier:'Az. Agr. Salice',   alert:false },
  { id:'i7', name:'Olio EVO Pugliese',  cat:'Olio',     stock:32,   unit:'L',   min:10,   avg:18,    supplier:'Frantoio Galatone', alert:false },
  { id:'i8', name:'Vino Negroamaro',    cat:'Cantina',  stock:48,   unit:'btl', min:24,   avg:30,    supplier:'Tenuta Salvatore',  alert:false },
  { id:'i9', name:'Vino Primitivo',     cat:'Cantina',  stock:6,    unit:'btl', min:12,   avg:20,    supplier:'Tenuta Salvatore',  alert:true },
  { id:'i10',name:'Limoni di Sorrento', cat:'Frutta',   stock:0,    unit:'kg',  min:5,    avg:8,     supplier:'Az. Agr. Costiera', alert:true, ko:true },
];

const CATS = [
  { id:'all',       l:'Tutti',     icon:<Layers size={14}/> },
  { id:'Pesce',     l:'Pesce',     icon:<Waves size={14}/> },
  { id:'Latticini', l:'Latticini', icon:<Coffee size={14}/> },
  { id:'Verdura',   l:'Verdura',   icon:<Sparkles size={14}/> },
  { id:'Cantina',   l:'Cantina',   icon:<Banknote size={14}/> },
  { id:'Frutta',    l:'Frutta',    icon:<PartyPopper size={14}/> },
  { id:'Olio',      l:'Olio',      icon:<Building size={14}/> },
];

function StockBar({ stock, min, avg, ko }){
  const max = avg * 1.5;
  const pct = Math.min(100, Math.max(0, (stock/max)*100));
  const minPct = (min/max)*100;
  const color = ko ? 'var(--err)' : (stock<=min ? 'var(--warn)' : 'var(--ok)');
  return (
    <div style={{position:'relative',height:8,background:'rgba(0,0,0,0.3)',borderRadius:4,overflow:'hidden'}}>
      <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${pct}%`,background:color,transition:'width 300ms'}}/>
      <div style={{
        position:'absolute',left:`${minPct}%`,top:-2,bottom:-2,width:1.5,background:'var(--text-3)',
        boxShadow:'0 0 0 0.5px rgba(0,0,0,0.5)'
      }}/>
    </div>
  );
}

function Inventory({ onBack }){
  const [items, setItems] = vS(INV_SEED);
  const [cat, setCat] = vS('all');
  const [search, setSearch] = vS('');
  const [showOnly, setShowOnly] = vS('all'); // all | low | ko

  const stats = vM(()=>({
    total: items.length,
    ko: items.filter(i=>i.ko || i.stock===0).length,
    low: items.filter(i=>!i.ko && i.stock>0 && i.stock<=i.min).length,
    value: items.reduce((a,b)=>a + b.stock * 12, 0), // valore stimato
  }), [items]);

  const filtered = vM(()=>items.filter(i =>
    (cat==='all' || i.cat===cat) &&
    (!search || i.name.toLowerCase().includes(search.toLowerCase())) &&
    (showOnly==='all' || (showOnly==='low' && i.stock<=i.min) || (showOnly==='ko' && (i.ko||i.stock===0)))
  ), [items, cat, search, showOnly]);

  function toggle86(item){
    setItems(arr => arr.map(x => x.id===item.id ? {...x, ko:!x.ko, stock: x.ko?x.avg:0} : x));
    pushUndo(item.ko ? `${item.name} ripristinato` : `${item.name} marcato 86'd`,()=>{});
  }
  function adjust(item, delta){
    setItems(arr => arr.map(x => x.id===item.id ? {...x, stock: Math.max(0, +(x.stock+delta).toFixed(1))} : x));
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'14px 24px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:14}}>
        <button onClick={onBack} style={{
          minHeight:44,padding:'0 14px',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
          borderRadius:10,color:'var(--text)',cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:600
        }}><ArrowLeft size={18}/>Sala</button>
        <div style={{flex:1}}>
          <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Magazzino</div>
          <div style={{fontSize:20,fontWeight:800,marginTop:2}}>Inventario live · <span style={{color:'var(--err)'}}>{stats.ko} esauriti</span> <span style={{color:'var(--warn)'}}>· {stats.low} sotto soglia</span></div>
        </div>
        <button style={{
          minHeight:44,padding:'0 18px',background:'transparent',color:'var(--text)',
          border:'1px solid var(--border-2)',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer',
          display:'flex',alignItems:'center',gap:6
        }}><RefreshCw size={14}/>Sincronizza POS</button>
        <button style={{
          minHeight:44,padding:'0 18px',background:'var(--gold)',color:'#1A1A1A',border:0,
          borderRadius:10,fontSize:13,fontWeight:800,cursor:'pointer',
          display:'flex',alignItems:'center',gap:8
        }}><Plus size={16}/>Nuovo articolo</button>
      </div>

      {/* KPI strip */}
      <div style={{padding:'14px 24px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,borderBottom:'1px solid var(--border)'}}>
        {[
          { l:'Articoli totali', v:stats.total, sub:'in inventario', c:'var(--text)' },
          { l:'Esauriti (86\'d)', v:stats.ko, sub:'rimossi dal menu auto', c:'var(--err)' },
          { l:'Sotto soglia', v:stats.low, sub:'da riordinare', c:'var(--warn)' },
          { l:'Valore stimato', v:formatEur(stats.value), sub:'magazzino corrente', c:'var(--gold)' },
        ].map((k,i)=>(
          <div key={i} style={{padding:'10px 14px',background:'rgba(255,255,255,0.02)',border:'1px solid var(--border)',borderRadius:10}}>
            <div style={{fontSize:10,letterSpacing:'0.08em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>{k.l}</div>
            <div style={{fontSize:22,fontWeight:800,color:k.c,marginTop:2}} className="tnum">{k.v}</div>
            <div style={{fontSize:10,color:'var(--text-3)',marginTop:2}}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Filtri */}
      <div style={{padding:'12px 24px',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid var(--border)'}}>
        <div className="scrollbar" style={{display:'flex',gap:6,overflowX:'auto',flex:1}}>
          {CATS.map(c=>(
            <button key={c.id} onClick={()=>setCat(c.id)} style={{
              flexShrink:0,minHeight:40,padding:'7px 14px',
              border:'1px solid '+(cat===c.id?'var(--gold-ring)':'var(--border)'),
              background: cat===c.id?'var(--gold-soft)':'rgba(255,255,255,0.02)',
              color: cat===c.id?'var(--gold)':'var(--text-2)',
              borderRadius:999,fontSize:12,fontWeight:600,cursor:'pointer',
              display:'flex',alignItems:'center',gap:6
            }}>{c.icon}{c.l}</button>
          ))}
        </div>
        <div style={{display:'flex',gap:4,padding:3,background:'rgba(0,0,0,0.25)',borderRadius:8}}>
          {[{id:'all',l:'Tutti'},{id:'low',l:'⚠ Bassi'},{id:'ko',l:'● Esauriti'}].map(o=>(
            <button key={o.id} onClick={()=>setShowOnly(o.id)} style={{
              minHeight:34,padding:'0 12px',
              background:showOnly===o.id?'rgba(255,255,255,0.06)':'transparent',
              border:0,color:showOnly===o.id?'var(--text)':'var(--text-3)',
              borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'
            }}>{o.l}</button>
          ))}
        </div>
        <div style={{position:'relative'}}>
          <Search size={14} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text-3)'}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca articolo..." style={{
            background:'rgba(0,0,0,0.3)',border:'1px solid var(--border)',borderRadius:8,
            padding:'8px 12px 8px 32px',color:'var(--text)',fontSize:12,fontFamily:'inherit',outline:'none',width:200
          }}/>
        </div>
      </div>

      {/* Tabella */}
      <div className="scrollbar" style={{flex:1,overflow:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
          <thead style={{position:'sticky',top:0,background:'var(--surface-2)',zIndex:1}}>
            <tr style={{borderBottom:'1px solid var(--border)'}}>
              <th style={{padding:'12px 24px',textAlign:'left',fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-3)',fontWeight:700}}>Articolo</th>
              <th style={{padding:'12px 12px',textAlign:'left',fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-3)',fontWeight:700}}>Categoria</th>
              <th style={{padding:'12px 12px',textAlign:'right',fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-3)',fontWeight:700}}>Stock</th>
              <th style={{padding:'12px 12px',textAlign:'left',fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-3)',fontWeight:700,width:200}}>Livello</th>
              <th style={{padding:'12px 12px',textAlign:'left',fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-3)',fontWeight:700}}>Fornitore</th>
              <th style={{padding:'12px 24px',textAlign:'right',fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-3)',fontWeight:700}}>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => {
              const ko = item.ko || item.stock===0;
              const low = !ko && item.stock<=item.min;
              return (
                <tr key={item.id} style={{
                  borderBottom:'1px solid var(--border)',
                  background: ko ? 'rgba(239,68,68,0.05)' : 'transparent'
                }}>
                  <td style={{padding:'14px 24px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      {ko && <span style={{
                        padding:'2px 8px',borderRadius:4,fontSize:9,fontWeight:800,
                        background:'var(--err)',color:'#fff',letterSpacing:'0.06em'
                      }}>86'D</span>}
                      {low && <span style={{
                        padding:'2px 8px',borderRadius:4,fontSize:9,fontWeight:800,
                        background:'var(--warn-soft)',color:'var(--warn)',border:'1px solid '+'rgba(234,179,8,0.4)'
                      }}>BASSO</span>}
                      <span style={{fontWeight:600,color:ko?'var(--text-2)':'var(--text)'}}>{item.name}</span>
                    </div>
                  </td>
                  <td style={{padding:'14px 12px',color:'var(--text-2)',fontSize:12}}>{item.cat}</td>
                  <td style={{padding:'14px 12px',textAlign:'right'}} className="tnum">
                    <b style={{fontSize:14,color:ko?'var(--err)':'var(--text)'}}>{item.stock}</b>
                    <span style={{fontSize:11,color:'var(--text-3)',marginLeft:3}}>{item.unit}</span>
                  </td>
                  <td style={{padding:'14px 12px'}}>
                    <StockBar stock={item.stock} min={item.min} avg={item.avg} ko={ko}/>
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:3,fontSize:9,color:'var(--text-3)'}}>
                      <span>min {item.min}</span>
                      <span className="tnum">media {item.avg}{item.unit}</span>
                    </div>
                  </td>
                  <td style={{padding:'14px 12px',color:'var(--text-3)',fontSize:11}}>{item.supplier}</td>
                  <td style={{padding:'14px 24px',textAlign:'right'}}>
                    <div style={{display:'inline-flex',gap:4,alignItems:'center'}}>
                      <button onClick={()=>adjust(item,-1)} disabled={ko} style={{
                        width:32,height:32,background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
                        color:ko?'var(--text-3)':'var(--text)',borderRadius:6,cursor:ko?'default':'pointer',fontWeight:700
                      }}>−</button>
                      <button onClick={()=>adjust(item,+1)} style={{
                        width:32,height:32,background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
                        color:'var(--text)',borderRadius:6,cursor:'pointer',fontWeight:700
                      }}>+</button>
                      <button onClick={()=>toggle86(item)} style={{
                        marginLeft:4,minHeight:32,padding:'0 12px',
                        background: ko?'var(--gold)':'rgba(239,68,68,0.12)',
                        border:'1px solid '+(ko?'var(--gold-ring)':'rgba(239,68,68,0.4)'),
                        color: ko?'#1A1A1A':'var(--err)',
                        borderRadius:6,fontSize:11,fontWeight:700,cursor:'pointer'
                      }}>{ko ? 'Ripristina' : "Marca 86'd"}</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr><td colSpan={6} style={{padding:'40px 20px',textAlign:'center',color:'var(--text-3)',fontSize:13}}>Nessun articolo in questo filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer info */}
      <div style={{padding:'12px 24px',borderTop:'1px solid var(--border)',background:'rgba(0,0,0,0.2)',
        display:'flex',alignItems:'center',gap:8,fontSize:11,color:'var(--text-3)'}}>
        <Sparkles size={12} style={{color:'var(--gold)'}}/>
        Gli articoli marcati <b style={{color:'var(--err)'}}>86'd</b> vengono nascosti automaticamente dal menu di sala e cucina.
        Ultimo aggiornamento: <b className="tnum" style={{color:'var(--text-2)'}}>2 min fa</b>.
      </div>
    </div>
  );
}
window.Inventory = Inventory;
