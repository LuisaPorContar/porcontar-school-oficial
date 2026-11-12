-- ================================================================
-- PorContar Academia · Puntos y el muro con dudas, logros y prompts
--
-- PUNTOS (simples, sin niveles ni cinturones). Salen solos de lo que ya
-- se guarda, más los que da el equipo:
--   · Asistir a un encuentro ............ +10  (asistencia)
--   · Aprobar un quiz ................... +10  (quiz_resultados, una vez por quiz)
--   · Responder una encuesta ............ +5   (encuesta_respuestas)
--   · Responder el diagnóstico .......... +5   (diagnosticos)
--   · Puntos del equipo ................. los que el admin dé (+5, +10, +20…)
--     con un motivo, p. ej. por responder bien en clase o en el muro.
-- Cada persona ve sus puntos, de dónde salen, el podio y el ranking
-- completo de su grupo (con nombre corto: «Ana P.»). El admin ve todo.
--
-- MURO: cada publicación puede ser ❓ duda, 🏆 logro o 💡 prompt. Una duda
-- queda «resuelta» cuando quien preguntó o el equipo marca la mejor
-- respuesta. El admin ve el correo de quien escribe (para darle puntos).
--
-- Va DESPUÉS de supabase-comunidad-empresas.sql, supabase-asistencia.sql
-- y supabase-formularios.sql. Supabase → SQL Editor → New query → pegar
-- TODO → Run. Se puede correr varias veces. No lleva la clave de admin.
-- ================================================================

-- 1) Puntos que da el equipo ------------------------------------------------
create table if not exists public.puntos_manuales (
  id        bigserial primary key,
  grupo_id  uuid not null references public.grupos(id) on delete cascade,
  email     text not null,
  puntos    int  not null check (puntos between 1 and 100),
  motivo    text not null default '',
  por       text not null default coalesce(public.admin_email(), 'Claude'),
  creado_el timestamptz not null default now()
);
create index if not exists puntos_manuales_grupo_idx on public.puntos_manuales (grupo_id, email);
alter table public.puntos_manuales enable row level security;
drop policy if exists "puntos manuales admin" on public.puntos_manuales;
create policy "puntos manuales admin" on public.puntos_manuales
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.puntos_manuales to anon, authenticated;
grant usage, select on sequence public.puntos_manuales_id_seq to anon, authenticated;

-- Lo que vale cada cosa (la app lo muestra en «Cómo sumar puntos»)
create or replace function public.puntos_valores()
returns jsonb
language sql
immutable
as $$ select '{"asistencia":10,"quiz":10,"encuesta":5,"diagnostico":5}'::jsonb $$;
grant execute on function public.puntos_valores() to anon, authenticated;

-- «Ana María Pérez» → «Ana P.»
create or replace function public.nombre_corto(n text)
returns text
language sql
immutable
as $$
  select case when coalesce(btrim(n), '') = '' then 'Alguien'
              when split_part(btrim(n), ' ', 2) = '' then btrim(n)
              else split_part(btrim(n), ' ', 1) || ' ' || left((regexp_split_to_array(btrim(n), '\s+'))[
                     case when array_length(regexp_split_to_array(btrim(n), '\s+'), 1) >= 4 then 3 else 2 end], 1) || '.' end;
$$;

