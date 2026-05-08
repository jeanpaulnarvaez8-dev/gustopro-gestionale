// Editor Planimetria — admin drag-drop, fork del FloorPlan
// Persona: admin/manager | Momento: ridisegna il layout sala dopo lavori

const { useState: feS, useEffect: feE, useRef: feR } = React;

function FloorPlanEditor({ onBack }){
  const [tables, setTables] = feS(() => store.get().tables.map(t => ({...t})));
  const [selected, setSelected] = feS(null);
  const [drag, setDrag] = feS(null); // { id, ox, oy }
  const [tool, setTool] = feS('move'); // move | add-circle | add-square | add-rect | delete
  const svgRef = feR(null);

  function svgPoint(e){
    const svg = svgRef.current;
    if (!svg) return { x:0, y:0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x:0, y:0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  function startDrag(e, t){
    if (tool === 'delete'){
      setTables(arr => arr.filter(x => x.id !== t.id));
      return;
    }
    setSelected(t.id);
    const p = svgPoint(e);
    setDrag({ id:t.id, ox:p.x - t.x, oy:p.y - t.y });
  }
  function onMove(e){
    if (!drag) return;
    const p = svgPoint(e);
    setTables(arr => arr.map(t => t.id === drag.id
      ? { ...t, x: Math.max(20, Math.min(1450, p.x - drag.ox)), y: Math.max(20, Math.min(720, p.y - drag.oy)) }
      : t));
  }
  function endDrag(){ setDrag(null); }

  function canvasClick(e){
    if (!tool.startsWith('add-')) return;
    const p = svgPoint(e);
    const shape = tool.replace('add-','');
    const newId = (shape==='circle'?'C':shape==='square'?'Q':'R') + (tables.length+1);
    const w = shape==='rect' ? 130 : 80, h = shape==='rect' ? 80 : 80;
    setTables(arr => [...arr, { id:newId, zone:'sala', x:p.x-w/2, y:p.y-h/2, w, h, shape, seats:shape==='rect'?6:4, status:'free' }]);
    setTool('move');
  }

  function updateSel(patch){
    if (!selected) return;
    setTables(arr => arr.map(t => t.id === selected ? { ...t, ...patch } : t));
  }
  function save(){
    store.set(s => ({ ...s, tables }));
    pushUndo('Planimetria salvata', ()=>{});
    onBack();
  }

  const sel = tables.find(t => t.id === selected);

  const tools = [
    { id:'move',       icon:<Move size={16}/>,   lbl:'Sposta' },
    { id:'add-circle', icon:<Plus size={16}/>,   lbl:'+ Tondo' },
    { id:'add-square', icon:<Plus size={16}/>,   lbl:'+ Quadro' },
    { id:'add-rect',   icon:<Plus size={16}/>,   lbl:'+ Rettangolo' },
    { id:'delete',     icon:<Trash size={16}/>,  lbl:'Elimina',color:'var(--err)' },
  ];

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Toolbar */}
      <div style={{padding:'12px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:14}}>
        <button onClick={onBack} style={{
          minHeight:44,padding:'0 14px',background:'rgba(255,255,255,0.04)',border:'1px solid var(--border)',
          borderRadius:10,color:'var(--text)',cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:600
        }}><ArrowLeft size={18}/>Sala</button>
        <div>
          <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Admin</div>
          <div style={{fontSize:18,fontWeight:800}}>Editor planimetria</div>
        </div>
        <div style={{flex:1}}/>
        <div style={{display:'flex',gap:4,padding:4,background:'rgba(0,0,0,0.25)',borderRadius:10}}>
          {tools.map(t => (
            <button key={t.id} onClick={()=>setTool(t.id)} style={{
              minHeight:38,padding:'0 12px',
              background:tool===t.id?'var(--gold-soft)':'transparent',
              border:'1px solid '+(tool===t.id?'var(--gold-ring)':'transparent'),
              color:tool===t.id?'var(--gold)':(t.color||'var(--text-2)'),
              borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:600,
              display:'flex',alignItems:'center',gap:6
            }}>{t.icon}{t.lbl}</button>
          ))}
        </div>
        <button onClick={save} style={{
          minHeight:44,padding:'0 18px',background:'var(--gold)',color:'#1A1A1A',border:0,
          borderRadius:10,fontSize:13,fontWeight:800,cursor:'pointer',
          display:'flex',alignItems:'center',gap:8
        }}><Check size={16}/>Salva planimetria</button>
      </div>

      <div style={{flex:1,display:'grid',gridTemplateColumns:'1fr 280px',overflow:'hidden'}}>
        {/* Canvas */}
        <div style={{position:'relative',background:'var(--canvas)',overflow:'hidden'}}
          onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag}>
          <svg ref={svgRef} width="100%" height="100%" viewBox="0 0 1500 760"
            preserveAspectRatio="xMidYMid meet"
            style={{display:'block',cursor: tool.startsWith('add-')?'crosshair':(tool==='delete'?'not-allowed':'default')}}
            onClick={canvasClick}>
            <defs>
              <pattern id="gridE" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="1500" height="760" fill="url(#gridE)"/>

            {tables.map(t => {
              const isSel = selected === t.id;
              const cx = t.x + t.w/2, cy = t.y + t.h/2;
              const fill = isSel ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.04)';
              const stroke = isSel ? 'var(--gold)' : 'var(--border-2)';
              return (
                <g key={t.id} onMouseDown={(e)=>startDrag(e,t)} style={{cursor: tool==='delete'?'not-allowed':'grab'}}>
                  {t.shape === 'circle'
                    ? <circle cx={cx} cy={cy} r={t.w/2} fill={fill} stroke={stroke} strokeWidth={isSel?3:1.5} strokeDasharray={isSel?'none':'4 3'}/>
                    : <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={t.shape==='square'?6:14}
                        fill={fill} stroke={stroke} strokeWidth={isSel?3:1.5} strokeDasharray={isSel?'none':'4 3'}/>
                  }
                  <text x={cx} y={cy-4} textAnchor="middle" dominantBaseline="middle"
                    fontSize={Math.min(t.w,t.h)/3.5} fontWeight="800" fill="var(--text)" style={{pointerEvents:'none'}}>{t.id}</text>
                  <text x={cx} y={cy+Math.min(t.w,t.h)/4} textAnchor="middle" dominantBaseline="middle"
                    fontSize={Math.min(t.w,t.h)/9} fontWeight="600" fill="rgba(245,245,220,0.55)" style={{pointerEvents:'none'}}>
                    {t.seats}p · {t.zone}
                  </text>
                </g>
              );
            })}
          </svg>
          <div style={{
            position:'absolute',bottom:12,left:12,right:12,
            background:'rgba(0,0,0,0.55)',border:'1px solid var(--border)',borderRadius:8,
            padding:'8px 12px',fontSize:12,color:'var(--text-2)',
            display:'flex',alignItems:'center',gap:8
          }}>
            <Sparkles size={14} style={{color:'var(--gold)'}}/>
            {tool==='move' && 'Trascina i tavoli per spostarli. Tocca un tavolo per modificarlo a destra.'}
            {tool.startsWith('add-') && 'Tocca il canvas dove vuoi posizionare il nuovo tavolo.'}
            {tool==='delete' && 'Tocca un tavolo per eliminarlo.'}
          </div>
        </div>

        {/* Sidebar proprietà */}
        <div style={{borderLeft:'1px solid var(--border)',padding:18,display:'flex',flexDirection:'column',gap:14,overflow:'auto'}} className="scrollbar">
          <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Proprietà</div>
          {!sel ? (
            <div style={{padding:20,textAlign:'center',color:'var(--text-3)',fontSize:13,
              background:'rgba(255,255,255,0.02)',border:'1px dashed var(--border)',borderRadius:10}}>
              Seleziona un tavolo<br/>per modificarlo
            </div>
          ) : (
            <>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                <label style={{fontSize:11,color:'var(--text-2)',fontWeight:600}}>ID tavolo</label>
                <input value={sel.id} onChange={e=>updateSel({id:e.target.value.toUpperCase()})} style={{
                  background:'rgba(0,0,0,0.3)',border:'1px solid var(--border)',
                  borderRadius:8,padding:'10px 12px',color:'var(--text)',fontSize:14,
                  fontFamily:'inherit',outline:'none',fontWeight:600
                }}/>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                <label style={{fontSize:11,color:'var(--text-2)',fontWeight:600}}>Zona</label>
                <select value={sel.zone} onChange={e=>updateSel({zone:e.target.value})} style={{
                  background:'rgba(0,0,0,0.3)',border:'1px solid var(--border)',
                  borderRadius:8,padding:'10px 12px',color:'var(--text)',fontSize:13,
                  fontFamily:'inherit',outline:'none'
                }}>
                  {ZONES.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                <label style={{fontSize:11,color:'var(--text-2)',fontWeight:600}}>Posti</label>
                <div style={{display:'flex',alignItems:'center',gap:0,background:'rgba(0,0,0,0.3)',borderRadius:8,padding:3}}>
                  <button onClick={()=>updateSel({seats:Math.max(1,sel.seats-1)})}
                    style={{width:36,height:36,border:0,borderRadius:6,background:'transparent',color:'var(--text)',cursor:'pointer'}}>−</button>
                  <span style={{flex:1,textAlign:'center',fontWeight:800,fontSize:16}} className="tnum">{sel.seats}</span>
                  <button onClick={()=>updateSel({seats:sel.seats+1})}
                    style={{width:36,height:36,border:0,borderRadius:6,background:'transparent',color:'var(--text)',cursor:'pointer'}}>+</button>
                </div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                <label style={{fontSize:11,color:'var(--text-2)',fontWeight:600}}>Forma</label>
                <div style={{display:'flex',gap:4}}>
                  {['circle','square','rect'].map(sh => (
                    <button key={sh} onClick={()=>updateSel({shape:sh, w: sh==='rect'?130:80, h: 80})} style={{
                      flex:1,minHeight:40,
                      background: sel.shape===sh?'var(--gold-soft)':'rgba(255,255,255,0.04)',
                      border:'1px solid '+(sel.shape===sh?'var(--gold-ring)':'var(--border)'),
                      color:sel.shape===sh?'var(--gold)':'var(--text-2)',
                      borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer'
                    }}>{sh==='circle'?'Tondo':sh==='square'?'Quadro':'Rett.'}</button>
                  ))}
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                <div>
                  <label style={{fontSize:11,color:'var(--text-2)',fontWeight:600,display:'block',marginBottom:4}}>X</label>
                  <input type="number" value={Math.round(sel.x)} onChange={e=>updateSel({x:parseInt(e.target.value, 10)||0})} style={{
                    width:'100%',background:'rgba(0,0,0,0.3)',border:'1px solid var(--border)',borderRadius:8,
                    padding:'8px 10px',color:'var(--text)',fontSize:13,fontFamily:'inherit',outline:'none'
                  }}/>
                </div>
                <div>
                  <label style={{fontSize:11,color:'var(--text-2)',fontWeight:600,display:'block',marginBottom:4}}>Y</label>
                  <input type="number" value={Math.round(sel.y)} onChange={e=>updateSel({y:parseInt(e.target.value, 10)||0})} style={{
                    width:'100%',background:'rgba(0,0,0,0.3)',border:'1px solid var(--border)',borderRadius:8,
                    padding:'8px 10px',color:'var(--text)',fontSize:13,fontFamily:'inherit',outline:'none'
                  }}/>
                </div>
              </div>
              <button onClick={()=>{ setTables(a=>a.filter(t=>t.id!==sel.id)); setSelected(null); }} style={{
                minHeight:44,marginTop:8,background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.4)',
                color:'var(--err)',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:6
              }}><Trash size={14}/>Elimina tavolo</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
window.FloorPlanEditor = FloorPlanEditor;
