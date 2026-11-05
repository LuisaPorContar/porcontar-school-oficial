-- ================================================================
-- PorContar Academia · Una Comunidad por empresa o cohorte.
--
--   · Cada publicación es de un grupo (grupo_id). Sin grupo = general:
--     la ven todos (los avisos que el equipo publica desde el Principal).
--   · Cada persona ve, comenta, da «Me gusta» y vota solo en lo de sus
--     grupos y en lo general. Lo que publica queda en su grupo.
--   · El admin, en el espacio de una empresa, ve y publica solo para ella;
--     en el Principal ve todo y publica para todos.
--   · La primera vez, lo que ya existía se reparte según la empresa de quien
--     lo escribió; lo del equipo queda general.
--
-- Va DESPUÉS de supabase-comunidad.sql y supabase-comunidad-programar.sql.
-- Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se puede correr varias veces: no borra contenido. No lleva la clave de admin.
-- OJO: si se vuelve a correr supabase-comunidad.sql o
-- supabase-comunidad-programar.sql, hay que correr este otra vez después.
-- ================================================================

-- 1) El grupo de cada publicación ------------------------------------
alter table public.comunidad_posts
  add column if not exists grupo_id uuid references public.grupos(id) on delete cascade;
create index if not exists comunidad_posts_grupo_idx on public.comunidad_posts (grupo_id);

-- La primera vez: lo de las personas pasa al grupo con el que lo firmaron
do $repartir$
begin
  if not exists (select 1 from public.ajustes where clave = 'comunidad_por_empresa') then
    update public.comunidad_posts p
       set grupo_id = (select g.id from public.grupos g where g.nombre = p.autor_grupo order by g.created_at limit 1)
     where not p.es_admin and p.grupo_id is null;
    insert into public.ajustes (clave, valor) values ('comunidad_por_empresa', to_jsonb(now()::text));
  end if;
end
$repartir$;

-- 2) Quién escribe, ahora con el id de su grupo -------------------------
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
      'grupo', 'PorContar', 'grupo_id', null, 'admin', true);
  end if;

  correo := public.mi_email();
  if correo is null then
    return null;
  end if;
  -- Solo con un grupo vigente que no tenga la comunidad apagada
  select m.nombre, g.nombre as grupo, g.id as grupo_id into r
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
    'grupo', r.grupo, 'grupo_id', r.grupo_id, 'admin', false);
end;
$$;
revoke all on function public.comunidad_yo() from public, anon, authenticated;

-- ¿Quien mira puede ver lo de ese grupo? (general = sí; admin = sí)
create or replace function public.comunidad_veo(p_grupo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_grupo is null or public.is_admin()
      or exists (select 1 from public.miembros m join public.grupos g on g.id = m.grupo_id
                  where m.grupo_id = p_grupo and m.email = public.mi_email() and m.activo and g.activo
                    and (g.vence_el is null or g.vence_el >= public.hoy())
                    and not ('comunidad' = any(g.extras_off)));
$$;
revoke all on function public.comunidad_veo(uuid) from public, anon, authenticated;

-- 3) El muro: lo general y lo de sus grupos -----------------------------
-- p_grupo (solo admin): el espacio en que está; vacío = el Principal, ve todo.
drop function if exists public.comunidad_feed();
create or replace function public.comunidad_feed(p_grupo uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  yo jsonb := public.comunidad_yo();
  adm boolean;
begin
  if yo is null then
    raise exception 'sin permiso';
  end if;
  adm := (yo->>'admin')::boolean;
  return (
    select coalesce(jsonb_agg(x order by x.fijado desc, x.created_at desc), '[]'::jsonb)
      from (
        select p.id, p.autor_nombre as autor, p.autor_grupo as grupo, p.es_admin, p.titulo, p.texto,
               p.fijado, coalesce(p.publicar_en, p.created_at) as created_at, p.adjuntos,
               coalesce(p.publicar_en > now(), false) as programada, p.publicar_en,
               p.grupo_id, (select g.nombre from public.grupos g where g.id = p.grupo_id) as para,
               (select a.foto_url from public.admins a where p.es_admin and a.email = p.autor_email) as foto,
               public.comunidad_encuesta_de(p.id, p.encuesta, yo->>'email') as encuesta,
               (select count(*) from public.comunidad_likes l where l.post_id = p.id) as likes,
               exists (select 1 from public.comunidad_likes l where l.post_id = p.id and l.email = yo->>'email') as me_gusta,
               (select count(*) from public.comunidad_comentarios c where c.post_id = p.id) as comentarios,
               -- Lo último que respondió el equipo, para mostrarlo sin abrir los comentarios
               (select jsonb_build_object('autor', c.autor_nombre, 'texto', c.texto, 'created_at', c.created_at,
                         'foto', (select a.foto_url from public.admins a where a.email = c.autor_email))
                  from public.comunidad_comentarios c
                 where c.post_id = p.id and c.es_admin and not p.es_admin
                 order by c.created_at desc limit 1) as respuesta_equipo,
               (p.autor_email = yo->>'email') as mio
          from public.comunidad_posts p
         where (p.publicar_en is null or p.publicar_en <= now() or p.autor_email = yo->>'email' or adm)
           and (case when adm then p_grupo is null or p.grupo_id is null or p.grupo_id = p_grupo
                     else public.comunidad_veo(p.grupo_id) end)
         order by p.fijado desc, coalesce(p.publicar_en, p.created_at) desc
         limit 200
      ) x
  );
end;
$$;
grant execute on function public.comunidad_feed(uuid) to anon, authenticated;

-- 4) Publicar: la persona en su grupo; el admin donde esté (vacío = para todos) ----------
drop function if exists public.comunidad_publicar(text, text, jsonb, jsonb, timestamptz);
create or replace function public.comunidad_publicar(p_titulo text, p_texto text, p_adjuntos jsonb default '[]'::jsonb,
                                                     p_encuesta jsonb default null, p_publicar_en timestamptz default null,
                                                     p_grupo uuid default null)
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
  adj jsonb := '[]'::jsonb;
  enc jsonb := null;
  ops text[];
  dias int;
  grupo uuid;
  nuevo uuid;
