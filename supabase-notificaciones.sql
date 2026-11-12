-- =====================================================================
-- Notificaciones para Luisa y Ximena (2026-11-11)
--   · La campana de la Academia: lo que las personas publican y comentan
--     en la Comunidad, con lo nuevo marcado. «Nuevo» = desde la última vez
--     que la admin abrió la campana o entró a la Comunidad (un solo «visto»,
--     el mismo de supabase-avisos.sql).
--   · Avisos al celular o al PC: cada dispositivo donde la admin los activa
--     queda guardado aquí; la función avisos-comunidad les manda el aviso.
-- Requiere: supabase-avisos.sql y supabase-puntos.sql. Se puede correr las veces que sea.
-- =====================================================================

-- 1) La campana --------------------------------------------------------
create or replace function public.admin_notificaciones()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  desde timestamptz;
  res   jsonb;
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;
  select coalesce(a.comunidad_visto, now() - interval '7 days') into desde
    from public.admins a where a.email = public.admin_email();
  if desde is null then desde := now(); end if;   -- con la llave de emergencia no hay «nuevo»

  with ev as (
    select 'post'::text que, p.id::text id, p.id::text post_id, p.grupo_id, p.autor_nombre autor, p.autor_grupo grupo,
           p.tipo, p.titulo, p.texto, null::text sobre, false sobre_equipo, p.created_at cuando
      from public.comunidad_posts p
     where not p.es_admin and (p.publicar_en is null or p.publicar_en <= now())
       and p.created_at > now() - interval '30 days'
    union all
    select 'comentario', c.id::text, p.id::text, p.grupo_id, c.autor_nombre, c.autor_grupo,
           p.tipo, null, c.texto, coalesce(nullif(btrim(p.titulo), ''), left(p.texto, 90)), p.es_admin, c.created_at
      from public.comunidad_comentarios c join public.comunidad_posts p on p.id = c.post_id
     where not c.es_admin and c.created_at > now() - interval '30 days'
  )
  select jsonb_build_object(
    'nuevas', (select count(*) from ev where cuando > desde)::int,
    'items', coalesce((select jsonb_agg(to_jsonb(x) order by x.cuando desc)
                         from (select ev.*, ev.cuando > desde as nueva from ev order by ev.cuando desc limit 40) x), '[]'::jsonb))
    into res;
  return res;
end;
$$;
revoke all on function public.admin_notificaciones() from public;
grant execute on function public.admin_notificaciones() to anon, authenticated;

-- 2) Los dispositivos con avisos activados -----------------------------
create table if not exists public.push_suscripciones (
  endpoint   text primary key,
  email      text not null references public.admins(email) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  agente     text not null default '',
  creado_el  timestamptz not null default now()
);
alter table public.push_suscripciones enable row level security;   -- sin políticas: solo por las funciones

create or replace function public.admin_push_guardar(p_endpoint text, p_p256dh text, p_auth text, p_agente text default '')
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;
  if public.admin_email() is null then raise exception 'Entra con tu cuenta (no con la llave de emergencia) para activar los avisos.'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'El navegador no entregó una suscripción válida.';
  end if;
  insert into public.push_suscripciones (endpoint, email, p256dh, auth, agente)
  values (p_endpoint, public.admin_email(), p_p256dh, p_auth, left(coalesce(p_agente, ''), 200))
  on conflict (endpoint) do update
    set email = excluded.email, p256dh = excluded.p256dh, auth = excluded.auth, agente = excluded.agente, creado_el = now();
end;
$$;

create or replace function public.admin_push_quitar(p_endpoint text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;
  delete from public.push_suscripciones where endpoint = p_endpoint;
end;
$$;
revoke all on function public.admin_push_guardar(text, text, text, text) from public;
revoke all on function public.admin_push_quitar(text) from public;
grant execute on function public.admin_push_guardar(text, text, text, text) to anon, authenticated;
grant execute on function public.admin_push_quitar(text) to anon, authenticated;

-- 3) La campana de cada estudiante ----------------------------------------
-- Le avisa cuando alguien (del equipo o un compañero) comenta su publicación
-- o responde su comentario. Lo del equipo va marcado (es_equipo).
create table if not exists public.notif_visto (
  email  text primary key,
  visto  timestamptz not null default now()
);
alter table public.notif_visto enable row level security;   -- sin políticas: solo por las funciones

create or replace function public.mis_notificaciones()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  yo    text := lower(public.mi_email());
  desde timestamptz;
  res   jsonb;
begin
  if yo is null then raise exception 'sin sesión'; end if;
  select coalesce((select v.visto from public.notif_visto v where v.email = yo), now() - interval '7 days') into desde;

  with ev as (
    -- Comentaron mi publicación (sin contar mis propios comentarios)
    select c.id, 'en_mi_post'::text que, p.id post_id, p.grupo_id, c.autor_nombre autor, c.es_admin es_equipo,
           p.tipo, c.texto, coalesce(nullif(btrim(p.titulo), ''), left(p.texto, 90)) sobre, c.created_at cuando
      from public.comunidad_comentarios c join public.comunidad_posts p on p.id = c.post_id
     where lower(p.autor_email) = yo and lower(c.autor_email) <> yo
    union
    -- Respondieron mi comentario (en la publicación de otro)
    select c.id, 'a_mi_comentario', p.id, p.grupo_id, c.autor_nombre, c.es_admin,
           p.tipo, c.texto, coalesce(nullif(btrim(p.titulo), ''), left(p.texto, 90)), c.created_at
      from public.comunidad_comentarios c
      join public.comunidad_comentarios mio on mio.id = c.padre_id
      join public.comunidad_posts p on p.id = c.post_id
     where lower(mio.autor_email) = yo and lower(c.autor_email) <> yo and lower(p.autor_email) <> yo
  )
  select jsonb_build_object(
    'nuevas', (select count(*) from ev where ev.cuando > desde and ev.cuando > now() - interval '30 days')::int,
    'items', coalesce((select jsonb_agg(to_jsonb(x) order by x.cuando desc)
                         from (select ev.*, ev.cuando > desde as nueva from ev
                                where ev.cuando > now() - interval '30 days' order by ev.cuando desc limit 30) x), '[]'::jsonb))
    into res;
  return res;
end;
$$;

create or replace function public.mis_notificaciones_visto()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare yo text := lower(public.mi_email());
begin
  if yo is null then raise exception 'sin sesión'; end if;
  insert into public.notif_visto (email, visto) values (yo, now())
  on conflict (email) do update set visto = now();
end;
$$;
revoke all on function public.mis_notificaciones() from public;
revoke all on function public.mis_notificaciones_visto() from public;
grant execute on function public.mis_notificaciones() to anon, authenticated;
grant execute on function public.mis_notificaciones_visto() to anon, authenticated;

notify pgrst, 'reload schema';

-- Verificación: deben salir 5 funciones y 2 tablas
select 'función ' || proname as listo from pg_proc
 where proname in ('admin_notificaciones', 'admin_push_guardar', 'admin_push_quitar', 'mis_notificaciones', 'mis_notificaciones_visto')
union all
select 'tabla ' || t from unnest(array['push_suscripciones', 'notif_visto']) t where to_regclass('public.' || t) is not null;
