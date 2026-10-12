-- ================================================================
-- PorContar Academia · Cursos a tu ritmo.
--
-- Un curso es una lista de cápsulas (video + resumen + recursos),
-- agrupadas en secciones. Sirve igual para empresas (B2B) y cohortes
-- (B2C): cada curso lleva su «quién lo ve», como las publicaciones.
-- Cada persona marca las cápsulas que ya vio y puede comentar.
--
-- Va DESPUÉS de supabase-tareas.sql.
-- Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se puede correr varias veces: no borra contenido.
-- No lleva la clave de admin.
-- ================================================================

create table if not exists public.cursos (
  id          text primary key,
  orden       int  not null default 0,
  titulo      text not null,
  descripcion text not null default '',
  area        text not null default '',
  nivel       text not null default 'Básico' check (nivel in ('Básico', 'Intermedio', 'Avanzado')),
  instructor  text not null default '',
  portada_url text,
  visible     boolean not null default false,          -- nace apagado: se enciende cuando está listo
  audiencia   text[] not null default '{}',            -- vacío = todos; 'tipo:b2b', 'tipo:b2c' o ids de grupo
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.cursos_capsulas (
  id          text primary key,
  curso_id    text not null references public.cursos(id) on delete cascade,
  orden       int  not null default 0,
  seccion     text not null default '',                -- «Introducción», «Ejecución»… (opcional)
  titulo      text not null,
  resumen     text not null default '',
  video_url   text,                                    -- YouTube, Drive, Vimeo, Loom…
  duracion    text not null default '',                -- «04:28»
  recursos    jsonb not null default '[]'::jsonb,      -- [{nombre, url}]
  visible     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists cursos_capsulas_curso_idx on public.cursos_capsulas (curso_id, orden);

create table if not exists public.cursos_progreso (
  email       text not null,
  capsula_id  text not null references public.cursos_capsulas(id) on delete cascade,
  updated_at  timestamptz not null default now(),
  primary key (email, capsula_id)
);

create table if not exists public.cursos_comentarios (
  id           uuid primary key default gen_random_uuid(),
  capsula_id   text not null references public.cursos_capsulas(id) on delete cascade,
  autor_email  text not null,
  autor_nombre text not null,
  autor_grupo  text not null default '',
  es_admin     boolean not null default false,
  texto        text not null,
  created_at   timestamptz not null default now()
);
create index if not exists cursos_comentarios_capsula_idx on public.cursos_comentarios (capsula_id, created_at);

alter table public.cursos             enable row level security;
alter table public.cursos_capsulas    enable row level security;
alter table public.cursos_progreso    enable row level security;
alter table public.cursos_comentarios enable row level security;

drop policy if exists "cursos lectura"   on public.cursos;
drop policy if exists "cursos admin"     on public.cursos;
drop policy if exists "capsulas lectura" on public.cursos_capsulas;
drop policy if exists "capsulas admin"   on public.cursos_capsulas;
-- El estudiante ve los cursos encendidos que van dirigidos a alguno de sus grupos
create policy "cursos lectura" on public.cursos
  for select using ((select public.is_admin()) or (visible and public.puede_ver(audiencia)));
create policy "cursos admin" on public.cursos
  for all using (public.is_admin()) with check (public.is_admin());
create policy "capsulas lectura" on public.cursos_capsulas
  for select using ((select public.is_admin()) or (visible and exists (
    select 1 from public.cursos c where c.id = curso_id and c.visible and public.puede_ver(c.audiencia))));
create policy "capsulas admin" on public.cursos_capsulas
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.cursos, public.cursos_capsulas to anon, authenticated;
-- cursos_progreso y cursos_comentarios: sin policies, solo por las funciones de abajo.

-- ¿Quien mira puede ver esa cápsula? (admin, o estudiante con el curso a la vista)
create or replace function public.curso_ve_capsula(p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.cursos_capsulas k join public.cursos c on c.id = k.curso_id
     where k.id = p_id and k.visible and c.visible and public.puede_ver(c.audiencia));
$$;
revoke all on function public.curso_ve_capsula(text) from public, anon, authenticated;

-- Las cápsulas que la persona ya marcó como vistas
create or replace function public.mis_capsulas()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(p.capsula_id), '[]'::jsonb)
    from public.cursos_progreso p where p.email = public.mi_email();
$$;

create or replace function public.marcar_capsula(p_id text, p_vista boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo text := public.mi_email();
begin
  if correo is null or cardinality(public.mis_etiquetas()) = 0 then
    raise exception 'Tu sesión terminó. Vuelve a entrar.';
  end if;
  if not public.curso_ve_capsula(p_id) then
    raise exception 'Esa cápsula no está disponible.';
  end if;
  if coalesce(p_vista, true) then
    insert into public.cursos_progreso (email, capsula_id) values (correo, p_id) on conflict do nothing;
    insert into public.actividad (email, dia) values (correo, public.hoy()) on conflict do nothing;
  else
    delete from public.cursos_progreso where email = correo and capsula_id = p_id;
  end if;
end;
$$;

-- Quién comenta: el equipo, o una persona con acceso vigente. Nunca se entrega el correo.
create or replace function public.curso_yo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  correo text;
  r record;
begin
  if public.is_admin() then
    correo := public.admin_email();
    return jsonb_build_object('email', coalesce(correo, 'equipo@porcontar.com'),
      'nombre', coalesce((select nullif(btrim(a.nombre), '') from public.admins a where a.email = correo), 'PorContar'),
      'grupo', 'PorContar', 'admin', true);
  end if;
  correo := public.mi_email();
  if correo is null then return null; end if;
  select m.nombre, g.nombre as grupo into r
    from public.miembros m join public.grupos g on g.id = m.grupo_id
   where m.email = correo and m.activo and g.activo and (g.vence_el is null or g.vence_el >= public.hoy())
   order by (m.nombre <> '') desc, g.nombre limit 1;
  if not found then return null; end if;
  return jsonb_build_object('email', correo,
    'nombre', coalesce(nullif(btrim(r.nombre), ''), initcap(replace(split_part(correo, '@', 1), '.', ' '))),
    'grupo', r.grupo, 'admin', false);
end;
$$;
revoke all on function public.curso_yo() from public, anon, authenticated;

create or replace function public.capsula_comentarios(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  yo jsonb := public.curso_yo();
begin
  if yo is null or not public.curso_ve_capsula(p_id) then
    raise exception 'sin permiso';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'autor', c.autor_nombre, 'grupo', c.autor_grupo, 'es_admin', c.es_admin,
             'texto', c.texto, 'created_at', c.created_at, 'mio', c.autor_email = yo->>'email',
             'foto', (select a.foto_url from public.admins a where c.es_admin and a.email = c.autor_email))
             order by c.created_at desc), '[]'::jsonb)
      from public.cursos_comentarios c where c.capsula_id = p_id
  );
