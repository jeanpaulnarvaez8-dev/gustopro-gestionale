// Storico Ordini — ricerca, ristampa, reso
const { useState: hS, useMemo: hM } = React;

const HISTORY_SEED = [
  { id:'ORD-2410', table:'M3',  zone:'mare',    waiter:'Marco',   covers:6, items:14, total:284.50, time:'21:42', date:'oggi',  status:'paid',     payment:'pos',  fiscal:'OK' },
  { id:'ORD-2409', table:'V2',  zone:'veranda', waiter:'Laura',   covers:2, items:6,  total:84.00,  time:'21:30', date:'oggi',  status:'paid',     payment:'cash', fiscal:'OK' },
  { id:'ORD-2408', table:'S5',  zone:'sala',    waiter:'Antonio', covers:5, items:11, total:198.00, time:'21:15', date:'oggi',  status:'split',    payment:'mixed',fiscal:'OK' },
  { id:'ORD-2407', table:'VIP1',zone:'vip1',    waiter:'Giulia',  covers:8, items:22, total:520.00, time:'20:58', date:'oggi',  status:'paid',     payment:'pos',  fiscal:'OK' },
  { id:'ORD-2406', table:'M5',  zone:'mare',    waiter:'Marco',   covers:4, items:9,  total:142.00, time:'20:40', date:'oggi',  status:'voided',   payment:'-',    fiscal:'STORNO' },
  { id:'ORD-2405', table:'B1',  zone:'bar',     waiter:'Laura',   covers:2, items:4,  total:38.00,  time:'20:22', date:'oggi',  status:'paid',     payment:'pos',  fiscal:'OK' },
  { id:'ORD-2404', table:'V1',  zone:'veranda', waiter:'Antonio', covers:3, items:7,  total:96.50,  time:'20:05', date:'oggi',  status:'paid',     payment:'cash', fiscal:'OK' },
  { id:'ORD-2403', table:'S2',  zone:'sala',    waiter:'Giulia',  covers:6, items:13, total:240.00, time:'19:48', date:'oggi',  status:'partial',  payment:'pos',  fiscal:'OK' },
  { id:'ORD-2402', table:'N1',  zone:'nettuno', waiter:'Marco',   covers:4, items:10, total:172.00, time:'13:42', date:'oggi',  status:'paid',     payment:'pos',  fiscal:'OK' },
  { id:'ORD-2401', table:'M2',  zone:'mare',    waiter:'Laura',   covers:2, items:5,  total:62.00,  time:'13:20', date:'oggi',  status:'paid',     payment:'cash', fiscal:'OK' },
];

const ST_HIST = {
  paid:    { l:'Pagato',    c:'var(--ok)',   bg:'rgba(34,197,94,0.14)' },
  split:   { l:'Split',     c:'var(--info)', bg:'rgba(59,130,246,0.14)' },
  voided:  { l:'Storno',    c:'var(--err)',  bg:'rgba(239,68,68,0.14)' },
  partial: { l:'Parziale',  c:'var(--warn)', bg:'rgba(234,179,8,0.14)' },
};