-- 2) De dónde sale cada punto (uso interno) --------------------------------
create or replace function public.puntos_eventos(p_grupo uuid)
returns table (email text, tipo text, puntos int, motivo text, fecha timestamptz, manual_id bigint)
language sql
stable
security definer
set search_path = public
as $$
  with m as (select mm.email from public.miembros mm where mm.grupo_id = p_grupo and mm.activo),
       v as (select public.puntos_valores() j)
  select a.email, 'asistencia', (select (j->>'asistencia')::int from v),
         s.corto || ': ' || s.nombre
           || case when exists (select 1 from public.cronograma c where c.grupo_id = p_grupo and c.sesion_id = a.sesion_id and c.fecha2 is not null)
                   then ' (parte ' || a.parte || ')' else '' end,
         a.actualizado_el, null::bigint
    from public.asistencia a join public.reto_sesiones s on s.id = a.sesion_id
   where a.grupo_id = p_grupo and a.presente and a.email in (select email from m)
  union all
  select r.email, 'quiz', (select (j->>'quiz')::int from v), q.titulo, min(r.created_at), null
    from public.quiz_resultados r join public.quizzes q on q.id = r.quiz_id
   where r.email in (select email from m) and r.total > 0 and r.puntaje * 100 >= q.aprobar * r.total
   group by r.email, q.id, q.titulo
  union all
  select e.email, 'encuesta', (select (j->>'encuesta')::int from v), 'Encuesta ' || e.numero, e.creado_el, null
    from public.encuesta_respuestas e where e.grupo_id = p_grupo and e.email in (select email from m)
  union all
  select d.email, 'diagnostico', (select (j->>'diagnostico')::int from v), 'Diagnóstico', d.creado_el, null
    from public.diagnosticos d where d.grupo_id = p_grupo and d.email in (select email from m)
  union all
  select p.email, 'manual', p.puntos, coalesce(nullif(p.motivo, ''), 'Puntos del equipo'), p.creado_el, p.id
    from public.puntos_manuales p where p.grupo_id = p_grupo and p.email in (select email from m);
$$;
revoke all on function public.puntos_eventos(uuid) from public, anon, authenticated;

-- El ranking de un grupo: todas las personas activas, con su puesto (empates comparten puesto)
create or replace function public.puntos_ranking(p_grupo uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('email', x.email, 'nombre', x.nombre, 'rol', x.rol,
                                               'puntos', x.puntos, 'puesto', x.puesto) order by x.puesto, lower(x.nombre)), '[]'::jsonb)
    from (
      select m.email, coalesce(nullif(btrim(m.nombre), ''), split_part(m.email, '@', 1)) nombre, m.rol,
             coalesce(sum(e.puntos), 0)::int puntos,
             rank() over (order by coalesce(sum(e.puntos), 0) desc)::int puesto
        from public.miembros m
        left join public.puntos_eventos(p_grupo) e on e.email = m.email
       where m.grupo_id = p_grupo and m.activo
       group by m.email, m.nombre, m.rol
    ) x;
$$;
revoke all on function public.puntos_ranking(uuid) from public, anon, authenticated;

-- 3) Lo que ve cada persona: por cada grupo suyo, sus puntos, de dónde
--    salen y el ranking del grupo (sin correos de los demás).
create or replace function public.mis_puntos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  yo text := public.mi_email();
begin
  if yo is null then raise exception 'sin permiso'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'grupo_id', g.id, 'grupo', g.nombre, 'valores', public.puntos_valores(),
      'yo', (select jsonb_build_object('puntos', (r->>'puntos')::int, 'puesto', (r->>'puesto')::int,
                                       'de', jsonb_array_length(public.puntos_ranking(g.id)))
               from jsonb_array_elements(public.puntos_ranking(g.id)) r where r->>'email' = yo),
      'historial', (select coalesce(jsonb_agg(jsonb_build_object('tipo', e.tipo, 'puntos', e.puntos, 'motivo', e.motivo, 'fecha', e.fecha)
                                              order by e.fecha desc), '[]'::jsonb)
                      from public.puntos_eventos(g.id) e where e.email = yo),
      'ranking', (select coalesce(jsonb_agg(jsonb_build_object(
                           'nombre', case when r->>'email' = yo then r->>'nombre' else public.nombre_corto(r->>'nombre') end,
                           'puntos', (r->>'puntos')::int, 'puesto', (r->>'puesto')::int, 'yo', r->>'email' = yo)), '[]'::jsonb)
                    from jsonb_array_elements(public.puntos_ranking(g.id)) r)
    )), '[]'::jsonb)
      from public.grupos g
     where g.id::text = any(public.mis_etiquetas())
  );
end;
$$;
revoke all on function public.mis_puntos() from public;
grant execute on function public.mis_puntos() to anon, authenticated;

