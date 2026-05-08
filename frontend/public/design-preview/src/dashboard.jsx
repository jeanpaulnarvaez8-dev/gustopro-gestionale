// Dashboard Manager — KPI giornata, grafici, top piatti
// Persona: manager/proprietario | Momento: visione d'insieme tra il pranzo e la cena
const { useState: dS, useMemo: dM, useEffect: dE } = React;

// Dati seed realistici per il Riva Beach (giornata tipo)
const SEED_HOURS = [
  { h:'12', cov:18, inc: 420 },
  { h:'13', cov:42, inc:1240 },
  { h:'14', cov:31, inc: 980 },
  { h:'15', cov: 8, inc: 180 },
  { h:'16', cov: 4, inc:  90 },
  { h:'17', cov: 6, inc: 140 },
  { h:'18', cov:12, inc: 280 },
  { h:'19', cov:38, inc:1120 },
  { h:'20', cov:62, inc:1980 },
  { h:'21', cov:54, inc:1740 },
  { h:'22', cov:28, inc: 720 },
  { h:'23', cov:11, inc: 280 },
];
const TOP_DISHES = [
  { name:'Spaghetti alle Vongole', qty:34, rev:680, cat:'Primi' },
  { name:'Branzino al sale',       qty:22, rev:836, cat:'Secondi' },
  { name:'Crudo di Mare',          qty:18, rev:540, cat:'Antipasti' },
  { name:'Linguine all\'Astice',   qty:14, rev:602, cat:'Primi' },
  { name:'Tiramisù della Casa',    qty:31, rev:217, cat:'Dolci' },
  { name:'Fritturina di paranza',  qty:19, rev:399, cat:'Antipasti' },
];
const STAFF_TODAY = [
  { name:'Marco',   role:'Cameriere', tables:5, tips:42, hrs:7.5 },
  { name:'Laura',   role:'Cameriera', tables:6, tips:58, hrs:8.0 },
  { name:'Antonio', role:'Cameriere', tables:4, tips:31, hrs:6.5 },
  { name:'Giulia',  role:'Cameriera', tables:5, tips:48, hrs:7.5 },
];

function KpiCard({ label, value, delta, sub, icon, accent }){
  const positive = delta >= 0;
  return (
    <div style={{
      background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,
      padding:'18px 20px',display:'flex',flexDirection:'column',gap:8,minHeight:120
    }}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{
          width:36,height:36,borderRadius:9,background:accent||'var(--gold-soft)',
          display:'flex',alignItems:'center',justifyContent:'center',color:'var(--gold)'
        }}>{icon}</div>
        <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>{label}</div>
      </div>
      <div style={{fontSize:28,fontWeight:800,lineHeight:1.05,whiteSpace:'nowrap'}} className="tnum">{value}</div>
      <div style={{display:'flex',alignItems:'center',gap:8,fontSize:12}}>
        {delta != null && (
          <span style={{
            color: positive?'var(--ok)':'var(--err)',fontWeight:700,
            display:'flex',alignItems:'center',gap:3
          }}>
            {positive?'▲':'▼'}{Math.abs(delta)}%
          </span>
        )}
        <span style={{color:'var(--text-3)'}}>{sub}</span>
      </div>
    </div>
  );
}

