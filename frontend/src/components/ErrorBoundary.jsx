import { Component } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info)
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen bg-[#1A1A1A] flex flex-col items-center justify-center gap-5 px-6">
        <div className="w-16 h-16 rounded-full bg-red-900/30 border border-red-500/40 flex items-center justify-center">
          <AlertTriangle size={28} className="text-red-400" />
        </div>
        <div className="text-center">
          <h1 className="text-[#F5F5DC] text-xl font-bold mb-2">Qualcosa è andato storto</h1>
          <p className="text-[#888] text-sm max-w-xs">
            Si è verificato un errore imprevisto. Ricarica la pagina per continuare.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mt-4 text-left text-red-400 text-xs bg-[#2A2A2A] rounded-xl p-4 max-w-md overflow-auto">
              {this.state.error.toString()}
            </pre>
          )}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#D4AF37] text-[#1A1A1A] font-bold rounded-xl hover:bg-[#c9a42e] transition"
        >
          <RefreshCw size={15} /> Ricarica
        </button>
      </div>
    )
  }
}
