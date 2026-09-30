import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
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

const STOPWORDS = new Set(['del', 'los', 'las', 'con', 'para', 'por'])

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function findSimilar(services: Service[], name: string, excludeId?: string) {
  const query = normalize(name)
  if (query.length < 2) return { matches: [] as Service[], exact: false }
  const others = services.filter((service) => service.id !== excludeId)
  const exact = others.some((service) => normalize(service.name) === query)
  const words = query.split(' ').filter((word) => word.length >= 3 && !STOPWORDS.has(word))
  const needed = words.length <= 2 ? words.length : words.length - 1
  const scored = others
    .map((service) => {
      const candidate = normalize(service.name)
      if (candidate === query) return { service, score: 1000 }
      if (candidate.includes(query) || query.includes(candidate)) return { service, score: 100 }
      const hits = words.filter((word) => candidate.includes(word)).length
      return { service, score: needed > 0 && hits >= needed ? hits : 0 }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.service.name.localeCompare(b.service.name, 'es'))
  return { matches: scored.slice(0, 6).map((item) => item.service), exact }
}

export function ServicesPage() {
  const { services, loading, refresh } = useData()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const similar = draft ? findSimilar(services, draft.name, draft.id) : { matches: [], exact: false }

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
    if (findSimilar(services, name, draft.id).exact) {
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
                autoComplete="off"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                required
              />
            </label>
            {similar.matches.length > 0 && (
              <div className={similar.exact ? 'suggest full exact' : 'suggest full'}>
                <p className="suggest-title">
                  {similar.exact ? (
                    <>
                      <TriangleAlert size={15} />
                      Ya existe un servicio con ese nombre.
                    </>
                  ) : (
                    'Ya tienes servicios parecidos:'
                  )}
                </p>
                <div className="suggest-list">
                  {similar.matches.map((service) => (
                    <button key={service.id} type="button" className="chip" onClick={() => openEdit(service)}>
                      <Pencil size={13} />
                      <span>{service.name}</span>
                    </button>
                  ))}
                </div>
                <p className="note">Toca uno para editarlo en lugar de crear un duplicado.</p>
              </div>
            )}
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
              <button className="btn primary" type="submit" disabled={saving || similar.exact}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
