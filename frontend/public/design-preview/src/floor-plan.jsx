// Mappa Sala — SVG planimetrico + tavoli + filtri zona
// Persona: cameriere | Momento: venerdì sera, 8 tavoli aperti, deve vedere TUTTO in colpo d'occhio
// Ascolta `table-status-changed`; emette via tap → bottom sheet azioni rapide

const { useState: fS, useEffect: fE, useMemo: fM } = React;

function ZoneTabs({ active, onChange, tables }){
  const counts = fM(() => {
    const c = { all: tables.length };
    ZONES.forEach(z => { c[z.id] = tables.filter(t => t.zone === z.id).length; });
    return c;
  }, [tables]);
  const occupied = fM(() => {
    const c = { all: tables.filter(t=>t.status==='occupied').length };
    ZONES.forEach(z => { c[z.id] = tables.filter(t=>t.zone===z.id && t.status==='occupied').length; });
    return c;
  }, [tables]);

  const items = [{ id:'all', name:'Tutte', icon:'Layers' }, ...ZONES];

  return (
    <div className="scrollbar" style={{display:'flex',gap:6,overflowX:'auto',padding:'2px 0',flex:1}}>
      {items.map(z => {
        const isAct = active === z.id;
        return (
          <button key={z.id} onClick={()=>onChange(z.id)} style={{
            flexShrink:0,minHeight:44,padding:'8px 14px',
            border:'1px solid '+(isAct?'var(--gold-ring)':'var(--border)'),
            background: isAct?'var(--gold-soft)':'rgba(255,255,255,0.02)',
            color: isAct?'var(--gold)':'var(--text)',
            borderRadius:999,fontSize:13,fontWeight:600,cursor:'pointer',
            display:'flex',alignItems:'center',gap:8
          }}>
            {z.name}
            <span style={{
              fontSize:11,padding:'2px 7px',borderRadius:10,
              background: isAct?'rgba(212,175,55,0.2)':'rgba(255,255,255,0.06)',
              color: isAct?'var(--gold)':'var(--text-2)',fontWeight:700,
              fontVariantNumeric:'tabular-nums'
            }}>{occupied[z.id]||0}<span style={{opacity:.5}}>/{counts[z.id]||0}</span></span>
          </button>
        );
      })}
    </div>
  );
}

