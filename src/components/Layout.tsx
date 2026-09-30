import { NavLink, Outlet } from 'react-router-dom'
import {
  Bell,
  CarFront,
  Gauge,
  LayoutDashboard,
  LogOut,
  NotebookPen,
  Wrench,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../data/DataProvider'
import { RacingFlagIcon } from './RacingFlagIcon'
import { todayISO } from '../lib/format'
import { buildAlerts } from '../lib/metrics'

const navigation = [
  { to: '/', label: 'Resumen', icon: LayoutDashboard, end: true },
  { to: '/autos', label: 'Autos', icon: CarFront },
  { to: '/servicios', label: 'Servicios', icon: Wrench },
  { to: '/entradas', label: 'Entradas', icon: NotebookPen },
  { to: '/odometro', label: 'Odómetro', icon: Gauge },
]

export function Layout() {
  const auth = useAuth()
  const data = useData()
  const today = todayISO()
  const overdue = data.cars.reduce((sum, car) => {
    return sum + buildAlerts(car, data.services, data.entries, today).filter((alert) => alert.status === 'overdue').length
  }, 0)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark">
          <span className="brand-icon">
            <RacingFlagIcon size={28} />
          </span>
          <div className="brand">
            <span>AnderCars</span>
            <small>Tu garaje, bajo control</small>
          </div>
        </div>
        <div className="session">
          {overdue > 0 && (
            <span className="top-alert" title={`${overdue} alertas vencidas`}>
              <Bell size={18} />
              <span>{overdue}</span>
            </span>
          )}
          <span className="session-email">{auth.email}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            onClick={() => void auth.signOut()}
          >
            <LogOut size={19} />
          </button>
        </div>
      </header>

      <aside className="sidebar">
        <nav aria-label="Secciones">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}>
              <Icon size={20} />
              <span>{label}</span>
              {to === '/' && overdue > 0 && <span className="badge">{overdue}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="status-dot" />
          Datos protegidos por Supabase
        </div>
      </aside>

      <main className="page">
        {data.error && <p className="error">{data.error}</p>}
        <Outlet />
      </main>

      <nav className="mobile-nav" aria-label="Navegación principal">
        {navigation.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <span className="mobile-icon">
              <Icon size={21} />
              {to === '/' && overdue > 0 && <span className="mobile-badge">{overdue}</span>}
            </span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
