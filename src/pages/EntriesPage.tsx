import { useRef, useState } from 'react'
import { Pencil, Trash2, Upload } from 'lucide-react'
import { EntryModal } from '../components/EntryModal'
import { Fab } from '../components/Fab'
import { deleteEntry, importHistory } from '../lib/api'
import { parseFuelLog } from '../lib/csv'
import { useData } from '../data/DataProvider'
import { carLabel, formatDate, formatKm, formatUsd } from '../lib/format'
import { errorText } from '../lib/validate'
import type { Entry } from '../lib/types'

export function EntriesPage() {
  const { cars, services, entries, loading, refresh } = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [modal, setModal] = useState<{ entry: Entry | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const serviceEntries = entries.filter((entry) => entry.kind === 'service')

  async function onDelete(entry: Entry) {
    const confirmed = window.confirm('¿Eliminar esta entrada a pits?')
    if (!confirmed) return
    try {
      await deleteEntry(entry.id)
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
          <h1>Entrada a pits</h1>
          <p className="lead">Cada parada en boxes de tu auto: servicios y reparaciones, de la más reciente a la más antigua.</p>
        </div>
        <label className="btn ghost file-btn">
          <Upload size={16} />
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
      {importMessage && <p className="note success">{importMessage}</p>}
      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="lead">Cargando paradas…</p>
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
                    <td className="nowrap">{formatDate(entry.entryDate)}</td>
                    <td>{car ? carLabel(car) : 'Auto'}</td>
                    <td className="nowrap">{formatKm(entry.odometer)}</td>
                    <td>
                      {entry.serviceIds
                        .map((id) => services.find((service) => service.id === id)?.name)
                        .filter(Boolean)
                        .join(', ')}
                    </td>
                    <td>{entry.workshop ?? ''}</td>
                    <td className="nowrap">{entry.costUsd == null ? '' : formatUsd(entry.costUsd)}</td>
                    <td>{entry.notes ?? ''}</td>
                    <td className="row-actions">
                      <button
                        className="icon-action"
                        type="button"
                        aria-label="Editar entrada a pits"
                        title="Editar"
                        onClick={() => setModal({ entry })}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-action danger"
                        type="button"
                        aria-label="Eliminar entrada a pits"
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
          {serviceEntries.length === 0 && (
            <p className="note">
              Todavía no hay paradas en pits. Usa el botón + o importa <code>docs/Fuel_Log.csv</code>.
            </p>
          )}
        </div>
      )}

      <Fab label="Nueva entrada a pits" onClick={() => setModal({ entry: null })} />
      {modal && <EntryModal entry={modal.entry} onClose={() => setModal(null)} />}
    </>
  )
}
