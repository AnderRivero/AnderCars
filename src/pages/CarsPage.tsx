import { useEffect, useState, type FormEvent } from 'react'
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
  }

  function reset() {
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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Autos</h1>
          <p className="lead">Marca, modelo, año, una foto opcional y notas.</p>
        </div>
      </div>

      <form className="card form-grid" onSubmit={(event) => void onSubmit(event)}>
        <label className="field">
          <span>Marca</span>
          <input
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
        {editingId && cars.find((car) => car.id === editingId)?.photoPath && (
          <label className="check full">
            <input
              type="checkbox"
              checked={removePhoto}
              onChange={(event) => setRemovePhoto(event.target.checked)}
            />
            Quitar la foto actual
          </label>
        )}
        {error && <p className="error full">{error}</p>}
        <div className="actions full">
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : editingId ? 'Actualizar auto' : 'Guardar auto'}
          </button>
          {editingId && (
            <button className="btn ghost" type="button" onClick={reset}>
              Cancelar
            </button>
          )}
        </div>
        <p className="note full">La foto queda en un almacén privado. JPG, PNG o WebP, hasta 2 MB.</p>
      </form>

      {loading ? (
        <p className="lead">Cargando autos…</p>
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
                <h2>{carLabel(car)}</h2>
                <p>{formatKm(car.odometer)} km</p>
                {car.notes && <p className="note">{car.notes}</p>}
                <div className="actions">
                  <button className="btn ghost" type="button" onClick={() => edit(car)}>
                    Editar
                  </button>
                  <button className="btn danger" type="button" onClick={() => void onDelete(car)}>
                    Eliminar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  )
}
