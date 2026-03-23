'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { formaPagoSchema } from '@/lib/validations/formas-pago'
import { useCreateFormaPago, useUpdateFormaPago, type FormaPago } from '@/lib/hooks/useFormasPago'
import type { z } from 'zod'

type FormaPagoFormInput = z.input<typeof formaPagoSchema>
type FormaPagoFormOutput = z.output<typeof formaPagoSchema>

interface FormasPagoSheetProps {
  open: boolean
  onClose: () => void
  formaPago?: FormaPago | null
}

const inputCls =
  'w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

export function FormasPagoSheet({ open, onClose, formaPago }: FormasPagoSheetProps) {
  const create = useCreateFormaPago()
  const update = useUpdateFormaPago()

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormaPagoFormInput, unknown, FormaPagoFormOutput>({
    resolver: zodResolver(formaPagoSchema),
    defaultValues: {
      nombre: '',
      activo: true,
    },
  })

  useEffect(() => {
    if (!open) return

    if (formaPago) {
      reset({
        nombre: formaPago.nombre,
        activo: formaPago.activo,
      })
    } else {
      reset({
        nombre: '',
        activo: true,
      })
    }
  }, [open, formaPago, reset])

  async function onSubmit(values: FormaPagoFormOutput) {
    try {
      if (formaPago) {
        await update.mutateAsync({ id: formaPago.id, values })
      } else {
        await create.mutateAsync(values)
      }

      toast.success('Forma de pago guardada')
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al guardar la forma de pago')
    }
  }

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{formaPago ? 'Editar forma de pago' : 'Nueva forma de pago'}</SheetTitle>
          <SheetDescription>
            Configura las opciones disponibles para registrar cobros en campo.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-6">
          <Field label="Nombre *" error={errors.nombre?.message}>
            <input
              {...register('nombre')}
              className={inputCls}
              placeholder="Ej. Deposito bancario"
            />
          </Field>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-slate-700">Activa</p>
              <p className="text-xs text-slate-500">Visible para las colaboradoras al cobrar</p>
            </div>
            <Controller
              control={control}
              name="activo"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-[#6366f1] hover:bg-indigo-500"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
