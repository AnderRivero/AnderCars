import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { CircleDollarSign, Gauge, MapPinned, NotebookText, TriangleAlert } from 'lucide-react'
import { EntryModal } from '../components/EntryModal'
import { Fab } from '../components/Fab'
import { useData } from '../data/DataProvider'
import { carLabel, formatDate, formatKm, formatUsd, todayISO } from '../lib/format'
import { buildAlerts, costByService, costByYear, mileageByYear, observedKm } from '../lib/metrics'

export function DashboardPage() {
  const { cars, services, entries, loading } = useData()
  const location = useLocation()
  const [carId, setCarId] = useState('')
  const [creatingEntry, setCreatingEntry] = useState(false)
  const today = todayISO()

  useEffect(() => {
    const state = location.state as { focus?: string } | null
    if (loading || state?.focus !== 'alertas') return
    document.getElementById('alertas')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [loading, location.key, location.state])

  useEffect(() => {
    if (cars.length === 0) return
    if (carId && cars.some((car) => car.id === carId)) return
    setCarId(cars[0].id)
  }, [carId, cars])

  const car = cars.find((item) => item.id === carId) ?? null
  const carEntries = useMemo(
    () => entries.filter((entry) => entry.carId === carId),
    [carId, entries],
  )
  const alerts = car ? buildAlerts(car, services, entries, today) : []
  const years = mileageByYear(carEntries)
  const costs = costByYear(carEntries)
  const byService = costByService(carEntries, services)
  const spent = carEntries.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0)
  const maxYearKm = Math.max(...years.map((year) => year.km), 1)
  const recurrent = services.some((service) => service.isRecurrent)
  const recent = [...carEntries]
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.odometer - a.odometer)
    .slice(0, 8)

  if (loading) return <p className="lead">Cargando datos…</p>

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Resumen</h1>
          <p className="lead">
            Alertas de servicios recurrentes y el recorrido que llevas registrado.
          </p>
        </div>
        {cars.length > 1 && (
          <label className="field">
            <span>Auto</span>
            <select value={carId} onChange={(event) => setCarId(event.target.value)}>
              {cars.map((item) => (
                <option key={item.id} value={item.id}>
                  {carLabel(item)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {cars.length === 0 && (
        <section className="card empty">
          <p>Todavía no hay autos.</p>
          <p>
            Puedes crear uno en <Link to="/autos">Autos</Link> o recuperar un respaldo desde{' '}
            <Link to="/configuracion">Configuración</Link>.
          </p>
        </section>
      )}

      {car && (
        <>
          {car.year == null && (
            <p className="note">
              A este auto le falta el año. Puedes completarlo en <Link to="/autos">Autos</Link>.
            </p>
          )}

          <section className="grid-stats">
            <article className="stat">
              <span><Gauge size={16} /> Kilometraje actual</span>
              <strong>{formatKm(car.odometer)} km</strong>
            </article>
            <article className="stat">
              <span><MapPinned size={16} /> Recorrido registrado</span>
              <strong>{formatKm(observedKm(carEntries))} km</strong>
            </article>
            <article className="stat">
              <span><CircleDollarSign size={16} /> Gastado</span>
              <strong>{formatUsd(spent)}</strong>
            </article>
            <article className="stat">
              <span><NotebookText size={16} /> Paradas en pits</span>
              <strong>{carEntries.length}</strong>
            </article>
          </section>

          <section className="stack" id="alertas">
            <h2 className="section-title">
              <TriangleAlert size={19} className="warn-icon" />
              Alertas
              {alerts.length > 0 && <span className="count-pill warn">{alerts.length}</span>}
            </h2>
            {!recurrent && (
              <div className="alert soon">
                <span className="lamp" aria-hidden="true" />
                <p>
                  Marca un servicio como recurrente en <Link to="/servicios">Servicios</Link> e indica cada
                  cuántos kilómetros y cada cuántos meses. El aviso salta con el que se cumpla primero.
                </p>
              </div>
            )}
            {recurrent && alerts.length === 0 && <p className="note">Nada pendiente por ahora.</p>}
            <ul className="alert-list">
              {alerts.map((alert) => (
                <li key={alert.serviceId} className={`alert ${alert.status}`}>
                  <span className="lamp" aria-hidden="true" />
                  <div>
                    <strong>{alert.serviceName}</strong>
                    <p>{alert.summary}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="stack">
            <h2>Últimos movimientos</h2>
            {recent.length === 0 ? (
              <p className="note">Todavía no hay movimientos de este auto.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Kilometraje</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDate(entry.entryDate)}</td>
                        <td>{formatKm(entry.odometer)} km</td>
                        <td>
                          {entry.kind === 'odometer'
                            ? 'Lectura de odómetro'
                            : entry.serviceIds
                                .map((id) => services.find((service) => service.id === id)?.name)
                                .filter(Boolean)
                                .join(', ') || 'Servicio'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="stack">
            <h2>Kilometraje por año</h2>
            {years.length === 0 ? (
              <p className="note">Cuando registres lecturas, aquí verás cuánto avanzó cada año.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Año</th>
                      <th>Kilómetros</th>
                      <th>Cierre</th>
                    </tr>
                  </thead>
                  <tbody>
                    {years.map((year) => (
                      <tr key={year.year}>
                        <td>{year.year}</td>
                        <td>
                          <div className="bar-row">
                            <span className="bar-track">
                              <span className="bar" style={{ width: `${(year.km / maxYearKm) * 100}%` }} />
                            </span>
                            <span className="bar-label">{formatKm(year.km)} km</span>
                          </div>
                        </td>
                        <td>{formatKm(year.endOdometer)} km</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="two">
            <div className="stack">
              <h2>Gasto por año</h2>
              {costs.length === 0 ? (
                <p className="note">Todavía no hay costos.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Año</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costs.map((year) => (
                        <tr key={year.year}>
                          <td>{year.year}</td>
                          <td>{formatUsd(year.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="stack">
              <h2>Gasto por servicio</h2>
              <p className="note">Si una parada tiene varios servicios, el costo se reparte en partes iguales.</p>
              {byService.length === 0 ? (
                <p className="note">Todavía no hay costos asociados a servicios.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Servicio</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byService.map((item) => (
                        <tr key={item.serviceId}>
                          <td>{item.name}</td>
                          <td>{formatUsd(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

        </>
      )}

      <Fab label="Nueva entrada a pits" onClick={() => setCreatingEntry(true)} />
      {creatingEntry && <EntryModal defaultCarId={carId} onClose={() => setCreatingEntry(false)} />}
    </>
  )
}
