// Gestione Personale — turni, badge in/out, ripartizione mance
const { useState: pS, useMemo: pM } = React;

const STAFF = [
  { id:1, name:'Marco Bianchi',     role:'Cameriere',    shift:'12-16, 19-23', in:'11:58', out:null,    hrs:7.5,  status:'in',   tips:42, color:'#3B82F6', tables:5 },
  { id:2, name:'Laura Verdi',       role:'Cameriera',    shift:'12-16, 19-23', in:'11:55', out:null,    hrs:8.0,  status:'in',   tips:58, color:'#22C55E', tables:6 },
  { id:3, name:'Antonio Russo',     role:'Cameriere',    shift:'19-23',        in:'18:48', out:null,    hrs:6.5,  status:'in',   tips:31, color:'#A855F7', tables:4 },
  { id:4, name:'Giulia Conte',      role:'Cameriera',    shift:'12-16, 19-23', in:'11:52', out:null,    hrs:7.5,  status:'in',   tips:48, color:'#EAB308', tables:5 },
  { id:5, name:'Roberto Marini',    role:'Chef',         shift:'11-15, 18-23', in:'10:55', out:null,    hrs:9.0,  status:'in',   tips:0,  color:'#EF4444', tables:0 },
  { id:6, name:'Sara De Luca',      role:'Sous-Chef',    shift:'11-15, 18-23', in:'10:58', out:null,    hrs:9.0,  status:'in',   tips:0,  color:'#3B82F6', tables:0 },
  { id:7, name:'Davide Greco',      role:'Cuoco',        shift:'18-23',        in:'17:50', out:null,    hrs:5.5,  status:'in',   tips:0,  color:'#22C55E', tables:0 },
  { id:8, name:'Elena Rossi',       role:'Lavapiatti',   shift:'12-16',        in:'11:48', out:'16:02', hrs:4.0,  status:'out',  tips:0,  color:'#A855F7', tables:0 },
  { id:9, name:'Francesco Esposito',role:'Barman',       shift:'18-24',        in:null,    out:null,    hrs:0,    status:'late', tips:14, color:'#EAB308', tables:0 },
  { id:10,name:'Chiara Ferrara',    role:'Cassiera',     shift:'19-23',        in:'18:55', out:null,    hrs:5.5,  status:'in',   tips:0,  color:'#EF4444', tables:0 },
];

const ROLE_GROUPS = [
  { id:'sala',    label:'Sala',    roles:['Cameriere','Cameriera','Cassiera'], icon:<Users size={14}/> },
  { id:'cucina',  label:'Cucina',  roles:['Chef','Sous-Chef','Cuoco','Lavapiatti'], icon:<ChefHat size={14}/> },
  { id:'bar',     label:'Bar',     roles:['Barman'], icon:<Coffee size={14}/> },
];

