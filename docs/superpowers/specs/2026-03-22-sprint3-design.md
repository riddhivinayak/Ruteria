# Sprint 3 Design — Ruta del Día + Inicio de Visita

**Fecha:** 2026-03-22
**Sprint:** 3
**HUs cubiertas:** HU-14, HU-15, HU-16, HU-17, HU-18, HU-19
**Tareas SPRINTS.md:** S3-01 a S3-06

---

## Contexto

Sprint 3 implementa el flujo de visita de campo para colaboradoras y el dashboard de seguimiento para admin. Depende de Sprint 2 (Vitrinas, Inventario Central, Rutas).

El sprint termina cuando la colaboradora puede ver su ruta, iniciar una visita, ingresar conteos y ver el monto total a cobrar. El cobro y cierre de visita son Sprint 4.

---

## Prerrequisito — estado de ramas

Sprint 2 está en `feature/sprint2-vitrinas-inventario-rutas`. Antes de iniciar, confirmar si ya fue mergeado a `main`. Crear rama `feature/sprint3-visitas-campo` desde `main` (si Sprint 2 ya mergeado) o desde `feature/sprint2-vitrinas-inventario-rutas` (si no). **Primer paso obligatorio de implementación: eliminar el stub `erp-vitrinas/app/(campo)/ruta-del-dia/page.tsx`** — ese archivo genera la URL incorrecta `/ruta-del-dia` en lugar de `/campo/ruta-del-dia` y causaría conflicto silencioso.

---

## Decisiones de diseño adoptadas

1. **Generación de visitas planificadas:** Edge Function cron a las 5am usando `SUPABASE_SERVICE_ROLE_KEY` (bypasa RLS). Idempotente.
2. **Flujo campo:** Página única por PDV. No wizard.
3. **Reasignación temporal:** Sobreescribir `rutas.colaboradora_id` + campo `nota_reasignacion` libre. Sin tabla nueva.
4. **Dashboard admin:** Página dedicada `/admin/visitas` con filtros.
5. **guardarConteo — sin optimistic update:** La colaboradora guarda el conteo completo en un solo submit. Se muestra estado de carga (spinner). No optimistic update — el round trip inserta múltiples `detalle_visita` y el total definitivo viene del trigger; un optimistic parcial generaría inconsistencias.

---

## Módulos

### 1. Edge Function — Generación de visitas diarias (prereq de S3-01)

**Archivo:** `supabase/functions/generar-visitas-diarias/index.ts`

**Lógica:**
1. Determinar el día de semana actual (lun–dom).
2. Buscar rutas `activas` cuyo array `dias_visita` incluye el día actual.
3. Por cada ruta, obtener sus PDVs activos (`rutas_pdv` JOIN `puntos_de_venta` donde `activo = true`).
4. Por cada PDV, buscar la vitrina con `estado = 'activa'` asignada a ese PDV.
5. Idempotente: verificar si ya existe `visita` con `estado = 'planificada'` AND `created_at::date = hoy` AND `(pdv_id, vitrina_id, colaboradora_id)` = los valores a insertar.
6. Insertar con `estado = 'planificada'`, `ruta_id`, `pdv_id`, `vitrina_id`, `colaboradora_id`.

**Auth y RLS:** La función usa el cliente Supabase con `SUPABASE_SERVICE_ROLE_KEY`, que bypasa RLS por completo. No se necesita ninguna política adicional en `visitas` para que la función inserte — la política existente `visitas_insert` (solo `colaboradora`) no aplica al service role.

> **Guard obligatorio:** Al inicio de `index.ts`, verificar que `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` no sea undefined. Si falta, retornar HTTP 500 inmediatamente — nunca caer back al anon key, que sí estaría bloqueado por RLS.

**Programación:** Cron `0 5 * * *` en el archivo de proyecto `supabase/config.toml`, sección `[functions.generar-visitas-diarias]`. No hay `config.toml` dentro de la carpeta de la función.

---

### 2. Vista campo — Ruta del día (S3-01)

**Ruta:** `/campo/ruta-del-dia`
**Archivo:** `app/(campo)/campo/ruta-del-dia/page.tsx` (nuevo)

