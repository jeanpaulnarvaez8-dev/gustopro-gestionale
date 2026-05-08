// Report Fine Giornata — chiusura cassa, riepilogo fiscale
const { useState: cS, useMemo: cM } = React;

function CloseDay({ onBack }){
  const [step, setStep] = cS('review'); // review | counting | confirmed
  const [counted, setCounted] = cS({
    cash: '',
    pos:  '',
  });

  const expected = {
    cash: 1240.00,
    pos:  6480.50,
    online: 320.00,
    total: 8040.50,
    covers: 314,
    orders: 78,
    avg: 25.61,
    iva10: 642.00,
    iva22: 198.30,
    iva4:  78.40,
    tips: 179.00,
  };

  const cashDelta = counted.cash !== '' ? (parseFloat(counted.cash) - expected.cash) : null;
  const posDelta = counted.pos !== '' ? (parseFloat(counted.pos) - expected.pos) : null;

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'auto'}} className="scrollbar">
      <div style={{padding:'14px 24px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:14}}>
        <button onClick={onBack} style={{
          minHeight:44,padding:'0 14px',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
          borderRadius:10,color:'var(--text)',cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:600
        }}><ArrowLeft size={18}/>Sala</button>
        <div style={{flex:1}}>
          <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Chiusura giornata</div>
          <div style={{fontSize:20,fontWeight:800,marginTop:2}}>{new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:'24px auto',padding:'0 24px',width:'100%'}}>
        {/* Step indicator */}
        <div style={{display:'flex',gap:0,marginBottom:24,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:6}}>
          {[
            { id:'review',  l:'1. Riepilogo' },
            { id:'counting',l:'2. Conta cassa' },
            { id:'confirmed',l:'3. Conferma & stampa' },
          ].map((s,i)=>{
            const active = step === s.id;
            const done = ['review','counting','confirmed'].indexOf(step) > i;
            return (
              <button key={s.id} onClick={()=>setStep(s.id)} style={{
                flex:1,minHeight:48,padding:'8px 14px',
                background: active?'var(--gold-soft)':'transparent',
                border:'1px solid '+(active?'var(--gold-ring)':'transparent'),
                color:active?'var(--gold)':(done?'var(--ok)':'var(--text-3)'),
                borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:8
              }}>
                {done && <Check size={14}/>}{s.l}
              </button>
            );
          })}
        </div>

        {/* STEP 1 — Riepilogo */}
        {step === 'review' && (
          <>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:18}}>
              {[
                { l:'Incasso totale', v:formatEur(expected.total), c:'var(--gold)', icon:<Banknote size={18}/> },
                { l:'Coperti',        v:expected.covers,            c:'var(--info)', icon:<Users size={18}/> },
                { l:'Scontrini',      v:expected.orders,            c:'var(--text)', icon:<Receipt size={18}/> },
                { l:'Scontrino medio',v:formatEur(expected.avg),    c:'var(--ok)',   icon:<TrendingUp size={18}/> },
              ].map((k,i)=>(
                <div key={i} style={{padding:'16px 18px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,display:'flex',flexDirection:'column',gap:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,color:k.c}}>{k.icon}<span style={{fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',fontWeight:700}}>{k.l}</span></div>
                  <div style={{fontSize:24,fontWeight:800}} className="tnum">{k.v}</div>
                </div>
              ))}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
                <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',fontSize:13,fontWeight:700}}>Ripartizione pagamenti</div>
                {[
                  ['Contanti',  expected.cash, 'var(--ok)'],
                  ['POS / Carte', expected.pos, 'var(--info)'],
                  ['Online',    expected.online, 'var(--gold)'],
                ].map((r,i)=>{
                  const pct = (r[1]/expected.total)*100;
                  return (
                    <div key={i} style={{padding:'12px 18px',borderBottom:i<2?'1px solid var(--border)':'none'}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:6,fontSize:13}}>
                        <span>{r[0]}</span>
                        <span className="tnum"><b>{formatEur(r[1])}</b> <span style={{color:'var(--text-3)',fontSize:11}}>· {pct.toFixed(1)}%</span></span>
                      </div>
                      <div style={{height:6,background:'rgba(0,0,0,0.3)',borderRadius:3,overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${pct}%`,background:r[2]}}/>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
                <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',fontSize:13,fontWeight:700}}>IVA fiscale</div>
                {[
                  ['IVA 4% (alimenti base)',  expected.iva4],
                  ['IVA 10% (ristorazione)', expected.iva10],
                  ['IVA 22% (alcol/bibite)', expected.iva22],
                ].map((r,i)=>(
                  <div key={i} style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',fontSize:13}}>
                    <span style={{color:'var(--text-2)'}}>{r[0]}</span>
                    <span className="tnum"><b>{formatEur(r[1])}</b></span>
                  </div>
                ))}
                <div style={{padding:'12px 18px',display:'flex',justifyContent:'space-between',background:'rgba(212,175,55,0.06)',fontSize:14,fontWeight:800}}>
                  <span style={{color:'var(--gold)'}}>Totale IVA</span>
                  <span className="tnum" style={{color:'var(--gold)'}}>{formatEur(expected.iva4+expected.iva10+expected.iva22)}</span>
                </div>
              </div>
            </div>

            <div style={{marginTop:18,padding:'12px 16px',background:'rgba(212,175,55,0.06)',border:'1px solid var(--gold-ring)',borderRadius:10,
              display:'flex',alignItems:'center',gap:10,fontSize:12,color:'var(--text-2)'}}>
              <Sparkles size={14} style={{color:'var(--gold)'}}/>
              <b style={{color:'var(--gold)'}}>Mance:</b> {formatEur(expected.tips)} ripartite tra 4 camerieri (~{formatEur(expected.tips/4)} a testa).
              <div style={{flex:1}}/>
              <button onClick={()=>setStep('counting')} style={{
                minHeight:40,padding:'0 18px',background:'var(--gold)',color:'#1A1A1A',border:0,
                borderRadius:8,fontSize:13,fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',gap:6
              }}>Avanti<ArrowRight size={14}/></button>
            </div>
          </>
        )}

        {/* STEP 2 — Conta cassa */}
        {step === 'counting' && (
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:24}}>
            <div style={{fontSize:18,fontWeight:700,marginBottom:6}}>Conta fisica cassa</div>
            <div style={{fontSize:13,color:'var(--text-2)',marginBottom:20}}>Inserisci gli importi contati a fine turno per quadrare la cassa.</div>

            {[
              { id:'cash',label:'Contanti',atteso:expected.cash,delta:cashDelta,icon:<Banknote size={18}/> },
              { id:'pos', label:'POS / Carte',atteso:expected.pos,delta:posDelta,icon:<CreditCard size={18}/> },
            ].map(r=>(
              <div key={r.id} style={{padding:'18px',background:'rgba(255,255,255,0.02)',border:'1px solid var(--border)',borderRadius:10,marginBottom:12,display:'grid',gridTemplateColumns:'auto 1fr 1fr 1fr',gap:14,alignItems:'center'}}>
                <div style={{width:44,height:44,borderRadius:10,background:'var(--gold-soft)',color:'var(--gold)',display:'flex',alignItems:'center',justifyContent:'center'}}>{r.icon}</div>
                <div>
                  <div style={{fontSize:11,color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>{r.label}</div>
                  <div style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>Atteso: <b style={{color:'var(--text-2)'}} className="tnum">{formatEur(r.atteso)}</b></div>
                </div>
                <div>
                  <input type="number" value={counted[r.id]} onChange={e=>setCounted(c=>({...c,[r.id]:e.target.value}))} placeholder="0,00" style={{
                    width:'100%',background:'rgba(0,0,0,0.3)',border:'1px solid var(--border)',borderRadius:8,
                    padding:'10px 12px',color:'var(--text)',fontSize:18,fontFamily:'inherit',outline:'none',fontWeight:700,textAlign:'right'
                  }} className="tnum"/>
                </div>
                <div style={{textAlign:'right'}}>
                  {r.delta != null && (
                    <div style={{
                      display:'inline-block',padding:'8px 14px',
                      background: Math.abs(r.delta)<0.5?'var(--ok-soft)':'var(--err-soft)',
                      border:'1px solid '+(Math.abs(r.delta)<0.5?'var(--ok)':'var(--err)')+'40',
                      color: Math.abs(r.delta)<0.5?'var(--ok)':'var(--err)',
                      borderRadius:8,fontSize:14,fontWeight:800
                    }} className="tnum">{r.delta>=0?'+':''}{formatEur(r.delta)}</div>
                  )}
                </div>
              </div>
            ))}

            <div style={{marginTop:18,display:'flex',gap:10}}>
              <button onClick={()=>setStep('review')} style={{
                minHeight:48,padding:'0 18px',background:'transparent',border:'1px solid var(--border-2)',
                color:'var(--text)',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:6
              }}><ArrowLeft size={14}/>Indietro</button>
              <div style={{flex:1}}/>
              <button onClick={()=>setStep('confirmed')} disabled={counted.cash===''||counted.pos===''} style={{
                minHeight:48,padding:'0 22px',
                background: (counted.cash===''||counted.pos==='')?'rgba(212,175,55,0.18)':'var(--gold)',
                color: (counted.cash===''||counted.pos==='')?'var(--text-3)':'#1A1A1A',
                border:0,borderRadius:10,fontSize:14,fontWeight:800,
                cursor:(counted.cash===''||counted.pos==='')?'not-allowed':'pointer',
                display:'flex',alignItems:'center',gap:8
              }}>Chiudi giornata<Check size={16}/></button>
            </div>
          </div>
        )}

        {/* STEP 3 — Confermato */}
        {step === 'confirmed' && (
          <div style={{background:'var(--surface)',border:'1px solid var(--gold-ring)',borderRadius:12,padding:40,textAlign:'center'}}>
            <div style={{
              width:80,height:80,borderRadius:40,background:'var(--gold-soft)',
              display:'flex',alignItems:'center',justifyContent:'center',
              margin:'0 auto 18px',color:'var(--gold)'
            }}><Check size={40}/></div>
            <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--gold)',textTransform:'uppercase',fontWeight:800}}>Giornata chiusa</div>
            <div style={{fontSize:24,fontWeight:800,marginTop:6}}>Cassa quadrata</div>
            <div style={{fontSize:14,color:'var(--text-2)',marginTop:8}}>Report fiscale generato e inviato all'Agenzia delle Entrate.</div>
            <div style={{marginTop:24,padding:'16px 20px',background:'rgba(0,0,0,0.3)',border:'1px solid var(--border)',borderRadius:10,maxWidth:380,margin:'24px auto 0',textAlign:'left'}}>
              {[
                ['Incasso totale', formatEur(expected.total)],
                ['Scontrini emessi', expected.orders],
                ['IVA versata', formatEur(expected.iva4+expected.iva10+expected.iva22)],
                ['XML fiscale', 'CHIUSURA-2024-10-15.xml'],
              ].map((r,i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:i<3?'1px solid var(--border)':'none',fontSize:13}}>
                  <span style={{color:'var(--text-3)'}}>{r[0]}</span>
                  <span className="tnum" style={{fontWeight:700}}>{r[1]}</span>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'center',marginTop:24}}>
              <button style={{
                minHeight:48,padding:'0 22px',background:'var(--gold)',color:'#1A1A1A',border:0,
                borderRadius:10,fontSize:13,fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',gap:8
              }}><Receipt size={16}/>Stampa report</button>
              <button onClick={onBack} style={{
                minHeight:48,padding:'0 22px',background:'transparent',border:'1px solid var(--border-2)',
                color:'var(--text)',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer'
              }}>Torna alla sala</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
window.CloseDay = CloseDay;
