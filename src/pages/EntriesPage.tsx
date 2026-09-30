import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { EntryModal } from '../components/EntryModal'
import { Fab } from '../components/Fab'
import { deleteEntry } from '../lib/api'
import { useData } from '../data/DataProvider'
import { carLabel, formatDate, formatKm, formatUsd } from '../lib/format'
import { errorText } from '../lib/validate'
import type { Entry } from '../lib/types'

export function EntriesPage() {
  const { cars, services, entries, loading, refresh } = useData()
  const [modal, setModal] = useState<{ entry: Entry | null } | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Entrada a pits</h1>
          <p className="lead">Cada parada en boxes de tu auto: servicios y reparaciones, de la más reciente a la más antigua.</p>
        </div>
      </div>
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
              Todavía no hay paradas en pits. Usa el botón + para registrar una.
            </p>
          )}
        </div>
      )}

      <Fab label="Nueva entrada a pits" onClick={() => setModal({ entry: null })} />
      {modal && <EntryModal entry={modal.entry} onClose={() => setModal(null)} />}
    </>
  )
}