-- 4) Admin: el ranking completo con el detalle de cada persona
create or replace function public.admin_puntos(p_grupo uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;
  return jsonb_build_object(
    'valores', public.puntos_valores(),
    'ranking', public.puntos_ranking(p_grupo),
    'eventos', (select coalesce(jsonb_agg(jsonb_build_object('email', e.email, 'tipo', e.tipo, 'puntos', e.puntos,
                                                             'motivo', e.motivo, 'fecha', e.fecha, 'id', e.manual_id)
                                          order by e.fecha desc), '[]'::jsonb)
                  from public.puntos_eventos(p_grupo) e));
end;
$$;
revoke all on function public.admin_puntos(uuid) from public;
grant execute on function public.admin_puntos(uuid) to anon, authenticated;

create or replace function public.dar_puntos(p_grupo uuid, p_email text, p_puntos int, p_motivo text default '')
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo text := lower(btrim(coalesce(p_email, '')));
  nuevo  bigint;
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;
  if p_puntos is null or p_puntos < 1 or p_puntos > 100 then raise exception 'Los puntos van de 1 a 100.'; end if;
  if not exists (select 1 from public.miembros m where m.grupo_id = p_grupo and m.email = correo and m.activo) then
    raise exception 'Esa persona no está activa en este grupo.';
  end if;
  insert into public.puntos_manuales (grupo_id, email, puntos, motivo)
  values (p_grupo, correo, p_puntos, left(btrim(coalesce(p_motivo, '')), 200))
  returning id into nuevo;
  return nuevo;
end;
$$;
revoke all on function public.dar_puntos(uuid, text, int, text) from public;
grant execute on function public.dar_puntos(uuid, text, int, text) to anon, authenticated;

-- 5) El muro: duda, logro o prompt, y la mejor respuesta ------------------------
alter table public.comunidad_posts add column if not exists tipo text check (tipo in ('duda', 'logro', 'prompt'));
alter table public.comunidad_posts add column if not exists resuelta boolean not null default false;
alter table public.comunidad_comentarios add column if not exists mejor boolean not null default false;

