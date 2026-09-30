import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { importHistory } from '../lib/api'
import { parseFuelLog } from '../lib/csv'
import { useData } from '../data/DataProvider'
import { errorText } from '../lib/validate'
import type { Car, Entry, Service } from '../lib/types'

export function SettingsPage() {
  const { cars, services, entries, refresh } = useData()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

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
          <h1>Configuración</h1>
          <p className="lead">Importa el historial del archivo de combustible o descarga un respaldo de lo que ya está en la app.</p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="settings-list">
        <section className="card settings-card">
          <h2>
            <Upload size={18} />
            Importar historial
          </h2>
          <p className="note">
            Usa el CSV de combustible, por ejemplo <code>Fuel_Log.csv</code>. Se cargan servicios y
            lecturas de odómetro; las filas de gasolina se omiten. Si lo importas otra vez, no se duplica
            lo que ya estaba.
          </p>
          <label className="btn ghost file-btn">
            <Upload size={16} />
            {importing ? 'Importando…' : 'Elegir archivo CSV'}
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
          {importMessage && <p className="note success">{importMessage}</p>}
        </section>

        <section className="card settings-card">
          <h2>
            <Download size={18} />
            Exportar respaldo
          </h2>
          <p className="note">
            Descarga un archivo JSON con tus autos, servicios y entradas, para guardarlo fuera de la app.
            Las fotos no van en el archivo: siguen en Supabase.
          </p>
          <button className="btn primary" type="button" onClick={() => downloadBackup(cars, services, entries)}>
            <Download size={16} />
            Descargar respaldo
          </button>
        </section>
      </div>
    </>
  )
}

function downloadBackup(cars: Car[], services: Service[], entries: Entry[]) {
  const names = new Map(services.map((service) => [service.id, service.name]))
  const payload = {
    app: 'AnderCars',
    version: 1,
    exportedAt: new Date().toISOString(),
    cars,
    services,
    entries: entries.map((entry) => ({
      carId: entry.carId,
      entryDate: entry.entryDate,
      odometer: entry.odometer,
      kind: entry.kind,
      workshop: entry.workshop,
      costUsd: entry.costUsd,
      notes: entry.notes,
      services: entry.serviceIds
        .map((id) => names.get(id))
        .filter((name): name is string => Boolean(name)),
    })),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `andercars-respaldo-${payload.exportedAt.slice(0, 10)}.json`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
