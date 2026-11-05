-- ================================================================
-- PorContar Academia · Las preguntas frecuentes de Maper pasan a la
-- Comunidad de Maper (una sola vez).
--
-- Cada pregunta queda como publicación de «Participante de MAPER» (en
-- Preguntas frecuentes no tenían nombre) en la fecha en que se hizo, y su
-- respuesta, como comentario del equipo PorContar. Las preguntas originales
-- quedan guardadas (Preguntas frecuentes ya no se muestra).
-- No manda correos de aviso: los avisos se apagan mientras corre.
--
-- Va DESPUÉS de supabase-comunidad-empresas.sql.
-- Supabase → SQL Editor → New query → pegar TODO → Run.
-- Si se corre otra vez, no repite nada.
-- ================================================================

do $faq$
declare
  maper uuid;
  nombre_g text;
  r record;
  nuevo uuid;
  n int := 0;
begin
  if exists (select 1 from public.ajustes where clave = 'faq_a_comunidad') then
    raise notice 'Las preguntas ya se habían pasado: no se repite nada.';
    return;
  end if;
  select g.id, g.nombre into maper, nombre_g from public.grupos g where g.nombre ilike '%maper%' order by g.created_at limit 1;
  if maper is null then
    raise exception 'No encontré el grupo Maper.';
  end if;

  -- Mientras se copian: sin correos de aviso y sin la revisión de grupo (aquí no hay una persona entrando)
  alter table public.comunidad_posts disable trigger user;
  alter table public.comunidad_comentarios disable trigger user;

  for r in select * from public.posts
            where session = 'faq' and audiencia @> array[maper::text]
            order by created_at loop
    insert into public.comunidad_posts (autor_email, autor_nombre, autor_grupo, es_admin, titulo, texto, created_at, grupo_id)
    values ('participante@maper.academia', 'Participante de ' || nombre_g, nombre_g, false, '', btrim(r.title), r.created_at, maper)
    returning id into nuevo;
    if btrim(coalesce(r.body, '')) <> '' then
      insert into public.comunidad_comentarios (post_id, autor_email, autor_nombre, autor_grupo, es_admin, texto, created_at)
      values (nuevo, 'equipo@porcontar.com', 'PorContar', 'PorContar', true, replace(btrim(r.body), E'\r', ''),
              greatest(coalesce(r.updated_at, r.created_at), r.created_at + interval '1 minute'));
    end if;
    n := n + 1;
  end loop;

  alter table public.comunidad_posts enable trigger user;
  alter table public.comunidad_comentarios enable trigger user;

  insert into public.ajustes (clave, valor) values ('faq_a_comunidad', to_jsonb(n));
  raise notice 'Listo: % preguntas pasaron a la Comunidad de %.', n, nombre_g;
end
$faq$;

-- Comprobación: las publicaciones de la Comunidad de Maper
select p.autor_nombre, left(p.texto, 70) as pregunta, p.created_at::date as fecha,
       (select count(*) from public.comunidad_comentarios c where c.post_id = p.id) as respuestas
  from public.comunidad_posts p join public.grupos g on g.id = p.grupo_id
 where g.nombre ilike '%maper%'
 order by p.created_at;
