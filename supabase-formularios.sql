-- ================================================================
-- PorContar Academia · Encuesta de satisfacción y diagnóstico
--
--   · Encuestas: 5 por grupo (1 a 5), sin importar si las clases van
--     partidas. El admin abre cada una desde el inicio de la empresa y
--     elige de qué clase es. Cada persona la responde una vez dentro de la
--     app (la app ya sabe quién es). Las preguntas se editan en la app
--     (formulario_preguntas) y cada respuesta se guarda con su pregunta.
--   · Diagnóstico: una vez por persona, antes de empezar, dentro de la app.
--     Las respuestas se guardan con su pregunta, así se leen solas.
--   · Los dos se apagan por grupo con los interruptores de «Editar empresa»
--     (extras_off: 'diagnostico', 'encuestas'). Maper queda sin diagnóstico.
--   · Los correos (avisar y recordar a quienes faltan) los arma
--     formulario_correo y salen manuales desde el Gmail de quien los manda.
--
-- Va DESPUÉS de supabase-clases.sql y supabase-asistencia.sql.
-- Supabase → SQL Editor → New query → pegar TODO → Run. Se puede correr
-- varias veces: no borra respuestas. No lleva la clave de admin.
-- OJO: si se vuelve a correr supabase-clases.sql, correr este otra vez.
-- ================================================================

-- 1) Tablas -----------------------------------------------------------
create table if not exists public.encuestas (
  grupo_id   uuid not null references public.grupos(id) on delete cascade,
  numero     smallint not null check (numero between 1 and 5),
  sesion_id  text references public.reto_sesiones(id) on delete set null,
  abierta    boolean not null default true,
  abierta_el timestamptz not null default now(),
  primary key (grupo_id, numero)
);
alter table public.encuestas enable row level security;
drop policy if exists "encuestas admin" on public.encuestas;
create policy "encuestas admin" on public.encuestas
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.encuestas to anon, authenticated;

create table if not exists public.encuesta_respuestas (
  grupo_id     uuid not null references public.grupos(id) on delete cascade,
  numero       smallint not null check (numero between 1 and 5),
  email        text not null,
  instructor   smallint not null check (instructor between 1 and 5),
  contenido    smallint not null check (contenido between 1 and 5),
  interesante  smallint not null check (interesante between 1 and 5),
  material     smallint not null check (material between 1 and 5),
  expectativas text not null check (expectativas in ('si', 'parcial', 'no')),
  comentario   text,
  creado_el    timestamptz not null default now(),
  primary key (grupo_id, numero, email)
);
alter table public.encuesta_respuestas enable row level security;
drop policy if exists "encuesta respuestas admin" on public.encuesta_respuestas;
create policy "encuesta respuestas admin" on public.encuesta_respuestas
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.encuesta_respuestas to anon, authenticated;

create table if not exists public.diagnosticos (
  grupo_id       uuid not null references public.grupos(id) on delete cascade,
  email          text not null,
  nombre         text not null default '',
  respuestas     jsonb not null default '[]',   -- [{id, pregunta, respuesta}]
  creado_el      timestamptz not null default now(),
  actualizado_el timestamptz not null default now(),
  primary key (grupo_id, email)
);
alter table public.diagnosticos enable row level security;
drop policy if exists "diagnosticos admin" on public.diagnosticos;
create policy "diagnosticos admin" on public.diagnosticos
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.diagnosticos to anon, authenticated;

-- Las preguntas se editan desde la app: las respuestas de la encuesta se
-- guardan con su pregunta (respuestas), igual que el diagnóstico. Las
-- columnas fijas de antes quedan, sin obligación.
alter table public.encuesta_respuestas add column if not exists respuestas jsonb;
alter table public.encuesta_respuestas alter column instructor   drop not null;
alter table public.encuesta_respuestas alter column contenido    drop not null;
alter table public.encuesta_respuestas alter column interesante  drop not null;
alter table public.encuesta_respuestas alter column material     drop not null;
alter table public.encuesta_respuestas alter column expectativas drop not null;

