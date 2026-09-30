import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { redirectUrl, supabase } from '../lib/supabase'

export type AuthStatus = 'loading' | 'misconfigured' | 'signed-out' | 'unauthorized' | 'ready'

type AuthContextValue = {
  status: AuthStatus
  email: string | null
  problem: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(supabase ? 'loading' : 'misconfigured')
  const [email, setEmail] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let request = 0
    let active = true

    async function resolve(session: Session | null) {
      const current = ++request
      if (!active) return
      if (!session?.user.email) {
        setEmail(null)
        setProblem(null)
        setStatus('signed-out')
        return
      }
      const userEmail = session.user.email.toLowerCase()
      setEmail(userEmail)
      const { data, error } = await client
        .from('allowed_users')
        .select('email')
        .eq('email', userEmail)
        .maybeSingle()
      if (!active || current !== request) return
      if (error) {
        setProblem(error.message)
        setStatus('unauthorized')
        return
      }
      setProblem(null)
      setStatus(data ? 'ready' : 'unauthorized')
    }

    void client.auth.getSession().then(({ data }) => resolve(data.session))
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => {
        void resolve(session)
      }, 0)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      email,
      problem,
      signIn: async () => {
        if (!supabase) return
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl(),
            queryParams: { prompt: 'select_account' },
          },
        })
        if (error) throw error
      },
      signOut: async () => {
        if (!supabase) return
        const { error } = await supabase.auth.signOut()
        if (error) throw error
      },
    }),
    [email, problem, status],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider.')
  return value
}
