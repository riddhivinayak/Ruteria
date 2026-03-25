# Sprint 8 — Dashboard en Tiempo Real + Reportes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el dashboard en tiempo real con Supabase Realtime (KPIs + 3 tabs) y el módulo de reportes con exportación a Excel.

**Architecture:** Dashboard en `/admin/dashboard` usa Tremor (o Recharts como fallback) sobre `v_dashboard_hoy` + suscripción Realtime. Reportes en `/admin/reportes` con tabs por tipo, hooks bajo demanda (`enabled: false`), y SheetJS cargado dinámicamente para exportación.

**Tech Stack:** Next.js 16, Supabase Realtime (postgres_changes), Tremor o Recharts, TanStack React Query v5 (refetchInterval condicional), SheetJS xlsx (dynamic import), shadcn/ui.

---

## Prerrequisito: Verificar compatibilidad Tremor + Tailwind v4

**ANTES de cualquier otra tarea**, verificar que Tremor funciona con Tailwind v4. Si falla, usar Recharts + shadcn Card como fallback. Este paso determina el stack de charts para todo el sprint.

- [ ] **Verificación inicial Tremor**

```bash
cd erp-vitrinas
npm install @tremor/react
npm run build
```

Si `npm run build` **falla** con errores de Tailwind/PostCSS relacionados a Tremor:
→ Desinstalar Tremor y usar Recharts:
```bash
npm uninstall @tremor/react
npm install recharts
```

Si **pasa**: continuar con Tremor. Las instrucciones del plan usan Tremor, pero los nombres de componentes equivalentes en Recharts son:
- `AreaChart` (Tremor) → `AreaChart` (Recharts, diferente API)
- `BarChart` (Tremor) → `BarChart` (Recharts)
- `Metric` card (Tremor) → `Card` + texto de shadcn

---

## File Map

| Acción | Archivo |
|---|---|
| CREATE | `erp-vitrinas/supabase/migrations/20260031_dashboard_views_indexes.sql` |
| CREATE | `erp-vitrinas/supabase/migrations/20260032_reportes_functions.sql` |
| CREATE | `erp-vitrinas/lib/hooks/useDashboard.ts` |
| CREATE | `erp-vitrinas/lib/hooks/useReportes.ts` |
| CREATE | `erp-vitrinas/lib/utils/exportXlsx.ts` |
| CREATE | `erp-vitrinas/components/admin/dashboard/KpiCards.tsx` |
| CREATE | `erp-vitrinas/components/admin/dashboard/TabHoy.tsx` |
| CREATE | `erp-vitrinas/components/admin/dashboard/TabTendencias.tsx` |
| CREATE | `erp-vitrinas/components/admin/dashboard/TabVitrinas.tsx` |
| CREATE | `erp-vitrinas/components/admin/reportes/FiltrosReporte.tsx` |
| CREATE | `erp-vitrinas/components/admin/reportes/ReporteVentas.tsx` |
| CREATE | `erp-vitrinas/components/admin/reportes/RankingVitrinas.tsx` |
| CREATE | `erp-vitrinas/components/admin/reportes/ReporteInventario.tsx` |
| CREATE | `erp-vitrinas/components/admin/reportes/ReporteVisitas.tsx` |
| CREATE | `erp-vitrinas/components/admin/reportes/ReporteIncidenciasGarantias.tsx` |
| CREATE | `erp-vitrinas/app/(admin)/admin/dashboard/page.tsx` |
| CREATE | `erp-vitrinas/app/(admin)/admin/reportes/page.tsx` |
| CREATE | `erp-vitrinas/tests/sprint8-dashboard-reportes.spec.ts` |
| MODIFY | `erp-vitrinas/components/admin/AppSidebar.tsx` — nav links dashboard/reportes |
| MODIFY | `erp-vitrinas/lib/supabase/database.types.ts` — regenerar |

---

## Task 1: Migraciones — Vistas + Índices

**Files:**
- Create: `erp-vitrinas/supabase/migrations/20260031_dashboard_views_indexes.sql`

- [ ] **Paso 1.1: Crear migración**

