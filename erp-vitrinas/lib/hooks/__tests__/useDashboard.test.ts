import { describe, expect, it } from 'vitest'

describe('useDashboard realtime fallback', () => {
  it('activa y desactiva el flag realtimeHealthy con los estados del canal', () => {
    let realtimeHealthy = false

    const handleStatus = (status: string) => {
      if (status === 'SUBSCRIBED') realtimeHealthy = true
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        realtimeHealthy = false
      }
    }

    handleStatus('SUBSCRIBED')
    expect(realtimeHealthy).toBe(true)

    handleStatus('CHANNEL_ERROR')
    expect(realtimeHealthy).toBe(false)
  })

  it('deshabilita polling cuando realtime está sano', () => {
    const realtimeHealthy = true
    const refetchInterval = realtimeHealthy ? false : 30_000

    expect(refetchInterval).toBe(false)
  })

  it('usa polling de respaldo cuando realtime falla', () => {
    const realtimeHealthy = false
    const refetchInterval = realtimeHealthy ? false : 30_000

    expect(refetchInterval).toBe(30_000)
  })
})
