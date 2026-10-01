-- Programa el correo diario de alertas a las 8:00 de Venezuela (12:00 UTC).
-- Ejecútalo una vez en el SQL Editor, después de desplegar la función check-alerts.
-- Reemplaza los tres valores REEMPLAZA_... aquí, en el editor. No los guardes en el repositorio.
-- CRON_SECRET tiene que ser el mismo secreto que cargaste en Edge Function Secrets.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://REEMPLAZA_CON_TU_REF.supabase.co', 'project_url');
select vault.create_secret('REEMPLAZA_CON_LA_ANON_KEY', 'anon_key');
select vault.create_secret('REEMPLAZA_CON_EL_CRON_SECRET', 'alert_cron_secret');

select cron.schedule(
  'andercars-alert-email',
  '0 12 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/check-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'alert_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
