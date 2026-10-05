-- ================================================================
-- PorContar Academia · Cuentas de admin con correo y contraseña
--
-- Va DESPUÉS de los otros tres archivos (academia, empresas, fase1).
-- Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se puede correr varias veces. No lleva ninguna clave.
--
-- · Cada admin entra por /admin con su correo y su contraseña. La base
--   guarda la contraseña cifrada y entrega una sesión que vence a los
--   7 días; el navegador la manda en la cabecera x-admin-sesion.
-- · La clave larga de antes (app_config.admin_key) queda como LLAVE DE
--   EMERGENCIA: sirve para crear la primera cuenta o cambiar una
--   contraseña olvidada. Nada más.
-- ================================================================

create table if not exists public.admins (
  email          text primary key check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nombre         text not null default '',
  clave_hash     text,
  activo         boolean not null default true,
  ultimo_acceso  timestamptz,
  created_at     timestamptz not null default now()
);

create table if not exists public.admin_sesiones (
  token_hash  text primary key,
  email       text not null references public.admins(email) on delete cascade,
  created_at  timestamptz not null default now(),
  vence       timestamptz not null default now() + interval '7 days'
);

alter table public.admins         enable row level security;
alter table public.admin_sesiones enable row level security;
-- Sin policies: solo se tocan con las funciones de abajo.

-- ¿La llave de emergencia es la buena?
create or replace function public.es_llave_admin(p_llave text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_llave, '') <> ''
     and p_llave = (select value from public.app_config where key = 'admin_key');
$$;
revoke execute on function public.es_llave_admin(text) from public, anon, authenticated;

-- El correo del admin de la sesión que viene en x-admin-sesion (o null)
create or replace function public.admin_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.email
    from public.admin_sesiones s
    join public.admins a on a.email = s.email and a.activo
   where s.token_hash = encode(extensions.digest(
           coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-admin-sesion', ''),
           'sha256'), 'hex')
     and s.vence > now();
$$;

-- Admin = una sesión de admin válida, o la llave de emergencia en x-admin-key
-- (la llave se deja para no romper nada mientras todos pasan a su cuenta)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.admin_email() is not null
      or public.es_llave_admin(nullif(current_setting('request.headers', true), '')::json ->> 'x-admin-key');
$$;

