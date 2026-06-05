-- JP 2026-06-04: seed catalogo F.G. Packaging Solution SRL (fornitore
-- consumabili: bicchieri, carta, detergenti, sacchi, ecc.). Listino
-- promozionale dal PDF mandato da JP, valido 01/05/2026 → 31/12/2099.
-- 61 articoli, prezzo netto per UNITA' (confezione, rotolo, busta a seconda).
-- Stock iniziale = 0: JP fa primo carico inventario dalla pagina /inventory.

-- ─── Supplier ─────────────────────────────────────────────────
INSERT INTO suppliers (tenant_id, name, contact, email, notes)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  'F.G. Packaging Solution SRL',
  'Galatone (LE) - 0833.873782',
  'FG@FG-SRL.COM',
  'Zona Industriale, 73044 Galatone LE - P.IVA 04472220757 - Listino promo 01/05/2026'
WHERE NOT EXISTS (
  SELECT 1 FROM suppliers
   WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
     AND name = 'F.G. Packaging Solution SRL'
);

-- ─── Articoli ─────────────────────────────────────────────────
-- Tutti gli articoli vengono associati al supplier appena creato.
-- supplier_code = codice articolo F.G. dal PDF (es. B160F, 050040, DO4504).
-- unit = 'cf' (confezione) come default: il pezzo contenuto e' gia' nella
-- descrizione (es. "50PZ ISAP", "1000PZ ADER", "10pz"). JP poi precisa.
-- ON CONFLICT su (tenant_id, supplier_code) → re-run safe.

