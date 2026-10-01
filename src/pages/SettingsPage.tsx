import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { restoreBackup } from '../lib/api'
import { buildBackup, parseBackup } from '../lib/backup'
import { useData } from '../data/DataProvider'
import { errorText } from '../lib/validate'

export function SettingsPage() {
  const { cars, services, entries, refresh } = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  async function onRestore(file: File) {
    setError(null)
    setMessage(null)
    let parsed: ReturnType<typeof parseBackup>
    try {
      parsed = parseBackup(await file.text())
    } catch (err) {
      setError(errorText(err))
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    const confirmed = window.confirm(
      'Esto reemplaza los autos, servicios y entradas que hay ahora por los del archivo. ¿Recuperar este respaldo?',
    )
    if (!confirmed) {
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setRestoring(true)
    try {
      const result = await restoreBackup(parsed)
      await refresh()
      setMessage(
        `Se recuperaron ${result.cars} autos, ${result.services} servicios y ${result.entries} entradas.`,
      )
    } catch (err) {
      setError(errorText(err))
    } finally {
      setRestoring(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function onExport() {
    const payload = buildBackup(cars, services, entries)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `andercars-respaldo-${payload.exportedAt.slice(0, 10)}.json`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Configuración</h1>
          <p className="lead">Descarga un respaldo de tus datos o recupera la app desde un archivo JSON.</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="settings-list">
        <section className="card settings-card">
          <h2>
            <Download size={18} />
            Exportar respaldo
          </h2>
          <p className="note">
            Descarga un JSON con tus autos, servicios y entradas. Las fotos no van en el archivo: siguen en
            Supabase.
          </p>
          <button className="btn primary" type="button" onClick={onExport}>
            <Download size={16} />
            Descargar respaldo
          </button>
        </section>

        <section className="card settings-card">
          <h2>
            <Upload size={18} />
            Recuperar respaldo
          </h2>
          <p className="note">
            Elige un JSON exportado desde esta app. Reemplaza lo que hay ahora. Si el archivo trae la ruta de
            una foto y el archivo sigue en Supabase, la foto vuelve a verse.
          </p>
          <label className="btn ghost file-btn">
            <Upload size={16} />
            {restoring ? 'Recuperando…' : 'Elegir archivo JSON'}
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              disabled={restoring}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void onRestore(file)
              }}
            />
          </label>
          {message && <p className="note success">{message}</p>}
        </section>
      </div>
    </>
  )
}
