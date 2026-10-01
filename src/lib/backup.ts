import type { Car, Entry, EntryKind, Service } from './types'

export type BackupEntry = {
  id?: string
  carId: string
  entryDate: string
  odometer: number
  kind: EntryKind
  workshop: string | null
  costUsd: number | null
  notes: string | null
  services: string[]
}

export type BackupFile = {
  app: 'AnderCars'
  version: 1
  exportedAt: string
  cars: Car[]
  services: Service[]
  entries: BackupEntry[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function buildBackup(cars: Car[], services: Service[], entries: Entry[]): BackupFile {
  const names = new Map(services.map((service) => [service.id, service.name]))
  return {
    app: 'AnderCars',
    version: 1,
    exportedAt: new Date().toISOString(),
    cars,
    services,
    entries: entries.map((entry) => ({
      id: entry.id,
      carId: entry.carId,
      entryDate: entry.entryDate,
      odometer: entry.odometer,
      kind: entry.kind,
      workshop: entry.workshop,
      costUsd: entry.costUsd,
      notes: entry.notes,
      services: entry.serviceIds
        .map((id) => names.get(id))
        .filter((name): name is string => Boolean(name)),
    })),
  }
}

export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('El archivo no es un JSON válido.')
  }

  const record = asRecord(raw, 'El respaldo')
  if (record.app !== 'AnderCars') throw new Error('El archivo no es un respaldo de AnderCars.')
  if (record.version !== 1) throw new Error('Este respaldo usa una versión que la app no reconoce.')

  const cars = asArray(record.cars, 'autos').map((item, index) => parseCar(item, index))
  const services = asArray(record.services, 'servicios').map((item, index) => parseService(item, index))
  const carIds = new Set(cars.map((car) => car.id))
  const serviceNames = new Set(services.map((service) => service.name.trim().toLowerCase()))
  const entries = asArray(record.entries, 'entradas').map((item, index) =>
    parseEntry(item, index, carIds, serviceNames),
  )

  return {
    app: 'AnderCars',
    version: 1,
    exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : new Date().toISOString(),
    cars,
    services,
    entries,
  }
}

function parseCar(value: unknown, index: number): Car {
  const record = asRecord(value, `El auto ${index + 1}`)
  const brand = requiredText(record.brand, `El auto ${index + 1} no tiene marca.`)
  const model = requiredText(record.model, `El auto ${index + 1} no tiene modelo.`)
  return {
    id: requiredUuid(record.id, `El auto ${brand} ${model} no tiene un identificador válido.`),
    brand,
    model,
    year: optionalInteger(record.year, `El año de ${brand} ${model} no es válido.`),
    photoPath: optionalText(record.photoPath),
    notes: optionalText(record.notes),
    odometer: requiredNumber(record.odometer, `El kilometraje de ${brand} ${model} no es válido.`, 0),
  }
}

function parseService(value: unknown, index: number): Service {
  const record = asRecord(value, `El servicio ${index + 1}`)
  const name = requiredText(record.name, `El servicio ${index + 1} no tiene nombre.`)
  const isRecurrent = record.isRecurrent === true
  const intervalKm = optionalInteger(record.intervalKm, `Los kilómetros de ${name} no son válidos.`)
  const intervalMonths = optionalInteger(record.intervalMonths, `Los meses de ${name} no son válidos.`)
  if (isRecurrent && intervalKm == null && intervalMonths == null) {
    throw new Error(`El servicio recurrente ${name} necesita kilómetros, meses, o los dos.`)
  }
  if (intervalKm != null && intervalKm <= 0) throw new Error(`Los kilómetros de ${name} tienen que ser mayores que cero.`)
  if (intervalMonths != null && intervalMonths <= 0) {
    throw new Error(`Los meses de ${name} tienen que ser mayores que cero.`)
  }
  return {
    id: requiredUuid(record.id, `El servicio ${name} no tiene un identificador válido.`),
    name,
    isRecurrent,
    intervalKm,
    intervalMonths,
  }
}

function parseEntry(
  value: unknown,
  index: number,
  carIds: Set<string>,
  serviceNames: Set<string>,
): BackupEntry {
  const record = asRecord(value, `La entrada ${index + 1}`)
  const carId = requiredUuid(record.carId, `La entrada ${index + 1} no indica un auto válido.`)
  if (!carIds.has(carId)) throw new Error(`La entrada ${index + 1} apunta a un auto que no está en el respaldo.`)
  const kind = record.kind
  if (kind !== 'service' && kind !== 'odometer') throw new Error(`La entrada ${index + 1} tiene un tipo inválido.`)
  const entryDate = requiredText(record.entryDate, `La entrada ${index + 1} no tiene fecha.`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || Number.isNaN(Date.parse(`${entryDate}T00:00:00Z`))) {
    throw new Error(`La fecha de la entrada ${index + 1} no es válida.`)
  }
  const services = asArray(record.services ?? [], `Los servicios de la entrada ${index + 1}`)
    .map((item) => requiredText(item, `La entrada ${index + 1} tiene un servicio vacío.`))
  if (kind === 'service' && services.length === 0) {
    throw new Error(`La entrada ${index + 1} es un servicio y no indica cuál.`)
  }
  for (const name of services) {
    if (!serviceNames.has(name.trim().toLowerCase())) {
      throw new Error(`La entrada ${index + 1} usa el servicio "${name}", que no está en el respaldo.`)
    }
  }
  const id = record.id == null || record.id === '' ? undefined : requiredUuid(record.id, `La entrada ${index + 1} tiene un identificador inválido.`)
  return {
    id,
    carId,
    entryDate,
    odometer: requiredNumber(record.odometer, `El kilometraje de la entrada ${index + 1} no es válido.`, 0),
    kind,
    workshop: optionalText(record.workshop),
    costUsd: record.costUsd == null || record.costUsd === ''
      ? null
      : requiredNumber(record.costUsd, `El costo de la entrada ${index + 1} no es válido.`, 0),
    notes: optionalText(record.notes),
    services,
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} no tiene el formato esperado.`)
  }
  return value as Record<string, unknown>
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`La lista de ${label} no es válida.`)
  return value
}

function requiredText(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(message)
  return value.trim()
}

function optionalText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function requiredUuid(value: unknown, message: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(message)
  return value
}

function requiredNumber(value: unknown, message: string, minimum: number): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(number) || number < minimum) throw new Error(message)
  return number
}

function optionalInteger(value: unknown, message: string): number | null {
  if (value == null || value === '') return null
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isInteger(number)) throw new Error(message)
  return number
}
