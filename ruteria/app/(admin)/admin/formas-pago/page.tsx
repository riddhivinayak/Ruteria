'use client'

import { useMemo, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { FormasPagoSheet } from '@/components/admin/FormasPagoSheet'
import { useFormasPago, type FormaPago } from '@/lib/hooks/useFormasPago'

export default function FormasPagoPage() {
  const { data: formasPago = [], isLoading } = useFormasPago()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<FormaPago | null>(null)

  const columns = useMemo<Column<FormaPago>[]>(() => [
    {
      key: 'nombre',
      header: 'Nombre',
      render: (formaPago) => formaPago.nombre,
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (formaPago) => (
        <Badge variant={formaPago.activo ? 'default' : 'secondary'}>
          {formaPago.activo ? 'Activa' : 'Inactiva'}
        </Badge>
      ),
    },
    {
      key: 'acciones',
      header: '',
      className: 'w-12',
      render: (formaPago) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Editar forma de pago ${formaPago.nombre}`}
          onClick={() => {
            setEditing(formaPago)
            setSheetOpen(true)
          }}
        >
          <Pencil size={14} />
        </Button>
      ),
    },
  ], [])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Formas de pago</h1>
          <p className="text-sm text-slate-500 mt-1">{formasPago.length} opciones configuradas</p>
        </div>
        <Button
          className="bg-[#6366f1] hover:bg-indigo-500"
          onClick={() => {
            setEditing(null)
            setSheetOpen(true)
          }}
        >
          <Plus size={16} className="mr-1.5" /> Nueva forma de pago
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={formasPago}
        isLoading={isLoading}
        getRowKey={(formaPago) => formaPago.id}
      />

      <FormasPagoSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        formaPago={editing}
      />
    </div>
  )
}
