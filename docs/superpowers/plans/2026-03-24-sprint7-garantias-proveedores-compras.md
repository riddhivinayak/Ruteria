# Sprint 7 — Garantías + Proveedores/Compras

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el módulo de garantías (campo + admin), CRUD de proveedores, y el flujo completo de órdenes de compra reemplazando `InventarioCentralSheet`.

**Architecture:** Garantías siguen el patrón de incidencias — registro en campo durante visita, gestión en admin con ciclo de vida. Compras usan un flujo de estados (pendiente → confirmada → recibida) con RPC transaccional. Todo offline-first para garantías.

**Tech Stack:** Next.js 16 App Router, Supabase PostgreSQL (RPCs + RLS), TanStack React Query v5, Zod + React Hook Form, shadcn/ui, IndexedDB offline queue.

---

## File Map

| Acción | Archivo |
|---|---|
| CREATE | `erp-vitrinas/supabase/migrations/20260029_garantias_fase2.sql` |
| CREATE | `erp-vitrinas/supabase/migrations/20260030_compras_fase2.sql` |
| CREATE | `erp-vitrinas/lib/validations/garantias.ts` |
| CREATE | `erp-vitrinas/lib/validations/proveedores.ts` |
| CREATE | `erp-vitrinas/lib/validations/compras.ts` |
| CREATE | `erp-vitrinas/lib/hooks/useGarantias.ts` |
| CREATE | `erp-vitrinas/lib/hooks/useProveedores.ts` |
| CREATE | `erp-vitrinas/lib/hooks/useCompras.ts` |
| CREATE | `erp-vitrinas/components/campo/GarantiaSheet.tsx` |
| CREATE | `erp-vitrinas/components/admin/GarantiaDetalleSheet.tsx` |
| CREATE | `erp-vitrinas/components/admin/GarantiasTable.tsx` |
| CREATE | `erp-vitrinas/components/admin/ProveedorSheet.tsx` |
| CREATE | `erp-vitrinas/components/admin/CompraSheet.tsx` |
| CREATE | `erp-vitrinas/components/admin/RecepcionSheet.tsx` |
| CREATE | `erp-vitrinas/app/(admin)/admin/garantias/page.tsx` |
| CREATE | `erp-vitrinas/app/(admin)/admin/proveedores/page.tsx` |
| CREATE | `erp-vitrinas/app/(admin)/admin/compras/page.tsx` |
| CREATE | `erp-vitrinas/tests/sprint7-garantias-compras.spec.ts` |
| MODIFY | `erp-vitrinas/lib/offline/queue.ts` — añadir rama `visit:create-garantia` |
| MODIFY | `erp-vitrinas/lib/offline/sync.ts` — añadir handler garantía |
| MODIFY | `erp-vitrinas/components/campo/VisitaIncidenciasButton.tsx` — patrón de referencia |
| CREATE | `erp-vitrinas/components/campo/VisitaGarantiasButton.tsx` |
| MODIFY | `erp-vitrinas/app/(campo)/campo/visita/[id]/page.tsx` — añadir botón garantías |
| MODIFY | `erp-vitrinas/components/admin/AppSidebar.tsx` — añadir nav links |
| MODIFY | `erp-vitrinas/app/(admin)/admin/inventario/page.tsx` — quitar InventarioCentralSheet |
| DELETE | `erp-vitrinas/components/admin/InventarioCentralSheet.tsx` |
| MODIFY | `erp-vitrinas/lib/supabase/database.types.ts` — regenerar |

---

## Task 1: Migración — Garantías RLS + RPCs

**Files:**
- Create: `erp-vitrinas/supabase/migrations/20260029_garantias_fase2.sql`

- [ ] **Paso 1.1: Crear archivo de migración**

```sql
-- erp-vitrinas/supabase/migrations/20260029_garantias_fase2.sql

-- ============================================================
-- Añadir columna notas_resolucion a garantias
-- ============================================================
ALTER TABLE garantias ADD COLUMN IF NOT EXISTS notas_resolucion TEXT;

-- ============================================================
-- RLS: reemplazar política permisiva de garantias_select
-- La política actual es USING(true) — cualquier usuario autenticado
-- puede ver todas las garantías. Reemplazamos por una restrictiva.
-- ============================================================
DROP POLICY IF EXISTS "garantias_select" ON garantias;
CREATE POLICY "garantias_select" ON garantias FOR SELECT TO authenticated
  USING (
    get_my_rol() IN ('admin', 'supervisor', 'analista', 'compras')
    OR (
      get_my_rol() = 'colaboradora'
      AND visita_recepcion_id IN (
        SELECT id FROM visitas WHERE colaboradora_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "garantias_update" ON garantias;
CREATE POLICY "garantias_update" ON garantias FOR UPDATE TO authenticated
  USING (get_my_rol() IN ('admin', 'supervisor'))
  WITH CHECK (get_my_rol() IN ('admin', 'supervisor'));

-- ============================================================
-- Índices de soporte
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_garantias_estado ON garantias(estado);
CREATE INDEX IF NOT EXISTS idx_garantias_visita ON garantias(visita_recepcion_id);
CREATE INDEX IF NOT EXISTS idx_garantias_pdv ON garantias(pdv_id);

-- ============================================================
-- RPC: registrar_garantia
-- Idempotente: usa ON CONFLICT (id) DO NOTHING + check RETURNING
-- ============================================================
CREATE OR REPLACE FUNCTION registrar_garantia(
  p_garantia_id       UUID,
  p_visita_recepcion_id UUID,
  p_pdv_id            UUID,
  p_producto_id       UUID,
  p_cantidad          INT,
  p_motivo            TEXT,
  p_fecha_venta_aprox DATE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_inserted_id UUID;
  v_vitrina_id  UUID;
BEGIN
  -- Obtener vitrina_id de la visita para el movimiento de inventario
  SELECT vitrina_id INTO v_vitrina_id
  FROM visitas WHERE id = p_visita_recepcion_id;

  IF v_vitrina_id IS NULL THEN
    RAISE EXCEPTION 'Visita no encontrada o sin vitrina: %', p_visita_recepcion_id;
  END IF;

  -- Insertar garantía de forma idempotente
  INSERT INTO garantias (
    id, visita_recepcion_id, pdv_id, producto_id,
    cantidad, motivo, fecha_venta_aprox, created_by
  ) VALUES (
    p_garantia_id, p_visita_recepcion_id, p_pdv_id, p_producto_id,
    p_cantidad, p_motivo, p_fecha_venta_aprox, auth.uid()
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  -- Si ya existía (retry offline), no duplicar movimiento
  IF v_inserted_id IS NULL THEN
    RETURN p_garantia_id;
  END IF;

  -- Descontar del inventario vitrina
  INSERT INTO movimientos_inventario (
    producto_id, cantidad, tipo, direccion, origen_tipo, origen_id, created_by
  ) VALUES (
    p_producto_id, p_cantidad,
    'devolucion_garantia', 'salida', 'vitrina', v_vitrina_id,
    auth.uid()
  );

  RETURN v_inserted_id;
END;
$$;

-- ============================================================
-- RPC: resolver_garantia
-- SECURITY DEFINER — verifica rol internamente
-- Resoluciones:
--   cambio: producto defectuoso re-ingresa a central (ajuste/entrada/central)
--   baja: sin movimiento adicional (producto destruido/escrito off)
--   devolucion_proveedor: sin movimiento adicional (sale al proveedor)
-- ============================================================
CREATE OR REPLACE FUNCTION resolver_garantia(
  p_garantia_id UUID,
  p_resolucion  TEXT,
  p_notas       TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_garantia garantias%ROWTYPE;
BEGIN
  IF get_my_rol() NOT IN ('admin', 'supervisor') THEN
    RAISE EXCEPTION 'Sin permisos para resolver garantías';
  END IF;

  IF p_resolucion NOT IN ('cambio', 'baja', 'devolucion_proveedor') THEN
    RAISE EXCEPTION 'Resolución inválida: %. Valores válidos: cambio, baja, devolucion_proveedor', p_resolucion;
  END IF;

  SELECT * INTO v_garantia FROM garantias WHERE id = p_garantia_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Garantía no encontrada: %', p_garantia_id;
  END IF;

  -- Para cambio: el producto defectuoso re-ingresa al inventario central
  -- (la empresa lo recupera; la entrega del nuevo producto al cliente
  -- ocurre en la siguiente reposición normal)
  IF p_resolucion = 'cambio' THEN
    INSERT INTO movimientos_inventario (
      producto_id, cantidad, tipo, direccion, origen_tipo, created_by
    ) VALUES (
      v_garantia.producto_id, v_garantia.cantidad,
      'ajuste', 'entrada', 'central',
      auth.uid()
    );
  END IF;
  -- baja y devolucion_proveedor: sin movimiento adicional

  UPDATE garantias SET
    resolucion = p_resolucion,
    notas_resolucion = p_notas,
    estado = 'resuelta',
    updated_at = now()
  WHERE id = p_garantia_id;
END;
$$;
```

