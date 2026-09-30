export type ImportRow = {
  sourceRowId: string
  entryDate: string
  odometer: number
  kind: 'service' | 'odometer'
  workshop: string | null
  costUsd: number | null
  notes: string | null
  services: string[]
}

export type FuelLogImport = {
  vehicles: Array<{
    brand: string
    model: string
    rows: ImportRow[]
  }>
  skippedFuel: number
  skippedInvalid: number
}

const REQUIRED_HEADERS = [
  'Row ID',
  'Vehicle ID',
  'Odometer',
  'Total Cost',
  'Filling Station',
  'Notes',
  'Day',
  'Month',
  'Year',
  'Record Type',
  'Record Desc',
]

export function parseFuelLog(text: string): FuelLogImport {
  if (!text.trim()) throw new Error('El archivo está vacío.')

  const table = parseCsv(text)
  if (table.length < 2) throw new Error('El archivo no tiene filas para importar.')

  const header = table[0].map((cell) => cell.trim())
  const missing = REQUIRED_HEADERS.filter((name) => !header.includes(name))
  if (missing.length > 0) {
    throw new Error(`El archivo no parece el respaldo de combustible. Faltan: ${missing.join(', ')}.`)
  }

  const groups = new Map<string, { brand: string; model: string; rows: ImportRow[] }>()
  let skippedFuel = 0
  let skippedInvalid = 0

  for (const cells of table.slice(1)) {
    const record = alignRow(header, cells)
    const recordType = record['Record Type']
    if (recordType === '0') {
      skippedFuel += 1
      continue
    }
    if (recordType !== '1' && recordType !== '4') {
      skippedInvalid += 1
      continue
    }

    const vehicle = splitVehicle(record['Vehicle ID'] ?? '')
    const entryDate = isoDate(record.Day ?? '', record.Month ?? '', record.Year ?? '')
    const odometer = Number(record.Odometer)
    const rowId = (record['Row ID'] ?? '').trim()
    if (!vehicle || !entryDate || !rowId || !Number.isFinite(odometer) || odometer < 0) {
      skippedInvalid += 1
      continue
    }

    const kind = recordType === '4' ? 'odometer' : 'service'
    const services = kind === 'service' ? splitServices(record['Record Desc'] ?? '') : []
    if (kind === 'service' && services.length === 0) {
      skippedInvalid += 1
      continue
    }

    const sourceRowId = `${slug(vehicle.brand)}-${slug(vehicle.model)}:${rowId}`
    const row: ImportRow = {
      sourceRowId,
      entryDate,
      odometer,
      kind,
      workshop: blankToNull(record['Filling Station'] ?? ''),
      costUsd: kind === 'odometer' ? null : parseCost(record['Total Cost'] ?? ''),
      notes: blankToNull(record.Notes ?? ''),
      services,
    }

    const key = `${vehicle.brand.toLowerCase()}|${vehicle.model.toLowerCase()}`
    const group = groups.get(key) ?? { brand: vehicle.brand, model: vehicle.model, rows: [] }
    group.rows.push(row)
    groups.set(key, group)
  }

  const vehicles = [...groups.values()].map((group) => ({
    ...group,
    rows: group.rows.sort(compareRows),
  }))

  return { vehicles, skippedFuel, skippedInvalid }
}

function compareRows(a: ImportRow, b: ImportRow): number {
  return (
    a.entryDate.localeCompare(b.entryDate) ||
    a.odometer - b.odometer ||
    a.sourceRowId.localeCompare(b.sourceRowId)
  )
}

function alignRow(header: string[], cells: string[]): Record<string, string> {
  const copy = cells.slice()
  if (copy.length > header.length) {
    const head = copy.slice(0, header.length - 1)
    const tail = copy.slice(header.length - 1).join(',')
    copy.splice(0, copy.length, ...head, tail)
  }
  const record: Record<string, string> = {}
  header.forEach((name, index) => {
    record[name] = (copy[index] ?? '').trim()
  })
  return record
}

function splitVehicle(vehicleId: string): { brand: string; model: string } | null {
  const cleaned = vehicleId.trim()
  if (!cleaned) return null
  const space = cleaned.indexOf(' ')
  if (space === -1) return { brand: cleaned, model: cleaned }
  return { brand: cleaned.slice(0, space), model: cleaned.slice(space + 1).trim() }
}

function splitServices(description: string): string[] {
  const services: string[] = []
  const seen = new Set<string>()
  for (const part of description.split(',')) {
    const name = part.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    services.push(name)
  }
  return services
}

function parseCost(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100) / 100
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.toLowerCase() === 'null') return null
  return trimmed
}

function isoDate(day: string, month: string, year: string): string | null {
  const parsedDay = Number(day)
  const parsedMonth = Number(month)
  const parsedYear = Number(year)
  if (!Number.isInteger(parsedDay) || !Number.isInteger(parsedMonth) || !Number.isInteger(parsedYear)) {
    return null
  }
  if (parsedYear < 1900 || parsedYear > 2100 || parsedMonth < 1 || parsedMonth > 12 || parsedDay < 1) {
    return null
  }
  const date = new Date(Date.UTC(parsedYear, parsedMonth - 1, parsedDay))
  if (
    date.getUTCFullYear() !== parsedYear ||
    date.getUTCMonth() !== parsedMonth - 1 ||
    date.getUTCDate() !== parsedDay
  ) {
    return null
  }
  return `${parsedYear}-${String(parsedMonth).padStart(2, '0')}-${String(parsedDay).padStart(2, '0')}`
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const source = text.replace(/^\uFEFF/, '')

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
      continue
    }
    if (char === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (char === '\n') {
      row.push(field)
      field = ''
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
      continue
    }
    if (char === '\r') continue
    field += char
  }

  row.push(field)
  if (row.some((cell) => cell.trim() !== '')) rows.push(row)
  return rows
}
