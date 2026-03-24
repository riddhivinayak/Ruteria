# GitHub Profile & powERP README — Diseño

**Fecha:** 2026-03-22
**Autor:** Samuel Calderón (`scldrn`)
**Estado:** Aprobado por el usuario

---

## Objetivo

Hacer el perfil de GitHub y el repositorio `powERP` visualmente atractivos y profesionales para recruiters y otros desarrolladores. Actualmente ninguno tiene README, descripción, ni topics.

## Entregables

### 1. Perfil de GitHub — `scldrn/scldrn`

Crear el repositorio especial `scldrn/scldrn` con un `README.md` que se muestre en la página principal de GitHub del usuario.

**Estilo:** Dark Tech — fondo `#0d1117`, acentos azul `#58a6ff`, monospace.
**Audiencia primaria:** Recruiters.
**Layout:** Terminal interactivo simulado con comandos y respuestas.

**Estructura del README:**

El terminal se simula con un bloque de código cercado (`` ```bash ``) que GitHub renderiza con fondo oscuro. Esto es 100% compatible con GFM.

```
[Bloque ```bash]
  samuel@github:~$ whoami
  > Samuel Calderón — Full-Stack Developer
  > Medellín, Colombia 🇨🇴 · open to work ✅

  samuel@github:~$ cat about.txt
  > Construyo sistemas web robustos con arquitectura limpia.
  > Especializado en ERP/CRM, apps móviles y APIs REST.
  > Me obsesiona el detalle: UX, performance y seguridad.

  samuel@github:~$ skills --verbose
  [badges inline después del bloque]

  samuel@github:~$ ls projects/
  > powERP/      — ERP-CRM para vitrinas · Next.js + Supabase
  > rentaclara/  — Sistema de arriendos

  samuel@github:~$ cat contact.md
  > 📧 samuelcalderon.dev@gmail.com
  > 🐦 @scldrn_ (Twitter/X)
  > 📍 Medellín, Colombia
[Fin bloque]

[Badges de tecnología — shields.io, inline tras el bloque de terminal]
[GitHub Stats Cards — imágenes externas en fila con <div align="center">]
```

**Badges de tecnología** (shields.io, estilo `flat-square`):
- `![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)`
- `![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white)`
- `![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)`
- `![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=black)`
- `![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)`
- `![TailwindCSS](https://img.shields.io/badge/TailwindCSS_v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)`

**GitHub Stats** (el repo `scldrn/scldrn` debe ser **público**):
- API: `github-readme-stats.vercel.app`
- Tema: `github_dark`
- Cards a incluir: stats generales + top-langs
- Ejemplo: `![Stats](https://github-readme-stats.vercel.app/api?username=scldrn&theme=github_dark&show_icons=true&hide_border=true)`

---

### 2. README del repo `powERP`

Crear `README.md` en la **raíz del monorepo** (`/README.md`, no dentro de `erp-vitrinas/`) con la siguiente estructura.

**Estilo:** Dark Tech — mismos colores que el perfil.

**Secciones:**

#### Header / Banner
- Título centrado con HTML inline (GitHub renderiza `<div align="center">`):
  `<h1>⚡ powERP</h1>`
  `<p><em>ERP · CRM · Field Operations Platform</em></p>`
- Separador: `---` (regla horizontal estándar de GFM)
- Fila de badges shields.io centrada con `<div align="center">`. Ejemplo de badge:
  `![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white)`
  Badges a incluir: Next.js, TypeScript, React, Supabase, TailwindCSS, PostgreSQL, MIT, PRs Welcome

#### Descripción (bloque destacado)
Blockquote de GFM (GitHub renderiza con borde izquierdo gris, perfectamente legible):
> Sistema ERP-CRM para gestionar vitrinas de accesorios electrónicos en consignación. Digitaliza el proceso completo: rutas de campo, conteo de inventario, cobros y reportes — reemplazando un proceso 100% manual para 200+ puntos de venta.

#### Características (tabla 4 filas con emojis)
Tabla de markdown estándar (4 filas, emojis como sustituto visual de grid):

| | Característica | Descripción |
|---|---|---|
| 📱 | **App de Campo (PWA)** | Ruta del día, inicio de visita, conteo de inventario y cálculo automático de ventas. Mobile-first. |
| 🖥️ | **Panel Administrativo** | Dashboard en tiempo real, gestión de rutas, vitrinas, productos y KPIs. |
| 📦 | **Inventario Doble** | Inventario central + por vitrina. Movimientos inmutables, stock desnormalizado por triggers PostgreSQL. |
| 🔐 | **Auth + RLS** | 5 roles (admin, colaboradora, supervisor, analista, compras) con políticas RLS por tabla. |

#### Stack técnico
Tabla con categorías: Frontend, Estado, Backend, Testing, Deploy.

#### Instalación local
```bash
git clone + cd + npm install + supabase start + supabase db reset + npm run dev
```
Con variables de entorno documentadas.

#### Estructura del proyecto
Árbol de directorios con descripción de carpetas principales.

#### Contribuir
Guía breve: fork → feature branch → PR → revisión.

#### Licencia
MIT

---

### 3. Configuración del repo `powERP` en GitHub

- **Descripción:** `ERP-CRM para gestionar vitrinas de accesorios electrónicos en 200+ puntos de venta — Next.js · Supabase · TypeScript`
- **Topics:** `erp`, `crm`, `nextjs`, `supabase`, `typescript`, `react`, `postgresql`, `field-operations`
- **Licencia:** Añadir MIT license
- **Homepage:** (dejar vacío por ahora, se añade cuando haya deploy)

---

## Restricciones técnicas

- Los READMEs usan markdown estándar de GitHub (GFM) — sin HTML complejo salvo lo que GitHub renderiza
- Las tarjetas de GitHub Stats son imágenes externas — el repo `scldrn/scldrn` **debe ser público** para que funcionen
- El cursor parpadeante del terminal **no** es posible en markdown puro — se simula visualmente con formato de texto
- Las tablas de features en markdown no tienen estilos de color — se usan emojis para compensar

## Archivos a crear / modificar

| Archivo | Acción |
|---------|--------|
| `README.md` (raíz del monorepo) | Crear — README de powERP |
| Repo nuevo `scldrn/scldrn` en GitHub | Crear via `gh repo create` |
| `scldrn/scldrn/README.md` | Crear y pushear |
| Descripción + topics de `powERP` | Actualizar via `gh repo edit` |