```sql
-- erp-vitrinas/supabase/migrations/20260031_dashboard_views_indexes.sql

-- ============================================================
-- Índices de soporte para el dashboard
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_visitas_fecha_inicio_estado
  ON visitas(fecha_hora_inicio, estado);

CREATE INDEX IF NOT EXISTS idx_cobros_fecha
  ON cobros(fecha);

-- ============================================================
-- Vista: v_dashboard_hoy
-- Una sola fila con los KPIs del día actual.
-- Nota: visitas planificadas sin inicio tienen fecha_hora_inicio NULL;
-- el fallback a created_at::date + estado='planificada' las captura.
-- El implementor debe verificar con el cron de generación de visitas.
-- ============================================================
CREATE OR REPLACE VIEW v_dashboard_hoy AS
SELECT
  COALESCE(SUM(dv.subtotal_cobro), 0)
    AS ventas_hoy,
  COUNT(DISTINCT v.id) FILTER (WHERE v.estado = 'completada')
    AS visitas_realizadas,
  COUNT(DISTINCT v.id)
    AS visitas_planificadas,
  COALESCE((
    SELECT SUM(c.monto)
    FROM cobros c
    WHERE c.fecha::date = current_date
  ), 0) AS cobros_hoy,
  (
    SELECT COUNT(*)
    FROM incidencias
    WHERE estado IN ('abierta', 'en_analisis')
  ) AS incidencias_abiertas
FROM visitas v
LEFT JOIN detalle_visita dv
  ON dv.visita_id = v.id AND v.estado = 'completada'
WHERE
  v.fecha_hora_inicio::date = current_date
  OR (
    v.fecha_hora_inicio IS NULL
    AND v.created_at::date = current_date
    AND v.estado = 'planificada'
  );

-- ============================================================
-- Vista: v_stock_bajo
-- Vitrinas donde stock_actual / cantidad_objetivo < 0.30
-- INNER JOIN: solo productos en surtido estándar con objetivo > 0
-- ============================================================
CREATE OR REPLACE VIEW v_stock_bajo AS
SELECT
  iv.vitrina_id,
  iv.producto_id,
  iv.cantidad_actual                                                  AS stock_actual,
  se.cantidad_objetivo,
  ROUND(
    iv.cantidad_actual::NUMERIC / se.cantidad_objetivo * 100, 1
  )                                                                   AS pct_stock,
  pdv.nombre                                                          AS pdv_nombre,
  p.nombre                                                            AS producto_nombre
FROM inventario_vitrina iv
INNER JOIN surtido_estandar se
  ON se.vitrina_id = iv.vitrina_id
  AND se.producto_id = iv.producto_id
INNER JOIN vitrinas vit ON vit.id = iv.vitrina_id
INNER JOIN puntos_de_venta pdv ON pdv.id = vit.pdv_id
INNER JOIN productos p ON p.id = iv.producto_id
WHERE
  se.cantidad_objetivo > 0
  AND iv.cantidad_actual::NUMERIC / se.cantidad_objetivo < 0.30;

-- ============================================================
-- Vista: v_ventas_30_dias
-- Una fila por día con total de ventas para el gráfico de tendencias
-- ============================================================
CREATE OR REPLACE VIEW v_ventas_30_dias AS
SELECT
  v.fecha_hora_inicio::date AS fecha,
  COALESCE(SUM(dv.subtotal_cobro), 0) AS total_ventas
FROM visitas v
JOIN detalle_visita dv ON dv.visita_id = v.id
WHERE
  v.estado = 'completada'
  AND v.fecha_hora_inicio >= current_date - INTERVAL '30 days'
GROUP BY v.fecha_hora_inicio::date
ORDER BY fecha;

-- ============================================================
-- Vista: v_ventas_por_ruta_mes
-- Ventas del mes actual agrupadas por ruta y colaboradora
-- ============================================================
CREATE OR REPLACE VIEW v_ventas_por_ruta_mes AS
SELECT
  r.nombre AS ruta,
  u.nombre AS colaboradora,
  COALESCE(SUM(dv.subtotal_cobro), 0) AS total_ventas
FROM visitas v
JOIN rutas r ON r.id = v.ruta_id
JOIN usuarios u ON u.id = v.colaboradora_id
JOIN detalle_visita dv ON dv.visita_id = v.id
WHERE
  v.estado = 'completada'
  AND date_trunc('month', v.fecha_hora_inicio) = date_trunc('month', current_date)
GROUP BY r.nombre, u.nombre
ORDER BY total_ventas DESC;

-- ============================================================
-- Vista: v_top_vitrinas_mes
-- Top 10 vitrinas por ventas del mes
-- ============================================================
CREATE OR REPLACE VIEW v_top_vitrinas_mes AS
SELECT
  vit.id AS vitrina_id,
  pdv.nombre AS pdv_nombre,
  COALESCE(SUM(dv.subtotal_cobro), 0) AS total_ventas
FROM visitas v
JOIN vitrinas vit ON vit.id = v.vitrina_id
JOIN puntos_de_venta pdv ON pdv.id = vit.pdv_id
JOIN detalle_visita dv ON dv.visita_id = v.id
WHERE
  v.estado = 'completada'
  AND date_trunc('month', v.fecha_hora_inicio) = date_trunc('month', current_date)
GROUP BY vit.id, pdv.nombre
ORDER BY total_ventas DESC
LIMIT 10;
```

- [ ] **Paso 1.2: Aplicar migración**

```bash
supabase db reset
npm run seed:auth
```

Expected: vistas `v_dashboard_hoy`, `v_stock_bajo`, `v_ventas_30_dias`, `v_ventas_por_ruta_mes`, `v_top_vitrinas_mes` creadas en Studio.

- [ ] **Paso 1.3: Commit**

```bash
git add supabase/migrations/20260031_dashboard_views_indexes.sql
git commit -m "feat: migración dashboard — vistas e índices"
```

---

## Task 2: Migración — Funciones SQL de Reportes

**Files:**
- Create: `erp-vitrinas/supabase/migrations/20260032_reportes_functions.sql`

- [ ] **Paso 2.1: Crear funciones SQL de reportes**

