import { redirect } from 'next/navigation'
import { ReportesClient } from '@/components/admin/reportes/ReportesClient'
import { getHomeForRole } from '@/lib/auth/getHomeForRole'
import { createClient } from '@/lib/supabase/server'
import { ROLES } from '@/lib/validations/usuarios'
import type { UserRol } from '@/lib/validations/usuarios'

export default async function ReportesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const rawRol = user.app_metadata?.rol
  if (!ROLES.includes(rawRol)) redirect('/login')

  const rol = rawRol as UserRol
  if (!['admin', 'supervisor', 'analista', 'compras'].includes(rol)) {
    redirect(getHomeForRole(rol))
  }

  return <ReportesClient rol={rol} />
}