> **Primer paso de implementación:** eliminar `app/(campo)/ruta-del-dia/page.tsx` (stub con URL incorrecta).

Muestra las visitas del día de la colaboradora autenticada, ordenadas por `rutas_pdv.orden_visita`.

**Layout (móvil-first):**
- Header: nombre de la ruta + fecha + contador "X/Y completadas"
- Lista de tarjetas `RutaDelDiaCard` por PDV:
  - Número de orden, nombre del PDV, dirección
  - Badge de estado: `planificada` (gris) | `en_ejecucion` (azul) | `completada` (verde) | `no_realizada` (rojo)
  - Si `completada`: hora de fin y monto calculado
  - Si `en_ejecucion`: botón "Continuar visita →"
  - Si `planificada`: tap navega a `/campo/visita/[id]`

**Hook:** `useRutaDelDia()` en `lib/hooks/useRutaDelDia.ts`

Query: `visitas` donde:
```
colaboradora_id = auth.uid()
AND (
  (estado = 'planificada' AND created_at::date = today)
  OR (estado IN ('en_ejecucion', 'completada', 'no_realizada')
      AND fecha_hora_inicio IS NOT NULL
      AND fecha_hora_inicio::date = today)
)
```
> `fecha_hora_inicio` es nullable. El guard `IS NOT NULL` es obligatorio para evitar errores de cast en visitas con estado inconsistente.
JOIN con `puntos_de_venta`, `rutas_pdv` (para `orden_visita`), `rutas` (para nombre de ruta).

---

### 3. Vista campo — Detalle de visita (S3-04, S3-05, S3-06)

**Ruta:** `/campo/visita/[id]`
**Archivo:** `app/(campo)/campo/visita/[id]/page.tsx`

La página tiene **dos estados** según `visita.estado`:

#### Estado `planificada` — Pantalla de inicio (S3-04)

- Nombre del PDV y vitrina
- Tabla de inventario anterior (solo lectura): Producto | Cantidad anterior
  - Lista de productos viene de `surtido_estandar WHERE vitrina_id = visita.vitrina_id`
  - `inv_anterior` se lee de `inventario_vitrina.cantidad_actual` (LEFT JOIN por `vitrina_id + producto_id`). Si no existe fila → `0` (primera visita a vitrina nueva — business rule 6 de CLAUDE.md)
- Botón **"Iniciar visita"**: mutation → `visitas.estado = 'en_ejecucion'`, `fecha_hora_inicio = now()`
- Botón secundario **"Marcar como no realizada"**: abre input de motivo (requerido, validación client-side y en la mutation) → `estado = 'no_realizada'`, `motivo_no_realizada = <texto>`

#### Estado `en_ejecucion` — Pantalla de conteo (S3-05 + S3-06)

- **Lista de productos:** siempre desde `surtido_estandar WHERE vitrina_id = visita.vitrina_id`. Los `detalle_visita` existentes se LEFT JOIN por `producto_id` para pre-rellenar `inv_actual` si ya se guardó un conteo parcial.
- **Tabla editable:** Producto | Ant | Act (input numérico) | Ventas (`ant - act`, calculado en tiempo real) | Subtotal (`ventas × precio_unitario`)
  - `precio_unitario` se lee de `productos.precio_venta`
  - `inv_anterior` desde `inventario_vitrina.cantidad_actual` (o `0` si no existe)
  - `unidades_vendidas` y `subtotal` se calculan live en el cliente; el trigger los confirma en la BD
- **Total a cobrar** (suma de subtotales): actualizado en tiempo real
- **Botón "Guardar conteo":** spinner mientras procesa. Upsert de `detalle_visita` para todos los productos del surtido:
  ```
  INSERT INTO detalle_visita (visita_id, producto_id, inv_anterior, inv_actual, precio_unitario)
  VALUES (...)
  ON CONFLICT (visita_id, producto_id)
  DO UPDATE SET inv_actual = EXCLUDED.inv_actual,
                precio_unitario = EXCLUDED.precio_unitario,
                inv_anterior = EXCLUDED.inv_anterior
  ```
  `precio_unitario` debe incluirse en el `DO UPDATE SET` para reflejar el precio actual al re-guardar.
