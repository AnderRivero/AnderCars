import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { deleteEntry, importHistory, saveServiceEntry } from '../lib/api'
import { parseFuelLog } from '../lib/csv'
import { useData } from '../data/DataProvider'
import { carLabel, formatDate, formatKm, formatUsd, kmInputValue, todayISO } from '../lib/format'
import { errorText, minimumOdometer, parseDecimal, validateOdometer } from '../lib/validate'
import type { Entry } from '../lib/types'

export function EntriesPage() {
  const { cars, services, entries, loading, refresh } = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [carId, setCarId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [entryDate, setEntryDate] = useState(todayISO)
  const [kmText, setKmText] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [serviceQuery, setServiceQuery] = useState('')
  const [workshop, setWorkshop] = useState('')
  const [costText, setCostText] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (editingId || cars.length === 0) return
    if (carId && cars.some((car) => car.id === carId)) return
    setCarId(cars[0].id)
    setKmText(kmInputValue(minimumOdometer(entries, cars[0].id)))
  }, [carId, cars, editingId, entries])

  const serviceEntries = entries.filter((entry) => entry.kind === 'service' && (!carId || entry.carId === carId))
  const workshops = [...new Set(entries.map((entry) => entry.workshop).filter((value): value is string => Boolean(value)))].sort(
    (a, b) => a.localeCompare(b, 'es'),
  )
  const visibleServices = services.filter((service) =>
    service.name.toLowerCase().includes(serviceQuery.trim().toLowerCase()),
  )

  function onCarChange(nextCarId: string) {
    setCarId(nextCarId)
    if (!editingId) setKmText(kmInputValue(minimumOdometer(entries, nextCarId)))
  }

  function toggleService(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function startEdit(entry: Entry) {
    setEditingId(entry.id)
    setCarId(entry.carId)
    setEntryDate(entry.entryDate)
    setKmText(kmInputValue(entry.odometer))
    setSelected(new Set(entry.serviceIds))
    setWorkshop(entry.workshop ?? '')
    setCostText(entry.costUsd == null ? '' : String(entry.costUsd))
    setNotes(entry.notes ?? '')
    setError(null)
  }

  function clearForm(nextEntries = entries, nextCarId = carId) {
    setEditingId(null)
    setEntryDate(todayISO())
    setKmText(nextCarId ? kmInputValue(minimumOdometer(nextEntries, nextCarId, undefined)) : '')
    setSelected(new Set())
    setWorkshop('')
    setCostText('')
    setNotes('')
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!carId) {
      setError('Primero crea un auto.')
      return
    }
    if (!entryDate) {
      setError('Elige la fecha.')
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
    if (selected.size === 0) {
      setError('Elige al menos un servicio.')
      return
    }
    let cost: number | null = null
    if (costText.trim()) {
      const parsed = parseDecimal(costText)
      if (parsed == null || parsed < 0) {
        setError('El costo tiene que ser un número mayor o igual que cero.')
        return
      }
      cost = Math.round(parsed * 100) / 100
    }

    setSaving(true)
    setError(null)
    try {
      await saveServiceEntry({
        id: editingId ?? undefined,
        carId,
        entryDate,
        odometer: km,
        workshop,
        costUsd: cost,
        notes,
        serviceIds: [...selected],
      })
      try {
        const snapshot = await refresh()
        clearForm(snapshot.entries, carId)
      } catch (refreshError) {
        clearForm()
        setError(errorText(refreshError))
      }
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(entry: Entry) {
    const confirmed = window.confirm('¿Eliminar esta entrada?')
    if (!confirmed) return
    try {
      await deleteEntry(entry.id)
      if (editingId === entry.id) clearForm()
      await refresh()
    } catch (err) {
      setError(errorText(err))
    }
  }

  async function onImport(file: File) {
    setImporting(true)
    setError(null)
    setImportMessage(null)
    try {
      const parsed = parseFuelLog(await file.text())
      let inserted = 0
      let skipped = 0
      for (const vehicle of parsed.vehicles) {
        const result = await importHistory({
          brand: vehicle.brand,
          model: vehicle.model,
          rows: vehicle.rows.map((row) => ({
            source_row_id: row.sourceRowId,
            entry_date: row.entryDate,
            odometer: row.odometer,
            kind: row.kind,
            workshop: row.workshop,
            cost_usd: row.costUsd,
            notes: row.notes,
            services: row.services,
          })),
        })
        inserted += result.inserted
        skipped += result.skipped
      }
      await refresh()
      const parts = [
        `Se importaron ${inserted} entradas.`,
        `Se omitieron ${parsed.skippedFuel} cargas de gasolina.`,
      ]
      if (skipped > 0) parts.push(`${skipped} ya estaban cargadas.`)
      if (parsed.skippedInvalid > 0) parts.push(`${parsed.skippedInvalid} filas no se pudieron leer.`)
      setImportMessage(parts.join(' '))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Entradas</h1>
          <p className="lead">
            Registra un servicio o una reparación. El kilometraje no puede quedar por debajo de la última
            lectura; sí puede repetirse.
          </p>
        </div>
        <label className="btn ghost file-btn">
          {importing ? 'Importando…' : 'Importar historial'}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            disabled={importing}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onImport(file)
            }}
          />
        </label>
      </div>
      <p className="note">
        Elige <code>docs/Fuel_Log.csv</code>. Se cargan servicios y lecturas de odómetro. Las cargas de
        gasolina se dejan fuera. Los servicios quedan como en el archivo; márcalos como recurrentes después.
      </p>
      {importMessage && <p className="note success">{importMessage}</p>}

      {cars.length === 0 && !loading && (
        <p className="note">
          Si todavía no importas, crea el auto en <Link to="/autos">Autos</Link>.
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
        <label className="field">
          <span>Costo en USD</span>
          <input
            inputMode="decimal"
            value={costText}
            onChange={(event) => setCostText(event.target.value)}
            placeholder="Opcional"
          />
        </label>
        <label className="field full">
          <span>Taller o agencia</span>
          <input
            list="workshops"
            value={workshop}
            onChange={(event) => setWorkshop(event.target.value)}
            placeholder="Opcional. Aparecen los que ya usaste."
          />
          <datalist id="workshops">
            {workshops.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <div className="field full">
          <span>Servicios</span>
          <input
            value={serviceQuery}
            onChange={(event) => setServiceQuery(event.target.value)}
            placeholder="Filtrar servicios"
          />
          <div className="check-list">
            {visibleServices.map((service) => (
              <label key={service.id}>
                <input
                  type="checkbox"
                  checked={selected.has(service.id)}
                  onChange={() => toggleService(service.id)}
                />
                {service.name}
              </label>
            ))}
            {visibleServices.length === 0 && <p className="note">No hay servicios con ese filtro.</p>}
          </div>
          <p className="note">{selected.size} seleccionados.</p>
        </div>
        <label className="field full">
          <span>Notas</span>
          <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        {error && <p className="error full">{error}</p>}
        <div className="actions full">
          <button className="btn primary" type="submit" disabled={saving || cars.length === 0}>
            {saving ? 'Guardando…' : editingId ? 'Actualizar entrada' : 'Registrar entrada'}
          </button>
          {editingId && (
            <button className="btn ghost" type="button" onClick={() => clearForm()}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <p className="lead">Cargando entradas…</p>
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Auto</th>
                <th>Km</th>
                <th>Servicios</th>
                <th>Taller</th>
                <th>Costo</th>
                <th>Notas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {serviceEntries.map((entry) => {
                const car = cars.find((item) => item.id === entry.carId)
                return (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.entryDate)}</td>
                    <td>{car ? carLabel(car) : 'Auto'}</td>
                    <td>{formatKm(entry.odometer)}</td>
                    <td>
                      {entry.serviceIds
                        .map((id) => services.find((service) => service.id === id)?.name)
                        .filter(Boolean)
                        .join(', ')}
                    </td>
                    <td>{entry.workshop ?? ''}</td>
                    <td>{entry.costUsd == null ? '' : formatUsd(entry.costUsd)}</td>
                    <td>{entry.notes ?? ''}</td>
                    <td className="row-actions">
                      <button className="btn ghost" type="button" onClick={() => startEdit(entry)}>
                        Editar
                      </button>
                      <button className="btn danger" type="button" onClick={() => void onDelete(entry)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {serviceEntries.length === 0 && <p className="note">Todavía no hay entradas de servicio.</p>}
        </div>
      )}
    </>
  )
}