-- Crea la sesión de un admin y la devuelve (uso interno)
create or replace function public.admin_abrir_sesion(p_email text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into public.admin_sesiones (token_hash, email)
  values (encode(extensions.digest(token, 'sha256'), 'hex'), p_email);
  update public.admins set ultimo_acceso = now() where email = p_email;
  delete from public.admin_sesiones where vence < now();
  return token;
end;
$$;
revoke execute on function public.admin_abrir_sesion(text) from public, anon, authenticated;

-- Entrar con correo y contraseña. Los errores van en el resultado (no se
-- usa raise) para que quede registrado cada intento fallido.
create or replace function public.entrar_admin(p_email text, p_clave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo text := lower(btrim(coalesce(p_email, '')));
  fila   public.admins;
  fallos int;
begin
  if correo = '' or coalesce(p_clave, '') = '' then
    return jsonb_build_object('error', 'Escribe tu correo y tu contraseña.');
  end if;
  select count(*) into fallos from public.intentos_acceso
   where email = 'admin:' || correo and not ok and created_at > now() - interval '15 minutes';
  if fallos >= 6 then
    return jsonb_build_object('error', 'Demasiados intentos seguidos. Espera 15 minutos.');
  end if;

  select * into fila from public.admins where email = correo and activo;
  if found and fila.clave_hash is null then
    return jsonb_build_object('primera_vez', true);
  end if;
  if not found or fila.clave_hash <> extensions.crypt(p_clave, fila.clave_hash) then
    insert into public.intentos_acceso (email, ok) values ('admin:' || correo, false);
    return jsonb_build_object('error', 'El correo o la contraseña no coinciden.');
  end if;

  insert into public.intentos_acceso (email, ok) values ('admin:' || correo, true);
  return jsonb_build_object('token', public.admin_abrir_sesion(correo), 'nombre', fila.nombre);
end;
$$;

-- Con la llave de emergencia: crear una cuenta de admin o cambiar una
-- contraseña olvidada. Deja la sesión abierta.
create or replace function public.crear_admin(p_llave text, p_email text, p_nombre text, p_clave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo text := lower(btrim(coalesce(p_email, '')));
  fallos int;
begin
  select count(*) into fallos from public.intentos_acceso
   where email = 'llave:' || correo and not ok and created_at > now() - interval '15 minutes';
  if fallos >= 5 then
    return jsonb_build_object('error', 'Demasiados intentos seguidos. Espera 15 minutos.');
  end if;
  if not public.es_llave_admin(p_llave) then
    insert into public.intentos_acceso (email, ok) values ('llave:' || correo, false);
    return jsonb_build_object('error', 'La llave de emergencia no es la correcta.');
  end if;
  if correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('error', 'Escribe un correo válido.');
  end if;
  if char_length(coalesce(p_clave, '')) < 8 then
    return jsonb_build_object('error', 'La contraseña debe tener al menos 8 caracteres.');
  end if;

  insert into public.admins (email, nombre, clave_hash, activo)
  values (correo, left(btrim(coalesce(p_nombre, '')), 80), extensions.crypt(p_clave, extensions.gen_salt('bf', 10)), true)
  on conflict (email) do update
    set clave_hash = excluded.clave_hash, activo = true,
        nombre = case when excluded.nombre <> '' then excluded.nombre else public.admins.nombre end;
  insert into public.intentos_acceso (email, ok) values ('llave:' || correo, true);
  return jsonb_build_object('token', public.admin_abrir_sesion(correo));
end;
$$;

create or replace function public.salir_admin()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from public.admin_sesiones
   where token_hash = encode(extensions.digest(
           coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-admin-sesion', ''),
           'sha256'), 'hex');
$$;

create or replace function public.admin_perfil()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('email', a.email, 'nombre', a.nombre)
    from public.admins a where a.email = public.admin_email();
$$;

-- Cambiar la propia contraseña (pide la actual)
create or replace function public.admin_cambiar_clave(p_actual text, p_nueva text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo text := public.admin_email();
  fila   public.admins;
begin
  if correo is null then raise exception 'sin permiso'; end if;
  select * into fila from public.admins where email = correo;
  if fila.clave_hash <> extensions.crypt(coalesce(p_actual, ''), fila.clave_hash) then
    return jsonb_build_object('error', 'La contraseña actual no es correcta.');
  end if;
  if char_length(coalesce(p_nueva, '')) < 8 then
    return jsonb_build_object('error', 'La contraseña nueva debe tener al menos 8 caracteres.');
  end if;
  update public.admins set clave_hash = extensions.crypt(p_nueva, extensions.gen_salt('bf', 10)) where email = correo;
  -- Las demás sesiones abiertas con la contraseña vieja se cierran
  delete from public.admin_sesiones where email = correo
     and token_hash <> encode(extensions.digest(
           coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-admin-sesion', ''), 'sha256'), 'hex');
  return jsonb_build_object('ok', true);
end;
$$;

-- Lista y gestión de las cuentas de admin (solo un admin)
create or replace function public.admins_lista()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'email', a.email, 'nombre', a.nombre, 'activo', a.activo, 'ultimo_acceso', a.ultimo_acceso,
            'tiene_clave', a.clave_hash is not null, 'soy_yo', a.email = public.admin_email())
          order by a.created_at), '[]'::jsonb) from public.admins a);
end;
$$;

-- Agrega una cuenta con una contraseña temporal (la persona la cambia después)
create or replace function public.admin_agregar(p_email text, p_nombre text, p_clave text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;
  if correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Escribe un correo válido.'; end if;
  if char_length(coalesce(p_clave, '')) < 8 then raise exception 'La contraseña temporal debe tener al menos 8 caracteres.'; end if;
  insert into public.admins (email, nombre, clave_hash, activo)
  values (correo, left(btrim(coalesce(p_nombre, '')), 80), extensions.crypt(p_clave, extensions.gen_salt('bf', 10)), true)
  on conflict (email) do update
    set nombre = case when excluded.nombre <> '' then excluded.nombre else public.admins.nombre end,
        clave_hash = excluded.clave_hash, activo = true;
end;
$$;

create or replace function public.admin_activar(p_email text, p_activo boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;
  if lower(p_email) = public.admin_email() and not p_activo then
    raise exception 'No puedes desactivar tu propia cuenta.';
  end if;
  update public.admins set activo = p_activo where email = lower(p_email);
  if not p_activo then delete from public.admin_sesiones where email = lower(p_email); end if;
end;
$$;

grant execute on function public.admin_email()                            to anon, authenticated;
grant execute on function public.is_admin()                               to anon, authenticated;
grant execute on function public.entrar_admin(text, text)                 to anon, authenticated;
grant execute on function public.crear_admin(text, text, text, text)      to anon, authenticated;
grant execute on function public.salir_admin()                            to anon, authenticated;
grant execute on function public.admin_perfil()                           to anon, authenticated;
grant execute on function public.admin_cambiar_clave(text, text)          to anon, authenticated;
grant execute on function public.admins_lista()                           to anon, authenticated;
grant execute on function public.admin_agregar(text, text, text)          to anon, authenticated;
grant execute on function public.admin_activar(text, boolean)             to anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación
select to_regclass('public.admins') as tabla_admins,
       to_regclass('public.admin_sesiones') as tabla_sesiones,
       to_regproc('public.entrar_admin') as funcion_entrar,
       (select count(*) from public.admins) as cuentas;
