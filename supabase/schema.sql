-- AnderCars
-- Ejecuta este script una vez, en el SQL Editor de un proyecto Supabase vacío.
-- La clave anon puede vivir en el frontend. La seguridad está en estas políticas:
-- solo entra quien inicie sesión con Google y cuyo correo esté en allowed_users.

create extension if not exists pgcrypto;

create table if not exists public.allowed_users (
  email text primary key check (email = lower(email))
);

create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (char_length(btrim(brand)) > 0),
  model text not null check (char_length(btrim(model)) > 0),
  year integer check (year is null or (year >= 1900 and year <= 2100)),
  photo_path text,
  notes text,
  odometer numeric(12, 1) not null default 0 check (odometer >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  name_key text generated always as (lower(btrim(name))) stored unique,
  is_recurrent boolean not null default false,
  interval_km integer check (interval_km is null or interval_km > 0),
  interval_months integer check (interval_months is null or interval_months > 0),
  created_at timestamptz not null default now(),
  constraint services_recurrent_interval check (
    is_recurrent = false
    or interval_km is not null
    or interval_months is not null
  )
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars (id) on delete cascade,
  entry_date date not null,
  odometer numeric(12, 1) not null check (odometer >= 0),
  kind text not null check (kind in ('service', 'odometer')),
  workshop text,
  cost_usd numeric(12, 2) check (cost_usd is null or cost_usd >= 0),
  notes text,
  source_row_id text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.entry_services (
  entry_id uuid not null references public.entries (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete restrict,
  primary key (entry_id, service_id)
);

create index if not exists entries_car_date_idx
  on public.entries (car_id, entry_date);

create or replace function public.is_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users as users
    join public.allowed_users as allowed on lower(users.email) = allowed.email
    where users.id = auth.uid()
  );
$$;

revoke all on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;

alter table public.allowed_users enable row level security;
alter table public.cars enable row level security;
alter table public.services enable row level security;
alter table public.entries enable row level security;
alter table public.entry_services enable row level security;

drop policy if exists allowed_users_select_self on public.allowed_users;
create policy allowed_users_select_self
on public.allowed_users
for select
to authenticated
using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists cars_all on public.cars;
create policy cars_all
on public.cars
for all
to authenticated
using (public.is_allowed())
with check (public.is_allowed());

drop policy if exists services_all on public.services;
create policy services_all
on public.services
for all
to authenticated
using (public.is_allowed())
with check (public.is_allowed());

drop policy if exists entries_all on public.entries;
create policy entries_all
on public.entries
for all
to authenticated
using (public.is_allowed())
with check (public.is_allowed());

drop policy if exists entry_services_all on public.entry_services;
create policy entry_services_all
on public.entry_services
for all
to authenticated
using (public.is_allowed())
with check (public.is_allowed());

revoke all on all tables in schema public from anon, authenticated;
grant select on public.allowed_users to authenticated;
grant select, insert, update, delete on public.cars to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.entries to authenticated;
grant select, insert, update, delete on public.entry_services to authenticated;

create or replace function public.enforce_odometer()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  previous numeric;
begin
  select coalesce(max(entries.odometer), 0)
  into previous
  from public.entries as entries
  where entries.car_id = new.car_id
    and entries.id is distinct from new.id;

  if tg_op = 'UPDATE'
    and new.odometer = old.odometer
    and new.car_id is not distinct from old.car_id then
    return new;
  end if;

  if new.odometer < previous then
    raise exception
      'El kilometraje (%) no puede ser menor que el último registrado (% km).',
      new.odometer,
      previous;
  end if;

  return new;
end;
$$;

create or replace function public.refresh_car_odometer()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  target uuid;
begin
  target := case when tg_op = 'DELETE' then old.car_id else new.car_id end;

  update public.cars
  set
    odometer = coalesce(
      (select max(entries.odometer) from public.entries as entries where entries.car_id = target),
      0
    ),
    updated_at = now()
  where id = target;

  if tg_op = 'UPDATE' and old.car_id is distinct from new.car_id then
    update public.cars
    set
      odometer = coalesce(
        (select max(entries.odometer) from public.entries as entries where entries.car_id = old.car_id),
        0
      ),
      updated_at = now()
    where id = old.car_id;
  end if;

  return null;
end;
$$;

revoke all on function public.enforce_odometer() from public, anon, authenticated;
revoke all on function public.refresh_car_odometer() from public, anon, authenticated;

drop trigger if exists entries_odometer_check on public.entries;
create trigger entries_odometer_check
before insert or update of odometer, car_id
on public.entries
for each row
execute function public.enforce_odometer();

drop trigger if exists entries_refresh_car on public.entries;
create trigger entries_refresh_car
after insert or update or delete
on public.entries
for each row
execute function public.refresh_car_odometer();

create or replace function public.import_history(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  vehicle_id uuid;
  vehicle_brand text;
  vehicle_model text;
  history_row record;
  service_name text;
  new_service_id uuid;
  new_entry_id uuid;
  inserted_count integer := 0;
  skipped_count integer := 0;
begin
  if not public.is_allowed() then
    raise exception 'No autorizado';
  end if;

  vehicle_brand := btrim(coalesce(payload ->> 'brand', ''));
  vehicle_model := btrim(coalesce(payload ->> 'model', ''));

  if vehicle_brand = '' or vehicle_model = '' then
    raise exception 'El vehículo necesita marca y modelo';
  end if;

  select cars.id
  into vehicle_id
  from public.cars as cars
  where lower(btrim(cars.brand)) = lower(vehicle_brand)
    and lower(btrim(cars.model)) = lower(vehicle_model)
  limit 1;

  if vehicle_id is null then
    insert into public.cars (brand, model)
    values (vehicle_brand, vehicle_model)
    returning id into vehicle_id;
  end if;

  for history_row in
    select
      rows.source_row_id,
      rows.entry_date,
      rows.odometer,
      rows.kind,
      rows.workshop,
      rows.cost_usd,
      rows.notes,
      rows.services
    from jsonb_to_recordset(coalesce(payload -> 'rows', '[]'::jsonb)) as rows (
      source_row_id text,
      entry_date date,
      odometer numeric,
      kind text,
      workshop text,
      cost_usd numeric,
      notes text,
      services jsonb
    )
    order by rows.entry_date asc, rows.odometer asc, rows.source_row_id asc
  loop
    if history_row.source_row_id is null or btrim(history_row.source_row_id) = '' then
      raise exception 'Falta el identificador de la fila de origen';
    end if;

    if exists (
      select 1
      from public.entries as entries
      where entries.source_row_id = btrim(history_row.source_row_id)
    ) then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    if history_row.kind not in ('service', 'odometer') then
      raise exception 'Tipo de entrada inválido: %', history_row.kind;
    end if;

    insert into public.entries (
      car_id,
      entry_date,
      odometer,
      kind,
      workshop,
      cost_usd,
      notes,
      source_row_id
    )
    values (
      vehicle_id,
      history_row.entry_date,
      history_row.odometer,
      history_row.kind,
      nullif(btrim(coalesce(history_row.workshop, '')), ''),
      history_row.cost_usd,
      nullif(btrim(coalesce(history_row.notes, '')), ''),
      btrim(history_row.source_row_id)
    )
    returning id into new_entry_id;

    if history_row.kind = 'service' then
      for service_name in
        select btrim(value)
        from jsonb_array_elements_text(coalesce(history_row.services, '[]'::jsonb)) as names (value)
      loop
        if service_name = '' then
          continue;
        end if;

        new_service_id := null;
        select services.id
        into new_service_id
        from public.services as services
        where services.name_key = lower(service_name);

        if new_service_id is null then
          insert into public.services (name)
          values (service_name)
          returning id into new_service_id;
        end if;

        insert into public.entry_services (entry_id, service_id)
        values (new_entry_id, new_service_id)
        on conflict do nothing;
      end loop;

      if not exists (
        select 1
        from public.entry_services as links
        where links.entry_id = new_entry_id
      ) then
        raise exception 'La fila % no tiene servicios.', history_row.source_row_id;
      end if;
    end if;

    inserted_count := inserted_count + 1;
  end loop;

  return jsonb_build_object(
    'inserted', inserted_count,
    'skipped', skipped_count,
    'car_id', vehicle_id
  );
end;
$$;

revoke all on function public.import_history(jsonb) from public, anon;
grant execute on function public.import_history(jsonb) to authenticated;

-- Reemplaza autos, servicios y entradas por un respaldo JSON de la app.
-- Si el proyecto ya existe, puedes ejecutar solo esta función en el SQL Editor.
create or replace function public.restore_backup(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  car_row jsonb;
  service_row jsonb;
  entry_row jsonb;
  service_name text;
  new_entry_id uuid;
  linked_id uuid;
  car_count integer := 0;
  service_count integer := 0;
  entry_count integer := 0;
begin
  if not public.is_allowed() then
    raise exception 'No autorizado';
  end if;

  if coalesce(payload ->> 'app', '') <> 'AnderCars' or coalesce(payload ->> 'version', '') <> '1' then
    raise exception 'El archivo no es un respaldo de AnderCars';
  end if;

  if jsonb_typeof(payload -> 'cars') <> 'array'
    or jsonb_typeof(payload -> 'services') <> 'array'
    or jsonb_typeof(payload -> 'entries') <> 'array' then
    raise exception 'El respaldo está incompleto';
  end if;

  delete from public.entry_services;
  delete from public.entries;
  delete from public.services;
  delete from public.cars;

  for car_row in
    select elements.value
    from jsonb_array_elements(payload -> 'cars') as elements(value)
  loop
    insert into public.cars (id, brand, model, year, photo_path, notes, odometer)
    values (
      (car_row ->> 'id')::uuid,
      btrim(car_row ->> 'brand'),
      btrim(car_row ->> 'model'),
      nullif(car_row ->> 'year', '')::integer,
      nullif(btrim(coalesce(car_row ->> 'photoPath', '')), ''),
      nullif(btrim(coalesce(car_row ->> 'notes', '')), ''),
      0
    );
    car_count := car_count + 1;
  end loop;

  for service_row in
    select elements.value
    from jsonb_array_elements(payload -> 'services') as elements(value)
  loop
    insert into public.services (id, name, is_recurrent, interval_km, interval_months)
    values (
      (service_row ->> 'id')::uuid,
      btrim(service_row ->> 'name'),
      coalesce((service_row ->> 'isRecurrent')::boolean, false),
      nullif(service_row ->> 'intervalKm', '')::integer,
      nullif(service_row ->> 'intervalMonths', '')::integer
    );
    service_count := service_count + 1;
  end loop;

  for entry_row in
    select elements.value
    from jsonb_array_elements(payload -> 'entries') as elements(value)
    order by (elements.value ->> 'odometer')::numeric asc, elements.value ->> 'entryDate' asc
  loop
    insert into public.entries (
      id,
      car_id,
      entry_date,
      odometer,
      kind,
      workshop,
      cost_usd,
      notes
    )
    values (
      coalesce(nullif(entry_row ->> 'id', '')::uuid, gen_random_uuid()),
      (entry_row ->> 'carId')::uuid,
      (entry_row ->> 'entryDate')::date,
      (entry_row ->> 'odometer')::numeric,
      entry_row ->> 'kind',
      nullif(btrim(coalesce(entry_row ->> 'workshop', '')), ''),
      nullif(entry_row ->> 'costUsd', '')::numeric,
      nullif(btrim(coalesce(entry_row ->> 'notes', '')), '')
    )
    returning id into new_entry_id;

    if entry_row ->> 'kind' = 'service' then
      for service_name in
        select btrim(value)
        from jsonb_array_elements_text(coalesce(entry_row -> 'services', '[]'::jsonb)) as names(value)
        where btrim(value) <> ''
      loop
        select services.id
        into linked_id
        from public.services as services
        where services.name_key = lower(service_name);

        if linked_id is null then
          raise exception 'El respaldo menciona un servicio que no está en la lista: %', service_name;
        end if;

        insert into public.entry_services (entry_id, service_id)
        values (new_entry_id, linked_id)
        on conflict do nothing;
      end loop;
    end if;

    entry_count := entry_count + 1;
  end loop;

  return jsonb_build_object(
    'cars', car_count,
    'services', service_count,
    'entries', entry_count
  );
end;
$$;

revoke all on function public.restore_backup(jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'car-photos',
  'car-photos',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists car_photos_read on storage.objects;
create policy car_photos_read
on storage.objects
for select
to authenticated
using (bucket_id = 'car-photos' and public.is_allowed());

drop policy if exists car_photos_insert on storage.objects;
create policy car_photos_insert
on storage.objects
for insert
to authenticated
with check (bucket_id = 'car-photos' and public.is_allowed());

drop policy if exists car_photos_update on storage.objects;
create policy car_photos_update
on storage.objects
for update
to authenticated
using (bucket_id = 'car-photos' and public.is_allowed())
with check (bucket_id = 'car-photos' and public.is_allowed());

drop policy if exists car_photos_delete on storage.objects;
create policy car_photos_delete
on storage.objects
for delete
to authenticated
using (bucket_id = 'car-photos' and public.is_allowed());

insert into public.allowed_users (email)
values ('rivero.ander@gmail.com')
on conflict (email) do nothing;
