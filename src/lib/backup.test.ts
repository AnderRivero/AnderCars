import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { parseBackup } from './backup'

const carId = '11111111-1111-4111-8111-111111111111'
const serviceId = '22222222-2222-4222-8222-222222222222'

function backup(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    app: 'AnderCars',
    version: 1,
    exportedAt: '2026-09-30T12:00:00.000Z',
    cars: [
      {
        id: carId,
        brand: 'Chevrolet',
        model: 'Aveo',
        year: 2016,
        photoPath: null,
        notes: null,
        odometer: 1000,
      },
    ],
    services: [
      {
        id: serviceId,
        name: 'Aceite',
        isRecurrent: true,
        intervalKm: 5000,
        intervalMonths: 6,
      },
    ],
    entries: [
      {
        carId,
        entryDate: '2026-01-15',
        odometer: 1000,
        kind: 'service',
        workshop: null,
        costUsd: 30,
        notes: null,
        services: ['Aceite'],
      },
    ],
    ...overrides,
  })
}

describe('parseBackup', () => {
  it('reads a backup exported by the app', () => {
    const parsed = parseBackup(backup())
    assert.equal(parsed.cars[0]?.brand, 'Chevrolet')
    assert.equal(parsed.services[0]?.intervalKm, 5000)
    assert.equal(parsed.entries[0]?.services[0], 'Aceite')
  })

  it('rejects a file that is not an AnderCars backup', () => {
    assert.throws(() => parseBackup('{"app":"otro"}'), /no es un respaldo de AnderCars/)
    assert.throws(() => parseBackup('no-json'), /no es un JSON válido/)
  })

  it('rejects an entry that points at a missing car or service', () => {
    const missingCar = backup()
    const value = JSON.parse(missingCar) as { entries: Array<{ carId: string }> }
    value.entries[0].carId = '33333333-3333-4333-8333-333333333333'
    assert.throws(() => parseBackup(JSON.stringify(value)), /auto que no está/)

    const missingService = JSON.parse(backup()) as { entries: Array<{ services: string[] }> }
    missingService.entries[0].services = ['Frenos']
    assert.throws(() => parseBackup(JSON.stringify(missingService)), /Frenos/)
  })
})
