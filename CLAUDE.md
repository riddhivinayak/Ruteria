# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ERP-CRM system for managing electronic accessories in consignment display cases ("vitrinas"). The business places displays in 200+ retail stores; field workers ("colaboradoras") visit stores daily to count inventory, collect payments, and restock. This replaces a fully manual process.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TailwindCSS v4, shadcn/ui
- **State:** Zustand (global) + TanStack React Query v5 (server data/cache) — all-client, no server components with data
- **Backend:** Supabase (PostgreSQL + PostgREST auto-API + Edge Functions on Deno)
- **Auth:** Supabase Auth with JWT + Row Level Security (RLS) per role
- **Storage:** Supabase Storage (visit photos in private bucket)
- **Realtime:** Supabase Realtime websockets (dashboard live updates)
- **Validation:** Zod (client + Edge Functions) + React Hook Form
- **Testing:** Playwright (e2e) + Vitest (unit, jsdom environment)
- **Hosting:** Vercel (frontend) + Supabase Cloud

## Working Directory

All commands must be run from `ruteria/` (the Next.js app root):

```bash
cd ruteria
```

## Commands

```bash
# Development
npm run dev

# Build
npm run build

# Lint / Type check / Format
npm run lint
npm run type-check        # tsc --noEmit
npm run format            # prettier --write .

# Tests (Vitest unit)
npm test                                 # Run once
npm run test:watch                       # Watch mode

# Tests (Playwright e2e)
npm run test:e2e                         # All e2e tests
npm run test:e2e -- tests/sprint1.spec.ts  # Single spec file
npm run test:e2e -- --ui                 # Interactive mode

# Supabase types (run after schema changes)
supabase gen types typescript --local > lib/supabase/database.types.ts

# Supabase local development
supabase start
supabase db reset         # Reset local DB + run migrations
supabase migration new <name>

# Después de db reset: recrear usuarios de test en Supabase Auth
npm run seed:auth         # crea admin@erp.local y colaboradora@erp.local vía API
```

## Supabase Local URLs

- API: `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`
- DB port: `54322`
- Credentials in `ruteria/.env.local`

### Setup post db reset

```bash
supabase db reset
npm run seed:auth    # Obligatorio: crea auth users via API (no vía SQL directo)
npm run dev
npx playwright test  # Todos los tests deben pasar
```

Test credentials: `admin@erp.local` / `Admin1234!` · `colaboradora@erp.local` / `Colab1234!`

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL       # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY  # Public key (client-side)
SUPABASE_SERVICE_ROLE_KEY      # Service key (server/Edge Functions only)
NEXT_PUBLIC_APP_URL            # Base URL for auth redirects
SUPABASE_DB_PASSWORD           # Direct PostgreSQL password (migrations/CI)
STORAGE_BUCKET_FOTOS           # Supabase Storage bucket name for photos
```

## Project Structure

The repo root contains planning docs (`ERP_CRM_Plan_v2.md`, `SPRINTS.md`, `docs/`). All application code lives under `ruteria/`:

```
ruteria/
  app/
    (admin)/admin/   # Admin panel routes → served at /admin/*
    (campo)/campo/   # Field worker routes → served at /campo/*
    login/           # Public login page
  components/
    ui/              # shadcn/ui base components
    admin/           # Admin-only components
    campo/           # Field worker-only components
  lib/
    supabase/        # Supabase clients (client.ts, server.ts) + database.types.ts
    hooks/           # Custom React hooks (all data fetching goes here)
    validations/     # Zod schemas per domain
  middleware.ts      # Auth guard + role-based redirect
  supabase/
    migrations/      # Versioned SQL migrations (all schema changes here)
    functions/       # Edge Functions (Deno)
  tests/             # Playwright e2e tests
