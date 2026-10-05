-- ================================================================
-- PorContar Academia · Empresas, cohortes y acceso con correo
--
-- Va DESPUÉS de supabase-academia.sql, en el mismo proyecto.
-- Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se puede correr varias veces: no borra contenido.
--
-- Este archivo NO lleva la clave de admin (sigue en app_config y la
-- valida is_admin()), así que sí puede ir al repositorio.
--
-- Cómo funciona:
--   · grupos     → cada empresa (b2b) o cohorte (b2c), con su contraseña
--                  y su fecha de vencimiento.
--   · miembros   → los correos que el admin da de alta en cada grupo.
--                  rol 'responsable' = ve el panel de su equipo.
--   · sesiones   → al entrar con correo + contraseña la base entrega un
--                  token; el navegador lo manda en la cabecera x-sesion.
--   · audiencia  → posts, skills y quizzes tienen una lista de a quién
--                  va dirigido: vacía = todos; 'tipo:b2b' / 'tipo:b2c' =
--                  todas las empresas / cohortes; o el id de cada grupo.
--
-- Nadie lee estas tablas directo: todo pasa por funciones que validan
-- la sesión (mi_email) o la clave de admin (is_admin).
-- ================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1) Tablas --------------------------------------------------------
create table if not exists public.grupos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (char_length(btrim(nombre)) between 2 and 120),
  tipo        text not null default 'b2b' check (tipo in ('b2b', 'b2c')),
  clave_hash  text not null,
  vence_el    date,                      -- último día con acceso; vacío = no vence
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.miembros (
  id             bigserial primary key,
  grupo_id       uuid not null references public.grupos(id) on delete cascade,
  email          text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nombre         text not null default '',
  rol            text not null default 'estudiante' check (rol in ('estudiante', 'responsable')),
  activo         boolean not null default true,
  ultimo_acceso  timestamptz,
  created_at     timestamptz not null default now(),
  unique (grupo_id, email)
);
create index if not exists miembros_email_idx on public.miembros (email);

create table if not exists public.sesiones (
  token_hash  text primary key,          -- sha256 del token: el token en sí nunca se guarda
  email       text not null,
  created_at  timestamptz not null default now(),
  vence       timestamptz not null default now() + interval '30 days'
);
create index if not exists sesiones_email_idx on public.sesiones (email);

create table if not exists public.intentos_acceso (
  id          bigserial primary key,
  email       text not null,
  ok          boolean not null,
  created_at  timestamptz not null default now()
);
create index if not exists intentos_email_idx on public.intentos_acceso (email, created_at desc);

-- Avance del trabajo autónomo, ahora por correo (la tabla vieja por nombre queda intacta)
create table if not exists public.avance_tareas (
  email       text primary key,
  estado      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Qué videos marcó cada persona como vistos
create table if not exists public.vistos (
  email       text not null,
  post_id     text not null references public.posts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (email, post_id)
);
create index if not exists vistos_post_idx on public.vistos (post_id);

-- Para limitar cuántas preguntas deja cada persona por hora
create table if not exists public.preguntas_log (
  id          bigserial primary key,
  email       text not null,
  created_at  timestamptz not null default now()
);
create index if not exists preguntas_log_idx on public.preguntas_log (email, created_at desc);

alter table public.posts           add column if not exists audiencia text[] not null default '{}';
alter table public.skills          add column if not exists audiencia text[] not null default '{}';
alter table public.quizzes         add column if not exists audiencia text[] not null default '{}';
alter table public.quiz_resultados add column if not exists email text;

alter table public.grupos          enable row level security;
alter table public.miembros        enable row level security;
alter table public.sesiones        enable row level security;
alter table public.intentos_acceso enable row level security;
alter table public.avance_tareas   enable row level security;
alter table public.vistos          enable row level security;
alter table public.preguntas_log   enable row level security;
-- Sin policies a propósito: solo se tocan a través de las funciones de abajo.

-- 2) ¿Quién está mirando? -----------------------------------------
-- "Hoy" en Colombia: un grupo que vence el 30 tiene acceso todo el 30.
create or replace function public.hoy()
returns date language sql stable set search_path = public as $$
  select (now() at time zone 'America/Bogota')::date;
$$;

-- El correo de la sesión que viene en la cabecera x-sesion (o null)
create or replace function public.mi_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.email
    from public.sesiones s
   where s.token_hash = encode(extensions.digest(
           coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-sesion', ''),
           'sha256'), 'hex')
     and s.vence > now();
