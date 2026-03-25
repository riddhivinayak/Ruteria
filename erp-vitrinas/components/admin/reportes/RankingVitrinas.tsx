'use client'

import { useState } from 'react'
import { BarChart3, Download } from 'lucide-react'
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
import { useRankingVitrinas, type RankingVitrinaItem } from '@/lib/hooks/useReportes'
import { downloadReporteXlsx } from '@/lib/utils/exportXlsx'
import { FiltrosReporte } from './FiltrosReporte'

function formatCOP(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

function VariacionCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-400">—</span>
  const positive = value >= 0

  return (
    <span className={positive ? 'font-medium text-emerald-600' : 'font-medium text-rose-600'}>
      {positive ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  )
}

export function RankingVitrinas() {
  const { data = [], isLoading, buscar, periodo } = useRankingVitrinas()
  const [confirmExport, setConfirmExport] = useState(false)

  const columns: Column<RankingVitrinaItem>[] = [
    { key: 'pdv_nombre', header: 'PDV', render: (item) => item.pdv_nombre },
    {
      key: 'ventas_actual',
      header: 'Ventas actual',
      className: 'text-right',
      render: (item) => formatCOP(item.ventas_actual),
    },
    {
      key: 'ventas_anterior',
      header: 'Ventas anterior',
      className: 'text-right',
      render: (item) => formatCOP(item.ventas_anterior),
    },
    {
      key: 'variacion_pct',
      header: 'Variación',
      className: 'text-right',
      render: (item) => <VariacionCell value={item.variacion_pct} />,
    },
  ]

  async function doExport() {
    if (!periodo) return

    try {
      await downloadReporteXlsx('ranking', periodo)
      setConfirmExport(false)
      toast.success('Ranking exportado')
    } catch {
      toast.error('No se pudo exportar el ranking')
    }
  }

  const positiveCount = data.filter((item) => (item.variacion_pct ?? 0) > 0).length

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
        <FiltrosReporte onBuscar={buscar} isLoading={isLoading} submitLabel="Comparar" />

        <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-50px_rgba(15,23,42,0.6)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <BarChart3 size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Lectura comparativa</p>
              <p className="text-sm text-slate-500">Cruza el período actual contra el inmediatamente anterior.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Vitrinas al alza</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{positiveCount.toLocaleString('es-CO')}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Variación disponible</p>
              <p className="mt-2 text-sm text-slate-600">
                {data.some((item) => item.variacion_pct !== null)
                  ? 'Lista para detectar expansión o caída.'
                  : 'Aún no hay base previa suficiente para variación porcentual.'}
              </p>
            </div>

            {data.length > 0 && (
              <Button
                variant="outline"
                onClick={() => (data.length > 5000 ? setConfirmExport(true) : void doExport())}
                className="mt-2 rounded-xl"
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
        getRowKey={(row) => row.vitrina_id}
        emptyMessage="Aplica el rango y ejecuta la búsqueda para comparar vitrinas."
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
