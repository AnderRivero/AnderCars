import { supabase } from './supabase'
import type { Car, CarInput, Entry, EntryInput, OdometerInput, Service, ServiceInput } from './types'

const BUCKET = 'car-photos'
const MAX_PHOTO_BYTES = 2 * 1024 * 1024
const PHOTO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

type CarRow = {
  id: string
  brand: string
  model: string
  year: number | null
  photo_path: string | null
  notes: string | null
  odometer: number | string
}

type ServiceRow = {
  id: string
  name: string
  is_recurrent: boolean
  interval_km: number | null
  interval_months: number | null
}

type EntryRow = {
  id: string
  car_id: string
  entry_date: string
  odometer: number | string
  kind: 'service' | 'odometer'
  workshop: string | null
  cost_usd: number | string | null
  notes: string | null
  entry_services: Array<{ service_id: string }> | null
}

export type Snapshot = {
  cars: Car[]
  services: Service[]
  entries: Entry[]
}

function client() {
  if (!supabase) throw new Error('Falta la configuración de Supabase.')
  return supabase
}

function asNumber(value: number | string | null | undefined): number {
  if (value == null || value === '') return 0
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function asNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function mapCar(row: CarRow): Car {
  return {
    id: row.id,
    brand: row.brand,
    model: row.model,
    year: row.year,
    photoPath: row.photo_path,
    notes: row.notes,
    odometer: asNumber(row.odometer),
  }
}

function mapService(row: ServiceRow): Service {
  return {
    id: row.id,
    name: row.name,
    isRecurrent: row.is_recurrent,
    intervalKm: row.interval_km,
    intervalMonths: row.interval_months,
  }
}

function mapEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    carId: row.car_id,
    entryDate: row.entry_date,
    odometer: asNumber(row.odometer),
    kind: row.kind,
    workshop: row.workshop,
    costUsd: asNumberOrNull(row.cost_usd),
    notes: row.notes,
    serviceIds: (row.entry_services ?? []).map((link) => link.service_id),
  }
}

export async function loadAll(): Promise<Snapshot> {
  const db = client()
  const [carsResult, servicesResult, entriesResult] = await Promise.all([
    db.from('cars').select('id, brand, model, year, photo_path, notes, odometer').order('brand'),
    db
      .from('services')
      .select('id, name, is_recurrent, interval_km, interval_months')
      .order('name'),
    db
      .from('entries')
      .select(
        'id, car_id, entry_date, odometer, kind, workshop, cost_usd, notes, entry_services(service_id)',
      )
      .order('entry_date', { ascending: false })
      .order('odometer', { ascending: false }),
  ])

  if (carsResult.error) throw carsResult.error
  if (servicesResult.error) throw servicesResult.error
  if (entriesResult.error) throw entriesResult.error

  return {
    cars: ((carsResult.data ?? []) as CarRow[]).map(mapCar),
    services: ((servicesResult.data ?? []) as ServiceRow[]).map(mapService),
    entries: ((entriesResult.data ?? []) as unknown as EntryRow[]).map(mapEntry),
  }
}

function carWrite(input: CarInput): Record<string, unknown> {
  const row: Record<string, unknown> = {
    brand: input.brand.trim(),
    model: input.model.trim(),
    year: input.year,
    notes: emptyToNull(input.notes),
  }
  if (input.photoPath !== undefined) row.photo_path = input.photoPath
  return row
}

export async function insertCar(input: CarInput): Promise<string> {
  const { data, error } = await client().from('cars').insert(carWrite(input)).select('id').single()
  if (error) throw error
  return (data as { id: string }).id
}

export async function updateCar(id: string, input: CarInput): Promise<void> {
  const { error } = await client().from('cars').update(carWrite(input)).eq('id', id)
  if (error) throw error
}

export async function deleteCar(id: string): Promise<void> {
  const { error } = await client().from('cars').delete().eq('id', id)
  if (error) throw error
}