- Al guardar exitosamente: navega de vuelta a `/campo/ruta-del-dia`

**Validaciones (cliente):**
- `inv_actual` ≥ 0
- Todos los productos del surtido estándar deben tener `inv_actual` ingresado (campo no vacío) antes de poder guardar

**RLS para detalle_visita UPDATE:**
- El upsert necesita política UPDATE en `detalle_visita` (ver migración).
- La política restringe a la colaboradora dueña de la visita padre (no a cualquier colaboradora).

**Hook:** `useVisita(id)` en `lib/hooks/useVisita.ts`
- Lee `visitas` + `surtido_estandar` (por `vitrina_id`) + `productos` + `inventario_vitrina` + LEFT JOIN `detalle_visita`
- Mutaciones: `iniciarVisita`, `guardarConteo`, `marcarNoRealizada`

**RLS — inventario_vitrina:** La política existente `inv_vitrina_select` permite lectura a todos los `authenticated`. No se necesita política de escritura para la colaboradora — el stock se actualiza via triggers de `movimientos_inventario` (Sprint 4), no directamente.

---

### 4. Vista admin — Visitas (S3-02)

**Ruta:** `/admin/visitas`
**Archivo:** `app/(admin)/admin/visitas/page.tsx`

`DataTable` con columnas: Fecha | Ruta | Colaboradora | PDV | Vitrina | Estado (badge) | Monto calculado

**Filtros:**
- Rango de fechas (por defecto: hoy)
- Ruta (select)
- Colaboradora (select)
- Estado (multiselect: planificada, en_ejecucion, completada, no_realizada)

Solo lectura. Sin acciones.

**Hook:** `useVisitas()` en `lib/hooks/useVisitas.ts` — query paginada (50), filtros.

---

### 5. Reasignación temporal de ruta (S3-03)

Agregar campo `nota_reasignacion` (textarea opcional) al `RutaSheet` existente, debajo del select de `colaboradora_id`. Placeholder: "Motivo del cambio de colaboradora (opcional)".

---

## Migraciones

**`20260011_nota_reasignacion_rutas.sql`**
```sql
ALTER TABLE rutas ADD COLUMN IF NOT EXISTS nota_reasignacion TEXT;
```

**`20260012_detalle_visita_update_policy.sql`**
```sql
-- Política UPDATE faltante en detalle_visita.
-- Necesaria para que el upsert (INSERT ... ON CONFLICT DO UPDATE) funcione.
-- Restringe a la colaboradora dueña de la visita padre o admin.
CREATE POLICY "detalle_visita_update" ON detalle_visita
  FOR UPDATE TO authenticated
  USING (
    get_my_rol() = 'admin'
    OR EXISTS (
      SELECT 1 FROM visitas v
      WHERE v.id = detalle_visita.visita_id
        AND v.colaboradora_id = auth.uid()
    )
  )
  WITH CHECK (
    get_my_rol() = 'admin'
    OR EXISTS (
      SELECT 1 FROM visitas v
      WHERE v.id = detalle_visita.visita_id
        AND v.colaboradora_id = auth.uid()
    )
  );
```

---

## Hooks nuevos

| Hook | Archivo | Operaciones |
|------|---------|-------------|
| `useRutaDelDia` | `lib/hooks/useRutaDelDia.ts` | list visitas del día para colaboradora autenticada |
| `useVisita` | `lib/hooks/useVisita.ts` | get visita + surtido + inventario + detalle; iniciarVisita, guardarConteo, marcarNoRealizada |
| `useVisitas` | `lib/hooks/useVisitas.ts` | list visitas paginada con filtros (admin) — reemplaza stub |

> `useRutas` y `useColaboradoras` ya existen de Sprint 2.

---

## Archivos nuevos

