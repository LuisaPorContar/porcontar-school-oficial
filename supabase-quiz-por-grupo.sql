-- =====================================================================
-- Resultados de quizzes por empresa (2026-11-20)
-- Los quizzes son los mismos para todos los grupos, pero la estadística
-- se veía con las respuestas de todas las empresas juntas: en el espacio
-- de Solemei aparecían las de DistriKIA. Ahora:
--   · quiz_stats(p_grupo): con un grupo, solo las respuestas de sus personas;
--     sin grupo (el Principal), todas.
--   · borrar_persona_quiz y borrar_intentos_quiz: con un grupo, solo borran
--     las de ese grupo (antes «Borrar todas las respuestas» borraba las de
--     todas las empresas).
--   · Cada persona se cuenta por su correo, no por su nombre: dos personas
--     de empresas distintas con el mismo nombre ya no se mezclan.
-- Solo la usan las admin. Se puede correr las veces que sea.
-- =====================================================================

drop function if exists public.quiz_stats();
drop function if exists public.borrar_persona_quiz(text, text);
drop function if exists public.borrar_intentos_quiz(text);

-- Estadística para el admin: el último intento de cada persona
create or replace function public.quiz_stats(p_grupo uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ultimos as (
    select distinct on (r.quiz_id, coalesce(r.email, r.persona)) r.*
      from public.quiz_resultados r
     where public.is_admin()
       and (p_grupo is null
            or r.email in (select m.email from public.miembros m where m.grupo_id = p_grupo))
     order by r.quiz_id, coalesce(r.email, r.persona), r.created_at desc
  ), por_quiz as (
    select q.id, q.titulo, q.activo, jsonb_array_length(q.preguntas) as preguntas,
           count(u.id)                                    as personas,
           coalesce(sum(u.puntaje), 0)                    as aciertos,
           coalesce(sum(u.total), 0)                      as respondidas,
           coalesce(jsonb_agg(u.aciertos order by u.created_at desc) filter (where u.id is not null), '[]'::jsonb) as detalle,
           coalesce(jsonb_agg(jsonb_build_object('persona', u.persona, 'nombre', u.nombre, 'email', u.email,
                                                 'puntaje', u.puntaje,
                                                 'total', u.total, 'fecha', u.created_at)
                              order by u.created_at desc) filter (where u.id is not null), '[]'::jsonb) as intentos
      from public.quizzes q
      left join ultimos u on u.quiz_id = q.id
     where public.is_admin()
     group by q.id, q.titulo, q.activo, q.preguntas, q.orden
     order by q.orden, q.id
  )
  select coalesce(jsonb_agg(to_jsonb(por_quiz)), '[]'::jsonb) from por_quiz;
$$;

-- Quitar a una persona de la estadística de un quiz (para limpiar pruebas).
-- p_persona puede ser su correo o su nombre; con p_grupo, solo en ese grupo.
create or replace function public.borrar_persona_quiz(p_quiz_id text, p_persona text, p_grupo uuid default null)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  quien text := lower(btrim(coalesce(p_persona, '')));
  n int;
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;
  if quien = '' then raise exception 'Falta a quién quitar.'; end if;
  delete from public.quiz_resultados r
   where r.quiz_id = p_quiz_id
     and (lower(coalesce(r.email, '')) = quien or (r.email is null and r.persona = quien))
     and (p_grupo is null
          or r.email in (select m.email from public.miembros m where m.grupo_id = p_grupo));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Borrar los intentos de un quiz: con p_grupo, solo los de ese grupo
create or replace function public.borrar_intentos_quiz(p_quiz_id text, p_grupo uuid default null)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  n int;
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;
  delete from public.quiz_resultados r
   where r.quiz_id = p_quiz_id
     and (p_grupo is null
          or r.email in (select m.email from public.miembros m where m.grupo_id = p_grupo));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.quiz_stats(uuid) from public;
revoke all on function public.borrar_persona_quiz(text, text, uuid) from public;
revoke all on function public.borrar_intentos_quiz(text, uuid) from public;
grant execute on function public.quiz_stats(uuid) to anon, authenticated;
grant execute on function public.borrar_persona_quiz(text, text, uuid) to anon, authenticated;
grant execute on function public.borrar_intentos_quiz(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las tres columnas deben decir «sí»
select
  case when to_regprocedure('public.quiz_stats(uuid)') is not null then 'sí' else 'no' end as estadistica_por_grupo,
  case when to_regprocedure('public.borrar_persona_quiz(text, text, uuid)') is not null then 'sí' else 'no' end as quitar_persona_por_grupo,
  case when to_regprocedure('public.borrar_intentos_quiz(text, uuid)') is not null then 'sí' else 'no' end as borrar_por_grupo;
