import { useNavigate } from 'react-router-dom'

export default function NotFoundPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center flex-col gap-4">
      <div className="text-6xl">404</div>
      <h2 className="text-[#F5F5DC] text-2xl font-semibold">Pagina non trovata</h2>
      <button
        onClick={() => navigate('/')}
        className="mt-4 px-6 py-2 bg-[#8B0000] text-[#F5F5DC] rounded-xl hover:bg-[#B22222] transition"
      >
        Torna alla home
      </button>
    </div>
  )
}