// Singolo tavolo SVG
function TableNode({ t, density, onClick, alertPulse }){
  const st = STATUS[t.status];
  const isCircle = t.shape === 'circle';
  const isSquare = t.shape === 'square';
  const cx = t.x + t.w/2;
  const cy = t.y + t.h/2;

  // Densità: scala visiva tavoli (tweak)
  const scale = density === 'compact' ? 0.85 : density === 'large' ? 1.1 : 1.0;
  const w = t.w * scale, h = t.h * scale;
  const x = cx - w/2, y = cy - h/2;

  // Fill / stroke per stato
  const fill = `${st.color}22`;
  const stroke = st.color;

  // Indicator alert su tavolo (es. mandatory / late)
  const isAlert = t.alert === 'mandatory' || t.alert === 'late';

  return (
    <g onClick={()=>onClick(t)} style={{cursor:'pointer'}}>
      {/* Halo pulse se occupato + da molto */}
      {t.status==='occupied' && t.lastCourseMin > 20 && (
        <circle cx={cx} cy={cy} r={Math.max(w,h)/2 + 8} fill="none" stroke="var(--err)" strokeWidth="2" opacity="0.5">
          <animate attributeName="r" values={`${Math.max(w,h)/2+8};${Math.max(w,h)/2+18};${Math.max(w,h)/2+8}`} dur="1.6s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.5;0;0.5" dur="1.6s" repeatCount="indefinite"/>
        </circle>
      )}

      {/* Forma tavolo */}
      {isCircle ? (
        <circle cx={cx} cy={cy} r={w/2} fill={fill} stroke={stroke} strokeWidth="2.5"/>
      ) : (
        <rect x={x} y={y} width={w} height={h} rx={isSquare?8:14} fill={fill} stroke={stroke} strokeWidth="2.5"/>
      )}

      {/* Sedie pittogrammi (semplificate) */}
      {Array.from({length:Math.min(t.seats,8)}).map((_,i) => {
        const angle = (i / Math.min(t.seats,8)) * Math.PI * 2;
        const r = (Math.max(w,h)/2) + 10;
        const sx = cx + Math.cos(angle) * r;
        const sy = cy + Math.sin(angle) * r;
        return <circle key={i} cx={sx} cy={sy} r="3.5" fill={`${st.color}66`}/>;
      })}

      {/* Numero tavolo (grande, leggibile) */}
      <text x={cx} y={cy - 6} textAnchor="middle" dominantBaseline="middle"
        fontSize={Math.min(w,h)/3.2} fontWeight="800" fill="var(--text)"
        style={{fontVariantNumeric:'tabular-nums'}}>{t.id}</text>

      {/* Stato testuale (mai solo colore — daltonici friendly) */}
      <text x={cx} y={cy + Math.min(w,h)/4.5} textAnchor="middle" dominantBaseline="middle"
        fontSize={Math.min(w,h)/7} fontWeight="700" fill={st.color}
        style={{textTransform:'uppercase',letterSpacing:'0.08em'}}>
        {st.short}
      </text>

      {/* Posti */}
      <text x={cx} y={cy + Math.min(w,h)/2.6} textAnchor="middle" dominantBaseline="middle"
        fontSize={Math.min(w,h)/9} fontWeight="600" fill="rgba(245,245,220,0.55)">
        {t.seats}p
      </text>

      {/* Badge tempo permanenza in alto */}
      {t.status === 'occupied' && (
        <g>
          <rect x={cx - 30} y={y - 22} width="60" height="20" rx="10"
            fill="#0a0a0a" stroke={t.lastCourseMin > 20 ? 'var(--err)' : 'var(--border)'} strokeWidth="1"/>
          <text x={cx} y={y - 12} textAnchor="middle" dominantBaseline="middle"
            fontSize="11" fontWeight="700"
            fill={t.lastCourseMin > 20 ? 'var(--err)' : 'var(--text-2)'}
            style={{fontVariantNumeric:'tabular-nums'}}>
            {Math.floor(t.sinceMin)}'
          </text>
        </g>
      )}

      {/* Alert icon top-right */}
      {isAlert && (
        <g transform={`translate(${x+w-6},${y+6})`}>
          <circle r="11" fill="var(--err)"/>
          <text textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="800" fill="#fff" y="1">!</text>
        </g>
      )}

      {/* Reserved name label */}
      {t.status === 'reserved' && (
        <g>
          <rect x={cx - 50} y={y + h + 4} width="100" height="20" rx="10"
            fill="rgba(59,130,246,0.18)" stroke="var(--info)" strokeWidth="1"/>
          <text x={cx} y={y + h + 14} textAnchor="middle" dominantBaseline="middle"
            fontSize="11" fontWeight="600" fill="var(--info)">{t.reservedFor?.split(' · ')[1]}</text>
        </g>
      )}
    </g>
  );
}

