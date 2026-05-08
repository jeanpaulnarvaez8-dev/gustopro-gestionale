// KDS Cucina — kiosk mode tablet 22"
// Persona: cuoco | Momento: 4 ticket arrivano insieme, deve vedere allergeni in 2s
// Eventi: ascolta `new-order`, `order-item-added`; emette `item-status-updated`

const { useState: kS, useMemo: kM } = React;

function TicketCard({ ticket, onItemTap, onBump }){
  const allReady = ticket.items.every(i => i.status === 'ready');
  const color = ticketTimerColor(ticket.ageMin, ticket.kind);
  const allergens = [...new Set(ticket.items.flatMap(i => i.allergens))];
  const allergyAlert = ticket.items.some(i => i.allergyAlert);

  return (
    <div style={{
      background:'var(--surface)',
      border: `2px solid ${ticket.isNew ? 'var(--gold)' : (allReady ? 'var(--ok)' : 'var(--border-2)')}`,
      borderRadius:14,
      display:'flex',flexDirection:'column',overflow:'hidden',
      boxShadow: ticket.isNew ? '0 0 0 4px var(--gold-soft)' : 'none',
      animation: ticket.isNew ? 'flash-gold 1.6s ease-out' : 'none'
    }}>
      {/* Header */}
      <div style={{
        padding:'14px 16px',
        background: allergyAlert ? 'rgba(239,68,68,0.18)' : 'rgba(0,0,0,0.25)',
        borderBottom:`1px solid ${allergyAlert ? 'var(--err)' : 'var(--border)'}`,
        display:'flex',alignItems:'center',gap:12
      }}>
        <div>
          <div style={{
            fontSize:48,fontWeight:800,lineHeight:1,color:'var(--text)',
          }} className="tnum">{ticket.table}</div>
          <div style={{fontSize:11,color:'var(--text-3)',marginTop:2,letterSpacing:'0.06em',textTransform:'uppercase',fontWeight:700}}>
            {ticket.id} · {ticket.seats} cop.
          </div>
        </div>
        <div style={{flex:1,textAlign:'right'}}>
          <div style={{fontSize:36,fontWeight:800,color,lineHeight:1}} className="tnum">
            {Math.floor(ticket.ageMin)}'
          </div>
          <div style={{fontSize:11,color:'var(--text-3)',marginTop:2,fontWeight:600}}>
            {ticket.waiter}
          </div>
        </div>
      </div>

      {/* ALLERGENI in alto, sempre rossi se presenti — mai nascosti */}
      {(allergens.length > 0 || allergyAlert) && (
        <div style={{
          padding:'10px 16px',
          background: allergyAlert ? 'var(--err)' : 'rgba(239,68,68,0.12)',
          borderBottom:'1px solid '+(allergyAlert?'var(--err)':'rgba(239,68,68,0.3)'),
          display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'
        }}>
          <AlertTriangle size={16} style={{color: allergyAlert ? '#fff' : 'var(--err)'}}/>
          <span style={{
            fontSize:11,fontWeight:800,letterSpacing:'0.08em',
            color: allergyAlert ? '#fff' : 'var(--err)',textTransform:'uppercase'
          }}>
            {allergyAlert ? 'ALLERGIA SEGNALATA' : 'Allergeni'}:
          </span>
          {allergens.map(a => (
            <AllergenIcon key={a} code={a} size={22}/>
          ))}
        </div>
      )}

      {/* Items */}
      <div style={{padding:8,display:'flex',flexDirection:'column',gap:6,flex:1}}>
        {ticket.items.map(it => {
          const ready = it.status === 'ready';
          return (
            <button key={it.id} onClick={()=>onItemTap(ticket.id, it.id)} style={{
              padding:'10px 12px',
              background: ready ? 'rgba(34,197,94,0.14)' : 'rgba(255,255,255,0.03)',
              border:'1px solid '+(ready?'var(--ok)':'var(--border)'),
              borderRadius:8,cursor:'pointer',textAlign:'left',
              display:'flex',flexDirection:'column',gap:4
            }}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{
                  width:30,height:30,borderRadius:6,
                  background: ready ? 'var(--ok)' : 'var(--gold)',
                  color:'#1A1A1A',fontWeight:800,fontSize:15,
                  display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0
                }} className="tnum">{it.qty}</span>
                <span style={{flex:1,fontSize:18,fontWeight:600,
                  textDecoration: ready ? 'line-through' : 'none',
                  opacity: ready ? 0.6 : 1,color:'var(--text)'
                }}>{it.name}</span>
                {ready ? <Check size={20} style={{color:'var(--ok)'}}/> : <Flame size={18} style={{color:'var(--gold)'}}/>}
              </div>
              {it.mods?.length > 0 && (
                <div style={{paddingLeft:38,fontSize:14,fontWeight:700,
                  color: it.allergyAlert ? 'var(--err)' : 'var(--gold)'}}>
                  {it.mods.map(m=>'· '+m).join('  ')}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer bump */}
      <button onClick={()=>onBump(ticket.id)} disabled={!allReady} style={{
        minHeight:56,
        background: allReady ? 'var(--ok)' : 'rgba(255,255,255,0.03)',
        color: allReady ? '#fff' : 'var(--text-3)',
        border:0,fontSize:16,fontWeight:800,cursor: allReady?'pointer':'not-allowed',
        display:'flex',alignItems:'center',justifyContent:'center',gap:8,
        letterSpacing:'0.04em'
      }}>
        {allReady ? <><Send size={18}/>PASS · Manda al cameriere</> : 'In cottura...'}
      </button>
    </div>
  );
}

function KDS({ onBack }){
  const s = useStore();

  function tapItem(ticketId, itemId){
    store.set(s => ({
      ...s,
      tickets: s.tickets.map(t => t.id !== ticketId ? t : ({
        ...t,
        items: t.items.map(i => i.id !== itemId ? i : ({
          ...i,
          status: i.status === 'cooking' ? 'ready' : 'cooking'
        }))
      }))
    }));
  }

  function bumpTicket(ticketId){
    store.set(s => ({ ...s, tickets: s.tickets.filter(t => t.id !== ticketId) }));
    pushUndo('Ticket inviato al pass', ()=>{});
  }

  // Stats
  const stats = kM(() => {
    const total = s.tickets.length;
    const late = s.tickets.filter(t => t.ageMin > 20).length;
    const avgAge = total ? Math.round(s.tickets.reduce((a,t)=>a+t.ageMin,0)/total) : 0;
    return { total, late, avgAge };
  }, [s.tickets]);

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'#0a0a0a'}}>
      {/* Header KDS — grande, tablet 22" */}
      <div style={{
        padding:'14px 24px',background:'#0e0e0e',borderBottom:'1px solid var(--border-2)',
        display:'flex',alignItems:'center',gap:24
      }}>
        <button onClick={onBack} style={{
          minHeight:48,padding:'0 14px',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
          borderRadius:10,color:'var(--text)',cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:600
        }}><ArrowLeft size={18}/>Sala</button>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <ChefHat size={28} style={{color:'var(--gold)'}}/>
          <div>
            <div style={{fontSize:11,color:'var(--text-3)',letterSpacing:'0.1em',fontWeight:700,textTransform:'uppercase'}}>Cucina</div>
            <div style={{fontSize:22,fontWeight:800}}>KDS · Tablet 22"</div>
          </div>
        </div>
        <div style={{flex:1}}/>
        <div style={{display:'flex',gap:10}}>
          <div style={{padding:'8px 16px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:10}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase'}}>Ticket</div>
            <div style={{fontSize:24,fontWeight:800}} className="tnum">{stats.total}</div>
          </div>
          <div style={{padding:'8px 16px',background: stats.late?'rgba(239,68,68,0.14)':'rgba(255,255,255,0.03)',
            border:'1px solid '+(stats.late?'var(--err)':'var(--border)'),borderRadius:10}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',color: stats.late?'var(--err)':'var(--text-3)',textTransform:'uppercase'}}>In ritardo</div>
            <div style={{fontSize:24,fontWeight:800,color: stats.late?'var(--err)':'var(--text)'}} className="tnum">{stats.late}</div>
          </div>
          <div style={{padding:'8px 16px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:10}}>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase'}}>Media</div>
            <div style={{fontSize:24,fontWeight:800}} className="tnum">{stats.avgAge}'</div>
          </div>
        </div>
      </div>

      {/* Grid 4 colonne landscape */}
      <div className="scrollbar" style={{
        flex:1,overflow:'auto',padding:16,
        display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:14,
        alignContent:'start'
      }}>
        {s.tickets.map(t => (
          <TicketCard key={t.id} ticket={t} onItemTap={tapItem} onBump={bumpTicket}/>
        ))}
        {s.tickets.length === 0 && (
          <div style={{gridColumn:'1 / -1',textAlign:'center',padding:80,color:'var(--text-3)'}}>
            <ChefHat size={56} style={{opacity:0.3,marginBottom:14}}/>
            <div style={{fontSize:18,fontWeight:600}}>Nessun ticket attivo</div>
          </div>
        )}
      </div>

      {/* Recall bar */}
      <div style={{
        padding:'10px 24px',background:'#0e0e0e',borderTop:'1px solid var(--border-2)',
        display:'flex',alignItems:'center',gap:12
      }}>
        <span style={{fontSize:11,fontWeight:700,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase'}}>Recall (5 min)</span>
        <div style={{display:'flex',gap:6}}>
          {['T-398','T-397','T-395'].map(id => (
            <button key={id} style={{
              padding:'8px 14px',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
              borderRadius:8,color:'var(--text)',cursor:'pointer',fontSize:12,fontWeight:700,
              display:'flex',alignItems:'center',gap:6
            }}>
              <RefreshCw size={12}/>{id}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
window.KDS = KDS;