WITH s AS (
  SELECT id FROM suppliers
   WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
     AND name = 'F.G. Packaging Solution SRL'
   LIMIT 1
)
INSERT INTO ingredients (tenant_id, name, unit, current_stock, min_stock, cost_per_unit, supplier_id, supplier_code, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  v.name,
  'cf',
  0,
  0,
  v.cost,
  (SELECT id FROM s),
  v.code,
  true
FROM (VALUES
  ('22',         'ALLUMINIO NUDO mt.125 h33',                                  8.4500),
  ('B160F',      'BICCHIERE 160CC PP TRASP FOUR',                              0.8000),
  ('050040',     'BICCHIERE 400CC PP TRASP 50PZ ISAP',                         2.6300),
  ('852276',     'ASCIUG. 158M A ROT L-ONE MAXI BLU LUCART',                   7.4200),
  ('50503',      'BICCHIERE 250CC PP 50PZ SUPERTRASPARENTE ISAP',              1.7200),
  ('50039',      'BICCHIERE 355CC PP TRASP 30PZ ISAP',                         1.7200),
  ('3OZF',       'BICCHIERE IN CARTONCINO 90ML (3 OZ) 50PZ FOUR',              0.7800),
  ('7OZ',        'BICCHIERE IN CARTONCINO 7 OZ 50PZ FGP',                      1.6800),
  ('SHOMD2',     'BIOCOMPOST SHOPPERS MEDIE 29X52 KG4 BIANCHE LOVE',          18.2500),
  ('851445',     'BOBINA STRONG SUPER 800 LISCIA X 2 LUCART',                 15.3500),
  ('856',        'BST SOTT.GOFF.250x350x100pz',                               17.0700),
  ('3589',       'BUSTE PLT KG.10 22+12x45 IS',                               39.6900),
  ('078509',     'CANNUCCE DRITTE PLA NERE 6X21 500PZ BRE',                    6.4800),
  ('XFC206A',    'CANNUCCE PLA GRANITA NERE 20X6 250PZ',                       6.7800),
  ('0460',       'CARTA FORNO 40X60 500PZ',                                   25.8000),
  ('0262',       'COPERCHIO IN CARTA X BICC. 7 OZ FGP 50PZ',                   2.7800),
  ('C3OZF',      'COPERCHIO PS X BICC. 90ML (3 OZ) 50PZ FOUR',                 1.1300),
  ('CUC12F',     'CUCCHIAINO TRASP PS RIUTILIZZABILE 12CM 50PZ FOUR',          1.1900),
  ('DO1054',     'DOMINA BAKTERIO DISINFECTPRO KG.5',                         13.5000),
  ('DO4301',     'DOMINA DEGREASEPRO LIMONE SGRASS UNIVER. 5LT',              14.5800),
  ('DO4300',     'DOMINA DEGREASEPRO LIMONE TRIGGER SGRASSANTE 750ML',         2.1100),
  ('DO4500',     'DOMINA GLASS PRO VETRI TRIGGER 750ML',                       1.5300),
  ('DO4401',     'DOMINA MULTI ACTIV TRIGGER 750ML',                           3.2500),
  ('DO4104',     'DOMINA WASHPRO SOFT WATER DET. LAVASTOVIGLIE 5LT',          42.1000),
  ('DO4303',     'DOMINA OVENPRO FORNI E PIASTRE TRIGGER 750ML',               5.3500),
  ('DO4504',     'DOMINA SANIKAL PRO TRIGGER 750ML',                           2.4200),
  ('DO4001',     'DOMINA SAPONE LIQUIDO MANI 5LT',                             8.9700),
  ('050201',     'GREMBIULE POLIETILENE DEFENDER 11 100PZ BRE',                9.1500),
  ('101885',     'GLITZI SUPERSTARK NERO 15x7 10PZ VILEDA',                    9.9500),
  ('012686',     'GUANTI NITRILE NERO 100PZ M BRE',                            4.0600),
  ('66995',      'IGIENICA FASCETTATA COMFORT 170S 4ROT BULKY',                0.9600),
  ('812169J',    'IGIENICA L-ONE MINI 180MT BIANCO 2V LUCART',                 5.4200),
  ('729',        'INSETTICIDA PIR.ECOSOL 250ML CF=6 CT=48',                    9.8800),
  ('L0882',      'LYSOFORM CANDEGGINA PROFESSIONALE 5LT',                      3.9000),
  ('131205',     'OVENMATIC DETERGENTE PER FORNI AUTOPULENTI 5KG',            24.5600),
  ('DARPEL30',   'PELLIC.H30 NUDA VIOLA T300',                                 4.4700),
  ('PP700',      'PIATTI PIANI 20 PZ RIUTILIZZABILI IMB',                      0.9200),
  ('POSR',       'POSATE BIS BIANCHE PP RIUTILIZ+TOV 2V 500PZ FOUR',          32.7500),
  ('R10G',       'R10G CONTENITORE ALL 1 PORZIONE ALTA CONTITAL',              0.0660),
  ('99H',        'ROT.CARTA T.POS 57x20 x10pz',                                4.1000),
  ('116',        'R11G CONTENITORE ALL 4 PORZIONI ALTA CONTITAL',              0.1370),
  ('1899',       'R1G CONTENITORE ALL 2 PORZIONI ALTA CONTITAL',               0.0990),
  ('RT81',       'ROT.CARTA TERM.80x80 x 10pz',                               12.3900),
  ('SKB351227M', 'SAC.BIANCO NEUTRO 12+9X27 35GR 1000PZ ADER',                19.1800),
  ('SKB351530M', 'SAC.BIANCO NEUTRO 15+10X30 35GR 1000PZ ADER',               22.3800),
  ('SKB1736',    'SAC.BIANCO NEUTRO 17+11X36 35GR 1000PZ ADER',               26.0000),
  ('070651',     'LEGNO PALETTINE CAFFE 110MM IMBUSTATE 500PZ BRE',            5.6000),
  ('6070AMB',    'SACCHI NU AMBRA 60X70 CT=20KG',                              1.9300),
  ('AMR90120',   'SACCHI NU AMBRA ROT 90X120 1KG',                             3.0500),
  ('N030',       'SACCHI NU COMPOSTABILE 50X60 10PZ FOR',                      0.7700),
  ('110T35',     'SACCHI NU TRASP ECOFOR ROT 70X110 10PZ PF',                  0.8700),
  ('02994',      'SACCHI NU VERDE COMPOSTABILE 90X120 KG.10',                  4.6900),
  ('6302',       'SALVIETTINE RISTORANTE AL LIMONE BLU 500PZ LEONE',          32.8500),
  ('2131',       'SANITEC FRYDET FRIGGITRICI TABLET GR.500',                  19.3900),
  ('50205',      'SIAX CLOR 5KG',                                             10.9000),
  ('140110',     'SIAX LEMON DISH DETERG PIATTI A MANO KG10',                 11.9000),
  ('100201V',    'SPIRALE ABRASIVA INOX 60GR VILEDA',                          2.3300),
  ('101879',     'SPUGNA ABRASIVA VERDE 9X14 10PZ VILEDA',                     6.9000),
  ('831106',     'TOVAGLIOLO STRONG 30X30 T130 1V 500PZ LUCART',               2.9800),
  ('81210000',   'TOV 17X17 3000PZ FATO',                                    10.8300),
  ('180205',     'SIAX FLOOR PINK DETERGENTE PAVIMENTI 5KG',                   9.9000)
) AS v(code, name, cost)
WHERE NOT EXISTS (
  SELECT 1 FROM ingredients i
   WHERE i.tenant_id = '00000000-0000-0000-0000-000000000001'
     AND i.supplier_code = v.code
);