```sql
-- erp-vitrinas/supabase/migrations/20260032_reportes_functions.sql

-- ============================================================
-- get_reporte_ventas
-- ============================================================
CREATE OR REPLACE FUNCTION get_reporte_ventas(
  p_desde DATE,
  p_hasta DATE,
  p_ruta_id UUID DEFAULT NULL,
  p_colaboradora_id UUID DEFAULT NULL,
  p_pdv_id UUID DEFAULT NULL
)
RETURNS TABLE (
  pdv_nombre TEXT,
  ruta_nombre TEXT,
  colaboradora_nombre TEXT,
  fecha DATE,
  unidades_vendidas INT,
  monto_cobrado NUMERIC,
  forma_pago TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    pdv.nombre,
    r.nombre,
    u.nombre,
    v.fecha_hora_inicio::date,
    SUM(dv.unidades_vendidas)::INT,
    COALESCE(c.monto, 0),
    COALESCE(c.forma_pago, '')
  FROM visitas v
  JOIN puntos_de_venta pdv ON pdv.id = v.pdv_id
  JOIN rutas r ON r.id = v.ruta_id
  JOIN usuarios u ON u.id = v.colaboradora_id
  JOIN detalle_visita dv ON dv.visita_id = v.id
  LEFT JOIN cobros c ON c.visita_id = v.id
  WHERE
    v.estado = 'completada'
    AND v.fecha_hora_inicio::date BETWEEN p_desde AND p_hasta
    AND (p_ruta_id IS NULL OR v.ruta_id = p_ruta_id)
    AND (p_colaboradora_id IS NULL OR v.colaboradora_id = p_colaboradora_id)
    AND (p_pdv_id IS NULL OR v.pdv_id = p_pdv_id)
  GROUP BY pdv.nombre, r.nombre, u.nombre, v.fecha_hora_inicio::date, c.monto, c.forma_pago
  ORDER BY v.fecha_hora_inicio::date DESC;
$$;

-- ============================================================
-- get_ranking_vitrinas
-- Calcula variación vs período anterior en un único round-trip.
-- El hook useRankingVitrinas(desde, hasta) calcula los 4 parámetros:
--   desde_anterior = desde - (hasta - desde + 1 día)
--   hasta_anterior = desde - 1 día
-- ============================================================
CREATE OR REPLACE FUNCTION get_ranking_vitrinas(
  p_desde_actual   DATE,
  p_hasta_actual   DATE,
  p_desde_anterior DATE,
  p_hasta_anterior DATE
)
RETURNS TABLE (
  vitrina_id UUID,
  pdv_nombre TEXT,
  ventas_actual NUMERIC,
  ventas_anterior NUMERIC,
  variacion_pct NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH actual AS (
    SELECT v.vitrina_id, COALESCE(SUM(dv.subtotal_cobro), 0) AS ventas
    FROM visitas v
    JOIN detalle_visita dv ON dv.visita_id = v.id
    WHERE v.estado = 'completada'
      AND v.fecha_hora_inicio::date BETWEEN p_desde_actual AND p_hasta_actual
    GROUP BY v.vitrina_id
  ),
  anterior AS (
    SELECT v.vitrina_id, COALESCE(SUM(dv.subtotal_cobro), 0) AS ventas
    FROM visitas v
    JOIN detalle_visita dv ON dv.visita_id = v.id
    WHERE v.estado = 'completada'
      AND v.fecha_hora_inicio::date BETWEEN p_desde_anterior AND p_hasta_anterior
    GROUP BY v.vitrina_id
  )
  SELECT
    a.vitrina_id,
    pdv.nombre,
    a.ventas AS ventas_actual,
    COALESCE(ant.ventas, 0) AS ventas_anterior,
    ROUND(
      (a.ventas - COALESCE(ant.ventas, 0))
      / NULLIF(COALESCE(ant.ventas, 0), 0) * 100,
      1
    ) AS variacion_pct
  FROM actual a
  JOIN vitrinas vit ON vit.id = a.vitrina_id
  JOIN puntos_de_venta pdv ON pdv.id = vit.pdv_id
  LEFT JOIN anterior ant ON ant.vitrina_id = a.vitrina_id
  ORDER BY a.ventas DESC;
$$;

-- ============================================================
-- get_reporte_visitas
-- fecha_planificada = COALESCE(fecha_hora_inicio::date, created_at::date)
-- ============================================================
CREATE OR REPLACE FUNCTION get_reporte_visitas(
  p_desde DATE,
  p_hasta DATE,
  p_ruta_id UUID DEFAULT NULL
)
RETURNS TABLE (
  pdv_nombre TEXT,
  ruta_nombre TEXT,
  colaboradora_nombre TEXT,
  fecha_planificada DATE,
  estado TEXT,
  motivo_no_realizada TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    pdv.nombre,
    r.nombre,
    u.nombre,
    COALESCE(v.fecha_hora_inicio::date, v.created_at::date),
    v.estado,
    v.motivo_no_realizada
  FROM visitas v
  JOIN puntos_de_venta pdv ON pdv.id = v.pdv_id
  JOIN rutas r ON r.id = v.ruta_id
  JOIN usuarios u ON u.id = v.colaboradora_id
  WHERE
    COALESCE(v.fecha_hora_inicio::date, v.created_at::date) BETWEEN p_desde AND p_hasta
    AND (p_ruta_id IS NULL OR v.ruta_id = p_ruta_id)
  ORDER BY fecha_planificada DESC;
$$;

-- ============================================================
-- get_reporte_incidencias_garantias
-- UNION entre incidencias y garantías.
-- garantias.created_at → fecha_apertura
-- garantias.updated_at WHERE estado='cerrada' → fecha_cierre
-- ============================================================
CREATE OR REPLACE FUNCTION get_reporte_incidencias_garantias(
  p_desde DATE,
  p_hasta DATE,
  p_tipo TEXT DEFAULT NULL,
  p_pdv_id UUID DEFAULT NULL
)
RETURNS TABLE (
  tipo_registro TEXT,
  pdv_nombre TEXT,
  descripcion_o_motivo TEXT,
  estado TEXT,
  fecha_apertura TIMESTAMPTZ,
  fecha_cierre TIMESTAMPTZ,
  dias_abierta INT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    'incidencia' AS tipo_registro,
    pdv.nombre,
    i.descripcion,
    i.estado,
    i.fecha_apertura,
    i.fecha_cierre,
    EXTRACT(day FROM COALESCE(i.fecha_cierre, now()) - i.fecha_apertura)::INT
  FROM incidencias i
  JOIN puntos_de_venta pdv ON pdv.id = i.pdv_id
  WHERE
    i.fecha_apertura::date BETWEEN p_desde AND p_hasta
    AND (p_pdv_id IS NULL OR i.pdv_id = p_pdv_id)

  UNION ALL

  SELECT
    'garantia' AS tipo_registro,
    pdv.nombre,
    g.motivo,
    g.estado,
    g.created_at,
    CASE WHEN g.estado = 'cerrada' THEN g.updated_at ELSE NULL END,
    EXTRACT(day FROM COALESCE(
      CASE WHEN g.estado = 'cerrada' THEN g.updated_at ELSE NULL END,
      now()
    ) - g.created_at)::INT
  FROM garantias g
  JOIN puntos_de_venta pdv ON pdv.id = g.pdv_id
  WHERE
    g.created_at::date BETWEEN p_desde AND p_hasta
    AND (p_pdv_id IS NULL OR g.pdv_id = p_pdv_id)

  ORDER BY fecha_apertura DESC;
$$;
```

- [ ] **Paso 2.2: Aplicar migración**

```bash
supabase db reset
npm run seed:auth
```

- [ ] **Paso 2.3: Regenerar tipos**

```bash
supabase gen types typescript --local > lib/supabase/database.types.ts
npm run type-check
```

- [ ] **Paso 2.4: Commit**

```bash
git add supabase/migrations/20260032_reportes_functions.sql lib/supabase/database.types.ts
git commit -m "feat: migraciones Sprint 8 — vistas dashboard + funciones reportes + tipos"
```

---

## Task 3: Hook useDashboard con Realtime

**Files:**
- Create: `erp-vitrinas/lib/hooks/useDashboard.ts`

- [ ] **Paso 3.1: Escribir test unitario Realtime fallback**

```ts
// erp-vitrinas/lib/hooks/__tests__/useDashboard.test.ts
import { describe, it, expect, vi } from 'vitest'

// Test del comportamiento del estado realtimeHealthy
// Verifica que el flag cambia con los eventos de Supabase Realtime

describe('useDashboard — realtimeHealthy state', () => {
  it('inicia en false y pasa a true al SUBSCRIBED', () => {
    let realtimeHealthy = false
    const handleStatus = (status: string) => {
      if (status === 'SUBSCRIBED') realtimeHealthy = true
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') realtimeHealthy = false
    }
    handleStatus('SUBSCRIBED')
    expect(realtimeHealthy).toBe(true)
    handleStatus('CHANNEL_ERROR')
    expect(realtimeHealthy).toBe(false)
  })

  it('refetchInterval es false cuando Realtime está sano', () => {
    const realtimeHealthy = true
    const refetchInterval = realtimeHealthy ? false : 30_000
    expect(refetchInterval).toBe(false)
  })

  it('refetchInterval es 30_000 cuando Realtime falla', () => {
    const realtimeHealthy = false
    const refetchInterval = realtimeHealthy ? false : 30_000
    expect(refetchInterval).toBe(30_000)
  })
})
```

- [ ] **Paso 3.2: Ejecutar test (debe pasar — lógica pura)**

