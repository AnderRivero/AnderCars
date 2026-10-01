import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { buildAlerts, costByService, costByYear, mileageByYear, observedKm } from './metrics'
import type { Entry, Service } from './types'
import { duplicateOdometerReading, minimumOdometer, validateOdometer } from './validate'

function service(partial: Partial<Service> & Pick<Service, 'id' | 'name'>): Service {
  return {
    isRecurrent: true,
    intervalKm: null,
    intervalMonths: null,
    ...partial,
  }
}

function entry(partial: Partial<Entry> & Pick<Entry, 'id' | 'entryDate' | 'odometer'>): Entry {
  return {
    carId: 'car-1',
    kind: 'service',
    workshop: null,
    costUsd: null,
    notes: null,
    serviceIds: ['oil'],
    ...partial,
  }
}

describe('buildAlerts', () => {
  const oil = service({ id: 'oil', name: 'Aceite', intervalKm: 5000, intervalMonths: 6 })

  it('marks a service overdue when either interval is already due', () => {
    const alerts = buildAlerts(
      { id: 'car-1', odometer: 10000 },
      [oil],
      [entry({ id: 'e1', entryDate: '2026-01-01', odometer: 4000 })],
      '2026-09-30',
    )
    assert.equal(alerts.length, 1)
    assert.equal(alerts[0].status, 'overdue')
    assert.match(alerts[0].summary, /Vencido/)
  })

  it('marks a service soon when the remaining kilometres are inside the margin', () => {
    const alerts = buildAlerts(
      { id: 'car-1', odometer: 10000 },
      [oil],
      [entry({ id: 'e1', entryDate: '2026-09-20', odometer: 5400 })],
      '2026-09-30',
    )
    assert.equal(alerts[0]?.status, 'soon')
  })

  it('stays quiet while both intervals still have room', () => {
    const alerts = buildAlerts(
      { id: 'car-1', odometer: 1000 },
      [oil],
      [entry({ id: 'e1', entryDate: '2026-09-01', odometer: 800 })],
      '2026-09-30',
    )
    assert.deepEqual(alerts, [])
  })

  it('reports a recurrent service that has never been logged', () => {
    const alerts = buildAlerts({ id: 'car-1', odometer: 1000 }, [oil], [], '2026-09-30')
    assert.equal(alerts[0]?.status, 'never')
  })
})

describe('stats', () => {
  const entries = [
    entry({ id: 'a', entryDate: '2021-10-20', odometer: 100, costUsd: 30, serviceIds: ['oil', 'filter'] }),
    entry({ id: 'b', entryDate: '2021-12-01', odometer: 150, costUsd: null, serviceIds: ['oil'] }),
    entry({ id: 'c', entryDate: '2022-02-01', odometer: 400, costUsd: 10, serviceIds: ['oil'] }),
  ]
  const services = [
    service({ id: 'oil', name: 'Aceite', isRecurrent: false }),
    service({ id: 'filter', name: 'Filtro', isRecurrent: false }),
  ]

  it('counts kilometres from the previous year-end reading', () => {
    assert.deepEqual(mileageByYear(entries), [
      { year: 2022, km: 250, endOdometer: 400 },
      { year: 2021, km: 50, endOdometer: 150 },
    ])
    assert.deepEqual(costByYear(entries), [
      { year: 2022, total: 10 },
      { year: 2021, total: 30 },
    ])
    assert.equal(observedKm(entries), 300)
  })

  it('splits an entry cost evenly across its services', () => {
    const costs = costByService(entries, services)
    const oil = costs.find((item) => item.serviceId === 'oil')
    const filter = costs.find((item) => item.serviceId === 'filter')
    assert.equal(oil?.total, 25)
    assert.equal(filter?.total, 15)
  })
})

describe('validateOdometer', () => {
  it('allows the same reading and rejects a lower one', () => {
    assert.equal(validateOdometer(100, 100), null)
    assert.equal(validateOdometer(80, 120, 80), null)
    assert.match(validateOdometer(99, 100) ?? '', /no puede ser menor/)
    assert.match(validateOdometer(79, 120, 80) ?? '', /no puede ser menor/)
    assert.equal(minimumOdometer([{ id: 'a', carId: 'car', odometer: 80 }, { id: 'b', carId: 'car', odometer: 120 }], 'car', 'b'), 80)
  })

  it('blocks a second odometer reading for the same car, day and kilometres', () => {
    const readings = [
      { id: 'a', carId: 'car', entryDate: '2026-10-01', odometer: 1200, kind: 'odometer' },
      { id: 'b', carId: 'car', entryDate: '2026-10-01', odometer: 1200, kind: 'service' },
    ]
    assert.equal(
      duplicateOdometerReading(readings, { carId: 'car', entryDate: '2026-10-01', odometer: 1200 }),
      true,
    )
    assert.equal(
      duplicateOdometerReading(readings, { id: 'a', carId: 'car', entryDate: '2026-10-01', odometer: 1200 }),
      false,
    )
    assert.equal(
      duplicateOdometerReading(readings, { carId: 'car', entryDate: '2026-10-02', odometer: 1200 }),
      false,
    )
  })
})
