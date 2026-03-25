export const BUSINESS_TIME_ZONE = 'America/Bogota'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function parseDateOnly(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

export function getBusinessDate(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error('No se pudo calcular la fecha de negocio')
  }

  return `${year}-${month}-${day}`
}

export function addDaysToDateString(date: string, days: number): string {
  const { year, month, day } = parseDateOnly(date)
  const utcDate = new Date(Date.UTC(year, month - 1, day + days))

  return [
    utcDate.getUTCFullYear(),
    pad(utcDate.getUTCMonth() + 1),
    pad(utcDate.getUTCDate()),
  ].join('-')
}

export function getBusinessDayUtcRange(date: string | Date = new Date()) {
  const businessDate = typeof date === 'string' ? date : getBusinessDate(date)
  const nextBusinessDate = addDaysToDateString(businessDate, 1)

  return {
    businessDate,
    start: `${businessDate}T05:00:00.000Z`,
    end: `${nextBusinessDate}T05:00:00.000Z`,
  }
}