$$;

-- Lo que identifica a quien mira para comparar con la audiencia:
-- el id de cada grupo vigente al que pertenece y 'tipo:b2b' / 'tipo:b2c'.
-- Vacío = no tiene sesión o ninguno de sus grupos está vigente.
create or replace function public.mis_etiquetas()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with mios as (
    select g.id, g.tipo
      from public.miembros m
      join public.grupos g on g.id = m.grupo_id
     where m.email = public.mi_email()
       and m.activo and g.activo
       and (g.vence_el is null or g.vence_el >= public.hoy())
  )
  select coalesce(array_agg(distinct x), '{}')
    from (select id::text as x from mios union select 'tipo:' || tipo from mios) t;
$$;

-- ¿Una audiencia incluye a quien mira? El admin ve todo.
create or replace function public.puede_ver(p_audiencia text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or (
    cardinality(e) > 0
    and (coalesce(cardinality(p_audiencia), 0) = 0 or p_audiencia && e)
  )
  from (select public.mis_etiquetas() as e) t;
$$;

-- 3) Entrar y salir -----------------------------------------------
-- No usa "raise exception" para los errores de acceso: eso desharía el
-- registro del intento fallido, y sin él no hay límite de intentos.
create or replace function public.entrar(p_email text, p_clave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo   text := lower(btrim(coalesce(p_email, '')));
  fallos   int;
  vigentes int;
  vencio   date;
  token    text;
begin
  if correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or coalesce(p_clave, '') = '' then
    return jsonb_build_object('error', 'Escribe tu correo y la contraseña.');
  end if;

  select count(*) into fallos
    from public.intentos_acceso
   where email = correo and not ok and created_at > now() - interval '15 minutes';
  if fallos >= 8 then
    return jsonb_build_object('error', 'Demasiados intentos seguidos. Espera 15 minutos y vuelve a intentarlo.');
  end if;

  -- Grupos activos del correo cuya contraseña coincide
  select count(*) filter (where g.vence_el is null or g.vence_el >= public.hoy()),
         max(g.vence_el)
    into vigentes, vencio
    from public.miembros m
    join public.grupos g on g.id = m.grupo_id
   where m.email = correo and m.activo and g.activo
     and g.clave_hash = extensions.crypt(p_clave, g.clave_hash);

  if vencio is null and vigentes = 0 then
    insert into public.intentos_acceso (email, ok) values (correo, false);
    return jsonb_build_object('error', 'El correo o la contraseña no coinciden. Revisa que sea el correo con el que te inscribieron.');
  end if;

  if vigentes = 0 then
    insert into public.intentos_acceso (email, ok) values (correo, true);
    return jsonb_build_object('error',
      'El acceso de tu grupo terminó el ' || to_char(vencio, 'DD/MM/YYYY') || '. Escríbenos si necesitas más tiempo.');
  end if;

  token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.sesiones (token_hash, email)
  values (encode(extensions.digest(token, 'sha256'), 'hex'), correo);
  insert into public.intentos_acceso (email, ok) values (correo, true);
  update public.miembros set ultimo_acceso = now() where email = correo;

  -- Limpieza de paso: sesiones vencidas e intentos viejos
  delete from public.sesiones where vence < now();
  delete from public.intentos_acceso where created_at < now() - interval '2 days';

  return jsonb_build_object('token', token);
end;
$$;

-- Quién soy y a qué grupos pertenezco. Deja registrado el último acceso.
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
           'id', g.id, 'nombre', g.nombre, 'tipo', g.tipo, 'rol', m.rol, 'vence_el', g.vence_el)
           order by g.nombre), '[]'::jsonb)
    into grupos
    from public.miembros m
    join public.grupos g on g.id = m.grupo_id
   where m.email = correo and m.activo and g.activo
     and (g.vence_el is null or g.vence_el >= public.hoy());

  if jsonb_array_length(grupos) > 0 then
    update public.miembros set ultimo_acceso = now()
     where email = correo and (ultimo_acceso is null or ultimo_acceso < now() - interval '5 minutes');
  end if;

  return jsonb_build_object(
    'email',  correo,
    'nombre', (select nombre from public.miembros where email = correo and nombre <> '' order by id limit 1),
    'grupos', grupos);
end;
$$;

create or replace function public.salir()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from public.sesiones
   where token_hash = encode(extensions.digest(
           coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-sesion', ''),
           'sha256'), 'hex');
$$;

