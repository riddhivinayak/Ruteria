'use client'

import { useState } from 'react'
import { ClipboardList, Download } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, type Column } from '@/components/admin/DataTable'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useReporteVisitas, type ReporteVisitaItem } from '@/lib/hooks/useReportes'
import { downloadReporteXlsx } from '@/lib/utils/exportXlsx'
import { FiltrosReporte } from './FiltrosReporte'

function estadoClass(estado: string) {
  if (estado === 'completada') return 'bg-emerald-100 text-emerald-700'
  if (estado === 'planificada') return 'bg-sky-100 text-sky-700'
  if (estado === 'en_ejecucion') return 'bg-amber-100 text-amber-700'
  if (estado === 'no_realizada') return 'bg-rose-100 text-rose-700'
  return 'bg-slate-100 text-slate-700'
}

export function ReporteVisitas() {
  const { data = [], isLoading, buscar, filtros } = useReporteVisitas()
  const [confirmExport, setConfirmExport] = useState(false)

  const columns: Column<ReporteVisitaItem>[] = [
    { key: 'pdv_nombre', header: 'PDV', render: (item) => item.pdv_nombre },
    { key: 'ruta_nombre', header: 'Ruta', render: (item) => item.ruta_nombre },
    { key: 'colaboradora_nombre', header: 'Colaboradora', render: (item) => item.colaboradora_nombre },
    { key: 'fecha_planificada', header: 'Fecha', render: (item) => item.fecha_planificada },
    {
      key: 'estado',
      header: 'Estado',
      render: (item) => (
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${estadoClass(item.estado)}`}>
          {item.estado}
        </span>
      ),
    },
    {
      key: 'motivo_no_realizada',
      header: 'Motivo',
      render: (item) => item.motivo_no_realizada || '—',
    },
  ]

  async function doExport() {
    if (!filtros) return

    try {
      await downloadReporteXlsx('visitas', filtros)
      setConfirmExport(false)
      toast.success('Reporte exportado')
    } catch {
      toast.error('No se pudo exportar el reporte')
    }
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
        <FiltrosReporte onBuscar={buscar} isLoading={isLoading} showRuta />

        <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-50px_rgba(15,23,42,0.6)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <ClipboardList size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Seguimiento</p>
              <p className="text-sm text-slate-500">Trazabilidad del cumplimiento de las visitas programadas.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Registros</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{data.length.toLocaleString('es-CO')}</p>
            </div>

            {data.length > 0 && (
              <Button
                variant="outline"
                onClick={() => (data.length > 5000 ? setConfirmExport(true) : void doExport())}
                className="rounded-xl"
              >
                <Download size={16} />
                Exportar .xlsx
              </Button>
            )}
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        getRowKey={(row) => `${row.pdv_nombre}-${row.fecha_planificada}-${row.estado}`}
        emptyMessage="Aplica filtros para consultar el historial de visitas."
      />

      <AlertDialog open={confirmExport} onOpenChange={setConfirmExport}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exportar {data.length.toLocaleString('es-CO')} filas</AlertDialogTitle>
            <AlertDialogDescription>
              El archivo puede tardar unos segundos en generarse. ¿Quieres continuar con la descarga?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doExport}>Exportar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