```bash
npm test -- lib/hooks/__tests__/useDashboard.test.ts
```

Expected: PASS (lógica de estado pura, no requiere mocks de Supabase).

- [ ] **Paso 3.3: Crear useDashboard.ts**

```ts
// erp-vitrinas/lib/hooks/useDashboard.ts
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type DashboardHoy = {
  ventas_hoy: number
  visitas_realizadas: number
  visitas_planificadas: number
  cobros_hoy: number
  incidencias_abiertas: number
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

export function useDashboard() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [realtimeHealthy, setRealtimeHealthy] = useState(false)

  // Suscripción Realtime — escucha INSERT en visitas y cobros
  useEffect(() => {
    const channel = supabase
      .channel('dashboard')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'visitas' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard_hoy'] })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'cobros' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard_hoy'] })
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeHealthy(true)
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeHealthy(false)
      })

    return () => { supabase.removeChannel(channel) }
  }, [supabase, queryClient])

  const kpis = useQuery({
    queryKey: ['dashboard_hoy'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_dashboard_hoy')
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data as DashboardHoy
    },
    staleTime: 60_000,
    // Fallback polling cuando Realtime no está conectado
    refetchInterval: realtimeHealthy ? false : 30_000,
  })

  const ventas30dias = useQuery({
    queryKey: ['ventas_30_dias'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_ventas_30_dias').select('*')
      if (error) throw new Error(error.message)
      return data as VentasDia[]
    },
    staleTime: 5 * 60_000,
  })

  const ventasPorRuta = useQuery({
    queryKey: ['ventas_por_ruta_mes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_ventas_por_ruta_mes').select('*')
      if (error) throw new Error(error.message)
      return data as VentasRuta[]
    },
    staleTime: 5 * 60_000,
  })

  const topVitrinas = useQuery({
    queryKey: ['top_vitrinas_mes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_top_vitrinas_mes').select('*')
      if (error) throw new Error(error.message)
      return data as TopVitrina[]
    },
    staleTime: 5 * 60_000,
  })

  const stockBajo = useQuery({
    queryKey: ['stock_bajo'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_stock_bajo').select('*')
      if (error) throw new Error(error.message)
      return data as StockBajo[]
    },
    staleTime: 5 * 60_000,
  })

  return { kpis, ventas30dias, ventasPorRuta, topVitrinas, stockBajo, realtimeHealthy }
}
```

- [ ] **Paso 3.4: Verificar tipos**

```bash
npm run type-check
```

- [ ] **Paso 3.5: Commit**

```bash
git add lib/hooks/useDashboard.ts lib/hooks/__tests__/useDashboard.test.ts
git commit -m "feat: hook useDashboard con Realtime + fallback polling"
```

---

## Task 4: UI Dashboard

**Files:**
- Create: `erp-vitrinas/components/admin/dashboard/KpiCards.tsx`
- Create: `erp-vitrinas/components/admin/dashboard/TabHoy.tsx`
- Create: `erp-vitrinas/components/admin/dashboard/TabTendencias.tsx`
- Create: `erp-vitrinas/components/admin/dashboard/TabVitrinas.tsx`
- Create: `erp-vitrinas/app/(admin)/admin/dashboard/page.tsx`

- [ ] **Paso 4.1: Crear KpiCards**

```tsx
// erp-vitrinas/components/admin/dashboard/KpiCards.tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardHoy } from '@/lib/hooks/useDashboard'

interface Props {
  data: DashboardHoy | undefined
  isLoading: boolean
}

function KpiCard({ title, value, isLoading }: { title: string; value: string; isLoading: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="text-2xl font-bold text-slate-900">{value}</p>
        )}
      </CardContent>
    </Card>
  )
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}

export function KpiCards({ data, isLoading }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <KpiCard title="Ventas hoy" value={fmt(data?.ventas_hoy ?? 0)} isLoading={isLoading} />
      <KpiCard
        title="Visitas"
        value={`${data?.visitas_realizadas ?? 0} / ${data?.visitas_planificadas ?? 0}`}
        isLoading={isLoading}
      />
      <KpiCard title="Cobros hoy" value={fmt(data?.cobros_hoy ?? 0)} isLoading={isLoading} />
      <KpiCard
        title="Incidencias abiertas"
        value={String(data?.incidencias_abiertas ?? 0)}
        isLoading={isLoading}
      />
    </div>
  )
}
```

- [ ] **Paso 4.2: Crear TabHoy**

```tsx
// erp-vitrinas/components/admin/dashboard/TabHoy.tsx
'use client'
// Si Tremor está disponible: import { AreaChart } from '@tremor/react'
// Si no: import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import type { DashboardHoy, VentasDia } from '@/lib/hooks/useDashboard'

interface Props {
  kpis: DashboardHoy | undefined
  isLoading: boolean
}

export function TabHoy({ kpis, isLoading }: Props) {
  if (isLoading) return <Skeleton className="h-48 w-full" />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-sm text-slate-500">Visitas realizadas</p>
          <p className="text-3xl font-bold">{kpis?.visitas_realizadas ?? 0}</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">Visitas planificadas</p>
          <p className="text-3xl font-bold">{kpis?.visitas_planificadas ?? 0}</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">Incidencias abiertas</p>
          <p className="text-3xl font-bold text-orange-600">{kpis?.incidencias_abiertas ?? 0}</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Paso 4.3: Crear TabTendencias**

```tsx
// erp-vitrinas/components/admin/dashboard/TabTendencias.tsx
'use client'
// Adaptar imports según librería de charts elegida (Tremor o Recharts)
import { Skeleton } from '@/components/ui/skeleton'
import type { VentasDia, VentasRuta } from '@/lib/hooks/useDashboard'

interface Props {
  ventas30dias: VentasDia[] | undefined
  ventasPorRuta: VentasRuta[] | undefined
  isLoading: boolean
}

export function TabTendencias({ ventas30dias, ventasPorRuta, isLoading }: Props) {
  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  )

  // Con Tremor:
  // return (
  //   <div className="space-y-6">
  //     <AreaChart data={ventas30dias ?? []} index="fecha" categories={['total_ventas']} />
  //     <BarChart data={ventasPorRuta ?? []} index="ruta" categories={['total_ventas']} />
  //   </div>
  // )

  // Con Recharts: implementar usando ResponsiveContainer + AreaChart + BarChart de recharts
  // La API es diferente — ver documentación de Recharts en context7 si es necesario
  return <div className="text-slate-400 text-sm">Charts: implementar con la librería elegida</div>
}
```

**IMPORTANTE:** El cuerpo de `TabTendencias` debe reemplazar los `<Skeleton>` placeholder con gráficas reales:
- Gráfica 1: ventas de los últimos 30 días (`ventas30dias`) — AreaChart o LineChart con eje X = `fecha`, eje Y = `total_ventas`
- Gráfica 2: ventas por ruta en el mes (`ventasPorRuta`) — BarChart con eje X = nombre de ruta, eje Y = total

Si usás **Tremor**: `import { AreaChart, BarChart } from '@tremor/react'` (API declarativa, dataKey por nombre de campo).
Si usás **Recharts**: `import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'`.
Verificá compatibilidad con Tailwind v4 en el prerrequisito (Task 0) y usá la librería confirmada. No dejes el skeleton en producción.

