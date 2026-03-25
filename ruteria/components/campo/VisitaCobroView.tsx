'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { FormaPago } from '@/lib/hooks/useFormasPago'

export type CobroDraft = {
  monto: number
  forma_pago_id: string
  notas?: string
}

interface Props {
  montoCalculado: number
  formasPago: FormaPago[]
  initialValue?: CobroDraft | null
  onContinuar: (value: CobroDraft) => void
}

function formatCOP(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

const inputCls =
  'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

export function VisitaCobroView({ montoCalculado, formasPago, initialValue, onContinuar }: Props) {
  const [monto, setMonto] = useState(String(initialValue?.monto ?? montoCalculado))
  const [formaPagoId, setFormaPagoId] = useState(initialValue?.forma_pago_id ?? '')
  const [notas, setNotas] = useState(initialValue?.notas ?? '')
  const [error, setError] = useState('')

  const montoNumero = useMemo(() => Number(monto), [monto])
  const hayDiscrepancia = Number.isFinite(montoNumero) && montoNumero !== montoCalculado

  function handleContinuar() {
    if (!Number.isFinite(montoNumero) || montoNumero < 0) {
      setError('Ingresa un monto valido')
      return
    }

    if (!formaPagoId) {
      setError('Selecciona una forma de pago')
      return
    }

    if (hayDiscrepancia && !notas.trim()) {
      setError('La nota es obligatoria cuando el monto cobrado difiere del calculado')
      return
    }

    setError('')
    onContinuar({
      monto: montoNumero,
      forma_pago_id: formaPagoId,
      notas: notas.trim() || undefined,
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-4">
        <p className="text-xs uppercase tracking-wide text-green-700">Monto calculado</p>
        <p className="text-2xl font-bold text-green-800 mt-1">{formatCOP(montoCalculado)}</p>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-600">Monto cobrado *</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={monto}
          onChange={(event) => {
            setMonto(event.target.value)
            setError('')
          }}
          className={inputCls}
          inputMode="decimal"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-slate-600">Forma de pago *</label>
        <select
          value={formaPagoId}
          onChange={(event) => {
            setFormaPagoId(event.target.value)
            setError('')
          }}
          className={inputCls}
        >
          <option value="">Seleccionar forma de pago...</option>
          {formasPago.map((formaPago) => (
            <option key={formaPago.id} value={formaPago.id}>
              {formaPago.nombre}
            </option>
          ))}
        </select>
      </div>

      {hayDiscrepancia && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-600">Nota de discrepancia *</label>
          <textarea
            value={notas}
            onChange={(event) => {
              setNotas(event.target.value)
              setError('')
            }}
            rows={3}
            className={`${inputCls} min-h-[88px] resize-none`}
            placeholder="Explica por que el monto cobrado difiere del calculado"
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button className="w-full" onClick={handleContinuar}>
        Continuar a reposicion
      </Button>
    </div>
  )
}
