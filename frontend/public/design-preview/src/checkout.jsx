// Cassa & Pre-conto — split conto, multi-tender, IVA per aliquota
// Persona: cassiere | Momento: tavolo da 12 chiede split in 5 parti, fila all'ingresso

const { useState: cS, useMemo: cM } = React;

function Checkout({ onBack }){
  const s = useStore();
  const cart = s.cart;
  const tableId = s.selectedTableId || cart.tableId;

  const [splitMode, setSplitMode] = cS('persona'); // persona / portata / custom
  const [parts, setParts] = cS(5);
  const [tenders, setTenders] = cS({ cash:0, card:0, room:0 });
  const [paid, setPaid] = cS(false);

  const totals = cM(() => {
    const sub = cart.items.reduce((a,b)=>a+b.price*b.qty, 0);
    // IVA suddivisione semplificata: vini/bibite 22%, cibo 10%, acqua 4%
    const iva10 = sub * 0.6 * 0.10;
    const iva22 = sub * 0.35 * 0.22;
    const iva4 =  sub * 0.05 * 0.04;
    const total = sub + iva10 + iva22 + iva4;
    return { sub, iva10, iva22, iva4, total };
  }, [cart]);

  const perParte = totals.total / parts;
  const totalTender = tenders.cash + tenders.card + tenders.room;
  const remaining = totals.total - totalTender;
  const change = totalTender > totals.total ? totalTender - totals.total : 0;

  function setTender(k, v){ setTenders(t => ({ ...t, [k]:Math.max(0,v) })); }

  function pay(){
    setPaid(true);
    setTimeout(() => {
      setTableStatus(tableId, 'dirty');
      pushUndo('Pagamento completato · Tavolo ' + tableId, ()=>{});
      store.set({ page:'tables' });
    }, 1500);
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      <div style={{padding:'14px 20px',display:'flex',alignItems:'center',gap:14,borderBottom:'1px solid var(--border)'}}>
        <button onClick={onBack} style={{
          minHeight:44,padding:'0 14px',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
          borderRadius:10,color:'var(--text)',cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:600
        }}><ArrowLeft size={18}/>Sala</button>
        <div>
          <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Cassa</div>
          <div style={{fontSize:22,fontWeight:800,marginTop:2}}>Tavolo {tableId} · Pagamento</div>
        </div>
        <div style={{flex:1}}/>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:11,letterSpacing:'0.08em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Da pagare</div>
          <div style={{fontSize:34,fontWeight:800,color:'var(--gold)'}} className="tnum">{formatEur(totals.total)}</div>
        </div>
      </div>

      <div style={{flex:1,display:'grid',gridTemplateColumns:'1.1fr 1fr',overflow:'hidden'}}>
        {/* Sx: dettaglio + IVA + split */}
        <div className="scrollbar" style={{padding:20,overflow:'auto',borderRight:'1px solid var(--border)'}}>
          <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700,marginBottom:10}}>Dettaglio ordine</div>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,marginBottom:18}}>
            {cart.items.map((line,i) => (
              <div key={line.id} style={{
                padding:'12px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',
                borderBottom: i<cart.items.length-1 ? '1px solid var(--border)' : 'none'
              }}>
                <div>
                  <div style={{fontSize:13,fontWeight:600}}>{line.name}</div>
                  <div style={{fontSize:11,color:'var(--text-2)'}} className="tnum">×{line.qty} · {formatEur(line.price)}/cad</div>
                </div>
                <div style={{fontSize:14,fontWeight:700}} className="tnum">{formatEur(line.price*line.qty)}</div>
              </div>
            ))}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:18}}>
            {[
              { lbl:'IVA 4%', v:totals.iva4 },
              { lbl:'IVA 10%', v:totals.iva10 },
              { lbl:'IVA 22%', v:totals.iva22 },
            ].map(b => (
              <div key={b.lbl} style={{padding:'10px 12px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10}}>
                <div style={{fontSize:10,letterSpacing:'0.08em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>{b.lbl}</div>
                <div style={{fontSize:15,fontWeight:700,marginTop:2}} className="tnum">{formatEur(b.v)}</div>
              </div>
            ))}
          </div>

          <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700,marginBottom:10}}>Split conto</div>
          <div style={{display:'flex',gap:6,marginBottom:12}}>
            {[
              { id:'persona', lbl:'Per persona', icon:<Users size={14}/> },
              { id:'portata', lbl:'Per portata', icon:<Utensils size={14}/> },
              { id:'custom',  lbl:'Custom %',    icon:<Edit size={14}/> },
            ].map(t => {
              const a = splitMode === t.id;
              return (
                <button key={t.id} onClick={()=>setSplitMode(t.id)} style={{
                  flex:1,minHeight:44,padding:'8px 12px',
                  background:a?'var(--gold-soft)':'rgba(255,255,255,0.03)',
                  border:'1px solid '+(a?'var(--gold-ring)':'var(--border)'),
                  color:a?'var(--gold)':'var(--text)',borderRadius:10,
                  cursor:'pointer',fontSize:12,fontWeight:700,
                  display:'flex',alignItems:'center',justifyContent:'center',gap:6
                }}>{t.icon}{t.lbl}</button>
              );
            })}
          </div>

          {splitMode === 'persona' && (
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:14}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <span style={{fontSize:13,color:'var(--text-2)'}}>Numero di persone</span>
                <div style={{display:'flex',alignItems:'center',gap:0,background:'rgba(0,0,0,0.3)',borderRadius:10,padding:3}}>
                  <button onClick={()=>setParts(p=>Math.max(1,p-1))} style={{
                    width:44,height:44,border:0,borderRadius:8,background:'transparent',color:'var(--text)',cursor:'pointer',
                    display:'flex',alignItems:'center',justifyContent:'center'
                  }}><Minus size={16}/></button>
                  <span style={{minWidth:36,textAlign:'center',fontWeight:800,fontSize:18}} className="tnum">{parts}</span>
                  <button onClick={()=>setParts(p=>p+1)} style={{
                    width:44,height:44,border:0,borderRadius:8,background:'transparent',color:'var(--text)',cursor:'pointer',
                    display:'flex',alignItems:'center',justifyContent:'center'
                  }}><Plus size={16}/></button>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(parts,5)},1fr)`,gap:6}}>
                {Array.from({length:parts}).map((_,i)=>(
                  <div key={i} style={{padding:10,background:'rgba(212,175,55,0.08)',border:'1px solid var(--gold-ring)',borderRadius:8,textAlign:'center'}}>
                    <div style={{fontSize:10,fontWeight:700,color:'var(--gold)',letterSpacing:'0.08em'}}>P{i+1}</div>
                    <div style={{fontSize:14,fontWeight:800,color:'var(--gold)'}} className="tnum">{formatEur(perParte)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Dx: tender / tastierino */}
        <div style={{padding:20,display:'flex',flexDirection:'column',gap:14,overflow:'hidden'}}>
          <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Multi-tender</div>

          {[
            { k:'cash', lbl:'Contanti',   icon:<Banknote size={18}/>, color:'var(--ok)' },
            { k:'card', lbl:'Carta',      icon:<CreditCard size={18}/>, color:'var(--info)' },
            { k:'room', lbl:'Room charge',icon:<Home size={18}/>, color:'var(--gold)' },
          ].map(t => (
            <div key={t.k} style={{
              background:'var(--surface)',border:'1px solid '+(tenders[t.k]>0?t.color:'var(--border)'),
              borderRadius:12,padding:'12px 14px',display:'flex',alignItems:'center',gap:12
            }}>
              <div style={{
                width:40,height:40,borderRadius:8,background:`${t.color}20`,
                display:'flex',alignItems:'center',justifyContent:'center',color:t.color
              }}>{t.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700}}>{t.lbl}</div>
                <div style={{fontSize:11,color:'var(--text-3)'}}>tocca per importo</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                {[5,10,20,50].map(v=>(
                  <button key={v} onClick={()=>setTender(t.k, tenders[t.k]+v)} style={{
                    minWidth:44,minHeight:36,background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
                    borderRadius:8,color:'var(--text)',cursor:'pointer',fontSize:12,fontWeight:700
                  }}>+{v}</button>
                ))}
                <div style={{minWidth:90,textAlign:'right',fontSize:16,fontWeight:800,color:tenders[t.k]>0?t.color:'var(--text-3)'}} className="tnum">
                  {formatEur(tenders[t.k])}
                </div>
                {tenders[t.k]>0 && (
                  <button onClick={()=>setTender(t.k,0)} style={{width:32,height:32,border:'1px solid var(--border)',borderRadius:6,background:'transparent',color:'var(--text-3)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><X size={14}/></button>
                )}
              </div>
            </div>
          ))}

          <button onClick={()=>setTender('cash', tenders.cash + remaining)} disabled={remaining<=0} style={{
            minHeight:44,background:'rgba(255,255,255,0.04)',border:'1px dashed var(--border-2)',
            color:'var(--text-2)',borderRadius:10,fontSize:12,fontWeight:600,cursor: remaining<=0?'default':'pointer'
          }}>+ Aggiungi resto in contanti ({formatEur(Math.max(0,remaining))})</button>

          <div style={{flex:1}}/>

          <div style={{
            background:'var(--canvas)',border:'1px solid var(--border-2)',borderRadius:12,padding:14,
            display:'flex',justifyContent:'space-between',alignItems:'center'
          }}>
            <div>
              <div style={{fontSize:11,letterSpacing:'0.08em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>
                {change>0 ? 'Resto da dare' : (remaining>0 ? 'Mancano' : 'Saldato')}
              </div>
              <div style={{fontSize:26,fontWeight:800,marginTop:2,
                color: change>0?'var(--gold)' : (remaining>0?'var(--err)':'var(--ok)')
              }} className="tnum">
                {change>0 ? formatEur(change) : (remaining>0 ? formatEur(remaining) : formatEur(0))}
              </div>
            </div>
            <button onClick={pay} disabled={remaining > 0 && !paid} style={{
              minHeight:64,padding:'0 28px',
              background: paid ? 'var(--ok)' : (remaining<=0 ? 'var(--gold)' : 'rgba(212,175,55,0.18)'),
              color: paid ? '#fff' : (remaining<=0 ? '#1A1A1A' : 'var(--text-3)'),
              border:0,borderRadius:12,fontSize:16,fontWeight:800,cursor: remaining<=0?'pointer':'not-allowed',
              display:'flex',alignItems:'center',gap:10
            }}>
              {paid ? <><Check size={20}/>Pagato!</> : <><Receipt size={20}/>Conferma pagamento</>}
            </button>
          </div>

          <button style={{
            minHeight:44,background:'transparent',border:'1px solid var(--border)',borderRadius:10,
            color:'var(--text-2)',fontSize:13,fontWeight:600,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',gap:8
          }}>
            <Receipt size={14}/>Stampa pre-conto (non fiscale)
          </button>
        </div>
      </div>
    </div>
  );
}
window.Checkout = Checkout;
