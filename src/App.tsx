import { HashRouter, Route, Routes } from 'react-router-dom'
import { useState } from 'react'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { Layout } from './components/Layout'
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
            <Route path="entradas" element={<EntriesPage />} />
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
      <article className="auth-card">
        <p className="eyebrow">Bitácora del auto</p>
        <h1>AnderCars</h1>
        <p>Entra con la cuenta de Google que está autorizada. Las demás ven esta pantalla y ningún dato.</p>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" type="button" onClick={() => void onClick()} disabled={pending}>
          {pending ? 'Redirigiendo…' : 'Entrar con Google'}
        </button>
      </article>
    </section>
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