export async function saveService(input: ServiceInput & { id?: string }): Promise<void> {
  const row = {
    name: input.name.trim(),
    is_recurrent: input.isRecurrent,
    interval_km: input.isRecurrent ? input.intervalKm : null,
    interval_months: input.isRecurrent ? input.intervalMonths : null,
  }
  const query = input.id
    ? client().from('services').update(row).eq('id', input.id)
    : client().from('services').insert(row)
  const { error } = await query
  if (error) throw error
}

export async function deleteService(id: string): Promise<void> {
  const { error } = await client().from('services').delete().eq('id', id)
  if (error) throw error
}

export async function saveServiceEntry(input: EntryInput): Promise<void> {
  if (input.serviceIds.length === 0) throw new Error('Elige al menos un servicio.')
  const row = {
    car_id: input.carId,
    entry_date: input.entryDate,
    odometer: input.odometer,
    kind: 'service',
    workshop: emptyToNull(input.workshop),
    cost_usd: input.costUsd,
    notes: emptyToNull(input.notes),
  }

  if (input.id) {
    const { error } = await client().from('entries').update(row).eq('id', input.id)
    if (error) throw error
    await replaceEntryServices(input.id, input.serviceIds)
    return
  }

  const { data, error } = await client().from('entries').insert(row).select('id').single()
  if (error) throw error
  const id = (data as { id: string }).id
  try {
    await replaceEntryServices(id, input.serviceIds)
  } catch (linkError) {
    await client().from('entries').delete().eq('id', id)
    throw linkError
  }
}

export async function saveOdometerEntry(input: OdometerInput): Promise<void> {
  const row = {
    car_id: input.carId,
    entry_date: input.entryDate,
    odometer: input.odometer,
    kind: 'odometer',
    workshop: null,
    cost_usd: null,
    notes: null,
  }

  if (input.id) {
    const { error } = await client().from('entries').update(row).eq('id', input.id)
    if (error) throw error
    await replaceEntryServices(input.id, [])
    return
  }

  const { error } = await client().from('entries').insert(row)
  if (error) throw error
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await client().from('entries').delete().eq('id', id)
  if (error) throw error
}

async function replaceEntryServices(entryId: string, serviceIds: string[]): Promise<void> {
  const { error: deleteError } = await client().from('entry_services').delete().eq('entry_id', entryId)
  if (deleteError) throw deleteError
  if (serviceIds.length === 0) return
  const { error } = await client()
    .from('entry_services')
    .insert(serviceIds.map((serviceId) => ({ entry_id: entryId, service_id: serviceId })))
  if (error) throw error
}

export function validatePhoto(file: File): string | null {
  if (!PHOTO_EXT[file.type]) return 'La foto tiene que ser JPG, PNG o WebP.'
  if (file.size > MAX_PHOTO_BYTES) return 'La foto no puede pasar de 2 MB.'
  return null
}

export async function uploadCarPhoto(carId: string, file: File): Promise<string> {
  const problem = validatePhoto(file)
  if (problem) throw new Error(problem)
  const path = `${carId}/${crypto.randomUUID()}.${PHOTO_EXT[file.type]}`
  const { error } = await client().storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error
  return path
}

export async function removeCarPhoto(path: string): Promise<void> {
  const { error } = await client().storage.from(BUCKET).remove([path])
  if (error) throw error
}

export async function signedPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await client().storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 6)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}

export type ImportPayload = {
  brand: string
  model: string
  rows: Array<{
    source_row_id: string
    entry_date: string
    odometer: number
    kind: 'service' | 'odometer'
    workshop: string | null
    cost_usd: number | null
    notes: string | null
    services: string[]
  }>
}

export async function importHistory(payload: ImportPayload): Promise<{ inserted: number; skipped: number }> {
  const { data, error } = await client().rpc('import_history', { payload })
  if (error) throw error
  const value = typeof data === 'string' ? (JSON.parse(data) as unknown) : data
  if (!value || typeof value !== 'object') return { inserted: 0, skipped: 0 }
  const record = value as { inserted?: number; skipped?: number }
  return {
    inserted: Number(record.inserted ?? 0),
    skipped: Number(record.skipped ?? 0),
  }
}

function emptyToNull(value: string | null): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}
