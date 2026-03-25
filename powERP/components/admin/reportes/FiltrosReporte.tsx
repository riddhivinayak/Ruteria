'use client'

import { useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DEFAULT_REPORT_RANGE, type FiltrosReporte as FiltrosReporteValues } from '@/lib/hooks/useReportes'
import { useColaboradoras } from '@/lib/hooks/useColaboradoras'
import { usePuntosDeVenta } from '@/lib/hooks/usePuntosDeVenta'
import { useProductos } from '@/lib/hooks/useProductos'
import { useRutas } from '@/lib/hooks/useRutas'

interface Props {
  onBuscar: (filtros: FiltrosReporteValues) => void
  isLoading?: boolean
  showRuta?: boolean
  showColaboradora?: boolean
  showPdv?: boolean
  showProducto?: boolean
  showTipo?: boolean
  submitLabel?: string
}

export function FiltrosReporte({
  onBuscar,
  isLoading = false,
  showRuta = false,
  showColaboradora = false,
  showPdv = false,
  showProducto = false,
  showTipo = false,
  submitLabel = 'Buscar',
}: Props) {
  const { data: rutas = [] } = useRutas()
  const { data: colaboradoras = [] } = useColaboradoras()
  const { data: pdvs = [] } = usePuntosDeVenta()
  const { data: productos = [] } = useProductos()

  const [desde, setDesde] = useState(DEFAULT_REPORT_RANGE.desde)
  const [hasta, setHasta] = useState(DEFAULT_REPORT_RANGE.hasta)
  const [rutaId, setRutaId] = useState('')
  const [colaboradoraId, setColaboradoraId] = useState('')
  const [pdvId, setPdvId] = useState('')
  const [productoId, setProductoId] = useState('')
  const [tipo, setTipo] = useState<'incidencia' | 'garantia' | ''>('')

  function handleSubmit() {
    onBuscar({
      desde,
      hasta,
      rutaId: rutaId || undefined,
      colaboradoraId: colaboradoraId || undefined,
      pdvId: pdvId || undefined,
      productoId: productoId || undefined,
      tipo,
    })
  }

  function handleReset() {
    setDesde(DEFAULT_REPORT_RANGE.desde)
    setHasta(DEFAULT_REPORT_RANGE.hasta)
    setRutaId('')
    setColaboradoraId('')
    setPdvId('')
    setProductoId('')
    setTipo('')
    onBuscar({
      desde: DEFAULT_REPORT_RANGE.desde,
      hasta: DEFAULT_REPORT_RANGE.hasta,
    })
  }

  return (
    <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-50px_rgba(15,23,42,0.6)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Filtros</p>
          <p className="mt-1 text-sm text-slate-500">Acota el período y cruza la operación por actor, ruta o PDV.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600">
          <SlidersHorizontal size={14} />
          Consulta bajo demanda
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <label className="space-y-2 text-sm text-slate-600">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Desde</span>
          <input
            type="date"
            value={desde}
            onChange={(event) => setDesde(event.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
          />
        </label>

        <label className="space-y-2 text-sm text-slate-600">
          <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Hasta</span>
          <input
            type="date"
            value={hasta}
            onChange={(event) => setHasta(event.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
          />
        </label>

        {showRuta && (
          <label className="space-y-2 text-sm text-slate-600">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Ruta</span>
            <select
              value={rutaId}
              onChange={(event) => setRutaId(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
            >
              <option value="">Todas</option>
              {rutas.map((ruta) => (
                <option key={ruta.id} value={ruta.id}>
                  {ruta.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        {showColaboradora && (
          <label className="space-y-2 text-sm text-slate-600">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Colaboradora</span>
            <select
              value={colaboradoraId}
              onChange={(event) => setColaboradoraId(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
            >
              <option value="">Todas</option>
              {colaboradoras.map((colaboradora) => (
                <option key={colaboradora.id} value={colaboradora.id}>
                  {colaboradora.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        {showPdv && (
          <label className="space-y-2 text-sm text-slate-600">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">PDV</span>
            <select
              value={pdvId}
              onChange={(event) => setPdvId(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
            >
              <option value="">Todos</option>
              {pdvs.map((pdv) => (
                <option key={pdv.id} value={pdv.id}>
                  {pdv.nombre_comercial}
                </option>
              ))}
            </select>
          </label>
        )}

        {showProducto && (
          <label className="space-y-2 text-sm text-slate-600">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Producto</span>
            <select
              value={productoId}
              onChange={(event) => setProductoId(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
            >
              <option value="">Todos</option>
              {productos.map((producto) => (
                <option key={producto.id} value={producto.id}>
                  {producto.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        {showTipo && (
          <label className="space-y-2 text-sm text-slate-600">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Tipo</span>
            <select
              value={tipo}
              onChange={(event) => setTipo(event.target.value as 'incidencia' | 'garantia' | '')}
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-slate-200"
            >
              <option value="">Todos</option>
              <option value="incidencia">Incidencias</option>
              <option value="garantia">Garantías</option>
            </select>
          </label>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={handleSubmit} disabled={isLoading} className="rounded-xl bg-slate-900 text-white hover:bg-slate-800">
          <Search size={16} />
          {isLoading ? 'Consultando...' : submitLabel}
        </Button>
        <Button variant="outline" onClick={handleReset} className="rounded-xl">
          <X size={16} />
          Limpiar
        </Button>
      </div>
    </div>
  )
}
