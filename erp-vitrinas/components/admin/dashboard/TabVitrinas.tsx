'use client'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { StockBajo, TopVitrina } from '@/lib/hooks/useDashboard'

interface Props {
  topVitrinas: TopVitrina[] | undefined
  stockBajo: StockBajo[] | undefined
  isLoading: boolean
}

function formatCOP(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

function StockBar({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, value))
  const barClass =
    safeValue < 15 ? 'bg-rose-500' : safeValue < 30 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className="w-full">
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  )
}

export function TabVitrinas({ topVitrinas, stockBajo, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-[380px] w-full rounded-[1.6rem]" />
        <Skeleton className="h-[380px] w-full rounded-[1.6rem]" />
      </div>
    )
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_20px_70px_-55px_rgba(15,23,42,0.65)]">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Top Vitrinas</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Las vitrinas que más venden este mes</h3>
          </div>
          <p className="text-sm text-slate-500">{topVitrinas?.length ?? 0} posiciones</p>
        </div>

        <div className="mt-6 space-y-3">
          {(topVitrinas?.length ?? 0) === 0 ? (
            <div className="flex h-[280px] items-center justify-center rounded-[1.4rem] border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
              Todavía no hay vitrinas rankeadas en el período actual.
            </div>
          ) : (
            topVitrinas?.map((item, index) => (
              <div
                key={item.vitrina_id}
                className="flex items-center justify-between gap-4 rounded-[1.3rem] border border-slate-200 bg-slate-50/80 px-4 py-4"
              >
                <div className="flex min-w-0 items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{item.pdv_nombre}</p>
                    <p className="text-sm text-slate-500">Vitrina con mejor tracción comercial del mes.</p>
                  </div>
                </div>
                <p className="text-right text-sm font-semibold text-slate-900">{formatCOP(item.total_ventas)}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_20px_70px_-55px_rgba(15,23,42,0.65)]">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Stock Bajo</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Alertas de surtido más sensibles</h3>
          </div>
          <Badge
            variant={(stockBajo?.length ?? 0) > 0 ? 'destructive' : 'secondary'}
            className="rounded-full px-3 py-1"
          >
            {stockBajo?.length ?? 0} alertas
          </Badge>
        </div>

        <div className="mt-6 space-y-3">
          {(stockBajo?.length ?? 0) === 0 ? (
            <div className="flex h-[280px] items-center justify-center rounded-[1.4rem] border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
              No hay vitrinas por debajo del 30% de su surtido objetivo.
            </div>
          ) : (
            stockBajo?.slice(0, 10).map((item) => (
              <div
                key={`${item.vitrina_id}-${item.producto_id}`}
                className="rounded-[1.3rem] border border-slate-200 bg-slate-50/80 px-4 py-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{item.pdv_nombre}</p>
                    <p className="truncate text-sm text-slate-500">{item.producto_nombre}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-slate-900">{item.pct_stock.toFixed(1)}%</p>
                </div>

                <div className="mt-3">
                  <StockBar value={item.pct_stock} />
                </div>

                <div className="mt-3 flex justify-between text-xs text-slate-500">
                  <span>Actual: {item.stock_actual}</span>
                  <span>Objetivo: {item.cantidad_objetivo}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