-- 4) Lo que ve cada quien: publicaciones, skills y quizzes ---------
-- (select ...) hace que cada función se evalúe una vez por consulta y no por fila
drop policy if exists "lectura publica"    on public.posts;
drop policy if exists "lectura por grupo"  on public.posts;
create policy "lectura por grupo" on public.posts
  for select using (
    (select public.is_admin())
    or ((select cardinality(public.mis_etiquetas())) > 0
        and (cardinality(audiencia) = 0 or audiencia && (select public.mis_etiquetas())))
  );

drop policy if exists "skills lectura publica"   on public.skills;
drop policy if exists "skills lectura por grupo" on public.skills;
create policy "skills lectura por grupo" on public.skills
  for select using (
    (select public.is_admin())
    or (visible
        and (select cardinality(public.mis_etiquetas())) > 0
        and (cardinality(audiencia) = 0 or audiencia && (select public.mis_etiquetas())))
  );

-- Reacciones: solo sobre lo que la persona puede ver
create or replace function public.bump_reaction(p_id text, p_key text, p_delta int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actual    int;
  nuevo     int;
  aud       text[];
  resultado jsonb;
begin
  if p_key not in ('like','clap','idea','fire') then
    raise exception 'reacción no válida';
  end if;
  if p_delta not in (-1, 1) then
    raise exception 'delta no válido';
  end if;

  select coalesce((reactions ->> p_key)::int, 0), audiencia into actual, aud
    from public.posts where id = p_id;
  if not found or not public.puede_ver(aud) then
    raise exception 'publicación no encontrada';
  end if;

  nuevo := greatest(0, actual + p_delta);
  update public.posts
     set reactions = jsonb_set(reactions, array[p_key], to_jsonb(nuevo), true)
   where id = p_id
   returning reactions into resultado;
  return resultado;
end;
$$;

-- Preguntas: solo con sesión. La pregunta queda visible para los grupos de
-- quien pregunta (no se cruza entre empresas); el admin puede abrirla a todos.
create or replace function public.preguntar(p_texto text)
returns public.posts
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo text := public.mi_email();
  mios   text[];
  limpio text := btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g'));
  fila   public.posts;
begin
  select coalesce(array_agg(x), '{}') into mios
    from unnest(public.mis_etiquetas()) x where x not like 'tipo:%';
  if correo is null or cardinality(mios) = 0 then
    raise exception 'Tu sesión terminó. Vuelve a entrar.';
  end if;
  if char_length(limpio) < 8 or char_length(limpio) > 280 then
    raise exception 'La pregunta debe tener entre 8 y 280 caracteres.';
  end if;

  -- Si ya existe una igual que esta persona puede ver, se devuelve esa
  select * into fila from public.posts
   where session = 'faq' and lower(title) = lower(limpio)
     and (cardinality(audiencia) = 0 or audiencia && public.mis_etiquetas())
   limit 1;
  if found then
    return fila;
  end if;

  if (select count(*) from public.preguntas_log
       where email = correo and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Ya dejaste varias preguntas en la última hora. Inténtalo más tarde.';
  end if;

  insert into public.preguntas_log (email) values (correo);
  insert into public.posts (id, session, title, body, author, initials, audiencia)
  values ('q' || substr(md5(random()::text || clock_timestamp()::text), 1, 12),
          'faq', limpio, '', 'Estudiante', 'ES', mios)
  returning * into fila;
  return fila;
end;
$$;

-- Quizzes: la lista y el quiz solo si van dirigidos a quien mira
create or replace function public.quizzes_publicos()
returns table (id text, titulo text, descripcion text, preguntas int)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.titulo, q.descripcion, jsonb_array_length(q.preguntas)
    from public.quizzes q
   where q.activo
     and jsonb_array_length(q.preguntas) > 0
     and public.puede_ver(q.audiencia)
     and (public.is_admin() or public.mi_email() is not null)
   order by q.orden, q.id;
$$;

create or replace function public.quiz_publico(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  fila public.quizzes;
begin
  select * into fila from public.quizzes where id = p_id;
  if not found or not fila.activo or jsonb_array_length(fila.preguntas) = 0
     or not public.puede_ver(fila.audiencia) then
    raise exception 'Ese quiz no está disponible';
  end if;

  return jsonb_build_object(
    'id', fila.id,
    'titulo', fila.titulo,
    'descripcion', fila.descripcion,
    'preguntas', (
      select coalesce(jsonb_agg(jsonb_build_object('text', p->>'text', 'options', p->'options')
                                order by n), '[]'::jsonb)
        from jsonb_array_elements(fila.preguntas) with ordinality as t(p, n)
    )
  );
end;
$$;

-- Responder: ya no se escribe el nombre; el intento queda a nombre del correo
drop function if exists public.responder_quiz(text, text, jsonb);
create or replace function public.responder_quiz(p_id text, p_respuestas jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo    text := public.mi_email();
  quien     text;
  fila      public.quizzes;
  total     int;
  aciertos  jsonb;
  puntaje   int;
begin
  if correo is null or cardinality(public.mis_etiquetas()) = 0 then
    raise exception 'Tu sesión terminó. Vuelve a entrar.';
  end if;
  if jsonb_typeof(coalesce(p_respuestas, 'null'::jsonb)) <> 'array' then
    raise exception 'Respuestas no válidas';
  end if;

  select * into fila from public.quizzes where id = p_id;
  if not found or not fila.activo or jsonb_array_length(fila.preguntas) = 0
     or not public.puede_ver(fila.audiencia) then
    raise exception 'Ese quiz no está disponible';
  end if;

  total := jsonb_array_length(fila.preguntas);
  if jsonb_array_length(p_respuestas) <> total then
    raise exception 'Respondiste % de % preguntas.', jsonb_array_length(p_respuestas), total;
  end if;

  select coalesce(jsonb_agg(case when (p->>'correctIndex')::int
                                  = nullif(p_respuestas -> (n::int - 1), 'null'::jsonb)::text::int
                            then 1 else 0 end order by n), '[]'::jsonb)
    into aciertos
    from jsonb_array_elements(fila.preguntas) with ordinality as t(p, n);

  select coalesce(sum(v::text::int), 0) into puntaje from jsonb_array_elements(aciertos) as v;

  select coalesce(nullif(nombre, ''), correo) into quien
    from public.miembros where email = correo order by (nombre = ''), id limit 1;

  insert into public.quiz_resultados (quiz_id, persona, nombre, email, puntaje, total, respuestas, aciertos)
  values (fila.id, correo, coalesce(quien, correo), correo, puntaje, total, p_respuestas, aciertos);

  return jsonb_build_object(
    'puntaje', puntaje,
    'total', total,
    'aciertos', aciertos,
    'correctas', (select coalesce(jsonb_agg((p->>'correctIndex')::int order by n), '[]'::jsonb)
                    from jsonb_array_elements(fila.preguntas) with ordinality as t(p, n))
  );
end;
$$;

-- 5) Trabajo autónomo y videos vistos, por correo -----------------
drop function if exists public.tareas_cargar(text);
drop function if exists public.tareas_guardar(text, jsonb);
drop function if exists public.tareas_todos();
drop function if exists public.tareas_borrar(text);

create or replace function public.tareas_cargar()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  correo text := public.mi_email();
begin
  if correo is null then
    raise exception 'Tu sesión terminó. Vuelve a entrar.';
  end if;
  return coalesce((select estado from public.avance_tareas where email = correo), '{}'::jsonb);
end;
$$;

create or replace function public.tareas_guardar(p_estado jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  correo text := public.mi_email();
begin
  if correo is null or cardinality(public.mis_etiquetas()) = 0 then
    raise exception 'Tu sesión terminó. Vuelve a entrar.';
  end if;
  if jsonb_typeof(p_estado) <> 'object' or length(p_estado::text) > 20000 then
    raise exception 'Avance no válido';
  end if;
  insert into public.avance_tareas (email, estado) values (correo, p_estado)
  on conflict (email) do update set estado = excluded.estado, updated_at = now();
end;
$$;

create or replace function public.mis_vistos()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(post_id), '{}') from public.vistos where email = public.mi_email();
$$;

create or replace function public.marcar_visto(p_post text, p_visto boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  correo text := public.mi_email();
  aud    text[];
begin
  if correo is null or cardinality(public.mis_etiquetas()) = 0 then
    raise exception 'Tu sesión terminó. Vuelve a entrar.';
  end if;
  select audiencia into aud from public.posts where id = p_post;
  if not found or not public.puede_ver(aud) then
    raise exception 'publicación no encontrada';
  end if;
  if p_visto then
    insert into public.vistos (email, post_id) values (correo, p_post) on conflict do nothing;
  else
    delete from public.vistos where email = correo and post_id = p_post;
  end if;
end;
$$;

-- 6) Panel del equipo (responsable de la empresa y admin) ---------
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
                                'vence_el', g.vence_el, 'activo', g.activo),
    'miembros', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'email', m.email, 'nombre', m.nombre, 'rol', m.rol, 'activo', m.activo,
               'ultimo_acceso', m.ultimo_acceso,
               'tareas', coalesce(a.estado, '{}'::jsonb), 'tareas_at', a.updated_at,
               'vistos', coalesce((select jsonb_agg(v.post_id) from public.vistos v where v.email = m.email), '[]'::jsonb),
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

-- 7) Administración de grupos y miembros (solo admin) -------------
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
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', g.id, 'nombre', g.nombre, 'tipo', g.tipo, 'vence_el', g.vence_el,
             'activo', g.activo, 'created_at', g.created_at,
             'vigente', g.activo and (g.vence_el is null or g.vence_el >= public.hoy()),
             'miembros', (select count(*) from public.miembros m where m.grupo_id = g.id and m.activo),
             'responsables', (select count(*) from public.miembros m where m.grupo_id = g.id and m.activo and m.rol = 'responsable'),
             'han_entrado', (select count(*) from public.miembros m where m.grupo_id = g.id and m.ultimo_acceso is not null)
           ) order by g.tipo, lower(g.nombre)), '[]'::jsonb)
      from public.grupos g
  );