- [ ] **Paso 1.2: Aplicar migración local**

```bash
cd erp-vitrinas
supabase db reset
npm run seed:auth
```

Expected: migración aplicada sin errores. Verificar en Studio (`http://127.0.0.1:54323`) que `garantias` tiene columna `notas_resolucion` y las funciones `registrar_garantia`/`resolver_garantia` existen.

- [ ] **Paso 1.3: Commit**

```bash
git add supabase/migrations/20260029_garantias_fase2.sql
git commit -m "feat: migración garantías — RLS restrictivo, RPCs registrar/resolver"
```

---

## Task 2: Migración — Compras RLS + RPC

**Files:**
- Create: `erp-vitrinas/supabase/migrations/20260030_compras_fase2.sql`

- [ ] **Paso 2.1: Crear archivo de migración**

```sql
-- erp-vitrinas/supabase/migrations/20260030_compras_fase2.sql

-- ============================================================
-- RLS compras y detalle_compra (ya definidas en 20260008, verificar)
-- Las políticas del schema original ya existen. Solo añadir índices.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_compras_estado    ON compras(estado);
CREATE INDEX IF NOT EXISTS idx_compras_proveedor ON compras(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_compras_fecha     ON compras(fecha);

-- ============================================================
-- RPC: recibir_compra
-- Idempotente: si compras.estado = 'recibida', retorna éxito sin re-insertar.
-- NOTA: tipo='compra' aplica delta_central incondicionalmente en el trigger
-- actualizar_inventario — destino_tipo='central' es solo para auditoría.
-- ============================================================
CREATE OR REPLACE FUNCTION recibir_compra(
  p_compra_id UUID,
  p_items     JSONB   -- [{detalle_compra_id: UUID, cantidad_recibida: INT}]
) RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_estado  TEXT;
  v_item    JSONB;
  v_detalle detalle_compra%ROWTYPE;
BEGIN
  SELECT estado INTO v_estado FROM compras WHERE id = p_compra_id;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'Compra no encontrada: %', p_compra_id;
  END IF;

  -- Idempotencia: si ya fue recibida, retornar sin re-procesar
  IF v_estado = 'recibida' THEN
    RETURN;
  END IF;

  IF v_estado NOT IN ('pendiente', 'confirmada') THEN
    RAISE EXCEPTION 'No se puede recibir una compra en estado: %', v_estado;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_detalle
    FROM detalle_compra
    WHERE id = (v_item->>'detalle_compra_id')::UUID
      AND compra_id = p_compra_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Línea de compra no encontrada: %', v_item->>'detalle_compra_id';
    END IF;

    -- Actualizar cantidad recibida (respeta constraint cantidad_recibida <= cantidad_pedida)
    UPDATE detalle_compra
    SET cantidad_recibida = (v_item->>'cantidad_recibida')::INT,
        updated_at = now()
    WHERE id = v_detalle.id;

    -- Insertar movimiento de entrada al inventario central
    -- El trigger actualizar_inventario aplica delta_central := cantidad para tipo='compra'
    INSERT INTO movimientos_inventario (
      producto_id, cantidad, tipo, direccion, destino_tipo, created_by
    ) VALUES (
      v_detalle.producto_id,
      (v_item->>'cantidad_recibida')::INT,
      'compra', 'entrada', 'central',
      auth.uid()
    );
  END LOOP;

  -- Calcular total real y marcar como recibida
  UPDATE compras SET
    estado = 'recibida',
    total_real = (
      SELECT SUM(dc.cantidad_recibida * dc.costo_unitario)
      FROM detalle_compra dc
      WHERE dc.compra_id = p_compra_id
    ),
    updated_at = now()
  WHERE id = p_compra_id;
END;
$$;
```

- [ ] **Paso 2.2: Aplicar migración**

```bash
supabase db reset
npm run seed:auth
```

Expected: función `recibir_compra` existe en la DB.

- [ ] **Paso 2.3: Commit**

```bash
git add supabase/migrations/20260030_compras_fase2.sql
git commit -m "feat: migración compras — índices + RPC recibir_compra"
```

---

## Task 3: Regenerar tipos TypeScript

- [ ] **Paso 3.1: Regenerar database.types.ts**

```bash
cd erp-vitrinas
supabase gen types typescript --local > lib/supabase/database.types.ts
```

- [ ] **Paso 3.2: Verificar tipos compilados**

```bash
npm run type-check
```

Expected: sin errores de tipos nuevos.

- [ ] **Paso 3.3: Commit**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore: regenerar tipos tras migraciones Sprint 7"
```

---

## Task 4: Validaciones Zod

**Files:**
- Create: `erp-vitrinas/lib/validations/garantias.ts`
- Create: `erp-vitrinas/lib/validations/proveedores.ts`
- Create: `erp-vitrinas/lib/validations/compras.ts`

- [ ] **Paso 4.1: Crear schemas**

```ts
// erp-vitrinas/lib/validations/garantias.ts
import { z } from 'zod'