function OrderHistory({ onBack }){
  const [search, setSearch] = hS('');
  const [filter, setFilter] = hS('all');
  const [selected, setSelected] = hS(null);

  const filtered = hM(()=>HISTORY_SEED.filter(o =>
    (filter==='all' || filter===o.status) &&
    (!search || o.id.toLowerCase().includes(search.toLowerCase()) ||
                o.table.toLowerCase().includes(search.toLowerCase()) ||
                o.waiter.toLowerCase().includes(search.toLowerCase()))
  ), [search, filter]);

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      <div style={{padding:'14px 24px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:14}}>
        <button onClick={onBack} style={{
          minHeight:44,padding:'0 14px',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
          borderRadius:10,color:'var(--text)',cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:600
        }}><ArrowLeft size={18}/>Sala</button>
        <div style={{flex:1}}>
          <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Storico Ordini</div>
          <div style={{fontSize:20,fontWeight:800,marginTop:2}}>Oggi · <span style={{color:'var(--gold)'}}>{HISTORY_SEED.length} scontrini</span></div>
        </div>
        <div style={{position:'relative'}}>
          <Search size={16} style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:'var(--text-3)'}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca scontrino, tavolo o cameriere..." style={{
            background:'rgba(0,0,0,0.3)',border:'1px solid var(--border)',borderRadius:10,
            padding:'12px 16px 12px 38px',color:'var(--text)',fontSize:13,fontFamily:'inherit',outline:'none',width:320
          }}/>
        </div>
      </div>

      <div style={{flex:1,display:'grid',gridTemplateColumns:'1.4fr 1fr',overflow:'hidden'}}>
        <div style={{display:'flex',flexDirection:'column',overflow:'hidden',borderRight:'1px solid var(--border)'}}>
          <div className="scrollbar" style={{display:'flex',gap:6,padding:'12px 24px',overflowX:'auto',borderBottom:'1px solid var(--border)'}}>
            {[
              {id:'all',l:'Tutti'},
              {id:'paid',l:'Pagati'},
              {id:'split',l:'Split'},
              {id:'partial',l:'Parziali'},
              {id:'voided',l:'Stornati'},
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
          <div className="scrollbar" style={{flex:1,overflow:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead style={{position:'sticky',top:0,background:'var(--bg)',zIndex:1}}>
                <tr style={{borderBottom:'1px solid var(--border)'}}>
                  {['Scontrino','Ora','Tavolo','Cameriere','Stato','Totale',''].map((h,i)=>(
                    <th key={i} style={{padding:'10px 12px',textAlign:i>=5?'right':'left',fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-3)',fontWeight:700}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const st = ST_HIST[o.status];
                  const sel = selected?.id === o.id;
                  return (
                    <tr key={o.id} onClick={()=>setSelected(o)} style={{
                      borderBottom:'1px solid var(--border)',cursor:'pointer',
                      background: sel ? 'var(--gold-soft)' : 'transparent'
                    }}>
                      <td style={{padding:'12px',fontWeight:700,color:sel?'var(--gold)':'var(--text)'}} className="tnum">{o.id}</td>
                      <td style={{padding:'12px',color:'var(--text-2)'}} className="tnum">{o.time}</td>
                      <td style={{padding:'12px'}}><b>{o.table}</b> <span style={{color:'var(--text-3)',fontSize:11}}>· {o.zone}</span></td>
                      <td style={{padding:'12px',color:'var(--text-2)'}}>{o.waiter}</td>
                      <td style={{padding:'12px'}}>
                        <span style={{padding:'3px 10px',borderRadius:999,fontSize:10,fontWeight:700,background:st.bg,color:st.c}}>{st.l}</span>
                      </td>
                      <td style={{padding:'12px',textAlign:'right',fontWeight:700}} className="tnum">{formatEur(o.total)}</td>
                      <td style={{padding:'12px',textAlign:'right',color:'var(--text-3)'}}>›</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dettaglio scontrino + azioni */}
        <div style={{display:'flex',flexDirection:'column',overflow:'hidden',background:'var(--surface-2)'}}>
          {!selected ? (
            <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-3)',fontSize:13,padding:40,textAlign:'center'}}>
              Seleziona uno scontrino<br/>per vederne il dettaglio
            </div>
          ) : (
            <>
              <div style={{padding:'18px 22px',borderBottom:'1px solid var(--border)'}}>
                <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--gold)',textTransform:'uppercase',fontWeight:700}}>Scontrino</div>
                <div style={{fontSize:22,fontWeight:800,marginTop:2}} className="tnum">{selected.id}</div>
                <div style={{fontSize:13,color:'var(--text-2)',marginTop:6}}>
                  Tavolo <b>{selected.table}</b> · {selected.covers} coperti · {selected.items} portate
                </div>
                <div style={{fontSize:12,color:'var(--text-3)',marginTop:2}}>
                  {selected.time} · {selected.waiter} · pagamento <b style={{color:'var(--text-2)'}}>{selected.payment}</b>
                </div>
              </div>

              {/* Receipt visual */}
              <div className="scrollbar" style={{flex:1,overflow:'auto',padding:'16px 22px'}}>
                <div style={{
                  background:'#F5F5DC',color:'#1A1A1A',padding:'20px 24px',borderRadius:6,
                  fontFamily:'monospace',fontSize:11,lineHeight:1.6,
                  boxShadow:'0 8px 24px rgba(0,0,0,0.4)'
                }}>
                  <div style={{textAlign:'center',marginBottom:14,borderBottom:'1px dashed #1A1A1A',paddingBottom:10}}>
                    <div style={{fontSize:13,fontWeight:800,letterSpacing:'0.1em'}}>RIVA BEACH SALENTO</div>
                    <div style={{fontSize:9}}>Via del Mare 12 · Otranto (LE)</div>
                    <div style={{fontSize:9}}>P.IVA 04123456789</div>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                    <span>Scontrino #{selected.id}</span>
                    <span>{selected.time}</span>
                  </div>
                  <div style={{borderTop:'1px dashed #1A1A1A',borderBottom:'1px dashed #1A1A1A',padding:'8px 0',margin:'8px 0'}}>
                    {[
                      ['Spaghetti vongole', 2, 18.00],
                      ['Branzino sale',     1, 38.00],
                      ['Insalata mista',    2, 8.00],
                      ['Vino primitivo',    1, 24.00],
                      ['Acqua naturale',    2, 3.00],
                      ['Coperto',           selected.covers, 3.00],
                    ].map((r,i)=>(
                      <div key={i} style={{display:'flex',justifyContent:'space-between'}}>
                        <span>{r[1]}× {r[0]}</span>
                        <span>{(r[1]*r[2]).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:8,fontSize:9}}>
                    <span>IVA 10% · 22%</span>
                    <span>Inclusa</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:6,paddingTop:8,borderTop:'2px solid #1A1A1A',fontWeight:800,fontSize:14}}>
                    <span>TOTALE</span>
                    <span>€ {selected.total.toFixed(2)}</span>
                  </div>
                  <div style={{textAlign:'center',marginTop:14,fontSize:9,opacity:0.7}}>
                    {selected.fiscal} · Grazie e arrivederci
                  </div>
                </div>
              </div>

              {/* Azioni */}
              <div style={{padding:'14px 22px',borderTop:'1px solid var(--border)',display:'flex',gap:8}}>
                <button onClick={()=>pushUndo('Scontrino ristampato',()=>{})} style={{
                  flex:1,minHeight:48,background:'var(--gold)',color:'#1A1A1A',border:0,
                  borderRadius:10,fontSize:13,fontWeight:800,cursor:'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:6
                }}><Receipt size={14}/>Ristampa</button>
                <button onClick={()=>pushUndo('Reso emesso',()=>{})} style={{
                  flex:1,minHeight:48,background:'transparent',border:'1px solid var(--err)',
                  color:'var(--err)',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:6
                }}><RefreshCw size={14}/>Reso</button>
                <button style={{
                  minHeight:48,padding:'0 16px',background:'transparent',border:'1px solid var(--border-2)',
                  color:'var(--text)',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer'
                }}>Email</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
window.OrderHistory = OrderHistory;
