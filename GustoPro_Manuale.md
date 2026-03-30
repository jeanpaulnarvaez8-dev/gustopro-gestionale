# GustoPro Gestionale — Manuale Completo

## Panoramica

GustoPro è un sistema gestionale completo per ristoranti, sviluppato per **Riva Beach Salento**. Gestisce tutto il flusso operativo: dalla presa dell'ordine alla cucina, dal servizio al pagamento, con monitoraggio in tempo reale e gestione del personale.

**URL:** https://gestione.gustopro.it
**Tecnologia:** React 19 + Node.js + PostgreSQL + Socket.io (real-time)
**Deploy:** QNAP NAS con auto-deploy ogni 5 minuti

---

## Accesso e Ruoli

### Utenti del sistema

| Ruolo | Accesso | Descrizione |
|-------|---------|-------------|
| **Admin** | Tutto | Gestione completa del sistema |
| **Manager** | Quasi tutto | Come admin senza gestione staff |
| **Cameriere** | Tavoli, ordini, piatti | Prende ordini e serve i piatti |
| **Chef/Cucina** | Solo KDS | Vede e prepara gli ordini |
| **Cassiere** | Tavoli, cassa | Gestisce i pagamenti |

### Login
- Accesso tramite **PIN numerico** (4-6 cifre)
- Ogni ruolo vede solo le funzioni che gli servono
- Sessione JWT valida 12 ore

---

## 1. Pianta del Ristorante

### Vista principale
Quando l'admin entra, vede la **pianta interattiva** del locale con:
- **4 zone**: BAR (rosso), Botti in Legno (viola), Terrazza VIP (verde), Sala Nettuno (blu)
- **51 tavoli** posizionati come nel locale reale
- **Colori stato**: verde = libero, rosso = occupato, blu = riservato, giallo = pulizia
- **Mare** sul lato destro con onde animate
- **Bancone bar**, cassa e frigo pesce

### Editor pianta (Admin)
- Clicca **"Sposta tavoli"** per attivare il drag & drop
- Trascina i tavoli nella posizione corretta
- Cambia forma: tondo, quadrato, rettangolare
- Modifica dimensioni (W/H) e rotazione
- **Salva** per persistere le posizioni

### Mobile
Su cellulare e tablet la pianta diventa una **lista verticale** con card grandi e touch-friendly, raggruppata per zona.

---

## 2. Gestione Ordini

### Flusso completo
1. Cameriere tocca un tavolo libero
2. **Modale "Quante persone?"** — seleziona 1-20 coperti
3. Si apre la pagina ordine con il menu
4. Seleziona piatti per categoria (Antipasti, Primi, Secondi, ecc.)
5. Per piatti **a peso** (es. pesce): modale per inserire grammi → calcolo automatico €/kg
6. Conferma → ordine inviato in cucina

### Piatti a peso (€/kg)
- I piatti configurati come "a peso" mostrano il badge **A PESO** e il prezzo al kg
- Il cameriere inserisce il peso in grammi
- Il sistema calcola automaticamente: `prezzo = (peso ÷ 1000) × €/kg`
- Nel carrello: "Branzino 350g — €15.75"

### Aggiunta piatti a ordine aperto
Se il tavolo ha già un ordine attivo, i nuovi piatti vengono aggiunti all'ordine esistente.

---

## 3. KDS — Kitchen Display System

### Cosa vede lo chef
- Solo la schermata KDS (nessun altro menu)
- **Tutti gli ordini** dei tavoli aperti
- Gerarchia visiva a 3 livelli:
  - **MAIUSCOLO GRASSETTO** = da fare ORA (active)
  - **A** piccolo = in attesa, non fare ancora (waiting)
  - **c** barrato = già consegnato (delivered)

### Flusso cucina
1. Nuovo ordine arriva → piatti in **"In attesa"** (ambra)
2. Chef clicca **"Inizia"** → passa a **"In preparazione"** (arancione)
3. Chef clicca **"Pronto"** → piatto pronto per il servizio (verde)
4. Il cameriere riceve la **notifica in tempo reale**

