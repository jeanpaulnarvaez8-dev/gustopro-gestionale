// Onboarding overlay primo accesso — tour guidato 5 step
const { useState: oS, useEffect: oE } = React;

const ONBOARD_STEPS = [
  {
    title: 'Benvenuto in GustoPro',
    body: 'Il gestionale per Riva Beach Salento. Ti mostro le 4 cose principali in 30 secondi.',
    target: null,
    icon: <Flame size={28}/>,
    accent: 'var(--gold)',
  },
  {
    title: 'Mappa Sala',
    body: 'Tutti gli 8 ambienti del locale (Mare, Pineta, Veranda…). Tap su un tavolo apre azioni rapide. Colori = stato in tempo reale.',
    target: 'tables',
    icon: <MapPin size={24}/>,
    accent: 'var(--gold)',
  },
  {
    title: 'Presa Ordine',
    body: 'Menu diviso per categorie con allergeni UE sempre visibili. Aggiungi A/P/C, gestisci varianti e combo. Invio in cucina con un tap.',
    target: 'order',
    icon: <Receipt size={24}/>,
    accent: '#3B82F6',
  },
  {
    title: 'KDS Cucina',
    body: 'Comande live con timer e allergeni in rosso. Bump al pass quando il piatto esce. Colori del timer: verde sotto i 5 min, rosso oltre i 10.',
    target: 'kds',
    icon: <ChefHat size={24}/>,
    accent: '#22C55E',
  },
  {
    title: 'Tutto pronto',
    body: 'Esplora gli altri moduli dalla sidebar: Cassa, Prenotazioni, Magazzino, Storico, Personale, Chiusura. Buon servizio!',
    target: null,
    icon: <Check size={28}/>,
    accent: 'var(--ok)',
  },
];

function OnboardingOverlay(){
  const [show, setShow] = oS(false);
  const [step, setStep] = oS(0);

  oE(()=>{
    const seen = localStorage.getItem('gp_onboard_seen');
    if (!seen) {
      const t = setTimeout(()=>setShow(true), 600);
      return ()=>clearTimeout(t);
    }
  }, []);

  function dismiss(){
    localStorage.setItem('gp_onboard_seen', '1');
    setShow(false);
  }
  function next(){
    if (step < ONBOARD_STEPS.length - 1) setStep(step+1);
    else dismiss();
  }
  function prev(){ if (step > 0) setStep(step-1); }

  if (!show) return null;
  const s = ONBOARD_STEPS[step];

  return (
    <div style={{
      position:'fixed',inset:0,zIndex:200,
      background:'rgba(8,8,10,0.78)',backdropFilter:'blur(6px)',
      display:'flex',alignItems:'center',justifyContent:'center',
      animation:'fade-in 200ms'
    }}>
      <div style={{
        width:'min(520px, 92vw)',background:'var(--surface)',
        border:'1px solid var(--border-2)',borderRadius:16,
        boxShadow:'0 24px 64px rgba(0,0,0,0.5)',
        overflow:'hidden'
      }}>
        {/* Hero */}
        <div style={{
          padding:'28px 28px 20px',
          background:`linear-gradient(135deg, ${s.accent}22 0%, transparent 60%)`,
          borderBottom:'1px solid var(--border)',
          position:'relative'
        }}>
          <button onClick={dismiss} style={{
            position:'absolute',top:14,right:14,width:32,height:32,
            background:'rgba(255,255,255,0.06)',border:'1px solid var(--border)',
            borderRadius:8,color:'var(--text-2)',cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center'
          }}><X size={16}/></button>

          <div style={{
            width:56,height:56,borderRadius:14,
            background:s.accent+'22',color:s.accent,
            display:'flex',alignItems:'center',justifyContent:'center',
            marginBottom:14,border:'1px solid '+s.accent+'55'
          }}>{s.icon}</div>

          <div style={{fontSize:11,letterSpacing:'0.12em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700,marginBottom:6}}>
            Step {step+1} di {ONBOARD_STEPS.length}
          </div>
          <div style={{fontSize:24,fontWeight:800,marginBottom:8,letterSpacing:'-0.01em'}}>{s.title}</div>
          <div style={{fontSize:14,color:'var(--text-2)',lineHeight:1.55}}>{s.body}</div>
        </div>

        {/* Progress dots */}
        <div style={{padding:'14px 28px',display:'flex',gap:6,justifyContent:'center'}}>
          {ONBOARD_STEPS.map((_,i)=>(
            <button key={i} onClick={()=>setStep(i)} style={{
              width: i===step ? 24 : 8, height:8,borderRadius:4,
              background: i===step ? s.accent : 'var(--border-2)',
              border:0,cursor:'pointer',transition:'all 200ms',padding:0
            }}/>
          ))}
        </div>

        {/* Footer actions */}
        <div style={{
          padding:'14px 20px 20px',display:'flex',gap:8,
          borderTop:'1px solid var(--border)'
        }}>
          <button onClick={dismiss} style={{
            minHeight:44,padding:'0 16px',background:'transparent',
            border:'1px solid var(--border)',color:'var(--text-3)',
            borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer'
          }}>Salta tour</button>
          <div style={{flex:1}}/>
          {step > 0 && (
            <button onClick={prev} style={{
              minHeight:44,padding:'0 16px',background:'rgba(255,255,255,0.04)',
              border:'1px solid var(--border-2)',color:'var(--text)',
              borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer',
              display:'flex',alignItems:'center',gap:6
            }}><ArrowLeft size={14}/>Indietro</button>
          )}
          <button onClick={next} style={{
            minHeight:44,padding:'0 20px',background:s.accent,
            color:'#1A1A1A',border:0,borderRadius:10,
            fontSize:13,fontWeight:800,cursor:'pointer',
            display:'flex',alignItems:'center',gap:6
          }}>
            {step === ONBOARD_STEPS.length-1 ? 'Inizia' : 'Avanti'}
            {step < ONBOARD_STEPS.length-1 && <ArrowRight size={14}/>}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper per resettare il tour da Tweaks
window.resetOnboarding = function(){
  localStorage.removeItem('gp_onboard_seen');
  location.reload();
};

window.OnboardingOverlay = OnboardingOverlay;
