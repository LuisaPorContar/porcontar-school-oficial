-- ================================================================
-- PorContar Academia · Comunidad: un muro compartido por TODA la academia.
--
-- Cualquier persona con acceso vigente (de cualquier empresa o cohorte)
-- y el equipo de PorContar publican, dan «Me gusta» y comentan.
-- Cada quien borra lo suyo; el admin borra cualquier cosa y fija avisos.
-- Nunca se entregan correos: solo el nombre y el grupo de quien escribe.
--
-- Va DESPUÉS de supabase-formatos.sql.
-- Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se puede correr varias veces: no borra contenido.
-- No lleva la clave de admin.
-- ================================================================

create table if not exists public.comunidad_posts (
  id           uuid primary key default gen_random_uuid(),
  autor_email  text not null,
  autor_nombre text not null,
  autor_grupo  text not null default '',       -- nombre de su empresa o cohorte al publicar
  es_admin     boolean not null default false,
  titulo       text not null default '',
  texto        text not null,
  fijado       boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists comunidad_posts_orden_idx on public.comunidad_posts (fijado desc, created_at desc);

create table if not exists public.comunidad_likes (
  post_id uuid not null references public.comunidad_posts(id) on delete cascade,
  email   text not null,
  primary key (post_id, email)
);

create table if not exists public.comunidad_comentarios (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.comunidad_posts(id) on delete cascade,
  autor_email  text not null,
  autor_nombre text not null,
  autor_grupo  text not null default '',
  es_admin     boolean not null default false,
  texto        text not null,
  created_at   timestamptz not null default now()
);
create index if not exists comunidad_comentarios_post_idx on public.comunidad_comentarios (post_id, created_at);

alter table public.comunidad_posts       enable row level security;
alter table public.comunidad_likes       enable row level security;
alter table public.comunidad_comentarios enable row level security;
-- Sin policies: solo se tocan con las funciones de abajo.

-- Quién escribe: { email, nombre, grupo, admin } o null si no tiene acceso vigente.
-- El admin con la llave de emergencia (sin cuenta) firma como «PorContar».
create or replace function public.comunidad_yo()
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
    return jsonb_build_object(
      'email', coalesce(correo, 'equipo@porcontar.com'),
      'nombre', coalesce((select nullif(btrim(a.nombre), '') from public.admins a where a.email = correo), 'PorContar'),
      'grupo', 'PorContar', 'admin', true);
  end if;

  correo := public.mi_email();
  if correo is null then
    return null;
  end if;
  -- Solo con un grupo vigente que no tenga la comunidad apagada
  select m.nombre, g.nombre as grupo into r
    from public.miembros m
    join public.grupos g on g.id = m.grupo_id
   where m.email = correo and m.activo and g.activo
     and (g.vence_el is null or g.vence_el >= public.hoy())
     and not ('comunidad' = any(g.extras_off))
   order by (m.nombre <> '') desc, g.nombre
   limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'email', correo,
    'nombre', coalesce(nullif(btrim(r.nombre), ''), initcap(replace(split_part(correo, '@', 1), '.', ' '))),
    'grupo', r.grupo, 'admin', false);
end;
$$;
revoke all on function public.comunidad_yo() from public, anon, authenticated;

-- El muro: lo fijado primero y después lo más reciente
create or replace function public.comunidad_feed()
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
    select coalesce(jsonb_agg(x order by x.fijado desc, x.created_at desc), '[]'::jsonb)
      from (
        select p.id, p.autor_nombre as autor, p.autor_grupo as grupo, p.es_admin, p.titulo, p.texto,
               p.fijado, p.created_at,
               (select count(*) from public.comunidad_likes l where l.post_id = p.id) as likes,
               exists (select 1 from public.comunidad_likes l where l.post_id = p.id and l.email = yo->>'email') as me_gusta,
               (select count(*) from public.comunidad_comentarios c where c.post_id = p.id) as comentarios,
               (p.autor_email = yo->>'email') as mio
          from public.comunidad_posts p
         order by p.fijado desc, p.created_at desc
         limit 200
      ) x
  );
end;
$$;

