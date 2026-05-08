import { createContext, useCallback, useContext, useState } from 'react'
import { Trash2, AlertTriangle, Check, MessageSquare } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'
import Input from './Input'

/**
 * useConfirm — Modal v2 promise-based per sostituire window.confirm/prompt.
 *
 * window.confirm:
 *   - blocca event loop
 *   - look nativo (non tematizzato)
 *   - non si testa in jest/playwright facilmente
 *   - mostrato nella tab in modalita' application e' brutto
 *
 * Uso:
 *   const { confirm, prompt } = useConfirm()
 *   if (!await confirm({ title: 'Eliminare?', tone: 'danger', confirmText: 'Sì, elimina' })) return
 *   const name = await prompt({ title: 'Nome categoria', placeholder: '...', defaultValue: '' })
 *   if (!name) return // cancelled
 *
 * Setup richiesto in App root:
 *   <ConfirmProvider>...</ConfirmProvider>
 *
 * confirm() → Promise<boolean>
 * prompt()  → Promise<string | null>
 */
const ConfirmCtx = createContext(null)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({ open: false })

  // confirm async opens a modal and resolves on user action
  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      setState({
        open: true,
        kind: 'confirm',
        title: opts.title || 'Conferma',
        description: opts.description,
        tone: opts.tone || 'default',  // 'default' | 'danger'
        confirmText: opts.confirmText || 'Conferma',
        cancelText: opts.cancelText || 'Annulla',
        confirmIcon: opts.confirmIcon,
        resolve,
      })
    })
  }, [])

  // prompt async — input + confirm
  const prompt = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      setState({
        open: true,
        kind: 'prompt',
        title: opts.title || 'Inserisci valore',
        description: opts.description,
        placeholder: opts.placeholder || '',
        defaultValue: opts.defaultValue || '',
        confirmText: opts.confirmText || 'Conferma',
        cancelText: opts.cancelText || 'Annulla',
        validate: opts.validate, // (value) => string error message or null
        resolve,
      })
    })
  }, [])

  const close = (result) => {
    state.resolve?.(result)
    setState((s) => ({ ...s, open: false }))
  }

  return (
    <ConfirmCtx.Provider value={{ confirm, prompt }}>
      {children}
      <ConfirmDialog state={state} onClose={close} />
    </ConfirmCtx.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) {
    // Soft fallback: ritorna a window.confirm/prompt se ConfirmProvider non e'
    // montato (es. test). Permette di usare l'API anche in pagine isolate.
    return {
      confirm: async ({ title, description }) =>
        window.confirm([title, description].filter(Boolean).join('\n\n')),
      prompt: async ({ title, defaultValue = '' }) =>
        window.prompt(title, defaultValue),
    }
  }
  return ctx
}

function ConfirmDialog({ state, onClose }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)

  // Reset input on open (kind=prompt)
  if (state.open && state.kind === 'prompt' && value === '' && state.defaultValue && error === null) {
    // sync default value once when modal becomes open
    setValue(state.defaultValue)
  }
  if (!state.open && (value !== '' || error !== null)) {
    // Reset alla chiusura per il prossimo open
    setTimeout(() => { setValue(''); setError(null) }, 250)
  }

  if (!state.open) return null

  const isDanger = state.tone === 'danger'

  function submitPrompt() {
    const trimmed = value.trim()
    if (state.validate) {
      const err = state.validate(trimmed)
      if (err) {
        setError(err)
        return
      }
    }
    onClose(trimmed)
  }

  return (
    <Modal
      open={state.open}
      onClose={() => onClose(state.kind === 'prompt' ? null : false)}
      title={
        state.kind === 'confirm' && isDanger ? (
          <span className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-[var(--color-err)]" />
            {state.title}
          </span>
        ) : state.kind === 'prompt' ? (
          <span className="flex items-center gap-2">
            <MessageSquare size={20} className="text-[var(--color-gold)]" />
            {state.title}
          </span>
        ) : (
          state.title
        )
      }
      description={state.description}
      tone={isDanger ? 'danger' : 'default'}
      size="sm"
      footer={
        <Modal.Actions>
          <Button
            variant="ghost"
            onClick={() => onClose(state.kind === 'prompt' ? null : false)}
          >
            {state.cancelText}
          </Button>
          {state.kind === 'confirm' ? (
            <Button
              variant={isDanger ? 'danger' : 'primary'}
              leftIcon={state.confirmIcon || (isDanger ? <Trash2 size={16} /> : <Check size={16} />)}
              onClick={() => onClose(true)}
              autoFocus
            >
              {state.confirmText}
            </Button>
          ) : (
            <Button onClick={submitPrompt}>{state.confirmText}</Button>
          )}
        </Modal.Actions>
      }
    >
      {state.kind === 'prompt' && (
        <Input
          autoFocus
          placeholder={state.placeholder}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null) }}
          onKeyDown={(e) => e.key === 'Enter' && submitPrompt()}
          error={error}
        />
      )}
    </Modal>
  )
}