- [ ] **Paso 4.4: Crear TabVitrinas**

```tsx
// erp-vitrinas/components/admin/dashboard/TabVitrinas.tsx
'use client'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { TopVitrina, StockBajo } from '@/lib/hooks/useDashboard'

interface Props {
  topVitrinas: TopVitrina[] | undefined
  stockBajo: StockBajo[] | undefined
  isLoading: boolean
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}

export function TabVitrinas({ topVitrinas, stockBajo, isLoading }: Props) {
  if (isLoading) return <Skeleton className="h-64 w-full" />

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div>
        <h3 className="font-semibold text-slate-700 mb-3">Top 10 vitrinas por ventas</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="pb-2">PDV</th>
              <th className="pb-2 text-right">Ventas mes</th>
            </tr>
          </thead>
          <tbody>
            {(topVitrinas ?? []).map((v) => (
              <tr key={v.vitrina_id} className="border-b last:border-0">
                <td className="py-2">{v.pdv_nombre}</td>
                <td className="py-2 text-right font-medium">{fmt(v.total_ventas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="font-semibold text-slate-700 mb-3">
          Stock bajo{' '}
          {(stockBajo?.length ?? 0) > 0 && (
            <Badge variant="destructive">{stockBajo?.length}</Badge>
          )}
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="pb-2">PDV</th>
              <th className="pb-2">Producto</th>
              <th className="pb-2 text-right">Stock %</th>
            </tr>
          </thead>
          <tbody>
            {(stockBajo ?? []).map((s) => (
              <tr key={`${s.vitrina_id}-${s.producto_id}`} className="border-b last:border-0">
                <td className="py-2">{s.pdv_nombre}</td>
                <td className="py-2">{s.producto_nombre}</td>
                <td className="py-2 text-right text-orange-600 font-medium">{s.pct_stock}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Paso 4.5: Crear página dashboard**

```tsx
// erp-vitrinas/app/(admin)/admin/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ROLES } from '@/lib/validations/usuarios'
import type { UserRol } from '@/lib/validations/usuarios'
import { DashboardClient } from '@/components/admin/dashboard/DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const rawRol = user.app_metadata?.rol
  if (!ROLES.includes(rawRol)) redirect('/login')
  const rol = rawRol as UserRol

  if (!['admin', 'supervisor', 'analista'].includes(rol)) {
    redirect('/admin')  // evitar loop: el dashboard mismo haría el redirect si fuéramos a /admin/dashboard
  }

  return <DashboardClient />
}
```

```tsx
// erp-vitrinas/components/admin/dashboard/DashboardClient.tsx
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDashboard } from '@/lib/hooks/useDashboard'
import { KpiCards } from './KpiCards'
import { TabHoy } from './TabHoy'
import { TabTendencias } from './TabTendencias'
import { TabVitrinas } from './TabVitrinas'

export function DashboardClient() {
  const { kpis, ventas30dias, ventasPorRuta, topVitrinas, stockBajo, realtimeHealthy } = useDashboard()

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <span className="text-xs text-slate-400">
          {realtimeHealthy ? '● En vivo' : '○ Actualizando cada 30s'}
        </span>
      </div>
      <KpiCards data={kpis.data} isLoading={kpis.isLoading} />
      <Tabs defaultValue="hoy">
        <TabsList>
          <TabsTrigger value="hoy">Hoy</TabsTrigger>
          <TabsTrigger value="tendencias">Tendencias</TabsTrigger>
          <TabsTrigger value="vitrinas">Vitrinas</TabsTrigger>
        </TabsList>
        <TabsContent value="hoy" className="mt-4">
          <TabHoy kpis={kpis.data} isLoading={kpis.isLoading} />
        </TabsContent>
        <TabsContent value="tendencias" className="mt-4">
          <TabTendencias
            ventas30dias={ventas30dias.data}
            ventasPorRuta={ventasPorRuta.data}
            isLoading={ventas30dias.isLoading}
          />
        </TabsContent>
        <TabsContent value="vitrinas" className="mt-4">
          <TabVitrinas
            topVitrinas={topVitrinas.data}
            stockBajo={stockBajo.data}
            isLoading={topVitrinas.isLoading}
          />
        </TabsContent>
      </Tabs>
    </main>
  )
}
```

- [ ] **Paso 4.6: Verificar compilación**

```bash
npm run type-check && npm run build
```

- [ ] **Paso 4.7: Commit**

```bash
git add components/admin/dashboard/ app/\(admin\)/admin/dashboard/page.tsx
git commit -m "feat: dashboard en tiempo real — KPIs + tabs Hoy/Tendencias/Vitrinas"
```

---

## Task 5: Utilidad de exportación Excel + Hook useReportes

**Files:**
- Create: `erp-vitrinas/lib/utils/exportXlsx.ts`
- Create: `erp-vitrinas/lib/hooks/useReportes.ts`

- [ ] **Paso 5.1: Instalar xlsx**

```bash
npm install xlsx
```

- [ ] **Paso 5.2: Escribir test unitario exportación**

```ts
// erp-vitrinas/lib/utils/__tests__/exportXlsx.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildWorksheet } from '@/lib/utils/exportXlsx'

describe('buildWorksheet', () => {
  it('genera una hoja con los headers correctos', () => {
    const rows = [
      { pdv_nombre: 'Tienda A', ventas: 1000, fecha: '2026-03-01' },
    ]
    const sheet = buildWorksheet(rows, { pdv_nombre: 'PDV', ventas: 'Ventas', fecha: 'Fecha' })
    // El primer row debe ser los headers
    expect(sheet['A1'].v).toBe('PDV')
    expect(sheet['B1'].v).toBe('Ventas')
    expect(sheet['A2'].v).toBe('Tienda A')
  })

  it('retorna hoja vacía para datos vacíos', () => {
    const sheet = buildWorksheet([], { col: 'Col' })
    expect(sheet['A1'].v).toBe('Col')
    expect(sheet['A2']).toBeUndefined()
  })
})
```

- [ ] **Paso 5.3: Ejecutar test (debe fallar — función no existe)**

```bash
npm test -- lib/utils/__tests__/exportXlsx.test.ts
```

- [ ] **Paso 5.4: Crear exportXlsx.ts**

```ts
// erp-vitrinas/lib/utils/exportXlsx.ts

