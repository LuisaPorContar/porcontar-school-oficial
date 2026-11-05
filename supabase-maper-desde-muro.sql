-- ================================================================
-- PorContar Academia · Maper: pasar a la Academia todo lo del muro
-- virtual.porcontar.com (Muro IA Learn Productividad)
--
-- Las dos bases viven en proyectos distintos de Supabase, así que va
-- en dos pasos:
--
--   PASO 1 · Este archivo se corre en el proyecto del MURO
--            (hbucnlegbluijrdwsopl): Supabase → SQL Editor → New query
--            → pegar TODO → Run. No cambia nada en el muro: solo lee y
--            devuelve una fila con la columna «script».
--
--   PASO 2 · Copiar la celda «script» completa y correrla en el
--            proyecto de la ACADEMIA (lcbonixjumchbhffyxee) → SQL Editor
--            → New query → pegar → Run. Antes tiene que existir el grupo
--            Maper en Empresas y cohortes, con formato reto.
--
-- Qué se pasa (todo con audiencia = el grupo Maper: nadie más lo ve):
--   · Publicaciones de las sesiones (pre, s0…s5), tutoriales express y
--     preguntas frecuentes → posts, en la misma sesión que tenían.
--   · Catálogo de skills → skills (las apagadas siguen apagadas).
--   · Quizzes → quizzes (los activos siguen activos).
--   Los ids llevan el prefijo «maper-»: correr el paso 2 otra vez no
--   duplica nada, solo agrega lo que falte.
--
-- Qué NO se pasa:
--   · Los archivos subidos (videos, imágenes, PDF) siguen guardados en
--     el bucket del muro y se ven por su enlace público. Si algún día se
--     borra o se pausa ese proyecto de Supabase, dejan de verse.
--   · Resultados de quizzes y avance del trabajo autónomo: el muro los
--     guardaba por nombre y la Academia por correo; no hay cómo unirlos.
--   · Vocabulario, Configurar Claude y Trabajo autónomo: ya están en la
--     Academia (en versión más nueva) y Maper los ve como cualquier grupo.
-- ================================================================

with
p as (
  select count(*) as n,
         coalesce(string_agg(format(
           'insert into public.posts (id, session, title, body, pinned, author, initials, video_url, video_path, video_name, reactions, orden, created_at, updated_at, audiencia)'
           || E'\n    values (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L::jsonb, %s, %L, %L, (select aud from maper)) on conflict (id) do nothing;',
           'maper-' || x.id, x.session, x.title, x.body, x.pinned, x.author, x.initials,
           x.video_url, x.video_path, x.video_name, x.reactions::text,
           coalesce(to_jsonb(x) ->> 'orden', 'null'), x.created_at, x.updated_at),
           E'\n' order by x.created_at), '') as sql
    from public.posts_prod x
),
s as (
  select count(*) as n,
         coalesce(string_agg(format(
           'insert into public.skills (id, title, area, level, tags, objective, prompt, visible, created_at, updated_at, audiencia)'
           || E'\n    values (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, (select aud from maper)) on conflict (id) do nothing;',
           'maper-' || x.id, x.title, x.area, x.level, x.tags, x.objective, x.prompt,
           coalesce(to_jsonb(x) ->> 'visible', 'true'), x.created_at, x.updated_at),
           E'\n' order by x.created_at), '') as sql
    from public.skills_prod x
),
q as (
  select count(*) as n,
         coalesce(string_agg(format(
           'insert into public.quizzes (id, titulo, descripcion, activo, orden, preguntas, created_at, updated_at, audiencia)'
           || E'\n    values (%L, %L, %L, %L, %s, %L::jsonb, %L, %L, (select aud from maper)) on conflict (id) do nothing;',
           'maper-' || x.id, x.titulo, x.descripcion, x.activo, x.orden, x.preguntas::text,
           x.created_at, x.updated_at),
           E'\n' order by x.orden, x.created_at), '') as sql
    from public.quizzes_prod x
)
select p.n as publicaciones, s.n as skills, q.n as quizzes,
$h$-- ================================================================
-- PASO 2 · Correr en el proyecto de la ACADEMIA (lcbonixjumchbhffyxee)
-- Pasa a Maper el contenido del muro virtual.porcontar.com.
-- Pegar TODO y correrlo de una vez: si algo falla, no queda nada a
-- medias (el SQL Editor lo corre como una sola transacción).
-- ================================================================

-- Primero se revisa que el grupo Maper exista, sea uno solo y siga el reto
do $revisar$
declare
  n   int;
  fmt text;
begin
  select count(*) into n from public.grupos where nombre ilike '%maper%';
  if n = 0 then
    raise exception 'No hay ningún grupo Maper en la Academia. Créalo en Empresas y cohortes y vuelve a correr esto.';
  elsif n > 1 then
    raise exception 'Hay % grupos con «Maper» en el nombre. Deja uno solo (o cámbiale el nombre a los demás) y vuelve a correr esto.', n;
  end if;
  select coalesce(to_jsonb(g) ->> 'formato', 'reto') into fmt from public.grupos g where g.nombre ilike '%maper%';
  if fmt = 'corto' then
    raise exception 'El grupo Maper está con formato corto (bootcamp o charla): cámbialo a reto para que vea las sesiones del reto.';
  end if;
end $revisar$;

-- La audiencia: solo el grupo Maper
create temp table maper on commit drop as
  select array[id::text] as aud from public.grupos where nombre ilike '%maper%';

-- Publicaciones, tutoriales y preguntas frecuentes
$h$ || p.sql || $m$

-- Catálogo de skills
$m$ || s.sql || $m$

-- Quizzes
$m$ || q.sql || $f$

-- Comprobación: lo que quedó para Maper. «sin sesion» debe dar 0; si no,
-- hay publicaciones en una sesión que la Academia no tiene en el reto.
select 'publicaciones' as que, count(*) as total from public.posts  where id like 'maper-%'
union all
select 'skills',  count(*) from public.skills  where id like 'maper-%'
union all
select 'quizzes', count(*) from public.quizzes where id like 'maper-%'
union all
select 'sin sesion', count(*) from public.posts p
 where p.id like 'maper-%' and p.session not in ('faq', 'tuto')
   and not exists (select 1 from public.reto_sesiones r where r.id = p.session and r.grupo_id is null);
$f$ as script
from p, s, q;
