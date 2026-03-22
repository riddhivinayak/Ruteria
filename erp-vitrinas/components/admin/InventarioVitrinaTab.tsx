'use client'

interface InventarioVitrinaTabProps {
  vitrinaId: string
}

export function InventarioVitrinaTab({ vitrinaId }: InventarioVitrinaTabProps) {
  return (
    <div className="p-4 text-slate-500">
      Inventario actual — en construcción (vitrina: {vitrinaId})
    </div>
  )
}
