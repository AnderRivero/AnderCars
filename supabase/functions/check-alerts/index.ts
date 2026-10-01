import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { emailFor, maintenanceAlerts, noticeKey, type AlertCar, type AlertEntry, type AlertService, type MailAlert } from './alerts.ts'

const DEFAULT_TO = 'rivero.ander@gmail.com'
const DEFAULT_FROM = 'AnderCars <onboarding@resend.dev>'
const DEFAULT_APP_URL = 'https://anderrivero.github.io/AnderCars/#/'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return json({ error: 'Falta la configuración de Supabase.' }, 500)

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const allowed = await isAuthorized(request, admin)
  if (!allowed) return json({ error: 'No autorizado' }, 401)

  let snapshot: Awaited<ReturnType<typeof loadSnapshot>>
  try {
    snapshot = await loadSnapshot(admin)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudieron leer los datos.'
    return json({ error: message }, 500)
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })
  const alerts = maintenanceAlerts(snapshot.cars, snapshot.services, snapshot.entries, today)
  if (alerts.length === 0) return json({ sent: false, count: 0 })

  const resendKey = Deno.env.get('RESEND_API_KEY') ?? ''
  if (!resendKey) return json({ error: 'Falta RESEND_API_KEY.' }, 500)

  const claimPayload = alerts.map((alert) => ({
    car_id: alert.carId,
    service_id: alert.serviceId,
    status: alert.status,
    anchor_entry_id: alert.anchorEntryId,
  }))
  const { data: claimedRaw, error: claimError } = await admin.rpc('claim_alert_notices', { payload: claimPayload })
  if (claimError) return json({ error: claimError.message }, 500)

  const claimed = asNoticeRows(claimedRaw)
  const pending = alerts.filter((alert) => claimed.some((row) => sameNotice(alert, row)))
  if (pending.length === 0) return json({ sent: false, count: 0 })

  const message = emailFor(pending, Deno.env.get('APP_URL') ?? DEFAULT_APP_URL)
  const sent = await sendEmail(resendKey, message)
  if (!sent.ok) {
    await admin.rpc('release_alert_notices', {
      payload: pending.map((alert) => ({
        car_id: alert.carId,
        service_id: alert.serviceId,
        status: alert.status,
        anchor_entry_id: alert.anchorEntryId,
      })),
    })
    return json({ error: sent.error }, 502)
  }

  console.log(`Correo de alertas enviado (${pending.length}).`)
  return json({ sent: true, count: pending.length })
})

async function isAuthorized(request: Request, admin: SupabaseClient): Promise<boolean> {
  const expected = Deno.env.get('CRON_SECRET') ?? ''
  const provided = request.headers.get('x-cron-secret') ?? ''
  if (sameSecret(expected, provided)) return true

  const jwt = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt || jwt === (Deno.env.get('SUPABASE_ANON_KEY') ?? '')) return false
  const { data, error } = await admin.auth.getUser(jwt)
  if (error || !data.user?.email) return false
  const email = data.user.email.toLowerCase()
  const { data: allowed } = await admin.from('allowed_users').select('email').eq('email', email).maybeSingle()
  return Boolean(allowed)
}

async function loadSnapshot(admin: SupabaseClient): Promise<{
  cars: AlertCar[]
  services: AlertService[]
  entries: AlertEntry[]
}> {
  const [carsResult, servicesResult, entriesResult] = await Promise.all([
    admin.from('cars').select('id, brand, model, year, odometer'),
    admin.from('services').select('id, name, is_recurrent, interval_km, interval_months'),
    admin.from('entries').select('id, car_id, entry_date, odometer, entry_services(service_id)'),
  ])
  if (carsResult.error) throw new Error(carsResult.error.message)
  if (servicesResult.error) throw new Error(servicesResult.error.message)
  if (entriesResult.error) throw new Error(entriesResult.error.message)

  return {
    cars: (carsResult.data ?? []).map((row) => ({
      id: String(row.id),
      brand: String(row.brand),
      model: String(row.model),
      year: row.year == null ? null : Number(row.year),
      odometer: Number(row.odometer),
    })),
    services: (servicesResult.data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      isRecurrent: Boolean(row.is_recurrent),
      intervalKm: row.interval_km == null ? null : Number(row.interval_km),
      intervalMonths: row.interval_months == null ? null : Number(row.interval_months),
    })),
    entries: (entriesResult.data ?? []).map((row) => {
      const links = Array.isArray(row.entry_services) ? row.entry_services : []
      return {
        id: String(row.id),
        carId: String(row.car_id),
        entryDate: String(row.entry_date).slice(0, 10),
        odometer: Number(row.odometer),
        serviceIds: links.map((link) => String((link as { service_id: string }).service_id)),
      }
    }),
  }
}

async function sendEmail(
  apiKey: string,
  message: { subject: string; html: string; text: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('ALERT_FROM') ?? DEFAULT_FROM,
      to: [Deno.env.get('ALERT_EMAIL') ?? DEFAULT_TO],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  })
  if (response.ok) return { ok: true }
  const body = (await response.json().catch(() => null)) as { message?: string } | null
  return { ok: false, error: body?.message || 'Resend no aceptó el correo.' }
}

function asNoticeRows(value: unknown): Array<{ car_id: string; service_id: string; status: string; anchor_entry_id: string }> {
  const rows = typeof value === 'string' ? JSON.parse(value) : value
  return Array.isArray(rows) ? rows : []
}

function sameNotice(
  alert: MailAlert,
  row: { car_id: string; service_id: string; status: string; anchor_entry_id: string },
): boolean {
  const key = noticeKey(alert)
  return (
    key.carId === row.car_id &&
    key.serviceId === row.service_id &&
    key.status === row.status &&
    key.anchorEntryId === row.anchor_entry_id
  )
}

function sameSecret(expected: string, provided: string): boolean {
  const left = new TextEncoder().encode(expected)
  const right = new TextEncoder().encode(provided)
  if (left.length === 0 || left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index]
  return diff === 0
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
