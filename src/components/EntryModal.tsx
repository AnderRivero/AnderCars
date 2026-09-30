import { useCallback, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Check, Plus, RefreshCw, Search } from 'lucide-react'
import { Modal } from './Modal'
import { ServiceModal } from './ServiceModal'
import { useData } from '../data/DataProvider'
import { saveServiceEntry } from '../lib/api'
import { carLabel, formatDate, kmInputValue, todayISO } from '../lib/format'
import { errorText, minimumOdometer, parseDecimal, validateOdometer } from '../lib/validate'
import type { Entry } from '../lib/types'

export function EntryModal({
  entry = null,
  defaultCarId,
  onClose,
}: {
  entry?: Entry | null
  defaultCarId?: string
  onClose: () => void
}) {
  const { cars, services, entries, refresh } = useData()
  const initialCarId =
    entry?.carId ??
    (defaultCarId && cars.some((car) => car.id === defaultCarId) ? defaultCarId : (cars[0]?.id ?? ''))

  const [carId, setCarId] = useState(initialCarId)
  const [entryDate, setEntryDate] = useState(entry?.entryDate ?? todayISO())
  const [kmText, setKmText] = useState(() =>
    entry ? kmInputValue(entry.odometer) : initialCarId ? kmInputValue(minimumOdometer(entries, initialCarId)) : '',
  )
  const [selected, setSelected] = useState<Set<string>>(() => new Set(entry?.serviceIds ?? []))
  const [serviceQuery, setServiceQuery] = useState('')
  const [workshop, setWorkshop] = useState(entry?.workshop ?? '')
  const [costText, setCostText] = useState(entry?.costUsd == null ? '' : String(entry.costUsd))
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [creatingService, setCreatingService] = useState(false)
  const creatingRef = useRef(false)
  creatingRef.current = creatingService
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const requestClose = useCallback(() => {
    if (creatingRef.current) return
    onCloseRef.current()
  }, [])

  const workshops = [
    ...new Set(entries.map((item) => item.workshop).filter((value): value is string => Boolean(value))),
  ].sort((a, b) => a.localeCompare(b, 'es'))
  const query = serviceQuery.trim().toLowerCase()
  const visibleServices = services.filter((service) => service.name.toLowerCase().includes(query))

  function onCarChange(nextCarId: string) {
    setCarId(nextCarId)
    if (!entry) setKmText(kmInputValue(minimumOdometer(entries, nextCarId)))
  }

  function toggleService(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
    const kmError = validateOdometer(km, minimumOdometer(entries, carId, entry?.id), entry?.odometer)
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
        id: entry?.id,
        carId,
        entryDate,
        odometer: km,
        workshop,
        costUsd: cost,
        notes,
        serviceIds: [...selected],
      })
    } catch (err) {
      setError(errorText(err))
      setSaving(false)
      return
    }
    await refresh().catch(() => undefined)
    onClose()
  }

  return (
    <>
    <Modal
      wide
      title={entry ? 'Editar entrada a pits' : 'Nueva entrada a pits'}
      subtitle={
        entry
          ? `Registrada el ${formatDate(entry.entryDate)}.`
          : 'Registra un servicio o una reparación. El kilometraje no puede bajar de la última lectura.'
      }
      onClose={requestClose}
    >
      {cars.length === 0 ? (
        <p className="note">
          Primero crea un auto en{' '}
          <Link to="/autos" onClick={onClose}>
            Autos
          </Link>
          .
        </p>
      ) : (
        <form className="form-grid" onSubmit={(event) => void onSubmit(event)}>
          <label className="field">
            <span>Auto</span>
            <select value={carId} onChange={(event) => onCarChange(event.target.value)} required>
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
            <input inputMode="decimal" value={kmText} onChange={(event) => setKmText(event.target.value)} required />
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

          <div className="field full">
            <div className="field-head">
              <span>Servicios</span>
              <span className={selected.size > 0 ? 'count-pill on' : 'count-pill'}>
                {selected.size === 1 ? '1 seleccionado' : `${selected.size} seleccionados`}
              </span>
              {selected.size > 0 && (
                <button type="button" className="link-btn" onClick={() => setSelected(new Set())}>
                  Limpiar
                </button>
              )}
              <button className="btn ghost compact" type="button" onClick={() => setCreatingService(true)}>
                <Plus size={14} />
                Nuevo servicio
              </button>
            </div>
            <div className="search-input">
              <Search size={16} />
              <input
                value={serviceQuery}
                onChange={(event) => setServiceQuery(event.target.value)}
                placeholder="Buscar servicio"
                aria-label="Buscar servicio"
              />
            </div>
            <div className="chip-list" role="group" aria-label="Servicios">
              {visibleServices.map((service) => {
                const on = selected.has(service.id)
                return (
                  <button
                    key={service.id}
                    type="button"
                    className={on ? 'chip on' : 'chip'}
                    aria-pressed={on}
                    onClick={() => toggleService(service.id)}
                  >
                    {on ? <Check size={14} strokeWidth={3} /> : <Plus size={14} />}
                    <span>{service.name}</span>
                    {service.isRecurrent && (
                      <RefreshCw size={12} className="chip-recurrent" aria-label="Recurrente" />
                    )}
                  </button>
                )
              })}
              {visibleServices.length === 0 && (
                <p className="note">
                  {services.length === 0
                    ? 'Todavía no hay servicios. Usa Nuevo servicio para crear el primero.'
                    : 'Ningún servicio coincide con la búsqueda. Puedes crearlo con Nuevo servicio.'}
                </p>
              )}
            </div>
          </div>

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
          <label className="field full">
            <span>Notas</span>
            <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          {error && <p className="error full">{error}</p>}
          <div className="actions full modal-actions">
            <button className="btn ghost" type="button" onClick={requestClose}>
              Cancelar
            </button>
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? 'Guardando…' : entry ? 'Guardar cambios' : 'Registrar parada'}
            </button>
          </div>
        </form>
      )}
    </Modal>
    {creatingService && (
      <ServiceModal
        initialName={serviceQuery}
        onClose={() => setCreatingService(false)}
        onSaved={(service) => {
          setSelected((current) => new Set(current).add(service.id))
          setServiceQuery('')
        }}
        onUseExisting={(service) => {
          setSelected((current) => new Set(current).add(service.id))
          setServiceQuery('')
          setCreatingService(false)
        }}
      />
    )}
    </>
  )
}
