import { formatKm } from './format'

export function parseDecimal(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.')
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

export function validateOdometer(value: number, minimum: number, current?: number): string | null {
  if (!Number.isFinite(value)) return 'Escribe el kilometraje.'
  if (value < 0) return 'El kilometraje no puede ser negativo.'
  if (current != null && value === current) return null
  if (value < minimum) {
    return `El kilometraje no puede ser menor que ${formatKm(minimum)} km.`
  }
  return null
}

export function minimumOdometer(
  entries: Array<{ id: string; carId: string; odometer: number }>,
  carId: string,
  excludeId?: string,
): number {
  const values = entries
    .filter((entry) => entry.carId === carId && entry.id !== excludeId)
    .map((entry) => entry.odometer)
  if (values.length === 0) return 0
  return Math.max(...values)
}

export function duplicateOdometerReading(
  entries: Array<{ id: string; carId: string; entryDate: string; odometer: number; kind: string }>,
  input: { id?: string | null; carId: string; entryDate: string; odometer: number },
): boolean {
  const km = Math.round(input.odometer * 10)
  return entries.some(
    (entry) =>
      entry.kind === 'odometer' &&
      entry.id !== input.id &&
      entry.carId === input.carId &&
      entry.entryDate === input.entryDate &&
      Math.round(entry.odometer * 10) === km,
  )
}

export function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String(error.message)
    if (message.includes('restore_backup') && /could not find|does not exist|schema cache/i.test(message)) {
      return 'Falta activar la recuperación en Supabase. En el SQL Editor, ejecuta la función restore_backup de supabase/schema.sql.'
    }
    if (message.includes('services_name_key') || message.includes('duplicate key')) {
      return 'Ya existe un servicio con ese nombre.'
    }
    if (message.includes('entry_services') && message.includes('violates foreign key')) {
      return 'No se puede borrar el servicio porque hay entradas que lo usan.'
    }
    return message
  }
  return 'No se pudo completar la acción.'
}