### Bevande
Le bevande non hanno il pulsante "Inizia" — solo **"Pronto"** (non si preparano in cucina)

### Aggiornamento in tempo reale
- Gli ordini appaiono istantaneamente via WebSocket
- Polling di backup ogni 15 secondi per connessioni instabili (mobile)
- Ricarica automatica alla riconnessione

---

## 4. Sistema Timer e Alert

### Timer di servizio
Un motore server-side controlla ogni 30 secondi i piatti pronti non serviti:

| Tipo | Alert cameriere | Escalation admin |
|------|----------------|-----------------|
| **Cibo** | 20 minuti | 25 minuti |
| **Bevande** | 5 minuti | 10 minuti |

### Tipi di alert
- **🟡 Pre-alert** (5 min prima): "Prepararsi per prossima portata"
- **🔴 Alert principale**: "Tavolo X — piatto in attesa da Y minuti!"
- **⚠️ Escalation**: notifica rossa all'admin se il cameriere non interviene

### Azioni del cameriere
- **Posticipa +5 min**: rimanda l'alert di 5 minuti
- **Servito**: marca il piatto come consegnato
- **Banner rosso**: se ci sono piatti in ritardo, un banner fisso appare in cima a TUTTE le pagine

### Timer a cascata tra portate
Quando una portata viene servita, partono automaticamente i timer per le successive:

| Da → A | Tempo |
|--------|-------|
| Antipasto → Primo | 20 min |
| Antipasto → Secondo | 45 min |
| Antipasto → Dessert | 70 min |
| Primo → Secondo | 25 min |
| Primo → Dessert | 50 min |
| Secondo → Dessert | 25 min |

---

## 5. Assegnazione Zone

### Funzionalità
- Admin/Manager assegnano camerieri a zone per **turno giornaliero**
- Ogni cameriere vede **solo i tavoli della sua zona**
- Pulsante **"Copia da ieri"** per replicare le assegnazioni

### Sotto-ruoli cameriere
| Sotto-ruolo | Descrizione |
|-------------|-------------|
| Accompagnatore | Accompagna i clienti al tavolo |
| Bevandista | Gestisce le bevande |
| Comì | Assistente cameriere |

---

## 6. Performance Staff

