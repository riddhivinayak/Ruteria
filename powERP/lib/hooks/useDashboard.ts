'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/database.types'

type DashboardHoyRow = Database['public']['Views']['v_dashboard_hoy']['Row']
type IncidenciaRecienteRow = Database['public']['Views']['v_incidencias_abiertas_recientes']['Row']
type VentasDiaRow = Database['public']['Views']['v_ventas_30_dias']['Row']
type VentasRutaRow = Database['public']['Views']['v_ventas_por_ruta_mes']['Row']
type TopVitrinaRow = Database['public']['Views']['v_top_vitrinas_mes']['Row']
type StockBajoRow = Database['public']['Views']['v_stock_bajo']['Row']

export type DashboardHoy = {
  ventas_hoy: number
  visitas_realizadas: number
  visitas_planificadas: number
  cobros_mes: number
  incidencias_abiertas: number
}

export type IncidenciaReciente = {
  incidencia_id: string
  pdv_nombre: string
  tipo: string
  fecha_apertura: string
  dias_abierta: number
}

export type VentasDia = { fecha: string; total_ventas: number }
export type VentasRuta = { ruta: string; colaboradora: string; total_ventas: number }
export type TopVitrina = { vitrina_id: string; pdv_nombre: string; total_ventas: number }
export type StockBajo = {
  vitrina_id: string
  producto_id: string
  stock_actual: number
  cantidad_objetivo: number
  pct_stock: number
  pdv_nombre: string
  producto_nombre: string
}

const DASHBOARD_QUERY_KEYS = {
  hoy: ['dashboard_hoy'] as const,
  ventas30dias: ['dashboard_ventas_30_dias'] as const,
  ventasPorRuta: ['dashboard_ventas_por_ruta_mes'] as const,
  topVitrinas: ['dashboard_top_vitrinas_mes'] as const,
  stockBajo: ['dashboard_stock_bajo'] as const,
  incidenciasRecientes: ['dashboard_incidencias_abiertas_recientes'] as const,
}

function mapDashboardHoy(row: DashboardHoyRow | null): DashboardHoy {
  return {
    ventas_hoy: row?.ventas_hoy ?? 0,
    visitas_realizadas: row?.visitas_realizadas ?? 0,
    visitas_planificadas: row?.visitas_planificadas ?? 0,
    cobros_mes: row?.cobros_mes ?? 0,
    incidencias_abiertas: row?.incidencias_abiertas ?? 0,
  }
}

function mapIncidenciasRecientes(rows: IncidenciaRecienteRow[] | null): IncidenciaReciente[] {
  return (rows ?? []).map((row) => ({
    incidencia_id: row.incidencia_id ?? '',
    pdv_nombre: row.pdv_nombre ?? '—',
    tipo: row.tipo ?? '—',
    fecha_apertura: row.fecha_apertura ?? '',
    dias_abierta: row.dias_abierta ?? 0,
  }))
}

function mapVentasDia(rows: VentasDiaRow[] | null): VentasDia[] {
  return (rows ?? []).map((row) => ({
    fecha: row.fecha ?? '',
    total_ventas: row.total_ventas ?? 0,
  }))
}

function mapVentasRuta(rows: VentasRutaRow[] | null): VentasRuta[] {
  return (rows ?? []).map((row) => ({
    ruta: row.ruta ?? 'Sin ruta',
    colaboradora: row.colaboradora ?? 'Sin colaboradora',
    total_ventas: row.total_ventas ?? 0,
  }))
}

function mapTopVitrinas(rows: TopVitrinaRow[] | null): TopVitrina[] {
  return (rows ?? []).map((row) => ({
    vitrina_id: row.vitrina_id ?? '',
    pdv_nombre: row.pdv_nombre ?? '—',
    total_ventas: row.total_ventas ?? 0,
  }))
}

function mapStockBajo(rows: StockBajoRow[] | null): StockBajo[] {
  return (rows ?? []).map((row) => ({
    vitrina_id: row.vitrina_id ?? '',
    producto_id: row.producto_id ?? '',
    stock_actual: row.stock_actual ?? 0,
    cantidad_objetivo: row.cantidad_objetivo ?? 0,
    pct_stock: row.pct_stock ?? 0,
    pdv_nombre: row.pdv_nombre ?? '—',
    producto_nombre: row.producto_nombre ?? '—',
  }))
}

export function useDashboard() {
  const [supabase] = useState(() => createClient())
  const [realtimeHealthy, setRealtimeHealthy] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    const invalidateDashboard = () => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.hoy })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.ventas30dias })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.ventasPorRuta })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.topVitrinas })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.stockBajo })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.incidenciasRecientes })
    }

    const channel = supabase
      .channel('dashboard-analytics')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitas' }, invalidateDashboard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'detalle_visita' }, invalidateDashboard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cobros' }, invalidateDashboard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidencias' }, invalidateDashboard)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeHealthy(true)
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeHealthy(false)
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [queryClient, supabase])

  const kpis = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.hoy,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_dashboard_hoy').select('*').maybeSingle()
      if (error) throw new Error(error.message)
      return mapDashboardHoy(data)
    },
    staleTime: 60_000,
    refetchInterval: realtimeHealthy ? false : 30_000,
  })

  const ventas30dias = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.ventas30dias,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_ventas_30_dias').select('*').order('fecha')
      if (error) throw new Error(error.message)
      return mapVentasDia(data)
    },
    staleTime: 5 * 60_000,
  })

  const ventasPorRuta = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.ventasPorRuta,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_ventas_por_ruta_mes').select('*')
      if (error) throw new Error(error.message)
      return mapVentasRuta(data)
    },
    staleTime: 5 * 60_000,
  })

  const topVitrinas = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.topVitrinas,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_top_vitrinas_mes').select('*')
      if (error) throw new Error(error.message)
      return mapTopVitrinas(data)
    },
    staleTime: 5 * 60_000,
  })

  const stockBajo = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.stockBajo,
    queryFn: async () => {
      const { data, error } = await supabase.from('v_stock_bajo').select('*')
      if (error) throw new Error(error.message)
      return mapStockBajo(data)
    },
    staleTime: 5 * 60_000,
  })

  const incidenciasRecientes = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.incidenciasRecientes,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_incidencias_abiertas_recientes')
        .select('*')
        .order('fecha_apertura', { ascending: false })

      if (error) throw new Error(error.message)
      return mapIncidenciasRecientes(data)
    },
    staleTime: 60_000,
    refetchInterval: realtimeHealthy ? false : 30_000,
  })

  return {
    kpis,
    incidenciasRecientes,
    ventas30dias,
    ventasPorRuta,
    topVitrinas,
    stockBajo,
    realtimeHealthy,
  }
}
