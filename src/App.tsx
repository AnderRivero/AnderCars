import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useState } from 'react'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { Layout } from './components/Layout'
import { RacingFlagIcon } from './components/RacingFlagIcon'
import { DataProvider } from './data/DataProvider'
import { CarsPage } from './pages/CarsPage'
import { DashboardPage } from './pages/DashboardPage'
import { EntriesPage } from './pages/EntriesPage'
import { OdometerPage } from './pages/OdometerPage'
import { ServicesPage } from './pages/ServicesPage'
import { errorText } from './lib/validate'

export function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

function Gate() {
  const auth = useAuth()
  if (auth.status === 'loading') {
    return (
      <section className="screen">
        <p>Cargando…</p>
      </section>
    )
  }
  if (auth.status === 'misconfigured') return <Misconfigured />
  if (auth.status === 'signed-out') return <Login />
  if (auth.status === 'unauthorized') {
    return <Unauthorized email={auth.email} problem={auth.problem} onSignOut={auth.signOut} />
  }

  return (
    <DataProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="autos" element={<CarsPage />} />
            <Route path="servicios" element={<ServicesPage />} />
            <Route path="pits" element={<EntriesPage />} />
            <Route path="entradas" element={<Navigate to="/pits" replace />} />
            <Route path="odometro" element={<OdometerPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </DataProvider>
  )
}

function Misconfigured() {
  return (
    <section className="screen">
      <article className="auth-card">
        <h1>AnderCars</h1>
        <p>Falta conectar Supabase. Crea un archivo <code>.env.local</code> con:</p>
        <pre>{`VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key`}</pre>
        <p>Los pasos están en el README. Usa la clave anon, nunca la service role.</p>
      </article>
    </section>
  )
}

function Login() {
  const auth = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onClick() {
    setPending(true)
    setError(null)
    try {
      await auth.signIn()
    } catch (err) {
      setError(errorText(err))
      setPending(false)
    }
  }

  return (
    <section className="screen">
      <article className="auth-card login">
        <span className="auth-logo">
          <RacingFlagIcon size={52} />
        </span>
        <h1>AnderCars</h1>
        <p className="lead">
          Mantenimientos, reparaciones y kilometraje de tu auto, en un solo lugar.
        </p>
        <p className="auth-security">Acceso privado con tu cuenta autorizada de Google.</p>
        {error && <p className="error">{error}</p>}
        <button className="btn primary google-btn" type="button" onClick={() => void onClick()} disabled={pending}>
          <span className="google-badge">
            <GoogleIcon />
          </span>
          {pending ? 'Redirigiendo…' : 'Entrar con Google'}
        </button>
      </article>
    </section>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

function Unauthorized({
  email,
  problem,
  onSignOut,
}: {
  email: string | null
  problem: string | null
  onSignOut: () => Promise<void>
}) {
  return (
    <section className="screen">
      <article className="auth-card">
        <h1>Sin acceso</h1>
        {problem ? (
          <p>No se pudo confirmar la lista de acceso: {problem}</p>
        ) : (
          <p>
            La cuenta {email ?? 'con la que entraste'} no está en la lista de acceso. Cierra sesión y usa la
            cuenta autorizada.
          </p>
        )}
        <button className="btn primary" type="button" onClick={() => void onSignOut()}>
          Salir
        </button>
      </article>
    </section>
  )
}