-- Quien publicó (o el equipo) le pone o cambia el tipo
create or replace function public.comunidad_etiquetar(p_id uuid, p_tipo text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo jsonb := public.comunidad_yo();
begin
  if yo is null then raise exception 'sin permiso'; end if;
  if p_tipo is not null and p_tipo not in ('duda', 'logro', 'prompt') then raise exception 'tipo no válido'; end if;
  update public.comunidad_posts set tipo = p_tipo
   where id = p_id and ((yo->>'admin')::boolean or autor_email = yo->>'email');
  if not found then raise exception 'Solo quien la publicó o el equipo puede cambiarla.'; end if;
end;
$$;
grant execute on function public.comunidad_etiquetar(uuid, text) to anon, authenticated;

-- Marca la mejor respuesta de una duda (y la deja resuelta). Sin comentario:
-- quita la marca y la duda vuelve a «sin responder».
create or replace function public.comunidad_resolver(p_post uuid, p_comentario uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo jsonb := public.comunidad_yo();
begin
  if yo is null then raise exception 'sin permiso'; end if;
  if not exists (select 1 from public.comunidad_posts p where p.id = p_post
                  and ((yo->>'admin')::boolean or p.autor_email = yo->>'email')) then
    raise exception 'Solo quien preguntó o el equipo puede marcar la mejor respuesta.';
  end if;
  update public.comunidad_comentarios set mejor = (id = p_comentario) where post_id = p_post;
  if p_comentario is not null and not exists (select 1 from public.comunidad_comentarios c where c.id = p_comentario and c.post_id = p_post) then
    raise exception 'Ese comentario no es de esta publicación.';
  end if;
  update public.comunidad_posts set resuelta = p_comentario is not null where id = p_post;
  return jsonb_build_object('resuelta', p_comentario is not null, 'mejor', p_comentario);
end;
$$;
grant execute on function public.comunidad_resolver(uuid, uuid) to anon, authenticated;

-- El muro (igual que en supabase-comunidad-empresas.sql) + tipo, resuelta y,
-- solo para el admin, el correo de quien escribió (para darle puntos).
create or replace function public.comunidad_feed(p_grupo uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  yo jsonb := public.comunidad_yo();
  adm boolean;
begin
  if yo is null then
    raise exception 'sin permiso';
  end if;
  adm := (yo->>'admin')::boolean;
  return (
    select coalesce(jsonb_agg(x order by x.fijado desc, x.created_at desc), '[]'::jsonb)
      from (
        select p.id, p.autor_nombre as autor, p.autor_grupo as grupo, p.es_admin, p.titulo, p.texto,
               p.fijado, coalesce(p.publicar_en, p.created_at) as created_at, p.adjuntos,
               coalesce(p.publicar_en > now(), false) as programada, p.publicar_en,
               p.grupo_id, (select g.nombre from public.grupos g where g.id = p.grupo_id) as para,
               (select a.foto_url from public.admins a where p.es_admin and a.email = p.autor_email) as foto,
               public.comunidad_encuesta_de(p.id, p.encuesta, yo->>'email') as encuesta,
               (select count(*) from public.comunidad_likes l where l.post_id = p.id) as likes,
               exists (select 1 from public.comunidad_likes l where l.post_id = p.id and l.email = yo->>'email') as me_gusta,
               (select count(*) from public.comunidad_comentarios c where c.post_id = p.id) as comentarios,
               (select jsonb_build_object('autor', c.autor_nombre, 'texto', c.texto, 'created_at', c.created_at,
                         'foto', (select a.foto_url from public.admins a where a.email = c.autor_email))
                  from public.comunidad_comentarios c
                 where c.post_id = p.id and c.es_admin and not p.es_admin
                 order by c.created_at desc limit 1) as respuesta_equipo,
               (p.autor_email = yo->>'email') as mio,
               p.tipo, p.resuelta,
               case when adm and not p.es_admin then p.autor_email end as autor_email
          from public.comunidad_posts p
         where (p.publicar_en is null or p.publicar_en <= now() or p.autor_email = yo->>'email' or adm)
           and (case when adm then p_grupo is null or p.grupo_id is null or p.grupo_id = p_grupo
                     else public.comunidad_veo(p.grupo_id) end)
         order by p.fijado desc, coalesce(p.publicar_en, p.created_at) desc
         limit 200
      ) x
  );
end;
$$;
grant execute on function public.comunidad_feed(uuid) to anon, authenticated;

-- Comentarios (igual que en supabase-comunidad.sql) + la mejor respuesta y,
-- solo para el admin, el correo de quien comentó.
create or replace function public.comunidad_comentarios(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  yo jsonb := public.comunidad_yo();
begin
  if yo is null then
    raise exception 'sin permiso';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'padre_id', c.padre_id, 'autor', c.autor_nombre, 'grupo', c.autor_grupo, 'es_admin', c.es_admin,
             'texto', c.texto, 'created_at', c.created_at, 'mio', c.autor_email = yo->>'email',
             'foto', (select a.foto_url from public.admins a where c.es_admin and a.email = c.autor_email),
             'likes', (select count(*) from public.comunidad_com_likes l where l.comentario_id = c.id),
             'me_gusta', exists (select 1 from public.comunidad_com_likes l where l.comentario_id = c.id and l.email = yo->>'email'),
             'mejor', c.mejor,
             'autor_email', case when (yo->>'admin')::boolean and not c.es_admin then c.autor_email end)
             order by c.created_at), '[]'::jsonb)
      from public.comunidad_comentarios c
     where c.post_id = p_id
  );
end;
$$;
grant execute on function public.comunidad_comentarios(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: debe decir sí y sí
select
  (select case when count(*) = 1 then 'sí' else 'no' end from information_schema.tables
    where table_schema = 'public' and table_name = 'puntos_manuales') as tabla_puntos,
  (select case when count(*) = 3 then 'sí' else 'no' end from information_schema.columns
    where table_schema = 'public' and ((table_name = 'comunidad_posts' and column_name in ('tipo', 'resuelta'))
                                    or (table_name = 'comunidad_comentarios' and column_name = 'mejor'))) as muro;