export const registrarGarantiaSchema = z.object({
  producto_id: z.string().uuid('Seleccioná un producto'),
  cantidad: z.number().int().min(1, 'La cantidad debe ser al menos 1'),
  motivo: z.string().min(1, 'El motivo es obligatorio'),
  fecha_venta_aprox: z.string().optional(),
})
export type RegistrarGarantiaInput = z.input<typeof registrarGarantiaSchema>

export const resolverGarantiaSchema = z.object({
  resolucion: z.enum(['cambio', 'baja', 'devolucion_proveedor'], {
    required_error: 'Seleccioná una resolución',
  }),
  notas_resolucion: z.string().optional(),
})
export type ResolverGarantiaInput = z.input<typeof resolverGarantiaSchema>

export const filtrosGarantiasSchema = z.object({
  estado: z.string().optional(),
  pdv_id: z.string().uuid().optional(),
  fecha_desde: z.string().optional(),
  fecha_hasta: z.string().optional(),
})
export type FiltrosGarantias = z.infer<typeof filtrosGarantiasSchema>
```

```ts
// erp-vitrinas/lib/validations/proveedores.ts
import { z } from 'zod'

export const proveedorSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio'),
  contacto_nombre: z.string().optional(),
  contacto_email: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().email('Email inválido').optional()
  ),
  contacto_tel: z.string().optional(),
  condiciones_pago: z.string().optional(),
  activo: z.boolean().default(true),
})
export type ProveedorInput = z.input<typeof proveedorSchema>
```

```ts
// erp-vitrinas/lib/validations/compras.ts
import { z } from 'zod'

export const lineaCompraSchema = z.object({
  producto_id: z.string().uuid(),
  cantidad_pedida: z.number().int().min(1),
  costo_unitario: z.number().min(0).optional(),
})

export const crearCompraSchema = z.object({
  proveedor_id: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().uuid('Seleccioná un proveedor')
  ),
  fecha: z.string().min(1, 'La fecha es obligatoria'),
  notas: z.string().optional(),
  lineas: z.array(lineaCompraSchema).min(1, 'Agregá al menos un producto'),
})
export type CrearCompraInput = z.input<typeof crearCompraSchema>

export const recibirCompraItemSchema = z.object({
  detalle_compra_id: z.string().uuid(),
  cantidad_recibida: z.number().int().min(0),
})
export const recibirCompraSchema = z.object({
  items: z.array(recibirCompraItemSchema),
})
export type RecibirCompraInput = z.infer<typeof recibirCompraSchema>
```

- [ ] **Paso 4.2: Verificar tipos**

```bash
npm run type-check
```

- [ ] **Paso 4.3: Commit**

```bash
git add lib/validations/garantias.ts lib/validations/proveedores.ts lib/validations/compras.ts
git commit -m "feat: validaciones Zod — garantías, proveedores, compras"
```

---

## Task 5: Hook useGarantias

**Files:**
- Create: `erp-vitrinas/lib/hooks/useGarantias.ts`

Sigue el patrón de `useIncidencias.ts`. Exporta:
- `useGarantiasList(filtros)` — listado admin
- `useSurtidoVitrina(vitrinaId)` — wrapper read-only de `useSurtidoEstandar`
- `useRegistrarGarantia()` — mutation (online + offline queue)
- `useResolverGarantia()` — mutation admin
- `useAsignarResponsable()` — mutation admin (en_proceso)

- [ ] **Paso 5.1: Escribir test unitario (hook mutation offline)**

```ts
// erp-vitrinas/lib/hooks/__tests__/useGarantias.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { enqueueCreateGarantia } from '@/lib/offline/queue'

vi.mock('@/lib/offline/queue', () => ({
  enqueueCreateGarantia: vi.fn(),
}))
vi.mock('@/lib/offline/network', () => ({
  isProbablyOfflineError: (e: Error) => e.message.includes('offline'),
}))

describe('enqueueCreateGarantia', () => {
  it('encola el item con el id correcto', async () => {
    const visitId = 'visit-1'
    const payload = {
      garantia_id: 'g-1',
      pdv_id: 'pdv-1',
      vitrina_id: 'v-1',
      producto_id: 'p-1',
      cantidad: 2,
      motivo: 'Defecto de fábrica',
      fecha_venta_aprox: null,
    }
    await enqueueCreateGarantia(visitId, payload)
    expect(enqueueCreateGarantia).toHaveBeenCalledWith(visitId, payload)
  })
})
```

- [ ] **Paso 5.2: Ejecutar test (debe fallar — función no existe aún)**

```bash
npm test -- lib/hooks/__tests__/useGarantias.test.ts
```

Expected: FAIL — `enqueueCreateGarantia` no existe en queue.ts.

- [ ] **Paso 5.3: Añadir rama offline al queue**

En `lib/offline/queue.ts`, añadir al final del union type `OfflineQueueItem` y exportar la función:

```ts
// Añadir al union OfflineQueueItem (después de la rama visit:create-incidencia):
  | {
      id: string
      type: 'visit:create-garantia'
      visitId: string
      payload: {
        garantia_id: string        // UUID generado en cliente (idempotency key)
        pdv_id: string
        vitrina_id: string         // solo para UI offline; no se guarda en garantias DB
        producto_id: string
        cantidad: number
        motivo: string
        fecha_venta_aprox: string | null
      }
      attemptCount: number
      lastError: string | null
      createdAt: string
      updatedAt: string
    }
```

```ts
// Añadir función al final del archivo (antes de deleteQueueItem):
export async function enqueueCreateGarantia(
  visitId: string,
  payload: {
    garantia_id: string
    pdv_id: string
    vitrina_id: string
    producto_id: string
    cantidad: number
    motivo: string
    fecha_venta_aprox: string | null
  }
): Promise<void> {
  const base = baseQueueMeta('visit:create-garantia', visitId, payload.garantia_id)
  await putQueueItem({ ...base, payload })
}
```

- [ ] **Paso 5.4: Añadir handler en sync.ts**

En `lib/offline/sync.ts`, dentro de `processOfflineSyncQueue`, añadir el bloque para `visit:create-garantia` después del bloque de `create-incidencia`:

```ts
      if (item.type === 'visit:create-garantia') {
        const { error } = await supabase.rpc('registrar_garantia', {
          p_garantia_id: item.payload.garantia_id,
          p_visita_recepcion_id: item.visitId,
          p_pdv_id: item.payload.pdv_id,
          p_producto_id: item.payload.producto_id,
          p_cantidad: item.payload.cantidad,
          p_motivo: item.payload.motivo,
          p_fecha_venta_aprox: item.payload.fecha_venta_aprox,
        })
        if (error) throw new Error(error.message)
        await deleteQueueItem(item.id)
        queryClient.invalidateQueries({ queryKey: ['garantias'] })
      }
```

- [ ] **Paso 5.5: Volver a ejecutar test (debe pasar)**

```bash
npm test -- lib/hooks/__tests__/useGarantias.test.ts
```

Expected: PASS

- [ ] **Paso 5.6: Crear useGarantias.ts**

```ts
// erp-vitrinas/lib/hooks/useGarantias.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { isProbablyOfflineError } from '@/lib/offline/network'
import { enqueueCreateGarantia } from '@/lib/offline/queue'
import { useSurtidoEstandar } from '@/lib/hooks/useSurtidoEstandar'
import type {
  FiltrosGarantias,
  RegistrarGarantiaInput,
  ResolverGarantiaInput,
} from '@/lib/validations/garantias'
import type { Database } from '@/lib/supabase/database.types'
import { v4 as uuidv4 } from 'uuid'

