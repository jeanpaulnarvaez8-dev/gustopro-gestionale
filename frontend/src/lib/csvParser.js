/**
 * Tiny CSV parser per import catalogo fornitore.
 *
 * Supporta:
 *  - Separatori: virgola, punto-e-virgola (default Excel italiano), tab
 *  - Quoting con "..." (escape "" → ")
 *  - Header riga 1 (richiesta)
 *  - Newline \n e \r\n
 *  - Caratteri UTF-8
 *
 * Auto-detect separatore: conta virgole/semicolons/tab nella riga 1, sceglie
 * il piu' frequente (Excel italiano usa ; per default).
 *
 * Mapping intelligente delle colonne: cerca header con nomi tipici dei
 * fornitori italiani (Codice, Descrizione, Prezzo, ecc.) e li mappa ai
 * campi del nostro schema (name, supplier_code, barcode, ecc.).
 *
 * Output: { headers: [...], rows: [{ name, supplier_code, barcode, ... }] }
 */

const COLUMN_HINTS = {
  // schema field → array of regex per matchare header alternativi
  name:           [/^(descrizione|description|nome|articolo|prodotto|product)/i],
  supplier_code:  [/^(cod(?:ice)?[\s_.-]*art|codice|cod\.|art)$/i, /cod[\s_.]*marr/i, /sku/i],
  barcode:        [/^(ean|gtin|barcode|codice\s*a\s*barre)/i],
  unit:           [/^(um|u\.m\.|unita|unit|um\.v|um\.f)/i],
  cost_per_unit:  [/^(prezzo|price|costo|netto|imp.netto|importo\s*unit)/i],
  min_stock:      [/^(scorta\s*min|min\s*stock|min\.stock)/i],
  current_stock:  [/^(stock|giacenza|scorta|qta(?:\.|.|t|à)|quantita|quantity)/i],
}

const UNIT_NORMALIZE = {
  'PZ':'pz','PEZZO':'pz','PEZZI':'pz','PCS':'pz','N':'pz',
  'KG':'kg','Kg':'kg','GR':'g','G':'g','GRAMMI':'g',
  'LT':'lt','L':'lt','LITRO':'lt','ML':'ml',
  'CT':'pz','CONFEZIONE':'pz','SC':'sc','BT':'bt','BOTTIGLIA':'bt',
}

export function parseCSV(text) {
  const cleaned = text.replace(/\r\n/g, '\n').trim()
  if (!cleaned) return { headers: [], rows: [], separator: ',', mapping: {} }

  // Auto-detect separator dal primo line
  const firstLine = cleaned.split('\n')[0]
  const counts = {
    ';': (firstLine.match(/;/g) || []).length,
    ',': (firstLine.match(/,/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
  }
  const separator = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ','

  const lines = parseLines(cleaned, separator)
  if (lines.length === 0) return { headers: [], rows: [], separator, mapping: {} }

  const headers = lines[0].map((h) => String(h || '').trim())
  const dataLines = lines.slice(1).filter((r) => r.some((c) => String(c || '').trim()))

  // Build mapping header → schema field
  const mapping = {}
  for (const [field, patterns] of Object.entries(COLUMN_HINTS)) {
    for (let i = 0; i < headers.length; i++) {
      if (patterns.some((rx) => rx.test(headers[i]))) {
        if (!mapping[field]) mapping[field] = i
      }
    }
  }

  const rows = dataLines.map((cells) => {
    const row = {}
    for (const [field, colIdx] of Object.entries(mapping)) {
      const raw = String(cells[colIdx] || '').trim()
      if (!raw) continue
      if (field === 'unit') {
        row[field] = UNIT_NORMALIZE[raw.toUpperCase()] || raw.toLowerCase()
      } else if (['cost_per_unit', 'min_stock', 'current_stock'].includes(field)) {
        // Decimal: virgola → punto + remove euro/spazi
        const num = parseFloat(raw.replace(/[€\s]/g, '').replace(',', '.'))
        if (!Number.isNaN(num)) row[field] = num
      } else {
        row[field] = raw
      }
    }
    return row
  }).filter((r) => r.name) // scarta righe senza nome

  return { headers, rows, separator, mapping }
}

// Split per linee + cell, gestendo "..." quoting
function parseLines(text, sep) {
  const lines = []
  let cur = []
  let buf = ''
  let inQuote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') { buf += '"'; i++ }
        else { inQuote = false }
      } else { buf += c }
    } else {
      if (c === '"') { inQuote = true }
      else if (c === sep) { cur.push(buf); buf = '' }
      else if (c === '\n') {
        cur.push(buf); lines.push(cur); cur = []; buf = ''
      } else { buf += c }
    }
  }
  if (buf.length || cur.length) {
    cur.push(buf); lines.push(cur)
  }
  return lines
}
