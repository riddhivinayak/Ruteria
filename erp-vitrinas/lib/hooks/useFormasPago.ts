import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/database.types'
import type { FormaPagoFormValues } from '@/lib/validations/formas-pago'

export type FormaPago = Database['public']['Tables']['formas_pago']['Row']

const QUERY_KEY = ['formas_pago'] as const

export function useFormasPago(options?: { soloActivas?: boolean }) {
  const supabase = createClient()

  return useQuery({
    queryKey: [...QUERY_KEY, options?.soloActivas ? 'activas' : 'todas'],
    queryFn: async () => {
      let query = supabase
        .from('formas_pago')
        .select('*')
        .order('nombre')

      if (options?.soloActivas) {
        query = query.eq('activo', true)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return (data ?? []) as FormaPago[]
    },
  })
}

export function useCreateFormaPago() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: FormaPagoFormValues) => {
      const { error } = await supabase.from('formas_pago').insert(values)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}

export function useUpdateFormaPago() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: Partial<FormaPagoFormValues> }) => {
      const { error } = await supabase.from('formas_pago').update(values).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  })
}
