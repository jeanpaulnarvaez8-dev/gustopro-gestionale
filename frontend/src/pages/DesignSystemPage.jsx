import { useState } from 'react';
import {
  AlertTriangle, Check, ChefHat, Coffee, CreditCard, Mail, Pause, Receipt,
  Search, Send, Trash2, Wifi, WifiOff,
} from 'lucide-react';
import {
  Button, Card, Badge, StatusDot, Input, Modal, BottomSheet, useToast,
} from '../components/v2';

/**
 * Showcase route /design-system — galleria visuale dei componenti v2.
 * Serve per:
 *  - Verificare i tokens applicati nel build di produzione
 *  - Cliente/team: vedere lo stato del design system in un'unica pagina
 *  - QA: regression visiva manuale
 *
 * Non richiede auth (pagina di sviluppo).
 */
export default function DesignSystemPage() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="min-h-screen px-4 py-8 sm:px-8">
      <div className="max-w-5xl mx-auto space-y-10">
        {/* Header */}
        <header className="space-y-2">
          <Badge tone="gold" leftIcon={<span className="serif italic">Riva</span>}>
            Design System v2
          </Badge>
          <h1 className="serif text-4xl sm:text-5xl font-bold tracking-tight text-[var(--color-text)]">
            GustoPro <span className="serif-italic text-[var(--color-gold)]">Gestionale</span>
          </h1>
          <p className="text-[var(--color-text-2)] max-w-2xl">
            Galleria componenti v2 — palette mediterranea, tipografia Inter + Fraunces,
            tap target 44px mobile-first.
          </p>
        </header>

        {/* Buttons */}
        <Section title="Buttons" subtitle="5 varianti × 3 size, con leftIcon, loading, fullWidth.">
          <div className="space-y-3">
            <Row>
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger" leftIcon={<Trash2 size={16} />}>Elimina</Button>
              <Button variant="success" leftIcon={<Check size={16} />}>Conferma</Button>
            </Row>
            <Row>
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large (mobile)</Button>
            </Row>
            <Row>
              <Button leftIcon={<Send size={16} />}>Invia</Button>
              <Button variant="secondary" rightIcon={<Receipt size={16} />}>Ricevuta</Button>
              <Button loading>Salvando...</Button>
              <Button disabled>Disabilitato</Button>
            </Row>
          </div>
        </Section>

        {/* Cards */}
        <Section title="Cards" subtitle="3 varianti × 4 padding, optional interactive.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <h3 className="font-semibold mb-1 text-[var(--color-text)]">Default</h3>
              <p className="text-sm text-[var(--color-text-2)]">
                Surface + border soft. Per contenuti standard.
              </p>
            </Card>
            <Card variant="elevated">
              <h3 className="font-semibold mb-1 text-[var(--color-text)]">Elevated</h3>
              <p className="text-sm text-[var(--color-text-2)]">
                Border strong + shadow. Per elementi che devono saltare all'occhio.
              </p>
            </Card>
            <Card variant="outline" interactive onClick={() => toast.gold('Card cliccata')}>
              <h3 className="font-semibold mb-1 text-[var(--color-text)]">Outline interactive</h3>
              <p className="text-sm text-[var(--color-text-2)]">
                Trasparente + border. Cliccami →
              </p>
            </Card>
          </div>
        </Section>

        {/* Badges */}
        <Section title="Badges" subtitle="Pills colorati per stati e contatori.">
          <div className="flex flex-wrap gap-2">
            <Badge tone="gold">Gold</Badge>
            <Badge tone="sea">Sea</Badge>
            <Badge tone="pine">Pine</Badge>
            <Badge tone="sand">Sand</Badge>
            <Badge tone="terracotta">Terracotta</Badge>
            <Badge tone="ok">Ok</Badge>
            <Badge tone="warn">Warn</Badge>
            <Badge tone="err">Err</Badge>
            <Badge tone="info">Info</Badge>
            <Badge tone="park">Park</Badge>
            <Badge tone="neutral">Neutral</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="gold" solid>Solid Gold</Badge>
            <Badge tone="ok" solid>+12 ordini</Badge>
            <Badge tone="err" solid pulse>Alert attivo</Badge>
            <Badge tone="sea" leftIcon={<ChefHat size={11} />}>Cucina</Badge>
            <Badge tone="warn" size="sm">SM</Badge>
          </div>
        </Section>

        {/* StatusDots */}
        <Section title="StatusDot" subtitle="Pallino con halo per stati tavoli / connessione.">
          <div className="flex flex-wrap items-center gap-6">
            {['gold','sea','pine','sand','terracotta','ok','warn','err','info','park'].map((t) => (
              <span key={t} className="flex items-center gap-2 text-sm text-[var(--color-text-2)]">
                <StatusDot tone={t} />
                {t}
              </span>
            ))}
            <span className="flex items-center gap-2 text-sm text-[var(--color-text)]">
              <StatusDot tone="err" pulse />
              <b>pulsante</b>
            </span>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <StatusDot size="xs" tone="gold" />
            <StatusDot size="sm" tone="gold" />
            <StatusDot size="md" tone="gold" />
            <StatusDot size="lg" tone="gold" />
          </div>
        </Section>

        {/* Inputs */}
        <Section title="Inputs" subtitle="Label, hint, error, icone interne.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            <Input label="Email" type="email" placeholder="mario@example.com" leftIcon={<Mail size={16} />} hint="Per notifiche prenotazioni" />
            <Input label="Cerca" placeholder="Cerca tavolo, cliente..." leftIcon={<Search size={16} />} size="lg" />
            <Input label="Coperti" type="number" defaultValue={4} hint="Min 1, max 12" />
            <Input label="PIN" type="password" placeholder="0000" error="PIN errato" />
          </div>
        </Section>

        {/* Overlay triggers */}
        <Section title="Overlays" subtitle="Modal, BottomSheet, Toast.">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setModalOpen(true)}>Apri Modal</Button>
            <Button variant="danger" onClick={() => setDangerOpen(true)} leftIcon={<AlertTriangle size={16} />}>Modal danger</Button>
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>Apri BottomSheet</Button>
            <Button onClick={() => toast.success('Ordine inviato in cucina')} variant="success">Toast success</Button>
            <Button onClick={() => toast.error('Connessione persa')} variant="danger">Toast error</Button>
            <Button onClick={() => toast.warn('Tavolo M2 in ritardo')} variant="secondary">Toast warn</Button>
            <Button onClick={() => toast.gold('Servizio iniziato')} variant="ghost">Toast gold</Button>
          </div>
        </Section>

        {/* Sample real-world: tavolo card */}
        <Section title="Esempio composito" subtitle="Card di tavolo con badge stato + status dot + pulsanti azione.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TableSampleCard id="M2" status="occupied" label="Occupato" tone="gold" total="42,50€" since="38'" waiter="Marco" />
            <TableSampleCard id="M5" status="parked" label="Parcheggiato" tone="park" total="18,00€" since="12'" waiter="Sara" />
            <TableSampleCard id="A1" status="reserved" label="Riservato" tone="sea" reservedFor="Rossi · 20:30" />
          </div>
        </Section>

        {/* Network indicator example */}
        <Section title="Indicatore rete">
          <div className="flex flex-wrap gap-4">
            <Card padding="sm" variant="outline">
              <div className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                <Wifi size={16} className="text-[var(--color-ok)]" />
                <span>Online</span>
                <StatusDot tone="ok" size="sm" />
              </div>
            </Card>
            <Card padding="sm" variant="default">
              <div className="flex items-center gap-2 text-sm text-[var(--color-gold)]">
                <WifiOff size={16} />
                <span>Offline · 3 in coda</span>
                <StatusDot tone="gold" size="sm" pulse />
              </div>
            </Card>
          </div>
        </Section>

        <footer className="pt-6 border-t border-[var(--color-border-soft)] text-center text-xs text-[var(--color-text-3)]">
          GustoPro · Riva Beach Salento · 2026 — Design system v2 · Phase 1
        </footer>
      </div>

      {/* Modals */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Conferma operazione"
        description="Vuoi davvero rilasciare la prossima portata per il tavolo M2?"
        footer={
          <Modal.Actions>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Annulla</Button>
            <Button leftIcon={<Send size={16} />} onClick={() => { setModalOpen(false); toast.success('Portata rilasciata'); }}>
              Rilascia
            </Button>
          </Modal.Actions>
        }
      >
        <Card variant="outline" padding="md">
          <div className="text-sm text-[var(--color-text-2)] space-y-1">
            <div>Tavolo: <b className="text-[var(--color-text)]">M2</b></div>
            <div>Cameriere: <b className="text-[var(--color-text)]">Marco</b></div>
            <div>Portata: <b className="text-[var(--color-text)]">Secondo</b></div>
          </div>
        </Card>
      </Modal>

      <Modal
        open={dangerOpen}
        onClose={() => setDangerOpen(false)}
        tone="danger"
        title="Annulla ordine"
        description="Questa azione non può essere annullata. L'ordine verrà rimosso e i piatti già preparati saranno scartati."
        footer={
          <Modal.Actions>
            <Button variant="ghost" onClick={() => setDangerOpen(false)}>Mantieni</Button>
            <Button variant="danger" leftIcon={<Trash2 size={16} />} onClick={() => { setDangerOpen(false); toast.error('Ordine annullato'); }}>
              Sì, annulla
            </Button>
          </Modal.Actions>
        }
      />

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Azioni tavolo M2">
        <div className="grid grid-cols-2 gap-2">
          <Button size="lg" leftIcon={<Receipt size={20} />} onClick={() => setSheetOpen(false)}>Apri ordine</Button>
          <Button size="lg" variant="secondary" leftIcon={<CreditCard size={20} />} onClick={() => setSheetOpen(false)}>Cassa</Button>
          <Button size="lg" variant="secondary" leftIcon={<Pause size={20} />} onClick={() => setSheetOpen(false)}>Parcheggia</Button>
          <Button size="lg" variant="secondary" leftIcon={<Coffee size={20} />} onClick={() => setSheetOpen(false)}>Caffè</Button>
        </div>
      </BottomSheet>
    </div>
  );
}

// --- helpers locali alla showcase ----------------------------------------

function Section({ title, subtitle, children }) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="serif text-2xl font-bold text-[var(--color-text)]">{title}</h2>
        {subtitle && <p className="text-sm text-[var(--color-text-3)] mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ children }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function TableSampleCard({ id, status, label, tone, total, since, waiter, reservedFor }) {
  return (
    <Card variant="elevated" interactive>
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center font-extrabold text-lg" style={{
          background: `var(--color-${tone}-soft)`,
          color: `var(--color-${tone})`,
          border: `1px solid var(--color-${tone})`,
        }}>{id}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[var(--color-text)]">Tavolo {id}</h3>
            <Badge tone={tone} size="sm">{label}</Badge>
          </div>
          <div className="text-xs text-[var(--color-text-2)] mt-1 flex items-center gap-1.5">
            <StatusDot tone={tone} size="xs" />
            {status === 'reserved' ? reservedFor : `${waiter} · ${since}`}
          </div>
          {total && <div className="tnum text-sm font-semibold text-[var(--color-gold)] mt-2">{total}</div>}
        </div>
      </div>
    </Card>
  );
}
