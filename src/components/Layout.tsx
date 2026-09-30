import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../data/DataProvider'
import { todayISO } from '../lib/format'
import { buildAlerts } from '../lib/metrics'

export function Layout() {
  const auth = useAuth()
  const data = useData()
  const today = todayISO()
  const overdue = data.cars.reduce((sum, car) => {
    return sum + buildAlerts(car, data.services, data.entries, today).filter((alert) => alert.status === 'overdue').length
  }, 0)

  return (
    <>
      <header className="app-header">
        <div className="brand">
          <span>AnderCars</span>
          <small>Bitácora del auto</small>
        </div>
        <nav aria-label="Secciones">
          <NavLink to="/" end>
            Resumen
            {overdue > 0 && <span className="badge">{overdue}</span>}
          </NavLink>
          <NavLink to="/autos">Autos</NavLink>
          <NavLink to="/servicios">Servicios</NavLink>
          <NavLink to="/entradas">Entradas</NavLink>
          <NavLink to="/odometro">Odómetro</NavLink>
        </nav>
        <div className="session">
          <span>{auth.email}</span>
          <button type="button" className="btn ghost light" onClick={() => void auth.signOut()}>
            Salir
          </button>
        </div>
      </header>
      <main className="page">
        {data.error && <p className="error">{data.error}</p>}
        <Outlet />
      </main>
    </>
  )
}
