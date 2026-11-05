-- ================================================================
-- PorContar Academia · Comunidad: publicaciones programadas y encuestas con cierre
--
--   · Programar: la publicación se guarda ya, pero los demás la ven desde la
--     fecha y hora elegidas (entre 1 minuto y 90 días). Quien la escribió y el
--     admin la ven antes, marcada como «Programada», y pueden publicarla ya.
--   · Encuestas con cierre: «Cierra en 1, 3, 7… días» desde que se publica.
--     Cerrada, ya no recibe votos y todos ven los resultados.
--
-- Va DESPUÉS de supabase-comunidad.sql.
-- Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se puede correr varias veces: no borra contenido. No lleva la clave de admin.
-- ================================================================

alter table public.comunidad_posts add column if not exists publicar_en timestamptz;   -- null = de una
create index if not exists comunidad_posts_publicar_idx on public.comunidad_posts (publicar_en);

-- La encuesta con su cierre: { opciones, total, mi_voto, cierra, cerrada }
create or replace function public.comunidad_encuesta_de(p_id uuid, p_encuesta jsonb, p_email text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when p_encuesta is null then null else jsonb_build_object(
    'opciones', (select jsonb_agg(jsonb_build_object(
                          'texto', o.texto,
                          'votos', (select count(*) from public.comunidad_votos v where v.post_id = p_id and v.opcion = o.n - 1))
                        order by o.n)
                   from jsonb_array_elements_text(p_encuesta->'opciones') with ordinality as o(texto, n)),
    'total',   (select count(*) from public.comunidad_votos v where v.post_id = p_id),
    'mi_voto', (select v.opcion from public.comunidad_votos v where v.post_id = p_id and v.email = p_email),
    'cierra',  p_encuesta->'cierra',
    'cerrada', coalesce((p_encuesta->>'cierra')::timestamptz < now(), false)) end;
$$;
revoke all on function public.comunidad_encuesta_de(uuid, jsonb, text) from public, anon, authenticated;

-- El muro: lo programado solo lo ven, antes de tiempo, quien lo escribió y el admin.
-- La fecha de una programada es la de publicación: así sale arriba cuando llega su hora.
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
               p.fijado, coalesce(p.publicar_en, p.created_at) as created_at, p.adjuntos,
               coalesce(p.publicar_en > now(), false) as programada, p.publicar_en,
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
         where p.publicar_en is null or p.publicar_en <= now()
            or p.autor_email = yo->>'email' or (yo->>'admin')::boolean
         order by p.fijado desc, coalesce(p.publicar_en, p.created_at) desc
         limit 200
      ) x
  );
end;
$$;

-- Publicar, ahora con fecha de publicación y cierre de la encuesta
drop function if exists public.comunidad_publicar(text, text, jsonb, jsonb);
create or replace function public.comunidad_publicar(p_titulo text, p_texto text, p_adjuntos jsonb default '[]'::jsonb,
                                                     p_encuesta jsonb default null, p_publicar_en timestamptz default null)
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
  nuevo uuid;
begin
  if yo is null then
    raise exception 'sin permiso';
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
  insert into public.comunidad_posts (autor_email, autor_nombre, autor_grupo, es_admin, titulo, texto, adjuntos, encuesta, publicar_en)
  values (yo->>'email', yo->>'nombre', yo->>'grupo', (yo->>'admin')::boolean, tit, txt, adj, enc, p_publicar_en)
  returning id into nuevo;
  return nuevo;
end;
$$;

-- Publicar ya una programada (quien la escribió o el admin)
create or replace function public.comunidad_publicar_ya(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo jsonb := public.comunidad_yo();
  r  record;
begin
  if yo is null then
    raise exception 'sin permiso';
  end if;
  select autor_email, publicar_en, encuesta into r from public.comunidad_posts where id = p_id;
  if not found then
    raise exception 'Esa publicación ya no existe.';
  end if;
  if r.autor_email <> yo->>'email' and not (yo->>'admin')::boolean then
    raise exception 'Solo quien la escribió puede publicarla.';
  end if;
  -- El cierre de la encuesta se corre con ella: dura lo mismo desde hoy
  update public.comunidad_posts
     set publicar_en = null, created_at = now(),
         encuesta = case when r.encuesta ? 'cierra' and r.publicar_en is not null
                         then jsonb_set(r.encuesta, '{cierra}', to_jsonb(now() + ((r.encuesta->>'cierra')::timestamptz - r.publicar_en)))
                         else r.encuesta end
   where id = p_id;
end;
$$;

-- Votar: una encuesta cerrada o que todavía no se publica no recibe votos
create or replace function public.comunidad_votar(p_id uuid, p_opcion int)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo  jsonb := public.comunidad_yo();
  enc jsonb;
  pub timestamptz;
begin
  if yo is null then
    raise exception 'sin permiso';
  end if;
  select encuesta, publicar_en into enc, pub from public.comunidad_posts where id = p_id;
  if enc is null then
    raise exception 'Esa encuesta ya no existe.';
  end if;
  if pub > now() then
    raise exception 'Esta encuesta todavía no se publica.';
  end if;
  if (enc->>'cierra')::timestamptz < now() then
    raise exception 'Esta encuesta ya cerró.';
  end if;
  if p_opcion is null or p_opcion < 0 or p_opcion >= jsonb_array_length(enc->'opciones') then
    raise exception 'Esa opción no existe.';
  end if;
  insert into public.comunidad_votos (post_id, email, opcion) values (p_id, yo->>'email', p_opcion)
  on conflict (post_id, email) do update set opcion = excluded.opcion;
  return public.comunidad_encuesta_de(p_id, enc, yo->>'email');
end;
$$;

grant execute on function
  public.comunidad_feed(), public.comunidad_publicar(text, text, jsonb, jsonb, timestamptz),
  public.comunidad_publicar_ya(uuid), public.comunidad_votar(uuid, int)
  to anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: debe decir "publicar_en" y "comunidad_publicar_ya"
select
  (select column_name from information_schema.columns where table_schema = 'public' and table_name = 'comunidad_posts' and column_name = 'publicar_en') as columna_publicar_en,
  to_regprocedure('public.comunidad_publicar_ya(uuid)') as funcion_publicar_ya;
