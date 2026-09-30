import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'
import { parseFuelLog } from './csv'

const historyPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'Fuel_Log.csv')

const sampleCsv = [
  'Row ID,Vehicle ID,Odometer,Qty,Partial Tank,Missed Fill Up,Total Cost,Distance Travelled,Eff,Octane,Fuel Brand,Filling Station,Notes,Day,Month,Year,Receipt Path,Latitude,Longitude,Record Type,Record Desc',
  '1,Chevrolet Aveo,100.0,10,0,0,5.0,0,0,0,,EL PRADO,Sin cola.,1,1,2024,,0,0,0,Fuel Record',
  '2,Chevrolet Aveo,120.0,0,0,0,25.0,0,0,0,,TALLER SIMEÍ ,Incluye filtro,2,1,2024,,0,0,1,"Filtros de gasolina, Engine Oil"',
  '3,Chevrolet Aveo,120.0,0,0,0,0,0,0,0,,,,3,1,2024,,0,0,4,adhoc',
].join('\n')

describe('parseFuelLog', () => {
  it('reads a small export without the personal history file', () => {
    const parsed = parseFuelLog(sampleCsv)
    const rows = parsed.vehicles.flatMap((vehicle) => vehicle.rows)

    assert.equal(parsed.skippedFuel, 1)
    assert.equal(parsed.skippedInvalid, 0)
    assert.equal(parsed.vehicles[0].brand, 'Chevrolet')
    assert.equal(parsed.vehicles[0].model, 'Aveo')
    assert.equal(rows.length, 2)
    assert.deepEqual(rows[0].services, ['Filtros de gasolina', 'Engine Oil'])
    assert.equal(rows[0].workshop, 'TALLER SIMEÍ')
    assert.equal(rows[1].kind, 'odometer')
    assert.deepEqual(rows[1].services, [])
    assert.equal(
      rows.some((row) => row.notes === 'Sin cola.'),
      false,
    )
  })
})

const localHistoryTest = existsSync(historyPath) ? it : it.skip

function loadHistory() {
  const parsed = parseFuelLog(readFileSync(historyPath, 'utf8'))
  const rows = parsed.vehicles.flatMap((vehicle) => vehicle.rows)
  return { parsed, rows }
}

describe('parseFuelLog with the local history file', () => {
  localHistoryTest('keeps one vehicle and skips fuel rows', () => {
    const { parsed, rows } = loadHistory()
    assert.equal(parsed.vehicles.length, 1)
    assert.equal(parsed.vehicles[0].brand, 'Chevrolet')
    assert.equal(parsed.vehicles[0].model, 'Aveo Lt Speed')
    assert.equal(parsed.skippedFuel, 10)
    assert.equal(parsed.skippedInvalid, 0)
    assert.equal(rows.length, 55)
  })

  localHistoryTest('separates services from odometer readings', () => {
    const { rows } = loadHistory()
    assert.equal(rows.filter((row) => row.kind === 'service').length, 51)
    assert.equal(rows.filter((row) => row.kind === 'odometer').length, 4)
    assert.ok(rows.filter((row) => row.kind === 'odometer').every((row) => row.services.length === 0))
  })

  localHistoryTest('keeps every service listed after a comma', () => {
    const { rows } = loadHistory()
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

  localHistoryTest('preserves the first oil change and accented workshop names', () => {
    const { rows } = loadHistory()
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

  localHistoryTest('does not import fuel notes and never goes backwards in kilometres', () => {
    const { rows } = loadHistory()
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
