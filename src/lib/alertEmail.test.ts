import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { buildAlerts } from './metrics'
import { emailFor, maintenanceAlerts, type AlertCar, type AlertEntry, type AlertService } from '../../supabase/functions/check-alerts/alerts'
import type { Entry, Service } from './types'

const car: AlertCar = { id: 'car-1', brand: 'Chevrolet', model: 'Aveo', year: 2016, odometer: 10000 }
const oil: AlertService = { id: 'oil', name: 'Aceite', isRecurrent: true, intervalKm: 5000, intervalMonths: 6 }

function mailEntry(partial: Partial<AlertEntry> & Pick<AlertEntry, 'id' | 'entryDate' | 'odometer'>): AlertEntry {
  return { carId: 'car-1', serviceIds: ['oil'], ...partial }
}

function dashboardEntry(partial: Partial<Entry> & Pick<Entry, 'id' | 'entryDate' | 'odometer'>): Entry {
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

const dashboardOil: Service = { ...oil }

describe('maintenanceAlerts', () => {
  it('uses the same soon and overdue result as the dashboard', () => {
    const cases = [
      { entryDate: '2026-01-01', odometer: 4000, today: '2026-09-30', expected: 'overdue' },
      { entryDate: '2026-09-20', odometer: 5400, today: '2026-09-30', expected: 'soon' },
    ]
    for (const item of cases) {
      const entry = mailEntry({ id: 'e1', entryDate: item.entryDate, odometer: item.odometer })
      const mailed = maintenanceAlerts([car], [oil], [entry], item.today)
      const shown = buildAlerts(
        { id: car.id, odometer: car.odometer },
        [dashboardOil],
        [dashboardEntry({ id: 'e1', entryDate: item.entryDate, odometer: item.odometer })],
        item.today,
      )
      assert.equal(mailed[0]?.status, item.expected)
      assert.equal(shown[0]?.status, mailed[0]?.status)
      assert.equal(mailed[0]?.anchorEntryId, 'e1')
    }
  })

  it('does not email a recurrent service that was never logged', () => {
    assert.deepEqual(maintenanceAlerts([car], [oil], [], '2026-09-30'), [])
  })

  it('groups the subject and escapes the service name', () => {
    const alerts = maintenanceAlerts(
      [car],
      [{ ...oil, name: 'Aceite <filtro>' }],
      [mailEntry({ id: 'e1', entryDate: '2026-01-01', odometer: 4000 })],
      '2026-09-30',
    )
    const message = emailFor(alerts, 'https://anderrivero.github.io/AnderCars/#/')
    assert.match(message.subject, /Aceite <filtro> está vencido/)
    assert.match(message.html, /Aceite &lt;filtro&gt;/)
    assert.doesNotMatch(message.html, /Aceite <filtro>/)
  })
})