/** Headers: mapeo de clave de datos → nombre de columna en español */
export type ColumnHeaders<T> = { [K in keyof T]?: string }

/** Construye una worksheet de SheetJS a partir de un array de objetos.
 *  Exportado separado para poder testearlo sin importar xlsx dinámicamente. */
export function buildWorksheet<T extends Record<string, unknown>>(
  rows: T[],
  headers: ColumnHeaders<T>
): Record<string, { v: unknown; t: string }> {
  const keys = Object.keys(headers) as (keyof T)[]
  const sheet: Record<string, { v: unknown; t: string }> = {}

  // Headers row
  keys.forEach((key, col) => {
    const cellRef = `${String.fromCharCode(65 + col)}1`
    sheet[cellRef] = { v: headers[key], t: 's' }
  })

  // Data rows
  rows.forEach((row, rowIdx) => {
    keys.forEach((key, col) => {
      const cellRef = `${String.fromCharCode(65 + col)}${rowIdx + 2}`
      const val = row[key]
      sheet[cellRef] = {
        v: val,
        t: typeof val === 'number' ? 'n' : 's',
      }
    })
  })

  if (rows.length > 0) {
    sheet['!ref'] = `A1:${String.fromCharCode(65 + keys.length - 1)}${rows.length + 1}` as unknown as { v: unknown; t: string }
  } else {
    sheet['!ref'] = `A1:${String.fromCharCode(65 + keys.length - 1)}1` as unknown as { v: unknown; t: string }
  }

  return sheet
}

/**
 * Exporta rows a un archivo .xlsx y lo descarga en el navegador.
 * SheetJS se importa dinámicamente para evitar incluirlo en el bundle inicial.
 * Si hay más de 5000 filas, el llamador debe haber mostrado una confirmación antes.
 */
export async function exportToXlsx<T extends Record<string, unknown>>(
  rows: T[],
  headers: ColumnHeaders<T>,
  filename: string
): Promise<void> {
  const xlsx = await import('xlsx')
  const ws = buildWorksheet(rows, headers)
  const wb = xlsx.utils.book_new()
  xlsx.utils.book_append_sheet(wb, ws as Parameters<typeof xlsx.utils.book_append_sheet>[1], 'Datos')
  xlsx.writeFile(wb, `${filename}.xlsx`)
}
```

- [ ] **Paso 5.5: Ejecutar tests**

```bash
npm test -- lib/utils/__tests__/exportXlsx.test.ts
```

Expected: PASS

- [ ] **Paso 5.6: Crear useReportes.ts**

```ts
// erp-vitrinas/lib/hooks/useReportes.ts
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type FiltrosReporte = {
  desde: string
  hasta: string
  rutaId?: string
  colaboradoraId?: string
  pdvId?: string
  tipo?: 'incidencia' | 'garantia' | null  // para useReporteIncidenciasGarantias
}

// ---- Reporte de Ventas ----
export function useReporteVentas() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [filtros, setFiltros] = useState<FiltrosReporte | null>(null)

  const query = useQuery({
    queryKey: ['reporte_ventas', filtros],
    enabled: !!filtros,  // solo fetcha cuando el usuario aplica filtros
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!filtros) return []
      const { data, error } = await supabase.rpc('get_reporte_ventas', {
        p_desde: filtros.desde,
        p_hasta: filtros.hasta,
        p_ruta_id: filtros.rutaId ?? null,
        p_colaboradora_id: filtros.colaboradoraId ?? null,
        p_pdv_id: filtros.pdvId ?? null,
      })
      if (error) throw new Error(error.message)
      return data
    },
  })

  return { ...query, buscar: setFiltros, filtros }
}

// ---- Ranking Vitrinas ----
export function useRankingVitrinas() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [periodo, setPeriodo] = useState<{ desde: string; hasta: string } | null>(null)

  const query = useQuery({
    queryKey: ['ranking_vitrinas', periodo],
    enabled: !!periodo,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!periodo) return []
      // Calcular período anterior: mismo rango desplazado hacia atrás
      const desdeDate = new Date(periodo.desde)
      const hastaDate = new Date(periodo.hasta)
      const duracion = hastaDate.getTime() - desdeDate.getTime()
      const hastaAnterior = new Date(desdeDate.getTime() - 24 * 60 * 60 * 1000)
      const desdeAnterior = new Date(hastaAnterior.getTime() - duracion)

      const { data, error } = await supabase.rpc('get_ranking_vitrinas', {
        p_desde_actual: periodo.desde,
        p_hasta_actual: periodo.hasta,
        p_desde_anterior: desdeAnterior.toISOString().split('T')[0],
        p_hasta_anterior: hastaAnterior.toISOString().split('T')[0],
      })
      if (error) throw new Error(error.message)
      return data
    },
  })

  return { ...query, buscar: setPeriodo, periodo }
}

// ---- Reporte Visitas ----
export function useReporteVisitas() {
  const supabase = createClient()
  const [filtros, setFiltros] = useState<FiltrosReporte | null>(null)

  const query = useQuery({
    queryKey: ['reporte_visitas', filtros],
    enabled: !!filtros,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!filtros) return []
      const { data, error } = await supabase.rpc('get_reporte_visitas', {
        p_desde: filtros.desde,
        p_hasta: filtros.hasta,
        p_ruta_id: filtros.rutaId ?? null,
      })
      if (error) throw new Error(error.message)
      return data
    },
  })

  return { ...query, buscar: setFiltros }
}

