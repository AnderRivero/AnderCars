import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

export function isSupabaseConfigured(): boolean {
  return url.startsWith('https://') && anonKey.length > 20 && !anonKey.includes('tu-anon-key')
}

export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(url, anonKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null

export function redirectUrl(): string {
  const current = new URL(window.location.href)
  current.hash = ''
  current.search = ''
  current.pathname = current.pathname.replace(/index\.html$/, '')
  if (!current.pathname.endsWith('/')) current.pathname += '/'
  return current.origin + current.pathname
}
