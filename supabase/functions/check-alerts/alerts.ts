const SOON_KM_CAP = 500
const SOON_DAY_CAP = 30

export type AlertCar = {
  id: string
  brand: string
  model: string
  year: number | null
  odometer: number
}

export type AlertService = {
  id: string
  name: string
  isRecurrent: boolean
  intervalKm: number | null
  intervalMonths: number | null
}

export type AlertEntry = {
  id: string
  carId: string
  entryDate: string
  odometer: number
  serviceIds: string[]
}

export type MailAlert = {
  carId: string
  carName: string
  serviceId: string
  serviceName: string
  status: 'soon' | 'overdue'
  anchorEntryId: string
  summary: string
}

export type NoticeKey = {
  carId: string
  serviceId: string
  status: 'soon' | 'overdue'
  anchorEntryId: string
}

export function maintenanceAlerts(
  cars: AlertCar[],
  services: AlertService[],
  entries: AlertEntry[],
  today: string,
): MailAlert[] {
  const alerts: MailAlert[] = []

  for (const car of cars) {
    for (const service of services) {
      if (!service.isRecurrent) continue
      const related = entries
        .filter((entry) => entry.carId === car.id && entry.serviceIds.includes(service.id))
        .sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.odometer - b.odometer)
      const last = related.at(-1)
      if (!last) continue

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

      let status: 'soon' | 'overdue' | null = null
      if (kmOverdue || dateOverdue) status = 'overdue'
      else if (kmSoon || dateSoon) status = 'soon'
      if (!status) continue

      alerts.push({
        carId: car.id,
        carName: carName(car),
        serviceId: service.id,
        serviceName: service.name,
        status,
        anchorEntryId: last.id,
        summary: alertSummary({ status, last, kmLeft, kmSince, intervalKm: service.intervalKm, dueDate, daysLeft }),
      })
    }
  }

  const rank = { overdue: 0, soon: 1 }
  return alerts.sort(
    (a, b) => rank[a.status] - rank[b.status] || a.carName.localeCompare(b.carName, 'es') || a.serviceName.localeCompare(b.serviceName, 'es'),
  )
}

export function noticeKey(alert: MailAlert): NoticeKey {
  return {
    carId: alert.carId,
    serviceId: alert.serviceId,
    status: alert.status,
    anchorEntryId: alert.anchorEntryId,
  }
}

export function emailFor(alerts: MailAlert[], appUrl: string): { subject: string; html: string; text: string } {
  const subject =
    alerts.length === 1
      ? `AnderCars: ${alerts[0].serviceName} está ${alerts[0].status === 'overdue' ? 'vencido' : 'por vencer'}`
      : `AnderCars: ${alerts.length} mantenimientos requieren atención`

  const lines = alerts.map((alert) => {
    const label = alert.status === 'overdue' ? 'Vencido' : 'Por vencer'
    return `${label}: ${alert.serviceName} (${alert.carName}). ${alert.summary}`
  })
  const link = appUrl.trim()
  const text = [...lines, link ? `Ver alertas: ${link}` : ''].filter(Boolean).join('\n')
  const items = alerts
    .map((alert) => {
      const label = alert.status === 'overdue' ? 'Vencido' : 'Por vencer'
      const color = alert.status === 'overdue' ? '#b42318' : '#946200'
      return `<li style="margin:0 0 14px;">
        <strong style="color:${color};">${escapeHtml(label)}</strong>
        · ${escapeHtml(alert.serviceName)}
        <div style="color:#667085;font-size:14px;">${escapeHtml(alert.carName)}</div>
        <div style="margin-top:4px;">${escapeHtml(alert.summary)}</div>
      </li>`
    })
    .join('')
  const html = `<div style="font-family:Segoe UI,Roboto,sans-serif;color:#1d2939;line-height:1.45;">
    <p style="margin:0 0 12px;">Hola,</p>
    <p style="margin:0 0 16px;">${alerts.length === 1 ? 'Hay un mantenimiento que pide atención.' : 'Hay mantenimientos que piden atención.'}</p>
    <ul style="padding-left:18px;margin:0 0 16px;">${items}</ul>
    ${link ? `<p style="margin:0;"><a href="${escapeHtml(link)}">Abrir AnderCars</a></p>` : ''}
  </div>`
  return { subject, html, text }
}

function carName(car: AlertCar): string {
  const name = `${car.brand} ${car.model}`.trim()
  return car.year ? `${name} (${car.year})` : name
}

function alertSummary(input: {
  status: 'overdue' | 'soon'
  last: AlertEntry
  kmLeft: number | null
  kmSince: number
  intervalKm: number | null
  dueDate: string | null
  daysLeft: number | null
}): string {
  const parts = [
    input.status === 'overdue' ? 'Vencido.' : 'Pronto.',
    `Última vez: ${formatDate(input.last.entryDate)} a los ${formatKm(input.last.odometer)} km.`,
  ]
  if (input.intervalKm != null && input.kmLeft != null) {
    if (input.kmLeft <= 0) {
      parts.push(`Llevas ${formatKm(input.kmSince)} km y el intervalo es ${formatKm(input.intervalKm)} km.`)
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

function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  const monthIndex = month - 1 + months
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const date = new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay)))
  const nextYear = date.getUTCFullYear()
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0')
  const nextDay = String(date.getUTCDate()).padStart(2, '0')
  return `${nextYear}-${nextMonth}-${nextDay}`
}

function daysUntil(target: string, today: string): number {
  const [targetYear, targetMonth, targetDay] = target.slice(0, 10).split('-').map(Number)
  const [todayYear, todayMonth, todayDay] = today.slice(0, 10).split('-').map(Number)
  const targetUtc = Date.UTC(targetYear, targetMonth - 1, targetDay)
  const todayUtc = Date.UTC(todayYear, todayMonth - 1, todayDay)
  return Math.round((targetUtc - todayUtc) / 86_400_000)
}

function formatKm(value: number): string {
  return new Intl.NumberFormat('es-VE', { maximumFractionDigits: 1 }).format(value)
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(year, month - 1, day),
  )
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
