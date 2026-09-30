import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { deleteService } from '../lib/api'
import { ServiceModal } from '../components/ServiceModal'
import { useData } from '../data/DataProvider'
import { intervalLabel } from '../lib/format'
import { errorText } from '../lib/validate'
import type { Service } from '../lib/types'

export function ServicesPage() {
  const { services, loading, refresh } = useData()
  const [editor, setEditor] = useState<Service | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)

  function openNew() {
    setEditor('new')
    setError(null)
  }

  function openEdit(service: Service) {
    setEditor(service)
    setError(null)
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

      {error && <p className="error">{error}</p>}
      {loading ? (
        <p className="lead">Cargando servicios…</p>
      ) : services.length === 0 ? (
        <p className="note">
          Todavía no hay servicios. Puedes crearlos aquí o importar el historial desde{' '}
          <Link to="/configuracion">Configuración</Link>.
        </p>
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

      {editor && (
        <ServiceModal service={editor === 'new' ? null : editor} onClose={() => setEditor(null)} />
      )}
    </>
  )
}