```
erp-vitrinas/
  app/(campo)/campo/
    ruta-del-dia/
      page.tsx
    visita/
      [id]/page.tsx
  app/(admin)/admin/
    visitas/
      page.tsx
  components/campo/
    RutaDelDiaCard.tsx
    VisitaInicioView.tsx
    VisitaConteoView.tsx
    ConteoTable.tsx
  components/admin/
    VisitasTable.tsx
  lib/hooks/
    useRutaDelDia.ts
    useVisita.ts
    useVisitas.ts                        # Reemplaza stub
  supabase/
    migrations/
      20260011_nota_reasignacion_rutas.sql
      20260012_detalle_visita_update_policy.sql
    functions/
      generar-visitas-diarias/
        index.ts
  tests/
    sprint3.spec.ts
```

## Archivos modificados / eliminados

| Archivo | Cambio |
|---------|--------|
| `app/(campo)/ruta-del-dia/page.tsx` | **ELIMINAR** — stub con URL incorrecta |
| `supabase/config.toml` | Agregar `[functions.generar-visitas-diarias]` con `schedule = "0 5 * * *"` |
| `components/admin/RutaSheet.tsx` | Agregar campo `nota_reasignacion` |
| `lib/hooks/useRutas.ts` | Incluir `nota_reasignacion` en update mutation |
| `lib/validations/rutas.ts` | Agregar `nota_reasignacion` opcional al schema |
| `components/admin/AppSidebar.tsx` | Agregar item "Visitas" → `/admin/visitas` |
| `lib/supabase/database.types.ts` | Regenerar tras migraciones |

---

## Reglas de negocio

- Una visita `planificada` solo puede iniciarla la colaboradora asignada (`colaboradora_id = auth.uid()`). Aplicado por RLS.
- `inv_actual` ≥ 0.
- Primera visita a vitrina nueva: `inv_anterior = 0` si no existe fila en `inventario_vitrina`.
- No se puede guardar conteo si algún producto del surtido no tiene `inv_actual` ingresado.
- Cron no duplica: verifica `(pdv_id, vitrina_id, colaboradora_id)` con `estado = 'planificada'` y `created_at::date = hoy`.
- Vitrinas `retirada` o PDVs inactivos no generan visitas planificadas.
- `precio_unitario` en `detalle_visita` = `productos.precio_venta` al momento de guardar; debe incluirse en el `ON CONFLICT DO UPDATE SET`.
- `marcarNoRealizada` requiere motivo no vacío (validación cliente y en la mutation).
- **Backlog de seguridad:** La política `detalle_visita_insert` existente no verifica que `visita_id` pertenezca a la colaboradora autenticada. No es bloqueante para Sprint 3 (la UI solo muestra las visitas propias), pero debe corregirse antes de producción.

---

## Tests e2e — `tests/sprint3.spec.ts`

**Seeding:** Los tests de campo (casos 1–6) requieren visitas con `estado = 'planificada'` preexistentes. El seed de Playwright (`tests/sprint3.spec.ts` → `beforeAll`) debe insertar directamente en la BD las visitas planificadas de prueba vía el cliente Supabase con service role — no invocar el cron. El seed de datos de `20260010_seed.sql` ya crea rutas, PDVs y vitrinas de prueba; el `beforeAll` del test crea las `visitas planificadas` para `hoy` referenciando esos datos.

1. Colaboradora ve su ruta del día con PDVs en el orden correcto.
2. Tap en PDV `planificada` → muestra pantalla de inicio con `inv_anterior` por producto.
3. Iniciar visita → estado cambia a `en_ejecucion`; la UI muestra la hora de inicio formateada y `useVisita` retorna `estado = 'en_ejecucion'` con `fecha_hora_inicio` no nulo.
4. Ingreso de conteos → cálculo live de unidades vendidas y total a cobrar se actualiza en tiempo real.
5. Guardar conteo → spinner → regresa a ruta del día, PDV muestra badge `en_ejecucion`.
6. Marcar PDV como no realizada sin motivo → muestra error de validación; con motivo → estado `no_realizada`.
7. Admin ve las visitas del día en `/admin/visitas` con filtro de fecha por defecto.
8. Admin edita ruta, cambia colaboradora y guarda nota de motivo; la nota persiste al reabrir el sheet.