-- Las preguntas de cada formulario (las mismas para todas las empresas;
-- {empresa} se cambia por el nombre de cada una). Sin fila, la app usa las
-- de siempre. Las lee cualquiera; solo las admin las cambian.
create table if not exists public.formulario_preguntas (
  tipo           text primary key check (tipo in ('diagnostico', 'encuesta')),
  preguntas      jsonb not null,   -- [{id, t, tipo: texto|parrafo|una|varias|escala, ops?, opcional?, extremos?}]
  actualizado_el timestamptz not null default now(),
  por            text not null default coalesce(public.admin_email(), 'Claude')
);
alter table public.formulario_preguntas enable row level security;
drop policy if exists "preguntas lectura" on public.formulario_preguntas;
drop policy if exists "preguntas admin"   on public.formulario_preguntas;
create policy "preguntas lectura" on public.formulario_preguntas for select using (true);
create policy "preguntas admin" on public.formulario_preguntas
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.formulario_preguntas to anon, authenticated;

-- El registro de correos (supabase-asistencia.sql) guarda también qué encuesta
alter table public.envios add column if not exists numero smallint;
alter table public.envios add column if not exists solo_faltan boolean not null default false;

-- 2) Interruptores por grupo: Diagnóstico y Encuestas -------------------
-- (igual que en supabase-clases.sql, con los dos nuevos en la lista)
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
                                      where x in ('tareas', 'skills', 'resumen', 'config', 'tuto', 'faq', 'diagnostico', 'encuestas'))
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

-- Maper no lleva diagnóstico (una sola vez)
do $maper$
begin
  if not exists (select 1 from public.ajustes where clave = 'diagnostico_maper') then
    update public.grupos set extras_off = array_append(coalesce(extras_off, '{}'), 'diagnostico')
     where nombre ilike '%maper%' and not ('diagnostico' = any(coalesce(extras_off, '{}')));
    insert into public.ajustes (clave, valor) values ('diagnostico_maper', to_jsonb(now()::text));
  end if;
end
$maper$;

-- 3) Lo de la persona: qué le falta responder ---------------------------
-- [{grupo_id, diagnostico: {activo, respondido}, encuestas: [{numero, sesion_id, sesion, respondida}]}]
-- Solo grupos vigentes; las encuestas, solo las abiertas.
create or replace function public.mis_formularios()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'grupo_id', g.id,
    'diagnostico', jsonb_build_object(
      'activo', not ('diagnostico' = any(coalesce(g.extras_off, '{}'))),
      'respondido', exists (select 1 from public.diagnosticos d where d.grupo_id = g.id and d.email = public.mi_email())),
    'encuestas', case when 'encuestas' = any(coalesce(g.extras_off, '{}')) then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
               'numero', e.numero, 'sesion_id', e.sesion_id,
               'sesion', (select s.corto || ': ' || s.nombre from public.reto_sesiones s where s.id = e.sesion_id),
               'respondida', exists (select 1 from public.encuesta_respuestas r
                                      where r.grupo_id = g.id and r.numero = e.numero and r.email = public.mi_email()))
             order by e.numero), '[]'::jsonb)
        from public.encuestas e where e.grupo_id = g.id and e.abierta) end
  )), '[]'::jsonb)
  from public.grupos g
  where g.id::text = any(public.mis_etiquetas());
$$;
revoke all on function public.mis_formularios() from public;
grant execute on function public.mis_formularios() to anon, authenticated;

