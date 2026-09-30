import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { deleteEntry, saveOdometerEntry } from '../lib/api'
import { useData } from '../data/DataProvider'
import { carLabel, formatDate, formatKm, kmInputValue, todayISO } from '../lib/format'
import { errorText, minimumOdometer, parseDecimal, validateOdometer } from '../lib/validate'
import type { Entry } from '../lib/types'

export function OdometerPage() {
  const { cars, entries, loading, refresh } = useData()
  const [carId, setCarId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [entryDate, setEntryDate] = useState(todayISO)
  const [kmText, setKmText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editingId || cars.length === 0) return
    if (carId && cars.some((car) => car.id === carId)) return
    setCarId(cars[0].id)
    setKmText(kmInputValue(minimumOdometer(entries, cars[0].id)))
  }, [carId, cars, editingId, entries])

  const readings = entries.filter((entry) => entry.kind === 'odometer' && (!carId || entry.carId === carId))

  function onCarChange(nextCarId: string) {
    setCarId(nextCarId)
    if (!editingId) setKmText(kmInputValue(minimumOdometer(entries, nextCarId)))
  }

  function startEdit(entry: Entry) {
    setEditingId(entry.id)
    setCarId(entry.carId)
    setEntryDate(entry.entryDate)
    setKmText(kmInputValue(entry.odometer))
    setError(null)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!carId) {
      setError('Primero crea un auto.')
      return
    }
    const km = parseDecimal(kmText)
    if (km == null) {
      setError('Escribe el kilometraje.')
      return
    }
    const original = entries.find((entry) => entry.id === editingId)
    const kmError = validateOdometer(
      km,
      minimumOdometer(entries, carId, editingId ?? undefined),
      original?.odometer,
    )
    if (kmError) {
      setError(kmError)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await saveOdometerEntry({
        id: editingId ?? undefined,
        carId,
        entryDate,
        odometer: km,
      })
      setEditingId(null)
      setEntryDate(todayISO())
      try {
        const snapshot = await refresh()
        setKmText(kmInputValue(minimumOdometer(snapshot.entries, carId)))
      } catch (refreshError) {
        setKmText(kmInputValue(km))
        setError(errorText(refreshError))
      }
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(entry: Entry) {
    const confirmed = window.confirm('¿Eliminar esta lectura?')
    if (!confirmed) return
    try {
      await deleteEntry(entry.id)
      if (editingId === entry.id) setEditingId(null)
      const snapshot = await refresh()
      setKmText(kmInputValue(minimumOdometer(snapshot.entries, carId)))
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Odómetro</h1>
          <p className="lead">Actualiza solo la fecha y el kilometraje, sin registrar un servicio.</p>
        </div>
      </div>

      {cars.length === 0 && !loading && (
        <p className="note">
          Crea un auto en <Link to="/autos">Autos</Link> o importa el historial en{' '}
          <Link to="/entradas">Entradas</Link>.
        </p>
      )}

      <form className="card form-grid" onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>Auto</span>
          <select value={carId} onChange={(event) => onCarChange(event.target.value)} required>
            <option value="" disabled>
              Elige un auto
            </option>
            {cars.map((car) => (
              <option key={car.id} value={car.id}>
                {carLabel(car)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Fecha</span>
          <input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} required />
        </label>
        <label className="field">
          <span>Kilometraje</span>
          <input
            inputMode="decimal"
            value={kmText}
            onChange={(event) => setKmText(event.target.value)}
            required
          />
        </label>
        {error && <p className="error full">{error}</p>}
        <div className="actions full">
          <button className="btn primary" type="submit" disabled={saving || cars.length === 0}>
            {saving ? 'Guardando…' : editingId ? 'Actualizar lectura' : 'Registrar kilometraje'}
          </button>
          {editingId && (
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setEditingId(null)
                setEntryDate(todayISO())
                setKmText(kmInputValue(minimumOdometer(entries, carId)))
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <p className="lead">Cargando lecturas…</p>
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Auto</th>
                <th>Kilometraje</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {readings.map((entry) => {
                const car = cars.find((item) => item.id === entry.carId)
                return (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.entryDate)}</td>
                    <td>{car ? carLabel(car) : 'Auto'}</td>
                    <td>{formatKm(entry.odometer)} km</td>
                    <td className="row-actions">
                      <button
                        className="icon-action"
                        type="button"
                        aria-label="Editar lectura"
                        title="Editar"
                        onClick={() => startEdit(entry)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-action danger"
                        type="button"
                        aria-label="Eliminar lectura"
                        title="Eliminar"
                        onClick={() => void onDelete(entry)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {readings.length === 0 && <p className="note">Todavía no hay lecturas sueltas de odómetro.</p>}
        </div>
      )}
    </>
  )
}
