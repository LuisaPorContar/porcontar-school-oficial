-- ================================================================
-- PorContar Academia · Modalidades, clases con candado y clase en
-- prompts y cursos.
--
--   · Tres modalidades de grupo (grupos.formato):
--       corto      → Hiperpersonalizado: sesiones propias de esa empresa
--       reto       → Estándar virtual: las clases del reto, con grabaciones
--       presencial → Estándar presencial: las clases del reto, sin
--                    grabaciones; en cada clase se ven los videos del curso
--                    marcados con esa clase.
--   · Candado por grupo: cada clase nace cerrada para cada grupo y el admin
--     la abre (tabla clases_abiertas). Lo cerrado no lo entrega la base:
--     publicaciones, grabaciones, prompts, cápsulas y quiz de esa clase.
--   · Prompts y cápsulas de curso pueden llevar su clase (sesion_id).
--
-- Va DESPUÉS de supabase-formatos.sql, supabase-cursos.sql y
-- supabase-agenda.sql. Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se puede correr varias veces: no borra contenido.
-- La primera vez deja ABIERTAS todas las clases de los grupos que ya
-- existen (para no cortarle nada a quien está en curso). Los grupos que
-- se creen después empiezan con todo cerrado.
-- OJO: si algún día se vuelve a correr supabase-empresas.sql,
-- supabase-fase1.sql, supabase-formatos.sql o supabase-cursos.sql, hay
-- que correr este archivo otra vez después.
-- No lleva la clave de admin.
-- ================================================================

-- 1) Tres modalidades ------------------------------------------------
alter table public.grupos drop constraint if exists grupos_formato_check;
alter table public.grupos add constraint grupos_formato_check
  check (formato in ('reto', 'corto', 'presencial'));

-- Virtual y presencial siguen las clases del reto
create or replace function public.sigo_el_reto()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.grupos g
     where g.formato in ('reto', 'presencial') and array[g.id::text] && public.mis_etiquetas());
$$;
revoke all on function public.sigo_el_reto() from public;
grant execute on function public.sigo_el_reto() to anon, authenticated;

-- La ficha acepta la modalidad presencial (lo demás, igual que en supabase-formatos.sql)
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
    formato           = case when fmt in ('reto', 'corto', 'presencial') then fmt else formato end,
    -- la comunidad tiene su propio interruptor (admin_comunidad_grupo): se conserva como esté
    extras_off        = case when jsonb_typeof(p_ficha->'extras_off') = 'array'
                          then array(select x from jsonb_array_elements_text(p_ficha->'extras_off') x
                                      where x in ('tareas', 'skills', 'resumen', 'config', 'tuto', 'faq'))
                               || array(select x from unnest(extras_off) x where x = 'comunidad')
                          else extras_off end,
    updated_at        = now()
  where id = p_id;
  if not found then
    raise exception 'Ese grupo no existe';
  end if;
end;
$$;
grant execute on function public.admin_ficha_grupo(uuid, jsonb) to anon, authenticated;

-- 2) Candado por grupo -----------------------------------------------
create table if not exists public.clases_abiertas (
  grupo_id   uuid not null references public.grupos(id) on delete cascade,
  sesion_id  text not null references public.reto_sesiones(id) on delete cascade,
  abierta_el timestamptz not null default now(),
  primary key (grupo_id, sesion_id)
);
alter table public.clases_abiertas enable row level security;
drop policy if exists "clases abiertas lectura" on public.clases_abiertas;
drop policy if exists "clases abiertas admin"   on public.clases_abiertas;
create policy "clases abiertas lectura" on public.clases_abiertas
  for select using ((select public.is_admin()) or array[grupo_id::text] && (select public.mis_etiquetas()));
create policy "clases abiertas admin" on public.clases_abiertas
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.clases_abiertas to anon, authenticated;

-- La primera vez: los grupos que ya existen quedan con todas sus clases abiertas
do $migrar$
begin
  if not exists (select 1 from public.ajustes where clave = 'candado_clases') then
    insert into public.clases_abiertas (grupo_id, sesion_id)
    select g.id, s.id
      from public.grupos g
      join public.reto_sesiones s
        on (s.grupo_id is null and g.formato <> 'corto') or s.grupo_id = g.id
    on conflict do nothing;
    insert into public.ajustes (clave, valor) values ('candado_clases', to_jsonb(now()::text));
  end if;
end
$migrar$;