end;
$$;

create or replace function public.capsula_comentar(p_id text, p_texto text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo  jsonb := public.curso_yo();
  txt text := btrim(coalesce(p_texto, ''));
  nuevo uuid;
begin
  if yo is null or not public.curso_ve_capsula(p_id) then
    raise exception 'sin permiso';
  end if;
  if char_length(txt) < 1 then raise exception 'Escribe tu comentario.'; end if;
  if char_length(txt) > 2000 then raise exception 'El comentario es muy largo (máximo 2.000 caracteres).'; end if;
  if not (yo->>'admin')::boolean and
     (select count(*) from public.cursos_comentarios
       where autor_email = yo->>'email' and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'Vas muy rápido. Espera un momento antes de comentar otra vez.';
  end if;
  insert into public.cursos_comentarios (capsula_id, autor_email, autor_nombre, autor_grupo, es_admin, texto)
  values (p_id, yo->>'email', yo->>'nombre', yo->>'grupo', (yo->>'admin')::boolean, txt)
  returning id into nuevo;
  return nuevo;
end;
$$;

create or replace function public.capsula_borrar_comentario(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo jsonb := public.curso_yo();
begin
  if yo is null then raise exception 'sin permiso'; end if;
  delete from public.cursos_comentarios
   where id = p_id and ((yo->>'admin')::boolean or autor_email = yo->>'email');
  if not found then raise exception 'No puedes borrar ese comentario.'; end if;
end;
$$;

-- Avance de un grupo en los cursos (para el admin y el responsable): por persona, cuántas cápsulas vio de cada curso
create or replace function public.cursos_avance_grupo(p_grupo uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or exists (
      select 1 from public.miembros m where m.grupo_id = p_grupo and m.email = public.mi_email() and m.activo and m.rol = 'responsable')) then
    raise exception 'sin permiso';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('email', x.email, 'curso_id', x.curso_id, 'vistas', x.vistas)), '[]'::jsonb)
      from (
        select m.email, k.curso_id, count(*)::int as vistas
          from public.miembros m
          join public.cursos_progreso p on p.email = m.email
          join public.cursos_capsulas k on k.id = p.capsula_id
         where m.grupo_id = p_grupo
         group by m.email, k.curso_id
      ) x
  );
end;
$$;

grant execute on function
  public.mis_capsulas(), public.marcar_capsula(text, boolean), public.capsula_comentarios(text),
  public.capsula_comentar(text, text), public.capsula_borrar_comentario(uuid), public.cursos_avance_grupo(uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: debe decir "cursos" y "cursos_capsulas"
select to_regclass('public.cursos') as tabla_cursos, to_regclass('public.cursos_capsulas') as tabla_capsulas;
