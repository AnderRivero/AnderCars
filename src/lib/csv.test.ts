import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'
import { parseFuelLog } from './csv'

const csv = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'Fuel_Log.csv'),
  'utf8',
)

describe('parseFuelLog', () => {
  const parsed = parseFuelLog(csv)
  const rows = parsed.vehicles.flatMap((vehicle) => vehicle.rows)

  it('keeps one vehicle and skips fuel rows', () => {
    assert.equal(parsed.vehicles.length, 1)
    assert.equal(parsed.vehicles[0].brand, 'Chevrolet')
    assert.equal(parsed.vehicles[0].model, 'Aveo Lt Speed')
    assert.equal(parsed.skippedFuel, 10)
    assert.equal(parsed.skippedInvalid, 0)
    assert.equal(rows.length, 55)
  })

  it('separates services from odometer readings', () => {
    assert.equal(rows.filter((row) => row.kind === 'service').length, 51)
    assert.equal(rows.filter((row) => row.kind === 'odometer').length, 4)
    assert.ok(rows.filter((row) => row.kind === 'odometer').every((row) => row.services.length === 0))
  })

  it('keeps every service listed after a comma', () => {
    const row = rows.find((item) => item.sourceRowId.endsWith(':58'))
    assert.ok(row)
    assert.deepEqual(row.services, [
      'Cambio de rodamientos delanteros',
      'Cambio empacadura tapa válvula',
      'Filtros de gasolina',
      'Limpieza de inyectores',
      'Mantenimiento de frenos delanteros',
      'Spark Plugs',
    ])
  })

  it('preserves the first oil change and accented workshop names', () => {
    const first = rows.find((item) => item.sourceRowId.endsWith(':2'))
    assert.ok(first)
    assert.equal(first.entryDate, '2021-10-20')
    assert.equal(first.odometer, 167848)
    assert.equal(first.costUsd, 25)
    assert.equal(first.workshop, 'PUENTE EL BOQUETE')
    assert.deepEqual(first.services, ['Engine Oil'])

    const workshops = new Set(rows.map((row) => row.workshop))
    assert.ok(workshops.has('SIMEÍ'))
    assert.ok(workshops.has('TALLER SIMEÍ'))
  })

  it('does not import fuel notes and never goes backwards in kilometres', () => {
    assert.equal(
      rows.some((row) => row.notes === 'Sin cola.'),
      false,
    )
    const sorted = [...rows].sort(
      (a, b) => a.entryDate.localeCompare(b.entryDate) || a.odometer - b.odometer,
    )
    let previous = 0
    for (const row of sorted) {
      assert.ok(row.odometer >= previous)
      previous = row.odometer
    }
    assert.equal(previous, 198548)
  })
})
