import { z } from 'zod'

export const formaPagoSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(120, 'Nombre demasiado largo'),
  activo: z.boolean().default(true),
})

export type FormaPagoFormInput = z.input<typeof formaPagoSchema>
export type FormaPagoFormValues = z.output<typeof formaPagoSchema>
