export type Car = {
  id: string
  brand: string
  model: string
  year: number | null
  photoPath: string | null
  notes: string | null
  odometer: number
}

export type Service = {
  id: string
  name: string
  isRecurrent: boolean
  intervalKm: number | null
  intervalMonths: number | null
}

export type EntryKind = 'service' | 'odometer'

export type Entry = {
  id: string
  carId: string
  entryDate: string
  odometer: number
  kind: EntryKind
  workshop: string | null
  costUsd: number | null
  notes: string | null
  serviceIds: string[]
}

export type CarInput = {
  brand: string
  model: string
  year: number | null
  notes: string | null
  photoPath?: string | null
}

export type ServiceInput = {
  name: string
  isRecurrent: boolean
  intervalKm: number | null
  intervalMonths: number | null
}

export type EntryInput = {
  id?: string
  carId: string
  entryDate: string
  odometer: number
  workshop: string | null
  costUsd: number | null
  notes: string | null
  serviceIds: string[]
}

export type OdometerInput = {
  id?: string
  carId: string
  entryDate: string
  odometer: number
}