-- ¿Quien llama es persona activa de ese grupo vigente?
create or replace function public.soy_del_grupo(p_grupo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.mi_email() is not null and p_grupo::text = any(public.mis_etiquetas());
$$;
revoke all on function public.soy_del_grupo(uuid) from public;
grant execute on function public.soy_del_grupo(uuid) to anon, authenticated;

-- p_r: [{id, pregunta, respuesta}] (lo que la persona vio y respondió)
create or replace function public.encuesta_responder(p_grupo uuid, p_numero int, p_r jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo text := public.mi_email();
begin
  if not public.soy_del_grupo(p_grupo) then raise exception 'Tu sesión terminó o no estás en este grupo: vuelve a entrar.'; end if;
  if exists (select 1 from public.grupos g where g.id = p_grupo and 'encuestas' = any(coalesce(g.extras_off, '{}'))) then
    raise exception 'Las encuestas no están activas para tu grupo.';
  end if;
  if not exists (select 1 from public.encuestas e where e.grupo_id = p_grupo and e.numero = p_numero and e.abierta) then
    raise exception 'Esta encuesta ya está cerrada.';
  end if;
  if jsonb_typeof(p_r) <> 'array' or jsonb_array_length(p_r) = 0 then raise exception 'La encuesta llegó vacía.'; end if;
  if length(p_r::text) > 30000 then raise exception 'Las respuestas son demasiado largas.'; end if;
  insert into public.encuesta_respuestas (grupo_id, numero, email, respuestas)
  values (p_grupo, p_numero, yo, p_r)
  on conflict (grupo_id, numero, email) do update set respuestas = excluded.respuestas, creado_el = now();
end;
$$;
revoke all on function public.encuesta_responder(uuid, int, jsonb) from public;
grant execute on function public.encuesta_responder(uuid, int, jsonb) to anon, authenticated;

create or replace function public.diagnostico_responder(p_grupo uuid, p_respuestas jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo text := public.mi_email();
begin
  if not public.soy_del_grupo(p_grupo) then raise exception 'Tu sesión terminó o no estás en este grupo: vuelve a entrar.'; end if;
  if exists (select 1 from public.grupos g where g.id = p_grupo and 'diagnostico' = any(coalesce(g.extras_off, '{}'))) then
    raise exception 'El diagnóstico no está activo para tu grupo.';
  end if;
  if jsonb_typeof(p_respuestas) <> 'array' or jsonb_array_length(p_respuestas) = 0 then
    raise exception 'El diagnóstico llegó vacío.';
  end if;
  if length(p_respuestas::text) > 60000 then raise exception 'Las respuestas son demasiado largas.'; end if;
  insert into public.diagnosticos (grupo_id, email, nombre, respuestas)
  values (p_grupo, yo,
          coalesce(nullif(btrim((select x->>'respuesta' from jsonb_array_elements(p_respuestas) x where x->>'id' = 'nombre' limit 1)), ''),
                   (select m.nombre from public.miembros m where m.grupo_id = p_grupo and m.email = yo), ''),
          p_respuestas)
  on conflict (grupo_id, email) do update set
    nombre = excluded.nombre, respuestas = excluded.respuestas, actualizado_el = now();
end;
$$;
revoke all on function public.diagnostico_responder(uuid, jsonb) from public;
grant execute on function public.diagnostico_responder(uuid, jsonb) to anon, authenticated;

-- 4) Los correos (manuales, desde Gmail) ---------------------------------
-- p_tipo: 'diagnostico' o 'encuesta' (con p_numero). p_solo_faltan: solo a
-- quienes no han respondido (el recordatorio). Las personas van en copia
-- oculta (para que no vean los correos de los demás).
create or replace function public.formulario_correo(p_grupo uuid, p_tipo text, p_numero int default null,
                                                    p_solo_faltan boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g      public.grupos%rowtype;
  e      public.encuestas%rowtype;
  clase  text;
  cco    text[];
  asunto text;
  cuerpo text;
  url    constant text := 'https://academia.porcontar.com/';
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;
  select * into g from public.grupos where id = p_grupo;
  if not found then raise exception 'no existe el grupo'; end if;

  if p_tipo = 'diagnostico' then
    select array_agg(m.email order by m.email) into cco
      from public.miembros m
     where m.grupo_id = p_grupo and m.activo
       and (not p_solo_faltan or not exists (select 1 from public.diagnosticos d where d.grupo_id = p_grupo and d.email = m.email));
    if p_solo_faltan then
      asunto := 'Te falta tu diagnóstico de la Academia · ' || g.nombre;
      cuerpo := 'Hola:' || E'\n\n'
        || 'Todavía nos falta tu diagnóstico. Lo necesitamos para ajustar las clases a lo que de verdad haces en tu trabajo.' || E'\n\n'
        || 'Son unos 7 minutos. Entra a la Academia con tu correo y la contraseña de tu empresa: el diagnóstico te aparece apenas entras.' || E'\n'
        || url || '?f=diagnostico' || E'\n\n'
        || '¡Gracias!' || E'\n' || 'Equipo PorContar';
    else
      asunto := 'Antes de empezar: tu diagnóstico de la Academia · ' || g.nombre;
      cuerpo := 'Hola:' || E'\n\n'
        || 'Antes de arrancar el programa queremos conocerte: cómo es tu trabajo, qué herramientas usas y qué quieres lograr. '
        || 'Con eso ajustamos cada clase a lo que necesitas.' || E'\n\n'
        || 'Son unos 7 minutos. Entra a la Academia con tu correo y la contraseña de tu empresa: el diagnóstico te aparece apenas entras.' || E'\n'
        || url || '?f=diagnostico' || E'\n\n'
        || '¡Nos vemos en clase!' || E'\n' || 'Equipo PorContar';
    end if;
  elsif p_tipo = 'encuesta' then
    select * into e from public.encuestas where grupo_id = p_grupo and numero = p_numero;
    if not found then raise exception 'esa encuesta no está abierta'; end if;
    select s.corto || ': ' || s.nombre into clase from public.reto_sesiones s where s.id = e.sesion_id;
    select array_agg(m.email order by m.email) into cco
      from public.miembros m
     where m.grupo_id = p_grupo and m.activo
       and (not p_solo_faltan or not exists (select 1 from public.encuesta_respuestas r
                                              where r.grupo_id = p_grupo and r.numero = p_numero and r.email = m.email));
    asunto := case when p_solo_faltan then 'Te falta la encuesta ' else '¿Cómo te fue? Encuesta ' end
              || p_numero || ' de 5 · ' || g.nombre;
    cuerpo := 'Hola:' || E'\n\n'
      || case when p_solo_faltan then 'Todavía nos falta tu opinión sobre ' else 'Queremos saber cómo te fue en ' end
      || coalesce(clase, 'la clase') || '.' || E'\n\n'
      || 'Toma un minuto. Entra a la Academia con tu correo y la contraseña de tu empresa: la encuentras al inicio.' || E'\n'
      || url || '?f=encuesta' || E'\n\n'
      || 'Tus respuestas nos ayudan a mejorar cada clase. ¡Gracias!' || E'\n' || 'Equipo PorContar';
  else
    raise exception 'tipo de correo no válido';
  end if;

  return jsonb_build_object('cco', coalesce(to_jsonb(cco), '[]'::jsonb), 'asunto', asunto, 'cuerpo', cuerpo);
end;
$$;
revoke all on function public.formulario_correo(uuid, text, int, boolean) from public;
grant execute on function public.formulario_correo(uuid, text, int, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las cuatro tablas y las cinco funciones deben decir sí
select
  (select case when count(*) = 4 then 'sí' else 'no' end from information_schema.tables
    where table_schema = 'public' and table_name in ('encuestas', 'encuesta_respuestas', 'diagnosticos', 'formulario_preguntas')) as tablas,
  (select case when count(*) = 5 then 'sí' else 'no' end from pg_proc
    where proname in ('mis_formularios', 'soy_del_grupo', 'encuesta_responder', 'diagnostico_responder', 'formulario_correo')) as funciones;
