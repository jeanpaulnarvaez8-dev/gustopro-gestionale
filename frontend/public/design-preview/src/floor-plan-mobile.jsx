// Mobile FloorPlan — versione condensata per smartphone
// Lista zone collassabile, tap su tavolo apre bottom sheet

const { useState: mfS } = React;

function FloorPlanMobile(){
  const s = useStore();
  const [openZone, setOpenZone] = mfS('mare');
  const [tableSheet, setTableSheet] = mfS(null);

  const tablesByZone = {};
  ZONES.forEach(z => tablesByZone[z.id] = s.tables.filter(t => t.zone === z.id));

  const totalOcc = s.tables.filter(t=>t.status==='occupied').length;

  function statusDot(status){
    return STATUS[status]?.color || '#999';
  }

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden',background:'var(--canvas)'}}>
      {/* Header sticky */}
      <div style={{padding:'14px 16px',background:'var(--surface)',borderBottom:'1px solid var(--border)'}}>
        <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Riva Beach Salento</div>
        <div style={{fontSize:18,fontWeight:800,marginTop:2}}>Sala · <span style={{color:'var(--gold)'}}>{totalOcc}</span><span style={{color:'var(--text-3)',fontWeight:600}}>/{s.tables.length} occupati</span></div>
      </div>

      {/* KPI compact */}
      <div style={{padding:'10px 16px',borderBottom:'1px solid var(--border)',display:'flex',gap:6,overflowX:'auto'}} className="scrollbar">
        {Object.entries(STATUS).map(([k,v])=>{
          const cnt = s.tables.filter(t=>t.status===k).length;
          return (
            <div key={k} style={{
              flexShrink:0,padding:'6px 12px',
              background:v.color+'22',border:'1px solid '+v.color+'66',
              borderRadius:999,fontSize:11,fontWeight:700,color:v.color,
              display:'flex',alignItems:'center',gap:4
            }}><span className="tnum">{cnt}</span> {v.label}</div>
          );
        })}
      </div>

      {/* Lista zone */}
      <div className="scrollbar" style={{flex:1,overflowY:'auto'}}>
        {ZONES.map(z=>{
          const list = tablesByZone[z.id] || [];
          const occ = list.filter(t=>t.status==='occupied').length;
          const open = openZone === z.id;
          return (
            <div key={z.id} style={{borderBottom:'1px solid var(--border)'}}>
              <button onClick={()=>setOpenZone(open?null:z.id)} style={{
                width:'100%',padding:'14px 16px',background:'transparent',border:0,color:'var(--text)',
                display:'flex',alignItems:'center',gap:12,cursor:'pointer'
              }}>
                <div style={{
                  width:36,height:36,borderRadius:8,background:'var(--gold-soft)',
                  color:'var(--gold)',display:'flex',alignItems:'center',justifyContent:'center'
                }}><MapPin size={16}/></div>
                <div style={{flex:1,textAlign:'left'}}>
                  <div style={{fontSize:14,fontWeight:700}}>{z.name}</div>
                  <div style={{fontSize:11,color:'var(--text-3)'}}>{list.length} tavoli · <b style={{color:'var(--err)'}}>{occ}</b> occupati</div>
                </div>
                <ChevronDown size={18} style={{color:'var(--text-3)',transform:open?'rotate(180deg)':'none',transition:'transform 200ms'}}/>
              </button>
              {open && (
                <div style={{padding:'4px 12px 14px',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                  {list.map(t=>{
                    const c = statusDot(t.status);
                    return (
                      <button key={t.id} onClick={()=>{ store.set({selectedTableId:t.id}); setTableSheet(t); }} style={{
                        padding:'12px 8px',background:'rgba(255,255,255,0.03)',
                        border:'2px solid '+c+'88',borderRadius:10,
                        color:'var(--text)',cursor:'pointer',
                        display:'flex',flexDirection:'column',alignItems:'center',gap:4,minHeight:80
                      }}>
                        <div style={{fontSize:18,fontWeight:800}}>{t.id}</div>
                        <div style={{fontSize:9,color:c,fontWeight:800,letterSpacing:'0.06em'}}>{STATUS[t.status]?.short}</div>
                        <div style={{fontSize:10,color:'var(--text-3)'}}>{t.seats}p</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom sheet azioni */}
      {tableSheet && (
        <>
          <div onClick={()=>setTableSheet(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',zIndex:80}}/>
          <div style={{
            position:'fixed',left:0,right:0,bottom:0,zIndex:81,
            background:'var(--surface)',border:'1px solid var(--border-2)',borderRadius:'18px 18px 0 0',
            padding:'14px 16px 24px',animation:'slide-up 200ms'
          }}>
            <div style={{width:40,height:4,background:'var(--border-2)',borderRadius:2,margin:'0 auto 14px'}}/>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
              <div style={{
                width:48,height:48,borderRadius:10,background:STATUS[tableSheet.status]?.color+'22',
                border:'2px solid '+STATUS[tableSheet.status]?.color,
                display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'
              }}>
                <div style={{fontSize:14,fontWeight:800,color:STATUS[tableSheet.status]?.color}}>{tableSheet.id}</div>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:16,fontWeight:700}}>Tavolo {tableSheet.id}</div>
                <div style={{fontSize:12,color:'var(--text-2)'}}>{tableSheet.seats} coperti · {tableSheet.zone}</div>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <button onClick={()=>{ store.set({page:'order'}); setTableSheet(null); }} style={{
                minHeight:52,background:'var(--gold)',color:'#1A1A1A',border:0,borderRadius:10,fontWeight:800,fontSize:13,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:6
              }}><Receipt size={16}/>Apri ordine</button>
              <button onClick={()=>{ store.set({page:'checkout'}); setTableSheet(null); }} style={{
                minHeight:52,background:'transparent',border:'1px solid var(--border-2)',color:'var(--text)',borderRadius:10,fontWeight:600,fontSize:13,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:6
              }}><CreditCard size={16}/>Cassa</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
window.FloorPlanMobile = FloorPlanMobile;
