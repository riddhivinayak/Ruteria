'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import type { VentasDia, VentasRuta } from '@/lib/hooks/useDashboard'

interface Props {
  ventas30dias: VentasDia[] | undefined
  ventasPorRuta: VentasRuta[] | undefined
  isLoading: boolean
}

function formatCOP(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
    notation: value >= 1_000_000 ? 'compact' : 'standard',
  }).format(value)
}

function formatFullCOP(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatShortDate(value: string) {
  if (!value) return '—'
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))

  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(date)
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
      {message}
    </div>
  )
}

export function TabTendencias({ ventas30dias, ventasPorRuta, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-[360px] w-full rounded-[1.6rem]" />
        <Skeleton className="h-[360px] w-full rounded-[1.6rem]" />
      </div>
    )
  }

  const total30Dias = (ventas30dias ?? []).reduce((sum, item) => sum + item.total_ventas, 0)
  const maxDia = (ventas30dias ?? []).reduce((max, item) => Math.max(max, item.total_ventas), 0)
  const mejorRuta = (ventasPorRuta ?? [])[0]

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_20px_70px_-55px_rgba(15,23,42,0.65)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Ventas 30 Días</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Ritmo reciente de la operación</h3>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Acumulado</p>
            <p className="text-xl font-semibold text-slate-950">{formatFullCOP(total30Dias)}</p>
          </div>
        </div>

        <div className="mt-6 h-[280px]">
          {(ventas30dias?.length ?? 0) === 0 ? (
            <EmptyState message="Todavía no hay cierres suficientes para graficar la tendencia mensual." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ventas30dias} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="ventasTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.42} />
                    <stop offset="55%" stopColor="#6366f1" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis
                  dataKey="fecha"
                  tickFormatter={formatShortDate}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(value) => formatCOP(Number(value))}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={84}
                />
                <Tooltip
                  formatter={(value) => [formatFullCOP(Number(value)), 'Ventas']}
                  labelFormatter={(label) => formatShortDate(String(label))}
                  contentStyle={{
                    borderRadius: 16,
                    borderColor: '#cbd5e1',
                    boxShadow: '0 22px 60px -30px rgba(15, 23, 42, 0.5)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total_ventas"
                  stroke="#0f766e"
                  strokeWidth={3}
                  fill="url(#ventasTrendFill)"
                  dot={{ r: 0 }}
                  activeDot={{ r: 5, strokeWidth: 0, fill: '#0f766e' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Acumulado</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{formatFullCOP(total30Dias)}</p>
          </div>
          <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Mejor Día</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{formatFullCOP(maxDia)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_20px_70px_-55px_rgba(15,23,42,0.65)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Ventas Por Ruta</p>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Quién está empujando el mes</h3>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">Ruta líder</p>
            <p className="text-lg font-semibold text-slate-950">{mejorRuta?.ruta ?? '—'}</p>
          </div>
        </div>

        <div className="mt-6 h-[280px]">
          {(ventasPorRuta?.length ?? 0) === 0 ? (
            <EmptyState message="Aún no hay ventas del mes para comparar entre rutas." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ventasPorRuta} margin={{ top: 8, right: 8, left: -12, bottom: 16 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis
                  dataKey="ruta"
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-15}
                  height={56}
                  textAnchor="end"
                />
                <YAxis
                  tickFormatter={(value) => formatCOP(Number(value))}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={84}
                />
                <Tooltip
                  formatter={(value) => [formatFullCOP(Number(value)), 'Ventas']}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as VentasRuta | undefined
                    return row ? `${row.ruta} · ${row.colaboradora}` : String(label)
                  }}
                  contentStyle={{
                    borderRadius: 16,
                    borderColor: '#cbd5e1',
                    boxShadow: '0 22px 60px -30px rgba(15, 23, 42, 0.5)',
                  }}
                />
                <Bar dataKey="total_ventas" radius={[14, 14, 4, 4]}>
                  {(ventasPorRuta ?? []).map((row, index) => (
                    <Cell
                      key={`${row.ruta}-${row.colaboradora}`}
                      fill={index === 0 ? '#0f766e' : index === 1 ? '#2563eb' : '#94a3b8'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="mt-5 rounded-[1.2rem] border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Lectura líder</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">
            {mejorRuta ? `${mejorRuta.ruta} · ${mejorRuta.colaboradora}` : 'Sin líder todavía'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {mejorRuta ? `${formatFullCOP(mejorRuta.total_ventas)} en ventas acumuladas del mes.` : 'Esperando datos del período.'}
          </p>
        </div>
      </section>
    </div>
  )
}