end;
$$;

-- Crea (p_id vacío) o edita un grupo. p_clave vacía al editar = se deja la que tenía.
create or replace function public.admin_guardar_grupo(
  p_id uuid, p_nombre text, p_tipo text, p_clave text, p_vence date, p_activo boolean)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  nuevo_id uuid;
  clave    text := coalesce(p_clave, '');
begin
  if not public.is_admin() then
    raise exception 'sin permiso';
  end if;
  if char_length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'Ponle un nombre al grupo.';
  end if;
  if p_tipo not in ('b2b', 'b2c') then
    raise exception 'Tipo de grupo no válido';
  end if;
  if clave <> '' and char_length(clave) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres.';
  end if;

  if p_id is null then
    if clave = '' then
      raise exception 'Ponle una contraseña al grupo.';
    end if;
    insert into public.grupos (nombre, tipo, clave_hash, vence_el, activo)
    values (btrim(p_nombre), p_tipo, extensions.crypt(clave, extensions.gen_salt('bf', 10)),
            p_vence, coalesce(p_activo, true))
    returning id into nuevo_id;
    return nuevo_id;
  end if;

  update public.grupos
     set nombre = btrim(p_nombre), tipo = p_tipo, vence_el = p_vence,
         activo = coalesce(p_activo, activo),
         clave_hash = case when clave = '' then clave_hash
                           else extensions.crypt(clave, extensions.gen_salt('bf', 10)) end,
         updated_at = now()
   where id = p_id;
  if not found then
    raise exception 'Ese grupo no existe';
  end if;
  return p_id;
