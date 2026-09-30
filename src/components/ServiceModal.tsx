import { useState, type FormEvent } from 'react'
import { Pencil, Plus, TriangleAlert } from 'lucide-react'
import { Modal } from './Modal'
import { saveService } from '../lib/api'
import { useData } from '../data/DataProvider'
import { errorText, parseDecimal } from '../lib/validate'
import type { Service } from '../lib/types'

type Draft = {
  id?: string
  name: string
  isRecurrent: boolean
  intervalKm: string
  intervalMonths: string
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

function draftFrom(service: Service | null, initialName: string): Draft {
  if (!service) {
    return { name: initialName, isRecurrent: false, intervalKm: '', intervalMonths: '' }
  }
  return {
    id: service.id,
    name: service.name,
    isRecurrent: service.isRecurrent,
    intervalKm: service.intervalKm ? String(service.intervalKm) : '',
    intervalMonths: service.intervalMonths ? String(service.intervalMonths) : '',
  }
}

export function ServiceModal({
  service = null,
  initialName = '',
  onClose,
  onSaved,
  onUseExisting,
}: {
  service?: Service | null
  initialName?: string
  onClose: () => void
  onSaved?: (service: Service) => void
  onUseExisting?: (service: Service) => void
}) {
  const { services, refresh } = useData()
  const [draft, setDraft] = useState<Draft>(() => draftFrom(service, initialName.trim()))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const similar = findSimilar(services, draft.name, draft.id)

  function openEdit(next: Service) {
    setDraft(draftFrom(next, ''))
    setError(null)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
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
      const id = await saveService({
        id: draft.id,
        name,
        isRecurrent: draft.isRecurrent,
        intervalKm,
        intervalMonths,
      })
      const snapshot = await refresh()
      const saved = snapshot.services.find((item) => item.id === id)
      if (saved) onSaved?.(saved)
      onClose()
    } catch (err) {
      setError(errorText(err))
      setSaving(false)
    }
  }

  return (
    <Modal stacked title={draft.id ? 'Editar servicio' : 'Nuevo servicio'} onClose={onClose}>
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
              {similar.matches.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="chip"
                  onClick={() => (onUseExisting ? onUseExisting(item) : openEdit(item))}
                >
                  {onUseExisting ? <Plus size={13} /> : <Pencil size={13} />}
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
            <p className="note">
              {onUseExisting
                ? 'Toca uno para usarlo en esta parada, en lugar de crear un duplicado.'
                : 'Toca uno para editarlo en lugar de crear un duplicado.'}
            </p>
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
  )
}
