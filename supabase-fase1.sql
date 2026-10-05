-- ================================================================
-- PorContar Academia · Fase 1: ficha de empresa, sesiones editables,
-- cronograma por empresa y grabaciones con progreso.
--
-- Va DESPUÉS de supabase-academia.sql y supabase-empresas.sql.
-- Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se puede correr varias veces: no borra contenido.
-- No lleva la clave de admin.
-- ================================================================

-- 1) Ficha de la empresa -------------------------------------------
alter table public.grupos
  add column if not exists logo_url          text,
  add column if not exists nit               text,
  add column if not exists sector            text,
  add column if not exists plazas            int check (plazas is null or plazas >= 0),
  add column if not exists contacto_nombre   text,
  add column if not exists contacto_cargo    text,
  add column if not exists contacto_email    text,
  add column if not exists contacto_telefono text,
  add column if not exists whatsapp_url      text,
  add column if not exists fecha_inicio      date,
  add column if not exists fecha_fin         date;

-- Guarda la ficha (todo menos nombre, tipo, contraseña y acceso, que van por admin_guardar_grupo)
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
    updated_at        = now()
  where id = p_id;
  if not found then
    raise exception 'Ese grupo no existe';
  end if;
end;
$$;

-- La lista del admin, ahora con la ficha completa (nunca la contraseña)
create or replace function public.admin_grupos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'sin permiso';
  end if;
  return (
    select coalesce(jsonb_agg((to_jsonb(g) - 'clave_hash') || jsonb_build_object(
             'vigente', g.activo and (g.vence_el is null or g.vence_el >= public.hoy()),
             'miembros', (select count(*) from public.miembros m where m.grupo_id = g.id and m.activo),
             'responsables', (select count(*) from public.miembros m where m.grupo_id = g.id and m.activo and m.rol = 'responsable'),
             'han_entrado', (select count(*) from public.miembros m where m.grupo_id = g.id and m.ultimo_acceso is not null)
           ) order by g.tipo, lower(g.nombre)), '[]'::jsonb)
      from public.grupos g
  );
end;
$$;

