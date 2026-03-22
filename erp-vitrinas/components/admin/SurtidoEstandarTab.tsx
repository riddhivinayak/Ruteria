'use client'

interface SurtidoEstandarTabProps {
  vitrinaId: string
}

export function SurtidoEstandarTab({ vitrinaId }: SurtidoEstandarTabProps) {
  return (
    <div className="p-4 text-slate-500">
      Surtido estándar — en construcción (vitrina: {vitrinaId})
    </div>
  )
}
