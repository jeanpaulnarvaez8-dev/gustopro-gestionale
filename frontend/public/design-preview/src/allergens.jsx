// Icone allergeni UE pittogrammatiche — 14 standard
// Renderizzate inline come SVG su sfondo rosso, riconoscibili a colpo d'occhio

const ALLERGEN_INFO = {
  GLU: { label:'Glutine',     full:'Cereali con glutine' },
  LAT: { label:'Latte',       full:'Latte e derivati' },
  UOV: { label:'Uova',        full:'Uova' },
  PES: { label:'Pesce',       full:'Pesce' },
  CRO: { label:'Crostacei',   full:'Crostacei' },
  ARA: { label:'Arachidi',    full:'Arachidi' },
  SOI: { label:'Soia',        full:'Soia' },
  FRU: { label:'Frutta gusc.',full:'Frutta a guscio' },
  SED: { label:'Sedano',      full:'Sedano' },
  SEN: { label:'Senape',      full:'Senape' },
  SES: { label:'Sesamo',      full:'Semi di sesamo' },
  SOL: { label:'Solfiti',     full:'Anidride solforosa e solfiti' },
  LUP: { label:'Lupini',      full:'Lupini' },
  MOL: { label:'Molluschi',   full:'Molluschi' },
};

// Pittogrammi SVG ispirati allo standard UE — stilizzati, riconoscibili
const ALLERGEN_GLYPHS = {
  GLU: <g fill="currentColor"><ellipse cx="12" cy="6" rx="2" ry="3"/><ellipse cx="9" cy="10" rx="2" ry="3"/><ellipse cx="15" cy="10" rx="2" ry="3"/><ellipse cx="9" cy="15" rx="2" ry="3"/><ellipse cx="15" cy="15" rx="2" ry="3"/><path stroke="currentColor" strokeWidth="1.2" d="M12 8v12" fill="none"/></g>,
  LAT: <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M9 3h6v3l1.5 3v9a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V9L9 6V3z"/></g>,
  UOV: <ellipse cx="12" cy="13" rx="6" ry="8" fill="none" stroke="currentColor" strokeWidth="1.6"/>,
  PES: <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"><path d="M3 12c3-4 7-5 10-5s5 2 6 5c-1 3-3 5-6 5s-7-1-10-5z"/><path d="M19 12l3-3v6l-3-3z" fill="currentColor"/><circle cx="15" cy="11" r="0.8" fill="currentColor"/></g>,
  CRO: <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"><path d="M12 7v3M9 5l1 3M15 5l-1 3"/><ellipse cx="12" cy="14" rx="6" ry="4"/><path d="M6 16l-2 2M18 16l2 2M6 12l-2-1M18 12l2-1"/></g>,
  ARA: <g fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="12" cy="8" rx="4" ry="4.5"/><ellipse cx="12" cy="16" rx="4" ry="4.5"/><path d="M8 12h8"/></g>,
  SOI: <g fill="currentColor"><ellipse cx="9" cy="11" rx="3" ry="3.5"/><ellipse cx="15" cy="14" rx="3" ry="3.5"/><path stroke="currentColor" strokeWidth="1.4" fill="none" d="M9 7c0-2 1-3 3-3M15 11c0-2 1-3 3-3"/></g>,
  FRU: <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M12 4c-3 0-5 3-5 6s2 5 5 5 5-2 5-5-2-6-5-6z"/><path d="M9 9c1 1 2 1 3 1s2 0 3-1"/><path d="M12 15v5"/></g>,
  SED: <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"><path d="M9 4v14M12 4v14M15 4v14"/><path d="M7 18h10v2H7z" fill="currentColor"/></g>,
  SEN: <g fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="9" cy="9" r="1.5" fill="currentColor"/><circle cx="14" cy="11" r="1.5" fill="currentColor"/><circle cx="11" cy="15" r="1.5" fill="currentColor"/><circle cx="16" cy="15" r="1.2" fill="currentColor"/><circle cx="8" cy="14" r="1.2" fill="currentColor"/></g>,
  SES: <g fill="currentColor"><ellipse cx="9" cy="9" rx="1.4" ry="2"/><ellipse cx="14" cy="10" rx="1.4" ry="2" transform="rotate(20 14 10)"/><ellipse cx="10" cy="14" rx="1.4" ry="2" transform="rotate(-15 10 14)"/><ellipse cx="15" cy="15" rx="1.4" ry="2"/></g>,
  SOL: <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M8 5h8v2l-2 2v6l2 2v2H8v-2l2-2V9L8 7V5z"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></g>,
  LUP: <g fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="9" cy="10" r="2"/><circle cx="15" cy="10" r="2"/><circle cx="12" cy="15" r="2"/></g>,
  MOL: <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M5 14c0-4 3-7 7-7s7 3 7 7"/><path d="M5 14c1 1 2 1 3 0s2-1 3 0 2 1 3 0 2-1 3 0 2 1 3 0"/><path d="M7 9l-1-2M17 9l1-2M12 5V3"/></g>,
};

function AllergenIcon({ code, size=20, title }){
  const glyph = ALLERGEN_GLYPHS[code];
  const info = ALLERGEN_INFO[code];
  return (
    <span title={title || info?.full || code} style={{
      display:'inline-flex',alignItems:'center',justifyContent:'center',
      width:size,height:size,borderRadius:size/2,
      background:'#EF4444',color:'#fff',
      boxShadow:'0 0 0 1.5px rgba(239,68,68,0.35)',
      flexShrink:0
    }}>
      <svg viewBox="0 0 24 24" width={size*0.7} height={size*0.7} style={{display:'block'}}>{glyph}</svg>
    </span>
  );
}

function AllergenList({ codes, size=18, max=99 }){
  if (!codes || !codes.length) return null;
  const show = codes.slice(0, max);
  const rest = codes.length - show.length;
  return (
    <span style={{display:'inline-flex',gap:4,alignItems:'center',flexWrap:'wrap'}}>
      {show.map(c => <AllergenIcon key={c} code={c} size={size}/>)}
      {rest > 0 && <span style={{fontSize:10,fontWeight:700,color:'#EF4444'}}>+{rest}</span>}
    </span>
  );
}

window.ALLERGEN_INFO = ALLERGEN_INFO;
window.AllergenIcon = AllergenIcon;
window.AllergenList = AllergenList;
