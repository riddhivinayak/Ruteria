'use client'

import { FileBarChart2, PackageSearch } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { UserRol } from '@/lib/validations/usuarios'
import { RankingVitrinas } from './RankingVitrinas'
import { ReporteIncidenciasGarantias } from './ReporteIncidenciasGarantias'
import { ReporteInventario } from './ReporteInventario'
import { ReporteVentas } from './ReporteVentas'
import { ReporteVisitas } from './ReporteVisitas'

export function ReportesClient({ rol }: { rol: UserRol }) {
  const esCompras = rol === 'compras'

  return (
    <main className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.13),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.18),_transparent_28%),linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] p-6 shadow-[0_30px_80px_-55px_rgba(15,23,42,0.75)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Centro de Reportes</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
              Consultas exportables para operar, auditar y decidir
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Filtra bajo demanda, revisa el resultado en pantalla y exporta a Excel cuando necesites compartir o
              profundizar el análisis fuera del sistema.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600">
            {esCompras ? <PackageSearch size={16} /> : <FileBarChart2 size={16} />}
            {esCompras ? 'Vista enfocada en abastecimiento' : 'Operación multiárea'}
          </div>
        </div>
      </section>

      <Tabs defaultValue={esCompras ? 'inventario' : 'ventas'} className="space-y-4">
        <TabsList className="h-auto w-full justify-start gap-1 rounded-[1.2rem] border border-slate-200 bg-white p-2">
          {!esCompras && (
            <>
              <TabsTrigger value="ventas" className="rounded-xl px-4 py-2.5">
                Ventas
              </TabsTrigger>
              <TabsTrigger value="ranking" className="rounded-xl px-4 py-2.5">
                Ranking vitrinas
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="inventario" className="rounded-xl px-4 py-2.5">
            Inventario
          </TabsTrigger>
          {!esCompras && (
            <>
              <TabsTrigger value="visitas" className="rounded-xl px-4 py-2.5">
                Visitas
              </TabsTrigger>
              <TabsTrigger value="incidencias" className="rounded-xl px-4 py-2.5">
                Incidencias / Garantías
              </TabsTrigger>
            </>
          )}
        </TabsList>

        {!esCompras && (
          <TabsContent value="ventas">
            <ReporteVentas />
          </TabsContent>
        )}

        {!esCompras && (
          <TabsContent value="ranking">
            <RankingVitrinas />
          </TabsContent>
        )}

        <TabsContent value="inventario">
          <ReporteInventario />
        </TabsContent>

        {!esCompras && (
          <TabsContent value="visitas">
            <ReporteVisitas />
          </TabsContent>
        )}

        {!esCompras && (
          <TabsContent value="incidencias">
            <ReporteIncidenciasGarantias />
          </TabsContent>
        )}
      </Tabs>
    </main>
  )
}
