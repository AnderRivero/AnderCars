import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { loadAll, type Snapshot } from '../lib/api'
import { errorText } from '../lib/validate'
import type { Car, Entry, Service } from '../lib/types'

type DataContextValue = Snapshot & {
  loading: boolean
  error: string | null
  refresh: () => Promise<Snapshot>
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [cars, setCars] = useState<Car[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await loadAll()
      setCars(next.cars)
      setServices(next.services)
      setEntries(next.entries)
      setError(null)
      return next
    } catch (err) {
      setError(errorText(err))
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh().catch(() => undefined)
  }, [refresh])

  const value = useMemo(
    () => ({ cars, services, entries, loading, error, refresh }),
    [cars, entries, error, loading, refresh, services],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const value = useContext(DataContext)
  if (!value) throw new Error('useData debe usarse dentro de DataProvider.')
  return value
}
