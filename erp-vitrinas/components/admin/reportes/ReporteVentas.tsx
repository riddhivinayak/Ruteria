'use client'

import { useState } from 'react'
import { Download, Receipt } from 'lucide-react'
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
import { useReporteVentas, type ReporteVentasItem } from '@/lib/hooks/useReportes'
import { downloadReporteXlsx } from '@/lib/utils/exportXlsx'
import { FiltrosReporte } from './FiltrosReporte'

function formatCOP(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

export function ReporteVentas() {
  const { data = [], isLoading, buscar, filtros } = useReporteVentas()
  const [confirmExport, setConfirmExport] = useState(false)

  const columns: Column<ReporteVentasItem>[] = [
    { key: 'pdv_nombre', header: 'PDV', render: (item) => item.pdv_nombre },
    { key: 'ruta_nombre', header: 'Ruta', render: (item) => item.ruta_nombre },
    { key: 'colaboradora_nombre', header: 'Colaboradora', render: (item) => item.colaboradora_nombre },
    { key: 'fecha', header: 'Fecha', render: (item) => item.fecha },
    {
      key: 'unidades_vendidas',
      header: 'Unidades',
      className: 'text-right',
      render: (item) => item.unidades_vendidas.toLocaleString('es-CO'),
    },
    {
      key: 'monto_cobrado',
      header: 'Monto cobrado',
      className: 'text-right',
      render: (item) => formatCOP(item.monto_cobrado),
    },
    { key: 'forma_pago', header: 'Forma de pago', render: (item) => item.forma_pago || '—' },
  ]

  const totalCobrado = data.reduce((sum, item) => sum + item.monto_cobrado, 0)
  const totalUnidades = data.reduce((sum, item) => sum + item.unidades_vendidas, 0)

  async function doExport() {
    if (!filtros) return

    try {
      await downloadReporteXlsx('ventas', filtros)
      setConfirmExport(false)
      toast.success('Reporte exportado')
    } catch {
      toast.error('No se pudo exportar el reporte')
    }
  }

  async function handleExport() {
    if (data.length > 5000) {
      setConfirmExport(true)
      return
    }
    await doExport()
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
        <FiltrosReporte
          onBuscar={buscar}
          isLoading={isLoading}
          showRuta
          showColaboradora
          showPdv
          showProducto
        />

        <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-50px_rgba(15,23,42,0.6)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <Receipt size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Resumen</p>
              <p className="text-sm text-slate-500">Consulta agregada del período filtrado.</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Cobrado</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCOP(totalCobrado)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Unidades</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{totalUnidades.toLocaleString('es-CO')}</p>
            </div>

            {data.length > 0 && (
              <Button variant="outline" onClick={handleExport} className="mt-2 rounded-xl">
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
        getRowKey={(row) => `${row.pdv_nombre}-${row.fecha}-${row.forma_pago}`}
        emptyMessage="Aplica filtros y ejecuta la búsqueda para consultar ventas."
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