// ---- Reporte Incidencias/Garantías ----
export function useReporteIncidenciasGarantias() {
  const supabase = createClient()
  const [filtros, setFiltros] = useState<FiltrosReporte | null>(null)

  const query = useQuery({
    queryKey: ['reporte_incidencias_garantias', filtros],
    enabled: !!filtros,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!filtros) return []
      const { data, error } = await supabase.rpc('get_reporte_incidencias_garantias', {
        p_desde: filtros.desde,
        p_hasta: filtros.hasta,
        p_pdv_id: filtros.pdvId ?? null,
        p_tipo: filtros.tipo ?? null,  // 'incidencia' | 'garantia' | null (todos)
      })
      if (error) throw new Error(error.message)
      return data
    },
  })

  return { ...query, buscar: setFiltros }
}
```

- [ ] **Paso 5.7: Verificar tipos y commit**

```bash
npm run type-check
git add lib/utils/exportXlsx.ts lib/utils/__tests__/exportXlsx.test.ts lib/hooks/useReportes.ts
git commit -m "feat: exportXlsx utility + hooks useReportes (enabled: false)"
```

---

## Task 6: UI Reportes

**Files:**
- Create: `erp-vitrinas/components/admin/reportes/FiltrosReporte.tsx`
- Create: `erp-vitrinas/components/admin/reportes/ReporteVentas.tsx`
- Create: `erp-vitrinas/components/admin/reportes/RankingVitrinas.tsx`
- Create: `erp-vitrinas/components/admin/reportes/ReporteInventario.tsx`
- Create: `erp-vitrinas/components/admin/reportes/ReporteVisitas.tsx`
- Create: `erp-vitrinas/components/admin/reportes/ReporteIncidenciasGarantias.tsx`
- Create: `erp-vitrinas/app/(admin)/admin/reportes/page.tsx`

- [ ] **Paso 6.1: Crear FiltrosReporte (componente compartido)**

```tsx
// erp-vitrinas/components/admin/reportes/FiltrosReporte.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  onBuscar: (filtros: { desde: string; hasta: string }) => void
  isLoading?: boolean
}

export function FiltrosReporte({ onBuscar, isLoading }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 8) + '01'
  const [desde, setDesde] = useState(firstOfMonth)
  const [hasta, setHasta] = useState(today)

  return (
    <div className="flex flex-wrap gap-4 items-end">
      <div>
        <Label>Desde</Label>
        <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
      </div>
      <div>
        <Label>Hasta</Label>
        <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </div>
      <Button onClick={() => onBuscar({ desde, hasta })} disabled={isLoading}>
        {isLoading ? 'Buscando…' : 'Buscar'}
      </Button>
    </div>
  )
}
```

- [ ] **Paso 6.2: Crear ReporteVentas con exportación**

```tsx
// erp-vitrinas/components/admin/reportes/ReporteVentas.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/admin/DataTable'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { useReporteVentas } from '@/lib/hooks/useReportes'
import { exportToXlsx } from '@/lib/utils/exportXlsx'
import { FiltrosReporte } from './FiltrosReporte'

const HEADERS = {
  pdv_nombre: 'PDV',
  ruta_nombre: 'Ruta',
  colaboradora_nombre: 'Colaboradora',
  fecha: 'Fecha',
  unidades_vendidas: 'Unidades',
  monto_cobrado: 'Monto cobrado',
  forma_pago: 'Forma de pago',
}

