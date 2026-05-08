import { useNavigate } from 'react-router-dom'
import { Home, Compass } from 'lucide-react'
import { Button } from '../components/v2'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex items-center justify-center flex-col gap-5 px-4 text-center">
      <Compass size={48} className="text-[var(--color-gold)] opacity-50" />
      <div className="serif text-[var(--color-gold)] text-7xl font-bold tnum leading-none tracking-tight">
        404
      </div>
      <h2 className="serif text-[var(--color-text)] text-2xl font-bold tracking-tight">
        Pagina non trovata
      </h2>
      <p className="text-[var(--color-text-2)] text-sm max-w-sm">
        La rotta che cercavi non esiste o e&apos; stata spostata. Torna alla home per ricominciare.
      </p>
      <Button leftIcon={<Home size={16} />} onClick={() => navigate('/')}>
        Torna alla home
      </Button>
    </div>
  )
}
