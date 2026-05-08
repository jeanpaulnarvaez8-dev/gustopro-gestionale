// Prenotazioni — calendario timeline + assegnazione tavoli
const { useState: rS, useMemo: rM } = React;

const SLOTS = ['12:30','13:00','13:30','14:00','19:30','20:00','20:30','21:00','21:30'];

const RESV_SEED = [
  { id:1, name:'Famiglia Greco', people:6, slot:'20:00', table:'M3',  zone:'mare',    phone:'+39 333 1234567', notes:'Compleanno · torta', status:'confirmed' },
  { id:2, name:'Bianchi',        people:2, slot:'20:00', table:'V1',  zone:'veranda', phone:'+39 348 9876543', notes:'Allergia crostacei',  status:'confirmed' },
  { id:3, name:'De Luca',        people:4, slot:'20:30', table:'S2',  zone:'sala',    phone:'+39 392 1112233', notes:'',                    status:'pending' },
  { id:4, name:'Russo',          people:8, slot:'21:00', table:'VIP1',zone:'vip1',    phone:'+39 340 4445566', notes:'Vino prenotato',      status:'confirmed' },
  { id:5, name:'Marinetti',      people:2, slot:'13:00', table:'V2',  zone:'veranda', phone:'+39 327 7778899', notes:'',                    status:'arrived' },
  { id:6, name:'Conte',          people:5, slot:'13:30', table:'S5',  zone:'sala',    phone:'+39 366 0001122', notes:'Bambini ×2',          status:'no-show' },
  { id:7, name:'Rossi',          people:3, slot:'19:30', table:null,  zone:null,      phone:'+39 351 3334455', notes:'Da assegnare',        status:'pending' },
  { id:8, name:'Esposito',       people:4, slot:'21:30', table:'M5',  zone:'mare',    phone:'+39 320 5556677', notes:'Anniversario',        status:'confirmed' },
];

const RES_STATUS = {
  confirmed: { label:'Confermata', color:'var(--ok)',   bg:'rgba(34,197,94,0.14)' },
  pending:   { label:'In attesa',  color:'var(--warn)', bg:'rgba(234,179,8,0.14)' },
  arrived:   { label:'Arrivata',   color:'var(--info)', bg:'rgba(59,130,246,0.14)' },
  'no-show': { label:'No-show',    color:'var(--err)',  bg:'rgba(239,68,68,0.14)' },
};

function ReservationCard({ r, onClick }){
  const st = RES_STATUS[r.status];
  return (
    <button onClick={onClick} style={{
      width:'100%',textAlign:'left',padding:'14px 16px',
      background:'rgba(255,255,255,0.02)',border:'1px solid var(--border)',
      borderRadius:10,cursor:'pointer',color:'var(--text)',
      display:'flex',alignItems:'center',gap:12
    }}>
      <div style={{
        width:48,height:48,borderRadius:10,background:st.bg,
        border:'1px solid '+st.color+'66',
        display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'
      }}>
        <div style={{fontSize:14,fontWeight:800,color:st.color}} className="tnum">{r.slot}</div>
        <div style={{fontSize:9,color:st.color,fontWeight:700}}>{r.people}p</div>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14,fontWeight:700,marginBottom:2}}>{r.name}</div>
        <div style={{fontSize:11,color:'var(--text-3)',display:'flex',gap:8,alignItems:'center'}}>
          {r.table ? <><b style={{color:'var(--text-2)'}}>{r.table}</b> · {r.zone}</> : <span style={{color:'var(--warn)'}}>Tavolo da assegnare</span>}
          {r.notes && <span style={{color:'var(--text-3)'}}>· {r.notes}</span>}
        </div>
      </div>
      <span style={{
        padding:'3px 10px',borderRadius:999,fontSize:10,fontWeight:700,
        background:st.bg,color:st.color,border:'1px solid '+st.color+'40'
      }}>{st.label}</span>
    </button>
  );
}

