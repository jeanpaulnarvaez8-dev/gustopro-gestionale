// Login PIN — tastierino grande, dark mode, PIN-first
// Persona: chiunque | Momento: inizio turno, dita umide, tablet 10"

const { useState: lS, useEffect: lE } = React;

function Login({ onLogin }){
  const [pin, setPin] = lS('');
  const [error, setError] = lS('');
  const [attempts, setAttempts] = lS(0);
  const correct = '1234';

  function tap(d){
    if (pin.length >= 6) return;
    setError('');
    setPin(p => p + d);
  }
  function back(){ setPin(p => p.slice(0,-1)); setError(''); }

  lE(() => {
    if (pin.length >= 4){
      setTimeout(() => {
        if (pin === correct){
          onLogin();
        } else {
          setError(`PIN errato · ${Math.max(0,2-attempts)} tentativi rimasti`);
          setAttempts(a => a+1);
          setPin('');
        }
      }, 250);
    }
  }, [pin]);

  const lastUser = { name:'Giulia Romano', role:'Cameriere', avatar:'GR' };

  return (
    <div style={{
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      height:'100%',overflow:'auto',padding:24,gap:32,background:'radial-gradient(ellipse at top, #1f1d18, #0a0a0a)'
    }}>
      <div style={{textAlign:'center'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:12,marginBottom:6}}>
          <div style={{
            width:48,height:48,borderRadius:10,
            background:'linear-gradient(135deg,#D4AF37,#9c7e1f)',
            display:'flex',alignItems:'center',justifyContent:'center',
            fontWeight:800,color:'#1A1A1A',fontSize:18
          }}>GP</div>
          <div style={{textAlign:'left'}}>
          <div style={{fontSize:14,letterSpacing:'0.18em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700,marginBottom:2}}>GustoPro</div>
            <div style={{fontSize:22,fontWeight:700,fontFamily:'var(--serif)',color:'var(--gold)',letterSpacing:'-0.01em'}} className="serif-italic">Riva Beach Salento</div>
          </div>
        </div>
      </div>

      {/* Avatar */}
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
        <div style={{
          width:88,height:88,borderRadius:44,background:'#3a3a3a',
          display:'flex',alignItems:'center',justifyContent:'center',
          fontWeight:700,fontSize:30,color:'var(--text)',
          border:'2px solid var(--gold-ring)'
        }}>{lastUser.avatar}</div>
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:18,fontWeight:700}}>{lastUser.name}</div>
          <div style={{fontSize:12,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',fontWeight:700,marginTop:2}}>{lastUser.role}</div>
        </div>
        <button style={{
          padding:'6px 14px',background:'transparent',border:'1px solid var(--border)',borderRadius:999,
          color:'var(--text-2)',fontSize:11,fontWeight:600,cursor:'pointer'
        }}>Altro utente</button>
      </div>

      {/* PIN dots */}
      <div style={{display:'flex',gap:14}}>
        {[0,1,2,3].map(i => {
          const filled = i < pin.length;
          return (
            <div key={i} style={{
              width:18,height:18,borderRadius:9,
              background: filled ? (error?'var(--err)':'var(--gold)') : 'transparent',
              border:'2px solid '+(error?'var(--err)':(filled?'var(--gold)':'rgba(255,255,255,0.2)')),
              transition:'all 150ms',
              boxShadow: filled && !error ? '0 0 12px rgba(212,175,55,0.5)' : 'none'
            }}/>
          );
        })}
      </div>

      {error && (
        <div style={{
          padding:'8px 14px',background:'rgba(239,68,68,0.14)',border:'1px solid var(--err)',borderRadius:8,
          color:'var(--err)',fontSize:13,fontWeight:600,display:'flex',alignItems:'center',gap:8
        }}>
          <AlertTriangle size={16}/>{error}
        </div>
      )}

      {/* Tastierino — touch target 80×80 */}
      <div style={{
        display:'grid',gridTemplateColumns:'repeat(3,80px)',gap:14,marginTop:8
      }}>
        {[1,2,3,4,5,6,7,8,9].map(d => (
          <button key={d} onClick={()=>tap(d)} style={{
            width:80,height:80,borderRadius:40,
            background:'rgba(255,255,255,0.04)',border:'1px solid var(--border-2)',
            color:'var(--text)',fontSize:30,fontWeight:600,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',
            transition:'all 100ms'
          }}
          onMouseDown={e=>{e.currentTarget.style.background='var(--gold-soft)';e.currentTarget.style.borderColor='var(--gold-ring)'}}
          onMouseUp={e=>{e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.borderColor='var(--border-2)'}}
          onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.04)';e.currentTarget.style.borderColor='var(--border-2)'}}>
            {d}
          </button>
        ))}
        <div/>
        <button onClick={()=>tap(0)} style={{
          width:80,height:80,borderRadius:40,
          background:'rgba(255,255,255,0.04)',border:'1px solid var(--border-2)',
          color:'var(--text)',fontSize:30,fontWeight:600,cursor:'pointer',
          display:'flex',alignItems:'center',justifyContent:'center'
        }}>0</button>
        <button onClick={back} style={{
          width:80,height:80,borderRadius:40,
          background:'transparent',border:'1px solid var(--border)',
          color:'var(--text-2)',cursor:'pointer',
          display:'flex',alignItems:'center',justifyContent:'center'
        }}><Backspace size={26}/></button>
      </div>

      <div style={{fontSize:11,color:'var(--text-3)',textAlign:'center'}}>
        Suggerimento demo: PIN <b style={{color:'var(--gold)'}}>1234</b>
      </div>
    </div>
  );
}
window.Login = Login;
