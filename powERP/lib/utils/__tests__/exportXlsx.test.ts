import { describe, expect, it } from 'vitest'
import { buildReporteExportUrl } from '@/lib/utils/exportXlsx'

describe('buildReporteExportUrl', () => {
  it('incluye el tipo y los filtros informados', () => {
    const url = buildReporteExportUrl('ventas', {
      desde: '2026-03-01',
      hasta: '2026-03-24',
      rutaId: 'ruta-1',
      productoId: 'producto-1',
    })

    expect(url).toContain('/api/reportes/export?')
    expect(url).toContain('tipo=ventas')
    expect(url).toContain('desde=2026-03-01')
    expect(url).toContain('hasta=2026-03-24')
    expect(url).toContain('rutaId=ruta-1')
    expect(url).toContain('productoId=producto-1')
  })

  it('omite filtros vacios o nulos', () => {
    const url = buildReporteExportUrl('inventario', {
      rutaId: '',
      pdvId: undefined,
      tipo: null,
    })

    expect(url).toBe('/api/reportes/export?tipo=inventario')
  })
})
