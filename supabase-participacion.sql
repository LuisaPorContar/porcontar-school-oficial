-- =====================================================================
-- Participación por empresa (2026-11-10)
-- Una tabla para Luisa y Ximena: por cada persona del grupo, a qué
-- encuentros vino (y su %), qué encuestas respondió, si hizo el
-- diagnóstico, su mejor puntaje en cada quiz, los puntos extra y el total.
-- Solo lo leen las admin. Se puede correr las veces que sea.
-- Requiere: supabase-asistencia.sql, supabase-formularios.sql y supabase-puntos.sql
-- =====================================================================

create or replace function public.admin_participacion(p_grupo uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g   record;
  res jsonb;
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;
  select * into g from public.grupos where id = p_grupo;
  if not found then raise exception 'No existe ese grupo'; end if;

  with
  -- Los encuentros: lo que está en el cronograma (con su segunda parte si la tiene)
  -- más cualquier clase donde ya se tomó asistencia
  enc as (
    select c.sesion_id, 1::smallint parte, c.fecha from public.cronograma c where c.grupo_id = p_grupo
    union
    select c.sesion_id, 2::smallint, c.fecha2 from public.cronograma c where c.grupo_id = p_grupo and c.fecha2 is not null
    union
    select a.sesion_id, a.parte, null::date from public.asistencia a where a.grupo_id = p_grupo
  ),
  enc1 as (   -- un solo registro por encuentro (si vino por las dos vías, la fecha del cronograma)
    select sesion_id, parte, max(fecha) fecha from enc group by sesion_id, parte
  ),
  clases as (
    select e.sesion_id, e.parte, e.fecha, s.corto, s.nombre, s.orden, s.tipo,
           exists (select 1 from public.asistencia a
                    where a.grupo_id = p_grupo and a.sesion_id = e.sesion_id and a.parte = e.parte) tomada,
           exists (select 1 from enc1 x where x.sesion_id = e.sesion_id and x.parte = 2) partida
      from enc1 e join public.reto_sesiones s on s.id = e.sesion_id
  ),
  gente as (
    select m.email, coalesce(nullif(btrim(m.nombre), ''), split_part(m.email, '@', 1)) nombre, m.rol
      from public.miembros m where m.grupo_id = p_grupo and m.activo
  ),
  qz as (   -- los quizzes que le tocan al grupo (o que alguien del grupo ya hizo)
    select q.id, q.titulo, q.aprobar, q.orden
      from public.quizzes q
     where (q.activo and (coalesce(cardinality(q.audiencia), 0) = 0
                          or q.audiencia && array[p_grupo::text, 'tipo:' || g.tipo]))
        or exists (select 1 from public.quiz_resultados r join gente on gente.email = r.email where r.quiz_id = q.id)
  ),
  ev as (select * from public.puntos_eventos(p_grupo))
  select jsonb_build_object(
    'grupo', g.nombre,
    'diagnostico', not ('diagnostico' = any(coalesce(g.extras_off, '{}'))),
    'encuestas_on', not ('encuestas' = any(coalesce(g.extras_off, '{}'))),
    'clases', coalesce((select jsonb_agg(jsonb_build_object(
                 'sesion_id', c.sesion_id, 'parte', c.parte, 'partida', c.partida, 'fecha', c.fecha,
                 'corto', c.corto, 'nombre', c.nombre, 'tipo', c.tipo, 'tomada', c.tomada)
               order by c.orden, c.sesion_id, c.parte) from clases c), '[]'::jsonb),
    'encuestas', coalesce((select jsonb_agg(jsonb_build_object('numero', e.numero, 'abierta', e.abierta, 'sesion_id', e.sesion_id)
                 order by e.numero) from public.encuestas e where e.grupo_id = p_grupo), '[]'::jsonb),
    'quizzes', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'titulo', q.titulo, 'aprobar', q.aprobar)
                 order by q.orden, q.titulo) from qz q), '[]'::jsonb),
    'personas', coalesce((select jsonb_agg(jsonb_build_object(
        'email', p.email, 'nombre', p.nombre, 'rol', p.rol,
        'asistio', coalesce((select jsonb_object_agg(a.sesion_id || ':' || a.parte, a.presente)
                               from public.asistencia a where a.grupo_id = p_grupo and a.email = p.email), '{}'::jsonb),
        'encuestas', coalesce((select jsonb_agg(r.numero order by r.numero)
                                 from public.encuesta_respuestas r where r.grupo_id = p_grupo and r.email = p.email), '[]'::jsonb),
        'diagnostico', exists (select 1 from public.diagnosticos d where d.grupo_id = p_grupo and d.email = p.email),
        'quizzes', coalesce((select jsonb_object_agg(x.quiz_id, jsonb_build_object(
                               'mejor', x.mejor, 'intentos', x.intentos, 'aprobado', x.aprobado))
                               from (select r.quiz_id,
                                            max(round(100.0 * r.puntaje / nullif(r.total, 0)))::int mejor,
                                            count(*)::int intentos,
                                            bool_or(r.total > 0 and r.puntaje * 100 >= q.aprobar * r.total) aprobado
                                       from public.quiz_resultados r join qz q on q.id = r.quiz_id
                                      where r.email = p.email group by r.quiz_id) x), '{}'::jsonb),
        'extra', coalesce((select sum(e.puntos) from ev e where e.email = p.email and e.tipo = 'manual'), 0)::int,
        'puntos', coalesce((select sum(e.puntos) from ev e where e.email = p.email), 0)::int)
      order by lower(p.nombre)) from gente p), '[]'::jsonb)
  ) into res;
  return res;
end;
$$;
revoke all on function public.admin_participacion(uuid) from public, anon;
grant execute on function public.admin_participacion(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- Verificación: debe salir una fila con admin_participacion
select proname from pg_proc where proname = 'admin_participacion';