end;
$$;

create or replace function public.admin_borrar_grupo(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'sin permiso';
  end if;
  delete from public.grupos where id = p_id;   -- los miembros se van con él (on delete cascade)
  -- El grupo deja de aparecer en la audiencia de lo publicado
  update public.posts   set audiencia = array_remove(audiencia, p_id::text) where p_id::text = any (audiencia);
  update public.skills  set audiencia = array_remove(audiencia, p_id::text) where p_id::text = any (audiencia);
  update public.quizzes set audiencia = array_remove(audiencia, p_id::text) where p_id::text = any (audiencia);
end;
$$;

create or replace function public.admin_miembros(p_grupo uuid)
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
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id, 'email', m.email, 'nombre', m.nombre, 'rol', m.rol,
             'activo', m.activo, 'ultimo_acceso', m.ultimo_acceso, 'created_at', m.created_at)
           order by m.rol desc, lower(coalesce(nullif(m.nombre, ''), m.email))), '[]'::jsonb)
      from public.miembros m where m.grupo_id = p_grupo
  );
end;
$$;

-- Alta en lote: [{email, nombre?, rol?}]. Si el correo ya estaba, se reactiva
-- y se actualiza el nombre (y el rol, si viene). Devuelve qué pasó con cada uno.
create or replace function public.admin_agregar_miembros(p_grupo uuid, p_filas jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  f          jsonb;
  correo     text;
  nom        text;
  r          text;
  nuevos     int := 0;
  existentes int := 0;
  malos      jsonb := '[]'::jsonb;
  fue_nuevo  boolean;
begin
  if not public.is_admin() then
    raise exception 'sin permiso';
  end if;
  if not exists (select 1 from public.grupos where id = p_grupo) then
    raise exception 'Ese grupo no existe';
  end if;
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) > 5000 then
    raise exception 'Lista no válida (máximo 5000 correos por carga)';
  end if;

  for f in select * from jsonb_array_elements(p_filas) loop
    correo := lower(btrim(coalesce(f->>'email', '')));
    nom    := left(btrim(regexp_replace(coalesce(f->>'nombre', ''), '\s+', ' ', 'g')), 120);
    r      := nullif(f->>'rol', '');
    if correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or (r is not null and r not in ('estudiante', 'responsable')) then
      malos := malos || to_jsonb(coalesce(f->>'email', ''));
      continue;
    end if;

    insert into public.miembros (grupo_id, email, nombre, rol)
    values (p_grupo, correo, nom, coalesce(r, 'estudiante'))
    on conflict (grupo_id, email) do update
      set nombre = case when excluded.nombre <> '' then excluded.nombre else public.miembros.nombre end,
          rol    = case when r is not null then excluded.rol else public.miembros.rol end,
          activo = true
    returning (xmax = 0) into fue_nuevo;

    if fue_nuevo then nuevos := nuevos + 1; else existentes := existentes + 1; end if;
  end loop;

  return jsonb_build_object('nuevos', nuevos, 'actualizados', existentes, 'invalidos', malos);