function FloorPlan({ onOpenOrder }){
  const s = useStore();
  const [active, setActive] = fS('all');
  const [selected, setSelected] = fS(null);
  const [sheet, setSheet] = fS(false);
  const [hint, setHint] = fS(true);

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "density": "regular",
    "showZoneBg": true,
    "statusPalette": "default",
    "infoDensity": "rich"
  }/*EDITMODE-END*/;
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Override colori stato (variante palette)
  fE(() => {
    const root = document.documentElement;
    if (t.statusPalette === 'softer'){
      root.style.setProperty('--ok','#34D399');
      root.style.setProperty('--err','#F87171');
      root.style.setProperty('--info','#60A5FA');
      root.style.setProperty('--warn','#FBBF24');
      root.style.setProperty('--park','#C084FC');
    } else if (t.statusPalette === 'strong'){
      root.style.setProperty('--ok','#16A34A');
      root.style.setProperty('--err','#DC2626');
      root.style.setProperty('--info','#2563EB');
      root.style.setProperty('--warn','#CA8A04');
      root.style.setProperty('--park','#9333EA');
    } else {
      root.style.setProperty('--ok','#22C55E');
      root.style.setProperty('--err','#EF4444');
      root.style.setProperty('--info','#3B82F6');
      root.style.setProperty('--warn','#EAB308');
      root.style.setProperty('--park','#A855F7');
    }
  }, [t.statusPalette]);

  const visibleTables = active === 'all' ? s.tables : s.tables.filter(x => x.zone === active);

  // KPI strip
  const stats = fM(() => {
    const occ = s.tables.filter(t=>t.status==='occupied').length;
    const total = s.tables.length;
    const totalRev = s.tables.reduce((a,b)=>a+(b.ordersTotal||0),0);
    const alerts = s.tables.filter(t=>t.alert).length;
    const dirty = s.tables.filter(t=>t.status==='dirty').length;
    return { occ, total, totalRev, alerts, dirty };
  }, [s.tables]);

  function handleTableTap(table){
    setSelected(table);
    setSheet(true);
    if (hint) setHint(false);
  }

  function handleAction(actionId, table){
    setSheet(false);
    if (actionId === 'open'){
      setTableStatus(table.id, 'occupied', { sinceMin:0, lastCourseMin:0, waiter:s.user.name, ordersTotal:0 });
      // Vai a OrderPage
      store.set({ page:'order', selectedTableId: table.id });
      onOpenOrder?.(table.id);
    } else if (actionId === 'order'){
      store.set({ page:'order', selectedTableId: table.id });
      onOpenOrder?.(table.id);
    } else if (actionId === 'pay'){
      store.set({ page:'checkout', selectedTableId: table.id });
    } else if (actionId === 'park'){
      setTableStatus(table.id, 'parked');
    } else if (actionId === 'resume'){
      setTableStatus(table.id, 'occupied', { sinceMin: table.sinceMin || 0, lastCourseMin:0 });
    } else if (actionId === 'free'){
      setTableStatus(table.id, table.status==='dirty'?'free':'dirty');
    } else if (actionId === 'reserve' || actionId === 'move' || actionId === 'merge' || actionId === 'split'){
      pushUndo(`${({reserve:'Riservato',move:'Mossa',merge:'Unione',split:'Split'})[actionId]} ${table.id}`, ()=>{});
    }
  }

  // Zone bg rect shading (per orientarsi)
  const zoneRects = [
    { id:'sala',    x:60,  y:80,  w:570, h:240, label:'Sala da Pranzo' },
    { id:'veranda', x:660, y:80,  w:380, h:240, label:'Veranda' },
    { id:'bar',     x:1070,y:80,  w:400, h:120, label:'BAR' },
    { id:'chiosco', x:1070,y:210, w:400, h:120, label:'Chiosco Bar' },
    { id:'mare',    x:60,  y:430, w:570, h:290, label:'Mare', accent:'#3B82F622' },
    { id:'nettuno', x:660, y:430, w:380, h:290, label:'Nettuno' },
    { id:'vip1',    x:1070,y:430, w:400, h:130, label:'VIP 1', accent:'#D4AF3722' },
    { id:'vip2',    x:1070,y:580, w:400, h:140, label:'VIP 2', accent:'#D4AF3722' },
  ];

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
      {/* Header strip — KPI + zone tabs + legenda */}
      <div style={{padding:'14px 20px 10px',display:'flex',flexDirection:'column',gap:10,borderBottom:'1px solid var(--border)'}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <div>
            <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Sala live</div>
            <div style={{fontSize:26,fontWeight:700,marginTop:2,display:'flex',alignItems:'baseline',gap:8,fontFamily:'var(--serif)',letterSpacing:'-0.01em'}}>
              <span className="tnum">{stats.occ}/{stats.total}</span>
              <span style={{fontSize:14,fontWeight:500,color:'var(--text-2)'}}>tavoli occupati</span>
            </div>
          </div>
          <div style={{height:36,width:1,background:'var(--border)'}}/>
          <div>
            <div style={{fontSize:11,letterSpacing:'0.1em',color:'var(--text-3)',textTransform:'uppercase',fontWeight:700}}>Incasso aperto</div>
            <div style={{fontSize:26,fontWeight:700,marginTop:2,color:'var(--gold)',fontFamily:'var(--serif)',letterSpacing:'-0.01em'}} className="tnum">{formatEur(stats.totalRev)}</div>
          </div>
          <div style={{height:36,width:1,background:'var(--border)'}}/>
          {stats.alerts > 0 && (
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',
              background:'rgba(239,68,68,0.12)',border:'1px solid var(--err)',borderRadius:10,
              animation:'pulse-err 1.6s infinite'}}>
              <AlertTriangle size={18} style={{color:'var(--err)'}}/>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--err)',letterSpacing:'0.05em',textTransform:'uppercase'}}>Attenzione</div>
                <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{stats.alerts} tavoli in ritardo</div>
              </div>
            </div>
          )}
          <div style={{flex:1}}/>
          <StatusLegend/>
        </div>
        <ZoneTabs active={active} onChange={setActive} tables={s.tables}/>
      </div>

      {/* Floor plan SVG */}
      <div style={{flex:1,position:'relative',overflow:'hidden',background:'var(--canvas)'}}>
        {/* Pattern di sfondo */}
        <svg width="100%" height="100%" viewBox="0 0 1500 760" preserveAspectRatio="xMidYMid meet"
          style={{display:'block',width:'100%',height:'100%'}}>
          {/* Background gradients per orientarsi: il "mare" in basso */}
          <defs>
            <linearGradient id="seaGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#0a1a2a" stopOpacity="0.5"/>
              <stop offset="100%" stopColor="#082032" stopOpacity="0.9"/>
            </linearGradient>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="1500" height="760" fill="url(#grid)"/>

          {/* Mare in basso */}
          <rect x="0" y="430" width="1500" height="330" fill="url(#seaGrad)" opacity="0.7"/>
          <text x="750" y="745" textAnchor="middle" fontSize="10" fill="rgba(59,130,246,0.4)" letterSpacing="8">↓ MARE ADRIATICO ↓</text>

          {/* Cucina label */}
          <g>
            <rect x="630" y="340" width="100" height="80" rx="6" fill="rgba(212,175,55,0.06)" stroke="rgba(212,175,55,0.25)" strokeWidth="1.5" strokeDasharray="6 4"/>
            <text x="680" y="385" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--gold)" letterSpacing="2">CUCINA</text>
          </g>
          <g>
            <line x1="0" y1="340" x2="630" y2="340" stroke="rgba(255,255,255,0.04)" strokeDasharray="4 6"/>
            <line x1="730" y1="340" x2="1500" y2="340" stroke="rgba(255,255,255,0.04)" strokeDasharray="4 6"/>
          </g>

          {/* Zone backgrounds (se on) */}
          {t.showZoneBg && zoneRects.map(z => {
            const isActive = active === 'all' || active === z.id;
            return (
              <g key={z.id} opacity={isActive ? 1 : 0.25}>
                <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="14"
                  fill={z.accent || 'rgba(255,255,255,0.018)'}
                  stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
                <text x={z.x+12} y={z.y+18} fontSize="10" fontWeight="700"
                  fill="rgba(245,245,220,0.45)" letterSpacing="2"
                  style={{textTransform:'uppercase'}}>{z.label}</text>
              </g>
            );
          })}

          {/* Tavoli */}
          {visibleTables.map(tbl => (
            <TableNode key={tbl.id} t={tbl} density={t.density} onClick={handleTableTap}/>
          ))}
        </svg>

        {/* Onboarding hint flottante */}
        <OnboardingHint shown={hint} onDismiss={()=>setHint(false)}/>
      </div>

      {/* Bottom sheet */}
      <BottomSheet open={sheet} onClose={()=>setSheet(false)}
        table={selected} onAction={handleAction}/>

      {/* Tweaks panel (dimensione tavoli, palette, info density) */}
      <TweaksPanel title="Tweaks · Sala">
        <TweakSection label="Mappa"/>
        <TweakRadio label="Dim. tavoli" value={t.density} options={['compact','regular','large']}
          onChange={(v)=>setTweak('density',v)}/>
        <TweakToggle label="Sfondo zone" value={t.showZoneBg} onChange={v=>setTweak('showZoneBg',v)}/>
        <TweakSection label="Stati"/>
        <TweakRadio label="Palette" value={t.statusPalette} options={['default','softer','strong']}
          onChange={(v)=>setTweak('statusPalette',v)}/>
        <TweakSection label="Info"/>
        <TweakRadio label="Densità" value={t.infoDensity} options={['minimal','rich']}
          onChange={(v)=>setTweak('infoDensity',v)}/>
      </TweaksPanel>
    </div>
  );
}
window.FloorPlan = FloorPlan;