function Reservations({ onBack }){
  const [day, setDay] = rS('today');
  const [filter, setFilter] = rS('all');
  const [selected, setSelected] = rS(null);
  const [resvs] = rS(RESV_SEED);

  const filtered = rM(() => resvs.filter(r =>
    filter === 'all' || filter === r.status
  ).sort((a,b)=>a.slot.localeCompare(b.slot)), [resvs, filter]);

  const stats = rM(() => ({
    total: resvs.length,
    people: resvs.reduce((a,b)=>a+b.people,0),
    pending: resvs.filter(r=>r.status==='pending').length,
    unassigned: resvs.filter(r=>!r.table).length,
  }), [resvs]);

  const slotOccupancy = rM(()=>{
    const m = {};
    SLOTS.forEach(s => m[s]=0);
    resvs.forEach(r => { if (m[r.slot]!=null) m[r.slot]+=r.people; });
    return m;
  }, [resvs]);

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'14px 24px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:14}}>
        <button onClick={onBack} style={{
          minHeight:44,padding:'0 14px',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
          borderRadius:10,color:'var(--text)',cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:600
        }}><ArrowLeft size={18}/>Sala</button>
        <div style={{flex:1}}>
          <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Prenotazioni</div>
          <div style={{fontSize:20,fontWeight:800,marginTop:2}}>{day==='today'?'Oggi':day==='tomorrow'?'Domani':'Dopodomani'} · <span style={{color:'var(--gold)'}}>{stats.total} prenotaz.</span> <span style={{color:'var(--text-3)',fontWeight:600,fontSize:14}}>· {stats.people} coperti previsti</span></div>
        </div>
        <div style={{display:'flex',gap:4,padding:4,background:'rgba(0,0,0,0.25)',borderRadius:10}}>
          {[{id:'today',l:'Oggi'},{id:'tomorrow',l:'Domani'},{id:'after',l:'+2 gg'}].map(d=>(
            <button key={d.id} onClick={()=>setDay(d.id)} style={{
              minHeight:38,padding:'0 14px',
              background:day===d.id?'var(--gold-soft)':'transparent',
              border:'1px solid '+(day===d.id?'var(--gold-ring)':'transparent'),
              color:day===d.id?'var(--gold)':'var(--text-2)',
              borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer'
            }}>{d.l}</button>
          ))}
        </div>
        <button style={{
          minHeight:44,padding:'0 18px',background:'var(--gold)',color:'#1A1A1A',border:0,
          borderRadius:10,fontSize:13,fontWeight:800,cursor:'pointer',
          display:'flex',alignItems:'center',gap:8
        }}><Plus size={16}/>Nuova prenotazione</button>
      </div>

      <div style={{flex:1,display:'grid',gridTemplateColumns:'1.4fr 1fr',overflow:'hidden'}}>
        {/* Lista */}
        <div style={{display:'flex',flexDirection:'column',overflow:'hidden',borderRight:'1px solid var(--border)'}}>
          <div className="scrollbar" style={{display:'flex',gap:6,padding:'12px 24px',overflowX:'auto',borderBottom:'1px solid var(--border)'}}>
            {[
              {id:'all',l:`Tutte (${stats.total})`},
              {id:'pending',l:`Da confermare (${stats.pending})`},
              {id:'confirmed',l:'Confermate'},
              {id:'arrived',l:'Arrivate'},
              {id:'no-show',l:'No-show'},
            ].map(f=>(
              <button key={f.id} onClick={()=>setFilter(f.id)} style={{
                flexShrink:0,minHeight:38,padding:'8px 14px',
                border:'1px solid '+(filter===f.id?'var(--gold-ring)':'var(--border)'),
                background: filter===f.id?'var(--gold-soft)':'rgba(255,255,255,0.02)',
                color: filter===f.id?'var(--gold)':'var(--text-2)',
                borderRadius:999,fontSize:12,fontWeight:600,cursor:'pointer'
              }}>{f.l}</button>
            ))}
          </div>
          <div className="scrollbar" style={{flex:1,overflow:'auto',padding:'14px 24px',display:'flex',flexDirection:'column',gap:8}}>
            {filtered.map(r => <ReservationCard key={r.id} r={r} onClick={()=>setSelected(r)}/>)}
            {!filtered.length && (
              <div style={{textAlign:'center',color:'var(--text-3)',padding:'40px 20px',fontSize:13}}>Nessuna prenotazione in questo filtro.</div>
            )}
          </div>
        </div>

        {/* Timeline + dettaglio */}
        <div style={{display:'flex',flexDirection:'column',overflow:'hidden',background:'var(--surface-2)'}}>
          <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)'}}>
            <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Riempimento turno</div>
            <div style={{fontSize:14,fontWeight:700,marginTop:2}}>Coperti per slot</div>
          </div>
          <div style={{padding:'16px 20px'}}>
            {SLOTS.map(s => {
              const cov = slotOccupancy[s];
              const cap = 80; // capienza massima
              const pct = Math.min(100, (cov/cap)*100);
              const overload = cov > cap*0.8;
              return (
                <div key={s} style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                  <div style={{width:50,fontSize:12,fontWeight:700,color:'var(--text-2)'}} className="tnum">{s}</div>
                  <div style={{flex:1,height:18,background:'rgba(0,0,0,0.3)',borderRadius:9,overflow:'hidden',position:'relative'}}>
                    <div style={{
                      height:'100%',width:`${pct}%`,
                      background: overload?'linear-gradient(90deg,var(--gold),var(--err))':'var(--gold)',
                      transition:'width 220ms'
                    }}/>
                    {cov>0 && (
                      <span style={{
                        position:'absolute',right:8,top:0,bottom:0,
                        display:'flex',alignItems:'center',fontSize:10,fontWeight:800,
                        color: pct>50?'#1A1A1A':'var(--text-2)'
                      }} className="tnum">{cov}p</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dettaglio prenotazione */}
          <div style={{flex:1,overflow:'auto',padding:'8px 20px 20px',borderTop:'1px solid var(--border)'}} className="scrollbar">
            {!selected ? (
              <div style={{textAlign:'center',color:'var(--text-3)',padding:'40px 20px',fontSize:13}}>
                Tocca una prenotazione<br/>per vedere i dettagli
              </div>
            ) : (
              <div style={{paddingTop:14}}>
                <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--gold)',textTransform:'uppercase',fontWeight:700}}>Dettaglio</div>
                <div style={{fontSize:20,fontWeight:800,marginTop:4}}>{selected.name}</div>
                <div style={{fontSize:13,color:'var(--text-2)',marginTop:4}}>{selected.slot} · <b>{selected.people} persone</b></div>

                <div style={{marginTop:18,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                  <div style={{padding:'10px 12px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:8}}>
                    <div style={{fontSize:10,color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Tavolo</div>
                    <div style={{fontSize:14,fontWeight:700,marginTop:3}}>{selected.table || '— da assegnare'}</div>
                  </div>
                  <div style={{padding:'10px 12px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:8}}>
                    <div style={{fontSize:10,color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Telefono</div>
                    <div style={{fontSize:13,fontWeight:600,marginTop:3}} className="tnum">{selected.phone}</div>
                  </div>
                </div>
                {selected.notes && (
                  <div style={{marginTop:8,padding:'10px 12px',background:'rgba(212,175,55,0.06)',border:'1px solid var(--gold-ring)',borderRadius:8,fontSize:12,color:'var(--text-2)'}}>
                    <Sparkles size={12} style={{color:'var(--gold)',marginRight:6,verticalAlign:'middle'}}/>{selected.notes}
                  </div>
                )}

                <div style={{marginTop:18,display:'flex',gap:8}}>
                  <button style={{
                    flex:1,minHeight:48,background:'var(--gold)',color:'#1A1A1A',border:0,
                    borderRadius:10,fontSize:13,fontWeight:800,cursor:'pointer',
                    display:'flex',alignItems:'center',justifyContent:'center',gap:6
                  }}><Check size={14}/>Conferma arrivo</button>
                  <button style={{
                    minHeight:48,padding:'0 14px',background:'transparent',border:'1px solid var(--border-2)',
                    color:'var(--text)',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer'
                  }}>Modifica</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
window.Reservations = Reservations;
