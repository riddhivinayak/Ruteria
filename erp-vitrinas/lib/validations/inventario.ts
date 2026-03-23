import { z } from 'zod'

export const entradaInventarioSchema = z.object({
  producto_id: z.string().uuid('Selecciona un producto'),
  cantidad: z.coerce.number().int().min(1, 'La cantidad debe ser al menos 1'),
  costo_unitario: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    z.coerce.number().min(0).optional()
  ),
  notas: z.string().max(500).optional(),
})

export type EntradaInventarioInput = z.output<typeof entradaInventarioSchema>

export const transferenciaInventarioSchema = z.object({
  colaboradora_id: z.string().uuid('Selecciona una colaboradora'),
  items: z.array(
    z.object({
      producto_id: z.string().uuid('Selecciona un producto'),
      cantidad: z.coerce.number().int().min(1, 'La cantidad debe ser al menos 1'),
    })
  ).min(1, 'Agrega al menos un producto'),
})

export type TransferenciaInventarioInput = z.output<typeof transferenciaInventarioSchema>
