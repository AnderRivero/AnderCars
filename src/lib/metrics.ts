import { addMonths, daysUntil, formatDate, formatKm } from './format'
import type { Entry, Service } from './types'

export type AlertStatus = 'overdue' | 'soon' | 'never'

export type Alert = {
  carId: string
  serviceId: string
  serviceName: string
  status: AlertStatus
  summary: string
}

const SOON_KM_CAP = 500
const SOON_DAY_CAP = 30

export function buildAlerts(
  car: { id: string; odometer: number },
  services: Service[],
  entries: Entry[],
  today: string,
): Alert[] {
  const alerts: Alert[] = []

  for (const service of services) {
    if (!service.isRecurrent) continue
    const related = entries
      .filter((entry) => entry.carId === car.id && entry.serviceIds.includes(service.id))
      .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.odometer - b.odometer)
    const last = related.at(-1)
    if (!last) {
      alerts.push({
        carId: car.id,
        serviceId: service.id,
        serviceName: service.name,
        status: 'never',
        summary: `Todavía no registras este servicio. ${intervalSentence(service)}`,
      })
      continue
    }

    const kmSince = car.odometer - last.odometer
    const kmLeft = service.intervalKm == null ? null : service.intervalKm - kmSince
    const dueDate = service.intervalMonths == null ? null : addMonths(last.entryDate, service.intervalMonths)
    const daysLeft = dueDate == null ? null : daysUntil(dueDate, today)
    const kmOverdue = kmLeft != null && kmLeft <= 0
    const dateOverdue = daysLeft != null && daysLeft <= 0
    const kmSoon =
      kmLeft != null &&
      service.intervalKm != null &&
      kmLeft > 0 &&
      kmLeft <= Math.min(SOON_KM_CAP, Math.max(1, Math.round(service.intervalKm * 0.2)))
    const dateSoon =
      daysLeft != null &&
      service.intervalMonths != null &&
      daysLeft > 0 &&
      daysLeft <= Math.min(SOON_DAY_CAP, Math.max(1, Math.round(service.intervalMonths * 30 * 0.2)))

    let status: AlertStatus | null = null
    if (kmOverdue || dateOverdue) status = 'overdue'
    else if (kmSoon || dateSoon) status = 'soon'
    if (!status) continue

    alerts.push({
      carId: car.id,
      serviceId: service.id,
      serviceName: service.name,
      status,
      summary: alertSummary({
        status,
        last,
        kmLeft,
        kmSince,
        intervalKm: service.intervalKm,
        dueDate,
        daysLeft,
      }),
    })
  }

  const rank: Record<AlertStatus, number> = { overdue: 0, soon: 1, never: 2 }
  return alerts.sort(
    (a, b) => rank[a.status] - rank[b.status] || a.serviceName.localeCompare(b.serviceName, 'es'),
  )
}

function intervalSentence(service: Service): string {
  const parts: string[] = []
  if (service.intervalKm) parts.push(`${formatKm(service.intervalKm)} km`)
  if (service.intervalMonths) parts.push(service.intervalMonths === 1 ? '1 mes' : `${service.intervalMonths} meses`)
  return parts.length > 0 ? `Intervalo: ${parts.join(' o ')}.` : ''
}

function alertSummary(input: {
  status: 'overdue' | 'soon'
  last: Entry
  kmLeft: number | null
  kmSince: number
  intervalKm: number | null
  dueDate: string | null
  daysLeft: number | null
}): string {
  const lastText = `Última vez: ${formatDate(input.last.entryDate)} a los ${formatKm(input.last.odometer)} km.`
  const parts = [input.status === 'overdue' ? 'Vencido.' : 'Pronto.', lastText]

  if (input.intervalKm != null && input.kmLeft != null) {
    if (input.kmLeft <= 0) {
      parts.push(
        `Llevas ${formatKm(input.kmSince)} km y el intervalo es ${formatKm(input.intervalKm)} km.`,
      )
    } else {
      parts.push(`Quedan ${formatKm(input.kmLeft)} km de ${formatKm(input.intervalKm)} km.`)
    }
  }

  if (input.dueDate && input.daysLeft != null) {
    if (input.daysLeft <= 0) parts.push(`La fecha se cumplió el ${formatDate(input.dueDate)}.`)
    else parts.push(`La fecha límite es el ${formatDate(input.dueDate)} (faltan ${input.daysLeft} días).`)
  }

  return parts.join(' ')
}

export type YearMileage = {
  year: number
  km: number
  endOdometer: number
}

export function mileageByYear(entries: Entry[]): YearMileage[] {
  if (entries.length === 0) return []
  const sorted = [...entries].sort(
    (a, b) => a.entryDate.localeCompare(b.entryDate) || a.odometer - b.odometer,
  )
  const years = [...new Set(sorted.map((entry) => Number(entry.entryDate.slice(0, 4))))].sort(
    (a, b) => b - a,
  )

  return years.map((year) => {
    const inYear = sorted.filter((entry) => Number(entry.entryDate.slice(0, 4)) === year)
    const endOdometer = Math.max(...inYear.map((entry) => entry.odometer))
    const previous = sorted.filter((entry) => Number(entry.entryDate.slice(0, 4)) < year)
    const baseline =
      previous.length > 0
        ? Math.max(...previous.map((entry) => entry.odometer))
        : Math.min(...inYear.map((entry) => entry.odometer))
    return { year, km: Math.max(0, endOdometer - baseline), endOdometer }
  })
}

export function costByYear(entries: Entry[]): Array<{ year: number; total: number }> {
  const totals = new Map<number, number>()
  for (const entry of entries) {
    if (entry.costUsd == null) continue
    const year = Number(entry.entryDate.slice(0, 4))
    totals.set(year, (totals.get(year) ?? 0) + entry.costUsd)
  }
  return [...totals.entries()]
    .map(([year, total]) => ({ year, total }))
    .sort((a, b) => b.year - a.year)
}

export function costByService(
  entries: Entry[],
  services: Service[],
): Array<{ serviceId: string; name: string; total: number }> {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    if (entry.costUsd == null || entry.serviceIds.length === 0) continue
    const share = entry.costUsd / entry.serviceIds.length
    for (const serviceId of entry.serviceIds) {
      totals.set(serviceId, (totals.get(serviceId) ?? 0) + share)
    }
  }
  return services
    .filter((service) => totals.has(service.id))
    .map((service) => ({
      serviceId: service.id,
      name: service.name,
      total: totals.get(service.id) ?? 0,
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'))
}

export function observedKm(entries: Entry[]): number {
  if (entries.length === 0) return 0
  const values = entries.map((entry) => entry.odometer)
  return Math.max(...values) - Math.min(...values)
}
