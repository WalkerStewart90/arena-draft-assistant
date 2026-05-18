import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null | undefined

/** Project URL only — strip trailing /rest/v1 (Supabase JS adds it). */
export function normalizeSupabaseProjectUrl(url: string): string {
  return url.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '')
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client !== undefined) {
    return client
  }
  const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!rawUrl || !key) {
    client = null
    return client
  }
  client = createClient(normalizeSupabaseProjectUrl(rawUrl), key)
  return client
}
