// App root — orchestrator, naviga tra Floor Plan, Order, KDS, Checkout, Login

const { useState: aS, useEffect: aE } = React;

function App(){
  const s = useStore();

  aE(() => { if (window.simEngine) simEngine(); }, []);

  function nav(page){ store.set({ page }); }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh',overflow:'hidden'}}>
      {/* Hide topbar in login + editor */}
      {s.page !== 'login' && s.page !== 'editor' && <Topbar onNavigate={nav} page={s.page}/>}

      {/* Offline banner */}
      {!s.online && (
        <div style={{
          padding:'8px 16px',background:'rgba(212,175,55,0.12)',
          borderBottom:'1px solid var(--gold-ring)',
          color:'var(--gold)',fontSize:13,fontWeight:600,
          display:'flex',alignItems:'center',gap:10,flexShrink:0
        }}>
          <WifiOff size={16}/>
          <b>Offline</b> · 3 ordini in coda · La sala continua a lavorare, sincronizziamo appena torna la connessione
          <div style={{flex:1}}/>
          <button onClick={()=>store.set({online:true})} style={{
            background:'var(--gold)',color:'#1A1A1A',border:0,borderRadius:6,padding:'4px 12px',
            fontSize:12,fontWeight:700,cursor:'pointer'
          }}>Forza sync</button>
        </div>
      )}

      <div style={{flex:1,overflow:'hidden',position:'relative'}}>
        {s.page === 'dashboard'    && <Dashboard onNavigate={nav}/>}
        {s.page === 'tables'       && (
          (typeof window !== 'undefined' && window.innerWidth < 720)
            ? <FloorPlanMobile/>
            : <FloorPlan onOpenOrder={()=>{}}/>
        )}
        {s.page === 'reservations' && <Reservations onBack={()=>nav('tables')}/>}
        {s.page === 'order'        && <OrderPage onBack={()=>nav('tables')}/>}
        {s.page === 'kds'          && <KDS onBack={()=>nav('tables')}/>}
        {s.page === 'checkout'     && <Checkout onBack={()=>nav('tables')}/>}
        {s.page === 'history'      && <OrderHistory onBack={()=>nav('tables')}/>}
        {s.page === 'closeday'     && <CloseDay onBack={()=>nav('tables')}/>}
        {s.page === 'staff'        && <Staff onBack={()=>nav('tables')}/>}
        {s.page === 'inventory'    && <Inventory onBack={()=>nav('tables')}/>}
        {s.page === 'editor'       && <FloorPlanEditor onBack={()=>nav('tables')}/>}
        {s.page === 'login'        && <Login onLogin={()=>nav('tables')}/>}
      </div>

      <Toasts/>
      <UndoBar/>
      {s.page !== 'login' && <OnboardingOverlay/>}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
