import { useEffect, useState, type FormEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Fab } from '../components/Fab'
import { Modal } from '../components/Modal'
import {
  deleteCar,
  insertCar,
  removeCarPhoto,
  signedPhotoUrl,
  updateCar,
  uploadCarPhoto,
  validatePhoto,
} from '../lib/api'
import { useData } from '../data/DataProvider'
import { carLabel, formatKm } from '../lib/format'
import { errorText } from '../lib/validate'
import type { Car } from '../lib/types'

const emptyForm = {
  brand: '',
  model: '',
  year: '',
  notes: '',
}

export function CarsPage() {
  const { cars, loading, refresh } = useData()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [file, setFile] = useState<File | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    async function loadPhotos() {
      const next: Record<string, string> = {}
      for (const car of cars) {
        if (!car.photoPath) continue
        const url = await signedPhotoUrl(car.photoPath)
        if (url) next[car.id] = url
      }
      if (active) setPhotos(next)
    }
    void loadPhotos()
    return () => {
      active = false
    }
  }, [cars])

  function edit(car: Car) {
    setEditingId(car.id)
    setForm({
      brand: car.brand,
      model: car.model,
      year: car.year ? String(car.year) : '',
      notes: car.notes ?? '',
    })
    setFile(null)
    setRemovePhoto(false)
    setError(null)
    setModalOpen(true)
  }

  function openNew() {
    reset()
    setModalOpen(true)
  }

  function reset() {
    setModalOpen(false)
    setEditingId(null)
    setForm(emptyForm)
    setFile(null)
    setRemovePhoto(false)
    setError(null)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const brand = form.brand.trim()
    const model = form.model.trim()
    if (!brand || !model) {
      setError('La marca y el modelo son obligatorios.')
      return
    }
    let year: number | null = null
    if (form.year.trim()) {
      year = Number(form.year)
      if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        setError('El año tiene que estar entre 1900 y 2100.')
        return
      }
    }
    if (file) {
      const photoError = validatePhoto(file)
      if (photoError) {
        setError(photoError)
        return
      }
    }

    setSaving(true)
    setError(null)
    try {
      const current = cars.find((car) => car.id === editingId) ?? null
      let carId = editingId
      if (!carId) {
        carId = await insertCar({ brand, model, year, notes: form.notes })
      }

      let photoPath = current?.photoPath ?? null
      if (file) {
        photoPath = await uploadCarPhoto(carId, file)
      } else if (removePhoto) {
        photoPath = null
      }

      await updateCar(carId, { brand, model, year, notes: form.notes, photoPath })

      if (current?.photoPath && current.photoPath !== photoPath) {
        try {
          await removeCarPhoto(current.photoPath)
        } catch {
          // La foto nueva ya quedó guardada. Un archivo huérfano no bloquea el auto.
        }
      }

      reset()
      await refresh()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(car: Car) {
    const confirmed = window.confirm(
      `¿Eliminar ${carLabel(car)} y todas sus entradas? Esta acción no se puede deshacer.`,
    )
    if (!confirmed) return
    setError(null)
    try {
      if (car.photoPath) {
        try {
          await removeCarPhoto(car.photoPath)
        } catch {
          // Si la foto ya no está, igual se borra el auto.
        }
      }
      await deleteCar(car.id)
      if (editingId === car.id) reset()
      await refresh()
    } catch (err) {
      setError(errorText(err))
    }
  }

  const editingCar = cars.find((car) => car.id === editingId) ?? null

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Autos</h1>
          <p className="lead">Tu garaje: marca, modelo, año, foto y notas de cada vehículo.</p>
        </div>
      </div>

      {error && !modalOpen && <p className="error">{error}</p>}

      {loading ? (
        <p className="lead">Cargando autos…</p>
      ) : cars.length === 0 ? (
        <p className="note">Todavía no hay autos. Usa el botón + para registrar el primero.</p>
      ) : (
        <div className="car-grid">
          {cars.map((car) => (
            <article key={car.id} className="card car-card">
              {photos[car.id] ? (
                <img src={photos[car.id]} alt={`${car.brand} ${car.model}`} />
              ) : (
                <div className="photo-fallback">Sin foto</div>
              )}
              <div>
                <div className="car-card-head">
                  <h2>{carLabel(car)}</h2>
                  <div className="row-actions">
                    <button
                      className="icon-action"
                      type="button"
                      aria-label={`Editar ${carLabel(car)}`}
                      title="Editar"
                      onClick={() => edit(car)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-action danger"
                      type="button"
                      aria-label={`Eliminar ${carLabel(car)}`}
                      title="Eliminar"
                      onClick={() => void onDelete(car)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <p className="car-km">{formatKm(car.odometer)} km</p>
                {car.notes && <p className="note">{car.notes}</p>}
              </div>
            </article>
          ))}
        </div>
      )}

      <Fab label="Registrar nuevo auto" onClick={openNew} />

      {modalOpen && (
        <Modal
          title={editingCar ? 'Actualizar auto' : 'Registrar nuevo auto'}
          subtitle={
            editingCar
              ? `Estás editando ${carLabel(editingCar)}.`
              : 'Agrega un vehículo a tu garaje. Solo la marca y el modelo son obligatorios.'
          }
          onClose={reset}
        >
          <form className="form-grid" onSubmit={(event) => void onSubmit(event)}>
            <label className="field">
              <span>Marca</span>
              <input
                autoFocus
                value={form.brand}
                onChange={(event) => setForm({ ...form, brand: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Modelo</span>
              <input
                value={form.model}
                onChange={(event) => setForm({ ...form, model: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Año</span>
              <input
                inputMode="numeric"
                value={form.year}
                onChange={(event) => setForm({ ...form, year: event.target.value })}
                placeholder="Opcional"
              />
            </label>
            <label className="field">
              <span>Foto</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null)
                  setRemovePhoto(false)
                }}
              />
            </label>
            <label className="field full">
              <span>Notas</span>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </label>
            {editingCar?.photoPath && (
              <label className="check full">
                <input
                  type="checkbox"
                  checked={removePhoto}
                  onChange={(event) => setRemovePhoto(event.target.checked)}
                />
                Quitar la foto actual
              </label>
            )}
            <p className="note full">La foto queda en un almacén privado. JPG, PNG o WebP, hasta 2 MB.</p>
            {error && <p className="error full">{error}</p>}
            <div className="actions full modal-actions">
              <button className="btn ghost" type="button" onClick={reset}>
                Cancelar
              </button>
              <button className="btn primary" type="submit" disabled={saving}>
                {saving ? 'Guardando…' : editingCar ? 'Guardar cambios' : 'Registrar auto'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
