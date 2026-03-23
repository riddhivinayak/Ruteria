'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ItemConteo } from '@/lib/hooks/useVisita'

export type ReposicionDraft = {
  producto_id: string
  nombre: string
  invAnterior: number
  invActual: number
  cantidadObjetivo: number
  stockColaboradora: number
  sugerido: number
  unidades_repuestas: number
}

interface Props {
  items: ItemConteo[]
  initialValue?: ReposicionDraft[] | null
  onContinuar: (items: ReposicionDraft[]) => void
}

function buildInitialRows(items: ItemConteo[]): ReposicionDraft[] {
  return items.map((item) => {
    const invActual = item.invActual ?? 0
    const faltante = Math.max(item.cantidadObjetivo - invActual, 0)
    const sugerido = Math.min(faltante, item.stockColaboradora)

    return {
      producto_id: item.productoId,
      nombre: item.nombre,
      invAnterior: item.invAnterior,
      invActual,
      cantidadObjetivo: item.cantidadObjetivo,
      stockColaboradora: item.stockColaboradora,
      sugerido,
      unidades_repuestas: sugerido,
    }
  })
}

const inputCls =
  'w-20 rounded border border-slate-300 px-2 py-1 text-center text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200'

export function VisitaReposicionView({ items, initialValue, onContinuar }: Props) {
  const [rows, setRows] = useState<ReposicionDraft[]>(initialValue?.length ? initialValue : buildInitialRows(items))
  const [error, setError] = useState('')

  function updateCantidad(productoId: string, rawValue: string) {
    const cantidad = rawValue === '' ? 0 : Math.max(0, parseInt(rawValue, 10) || 0)
    setRows((current) => current.map((row) => {
      if (row.producto_id !== productoId) return row
      return { ...row, unidades_repuestas: cantidad }
    }))
    setError('')
  }

  function handleContinuar() {
    const invalida = rows.find((row) => row.unidades_repuestas > row.stockColaboradora)
    if (invalida) {
      setError(`La reposicion de ${invalida.nombre} supera tu stock disponible`)
      return
    }

    onContinuar(rows)
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <th className="text-left px-3 py-2">Producto</th>
              <th className="text-center px-2 py-2">Act</th>
              <th className="text-center px-2 py-2">Objetivo</th>
              <th className="text-center px-2 py-2">Tu stock</th>
              <th className="text-center px-2 py-2">Sugerido</th>
              <th className="text-center px-2 py-2">A reponer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.producto_id}>
                <td className="px-3 py-2 font-medium text-slate-800">{row.nombre}</td>
                <td className="px-2 py-2 text-center text-slate-500">{row.invActual}</td>
                <td className="px-2 py-2 text-center text-slate-500">{row.cantidadObjetivo}</td>
                <td className="px-2 py-2 text-center font-medium text-slate-700">{row.stockColaboradora}</td>
                <td className="px-2 py-2 text-center text-blue-700 font-medium">{row.sugerido}</td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="number"
                    min={0}
                    max={row.stockColaboradora}
                    value={row.unidades_repuestas}
                    onChange={(event) => updateCantidad(row.producto_id, event.target.value)}
                    className={inputCls}
                    aria-label={`A reponer de ${row.nombre}`}
                  />
                  {row.unidades_repuestas > row.stockColaboradora && (
                    <p className="text-[11px] text-red-600 mt-1">Supera tu stock</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button className="w-full" onClick={handleContinuar}>
        Continuar a fotos
      </Button>
    </div>
  )
}
