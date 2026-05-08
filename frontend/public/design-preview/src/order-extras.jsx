// Modali / extras per Presa Ordine: Items a peso, Combo wizard, Race-condition
const { useState: mS, useEffect: mE } = React;

// ─── Modal "Items a peso" — tastierino numerico grande ───────────────────────
function WeightModal({ open, item, onClose, onConfirm }){
  const [g, setG] = mS('1200'); // grammi (es. 1200 = 1.2kg)
  mE(() => { if (open) setG('1200'); }, [open, item?.id]);

  if (!open || !item) return null;
  const kg = (parseInt(g||'0',10)||0) / 1000;
  const totalPrice = kg * (item.pricePerKg || 0);

  function tap(d){
    setG(prev => {
      if (prev === '0') return String(d);
      if (prev.length >= 5) return prev;
      return prev + d;
    });
  }
  function back(){ setG(prev => prev.length<=1 ? '0' : prev.slice(0,-1)); }
  function quick(v){ setG(String(v)); }

  return (
    <>
      <div onClick={onClose} style={{
        position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(2px)',zIndex:90,
        animation:'fade-in 150ms'
      }}/>
      <div style={{
        position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:91,
        background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:18,
        width:'min(520px, 92vw)',maxHeight:'92vh',overflow:'auto',
        animation:'slide-up 220ms ease-out',boxShadow:'0 20px 60px rgba(0,0,0,0.6)'
      }} className="scrollbar">
        {/* Header */}
        <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12}}>
          <div style={{
            width:44,height:44,borderRadius:10,background:'var(--gold-soft)',
            display:'flex',alignItems:'center',justifyContent:'center'
          }}><Waves size={22} style={{color:'var(--gold)'}}/></div>
          <div style={{flex:1}}>
            <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Pesa al banco</div>
            <div style={{fontSize:18,fontWeight:700,marginTop:2}}>{item.name}</div>
            <div style={{fontSize:12,color:'var(--gold)',marginTop:1}} className="tnum">{formatEur(item.pricePerKg)}/kg</div>
          </div>
          <button onClick={onClose} style={{
            width:40,height:40,borderRadius:20,background:'transparent',border:'1px solid var(--border)',
            color:'var(--text-2)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'
          }}><X size={18}/></button>
        </div>

        {/* Display peso */}
        <div style={{padding:'22px',textAlign:'center',background:'rgba(0,0,0,0.25)',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700,marginBottom:6}}>Peso</div>
          <div style={{fontSize:54,fontWeight:800,color:'var(--gold)',lineHeight:1}} className="tnum">
            {kg.toLocaleString('it-IT',{minimumFractionDigits:3,maximumFractionDigits:3})}<span style={{fontSize:24,color:'var(--text-2)',marginLeft:6,fontWeight:600}}>kg</span>
          </div>
          <div style={{fontSize:14,color:'var(--text-2)',marginTop:10}}>
            Totale: <b style={{color:'var(--text)',fontSize:18}} className="tnum">{formatEur(totalPrice)}</b>
          </div>

          {/* Shortcut peso */}
          <div style={{display:'flex',gap:6,justifyContent:'center',marginTop:14,flexWrap:'wrap'}}>
            {[400,600,800,1000,1200,1500,2000].map(v => (
              <button key={v} onClick={()=>quick(v)} style={{
                padding:'8px 14px',background:g==String(v)?'var(--gold-soft)':'rgba(255,255,255,0.04)',
                border:'1px solid '+(g==String(v)?'var(--gold-ring)':'var(--border)'),
                color:g==String(v)?'var(--gold)':'var(--text-2)',
                borderRadius:999,fontSize:12,fontWeight:700,cursor:'pointer'
              }}>{v/1000}kg</button>
            ))}
          </div>
        </div>

        {/* Tastierino grande 4×3 */}
        <div style={{padding:18,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
          {[1,2,3,4,5,6,7,8,9].map(d => (
            <button key={d} onClick={()=>tap(d)} style={{
              minHeight:64,fontSize:24,fontWeight:700,
              background:'rgba(255,255,255,0.04)',border:'1px solid var(--border-2)',
              borderRadius:10,color:'var(--text)',cursor:'pointer'
            }}>{d}</button>
          ))}
          <button onClick={back} style={{
            minHeight:64,background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',
            borderRadius:10,color:'var(--err)',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center'
          }}><Backspace size={22}/></button>
          <button onClick={()=>tap(0)} style={{
            minHeight:64,fontSize:24,fontWeight:700,
            background:'rgba(255,255,255,0.04)',border:'1px solid var(--border-2)',
            borderRadius:10,color:'var(--text)',cursor:'pointer'
          }}>0</button>
          <button onClick={()=>onConfirm({ ...item, weightKg:kg, computedPrice:totalPrice })} style={{
            minHeight:64,background:'var(--gold)',color:'#1A1A1A',border:0,
            borderRadius:10,fontWeight:800,fontSize:14,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',gap:6
          }}><Check size={20}/>OK</button>
        </div>
      </div>
    </>
  );
}
window.WeightModal = WeightModal;

