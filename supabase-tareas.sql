-- ================================================================
-- PorContar Academia · Trabajo autónomo editable y extras generales.
--
-- 1) El trabajo autónomo deja de ser una página fija: cada tarea es una
--    lista de pasos (checklist) que se crea, edita, ordena, enciende y
--    apaga desde la app. Lo que cada persona ya marcó se conserva.
-- 2) Ajustes generales: qué secciones de «Extras» ve la gente en general
--    (además de lo que se apaga grupo por grupo en su ficha).
--
-- Va DESPUÉS de supabase-comunidad.sql.
-- Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se puede correr varias veces: no borra contenido.
-- No lleva la clave de admin.
-- ================================================================

-- 1) Tareas ----------------------------------------------------------
create table if not exists public.tareas (
  id          text primary key,
  orden       int  not null default 0,
  sesion_id   text references public.reto_sesiones(id) on delete set null,   -- a qué clase pertenece (opcional)
  titulo      text not null,
  descripcion text not null default '',
  pasos       jsonb not null default '[]'::jsonb,                            -- [{id, texto}]: cada paso es una casilla
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Las tareas con las que arranca: las mismas que traía la página, con los mismos
-- identificadores de paso, para que lo que cada persona ya marcó siga marcado.
insert into public.tareas (id, orden, sesion_id, titulo, descripcion, pasos)
select v.id, v.orden, (select id from public.reto_sesiones where id = 's1'), v.titulo, v.descripcion, v.pasos::jsonb
  from (values
    ('t1', 0, 'Tener el archivo .md con el resumen de tu empresa', 'Un documento corto que Claude pueda leer cada vez que trabaje contigo.',
      '[{"id":"t1a","texto":"Tengo el archivo .md con el resumen de mi empresa"}]'),
    ('t2', 1, 'Crear un proyecto en Claude', 'El proyecto guarda el contexto de tu empresa para todos tus chats.',
      '[{"id":"t2a","texto":"Crea un proyecto nuevo con el nombre de tu empresa"},{"id":"t2b","texto":"Sube el archivo .md al conocimiento del proyecto"},{"id":"t2c","texto":"Confirma que el archivo aparece cargado dentro del proyecto"}]'),
    ('t3', 2, 'Tener 5 chats dentro del proyecto', 'Un chat por área, así cada conversación conserva su propio hilo.',
      '[{"id":"t3a","texto":"Chat de Estrategia"},{"id":"t3b","texto":"Chat de SEO"},{"id":"t3c","texto":"Chat de Pauta"},{"id":"t3d","texto":"Chat de Redes sociales"},{"id":"t3e","texto":"Chat de Métricas y performance"}]'),
    ('t4', 3, 'Crear 1 prompt con el GPT personalizado', 'Elige un tema, escribe el prompt y revisa qué te responde.',
      '[{"id":"t4a","texto":"Elige el tema de tu prompt"},{"id":"t4b","texto":"Escribe el prompt en tu GPT personalizado"},{"id":"t4c","texto":"Revisa la respuesta y ajusta el prompt una vez"}]')
  ) as v(id, orden, titulo, descripcion, pasos)
 where not exists (select 1 from public.tareas);     -- solo la primera vez: si ya las editaste, no vuelven

alter table public.tareas enable row level security;
drop policy if exists "tareas lectura" on public.tareas;
drop policy if exists "tareas admin"   on public.tareas;
-- Las apagadas solo las ve el admin
create policy "tareas lectura" on public.tareas
  for select using ((select public.is_admin()) or (visible and (select cardinality(public.mis_etiquetas())) > 0));
create policy "tareas admin" on public.tareas
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.tareas to anon, authenticated;

-- 2) Ajustes generales de la academia ---------------------------------
-- extras_off: las secciones de «Extras» apagadas para todo el mundo.
create table if not exists public.ajustes (
  clave      text primary key,
  valor      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.ajustes enable row level security;
drop policy if exists "ajustes lectura" on public.ajustes;
drop policy if exists "ajustes admin"   on public.ajustes;
create policy "ajustes lectura" on public.ajustes for select using (true);
create policy "ajustes admin"   on public.ajustes for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.ajustes to anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: debe decir "tareas", "ajustes" y cuántas tareas hay
select to_regclass('public.tareas') as tabla_tareas, to_regclass('public.ajustes') as tabla_ajustes,
       (select count(*) from public.tareas) as tareas_cargadas;