-- 2) Sesiones del reto, editables desde la app ---------------------
create table if not exists public.reto_sesiones (
  id          text primary key,
  orden       int  not null default 0,
  corto       text not null,                 -- "Sesión 1", "Kick off", "Cierre"
  nombre      text not null,
  descripcion text not null default '',
  icono       text not null default 's-1',
  tipo        text not null default 'clase' check (tipo in ('kickoff', 'clase', 'proyecto', 'cierre')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Las sesiones del reto con las que arranca la academia (después se editan desde la app).
-- Los id s0… son los de antes: lo que ya estaba publicado en ellas no se mueve.
insert into public.reto_sesiones (id, orden, corto, nombre, descripcion, icono, tipo) values
  ('pre', 0, 'Antes de empezar', 'Preconfiguración', '', 's-pre', 'clase'),
  ('s0',  1, 'Clase 00', 'Kickoff', '', 's-0', 'kickoff'),
  ('s1',  2, 'Clase 1', 'Claude socio estratégico', '', 's-base', 'clase'),
  ('s2',  3, 'Clase 2', 'Claude y la construcción de datos', '', 's-2', 'clase'),
  ('s3',  4, 'Clase 3', 'Automatización de procesos', '', 's-3', 'clase'),
  ('s4',  5, 'Clase 4', 'Claude Code', '', 's-4', 'clase'),
  ('s5',  6, 'Clase 5', 'Presentación de proyectos', '', 's-5', 'proyecto')
on conflict (id) do nothing;

alter table public.reto_sesiones enable row level security;
drop policy if exists "reto lectura"    on public.reto_sesiones;
drop policy if exists "reto admin crea" on public.reto_sesiones;
drop policy if exists "reto admin edita" on public.reto_sesiones;
drop policy if exists "reto admin borra" on public.reto_sesiones;
-- Encendida / apagada: las apagadas solo las ve el admin (para prepararlas)
alter table public.reto_sesiones add column if not exists visible boolean not null default true;

create policy "reto lectura" on public.reto_sesiones
  for select using ((select public.is_admin()) or (visible and (select cardinality(public.mis_etiquetas())) > 0));
create policy "reto admin crea" on public.reto_sesiones
  for insert with check (public.is_admin());
create policy "reto admin edita" on public.reto_sesiones
  for update using (public.is_admin()) with check (public.is_admin());
create policy "reto admin borra" on public.reto_sesiones
  for delete using (public.is_admin());

-- 3) Cronograma de cada empresa -------------------------------------
create table if not exists public.cronograma (
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  sesion_id   text not null references public.reto_sesiones(id) on delete cascade,
  fecha       date,
  hora        time,
  plataforma  text not null default 'Google Meet',
  enlace      text,
  nota        text,
  updated_at  timestamptz not null default now(),
  primary key (grupo_id, sesion_id)
);

alter table public.cronograma enable row level security;
drop policy if exists "cronograma lectura" on public.cronograma;
drop policy if exists "cronograma admin"   on public.cronograma;
create policy "cronograma lectura" on public.cronograma
  for select using ((select public.is_admin()) or array[grupo_id::text] && (select public.mis_etiquetas()));
create policy "cronograma admin" on public.cronograma
  for all using (public.is_admin()) with check (public.is_admin());

-- 4) Grabaciones de cada empresa ------------------------------------
create table if not exists public.grabaciones (
  id          text primary key,
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  sesion_id   text not null references public.reto_sesiones(id) on delete cascade,
  titulo      text not null default '',
  youtube_id  text not null check (youtube_id ~ '^[A-Za-z0-9_-]{6,20}$'),
  orden       int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists grabaciones_grupo_idx on public.grabaciones (grupo_id, sesion_id, orden);

alter table public.grabaciones enable row level security;
drop policy if exists "grabaciones lectura" on public.grabaciones;
drop policy if exists "grabaciones admin"   on public.grabaciones;
create policy "grabaciones lectura" on public.grabaciones
  for select using ((select public.is_admin()) or array[grupo_id::text] && (select public.mis_etiquetas()));
create policy "grabaciones admin" on public.grabaciones
  for all using (public.is_admin()) with check (public.is_admin());

-- Cuánto vio cada persona de cada grabación. Solo se escribe con registrar_video.
create table if not exists public.progreso_video (
  email        text not null,
  grabacion_id text not null references public.grabaciones(id) on delete cascade,
  vistas       int  not null default 0,          -- cuántas veces la reprodujo
  segundos     int  not null default 0,          -- hasta dónde llegó (lo más lejos)
  duracion     int,
  completado   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (email, grabacion_id)
);
alter table public.progreso_video enable row level security;

-- Días en que cada persona entró (para "días activos" en el panel)
create table if not exists public.actividad (
  email  text not null,
  dia    date not null,
  primary key (email, dia)
);
alter table public.actividad enable row level security;

-- El reproductor avisa: 'inicio' (cuenta una vista), 'progreso' (cada tanto) o 'fin'.
-- Como no se puede adelantar, "hasta dónde llegó" es lo que de verdad vio.
create or replace function public.registrar_video(p_id text, p_evento text, p_pos numeric, p_dur numeric)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo text := public.mi_email();
  g      public.grabaciones;
  fila   public.progreso_video;
  pos    int := greatest(0, floor(coalesce(p_pos, 0)))::int;
  dur    int := nullif(greatest(0, floor(coalesce(p_dur, 0)))::int, 0);
begin
  if correo is null or cardinality(public.mis_etiquetas()) = 0 then
    raise exception 'Tu sesión terminó. Vuelve a entrar.';
  end if;
  if p_evento not in ('inicio', 'progreso', 'fin') then
    raise exception 'evento no válido';
  end if;
  select * into g from public.grabaciones where id = p_id;
  if not found or not (g.grupo_id::text = any (public.mis_etiquetas())) then
    raise exception 'grabación no encontrada';
  end if;

  insert into public.progreso_video as pv (email, grabacion_id, vistas, segundos, duracion, completado)
  values (correo, p_id, case when p_evento = 'inicio' then 1 else 0 end, pos, dur,
          p_evento = 'fin' or (dur is not null and pos >= dur * 0.95))
  on conflict (email, grabacion_id) do update set
    vistas     = pv.vistas + case when p_evento = 'inicio' then 1 else 0 end,
    segundos   = greatest(pv.segundos, excluded.segundos),
    duracion   = coalesce(excluded.duracion, pv.duracion),
    completado = pv.completado or excluded.completado,
    updated_at = now()
  returning * into fila;

  insert into public.actividad (email, dia) values (correo, public.hoy()) on conflict do nothing;
  return jsonb_build_object('segundos', fila.segundos, 'completado', fila.completado, 'vistas', fila.vistas);
end;
$$;

-- El avance de quien mira en cada grabación: { id: {segundos, duracion, completado, vistas} }
create or replace function public.mi_progreso_video()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(grabacion_id, jsonb_build_object(
           'segundos', segundos, 'duracion', duracion, 'completado', completado, 'vistas', vistas)), '{}'::jsonb)
    from public.progreso_video where email = public.mi_email();
$$;

-- 5) Perfil: la persona recibe la ficha pública de su grupo ----------
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
           'fecha_inicio', g.fecha_inicio, 'fecha_fin', g.fecha_fin)
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

