'use client'

import { useEffect } from 'react'
import { Archive, Download } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { Button } from '@/components/ui/button'
import { useReporteInventario, type ReporteInventarioItem } from '@/lib/hooks/useReportes'
import { downloadReporteXlsx } from '@/lib/utils/exportXlsx'

function formatCOP(value: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value)
}

export function ReporteInventario() {
  const { data = [], isLoading, isFetched, cargar } = useReporteInventario()

  useEffect(() => {
    cargar()
  }, [cargar])

  const columns: Column<ReporteInventarioItem>[] = [
    { key: 'ubicacion_tipo', header: 'Tipo', render: (item) => item.ubicacion_tipo },
    { key: 'ubicacion_nombre', header: 'Ubicación', render: (item) => item.ubicacion_nombre },
    { key: 'producto_codigo', header: 'Código', render: (item) => item.producto_codigo },
    { key: 'producto_nombre', header: 'Producto', render: (item) => item.producto_nombre },
    {
      key: 'cantidad_actual',
      header: 'Cantidad',
      className: 'text-right',
      render: (item) => item.cantidad_actual.toLocaleString('es-CO'),
    },
    {
      key: 'valor_costo_total',
      header: 'Valor costo',
      className: 'text-right',
      render: (item) => formatCOP(item.valor_costo_total),
    },
    {
      key: 'valor_venta_total',
      header: 'Valor venta',
      className: 'text-right',
      render: (item) => formatCOP(item.valor_venta_total),
    },
  ]

  const totalCosto = data.reduce((sum, item) => sum + item.valor_costo_total, 0)
  const totalVenta = data.reduce((sum, item) => sum + item.valor_venta_total, 0)

  async function handleExport() {
    try {
      await downloadReporteXlsx('inventario')
      toast.success('Inventario exportado')
    } catch {
      toast.error('No se pudo exportar el inventario')
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_-50px_rgba(15,23,42,0.6)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <Archive size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Snapshot Valorizado</p>
              <p className="text-sm text-slate-500">Bodega central, colaboradoras y vitrinas en una sola consulta.</p>
            </div>
          </div>

          {isFetched && data.length > 0 && (
            <Button variant="outline" onClick={handleExport} className="rounded-xl">
              <Download size={16} />
              Exportar .xlsx
            </Button>
          )}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Valor costo</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCOP(totalCosto)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Valor venta</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{formatCOP(totalVenta)}</p>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        getRowKey={(row) => `${row.ubicacion_tipo}-${row.ubicacion_id ?? 'central'}-${row.producto_id}`}
        emptyMessage="Cargando snapshot de inventario valorizado."
      />
    </section>
  )
}