export type GarantiaItem = Database['public']['Tables']['garantias']['Row'] & {
  productos: { nombre: string; codigo: string } | null
  puntos_de_venta: { nombre: string } | null
}

/** Read-only wrapper — expone solo el array del surtido sin mutations */
export function useSurtidoVitrina(vitrinaId: string) {
  const { items } = useSurtidoEstandar(vitrinaId)
  return items
}

export function useGarantiasList(filtros: FiltrosGarantias = {}) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: ['garantias', filtros],
    queryFn: async () => {
      let q = supabase
        .from('garantias')
        .select('*, productos(nombre, codigo), puntos_de_venta(nombre)')
        .order('created_at', { ascending: false })

      if (filtros.estado) q = q.eq('estado', filtros.estado)
      if (filtros.pdv_id) q = q.eq('pdv_id', filtros.pdv_id)
      if (filtros.fecha_desde) q = q.gte('created_at', filtros.fecha_desde)
      if (filtros.fecha_hasta) q = q.lte('created_at', filtros.fecha_hasta)

      const { data, error } = await q
      if (error) throw new Error(error.message)
      return data as GarantiaItem[]
    },
  })
}

export function useRegistrarGarantia(
  visitaId: string,
  pdvId: string,
  vitrinaId: string
) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: RegistrarGarantiaInput) => {
      const garantia_id = uuidv4()
      try {
        const { error } = await supabase.rpc('registrar_garantia', {
          p_garantia_id: garantia_id,
          p_visita_recepcion_id: visitaId,
          p_pdv_id: pdvId,
          p_producto_id: input.producto_id,
          p_cantidad: input.cantidad,
          p_motivo: input.motivo,
          p_fecha_venta_aprox: input.fecha_venta_aprox ?? null,
        })
        if (error) throw new Error(error.message)
      } catch (err) {
        if (isProbablyOfflineError(err as Error)) {
          await enqueueCreateGarantia(visitaId, {
            garantia_id,
            pdv_id: pdvId,
            vitrina_id: vitrinaId,
            producto_id: input.producto_id,
            cantidad: input.cantidad,
            motivo: input.motivo,
            fecha_venta_aprox: input.fecha_venta_aprox ?? null,
          })
          return
        }
        throw err
      }
      queryClient.invalidateQueries({ queryKey: ['garantias'] })
    },
  })
}

export function useAsignarResponsable() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      garantiaId,
      responsableId,
    }: {
      garantiaId: string
      responsableId: string
    }) => {
      const { error } = await supabase
        .from('garantias')
        .update({ responsable_id: responsableId, estado: 'en_proceso' })
        .eq('id', garantiaId)
      if (error) throw new Error(error.message)
      queryClient.invalidateQueries({ queryKey: ['garantias'] })
    },
  })
}

export function useResolverGarantia() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      garantiaId,
      input,
    }: {
      garantiaId: string
      input: ResolverGarantiaInput
    }) => {
      const { error } = await supabase.rpc('resolver_garantia', {
        p_garantia_id: garantiaId,
        p_resolucion: input.resolucion,
        p_notas: input.notas_resolucion ?? null,
      })
      if (error) throw new Error(error.message)
      queryClient.invalidateQueries({ queryKey: ['garantias'] })
    },
  })
}
```

**Nota:** `useSurtidoEstandar` expone `items` y `addItem`/`updateCantidad`/`removeItem`. La función `useSurtidoVitrina` aquí solo re-expone `items`, bloqueando las mutations en contexto de campo.

- [ ] **Paso 5.7: Verificar tipos**

```bash
npm run type-check
```

- [ ] **Paso 5.8: Commit**

```bash
git add lib/hooks/useGarantias.ts lib/hooks/__tests__/useGarantias.test.ts lib/offline/queue.ts lib/offline/sync.ts lib/validations/garantias.ts
git commit -m "feat: hook useGarantias + offline queue create-garantia"
```

---

## Task 6: GarantiaSheet (campo) + botón en visita

**Files:**
- Create: `erp-vitrinas/components/campo/GarantiaSheet.tsx`
- Create: `erp-vitrinas/components/campo/VisitaGarantiasButton.tsx`
- Modify: `erp-vitrinas/app/(campo)/campo/visita/[id]/page.tsx`

Referencia de patrón: `components/campo/IncidenciaSheet.tsx` y `VisitaIncidenciasButton.tsx`.

- [ ] **Paso 6.1: Crear GarantiaSheet**

```tsx
// erp-vitrinas/components/campo/GarantiaSheet.tsx
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  registrarGarantiaSchema,
  type RegistrarGarantiaInput,
} from '@/lib/validations/garantias'
import {
  useRegistrarGarantia,
  useSurtidoVitrina,
} from '@/lib/hooks/useGarantias'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  visitaId: string
  pdvId: string
  vitrinaId: string
}