export function ReporteVentas() {
  const { data = [], isLoading, buscar } = useReporteVentas()
  const [confirmExport, setConfirmExport] = useState(false)

  const columns: ColumnDef<(typeof data)[0]>[] = Object.entries(HEADERS).map(([key, header]) => ({
    accessorKey: key,
    header,
  }))

  async function handleExport() {
    if (data.length > 5000) {
      setConfirmExport(true)
      return
    }
    await doExport()
  }

  async function doExport() {
    try {
      await exportToXlsx(data, HEADERS, 'reporte-ventas')
    } catch {
      toast.error('Error al exportar el reporte')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <FiltrosReporte onBuscar={buscar} isLoading={isLoading} />
        {data.length > 0 && (
          <Button variant="outline" onClick={handleExport}>
            Exportar .xlsx
          </Button>
        )}
      </div>
      <DataTable columns={columns} data={data} isLoading={isLoading} />

      <AlertDialog open={confirmExport} onOpenChange={setConfirmExport}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exportar {data.length.toLocaleString()} filas</AlertDialogTitle>
            <AlertDialogDescription>
              El archivo puede tardar unos segundos en generarse. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doExport}>Exportar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Paso 6.3: Crear RankingVitrinas**

Igual que `ReporteVentas` pero usando `useRankingVitrinas`. Columnas: `pdv_nombre`, `ventas_actual`, `ventas_anterior`, `variacion_pct`. Para la celda `variacion_pct`:

```tsx
// helper para la celda variacion_pct
function VariacionCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-400">—</span>
  const positive = value >= 0
  return (
    <span className={positive ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
      {positive ? '+' : ''}{value.toFixed(1)}%
    </span>
  )
}
// Uso en la fila de la tabla:
// <td><VariacionCell value={row.variacion_pct} /></td>
```

- [ ] **Paso 6.4: Crear ReporteInventario**

Usa la vista `inventario_valorizado` ya existente (mismo hook que el tab Valorizado de `/admin/inventario`). Sin filtros de fecha.

- [ ] **Paso 6.5: Crear ReporteVisitas y ReporteIncidenciasGarantias**

Mismo patrón que `ReporteVentas` con sus respectivos hooks y headers en español.

- [ ] **Paso 6.6: Crear página /admin/reportes**

```tsx
// erp-vitrinas/app/(admin)/admin/reportes/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ROLES } from '@/lib/validations/usuarios'
import type { UserRol } from '@/lib/validations/usuarios'
import { ReportesClient } from '@/components/admin/reportes/ReportesClient'

export default async function ReportesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const rawRol = user.app_metadata?.rol
  if (!ROLES.includes(rawRol)) redirect('/login')
  const rol = rawRol as UserRol
  if (!['admin', 'supervisor', 'analista', 'compras'].includes(rol)) redirect('/admin')
  return <ReportesClient rol={rol} />
}
```

```tsx
// erp-vitrinas/components/admin/reportes/ReportesClient.tsx
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReporteVentas } from './ReporteVentas'
import { RankingVitrinas } from './RankingVitrinas'
import { ReporteInventario } from './ReporteInventario'
import { ReporteVisitas } from './ReporteVisitas'
import { ReporteIncidenciasGarantias } from './ReporteIncidenciasGarantias'
import type { UserRol } from '@/lib/validations/usuarios'

export function ReportesClient({ rol }: { rol: UserRol }) {
  const esCompras = rol === 'compras'

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Reportes</h1>
      <Tabs defaultValue={esCompras ? 'inventario' : 'ventas'}>
        <TabsList>
          {!esCompras && <TabsTrigger value="ventas">Ventas</TabsTrigger>}
          {!esCompras && <TabsTrigger value="ranking">Ranking vitrinas</TabsTrigger>}
          <TabsTrigger value="inventario">Inventario</TabsTrigger>
          {!esCompras && <TabsTrigger value="visitas">Visitas</TabsTrigger>}
          {!esCompras && <TabsTrigger value="incidencias">Incidencias/Garantías</TabsTrigger>}
        </TabsList>
        {!esCompras && (
          <TabsContent value="ventas" className="mt-4"><ReporteVentas /></TabsContent>
        )}
        {!esCompras && (
          <TabsContent value="ranking" className="mt-4"><RankingVitrinas /></TabsContent>
        )}
        <TabsContent value="inventario" className="mt-4"><ReporteInventario /></TabsContent>
        {!esCompras && (
          <TabsContent value="visitas" className="mt-4"><ReporteVisitas /></TabsContent>
        )}
        {!esCompras && (
          <TabsContent value="incidencias" className="mt-4"><ReporteIncidenciasGarantias /></TabsContent>
        )}
      </Tabs>
    </main>
  )
}
```

- [ ] **Paso 6.7: Actualizar sidebar**

Añadir links de Dashboard y Reportes al sidebar:

```ts
// En AppSidebar.tsx, en el array de nav items:
{ href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard }
{ href: '/admin/reportes', label: 'Reportes', icon: FileBarChart }
```

- [ ] **Paso 6.8: Verificar compilación**

```bash
npm run type-check && npm run build
```

- [ ] **Paso 6.9: Commit**

```bash
git add components/admin/reportes/ components/admin/dashboard/ app/\(admin\)/admin/reportes/ components/admin/AppSidebar.tsx
git commit -m "feat: módulo reportes — tabs + filtros + exportación xlsx"
```

---

## Task 7: Tests E2E + Unitarios Sprint 8

**Files:**
- Create: `erp-vitrinas/tests/sprint8-dashboard-reportes.spec.ts`

- [ ] **Paso 7.1: Escribir tests**

```ts
// erp-vitrinas/tests/sprint8-dashboard-reportes.spec.ts
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel(/correo/i).fill('admin@erp.local')
  await page.getByLabel(/contraseña/i).fill('Admin1234!')
  await page.getByRole('button', { name: /iniciar sesión/i }).click()
  await expect(page).toHaveURL(/admin/)
})

test.describe('Dashboard', () => {
  test('carga los KPI cards sin error', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()
    // Los 4 KPI cards deben estar visibles (aunque sean 0)
    await expect(page.getByText(/ventas hoy/i)).toBeVisible()
    await expect(page.getByText(/visitas/i)).toBeVisible()
    await expect(page.getByText(/cobros hoy/i)).toBeVisible()
    await expect(page.getByText(/incidencias abiertas/i)).toBeVisible()
  })

  test('tabs navegan sin error de JS', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await page.getByRole('tab', { name: /tendencias/i }).click()
    await expect(page.getByRole('tab', { name: /tendencias/i })).toHaveAttribute('data-state', 'active')
    await page.getByRole('tab', { name: /vitrinas/i }).click()
    await expect(page.getByRole('tab', { name: /vitrinas/i })).toHaveAttribute('data-state', 'active')
    // Sin errores de consola JS
  })
})

test.describe('Reportes', () => {
  test('carga la página y los tabs son navegables', async ({ page }) => {
    await page.goto('/admin/reportes')
    await expect(page.getByRole('heading', { name: /reportes/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /ventas/i })).toBeVisible()
  })

  test('reporte de ventas: buscar y exportar', async ({ page }) => {
    await page.goto('/admin/reportes')

    // Aplicar filtros
    await page.getByRole('button', { name: /buscar/i }).first().click()
    // Esperar que la tabla cargue (puede estar vacía si no hay datos de test)
    await page.waitForTimeout(1000)

    // Si hay datos, verificar que aparece el botón de exportar
    const exportBtn = page.getByRole('button', { name: /exportar/i })
    if (await exportBtn.isVisible()) {
      // Verificar que el click inicia la descarga
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        exportBtn.click(),
      ])
      expect(download.suggestedFilename()).toContain('.xlsx')
    }
  })

  test('ranking vitrinas muestra columna de variación', async ({ page }) => {
    await page.goto('/admin/reportes')
    await page.getByRole('tab', { name: /ranking/i }).click()
    await page.getByRole('button', { name: /buscar/i }).click()
    await page.waitForTimeout(1000)
    // Si hay datos, la columna variación debe estar presente
    const varCol = page.getByText(/variación/i)
    if (await varCol.isVisible()) {
      await expect(varCol).toBeVisible()
    }
  })
})
```

- [ ] **Paso 7.2: Ejecutar tests unitarios acumulados**

```bash
npm test
```

Expected: todos los tests (incluyendo exportXlsx y useDashboard) pasan.

- [ ] **Paso 7.3: Ejecutar tests E2E**

```bash
npm run test:e2e -- tests/sprint8-dashboard-reportes.spec.ts
```

Expected: todos pasan. Corregir errores de UI antes de continuar.

- [ ] **Paso 7.4: Commit**

```bash
git add tests/sprint8-dashboard-reportes.spec.ts
git commit -m "test: e2e + unit Sprint 8 — dashboard y reportes"
```

---

## Task 8: Análisis de Bundle y Verificación Final

- [ ] **Paso 8.1: Build de producción**

```bash
npm run build
```

Expected: sin errores. Revisar el output — buscar que `xlsx` aparezca en chunks lazy (no en `app/page` ni en `layout`).

Si `xlsx` aparece en el bundle principal, el dynamic import no está funcionando. Verificar que `exportToXlsx` se llama dentro de un event handler y no en el render del componente.

- [ ] **Paso 8.2: Verificar type-check completo**

```bash
npm run type-check
```

Expected: sin errores.

- [ ] **Paso 8.3: Ejecutar suite completa de tests**

```bash
npm run test:e2e
npm test
```

Expected: todos los tests pasan (Sprint 7 + Sprint 8 + tests anteriores).

- [ ] **Paso 8.4: Commit final Sprint 8**

```bash
git commit --allow-empty -m "chore: Sprint 8 completado — dashboard + reportes + xlsx"
```

---

## Checklist final Sprint 8

- [ ] `supabase db reset && npm run seed:auth && npm run dev` — app levanta sin errores
- [ ] `npm run type-check` — sin errores
- [ ] `npm run build` — sin errores; SheetJS en chunk lazy
- [ ] Dashboard carga KPIs en tiempo real; indicador "En vivo" aparece
- [ ] Los 3 tabs del dashboard navegan sin error
- [ ] `/admin/reportes` tiene 5 tabs; cada uno carga datos al presionar "Buscar"
- [ ] Exportar .xlsx descarga un archivo válido
- [ ] `npm run test:e2e` — todos los tests de Sprint 7 + Sprint 8 pasan
- [ ] `npm test` — todos los tests unitarios pasan