end;
$$;

create or replace function public.admin_actualizar_miembro(p_id bigint, p_nombre text, p_rol text, p_activo boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'sin permiso';
  end if;
  if p_rol not in ('estudiante', 'responsable') then
    raise exception 'Rol no válido';
  end if;
  update public.miembros
     set nombre = left(btrim(coalesce(p_nombre, '')), 120), rol = p_rol, activo = p_activo
   where id = p_id;
end;
$$;

create or replace function public.admin_quitar_miembro(p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'sin permiso';
  end if;
  delete from public.miembros where id = p_id;
end;
$$;

-- 8) Permisos de ejecución ----------------------------------------
grant execute on function public.hoy()                         to anon, authenticated;
grant execute on function public.mi_email()                    to anon, authenticated;
grant execute on function public.mis_etiquetas()               to anon, authenticated;
grant execute on function public.puede_ver(text[])             to anon, authenticated;
grant execute on function public.entrar(text, text)            to anon, authenticated;
grant execute on function public.mi_perfil()                   to anon, authenticated;
grant execute on function public.salir()                       to anon, authenticated;
grant execute on function public.bump_reaction(text, text, int) to anon, authenticated;
grant execute on function public.preguntar(text)               to anon, authenticated;
grant execute on function public.quizzes_publicos()            to anon, authenticated;
grant execute on function public.quiz_publico(text)            to anon, authenticated;
grant execute on function public.responder_quiz(text, jsonb)   to anon, authenticated;
grant execute on function public.tareas_cargar()               to anon, authenticated;
grant execute on function public.tareas_guardar(jsonb)         to anon, authenticated;
grant execute on function public.mis_vistos()                  to anon, authenticated;
grant execute on function public.marcar_visto(text, boolean)   to anon, authenticated;
grant execute on function public.panel_grupo(uuid)             to anon, authenticated;
grant execute on function public.admin_grupos()                to anon, authenticated;
grant execute on function public.admin_guardar_grupo(uuid, text, text, text, date, boolean) to anon, authenticated;
grant execute on function public.admin_borrar_grupo(uuid)      to anon, authenticated;
grant execute on function public.admin_miembros(uuid)          to anon, authenticated;
grant execute on function public.admin_agregar_miembros(uuid, jsonb) to anon, authenticated;
grant execute on function public.admin_actualizar_miembro(bigint, text, text, boolean) to anon, authenticated;
grant execute on function public.admin_quitar_miembro(bigint)  to anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: todo debe salir con valor (ninguno en null)
select
  to_regclass('public.grupos')            as tabla_grupos,
  to_regclass('public.miembros')          as tabla_miembros,
  to_regclass('public.sesiones')          as tabla_sesiones,
  to_regclass('public.avance_tareas')     as tabla_avance,
  to_regclass('public.vistos')            as tabla_vistos,
  to_regproc('public.entrar')             as funcion_entrar,
  to_regproc('public.panel_grupo')        as funcion_panel,
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'audiencia') as columna_audiencia;