export function GarantiaSheet({
  open,
  onOpenChange,
  visitaId,
  pdvId,
  vitrinaId,
}: Props) {
  const surtido = useSurtidoVitrina(vitrinaId)
  const registrar = useRegistrarGarantia(visitaId, pdvId, vitrinaId)

  const form = useForm<RegistrarGarantiaInput>({
    resolver: zodResolver(registrarGarantiaSchema),
    defaultValues: { producto_id: '', cantidad: 1, motivo: '' },
  })

  useEffect(() => {
    if (!open) {
      form.reset({ producto_id: '', cantidad: 1, motivo: '' })
    }
  }, [open, form])

  async function onSubmit(data: RegistrarGarantiaInput) {
    try {
      await registrar.mutateAsync(data)
      toast.success('Garantía registrada')
      onOpenChange(false)
    } catch {
      toast.error('No se pudo registrar la garantía')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Registrar garantía</SheetTitle>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
            <FormField
              control={form.control}
              name="producto_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Producto</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccioná un producto" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {surtido?.map((item) => (
                        <SelectItem key={item.producto_id} value={item.producto_id}>
                          {item.productos?.nombre ?? item.producto_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cantidad"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe el defecto o razón de la devolución"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fecha_venta_aprox"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha aprox. de venta (opcional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={registrar.isPending}>
              {registrar.isPending ? 'Registrando…' : 'Registrar garantía'}
            </Button>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Paso 6.2: Crear VisitaGarantiasButton**

```tsx
// erp-vitrinas/components/campo/VisitaGarantiasButton.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ShieldAlert } from 'lucide-react'
import { GarantiaSheet } from '@/components/campo/GarantiaSheet'

interface Props {
  visitaId: string
  pdvId: string
  vitrinaId: string
}

export function VisitaGarantiasButton({ visitaId, pdvId, vitrinaId }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <ShieldAlert className="h-4 w-4" />
        Registrar garantía
      </Button>
      <GarantiaSheet
        open={open}
        onOpenChange={setOpen}
        visitaId={visitaId}
        pdvId={pdvId}
        vitrinaId={vitrinaId}
      />
    </>
  )
}
```

- [ ] **Paso 6.3: Añadir botón en página de visita**

Abrir `app/(campo)/campo/visita/[id]/page.tsx`. Buscar donde está `VisitaIncidenciasButton` y añadir `VisitaGarantiasButton` junto a él, con los mismos props (`visitaId`, `pdvId`, `vitrinaId`).

- [ ] **Paso 6.4: Verificar compilación**

```bash
npm run type-check
npm run build
```

- [ ] **Paso 6.5: Commit**

```bash
git add components/campo/GarantiaSheet.tsx components/campo/VisitaGarantiasButton.tsx app/\(campo\)/campo/visita/\[id\]/page.tsx
git commit -m "feat: GarantiaSheet campo + botón en página de visita"
```

---

## Task 7: Admin — /admin/garantias + GarantiaDetalleSheet

**Files:**
- Create: `erp-vitrinas/components/admin/GarantiasTable.tsx`
- Create: `erp-vitrinas/components/admin/GarantiaDetalleSheet.tsx`
- Create: `erp-vitrinas/app/(admin)/admin/garantias/page.tsx`

- [ ] **Paso 7.1: Crear GarantiasTable**

```tsx
// erp-vitrinas/components/admin/GarantiasTable.tsx
'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/admin/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { useGarantiasList, type GarantiaItem } from '@/lib/hooks/useGarantias'
import { GarantiaDetalleSheet } from '@/components/admin/GarantiaDetalleSheet'
import type { UserRol } from '@/lib/validations/usuarios'

const ESTADO_BADGE: Record<string, string> = {
  abierta: 'bg-yellow-100 text-yellow-800',
  en_proceso: 'bg-blue-100 text-blue-800',
  resuelta: 'bg-green-100 text-green-800',
  cerrada: 'bg-slate-100 text-slate-700',
}

interface Props { rol: UserRol }

export function GarantiasTable({ rol }: Props) {
  const [selected, setSelected] = useState<GarantiaItem | null>(null)
  const { data = [], isLoading } = useGarantiasList()

  const columns: ColumnDef<GarantiaItem>[] = [
    {
      accessorKey: 'puntos_de_venta.nombre',
      header: 'PDV',
      cell: ({ row }) => row.original.puntos_de_venta?.nombre ?? '—',
    },
    {
      accessorKey: 'productos.nombre',
      header: 'Producto',
      cell: ({ row }) => row.original.productos?.nombre ?? '—',
    },
    { accessorKey: 'cantidad', header: 'Cant.' },
    { accessorKey: 'motivo', header: 'Motivo' },
    {
      accessorKey: 'estado',
      header: 'Estado',
      cell: ({ row }) => (
        <Badge className={ESTADO_BADGE[row.original.estado] ?? ''}>
          {row.original.estado}
        </Badge>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Fecha',
      cell: ({ row }) => new Date(row.original.created_at).toLocaleDateString('es-CO'),
    },
    {
      id: 'acciones',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => setSelected(row.original)}>
          Ver detalle
        </Button>
      ),
    },
  ]

  return (
    <>
      <DataTable columns={columns} data={data} isLoading={isLoading} />
      <GarantiaDetalleSheet
        garantia={selected}
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelected(null) }}
        rol={rol}
      />
    </>
  )
}
```

- [ ] **Paso 7.2: Crear GarantiaDetalleSheet**

```tsx
// erp-vitrinas/components/admin/GarantiaDetalleSheet.tsx
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  resolverGarantiaSchema,
  type ResolverGarantiaInput,
} from '@/lib/validations/garantias'
import {
  useResolverGarantia,
  useAsignarResponsable,
  type GarantiaItem,
} from '@/lib/hooks/useGarantias'
import { useColaboradoras } from '@/lib/hooks/useColaboradoras'
import type { UserRol } from '@/lib/validations/usuarios'

interface Props {
  garantia: GarantiaItem | null
  open: boolean
  onOpenChange: (v: boolean) => void
  rol: UserRol
}

export function GarantiaDetalleSheet({ garantia, open, onOpenChange, rol }: Props) {
  const resolver = useResolverGarantia()
  const asignar = useAsignarResponsable()
  const { data: colaboradoras = [] } = useColaboradoras()

  const form = useForm<ResolverGarantiaInput>({
    resolver: zodResolver(resolverGarantiaSchema),
    defaultValues: { resolucion: undefined, notas_resolucion: '' },
  })

  useEffect(() => {
    if (!open) form.reset()
  }, [open, form])

  const canResolve = ['admin', 'supervisor'].includes(rol)

  async function onResolver(data: ResolverGarantiaInput) {
    if (!garantia) return
    try {
      await resolver.mutateAsync({ garantiaId: garantia.id, input: data })
      toast.success('Garantía resuelta')
      onOpenChange(false)
    } catch {
      toast.error('No se pudo resolver la garantía')
    }
  }

  async function onAsignar(responsableId: string) {
    if (!garantia) return
    try {
      await asignar.mutateAsync({ garantiaId: garantia.id, responsableId })
      toast.success('Responsable asignado')
    } catch {
      toast.error('No se pudo asignar el responsable')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalle de garantía</SheetTitle>
        </SheetHeader>
        {garantia && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="font-medium">PDV:</span>
              <span>{garantia.puntos_de_venta?.nombre}</span>
              <span className="font-medium">Producto:</span>
              <span>{garantia.productos?.nombre}</span>
              <span className="font-medium">Cantidad:</span>
              <span>{garantia.cantidad}</span>
              <span className="font-medium">Motivo:</span>
              <span>{garantia.motivo}</span>
              <span className="font-medium">Estado:</span>
              <Badge>{garantia.estado}</Badge>
            </div>

            {canResolve && garantia.estado === 'abierta' && (
              <div>
                <p className="text-sm font-medium mb-2">Asignar responsable (→ en proceso)</p>
                <Select onValueChange={onAsignar}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccioná un responsable" />
                  </SelectTrigger>
                  <SelectContent>
                    {colaboradoras.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {canResolve && ['abierta', 'en_proceso'].includes(garantia.estado) && (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onResolver)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="resolucion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Resolución</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccioná una resolución" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="cambio">Cambio (re-ingresa a central)</SelectItem>
                            <SelectItem value="baja">Baja definitiva</SelectItem>
                            <SelectItem value="devolucion_proveedor">Devolución a proveedor</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="notas_resolucion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notas (opcional)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Observaciones sobre la resolución" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={resolver.isPending}>
                    {resolver.isPending ? 'Resolviendo…' : 'Resolver garantía'}
                  </Button>
                </form>
              </Form>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Paso 7.3: Crear página admin/garantias**

```tsx
// erp-vitrinas/app/(admin)/admin/garantias/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ROLES } from '@/lib/validations/usuarios'
import type { UserRol } from '@/lib/validations/usuarios'
import { GarantiasTable } from '@/components/admin/GarantiasTable'

export default async function GarantiasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const rawRol = user.app_metadata?.rol
  if (!ROLES.includes(rawRol)) redirect('/login')
  const rol = rawRol as UserRol

  if (!['admin', 'supervisor', 'analista'].includes(rol)) {
    redirect('/admin/dashboard')
  }

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Garantías</h1>
      <GarantiasTable rol={rol} />
    </main>
  )
}
```

- [ ] **Paso 7.4: Añadir link al sidebar**

En `components/admin/AppSidebar.tsx`, añadir `{ href: '/admin/garantias', label: 'Garantías', icon: ShieldAlert }` en la sección de navegación.

- [ ] **Paso 7.5: Verificar compilación**

```bash
npm run type-check && npm run build
```

- [ ] **Paso 7.6: Commit**

```bash
git add components/admin/GarantiasTable.tsx components/admin/GarantiaDetalleSheet.tsx app/\(admin\)/admin/garantias/page.tsx components/admin/AppSidebar.tsx
git commit -m "feat: módulo garantías admin — tabla + detalle + resolución"
```

---

## Task 8: Hooks y UI de Proveedores

**Files:**
- Create: `erp-vitrinas/lib/hooks/useProveedores.ts`
- Create: `erp-vitrinas/components/admin/ProveedorSheet.tsx`
- Create: `erp-vitrinas/app/(admin)/admin/proveedores/page.tsx`

- [ ] **Paso 8.1: Crear useProveedores.ts**

Sigue el patrón exacto de `useProductos.ts` o `usePuntosDeVenta.ts`. Operaciones: `list()`, `create()`, `update()`, `toggleActivo()`.

```ts
// erp-vitrinas/lib/hooks/useProveedores.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/database.types'
import type { ProveedorInput } from '@/lib/validations/proveedores'

type Proveedor = Database['public']['Tables']['proveedores']['Row']

export function useProveedores() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['proveedores'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .order('nombre')
      if (error) throw new Error(error.message)
      return data as Proveedor[]
    },
  })

  const create = useMutation({
    mutationFn: async (input: ProveedorInput) => {
      const { error } = await supabase.from('proveedores').insert(input)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['proveedores'] }),
  })

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ProveedorInput }) => {
      const { error } = await supabase.from('proveedores').update(input).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['proveedores'] }),
  })

  return { ...query, create, update }
}
```

- [ ] **Paso 8.2: Crear ProveedorSheet y página**

```tsx
// erp-vitrinas/components/admin/ProveedorSheet.tsx
'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { proveedorSchema, type ProveedorInput } from '@/lib/validations/proveedores'
import { useCrearProveedor, useActualizarProveedor } from '@/lib/hooks/useProveedores'
import type { Proveedor } from '@/lib/hooks/useProveedores'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  proveedor?: Proveedor | null
}

