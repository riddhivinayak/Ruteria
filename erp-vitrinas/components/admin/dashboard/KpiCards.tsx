'use client'

import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, BanknoteArrowDown, ShoppingBag, Waypoints } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardHoy } from '@/lib/hooks/useDashboard'

interface Props {
  data: DashboardHoy | undefined
  isLoading: boolean
}

function formatCOP(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

function percentage(realizadas: number, planificadas: number) {
  if (planificadas <= 0) return 0
  return Math.min(100, Math.round((realizadas / planificadas) * 100))
}

function KpiCard({
  title,
  value,
  hint,
  accent,
  icon: Icon,
  loading,
}: {
  title: string
  value: string
  hint: string
  accent: string
  icon: LucideIcon
  loading: boolean
}) {
  return (
    <div className="relative overflow-hidden rounded-[1.4rem] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)]">
      <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{title}</p>
          {loading ? (
            <>
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-4 w-36" />
            </>
          ) : (
            <>
              <p className="text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
              <p className="text-sm text-slate-500">{hint}</p>
            </>
          )}
        </div>

        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

export function KpiCards({ data, isLoading }: Props) {
  const visitasRealizadas = data?.visitas_realizadas ?? 0
  const visitasPlanificadas = data?.visitas_planificadas ?? 0
  const avance = percentage(visitasRealizadas, visitasPlanificadas)

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="Ventas Hoy"
        value={formatCOP(data?.ventas_hoy ?? 0)}
        hint="Ingresos calculados por cierre de visita"
        accent="bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-500"
        icon={ShoppingBag}
        loading={isLoading}
      />
      <KpiCard
        title="Cobros del Mes"
        value={formatCOP(data?.cobros_mes ?? 0)}
        hint="Recaudo confirmado acumulado del mes"
        accent="bg-gradient-to-r from-sky-400 via-indigo-400 to-blue-600"
        icon={BanknoteArrowDown}
        loading={isLoading}
      />
      <KpiCard
        title="Visitas"
        value={`${visitasRealizadas} / ${visitasPlanificadas}`}
        hint={`${avance}% de ejecución del día`}
        accent="bg-gradient-to-r from-amber-300 via-orange-400 to-rose-500"
        icon={Waypoints}
        loading={isLoading}
      />
      <KpiCard
        title="Incidencias Abiertas"
        value={String(data?.incidencias_abiertas ?? 0)}
        hint="Casos que siguen requiriendo atención"
        accent="bg-gradient-to-r from-rose-400 via-red-400 to-fuchsia-500"
        icon={AlertTriangle}
        loading={isLoading}
      />
    </div>
  )
}