// ─── Combo Wizard — menu degustazione a step (max 5) ────────────────────────
const COMBO = {
  id:'combo-mare',
  name:'Menu Degustazione Mare',
  price:65.00,
  steps:[
    { title:'Antipasto',  items:[{id:'i1',name:'Crudo di Mare'},{id:'i3',name:'Polpo arrosto'},{id:'i4',name:'Fritturina di paranza'}] },
    { title:'Primo',      items:[{id:'i5',name:'Spaghetti alle Vongole'},{id:'i6',name:'Linguine Astice (+€10)'},{id:'i7',name:'Risotto ai Frutti di Mare'}] },
    { title:'Secondo',    items:[{id:'i11',name:'Branzino al sale'},{id:'i12',name:'Orata in crosta'},{id:'i13',name:'Spigola al forno'}] },
    { title:'Contorno',   items:[{id:'i14',name:'Patate al forno'},{id:'i15',name:'Insalata mista'},{id:'i16',name:'Verdure grigliate'}] },
    { title:'Dolce',      items:[{id:'i17',name:'Tiramisù della Casa'},{id:'i18',name:'Pasticciotto Salentino'},{id:'i19',name:'Sorbetto Limone'}] },
  ]
};

function ComboWizard({ open, onClose, onConfirm }){
  const [step, setStep] = mS(0);
  const [picks, setPicks] = mS({});

  mE(() => { if (open){ setStep(0); setPicks({}); } }, [open]);
  if (!open) return null;

  const current = COMBO.steps[step];
  const picked = picks[step];
  const isLast = step === COMBO.steps.length - 1;
  const canNext = !!picked;

  function selectItem(it){ setPicks(p => ({ ...p, [step]: it })); }
  function next(){
    if (!canNext) return;
    if (isLast){
      onConfirm({ combo:COMBO, picks });
    } else setStep(s => s+1);
  }
  function back(){ setStep(s => Math.max(0, s-1)); }

  return (
    <>
      <div onClick={onClose} style={{
        position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',backdropFilter:'blur(2px)',zIndex:90,animation:'fade-in 150ms'
      }}/>
      <div style={{
        position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:91,
        background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:18,
        width:'min(640px, 94vw)',maxHeight:'92vh',display:'flex',flexDirection:'column',
        animation:'slide-up 220ms ease-out',boxShadow:'0 20px 60px rgba(0,0,0,0.6)'
      }}>
        {/* Header */}
        <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12}}>
          <div style={{
            width:44,height:44,borderRadius:10,background:'var(--gold-soft)',
            display:'flex',alignItems:'center',justifyContent:'center'
          }}><Sparkles size={22} style={{color:'var(--gold)'}}/></div>
          <div style={{flex:1}}>
            <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--gold)',textTransform:'uppercase',fontWeight:700}}>{COMBO.name}</div>
            <div style={{fontSize:13,color:'var(--text-2)',marginTop:2}}>
              <b className="tnum" style={{color:'var(--text)'}}>{formatEur(COMBO.price)}</b> a persona ·
              Step <b className="tnum" style={{color:'var(--text)'}}>{step+1}</b>/{COMBO.steps.length}
            </div>
          </div>
          <button onClick={onClose} style={{
            width:40,height:40,borderRadius:20,background:'transparent',border:'1px solid var(--border)',
            color:'var(--text-2)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'
          }}><X size={18}/></button>
        </div>

        {/* Stepper */}
        <div style={{padding:'14px 20px',display:'flex',alignItems:'center',gap:6}}>
          {COMBO.steps.map((s,i)=>{
            const done = !!picks[i];
            const cur = i === step;
            return (
              <React.Fragment key={i}>
                <button onClick={()=>setStep(i)} style={{
                  display:'flex',alignItems:'center',gap:6,padding:'4px 8px 4px 4px',
                  background: cur?'var(--gold-soft)':'transparent',
                  border:'1px solid '+(cur?'var(--gold-ring)':'var(--border)'),
                  borderRadius:999,cursor:'pointer'
                }}>
                  <span style={{
                    width:22,height:22,borderRadius:11,
                    background: done?'var(--ok)':(cur?'var(--gold)':'rgba(255,255,255,0.06)'),
                    color: (done||cur)?'#1A1A1A':'var(--text-2)',
                    display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800
                  }}>{done?'✓':i+1}</span>
                  <span style={{fontSize:11,fontWeight:700,color:cur?'var(--gold)':'var(--text-2)'}}>{s.title}</span>
                </button>
                {i<COMBO.steps.length-1 && <div style={{flex:1,height:1,background:'var(--border)'}}/>}
              </React.Fragment>
            );
          })}
        </div>

        {/* Body */}
        <div className="scrollbar" style={{flex:1,overflow:'auto',padding:'8px 20px 20px'}}>
          <div style={{fontSize:18,fontWeight:700,marginBottom:12}}>Scegli {current.title.toLowerCase()}</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:10}}>
            {current.items.map(it => {
              const sel = picked?.id === it.id;
              return (
                <button key={it.id} onClick={()=>selectItem(it)} style={{
                  minHeight:80,padding:'12px 14px',
                  background: sel?'var(--gold-soft)':'rgba(255,255,255,0.03)',
                  border:'2px solid '+(sel?'var(--gold)':'var(--border)'),
                  borderRadius:12,color:'var(--text)',cursor:'pointer',textAlign:'left',
                  display:'flex',flexDirection:'column',justifyContent:'space-between',gap:6
                }}>
                  <span style={{fontSize:14,fontWeight:600,lineHeight:1.25}}>{it.name}</span>
                  {sel && <span style={{fontSize:11,fontWeight:700,color:'var(--gold)',display:'flex',alignItems:'center',gap:4}}>
                    <Check size={12}/>Scelto
                  </span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{padding:'14px 20px',borderTop:'1px solid var(--border)',display:'flex',gap:10}}>
          <button onClick={back} disabled={step===0} style={{
            minHeight:48,padding:'0 18px',
            background:'transparent',border:'1px solid var(--border)',
            color:step===0?'var(--text-3)':'var(--text)',borderRadius:10,
            fontSize:13,fontWeight:600,cursor:step===0?'default':'pointer',
            display:'flex',alignItems:'center',gap:6
          }}><ArrowLeft size={16}/>Indietro</button>
          <div style={{flex:1}}/>
          <button onClick={next} disabled={!canNext} style={{
            minHeight:48,padding:'0 22px',
            background:canNext?'var(--gold)':'rgba(212,175,55,0.18)',
            color:canNext?'#1A1A1A':'var(--text-3)',
            border:0,borderRadius:10,fontSize:14,fontWeight:800,cursor:canNext?'pointer':'not-allowed',
            display:'flex',alignItems:'center',gap:8
          }}>
            {isLast ? <><Check size={18}/>Conferma combo</> : <>Avanti<ArrowRight size={16}/></>}
          </button>
        </div>
      </div>
    </>
  );
}
window.ComboWizard = ComboWizard;

// ─── Race-condition modal: tavolo già in uso da un altro cameriere ──────────
function RaceConditionModal({ open, otherWaiter, tableId, onTakeover, onCancel }){
  if (!open) return null;
  return (
    <>
      <div style={{
        position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)',zIndex:95,animation:'fade-in 150ms'
      }}/>
      <div style={{
        position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',zIndex:96,
        background:'var(--surface)',border:'2px solid var(--warn)',borderRadius:14,
        padding:24,width:'min(460px, 92vw)',animation:'slide-up 220ms'
      }}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
          <div style={{
            width:44,height:44,borderRadius:22,background:'rgba(234,179,8,0.18)',
            display:'flex',alignItems:'center',justifyContent:'center'
          }}><Users size={22} style={{color:'var(--warn)'}}/></div>
          <div>
            <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--warn)',textTransform:'uppercase',fontWeight:800}}>Tavolo in uso</div>
            <div style={{fontSize:18,fontWeight:700,marginTop:2}}>Tavolo {tableId}</div>
          </div>
        </div>
        <div style={{color:'var(--text-2)',fontSize:14,lineHeight:1.5,marginBottom:18}}>
          <b style={{color:'var(--text)'}}>{otherWaiter}</b> sta già lavorando su questo tavolo da poco.
          <br/>Vuoi subentrare?
        </div>
        <div style={{
          padding:10,background:'rgba(255,255,255,0.03)',border:'1px dashed var(--border-2)',
          borderRadius:8,marginBottom:18,fontSize:12,color:'var(--text-3)',display:'flex',alignItems:'center',gap:8
        }}>
          <Eye size={14}/>L'azione viene tracciata nell'audit log.
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={onCancel} style={{
            flex:1,minHeight:52,background:'transparent',border:'1px solid var(--border-2)',
            color:'var(--text)',borderRadius:10,fontSize:14,fontWeight:600,cursor:'pointer'
          }}>Annulla</button>
          <button onClick={onTakeover} style={{
            flex:1,minHeight:52,background:'var(--warn)',color:'#1A1A1A',border:0,
            borderRadius:10,fontSize:14,fontWeight:800,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',gap:8
          }}><RefreshCw size={16}/>Subentra</button>
        </div>
      </div>
    </>
  );
}
window.RaceConditionModal = RaceConditionModal;
