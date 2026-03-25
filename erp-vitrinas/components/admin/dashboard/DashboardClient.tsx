'use client'

import { Signal, WifiOff } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDashboard } from '@/lib/hooks/useDashboard'
import { KpiCards } from './KpiCards'
import { TabHoy } from './TabHoy'
import { TabTendencias } from './TabTendencias'
import { TabVitrinas } from './TabVitrinas'

export function DashboardClient() {
  const { kpis, incidenciasRecientes, ventas30dias, ventasPorRuta, topVitrinas, stockBajo, realtimeHealthy } =
    useDashboard()
  const isLoadingVitrinas = topVitrinas.isLoading || stockBajo.isLoading
  const isLoadingTendencias = ventas30dias.isLoading || ventasPorRuta.isLoading

  return (
    <main className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.18),_transparent_34%),linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] p-6 shadow-[0_30px_80px_-55px_rgba(15,23,42,0.75)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Dashboard Ejecutivo</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">Lectura viva de la operación comercial</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              KPIs, tendencias y vitrinas críticas en una sola superficie para decidir rápido y corregir antes de que
              el problema escale.
            </p>
          </div>

          <div
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${
              realtimeHealthy
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-700'
            }`}
          >
            {realtimeHealthy ? <Signal size={16} /> : <WifiOff size={16} />}
            {realtimeHealthy ? 'En vivo' : 'Fallback cada 30s'}
          </div>
        </div>

        <div className="mt-6">
          <KpiCards data={kpis.data} isLoading={kpis.isLoading} />
        </div>
      </section>

      <Tabs defaultValue="hoy" className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-1 rounded-[1.2rem] border border-slate-200 bg-white p-2">
          <TabsTrigger value="hoy" className="rounded-xl px-4 py-2.5">
            Hoy
          </TabsTrigger>
          <TabsTrigger value="tendencias" className="rounded-xl px-4 py-2.5">
            Tendencias
          </TabsTrigger>
          <TabsTrigger value="vitrinas" className="rounded-xl px-4 py-2.5">
            Vitrinas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hoy">
          <TabHoy
            kpis={kpis.data}
            incidenciasRecientes={incidenciasRecientes.data}
            isLoading={kpis.isLoading || incidenciasRecientes.isLoading}
          />
        </TabsContent>

        <TabsContent value="tendencias">
          <TabTendencias
            ventas30dias={ventas30dias.data}
            ventasPorRuta={ventasPorRuta.data}
            isLoading={isLoadingTendencias}
          />
        </TabsContent>

        <TabsContent value="vitrinas">
          <TabVitrinas
            topVitrinas={topVitrinas.data}
            stockBajo={stockBajo.data}
            isLoading={isLoadingVitrinas}
          />
        </TabsContent>
      </Tabs>
    </main>
  )
}
