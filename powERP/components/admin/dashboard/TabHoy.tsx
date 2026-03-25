'use client'

import { Activity, CircleAlert, Route, Wallet } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardHoy, IncidenciaReciente } from '@/lib/hooks/useDashboard'

interface Props {
  kpis: DashboardHoy | undefined
  incidenciasRecientes: IncidenciaReciente[] | undefined
  isLoading: boolean
}

function formatCOP(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

function progress(realizadas: number, planificadas: number) {
  if (planificadas <= 0) return 0
  return Math.min(100, Math.round((realizadas / planificadas) * 100))
}

function formatDateTime(value: string) {
  if (!value) return '—'

  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(value))
}

function InsightCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string
  value: string
  helper: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
        <div className="text-slate-500">{icon}</div>
      </div>
      <p className="mt-4 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
    </div>
  )
}

export function TabHoy({ kpis, incidenciasRecientes, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Skeleton className="h-[280px] w-full rounded-[1.6rem]" />
        <Skeleton className="h-[280px] w-full rounded-[1.6rem]" />
      </div>
    )
  }

  const visitasRealizadas = kpis?.visitas_realizadas ?? 0
  const visitasPlanificadas = kpis?.visitas_planificadas ?? 0
  const cumplimiento = progress(visitasRealizadas, visitasPlanificadas)
  const incidenciasAbiertas = kpis?.incidencias_abiertas ?? 0

  return (
    <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
      <section className="overflow-hidden rounded-[1.8rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.16),_transparent_40%),linear-gradient(135deg,_#0f172a_0%,_#172554_52%,_#1e3a8a_100%)] p-6 text-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.8)]">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200/90">Pulso Operativo</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <h3 className="text-3xl font-semibold tracking-tight">La jornada va en {cumplimiento}%</h3>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-200">
              Este bloque resume el avance real de la ruta del día, el ritmo de recaudo y la presión operativa
              generada por incidencias abiertas.
            </p>

            <div className="mt-6 rounded-[1.4rem] border border-white/10 bg-white/8 p-5 backdrop-blur">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-100/70">
                    Cumplimiento de visitas
                  </p>
                  <p className="mt-2 text-4xl font-semibold">
                    {visitasRealizadas}
                    <span className="text-lg font-medium text-slate-300"> / {visitasPlanificadas}</span>
                  </p>
                </div>
                <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sm text-slate-100">
                  {cumplimiento}%
                </div>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-300 via-cyan-300 to-emerald-300 transition-[width]"
                  style={{ width: `${cumplimiento}%` }}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-200">
                <span>Visitas completadas sin fricción operativa.</span>
                <span>Objetivo del día cargado desde la agenda registrada.</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-[1.4rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Recaudo del mes</p>
              <p className="mt-3 text-2xl font-semibold">{formatCOP(kpis?.cobros_mes ?? 0)}</p>
              <p className="mt-1 text-sm text-slate-300">Cobrado acumulado en el mes comercial vigente.</p>
            </div>

            <div className="rounded-[1.4rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Ventas</p>
              <p className="mt-3 text-2xl font-semibold">{formatCOP(kpis?.ventas_hoy ?? 0)}</p>
              <p className="mt-1 text-sm text-slate-300">Ventas inferidas a partir del cierre transaccional.</p>
            </div>

            <div className="rounded-[1.4rem] border border-white/10 bg-white/8 p-4 backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">Riesgo actual</p>
              <p className="mt-3 text-2xl font-semibold">{incidenciasAbiertas}</p>
              <p className="mt-1 text-sm text-slate-300">Incidencias todavía abiertas o en análisis.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_20px_70px_-50px_rgba(15,23,42,0.7)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Lectura Rápida</p>
        <div className="mt-5 grid gap-3">
          <InsightCard
            label="Ejecución"
            value={`${cumplimiento}%`}
            helper="Porcentaje de visitas cumplidas sobre lo planificado."
            icon={<Route size={18} />}
          />
          <InsightCard
            label="Recaudo"
            value={formatCOP(kpis?.cobros_mes ?? 0)}
            helper="Caja registrada en el acumulado mensual."
            icon={<Wallet size={18} />}
          />
          <InsightCard
            label="Actividad"
            value={String(visitasRealizadas)}
            helper="Visitas cerradas con flujo operativo completo."
            icon={<Activity size={18} />}
          />
          <InsightCard
            label="Alertas"
            value={String(incidenciasAbiertas)}
            helper="Casos que todavía no completan resolución."
            icon={<CircleAlert size={18} />}
          />
        </div>

        <div className="mt-6 rounded-[1.4rem] border border-slate-200 bg-slate-50/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Incidencias abiertas recientes</p>
              <p className="mt-1 text-sm text-slate-500">Últimos 5 casos abiertos con su antigüedad visible.</p>
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              {incidenciasRecientes?.length ?? 0} casos
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {(incidenciasRecientes?.length ?? 0) === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                No hay incidencias abiertas en este momento.
              </p>
            ) : (
              incidenciasRecientes?.map((incidencia) => (
                <div
                  key={incidencia.incidencia_id}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{incidencia.pdv_nombre}</p>
                      <p className="text-sm capitalize text-slate-500">{incidencia.tipo}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                      {incidencia.dias_abierta} d
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Apertura: {formatDateTime(incidencia.fecha_apertura)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
