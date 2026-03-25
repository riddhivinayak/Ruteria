'use client'

export type ReporteExportTipo = 'ventas' | 'ranking' | 'inventario' | 'visitas' | 'incidencias'

export type ReporteExportParams = Record<string, string | number | boolean | null | undefined>

export function buildReporteExportUrl(tipo: ReporteExportTipo, params: ReporteExportParams = {}) {
  const searchParams = new URLSearchParams({ tipo })

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    searchParams.set(key, String(value))
  }

  return `/api/reportes/export?${searchParams.toString()}`
}

function getFilenameFromDisposition(contentDisposition: string | null) {
  if (!contentDisposition) return null

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1])

  const asciiMatch = contentDisposition.match(/filename="([^"]+)"/i)
  if (asciiMatch?.[1]) return asciiMatch[1]

  return null
}

export async function downloadReporteXlsx(tipo: ReporteExportTipo, params: ReporteExportParams = {}) {
  const response = await fetch(buildReporteExportUrl(tipo, params), {
    method: 'GET',
    credentials: 'include',
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'No se pudo exportar el reporte')
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const filename = getFilenameFromDisposition(response.headers.get('content-disposition')) ?? `${tipo}.xlsx`

  link.href = objectUrl
  link.download = filename
  link.click()

  URL.revokeObjectURL(objectUrl)
}
