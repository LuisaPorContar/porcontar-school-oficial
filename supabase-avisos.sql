-- ================================================================
-- PorContar Academia · Avisos de la Comunidad y soporte solo para
-- responsables.
--
--   · Cada vez que una persona (no el equipo) publica o comenta en la
--     Comunidad, la base llama a la función avisos-comunidad, que les
--     manda un correo a las admin activas (tabla admins) desde el buzón de
--     Hostinger. El aviso nunca impide publicar: si falla, se publica igual.
--   · Además, cada admin ve en «Comunidad» cuántas publicaciones y
--     comentarios nuevos hay desde la última vez que entró.
--   · Soporte: solo el responsable de cada grupo abre tickets. Las admin
--     siguen pudiendo abrirlos a nombre de cualquiera.
--
-- Va DESPUÉS de supabase-comunidad.sql, supabase-admins.sql y
-- supabase-soporte.sql. Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se puede correr varias veces. No lleva la clave de admin (la clave de
-- los avisos se crea sola y se queda en app_config).
-- ================================================================

-- 1) El contador de las admin ---------------------------------------
alter table public.admins add column if not exists comunidad_visto timestamptz;

-- Publicaciones y comentarios de las personas desde la última vez que la admin entró a la Comunidad
-- (la primera vez cuenta los últimos 7 días). La llave de emergencia, sin cuenta, no tiene contador.
create or replace function public.comunidad_novedades()
returns int
language sql
stable
security definer
set search_path = public
as $$
  with yo as (
    select coalesce(a.comunidad_visto, now() - interval '7 days') as desde
      from public.admins a where a.email = public.admin_email() and a.activo
  )
  select coalesce((select
      (select count(*) from public.comunidad_posts p
        where not p.es_admin and p.created_at > yo.desde
          and (p.publicar_en is null or p.publicar_en <= now()))
    + (select count(*) from public.comunidad_comentarios c
        where not c.es_admin and c.created_at > yo.desde)
    from yo), 0)::int;
$$;

create or replace function public.comunidad_marcar_visto()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.admins set comunidad_visto = now() where email = public.admin_email();
$$;
revoke all on function public.comunidad_novedades() from public;
revoke all on function public.comunidad_marcar_visto() from public;
grant execute on function public.comunidad_novedades()    to anon, authenticated;
grant execute on function public.comunidad_marcar_visto() to anon, authenticated;

-- 2) El correo --------------------------------------------------------
create extension if not exists pg_net;

-- La clave con la que la base se identifica ante la función de avisos (se crea una sola vez)
insert into public.app_config (key, value)
select 'avisos_clave', encode(extensions.gen_random_bytes(24), 'hex')
 where not exists (select 1 from public.app_config where key = 'avisos_clave');

create or replace function public.comunidad_avisar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.es_admin then
    begin
      perform net.http_post(
        url     := 'https://lcbonixjumchbhffyxee.supabase.co/functions/v1/avisos-comunidad',
        body    := jsonb_build_object('tabla', TG_TABLE_NAME, 'id', new.id),
        headers := jsonb_build_object('Content-Type', 'application/json',
                     'x-aviso', coalesce((select value from public.app_config where key = 'avisos_clave'), '')));
    exception when others then
      null;   -- el aviso nunca impide publicar ni comentar
    end;
  end if;
  return new;
end;
$$;
revoke all on function public.comunidad_avisar() from public, anon, authenticated;

drop trigger if exists comunidad_posts_aviso on public.comunidad_posts;
create trigger comunidad_posts_aviso after insert on public.comunidad_posts
  for each row execute function public.comunidad_avisar();
drop trigger if exists comunidad_comentarios_aviso on public.comunidad_comentarios;
create trigger comunidad_comentarios_aviso after insert on public.comunidad_comentarios
  for each row execute function public.comunidad_avisar();

-- 3) Soporte: solo el responsable abre tickets -------------------------
create or replace function public.soporte_solo_responsables()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if not exists (
    select 1 from public.miembros m join public.grupos g on g.id = m.grupo_id
     where m.email = new.email and m.rol = 'responsable' and m.activo and g.activo
       and (g.vence_el is null or g.vence_el >= public.hoy())) then
    raise exception 'Solo el responsable de tu empresa puede abrir tickets de soporte. Escríbele a él o ella.';
  end if;
  return new;
end;
$$;
revoke all on function public.soporte_solo_responsables() from public, anon, authenticated;

drop trigger if exists soporte_tickets_responsable on public.soporte_tickets;
create trigger soporte_tickets_responsable before insert on public.soporte_tickets
  for each row execute function public.soporte_solo_responsables();

notify pgrst, 'reload schema';

-- Comprobación: debe decir «sí» en las tres
select
  (select case when count(*) = 2 then 'sí' else 'no' end from pg_trigger
    where tgname in ('comunidad_posts_aviso', 'comunidad_comentarios_aviso'))  as avisos_comunidad,
  (select case when count(*) = 1 then 'sí' else 'no' end from public.app_config where key = 'avisos_clave') as clave_avisos,
  (select case when count(*) = 1 then 'sí' else 'no' end from pg_trigger where tgname = 'soporte_tickets_responsable') as soporte_responsables;