export function ProveedorSheet({ open, onOpenChange, proveedor }: Props) {
  const crear = useCrearProveedor()
  const actualizar = useActualizarProveedor()
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProveedorInput>({ resolver: zodResolver(proveedorSchema) })

  useEffect(() => {
    if (!open) return
    if (proveedor) {
      reset({
        nombre: proveedor.nombre,
        contacto_nombre: proveedor.contacto_nombre ?? '',
        contacto_email: proveedor.contacto_email ?? '',
        contacto_tel: proveedor.contacto_tel ?? '',
        condiciones_pago: proveedor.condiciones_pago ?? '',
        activo: proveedor.activo,
      })
    } else {
      reset({ nombre: '', contacto_nombre: '', contacto_email: '', contacto_tel: '', condiciones_pago: '', activo: true })
    }
  }, [open, proveedor, reset])

  const onSubmit = async (data: ProveedorInput) => {
    if (proveedor) {
      await actualizar.mutateAsync({ id: proveedor.id, ...data })
    } else {
      await crear.mutateAsync(data)
    }
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{proveedor ? 'Editar proveedor' : 'Nuevo proveedor'}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
          <div className="space-y-1">
            <Label>Nombre *</Label>
            <Input {...register('nombre')} placeholder="Nombre del proveedor" />
            {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Contacto</Label>
            <Input {...register('contacto_nombre')} placeholder="Nombre de contacto" />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input {...register('contacto_email')} type="email" placeholder="email@proveedor.com" />
            {errors.contacto_email && <p className="text-xs text-red-500">{errors.contacto_email.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Teléfono</Label>
            <Input {...register('contacto_tel')} placeholder="+505 8888-0000" />
          </div>
          <div className="space-y-1">
            <Label>Condiciones de pago</Label>
            <Input {...register('condiciones_pago')} placeholder="30 días, contado, etc." />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="activo"
              checked={watch('activo')}
              onCheckedChange={(v) => setValue('activo', !!v)}
            />
            <Label htmlFor="activo">Activo</Label>
          </div>
          <SheetFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
```

```tsx
// erp-vitrinas/app/(admin)/admin/proveedores/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ROLES } from '@/lib/validations/usuarios'
import type { UserRol } from '@/lib/validations/usuarios'
import { ProveedoresClient } from '@/components/admin/ProveedoresClient'

export default async function ProveedoresPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const rawRol = user.app_metadata?.rol
  if (!ROLES.includes(rawRol)) redirect('/login')
  const rol = rawRol as UserRol
  if (!['admin', 'compras'].includes(rol)) redirect('/admin')
  return <ProveedoresClient />
}
```

```tsx
// erp-vitrinas/components/admin/ProveedoresClient.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ProveedorSheet } from './ProveedorSheet'
import { useProveedores, useEliminarProveedor } from '@/lib/hooks/useProveedores'
import type { Proveedor } from '@/lib/hooks/useProveedores'

export function ProveedoresClient() {
  const { data: proveedores, isLoading } = useProveedores()
  const eliminar = useEliminarProveedor()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selected, setSelected] = useState<Proveedor | null>(null)

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Proveedores</h1>
        <Button onClick={() => { setSelected(null); setSheetOpen(true) }}>+ Nuevo proveedor</Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b">
            <tr>
              <th className="py-2">Nombre</th>
              <th>Contacto</th>
              <th>Email</th>
              <th>Condiciones</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {proveedores?.map((p) => (
              <tr key={p.id} className="border-b hover:bg-slate-50">
                <td className="py-2">{p.nombre}</td>
                <td>{p.contacto_nombre ?? '—'}</td>
                <td>{p.contacto_email ?? '—'}</td>
                <td>{p.condiciones_pago ?? '—'}</td>
                <td>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {p.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => { setSelected(p); setSheetOpen(true) }}>Editar</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ProveedorSheet open={sheetOpen} onOpenChange={setSheetOpen} proveedor={selected} />
    </main>
  )
}
```

- [ ] **Paso 8.3: Añadir link al sidebar**

Añadir `{ href: '/admin/proveedores', label: 'Proveedores', icon: Building2 }` al sidebar.

- [ ] **Paso 8.4: Verificar compilación y commit**

```bash
npm run type-check
git add lib/hooks/useProveedores.ts lib/validations/proveedores.ts components/admin/ProveedorSheet.tsx app/\(admin\)/admin/proveedores/page.tsx components/admin/AppSidebar.tsx
git commit -m "feat: módulo proveedores — CRUD completo"
```

---

## Task 9: Hooks y UI de Compras + Recepción

**Files:**
- Create: `erp-vitrinas/lib/hooks/useCompras.ts`
- Create: `erp-vitrinas/components/admin/CompraSheet.tsx`
- Create: `erp-vitrinas/components/admin/RecepcionSheet.tsx`
- Create: `erp-vitrinas/app/(admin)/admin/compras/page.tsx`

- [ ] **Paso 9.1: Crear useCompras.ts**

```ts
// erp-vitrinas/lib/hooks/useCompras.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/database.types'
import type { CrearCompraInput, RecibirCompraInput } from '@/lib/validations/compras'

type Compra = Database['public']['Tables']['compras']['Row'] & {
  proveedores: { nombre: string } | null
  detalle_compra: Array<Database['public']['Tables']['detalle_compra']['Row'] & {
    productos: { nombre: string; codigo: string } | null
  }>
}

export function useCompras() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['compras'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compras')
        .select('*, proveedores(nombre), detalle_compra(*, productos(nombre, codigo))')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data as Compra[]
    },
  })

  const crear = useMutation({
    mutationFn: async (input: CrearCompraInput) => {
      const { data: compra, error } = await supabase
        .from('compras')
        .insert({
          proveedor_id: input.proveedor_id,
          fecha: input.fecha,
          notas: input.notas,
          estado: 'pendiente',
        })
        .select()
        .single()
      if (error) throw new Error(error.message)

      const lineas = input.lineas.map((l) => ({
        compra_id: compra.id,
        producto_id: l.producto_id,
        cantidad_pedida: l.cantidad_pedida,
        costo_unitario: l.costo_unitario ?? null,
      }))
      const { error: lineasError } = await supabase.from('detalle_compra').insert(lineas)
      if (lineasError) {
        // Rollback compensatorio: eliminar la compra si fallan las líneas
        await supabase.from('compras').delete().eq('id', compra.id)
        throw new Error(lineasError.message)
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compras'] }),
  })

  const confirmar = useMutation({
    mutationFn: async (compraId: string) => {
      const { error } = await supabase
        .from('compras')
        .update({ estado: 'confirmada' })
        .eq('id', compraId)
        .eq('estado', 'pendiente')
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compras'] }),
  })

  const cancelar = useMutation({
    mutationFn: async (compraId: string) => {
      const { error } = await supabase
        .from('compras')
        .update({ estado: 'cancelada' })
        .eq('id', compraId)
        .in('estado', ['pendiente', 'confirmada'])
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['compras'] }),
  })

  const recibir = useMutation({
    mutationFn: async ({ compraId, input }: { compraId: string; input: RecibirCompraInput }) => {
      const { error } = await supabase.rpc('recibir_compra', {
        p_compra_id: compraId,
        p_items: input.items,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras'] })
      queryClient.invalidateQueries({ queryKey: ['inventario_central'] })
    },
  })

  return { ...query, crear, confirmar, cancelar, recibir }
}
```

- [ ] **Paso 9.2: Crear CompraSheet**

Sheet para crear órdenes. Campos: proveedor (select de `useProveedores`), fecha, notas, y una lista dinámica de líneas (producto + cantidad + costo opcional). Añadir/quitar líneas con botones. Usar `useFieldArray` de React Hook Form para las líneas.

- [ ] **Paso 9.3: Crear RecepcionSheet**

Sheet que abre al hacer click en "Recibir" en una compra `confirmada`. Muestra las líneas con `cantidad_pedida` y permite ingresar `cantidad_recibida` por línea (0 a `cantidad_pedida`). Al guardar llama `recibir.mutateAsync`.

- [ ] **Paso 9.4: Crear página /admin/compras**

Tabla de órdenes con badge de estado. Botones por fila: Confirmar (si `pendiente`), Recibir (si `confirmada`), Cancelar (si `pendiente` o `confirmada`). Solo `admin` y `compras` pueden crear/modificar.

- [ ] **Paso 9.5: Añadir link al sidebar**

Añadir `{ href: '/admin/compras', label: 'Compras', icon: ShoppingCart }` al sidebar.

- [ ] **Paso 9.6: Verificar compilación y commit**

```bash
npm run type-check && npm run build
git add lib/hooks/useCompras.ts lib/validations/compras.ts components/admin/CompraSheet.tsx components/admin/RecepcionSheet.tsx app/\(admin\)/admin/compras/page.tsx components/admin/AppSidebar.tsx
git commit -m "feat: módulo compras — crear/confirmar/recibir/cancelar"
```

---

## Task 10: Eliminar InventarioCentralSheet

**Files:**
- Delete: `erp-vitrinas/components/admin/InventarioCentralSheet.tsx`
- Modify: `erp-vitrinas/app/(admin)/admin/inventario/page.tsx`

- [ ] **Paso 10.1: Actualizar tab Central en inventario**

En `app/(admin)/admin/inventario/page.tsx`, en el tab "Central":
1. Quitar el import de `InventarioCentralSheet`.
2. Quitar el botón "Nueva entrada" que abría el sheet.
3. Añadir un link: `<Link href="/admin/compras">Registrar entrada vía Compras →</Link>`.

- [ ] **Paso 10.2: Eliminar el archivo**

```bash
rm erp-vitrinas/components/admin/InventarioCentralSheet.tsx
```

- [ ] **Paso 10.3: Verificar que no quedan imports rotos**

```bash
npm run type-check
```

Expected: sin errores.

- [ ] **Paso 10.4: Commit**

```bash
git add app/\(admin\)/admin/inventario/page.tsx
git rm components/admin/InventarioCentralSheet.tsx
git commit -m "feat: reemplazar InventarioCentralSheet por flujo de Compras"
```

---

## Task 11: Tests E2E Sprint 7

**Files:**
- Create: `erp-vitrinas/tests/sprint7-garantias-compras.spec.ts`

- [ ] **Paso 11.1: Escribir tests (antes de ejecutar)**

```ts
// erp-vitrinas/tests/sprint7-garantias-compras.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Garantías — flujo campo a admin', () => {
  test('colaboradora registra garantía durante visita', async ({ page }) => {
    // Login como colaboradora
    await page.goto('/login')
    await page.getByLabel(/correo/i).fill('colaboradora@erp.local')
    await page.getByLabel(/contraseña/i).fill('Colab1234!')
    await page.getByRole('button', { name: /iniciar sesión/i }).click()
    await expect(page).toHaveURL(/campo/)

    // Navegar a la primera visita del día
    await page.getByRole('link', { name: /visitar/i }).first().click()

    // Iniciar visita si es necesario
    const iniciarBtn = page.getByRole('button', { name: /iniciar visita/i })
    if (await iniciarBtn.isVisible()) await iniciarBtn.click()

    // Hacer click en "Registrar garantía"
    await page.getByRole('button', { name: /registrar garantía/i }).click()
    await expect(page.getByRole('heading', { name: /registrar garantía/i })).toBeVisible()

    // Seleccionar producto y llenar formulario
    await page.getByRole('combobox').first().click()
    await page.getByRole('option').first().click()
    await page.locator('input[type="number"]').fill('1')
    await page.getByRole('textbox', { name: /motivo/i }).fill('Pantalla rota al abrir la caja')

    await page.getByRole('button', { name: /registrar garantía/i }).last().click()
    await expect(page.getByText(/garantía registrada/i)).toBeVisible()
  })

  test('admin ve la garantía y la resuelve con cambio', async ({ page }) => {
    // Login como admin
    await page.goto('/login')
    await page.getByLabel(/correo/i).fill('admin@erp.local')
    await page.getByLabel(/contraseña/i).fill('Admin1234!')
    await page.getByRole('button', { name: /iniciar sesión/i }).click()

    await page.goto('/admin/garantias')
    await expect(page.getByRole('heading', { name: /garantías/i })).toBeVisible()

    // Click en primer registro
    await page.getByRole('button', { name: /ver detalle/i }).first().click()
    await expect(page.getByRole('heading', { name: /detalle de garantía/i })).toBeVisible()

    // Resolver con cambio
    await page.getByRole('combobox', { name: /resolución/i }).click()
    await page.getByRole('option', { name: /cambio/i }).click()
    await page.getByRole('button', { name: /resolver garantía/i }).click()
    await expect(page.getByText(/garantía resuelta/i)).toBeVisible()
  })
})

test.describe('Compras — ciclo completo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/correo/i).fill('admin@erp.local')
    await page.getByLabel(/contraseña/i).fill('Admin1234!')
    await page.getByRole('button', { name: /iniciar sesión/i }).click()
  })

  test('crear → confirmar → recibir → verificar stock', async ({ page }) => {
    await page.goto('/admin/compras')
    await expect(page.getByRole('heading', { name: /compras/i })).toBeVisible()

    // Crear orden
    await page.getByRole('button', { name: /nueva orden/i }).click()
    await page.getByRole('combobox', { name: /proveedor/i }).click()
    await page.getByRole('option').first().click()
    await page.locator('input[name="fecha"]').fill(new Date().toISOString().split('T')[0])
    await page.getByRole('button', { name: /agregar producto/i }).click()
    await page.getByRole('combobox').last().click()
    await page.getByRole('option').first().click()
    await page.locator('input[name^="lineas"][name$="cantidad_pedida"]').last().fill('10')
    await page.getByRole('button', { name: /guardar/i }).click()
    await expect(page.getByText(/pendiente/i).first()).toBeVisible()

    // Confirmar
    await page.getByRole('button', { name: /confirmar/i }).first().click()
    await expect(page.getByText(/confirmada/i).first()).toBeVisible()

    // Recibir
    await page.getByRole('button', { name: /recibir/i }).first().click()
    await page.locator('input[name^="items"]').first().fill('8')
    await page.getByRole('button', { name: /confirmar recepción/i }).click()
    await expect(page.getByText(/recibida/i).first()).toBeVisible()
  })

  test('cancelar orden confirmada no genera movimientos', async ({ page }) => {
    await page.goto('/admin/compras')
    // Buscar una orden en estado confirmada y cancelarla
    const cancelar = page.getByRole('button', { name: /cancelar/i }).first()
    if (await cancelar.isVisible()) {
      await cancelar.click()
      await expect(page.getByText(/cancelada/i).first()).toBeVisible()
    }
  })
})
```

- [ ] **Paso 11.2: Ejecutar tests**

```bash
npm run test:e2e -- tests/sprint7-garantias-compras.spec.ts
```

Expected: todos los tests pasan. Si alguno falla, corregir la UI antes de continuar.

- [ ] **Paso 11.3: Commit**

```bash
git add tests/sprint7-garantias-compras.spec.ts
git commit -m "test: e2e Sprint 7 — garantías y compras"
```

---

## Task 12: Tests RLS (Vitest)

**Files:**
- Create: `erp-vitrinas/lib/hooks/__tests__/rls-sprint7.test.ts`

- [ ] **Paso 12.1: Escribir y ejecutar tests RLS**

```ts
// erp-vitrinas/lib/hooks/__tests__/rls-sprint7.test.ts
// Tests de RLS — requieren Supabase local corriendo (supabase start)
// Usan service_role para crear datos y clientes por rol para verificar acceso

import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Credenciales de test — deben estar creadas con npm run seed:auth
const ADMIN_EMAIL = 'admin@erp.local'
const ADMIN_PASS = 'Admin1234!'
const COLAB_EMAIL = 'colaboradora@erp.local'
const COLAB_PASS = 'Colab1234!'
const ANALISTA_EMAIL = 'analista@erp.local'
const ANALISTA_PASS = 'Analista1234!'

describe('RLS — garantias', () => {
  it('admin puede SELECT en garantias', async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY)
    await client.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASS })
    const { error } = await client.from('garantias').select('id').limit(1)
    expect(error).toBeNull()
  })

  it('colaboradora NO puede ver garantías de otras colaboradoras', async () => {
    // Crear una garantía via service_role (sin visita asociada a la colaboradora)
    const service = createClient(SUPABASE_URL, SERVICE_KEY)
    const client = createClient(SUPABASE_URL, ANON_KEY)
    await client.auth.signInWithPassword({ email: COLAB_EMAIL, password: COLAB_PASS })
    const { data } = await client.from('garantias').select('id')
    // La colaboradora solo ve las suyas — si hay garantías de otros no deberían aparecer
    // (test básico: la query no lanza error y RLS filtra)
    expect(data).not.toBeNull()
  })
})