function Staff({ onBack }){
  const [tab, setTab] = pS('all');
  const [staff, setStaff] = pS(STAFF);

  function clockOut(id){
    setStaff(arr => arr.map(p => p.id===id ? {...p, status:'out', out:new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})} : p));
    pushUndo('Badge timbrato',()=>{});
  }
  function clockIn(id){
    setStaff(arr => arr.map(p => p.id===id ? {...p, status:'in', in:new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})} : p));
    pushUndo('Entrata registrata',()=>{});
  }

  const filtered = pM(()=>{
    if (tab==='all') return staff;
    const grp = ROLE_GROUPS.find(g=>g.id===tab);
    if (grp) return staff.filter(p => grp.roles.includes(p.role));
    if (tab==='in') return staff.filter(p=>p.status==='in');
    if (tab==='late') return staff.filter(p=>p.status==='late');
    return staff;
  }, [staff, tab]);

  const stats = pM(()=>({
    in: staff.filter(p=>p.status==='in').length,
    out: staff.filter(p=>p.status==='out').length,
    late: staff.filter(p=>p.status==='late').length,
    totalTips: staff.reduce((a,b)=>a+b.tips,0),
    totalHrs: staff.reduce((a,b)=>a+b.hrs,0),
  }), [staff]);

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      <div style={{padding:'14px 24px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:14}}>
        <button onClick={onBack} style={{
          minHeight:44,padding:'0 14px',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
          borderRadius:10,color:'var(--text)',cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:600
        }}><ArrowLeft size={18}/>Sala</button>
        <div style={{flex:1}}>
          <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Personale</div>
          <div style={{fontSize:20,fontWeight:800,marginTop:2}}>{stats.in} in turno · <span style={{color:'var(--err)'}}>{stats.late} in ritardo</span></div>
        </div>
        <button style={{
          minHeight:44,padding:'0 18px',background:'var(--gold)',color:'#1A1A1A',border:0,
          borderRadius:10,fontSize:13,fontWeight:800,cursor:'pointer',display:'flex',alignItems:'center',gap:8
        }}><Plus size={16}/>Nuovo turno</button>
      </div>

      <div style={{padding:'14px 24px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:10,borderBottom:'1px solid var(--border)'}}>
        {[
          { l:'In turno ora', v:stats.in, c:'var(--ok)' },
          { l:'Hanno staccato', v:stats.out, c:'var(--text-2)' },
          { l:'In ritardo', v:stats.late, c:'var(--err)' },
          { l:'Ore totali oggi', v:stats.totalHrs.toFixed(1)+'h', c:'var(--text)' },
          { l:'Mance ripartite', v:formatEur(stats.totalTips), c:'var(--gold)' },
        ].map((k,i)=>(
          <div key={i} style={{padding:'10px 14px',background:'rgba(255,255,255,0.02)',border:'1px solid var(--border)',borderRadius:10}}>
            <div style={{fontSize:10,letterSpacing:'0.08em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>{k.l}</div>
            <div style={{fontSize:22,fontWeight:800,color:k.c,marginTop:2,whiteSpace:'nowrap'}} className="tnum">{k.v}</div>
          </div>
        ))}
      </div>

      <div className="scrollbar" style={{display:'flex',gap:6,padding:'12px 24px',overflowX:'auto',borderBottom:'1px solid var(--border)'}}>
        {[
          {id:'all',l:`Tutti (${staff.length})`,icon:<Users size={14}/>},
          {id:'in',l:`In turno (${stats.in})`,icon:<Check size={14}/>},
          {id:'late',l:`Ritardo (${stats.late})`,icon:<AlertTriangle size={14}/>},
          ...ROLE_GROUPS,
        ].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            flexShrink:0,minHeight:38,padding:'7px 14px',
            border:'1px solid '+(tab===t.id?'var(--gold-ring)':'var(--border)'),
            background: tab===t.id?'var(--gold-soft)':'rgba(255,255,255,0.02)',
            color: tab===t.id?'var(--gold)':'var(--text-2)',
            borderRadius:999,fontSize:12,fontWeight:600,cursor:'pointer',
            display:'flex',alignItems:'center',gap:6
          }}>{t.icon}{t.l || t.label}</button>
        ))}
      </div>

      <div className="scrollbar" style={{flex:1,overflow:'auto',padding:'14px 24px',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(380px,1fr))',gap:10,alignContent:'start'}}>
        {filtered.map(p => {
          const stColor = p.status==='in'?'var(--ok)':p.status==='late'?'var(--err)':'var(--text-3)';
          const stBg = p.status==='in'?'rgba(34,197,94,0.12)':p.status==='late'?'rgba(239,68,68,0.12)':'rgba(255,255,255,0.04)';
          const stLabel = p.status==='in'?'In turno':p.status==='late'?'Ritardo':'Staccato';
          return (
            <div key={p.id} style={{
              padding:'14px 16px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,
              display:'flex',gap:14,alignItems:'flex-start'
            }}>
              <div style={{
                width:48,height:48,borderRadius:24,background:p.color,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontWeight:800,fontSize:16,color:'#1A1A1A',flexShrink:0
              }}>{p.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                  <span style={{fontSize:14,fontWeight:700}}>{p.name}</span>
                  <span style={{padding:'2px 8px',borderRadius:999,fontSize:9,fontWeight:700,background:stBg,color:stColor,border:'1px solid '+stColor+'40'}}>{stLabel}</span>
                </div>
                <div style={{fontSize:11,color:'var(--text-3)',marginBottom:8}}>{p.role} · turno {p.shift}</div>

                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:10}}>
                  <div><div style={{fontSize:9,color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>In</div><div style={{fontSize:13,fontWeight:700,color:p.in?'var(--ok)':'var(--text-3)'}} className="tnum">{p.in||'—'}</div></div>
                  <div><div style={{fontSize:9,color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Out</div><div style={{fontSize:13,fontWeight:700,color:p.out?'var(--text-2)':'var(--text-3)'}} className="tnum">{p.out||'—'}</div></div>
                  <div><div style={{fontSize:9,color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Ore</div><div style={{fontSize:13,fontWeight:700}} className="tnum">{p.hrs}h</div></div>
                  <div><div style={{fontSize:9,color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Mance</div><div style={{fontSize:13,fontWeight:700,color:'var(--gold)'}} className="tnum">{p.tips?formatEur(p.tips):'—'}</div></div>
                </div>

                <div style={{display:'flex',gap:6}}>
                  {p.status==='in' && (
                    <button onClick={()=>clockOut(p.id)} style={{
                      flex:1,minHeight:34,background:'rgba(255,255,255,0.04)',border:'1px solid var(--border-2)',
                      color:'var(--text)',borderRadius:8,fontSize:11,fontWeight:700,cursor:'pointer',
                      display:'flex',alignItems:'center',justifyContent:'center',gap:4
                    }}><LogOut size={12}/>Stacca</button>
                  )}
                  {p.status==='out' && (
                    <button onClick={()=>clockIn(p.id)} style={{
                      flex:1,minHeight:34,background:'var(--ok-soft)',border:'1px solid rgba(34,197,94,0.4)',
                      color:'var(--ok)',borderRadius:8,fontSize:11,fontWeight:700,cursor:'pointer',
                      display:'flex',alignItems:'center',justifyContent:'center',gap:4
                    }}><Check size={12}/>Ribadge</button>
                  )}
                  {p.status==='late' && (
                    <button onClick={()=>clockIn(p.id)} style={{
                      flex:1,minHeight:34,background:'var(--gold)',color:'#1A1A1A',border:0,
                      borderRadius:8,fontSize:11,fontWeight:800,cursor:'pointer',
                      display:'flex',alignItems:'center',justifyContent:'center',gap:4
                    }}><Check size={12}/>Forza entrata</button>
                  )}
                  <button style={{
                    minHeight:34,padding:'0 12px',background:'transparent',border:'1px solid var(--border)',
                    color:'var(--text-2)',borderRadius:8,fontSize:11,fontWeight:600,cursor:'pointer'
                  }}>Modifica</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
window.Staff = Staff;
