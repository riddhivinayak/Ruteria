'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/admin/DataTable'
import { SearchInput } from '@/components/admin/SearchInput'
import { TransferenciaSheet } from '@/components/admin/TransferenciaSheet'
import {
  useInventarioColaboradora,
  type InventarioColaboradoraItem,
} from '@/lib/hooks/useInventarioColaboradora'

function statusForCantidad(cantidad: number) {
  if (cantidad <= 0) {
    return {
      label: 'Vacio',
      className: 'bg-red-100 text-red-700 border-red-200',
    }
  }

  if (cantidad < 5) {
    return {
      label: 'Bajo',
      className: 'bg-amber-100 text-amber-700 border-amber-200',
    }
  }

  return {
    label: 'OK',
    className: 'bg-green-100 text-green-700 border-green-200',
  }
}

function formatFecha(iso: string) {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function InventarioColaboradorasTab() {
  const { data: items = [], isLoading } = useInventarioColaboradora()
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const term = search.trim().toLowerCase()
      if (!term) return true

      return (
        item.colaboradora_nombre.toLowerCase().includes(term)
        || item.producto_nombre.toLowerCase().includes(term)
        || item.producto_codigo.toLowerCase().includes(term)
      )
    })
  }, [items, search])

  const columns = useMemo<Column<InventarioColaboradoraItem>[]>(() => [
    {
      key: 'colaboradora',
      header: 'Colaboradora',
      render: (item) => item.colaboradora_nombre,
    },
    {
      key: 'producto',
      header: 'Producto',
      render: (item) => (
        <div>
          <p className="font-medium text-slate-800">{item.producto_nombre}</p>
          <p className="text-xs font-mono text-slate-400">{item.producto_codigo}</p>
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Stock actual',
      render: (item) => <span className="font-semibold">{item.cantidad_actual}</span>,
      className: 'text-right',
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (item) => {
        const status = statusForCantidad(item.cantidad_actual)
        return <Badge className={status.className}>{status.label}</Badge>
      },
    },
    {
      key: 'updated_at',
      header: 'Actualizado',
      render: (item) => <span className="text-xs text-slate-500">{formatFecha(item.updated_at)}</span>,
    },
  ], [])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por colaboradora o producto..."
          className="max-w-sm"
        />
        <Button className="bg-[#6366f1] hover:bg-indigo-500" onClick={() => setSheetOpen(true)}>
          <Plus size={16} className="mr-1.5" /> Transferir al campo
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        getRowKey={(item) => `${item.colaboradora_id}-${item.producto_id}`}
        emptyMessage="No hay inventario asignado a colaboradoras"
      />

      <TransferenciaSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  )
}