```

## Architecture

### Route Groups — Critical Pattern

`(admin)` and `(campo)` are Next.js route groups — they do **NOT** add a URL segment. To produce `/admin/*` and `/campo/*` URLs, pages live in an extra subdirectory inside the group:

```
app/(admin)/admin/dashboard/page.tsx  → /admin/dashboard  ✓
app/(admin)/dashboard/page.tsx        → /dashboard         ✗ wrong
```

Always follow this nested pattern for all new pages.

### Two distinct UIs
- **`(admin)` group:** Desktop panel for admins, supervisors, analysts, purchasing. Full CRUD, dashboards, reports.
- **`(campo)` group:** Mobile-first PWA for field workers. Simplified visit flow: count → calculate → collect → restock.

### Data flow rule
No direct Supabase/fetch calls in components. All data logic lives in hooks (`lib/hooks/`). Components consume hooks only. React Query v5 handles caching; optimistic updates must guard against empty cache (check `previousData` exists before applying).

### Forms (React Hook Form + Zod)
- Use `z.input` / `z.output` types when schemas have `.default()` values
- HTML selects with an empty option (`value=""`) need `z.preprocess((v) => v === '' ? undefined : v, ...)` before the field validator — already applied in PDV, apply to all new optional select fields
- Sheet/dialog reset pattern: `useEffect([open, entity, reset])` with `if (!open) return` guard

### Hooks — required order
Always call `useQueryClient()` **before** `useQuery()` or `useMutation()` inside the hook body. React Query v5 throws if the order is reversed.

### Params in client components (Next.js 15/16)
`params` is a Promise in Next.js 15+. Unwrap with `use(params)` in client components:
```ts
const { id } = use(params)
```

### Multi-step mutations — rollback compensatorio
PostgREST has no client-side transactions. When a mutation requires two sequential writes (e.g. delete + re-insert for `rutas_pdv`), if the second step fails, manually revert the first step. Pattern already applied in `useRutas`.

### Inventory model
Inventory movements (`movimientos_inventario`) are **immutable** — never deleted, only new records created. Current stock is denormalized into `inventario_vitrina` and `inventario_central` via PostgreSQL triggers. The core visit calculation: `unidades_vendidas = inv_anterior - inv_actual`.

### RLS (Row Level Security)
Every table has RLS policies enforcing role-based access. Key rules:
- `colaboradora`: reads/writes only her own visits (`colaboradora_id = auth.uid()`)
- `admin`: full access everywhere
- `supervisor`: read on routes, visits, incidents; CRUD on incidents
- `analista`: read-only on all data and reports
- `compras`: CRUD on suppliers, purchases, and central inventory

The middleware reads role from `user.app_metadata.rol` (set via Supabase Auth hook). `UserRol` type and `ROLES` constant are the single source of truth — exported from `lib/validations/usuarios.ts`.

### Offline support (PWA — Sprint 6)
The `(campo)` view will use a service worker with IndexedDB to cache the day's route and vitrina inventory. Visits recorded offline sync automatically on reconnect.

## Roles

| Role | Interface |
|------|-----------|
| `admin` | Full admin panel |
| `colaboradora` | Mobile campo view (her route only) |
| `supervisor` | Admin panel (routes, visits, incidents, partial reports) |
| `analista` | Admin panel (read-only, dashboards, exports) |
| `compras` | Admin panel (suppliers, purchases, central inventory) |

## Code Conventions

- **TypeScript strict mode** (`strict: true`). No explicit `any`.
- **Naming:** Components → PascalCase; hooks → `useXxx`; utils → camelCase; constants → `UPPER_SNAKE_CASE`; SQL tables → `snake_case` plural; Next.js routes → `kebab-case`.
- **Files:** Components → `PascalCase.tsx`; utils → `camelCase.ts`.
- **Comments:** Business logic in Spanish; infrastructure/technical code in English.
- Supabase types are generated — always regenerate after schema changes.
- Playwright selectors: use `input[name="..."]` for most forms (Field components lack `htmlFor`). Exception: the login form has no `name` attributes — use `page.getByLabel(/correo/i)` and `page.getByLabel(/contraseña/i)` there.
- Playwright logout: use `page.evaluate(() => form.requestSubmit())` to avoid Next.js portal overlay blocking the button click.

## Git Workflow

- `main` = production (Sprint 1 + Sprint 2 merged). Sprint 3 branch: `feature/sprint3-visitas-campo`.
- Feature branches from `main`: `feature/sprint3-...` (no `develop` branch exists in the remote yet — create one before Sprint 3 if needed, or branch directly from `main`).
- Commit format: `feat:`, `fix:`, `chore:`, `docs:`, `test:` + Spanish description.
- No direct push to `main`. PRs require 1 reviewer + passing CI.

## Key Business Rules

1. A visit cannot be closed without a registered payment amount.
2. If collected amount differs from calculated amount, a note is mandatory and the payment record enters `discrepancia` state.
3. Stock cannot go negative — enforced by a `validar_stock_no_negativo()` trigger.
4. An incident cannot be closed without a registered resolution.
5. Inactive products must not appear in restock options.
6. First visit to a new vitrina uses `inv_anterior = 0` for all products.

## Sprint 3 Scope (current sprint)

**HUs:** HU-14 to HU-19. Covers the field worker visit flow.

| Task | Description |
|------|-------------|
| S3-01 | Mobile view: ruta del día with PDVs in order and status (pending/completed) |
| S3-02 | Admin dashboard: planned vs completed visits per route |
| S3-03 | Temporary route reassignment to another colaboradora (with reason + date) |
| S3-04 | Start visit: record start time, show `inv_anterior` per product |
| S3-05 | Enter current inventory → automatic `unidades_vendidas` calculation |
| S3-06 | Show total amount to collect, broken down by product |

All S3-01/04/05/06 are in the `(campo)` group (mobile-first). S3-02/03 are in `(admin)`.

## Key SQL Triggers & Functions

| Name | Purpose |
|------|---------|
| `set_updated_at()` | Auto-updates `updated_at` on all tables |
| `calcular_unidades_vendidas()` | Before insert on `detalle_visita`: sets `unidades_vendidas = inv_anterior - inv_actual` |
| `actualizar_inventario()` | After insert on `movimientos_inventario`: updates denormalized stock |
| `validar_stock_no_negativo()` | Before insert on `movimientos_inventario`: throws if result < 0 |
| `calcular_monto_visita()` | SQL function: sums subtotals from `detalle_visita` |
| `get_kpi_ventas(fecha_inicio, fecha_fin)` | SQL function: returns KPIs grouped by route, worker, PDV |
