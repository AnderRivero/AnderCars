import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { deleteService, saveService } from '../lib/api'
import { Modal } from '../components/Modal'
import { useData } from '../data/DataProvider'
import { intervalLabel } from '../lib/format'
import { errorText, parseDecimal } from '../lib/validate'
import type { Service } from '../lib/types'

type Draft = {
  id?: string
  name: string
  isRecurrent: boolean
  intervalKm: string
  intervalMonths: string
}

const emptyDraft: Draft = {
  name: '',
  isRecurrent: false,
  intervalKm: '',
  intervalMonths: '',
}

export function ServicesPage() {
  const { services, loading, refresh } = useData()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function openNew() {
    setDraft(emptyDraft)
    setError(null)
  }

  function openEdit(service: Service) {
    setDraft({
      id: service.id,
      name: service.name,
      isRecurrent: service.isRecurrent,
      intervalKm: service.intervalKm ? String(service.intervalKm) : '',
      intervalMonths: service.intervalMonths ? String(service.intervalMonths) : '',
    })
    setError(null)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    const name = draft.name.trim()
    if (!name) {
      setError('Escribe el nombre del servicio.')
      return
    }
    const duplicate = services.some(
      (service) => service.id !== draft.id && service.name.trim().toLowerCase() === name.toLowerCase(),
    )
    if (duplicate) {
      setError('Ya existe un servicio con ese nombre.')
      return
    }

    let intervalKm: number | null = null
    let intervalMonths: number | null = null
    if (draft.isRecurrent) {
      if (draft.intervalKm.trim()) {
        const value = parseDecimal(draft.intervalKm)
        if (value == null || value <= 0 || !Number.isInteger(value)) {
          setError('Los kilómetros del intervalo tienen que ser un entero mayor que cero.')
          return
        }
        intervalKm = value
      }
      if (draft.intervalMonths.trim()) {
        const value = parseDecimal(draft.intervalMonths)
        if (value == null || value <= 0 || !Number.isInteger(value)) {
          setError('Los meses del intervalo tienen que ser un entero mayor que cero.')
          return
        }
        intervalMonths = value
      }
      if (intervalKm == null && intervalMonths == null) {
        setError('Un servicio recurrente necesita kilómetros, meses, o los dos.')
        return
      }
    }

    setSaving(true)
    setError(null)
    try {
      await saveService({
        id: draft.id,
        name,
        isRecurrent: draft.isRecurrent,
        intervalKm,
        intervalMonths,
      })
      setDraft(null)
      await refresh()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(service: Service) {
    const confirmed = window.confirm(`¿Eliminar el servicio "${service.name}"?`)
    if (!confirmed) return
    try {
      await deleteService(service.id)
      await refresh()
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Servicios</h1>
          <p className="lead">
            El nombre y, si se repite, cada cuántos kilómetros y cada cuántos meses avisar. Salta el que
            se cumpla primero.
          </p>
        </div>
        <button className="btn primary" type="button" onClick={openNew}>
          <Plus size={17} />
          Nuevo servicio
        </button>
      </div>

      {error && !draft && <p className="error">{error}</p>}
      {loading ? (
        <p className="lead">Cargando servicios…</p>
      ) : services.length === 0 ? (
        <p className="note">Todavía no hay servicios. Puedes crearlos aquí o importar el historial.</p>
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Aviso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id}>
                  <td>{service.name}</td>
                  <td>{intervalLabel(service)}</td>
                  <td className="row-actions">
                    <button
                      className="icon-action"
                      type="button"
                      aria-label={`Editar ${service.name}`}
                      title="Editar"
                      onClick={() => openEdit(service)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-action danger"
                      type="button"
                      aria-label={`Eliminar ${service.name}`}
                      title="Eliminar"
                      onClick={() => void onDelete(service)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft && (
        <Modal title={draft.id ? 'Editar servicio' : 'Nuevo servicio'} onClose={() => setDraft(null)}>
          <form className="form-grid" onSubmit={(event) => void onSubmit(event)}>
            <label className="field full">
              <span>Nombre</span>
              <input
                autoFocus
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                required
              />
            </label>
            <label className="check full">
              <input
                type="checkbox"
                checked={draft.isRecurrent}
                onChange={(event) => setDraft({ ...draft, isRecurrent: event.target.checked })}
              />
              Es un servicio recurrente
            </label>
            {draft.isRecurrent && (
              <>
                <label className="field">
                  <span>Cada cuántos km</span>
                  <input
                    inputMode="numeric"
                    value={draft.intervalKm}
                    onChange={(event) => setDraft({ ...draft, intervalKm: event.target.value })}
                    placeholder="5000"
                  />
                </label>
                <label className="field">
                  <span>Cada cuántos meses</span>
                  <input
                    inputMode="numeric"
                    value={draft.intervalMonths}
                    onChange={(event) => setDraft({ ...draft, intervalMonths: event.target.value })}
                    placeholder="6"
                  />
                </label>
                <p className="note full">Puedes dejar uno de los dos vacío. El aviso usa el que llegue primero.</p>
              </>
            )}
            {error && <p className="error full">{error}</p>}
            <div className="actions full">
              <button className="btn primary" type="submit" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
