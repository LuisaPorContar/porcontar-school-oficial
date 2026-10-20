-- ================================================================
-- PorContar Academia · agenda automática de las clases en vivo
-- Correr COMPLETO una vez en Supabase → SQL Editor (proyecto lcbonixjumchbhffyxee).
-- Se puede correr más de una vez.
--
--   · El cronograma guarda un segundo encuentro por sesión (fecha2 y hora2):
--     en la agenda de 2 encuentros de 1 hora por semana, cada clase de 2 horas
--     se parte en dos (por ejemplo martes y miércoles).
--   · Nuevo tipo de sesión «qa» y la sesión QA del reto, justo antes de la
--     Presentación de proyectos.
-- ================================================================

-- 1) Segundo encuentro de cada sesión ---------------------------------
alter table public.cronograma add column if not exists fecha2 date;
alter table public.cronograma add column if not exists hora2  time;

-- 2) El tipo «qa» (preguntas y respuestas) ----------------------------
alter table public.reto_sesiones drop constraint if exists reto_sesiones_tipo_check;
alter table public.reto_sesiones add constraint reto_sesiones_tipo_check
  check (tipo in ('kickoff', 'clase', 'qa', 'proyecto', 'cierre'));

-- 3) La sesión QA del reto, antes de la Presentación de proyectos ------
-- Si ya existe no se toca. Las sesiones desde la Presentación bajan un puesto.
do $$
declare o int;
begin
  if not exists (select 1 from public.reto_sesiones where id = 'qa') then
    select min(orden) into o from public.reto_sesiones where tipo = 'proyecto' and grupo_id is null;
    if o is null then
      select coalesce(max(orden), 0) + 1 into o from public.reto_sesiones where grupo_id is null;
    end if;
    update public.reto_sesiones set orden = orden + 1 where grupo_id is null and orden >= o;
    insert into public.reto_sesiones (id, orden, corto, nombre, descripcion, icono, tipo)
    values ('qa', o, 'QA', 'Preguntas y respuestas', '', 's-1', 'qa');
  end if;
end $$;

notify pgrst, 'reload schema';

-- Comprobación: el reto en orden, con la QA antes de la Presentación,
-- y el cronograma con sus columnas nuevas
select orden, id, corto, nombre, tipo from public.reto_sesiones where grupo_id is null order by orden;
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'cronograma' and column_name in ('fecha2', 'hora2');