-- Las clases que quien mira todavía no tiene abiertas en ninguno de sus grupos.
-- El admin no tiene ninguna cerrada. Se evalúa una vez por consulta.
create or replace function public.mis_clases_cerradas()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with e as (select public.mis_etiquetas() as x)
  select case when public.is_admin() then '{}'::text[]
              else coalesce((select array_agg(s.id) from public.reto_sesiones s
                              where not exists (select 1 from public.clases_abiertas a, e
                                                 where a.sesion_id = s.id and array[a.grupo_id::text] && e.x)), '{}')
         end;
$$;
revoke all on function public.mis_clases_cerradas() from public;
grant execute on function public.mis_clases_cerradas() to anon, authenticated;

-- 3) La clase de cada prompt y de cada cápsula --------------------------
alter table public.skills
  add column if not exists sesion_id text references public.reto_sesiones(id) on delete set null;
alter table public.cursos_capsulas
  add column if not exists sesion_id text references public.reto_sesiones(id) on delete set null;

-- 4) Lo cerrado no sale de la base ------------------------------------
drop policy if exists "lectura por grupo" on public.posts;
create policy "lectura por grupo" on public.posts
  for select using (
    (select public.is_admin())
    or ((select cardinality(public.mis_etiquetas())) > 0
        and (cardinality(audiencia) = 0 or audiencia && (select public.mis_etiquetas()))
        and not (array[session] && (select public.mis_clases_cerradas())))
  );

drop policy if exists "skills lectura por grupo" on public.skills;
create policy "skills lectura por grupo" on public.skills
  for select using (
    (select public.is_admin())
    or (visible
        and (select cardinality(public.mis_etiquetas())) > 0
        and (cardinality(audiencia) = 0 or audiencia && (select public.mis_etiquetas()))
        and (sesion_id is null or not (array[sesion_id] && (select public.mis_clases_cerradas()))))
  );

drop policy if exists "grabaciones lectura" on public.grabaciones;
create policy "grabaciones lectura" on public.grabaciones
  for select using (
    (select public.is_admin())
    or (array[grupo_id::text] && (select public.mis_etiquetas())
        and exists (select 1 from public.clases_abiertas a
                     where a.grupo_id = grabaciones.grupo_id and a.sesion_id = grabaciones.sesion_id))
  );

drop policy if exists "capsulas lectura" on public.cursos_capsulas;
create policy "capsulas lectura" on public.cursos_capsulas
  for select using ((select public.is_admin()) or (visible
    and (sesion_id is null or not (array[sesion_id] && (select public.mis_clases_cerradas())))
    and exists (select 1 from public.cursos c where c.id = curso_id and c.visible and public.puede_ver(c.audiencia))));

-- El quiz de una clase cerrada tampoco aparece (lo demás, igual que en supabase-fase1.sql)
create or replace function public.quizzes_publicos()
returns table (id text, titulo text, descripcion text, preguntas int, sesion_id text,
               aprobar int, intentos int, obligatorio boolean,
               mis_intentos int, ultimo_pct int, aprobado boolean)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.titulo, q.descripcion, jsonb_array_length(q.preguntas), q.sesion_id,
         q.aprobar, q.intentos, q.obligatorio,
         (select count(*)::int from public.quiz_resultados r where r.quiz_id = q.id and r.email = public.mi_email()),
         (select (r.puntaje * 100 / nullif(r.total, 0))::int from public.quiz_resultados r
           where r.quiz_id = q.id and r.email = public.mi_email() order by r.created_at desc limit 1),
         coalesce((select bool_or(r.puntaje * 100 >= q.aprobar * r.total) from public.quiz_resultados r
                    where r.quiz_id = q.id and r.email = public.mi_email()), false)
    from public.quizzes q
   where q.activo
     and jsonb_array_length(q.preguntas) > 0
     and public.puede_ver(q.audiencia)
     and (public.is_admin() or public.mi_email() is not null)
     and (q.sesion_id is null or not (array[q.sesion_id] && public.mis_clases_cerradas()))
   order by q.orden, q.id;
$$;
grant execute on function public.quizzes_publicos() to anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las tres columnas deben decir «sí» y abiertas, un número
select
  (select count(*) from public.clases_abiertas)                                       as clases_abiertas,
  (select case when count(*) > 0 then 'sí' else 'no' end from information_schema.columns
    where table_schema = 'public' and table_name = 'skills' and column_name = 'sesion_id')          as prompts_con_clase,
  (select case when count(*) > 0 then 'sí' else 'no' end from information_schema.columns
    where table_schema = 'public' and table_name = 'cursos_capsulas' and column_name = 'sesion_id') as capsulas_con_clase,
  (select case when pg_get_constraintdef(oid) like '%presencial%' then 'sí' else 'no' end
     from pg_constraint where conname = 'grupos_formato_check')                       as modalidad_presencial;