create or replace function public.comunidad_publicar(p_titulo text, p_texto text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo  jsonb := public.comunidad_yo();
  tit text := left(btrim(coalesce(p_titulo, '')), 140);
  txt text := btrim(coalesce(p_texto, ''));
  nuevo uuid;
begin
  if yo is null then
    raise exception 'sin permiso';
  end if;
  if char_length(txt) < 2 then
    raise exception 'Escribe algo para publicar.';
  end if;
  if char_length(txt) > 5000 then
    raise exception 'La publicación es muy larga (máximo 5.000 caracteres).';
  end if;
  if not (yo->>'admin')::boolean and
     (select count(*) from public.comunidad_posts
       where autor_email = yo->>'email' and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Ya publicaste varias veces en la última hora. Espera un rato.';
  end if;
  insert into public.comunidad_posts (autor_email, autor_nombre, autor_grupo, es_admin, titulo, texto)
  values (yo->>'email', yo->>'nombre', yo->>'grupo', (yo->>'admin')::boolean, tit, txt)
  returning id into nuevo;
  return nuevo;
end;
$$;

-- Cada quien borra lo suyo; el admin, cualquiera
create or replace function public.comunidad_borrar(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo jsonb := public.comunidad_yo();
begin
  if yo is null then
    raise exception 'sin permiso';
  end if;
  delete from public.comunidad_posts
   where id = p_id and ((yo->>'admin')::boolean or autor_email = yo->>'email');
  if not found then
    raise exception 'No puedes borrar esa publicación.';
  end if;
end;
$$;

create or replace function public.comunidad_fijar(p_id uuid, p_fijado boolean)
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
  update public.comunidad_posts set fijado = coalesce(p_fijado, false) where id = p_id;
end;
$$;

-- Da o quita el «Me gusta» y devuelve cómo quedó
create or replace function public.comunidad_gustar(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo jsonb := public.comunidad_yo();
  ya boolean;
begin
  if yo is null then
    raise exception 'sin permiso';
  end if;
  if not exists (select 1 from public.comunidad_posts where id = p_id) then
    raise exception 'Esa publicación ya no existe.';
  end if;
  delete from public.comunidad_likes where post_id = p_id and email = yo->>'email';
  ya := found;
  if not ya then
    insert into public.comunidad_likes (post_id, email) values (p_id, yo->>'email') on conflict do nothing;
  end if;
  return jsonb_build_object(
    'me_gusta', not ya,
    'likes', (select count(*) from public.comunidad_likes where post_id = p_id));
end;
$$;

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
             'id', c.id, 'autor', c.autor_nombre, 'grupo', c.autor_grupo, 'es_admin', c.es_admin,
             'texto', c.texto, 'created_at', c.created_at, 'mio', c.autor_email = yo->>'email')
             order by c.created_at), '[]'::jsonb)
      from public.comunidad_comentarios c
     where c.post_id = p_id
  );
end;
$$;

create or replace function public.comunidad_comentar(p_id uuid, p_texto text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo  jsonb := public.comunidad_yo();
  txt text := btrim(coalesce(p_texto, ''));
  nuevo uuid;
begin
  if yo is null then
    raise exception 'sin permiso';
  end if;
  if char_length(txt) < 1 then
    raise exception 'Escribe tu comentario.';
  end if;
  if char_length(txt) > 2000 then
    raise exception 'El comentario es muy largo (máximo 2.000 caracteres).';
  end if;
  if not exists (select 1 from public.comunidad_posts where id = p_id) then
    raise exception 'Esa publicación ya no existe.';
  end if;
  if not (yo->>'admin')::boolean and
     (select count(*) from public.comunidad_comentarios
       where autor_email = yo->>'email' and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'Vas muy rápido. Espera un momento antes de comentar otra vez.';
  end if;
  insert into public.comunidad_comentarios (post_id, autor_email, autor_nombre, autor_grupo, es_admin, texto)
  values (p_id, yo->>'email', yo->>'nombre', yo->>'grupo', (yo->>'admin')::boolean, txt)
  returning id into nuevo;
  return nuevo;
end;
$$;

create or replace function public.comunidad_borrar_comentario(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo jsonb := public.comunidad_yo();
begin
  if yo is null then
    raise exception 'sin permiso';
  end if;
  delete from public.comunidad_comentarios
   where id = p_id and ((yo->>'admin')::boolean or autor_email = yo->>'email');
  if not found then
    raise exception 'No puedes borrar ese comentario.';
  end if;
end;
$$;

grant execute on function
  public.comunidad_feed(), public.comunidad_publicar(text, text), public.comunidad_borrar(uuid),
  public.comunidad_fijar(uuid, boolean), public.comunidad_gustar(uuid), public.comunidad_comentarios(uuid),
  public.comunidad_comentar(uuid, text), public.comunidad_borrar_comentario(uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: debe decir "comunidad_posts"
select to_regclass('public.comunidad_posts') as tabla_comunidad;

-- Apagar o encender la comunidad para un grupo (va junto a los demás extras de su ficha)
create or replace function public.admin_comunidad_grupo(p_id uuid, p_activa boolean)
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
  update public.grupos
     set extras_off = case when p_activa then array_remove(extras_off, 'comunidad')
                           else array_append(array_remove(extras_off, 'comunidad'), 'comunidad') end
   where id = p_id;
end;
$$;
grant execute on function public.admin_comunidad_grupo(uuid, boolean) to anon, authenticated;
notify pgrst, 'reload schema';
