export function todayISO(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  const monthIndex = month - 1 + months
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const clampedDay = Math.min(day, lastDay)
  const date = new Date(Date.UTC(year, monthIndex, clampedDay))
  const nextYear = date.getUTCFullYear()
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0')
  const nextDay = String(date.getUTCDate()).padStart(2, '0')
  return `${nextYear}-${nextMonth}-${nextDay}`
}

export function daysUntil(target: string, today: string): number {
  const [targetYear, targetMonth, targetDay] = target.slice(0, 10).split('-').map(Number)
  const [todayYear, todayMonth, todayDay] = today.slice(0, 10).split('-').map(Number)
  const targetUtc = Date.UTC(targetYear, targetMonth - 1, targetDay)
  const todayUtc = Date.UTC(todayYear, todayMonth - 1, todayDay)
  return Math.round((targetUtc - todayUtc) / 86_400_000)
}

export function formatKm(value: number): string {
  return new Intl.NumberFormat('es-VE', { maximumFractionDigits: 1 }).format(value)
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('es-VE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day))
}

export function kmInputValue(value: number): string {
  if (!Number.isFinite(value)) return ''
  return String(value)
}

export function carLabel(car: { brand: string; model: string; year: number | null }): string {
  const name = `${car.brand} ${car.model}`.trim()
  return car.year ? `${name} (${car.year})` : name
}

export function monthsLabel(months: number): string {
  return months === 1 ? '1 mes' : `${months} meses`
}

export function intervalLabel(service: {
  isRecurrent: boolean
  intervalKm: number | null
  intervalMonths: number | null
}): string {
  if (!service.isRecurrent) return 'Solo cuando lo registres'
  const parts: string[] = []
  if (service.intervalKm) parts.push(`${formatKm(service.intervalKm)} km`)
  if (service.intervalMonths) parts.push(monthsLabel(service.intervalMonths))
  return parts.length > 0 ? `Cada ${parts.join(' o ')}` : 'Recurrente'
}