function HourlyChart({ data }){
  const max = Math.max(...data.map(d=>d.inc));
  const W = 600, H = 180, P = 24;
  const bw = (W - P*2) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{width:'100%',height:200,display:'block'}}>
      <line x1={P} x2={W-P} y1={H-P} y2={H-P} stroke="var(--border-2)" strokeWidth="1"/>
      {data.map((d,i)=>{
        const h = (d.inc/max) * (H-P*2);
        const x = P + i*bw + 4;
        const y = H - P - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw-8} height={h} rx={3}
              fill={d.inc>1500?'var(--gold)':'rgba(212,175,55,0.4)'}/>
            <text x={x+(bw-8)/2} y={H-P+14} textAnchor="middle" fontSize="10" fill="var(--text-3)" fontWeight="600">{d.h}</text>
            {d.inc>1500 && (
              <text x={x+(bw-8)/2} y={y-4} textAnchor="middle" fontSize="9" fill="var(--gold)" fontWeight="700" className="tnum">{Math.round(d.inc/100)/10}k</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function CovBars({ data }){
  const max = Math.max(...data.map(d=>d.cov));
  return (
    <div style={{display:'flex',alignItems:'flex-end',gap:4,height:90,padding:'0 4px'}}>
      {data.map((d,i)=>(
        <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
          <div style={{
            width:'100%',height:`${(d.cov/max)*100}%`,
            background:d.cov>40?'var(--info)':'rgba(59,130,246,0.4)',
            borderRadius:'3px 3px 0 0',minHeight:2
          }}/>
          <div style={{fontSize:9,color:'var(--text-3)',fontWeight:600}}>{d.h}</div>
        </div>
      ))}
    </div>
  );
}

function Dashboard({ onNavigate }){
  const s = useStore();
  const [period, setPeriod] = dS('today');

  const totalCov = SEED_HOURS.reduce((a,b)=>a+b.cov,0);
  const totalRev = SEED_HOURS.reduce((a,b)=>a+b.inc,0);
  const avgCheck = totalRev / totalCov;
  const occupiedNow = s.tables.filter(t=>t.status==='occupied').length;
  const totalTables = s.tables.length;
  const pctOcc = Math.round((occupiedNow/totalTables)*100);

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'auto'}} className="scrollbar">
      {/* Header */}
      <div style={{padding:'18px 24px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:16}}>
        <div style={{flex:1}}>
          <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Manager Dashboard</div>
          <div style={{fontSize:22,fontWeight:800,marginTop:2}}>Riva Beach Salento · {new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'})}</div>
        </div>
        <div style={{display:'flex',gap:4,padding:4,background:'rgba(0,0,0,0.25)',borderRadius:10}}>
          {[{id:'today',l:'Oggi'},{id:'week',l:'7 giorni'},{id:'month',l:'30 giorni'}].map(p=>(
            <button key={p.id} onClick={()=>setPeriod(p.id)} style={{
              minHeight:38,padding:'0 16px',
              background:period===p.id?'var(--gold-soft)':'transparent',
              border:'1px solid '+(period===p.id?'var(--gold-ring)':'transparent'),
              color:period===p.id?'var(--gold)':'var(--text-2)',
              borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer'
            }}>{p.l}</button>
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div style={{padding:'20px 24px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14}}>
        <KpiCard label="Incasso giorno" value={formatEur(totalRev)} delta={+12} sub="vs ieri"
          icon={<Banknote size={18}/>} accent="rgba(212,175,55,0.18)"/>
        <KpiCard label="Coperti" value={totalCov} delta={+8} sub={`${pctOcc}% sale ora occupata`}
          icon={<Users size={18}/>}/>
        <KpiCard label="Scontrino medio" value={formatEur(avgCheck)} delta={+3} sub="target €38"
          icon={<Receipt size={18}/>}/>
        <KpiCard label="Tempo medio servizio" value="42min" delta={-6} sub="dal sit-down al check"
          icon={<Clock size={18}/>}/>
      </div>

      {/* Charts row */}
      <div style={{padding:'0 24px 20px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <div style={{
          background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,padding:'18px 20px'
        }}>
          <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:14}}>
            <div>
              <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Incasso per ora</div>
              <div style={{fontSize:16,fontWeight:700,marginTop:2}}>Picco cena · 20:00 · {formatEur(1980)}</div>
            </div>
            <div style={{fontSize:11,color:'var(--text-3)'}}>€ per fascia oraria</div>
          </div>
          <HourlyChart data={SEED_HOURS}/>
        </div>
        <div style={{
          background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,padding:'18px 20px'
        }}>
          <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:14}}>
            <div>
              <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Coperti per ora</div>
              <div style={{fontSize:16,fontWeight:700,marginTop:2}}>Riempimento sera</div>
            </div>
          </div>
          <CovBars data={SEED_HOURS}/>
          <div style={{marginTop:14,padding:'10px 12px',background:'rgba(212,175,55,0.06)',
            border:'1px solid var(--gold-ring)',borderRadius:8,fontSize:12,color:'var(--text-2)',
            display:'flex',alignItems:'center',gap:8}}>
            <Sparkles size={14} style={{color:'var(--gold)'}}/>
            <b style={{color:'var(--gold)'}}>Insight:</b> stasera +18% coperti vs media. Considera turno extra cucina.
          </div>
        </div>
      </div>

      {/* Top piatti + staff */}
      <div style={{padding:'0 24px 24px',display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:14}}>
        <div style={{
          background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden'
        }}>
          <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center'}}>
            <div style={{flex:1}}>
              <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Top piatti oggi</div>
              <div style={{fontSize:16,fontWeight:700,marginTop:2}}>Più venduti per quantità</div>
            </div>
            <button style={{
              padding:'6px 12px',background:'transparent',border:'1px solid var(--border)',
              color:'var(--text-2)',borderRadius:6,fontSize:11,fontWeight:600,cursor:'pointer'
            }}>Vedi tutti</button>
          </div>
          <div>
            {TOP_DISHES.map((d,i)=>{
              const max = TOP_DISHES[0].qty;
              const pct = (d.qty/max)*100;
              return (
                <div key={i} style={{padding:'12px 20px',borderBottom:i<TOP_DISHES.length-1?'1px solid var(--border)':'none',display:'flex',alignItems:'center',gap:14}}>
                  <div style={{
                    width:28,height:28,borderRadius:14,background:i===0?'var(--gold)':'rgba(255,255,255,0.06)',
                    color:i===0?'#1A1A1A':'var(--text-2)',
                    display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:12,flexShrink:0
                  }}>{i+1}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>{d.name}</div>
                    <div style={{height:4,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${pct}%`,background:i===0?'var(--gold)':'rgba(212,175,55,0.45)'}}/>
                    </div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0,minWidth:80}}>
                    <div style={{fontSize:14,fontWeight:800}} className="tnum">×{d.qty}</div>
                    <div style={{fontSize:11,color:'var(--text-3)'}} className="tnum">{formatEur(d.rev)}</div>
                  </div>
                  <div style={{
                    padding:'2px 8px',borderRadius:4,fontSize:10,fontWeight:700,
                    background:'rgba(255,255,255,0.04)',color:'var(--text-3)'
                  }}>{d.cat}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{
          background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden'
        }}>
          <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)'}}>
            <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Staff in turno</div>
            <div style={{fontSize:16,fontWeight:700,marginTop:2}}>4 in sala · 3 in cucina</div>
          </div>
          {STAFF_TODAY.map((p,i)=>(
            <div key={i} style={{padding:'12px 20px',borderBottom:i<STAFF_TODAY.length-1?'1px solid var(--border)':'none',display:'flex',alignItems:'center',gap:12}}>
              <div style={{
                width:36,height:36,borderRadius:18,background:'#3a3a3a',
                display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:13
              }}>{p.name[0]}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600}}>{p.name}</div>
                <div style={{fontSize:11,color:'var(--text-3)'}}>{p.role} · {p.hrs}h · {p.tables} tavoli</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:13,fontWeight:700,color:'var(--gold)'}} className="tnum">{formatEur(p.tips)}</div>
                <div style={{fontSize:10,color:'var(--text-3)'}}>mance</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div style={{padding:'0 24px 32px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
        {[
          { id:'tables', label:'Mappa Sala', icon:<Layers size={18}/>, sub:`${occupiedNow}/${totalTables} occupati` },
          { id:'reservations', label:'Prenotazioni', icon:<Calendar size={18}/>, sub:'12 stasera' },
          { id:'inventory', label:'Magazzino', icon:<Building size={18}/>, sub:'2 prodotti 86\'d' },
          { id:'kds', label:'KDS Cucina', icon:<ChefHat size={18}/>, sub:'5 portate attive' },
        ].map(q=>(
          <button key={q.id} onClick={()=>onNavigate(q.id)} style={{
            padding:'14px 16px',background:'rgba(255,255,255,0.02)',
            border:'1px solid var(--border)',borderRadius:12,
            display:'flex',alignItems:'center',gap:12,cursor:'pointer',
            textAlign:'left',color:'var(--text)'
          }}>
            <div style={{
              width:36,height:36,borderRadius:9,background:'var(--gold-soft)',
              display:'flex',alignItems:'center',justifyContent:'center',color:'var(--gold)'
            }}>{q.icon}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700}}>{q.label}</div>
              <div style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>{q.sub}</div>
            </div>
            <ChevronRight size={16} style={{color:'var(--text-3)'}}/>
          </button>
        ))}
      </div>
    </div>
  );
}
window.Dashboard = Dashboard;
