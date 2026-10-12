-- ================================================================
-- PorContar Academia · Formatos: reto completo o bootcamp / charla.
--
-- Un grupo de formato «corto» (bootcamp de unas horas, charla de una)
-- no sigue las clases del reto: tiene sus propias sesiones, con su
-- cronograma y sus grabaciones.
--
-- Va DESPUÉS de supabase-academia.sql, supabase-empresas.sql,
-- supabase-fase1.sql y supabase-admins.sql.
-- Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se puede correr varias veces: no borra contenido.
-- OJO: si algún día se vuelve a correr supabase-fase1.sql, hay que correr
-- este archivo otra vez después (fase1 repone la versión anterior).
-- No lleva la clave de admin.
-- ================================================================

-- 1) El formato del grupo y las sesiones propias --------------------
alter table public.grupos
  add column if not exists formato text not null default 'reto' check (formato in ('reto', 'corto'));

-- grupo_id vacío = sesión del reto (la ven los grupos de formato reto);
-- con grupo = sesión propia de ese bootcamp o charla.
alter table public.reto_sesiones
  add column if not exists grupo_id uuid references public.grupos(id) on delete cascade;
create index if not exists reto_sesiones_grupo_idx on public.reto_sesiones (grupo_id, orden);

-- ¿Quien mira está en algún grupo vigente que sigue el reto?
create or replace function public.sigo_el_reto()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.grupos g
     where g.formato = 'reto' and array[g.id::text] && public.mis_etiquetas());
$$;
revoke all on function public.sigo_el_reto() from public;
grant execute on function public.sigo_el_reto() to anon, authenticated;

drop policy if exists "reto lectura" on public.reto_sesiones;
create policy "reto lectura" on public.reto_sesiones
  for select using (
    (select public.is_admin())
    or (visible and (
         (grupo_id is null and (select public.sigo_el_reto()))
      or (grupo_id is not null and array[grupo_id::text] && (select public.mis_etiquetas()))
    ))
  );

-- 2) La ficha guarda también el formato ------------------------------
create or replace function public.admin_ficha_grupo(p_id uuid, p_ficha jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  t   text;
  wa  text := nullif(btrim(coalesce(p_ficha->>'whatsapp_url', '')), '');
  ini date := nullif(p_ficha->>'fecha_inicio', '')::date;
  fin date := nullif(p_ficha->>'fecha_fin', '')::date;
  fmt text := p_ficha->>'formato';
begin
  if not public.is_admin() then
    raise exception 'sin permiso';
  end if;
  if wa is not null and wa !~ '^https://' then
    raise exception 'El enlace de WhatsApp debe empezar por https://';
  end if;
  if ini is not null and fin is not null and fin < ini then
    raise exception 'La fecha de fin no puede ser antes del inicio.';
  end if;
  t := nullif(btrim(coalesce(p_ficha->>'plazas', '')), '');
  if t is not null and t !~ '^\d{1,6}$' then
    raise exception 'Las plazas deben ser un número.';
  end if;

  update public.grupos set
    logo_url          = nullif(btrim(coalesce(p_ficha->>'logo_url', '')), ''),
    nit               = left(nullif(btrim(coalesce(p_ficha->>'nit', '')), ''), 40),
    sector            = left(nullif(btrim(coalesce(p_ficha->>'sector', '')), ''), 80),
    plazas            = t::int,
    contacto_nombre   = left(nullif(btrim(coalesce(p_ficha->>'contacto_nombre', '')), ''), 120),
    contacto_cargo    = left(nullif(btrim(coalesce(p_ficha->>'contacto_cargo', '')), ''), 120),
    contacto_email    = left(lower(nullif(btrim(coalesce(p_ficha->>'contacto_email', '')), '')), 160),
    contacto_telefono = left(nullif(btrim(coalesce(p_ficha->>'contacto_telefono', '')), ''), 40),
    whatsapp_url      = left(wa, 300),
    fecha_inicio      = ini,
    fecha_fin         = fin,
    -- si no viene (una versión vieja de la app abierta), se queda como estaba
    formato           = case when fmt in ('reto', 'corto') then fmt else formato end,
    updated_at        = now()
  where id = p_id;
  if not found then
    raise exception 'Ese grupo no existe';
  end if;
end;
$$;

-- 3) El perfil le dice a la app qué formato sigue cada grupo ---------
create or replace function public.mi_perfil()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo text := public.mi_email();
  grupos jsonb;
begin
  if correo is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'nombre', g.nombre, 'tipo', g.tipo, 'rol', m.rol, 'vence_el', g.vence_el,
           'logo_url', g.logo_url, 'whatsapp_url', g.whatsapp_url,
           'fecha_inicio', g.fecha_inicio, 'fecha_fin', g.fecha_fin, 'formato', g.formato)
           order by g.nombre), '[]'::jsonb)
    into grupos
    from public.miembros m
    join public.grupos g on g.id = m.grupo_id
   where m.email = correo and m.activo and g.activo
     and (g.vence_el is null or g.vence_el >= public.hoy());

  if jsonb_array_length(grupos) > 0 then
    update public.miembros set ultimo_acceso = now()
     where email = correo and (ultimo_acceso is null or ultimo_acceso < now() - interval '5 minutes');
    insert into public.actividad (email, dia) values (correo, public.hoy()) on conflict do nothing;
  end if;

  return jsonb_build_object(
    'email',  correo,
    'nombre', (select nombre from public.miembros where email = correo and nombre <> '' order by id limit 1),
    'grupos', grupos);
end;
$$;

notify pgrst, 'reload schema';

-- Comprobación: debe decir "formato" y "grupo_id"
select
  (select column_name from information_schema.columns where table_schema = 'public' and table_name = 'grupos' and column_name = 'formato') as grupos_formato,
  (select column_name from information_schema.columns where table_schema = 'public' and table_name = 'reto_sesiones' and column_name = 'grupo_id') as sesiones_grupo;