begin
  if yo is null then
    raise exception 'sin permiso';
  end if;
  if (yo->>'admin')::boolean then
    grupo := p_grupo;
    if grupo is not null and not exists (select 1 from public.grupos where id = grupo) then
      raise exception 'Ese grupo ya no existe.';
    end if;
  else
    grupo := (yo->>'grupo_id')::uuid;
  end if;

  -- Programada: entre 1 minuto y 90 días desde ahora (se da un margen de 30 segundos)
  if p_publicar_en is not null then
    if p_publicar_en < now() + interval '30 seconds' then
      raise exception 'La hora programada ya pasó: elige una al menos 1 minuto adelante.';
    end if;
    if p_publicar_en > now() + interval '90 days' then
      raise exception 'Solo se puede programar hasta 90 días desde hoy.';
    end if;
  end if;

  if jsonb_typeof(p_adjuntos) = 'array' then
    if jsonb_array_length(p_adjuntos) > 6 then
      raise exception 'Máximo 6 adjuntos por publicación.';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
             'tipo', a->>'tipo', 'url', a->>'url', 'nombre', left(coalesce(a->>'nombre', ''), 120))), '[]'::jsonb)
      into adj
      from jsonb_array_elements(p_adjuntos) a
     where a->>'tipo' in ('imagen', 'archivo', 'audio', 'video', 'enlace')
       and a->>'url' ~ '^(https://|http://localhost[:/])[^\s<>"]+$' and char_length(a->>'url') <= 600;
  end if;

  if p_encuesta is not null and jsonb_typeof(p_encuesta->'opciones') = 'array' then
    select array_agg(left(btrim(o), 80)) into ops
      from jsonb_array_elements_text(p_encuesta->'opciones') o where btrim(o) <> '';
    if coalesce(cardinality(ops), 0) < 2 or cardinality(ops) > 6 then
      raise exception 'La encuesta necesita entre 2 y 6 opciones.';
    end if;
    enc := jsonb_build_object('opciones', to_jsonb(ops));
    -- Cierre: días contados desde que se publica
    dias := case when (p_encuesta->>'dias') ~ '^\d+$' then (p_encuesta->>'dias')::int end;
    if dias between 1 and 90 then
      enc := enc || jsonb_build_object('cierra', coalesce(p_publicar_en, now()) + make_interval(days => dias));
    end if;
  end if;

  if char_length(txt) < 2 and tit = '' and jsonb_array_length(adj) = 0 and enc is null then
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
  insert into public.comunidad_posts (autor_email, autor_nombre, autor_grupo, es_admin, titulo, texto, adjuntos, encuesta, publicar_en, grupo_id)
  values (yo->>'email', yo->>'nombre', yo->>'grupo', (yo->>'admin')::boolean, tit, txt, adj, enc, p_publicar_en, grupo)
  returning id into nuevo;
  return nuevo;
end;
$$;
grant execute on function public.comunidad_publicar(text, text, jsonb, jsonb, timestamptz, uuid) to anon, authenticated;

-- 5) Comentar, dar «Me gusta» y votar: solo en lo que se ve ---------------
create or replace function public.comunidad_solo_lo_mio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post uuid;
begin
  if TG_TABLE_NAME = 'comunidad_com_likes' then
    select c.post_id into post from public.comunidad_comentarios c where c.id = new.comentario_id;
  else
    post := new.post_id;
  end if;
  if not public.comunidad_veo((select p.grupo_id from public.comunidad_posts p where p.id = post)) then
    raise exception 'Esa publicación ya no existe.';
  end if;
  return new;
end;
$$;
revoke all on function public.comunidad_solo_lo_mio() from public, anon, authenticated;

drop trigger if exists comunidad_comentarios_grupo on public.comunidad_comentarios;
create trigger comunidad_comentarios_grupo before insert on public.comunidad_comentarios
  for each row execute function public.comunidad_solo_lo_mio();
drop trigger if exists comunidad_likes_grupo on public.comunidad_likes;
create trigger comunidad_likes_grupo before insert on public.comunidad_likes
  for each row execute function public.comunidad_solo_lo_mio();
drop trigger if exists comunidad_votos_grupo on public.comunidad_votos;
create trigger comunidad_votos_grupo before insert on public.comunidad_votos
  for each row execute function public.comunidad_solo_lo_mio();
drop trigger if exists comunidad_com_likes_grupo on public.comunidad_com_likes;
create trigger comunidad_com_likes_grupo before insert on public.comunidad_com_likes
  for each row execute function public.comunidad_solo_lo_mio();

notify pgrst, 'reload schema';

-- Comprobación: cuántas publicaciones quedaron en cada grupo
select coalesce(g.nombre, 'General (todos)') as comunidad, count(*) as publicaciones
  from public.comunidad_posts p left join public.grupos g on g.id = p.grupo_id
 group by 1 order by 1;