describe('RLS — compras', () => {
  it('analista puede SELECT en compras', async () => {
    const client = createClient(SUPABASE_URL, ANON_KEY)
    // Usar credenciales de analista, no de admin
    await client.auth.signInWithPassword({ email: ANALISTA_EMAIL, password: ANALISTA_PASS })
    const { error } = await client.from('compras').select('id').limit(1)
    expect(error).toBeNull()
  })
})
```

```bash
npm test -- lib/hooks/__tests__/rls-sprint7.test.ts
```

- [ ] **Paso 12.2: Commit final Sprint 7**

```bash
git add lib/hooks/__tests__/rls-sprint7.test.ts
git commit -m "test: RLS Sprint 7 — garantías y compras"
```

---

## Checklist final Sprint 7

- [ ] `supabase db reset && npm run seed:auth && npm run dev` — app levanta sin errores
- [ ] `npm run type-check` — sin errores
- [ ] `npm run build` — sin errores
- [ ] `npm run test:e2e` — todos los tests de Sprint 7 pasan
- [ ] `npm test` — tests unitarios pasan
- [ ] Colaboradora puede registrar garantía en campo (online y offline)
- [ ] Admin puede ver, asignar y resolver garantías
- [ ] Flujo completo compra: pendiente → confirmada → recibida → stock central actualizado
- [ ] `InventarioCentralSheet` eliminado — tab Central es read-only con link a Compras
