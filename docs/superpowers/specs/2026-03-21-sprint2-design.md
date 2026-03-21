# Sprint 2 Design — Vitrinas + Inventario Central + Rutas

**Fecha:** 2026-03-21
**Sprint:** 2
**HUs cubiertas:** HU-09, HU-10, HU-11, HU-12, HU-13, HU-25
**Tareas SPRINTS.md:** S2-01 a S2-07

---

## Contexto

El Sprint 2 añade los módulos que permiten configurar la red de distribución completa: vitrinas (dónde están los productos), inventario central (de dónde salen), y rutas (quién visita qué PDVs y en qué orden). Sin estos módulos, el flujo de visita del Sprint 3 no puede funcionar.

## Decisiones de diseño adoptadas

1. **Ordenamiento de PDVs en rutas:** drag & drop con `dnd-kit` (opción elegida vs botones ↑↓ o número editable). Las rutas tienen ~8–15 PDVs y se editan en desktop, por lo que DnD es la UX más fluida.
2. **Surtido estándar:** página de detalle con tabs (`/admin/vitrinas/[id]`) en vez de sheet o fila expandible. El surtido tiene 5–20 productos y S2-02 + S2-03 comparten la misma pantalla.

---

## Módulos

### 1. Vitrinas

#### 1.1 Listado — `/admin/vitrinas`

- `DataTable` con columnas: Código, PDV (nombre comercial), Zona, Estado (badge con colores: activa=verde, inactiva=amarillo, retirada=gris), acciones
- Acciones por fila: **Ver detalle** (navega a `/admin/vitrinas/[id]`), **Editar** (abre sheet), **Retirar** (solo visible si estado ≠ retirada; muestra dialog de confirmación idéntico al del Tab Info)
- Búsqueda por código o nombre de PDV; filtro por estado
- Botón "Nueva vitrina" → sheet de creación

#### 1.2 Sheet crear/editar

Campos:
- `codigo` — string único, requerido
- `pdv_id` — select de PDVs activos, requerido
- `estado` — select: activa / inactiva (al crear siempre activa; al editar editable)

Validación Zod en `lib/validations/vitrinas.ts`. Hook `useVitrinas` en `lib/hooks/useVitrinas.ts`.

#### 1.3 Página de detalle — `/admin/vitrinas/[id]`

Tres tabs:

**Tab "Info"**
- Datos de solo lectura: Código, PDV, Zona, Estado, fecha de creación
- Botón "Editar" → abre sheet de edición
- Botón "Marcar como retirada" (visible solo si estado ≠ retirada) → dialog de confirmación → mutation que actualiza `estado = 'retirada'`

**Tab "Surtido estándar"** (S2-02)
- Tabla: Producto, Cantidad objetivo, acciones (editar cantidad, quitar)
- Botón "Agregar producto" → select de productos activos + input de cantidad objetivo → insert en `surtido_estandar`
- Editar cantidad: input inline o sheet mini
- Quitar: elimina fila de `surtido_estandar`
- Hook: `useSurtidoEstandar(vitrinaId)`

**Tab "Inventario actual"** (S2-03)
- Tabla de solo lectura: Producto, Cantidad objetivo, Stock actual, Diferencia (objetivo − stock), Estado (badge: OK si stock ≥ objetivo, Bajo si stock < objetivo pero > 0, Vacío si stock = 0)
- Colores: verde OK, naranja Bajo, rojo Vacío
- Solo lectura — el stock lo actualizan los triggers de visita
- Hook: `useInventarioVitrina(vitrinaId)` → join `inventario_vitrina` con `surtido_estandar`

#### 1.4 Marcar vitrina como retirada (S2-04)

- Acción disponible en Tab Info de la página de detalle y en la columna de acciones del listado
- Dialog de confirmación: "¿Seguro que deseas retirar esta vitrina? Esta acción no se puede deshacer."
- Mutation: `UPDATE vitrinas SET estado = 'retirada' WHERE id = ?`
- Una vez retirada, no aparece en opciones de PDV para nuevas vitrinas ni en el flujo de visita

---

### 2. Inventario Central (S2-05)

#### 2.1 Listado — `/admin/inventario`

- `DataTable`: Producto, Categoría, Stock actual, Costo unitario, Valor total (stock × costo)
- Búsqueda por producto; filtro por categoría
- Botón "Registrar entrada" → sheet

#### 2.2 Sheet "Registrar entrada por compra"

Campos:
- `producto_id` — select de productos activos, requerido
- `cantidad` — número entero > 0, requerido
- `costo_unitario` — decimal opcional (se guarda en el movimiento para auditoría; el trigger no actualiza `costo_promedio` automáticamente)
- `notas` — texto opcional (puede incluir número de factura)

Al confirmar, insert en `movimientos_inventario` con:
```
tipo           = 'compra'
direccion      = 'entrada'
destino_tipo   = 'central'
producto_id    = <seleccionado>
cantidad       = <ingresada>
costo_unitario = <opcional>
```
El trigger `actualizar_inventario()` actualiza `inventario_central.cantidad_actual` automáticamente.
Invalidar query de inventario central.

Hook: `useInventarioCentral` en `lib/hooks/useInventarioCentral.ts`.