### Punteggio
- Ogni cameriere parte da **100 punti/giorno**
- **-5 punti** per ogni alert ricevuto (ha tardato)
- **-10 punti** per ogni escalation (l'admin è stato avvisato)

### Metriche tracciate
- Items serviti
- Tempo medio di risposta (ready → served)
- Alert ricevuti
- Escalation

### Classifica
Pagina `/performance` con:
- 🥇🥈🥉 Medaglie per i top 3
- Punteggio con barra colorata (verde > 90, giallo > 70, rosso < 70)
- Filtrabile: oggi / settimana / mese

---

## 7. Dashboard Admin

### Panoramica completa
Quando l'admin entra, vede:

**4 KPI in alto:**
- Incasso oggi (vs ieri)
- Tavoli occupati/totale
- Alert attivi
- Scontrino medio

**8 bottoni rapidi:**
Tavoli | KDS | Zone | Performance | Prenotazioni | Inventario | Analisi | Staff

**Staff in servizio:**
- Lista camerieri assegnati con zona
- Assegnazione rapida inline

**Alert attivi:**
- Piatti in ritardo con timer
- "Tutto in ordine" se va tutto bene

Auto-refresh ogni 30 secondi.

---

## 8. Pagamenti e Cassa

### Pre-conto
- Visualizzazione dettagliata dell'ordine con items, modificatori, totali

### Metodi di pagamento
- Contanti
- Carta
- Digitale
- Addebito camera (room charge)

### Split conto
- Scegli numero persone (2-10)
- Importo diviso automaticamente
- Pagamenti individuali con metodo a scelta

### Scontrini
- Ricevuta generata automaticamente
- Storico ultimi 100 scontrini

---

## 9. Menu e Categorie

### Categorie con tipo portata
| Categoria | Tipo portata | Bevanda |
|-----------|-------------|---------|
| Antipasti | antipasto | No |
| Primi | primo | No |
| Secondi | secondo | No |
| Contorni | contorno | No |
| Dessert | dessert | No |
| Bevande | bevanda | Sì |

### Gestione piatti
- Nome, descrizione, prezzo base
- Tempo di preparazione stimato
- Allergeni
- Disponibilità (attivo/disattivo)
- **Pricing type**: prezzo fisso o al kg (per pesce)

### Menu fissi (Combo)
- Creazione menù degustazione multi-portata
- Selezione piatti per ogni corso
- Supplemento opzionale per piatti premium

---

## 10. Inventario

### Fornitori
- Anagrafica fornitori con contatto e email

### Ordini di acquisto
- Creazione PO con items, quantità, costo unitario
- Tracciamento stato ordine

### Ricevimento merce
- Confronto ordinato vs ricevuto
- **Alert automatico** se discrepanza > 5%
- Conferma per-item

### Scarti
- Registrazione scarti con motivo
- **Alert** se valore scarti > €200
- KPI settimanali

### Ingredienti
- Gestione stock con soglia minima
- Alert "sotto scorta"
- Storico movimenti (carico/scarico/rettifica)

---

## 11. Clienti e Prenotazioni

### CRM Clienti
- Anagrafica con nome, telefono, email
- Conteggio visite e ultima visita
- Storico scontrini

### Prenotazioni
- Data, ora, numero persone
- Assegnazione tavolo
- Stati: confermata, seated, cancellata, no-show

---

## 12. Asporto

### Ordini takeaway
- Ordine senza tavolo
- Nome cliente, telefono
- Orario di ritiro
- Notifica cucina come ordine normale

---

## 13. App Mobile (PWA)

### Installabile
- **iPhone**: Safari → "Aggiungi a Home"
- **Android**: Chrome chiede automaticamente "Installa"
- Si apre a schermo intero senza barra browser

### Navigazione mobile
- **Barra in basso** stile app nativa
- Cameriere: Tavoli | Piatti | Asporto | Esci
- Chef: Cucina | Esci
- Admin: Home | Tavoli | KDS | Zone | Esci

### Touch
- Pinch-to-zoom sulla pianta
- Card grandi per i tavoli
- Bottoni touch-friendly

---

## 14. Real-time (WebSocket)

Tutto il sistema è collegato in tempo reale:
- Nuovo ordine → appare istantaneamente nel KDS
- Chef marca "Pronto" → toast al cameriere
- Tavolo si libera → pianta si aggiorna per tutti
- Alert servizio → notifica diretta al cameriere responsabile
- Assegnazioni cambiate → cameriere vede subito le sue zone

---

## 15. Auto-Deploy

- Il codice è su GitHub
- Un cron job sul QNAP controlla ogni 5 minuti
- Se ci sono nuovi commit: git pull → migrazioni DB → Docker build → restart
- Zero downtime: il sistema si aggiorna da solo
- Se la config nginx si perde, viene ricreata automaticamente

---

## Architettura Tecnica

| Componente | Tecnologia |
|-----------|-----------|
| Frontend | React 19 + Vite + Tailwind CSS 4 |
| Backend | Node.js + Express 5 |
| Database | PostgreSQL 15 |
| Real-time | Socket.io |
| Auth | JWT + bcrypt |
| Deploy | Docker su QNAP NAS |
| CDN/SSL | Cloudflare |
| Proxy | Nginx (fix-point-nginx) |

### URL e porte
- `gestione.gustopro.it` → Frontend (:3012) + API (:3011)
- `gustopro.it` → Sito cliente Riva Beach Salento (:3010)

---

*GustoPro Gestionale v1.0 — Sviluppato per Riva Beach Salento*
*Ultimo aggiornamento: Marzo 2026*