-- 6) Panel del equipo: suma grabaciones, reproducciones y días activos
create or replace function public.panel_grupo(p_grupo uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g    public.grupos;
  etq  text[];
begin
  if not public.is_admin() and not exists (
    select 1 from public.miembros m
     where m.grupo_id = p_grupo and m.email = public.mi_email()
       and m.rol = 'responsable' and m.activo
  ) or (not public.is_admin() and not (p_grupo::text = any (public.mis_etiquetas()))) then
    raise exception 'Solo el responsable de este grupo ve su avance';
  end if;

  select * into g from public.grupos where id = p_grupo;
  if not found then
    raise exception 'Ese grupo no existe';
  end if;
  etq := array[g.id::text, 'tipo:' || g.tipo];

  return jsonb_build_object(
    'grupo', jsonb_build_object('id', g.id, 'nombre', g.nombre, 'tipo', g.tipo,
                                'vence_el', g.vence_el, 'activo', g.activo, 'logo_url', g.logo_url,
                                'plazas', g.plazas),
    'miembros', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'email', m.email, 'nombre', m.nombre, 'rol', m.rol, 'activo', m.activo,
               'ultimo_acceso', m.ultimo_acceso,
               'dias_activos', (select count(*) from public.actividad x where x.email = m.email),
               'tareas', coalesce(a.estado, '{}'::jsonb), 'tareas_at', a.updated_at,
               'vistos', coalesce((select jsonb_agg(v.post_id) from public.vistos v where v.email = m.email), '[]'::jsonb),
               'grabaciones', coalesce((
                  select jsonb_object_agg(pv.grabacion_id, jsonb_build_object(
                           'completado', pv.completado, 'vistas', pv.vistas, 'segundos', pv.segundos, 'duracion', pv.duracion))
                    from public.progreso_video pv
                    join public.grabaciones gr on gr.id = pv.grabacion_id and gr.grupo_id = g.id
                   where pv.email = m.email), '{}'::jsonb),
               'quizzes', coalesce((
                  select jsonb_agg(jsonb_build_object('quiz_id', r.quiz_id, 'puntaje', r.puntaje,
                                                      'total', r.total, 'fecha', r.created_at))
                    from (select distinct on (quiz_id) * from public.quiz_resultados
                           where email = m.email order by quiz_id, created_at desc) r), '[]'::jsonb)
             ) order by lower(coalesce(nullif(m.nombre, ''), m.email))), '[]'::jsonb)
        from public.miembros m
        left join public.avance_tareas a on a.email = m.email
       where m.grupo_id = g.id
    ),
    'grabaciones', (
      select coalesce(jsonb_agg(jsonb_build_object('id', gr.id, 'titulo', gr.titulo, 'sesion_id', gr.sesion_id)
                                order by s.orden, gr.orden), '[]'::jsonb)
        from public.grabaciones gr join public.reto_sesiones s on s.id = gr.sesion_id
       where gr.grupo_id = g.id
    ),
    'posts', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'session', p.session,
                                                   'video_url', p.video_url, 'video_name', p.video_name)
                                order by p.created_at), '[]'::jsonb)
        from public.posts p
       where p.session <> 'faq'
         and (p.video_url is not null or p.video_path is not null)
         and (cardinality(p.audiencia) = 0 or p.audiencia && etq)
    ),
    'quizzes', (
      select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'titulo', q.titulo,
                                                   'preguntas', jsonb_array_length(q.preguntas))
                                order by q.orden, q.id), '[]'::jsonb)
        from public.quizzes q
       where q.activo and jsonb_array_length(q.preguntas) > 0
         and (cardinality(q.audiencia) = 0 or q.audiencia && etq)
    )
  );
end;
$$;

-- 7) Logos: el admin los sube a la carpeta logos/ del bucket ----------
update storage.buckets
   set allowed_mime_types = array['video/mp4','video/webm','video/quicktime','video/x-m4v',
                                  'image/jpeg','image/png','image/gif','image/webp','image/avif','image/svg+xml',
                                  'application/pdf']
 where id = 'videos-academia';

-- 8) Permisos ---------------------------------------------------------
grant execute on function public.admin_ficha_grupo(uuid, jsonb)                  to anon, authenticated;
grant execute on function public.admin_grupos()                                  to anon, authenticated;
grant execute on function public.registrar_video(text, text, numeric, numeric)   to anon, authenticated;
grant execute on function public.mi_progreso_video()                             to anon, authenticated;
grant execute on function public.mi_perfil()                                     to anon, authenticated;
grant execute on function public.panel_grupo(uuid)                               to anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: todo debe salir con valor (ninguno en null)
select
  to_regclass('public.reto_sesiones')   as tabla_reto,
  to_regclass('public.cronograma')      as tabla_cronograma,
  to_regclass('public.grabaciones')     as tabla_grabaciones,
  to_regclass('public.progreso_video')  as tabla_progreso,
  to_regproc('public.registrar_video')  as funcion_registrar,
  (select count(*) from public.reto_sesiones) as sesiones_cargadas,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'grupos' and column_name = 'whatsapp_url') as columna_whatsapp;