---

### 3. Rutas (S2-06 y S2-07)

#### 3.1 Listado — `/admin/rutas`

- `DataTable`: Código, Nombre, Colaboradora asignada, Zona, Nº PDVs, Días de visita, Estado (badge), acciones (editar, desactivar)
- Búsqueda por código o nombre; filtro por estado, colaboradora, zona

#### 3.2 Sheet crear/editar ruta

Sheet con **dos tabs**:

**Tab "Datos"**
- `codigo` — string único, requerido
- `nombre` — string, requerido
- `colaboradora_id` — select de usuarios con rol `colaboradora` y activos, requerido
- `zona_id` — select de zonas, opcional
- `frecuencia` — select: diaria / semanal / quincenal
- `dias_visita` — checkboxes: Lun, Mar, Mié, Jue, Vie, Sáb, Dom (array de strings)
- `estado` — select: activa / inactiva

**Tab "PDVs"**
- Layout de dos columnas:
  - **Izquierda:** PDVs disponibles (no asignados a esta ruta) con búsqueda. Click en un PDV lo agrega a la ruta al final de la lista
  - **Derecha:** PDVs en la ruta, ordenados por `orden_visita`. Cada ítem tiene handle de drag. Botón × para quitar. La lista es sortable con `@dnd-kit/core` + `@dnd-kit/sortable`
- El orden se persiste como array de `{ pdv_id, orden_visita }` al guardar
- Al guardar: delete + re-insert de `rutas_pdv` para la ruta. Esto re-crea los registros, perdiendo `created_at` de cada PDV-ruta — aceptable para Sprint 2 ya que `rutas_pdv` no tiene auditoría individual requerida

Hook: `useRutas` en `lib/hooks/useRutas.ts`.

---

## Hooks nuevos (resumen)

| Hook | Archivo | Operaciones |
|------|---------|-------------|
| `useVitrinas` | `lib/hooks/useVitrinas.ts` | list, create, update, retiro |
| `useSurtidoEstandar` | `lib/hooks/useSurtidoEstandar.ts` | list by vitrina, add, update cantidad, remove |
| `useInventarioVitrina` | `lib/hooks/useInventarioVitrina.ts` | list by vitrina (join con surtido) |
| `useInventarioCentral` | `lib/hooks/useInventarioCentral.ts` | list, registrar entrada |
| `useRutas` | `lib/hooks/useRutas.ts` | list, create, update (con PDVs) |
| `useColaboradoras` | `lib/hooks/useColaboradoras.ts` | list usuarios con rol colaboradora (para selects) |

> `useZonas` ya existe del Sprint 1.

---

## Dependencias nuevas

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Solo para el módulo de Rutas (ordenamiento de PDVs).

---

## Estructura de archivos nuevos

```
erp-vitrinas/
  app/(admin)/admin/
    vitrinas/
      page.tsx                    # Listado
      [id]/page.tsx               # Detalle con tabs
    inventario/
      page.tsx                    # Inventario central
    rutas/
      page.tsx                    # Listado de rutas
  components/admin/
    VitrinaSheet.tsx              # Sheet crear/editar vitrina
    SurtidoEstandarTab.tsx        # Tab surtido en página detalle
    InventarioVitrinaTab.tsx      # Tab inventario actual
    InventarioCentralSheet.tsx    # Sheet entrada por compra
    RutaSheet.tsx                 # Sheet crear/editar ruta (con DnD)
    PDVSortableList.tsx           # Lista DnD de PDVs en ruta
  lib/
    hooks/
      useVitrinas.ts
      useSurtidoEstandar.ts
      useInventarioVitrina.ts
      useInventarioCentral.ts
      useRutas.ts
      useColaboradoras.ts
    validations/
      vitrinas.ts                 # Ya existe como stub
      rutas.ts                    # Ya existe como stub
      inventario.ts               # Nuevo
```

---

## Navegación (AppSidebar)

Añadir tres items al sidebar admin:
- Vitrinas → `/admin/vitrinas`
- Inventario → `/admin/inventario`
- Rutas → `/admin/rutas`

---

## Reglas de negocio relevantes

- Una vitrina retirada no puede tener nuevas visitas ni aparecer en selects de nuevas vitrinas
- El stock de `inventario_central` no puede ser negativo (trigger `validar_stock_no_negativo`)
- `surtido_estandar` tiene constraint `UNIQUE(vitrina_id, producto_id)` — no puede haber dos líneas del mismo producto en el surtido de una vitrina
- `rutas_pdv` tiene constraint `UNIQUE(ruta_id, pdv_id)` — un PDV no puede estar dos veces en la misma ruta
- Los productos inactivos no deben aparecer en los selects de surtido estándar

---

## Tests e2e (Playwright)

Cubrir en `tests/sprint2.spec.ts`:
1. Crear vitrina, asignarla a un PDV
2. Agregar productos al surtido estándar con cantidad objetivo
3. Ver tab de inventario actual
4. Marcar vitrina como retirada
5. Registrar entrada al inventario central
6. Crear ruta, agregar PDVs, reordenar con DnD
7. Verificar que la ruta aparece en el listado con el número correcto de PDVs
