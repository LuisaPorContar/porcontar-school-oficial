-- ================================================================
-- PorContar Academia · Correcciones de la auditoría
--
-- Va DE ÚLTIMO, después de todos los demás supabase-*.sql.
-- Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se puede correr varias veces: no borra contenido y la llave de
-- emergencia se rota UNA sola vez. No lleva ninguna clave escrita.
--
-- OJO: si después se vuelve a correr alguno de los archivos de donde
-- salen estas funciones (empresas, fase1, admins, comunidad, puntos,
-- asistencia, soporte, comunidad-programar), hay que correr este otra
-- vez al final: aquellos reponen la versión anterior.
-- ================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1) Llave de emergencia: se cambia una sola vez por una al azar -------
-- La nueva se consulta aquí mismo, en el SQL Editor:
--   select value from public.app_config where key = 'admin_key';
-- El conector de Claude (MCP) la lee de esta tabla: no hay que tocarlo.
do $rotar$
begin
  if not exists (select 1 from public.app_config where key = 'admin_key_rotada') then
    insert into public.app_config (key, value)
    values ('admin_key', encode(extensions.gen_random_bytes(24), 'hex'))
    on conflict (key) do update set value = excluded.value;
    insert into public.app_config (key, value) values ('admin_key_rotada', now()::text);
  end if;
end
$rotar$;

-- 2) Quizzes -------------------------------------------------------------
-- Límite por defecto: 2 intentos. Los que estaban «sin límite» (0) pasan a 2
-- una sola vez; si después se deja alguno en 0 a propósito, se respeta.
alter table public.quizzes alter column intentos set default 2;
do $intentos$
begin
  if not exists (select 1 from public.app_config where key = 'quiz_intentos_2') then
    update public.quizzes set intentos = 2 where intentos = 0;
    insert into public.app_config (key, value) values ('quiz_intentos_2', now()::text);
  end if;
end
$intentos$;

-- El quiz de una clase cerrada no se entrega (igual que quizzes_publicos)
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
     or not public.puede_ver(fila.audiencia)
     or not (fila.sesion_id is null or not (array[fila.sesion_id] && public.mis_clases_cerradas())) then
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
grant execute on function public.quiz_publico(text) to anon, authenticated;

-- Responder: las correctas solo salen si aprobó o si ya gastó su último
-- intento. Dos envíos a la vez no se saltan el límite (candado por persona).
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
  usados    int;
  aprobo    boolean;
  agotado   boolean;
begin
  if correo is null or cardinality(public.mis_etiquetas()) = 0 then
    raise exception 'Tu sesión terminó. Vuelve a entrar.';
  end if;
  if jsonb_typeof(coalesce(p_respuestas, 'null'::jsonb)) <> 'array' then
    raise exception 'Respuestas no válidas';
  end if;

  select * into fila from public.quizzes where id = p_id;
  if not found or not fila.activo or jsonb_array_length(fila.preguntas) = 0
     or not public.puede_ver(fila.audiencia)
     or not (fila.sesion_id is null or not (array[fila.sesion_id] && public.mis_clases_cerradas())) then
    raise exception 'Ese quiz no está disponible';
  end if;

  perform pg_advisory_xact_lock(hashtext(fila.id || ':' || correo));
  select count(*) into usados from public.quiz_resultados where quiz_id = fila.id and email = correo;
  if fila.intentos > 0 and usados >= fila.intentos then
    raise exception 'Ya usaste tus % intentos de este quiz.', fila.intentos;
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
  insert into public.actividad (email, dia) values (correo, public.hoy()) on conflict do nothing;

  aprobo  := puntaje * 100 >= fila.aprobar * total;
  agotado := fila.intentos > 0 and usados + 1 >= fila.intentos;

  return jsonb_build_object(
    'puntaje', puntaje,
    'total', total,
    'aciertos', aciertos,
    'aprobar', fila.aprobar,
    'aprobado', aprobo,
    'intentos', fila.intentos,
    'usados', usados + 1,
    'correctas', case when aprobo or agotado then
                   (select coalesce(jsonb_agg((p->>'correctIndex')::int order by n), '[]'::jsonb)
                      from jsonb_array_elements(fila.preguntas) with ordinality as t(p, n))
                 end
  );
end;
$$;
grant execute on function public.responder_quiz(text, jsonb) to anon, authenticated;

-- 3) Comunidad: la mejor respuesta ----------------------------------------
-- Sin comentario (null) quita la marca de verdad.
create or replace function public.comunidad_resolver(p_post uuid, p_comentario uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo jsonb := public.comunidad_yo();
begin
  if yo is null then raise exception 'sin permiso'; end if;
  if not exists (select 1 from public.comunidad_posts p where p.id = p_post
                  and ((yo->>'admin')::boolean or p.autor_email = yo->>'email')) then
    raise exception 'Solo quien preguntó o el equipo puede marcar la mejor respuesta.';
  end if;
  if p_comentario is not null and not exists (select 1 from public.comunidad_comentarios c where c.id = p_comentario and c.post_id = p_post) then
    raise exception 'Ese comentario no es de esta publicación.';
  end if;
  update public.comunidad_comentarios set mejor = coalesce(id = p_comentario, false) where post_id = p_post;
  update public.comunidad_posts set resuelta = p_comentario is not null where id = p_post;
  return jsonb_build_object('resuelta', p_comentario is not null, 'mejor', p_comentario);
end;
$$;
grant execute on function public.comunidad_resolver(uuid, uuid) to anon, authenticated;

-- Al borrar la mejor respuesta (o el comentario del que colgaba), la
-- publicación deja de estar resuelta.
create or replace function public.comunidad_borrar_comentario(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo   jsonb := public.comunidad_yo();
  post uuid;
begin
  if yo is null then
    raise exception 'sin permiso';
  end if;
  delete from public.comunidad_comentarios
   where id = p_id and ((yo->>'admin')::boolean or autor_email = yo->>'email')
  returning post_id into post;
  if not found then
    raise exception 'No puedes borrar ese comentario.';
  end if;
  update public.comunidad_posts p set resuelta = false
   where p.id = post and p.resuelta
     and not exists (select 1 from public.comunidad_comentarios c where c.post_id = p.id and c.mejor);
end;
$$;
grant execute on function public.comunidad_borrar_comentario(uuid) to anon, authenticated;

-- 4) Asistencia: regrabar un encuentro no inventa ausentes ni borra a nadie --
-- Primera vez: una fila por persona activa. Si el encuentro ya tiene filas:
-- se actualizan las de las personas activas, quien entró al grupo después
-- solo se agrega si viene presente, y lo de quien ya no está activo se deja.
create or replace function public.asistencia_guardar(p_grupo uuid, p_sesion text, p_parte int,
                                                     p_presentes text[], p_fuente text default 'lista')
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  pres  text[] := array(select lower(btrim(x)) from unnest(coalesce(p_presentes, '{}')) x);
  fte   text := case when p_fuente = 'manual' then 'manual' else 'lista' end;
  total int;
  si    int;
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;
  if p_parte not in (1, 2) then raise exception 'la parte debe ser 1 o 2'; end if;
  if not exists (select 1 from public.reto_sesiones s
                  where s.id = p_sesion and (s.grupo_id is null or s.grupo_id = p_grupo)) then
    raise exception 'esa clase no es de este grupo';
  end if;
  if not exists (select 1 from public.miembros m where m.grupo_id = p_grupo and m.activo) then
    raise exception 'el grupo no tiene personas activas';
  end if;

  -- Dos guardados a la vez del mismo encuentro van uno detrás del otro
  perform pg_advisory_xact_lock(hashtext(p_grupo::text || ':' || p_sesion || ':' || p_parte::text));

  if exists (select 1 from public.asistencia a
              where a.grupo_id = p_grupo and a.sesion_id = p_sesion and a.parte = p_parte) then
    update public.asistencia a
       set presente = (a.email = any(pres)), fuente = fte, actualizado_el = now()
     where a.grupo_id = p_grupo and a.sesion_id = p_sesion and a.parte = p_parte
       and exists (select 1 from public.miembros m
                    where m.grupo_id = p_grupo and m.email = a.email and m.activo);
    insert into public.asistencia (grupo_id, sesion_id, parte, email, presente, fuente)
    select p_grupo, p_sesion, p_parte, m.email, true, fte
      from public.miembros m
     where m.grupo_id = p_grupo and m.activo and m.email = any(pres)
    on conflict do nothing;
  else
    insert into public.asistencia (grupo_id, sesion_id, parte, email, presente, fuente)
    select p_grupo, p_sesion, p_parte, m.email, m.email = any(pres), fte
      from public.miembros m
     where m.grupo_id = p_grupo and m.activo;
  end if;

  select count(*), count(*) filter (where presente) into total, si
    from public.asistencia a
   where a.grupo_id = p_grupo and a.sesion_id = p_sesion and a.parte = p_parte;
  return jsonb_build_object('presentes', si, 'total', total);
end;
$$;
revoke all on function public.asistencia_guardar(uuid, text, int, text[], text) from public;
grant execute on function public.asistencia_guardar(uuid, text, int, text[], text) to anon, authenticated;

-- 5) Cruce de nombres: «de», «del», «la», «las», «los» e «y» no son palabras
-- del nombre («María de la Cruz» ya no cruza con «María de Jesús Rojas»).
create or replace function public.asis_toks(t text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(w), '{}')
    from unnest(regexp_split_to_array(public.asis_norm(t), '\s+')) w
   where w <> '' and w !~ '[0-9]' and length(w) >= 2
     and w not in ('de', 'del', 'la', 'las', 'los', 'y');
$$;

-- 6) Comentarios: solo de lo que se puede ver -------------------------------
-- Misma regla que el muro: su grupo o lo general, y no lo programado a
-- futuro (salvo quien lo escribió o el equipo). Si no, la lista va vacía.
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
  if not exists (select 1 from public.comunidad_posts p
                  where p.id = p_id
                    and (p.publicar_en is null or p.publicar_en <= now()
                         or p.autor_email = yo->>'email' or (yo->>'admin')::boolean)
                    and public.comunidad_veo(p.grupo_id)) then
    return '[]'::jsonb;
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'padre_id', c.padre_id, 'autor', c.autor_nombre, 'grupo', c.autor_grupo, 'es_admin', c.es_admin,
             'texto', c.texto, 'created_at', c.created_at, 'mio', c.autor_email = yo->>'email',
             'foto', (select a.foto_url from public.admins a where c.es_admin and a.email = c.autor_email),
             'likes', (select count(*) from public.comunidad_com_likes l where l.comentario_id = c.id),
             'me_gusta', exists (select 1 from public.comunidad_com_likes l where l.comentario_id = c.id and l.email = yo->>'email'),
             'mejor', c.mejor,
             'autor_email', case when (yo->>'admin')::boolean and not c.es_admin then c.autor_email end)
             order by c.created_at), '[]'::jsonb)
      from public.comunidad_comentarios c
     where c.post_id = p_id
  );
end;
$$;
grant execute on function public.comunidad_comentarios(uuid) to anon, authenticated;

-- Una publicación programada no recibe comentarios hasta que sale (salvo del equipo)
create or replace function public.comunidad_comentar(p_id uuid, p_texto text, p_padre uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo  jsonb := public.comunidad_yo();
  txt text := btrim(coalesce(p_texto, ''));
  padre uuid := null;
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
  if not (yo->>'admin')::boolean
     and exists (select 1 from public.comunidad_posts where id = p_id and publicar_en > now()) then
    raise exception 'Esa publicación todavía no se ha publicado.';
  end if;
  if p_padre is not null then
    -- Un solo nivel: responder a una respuesta cuelga del mismo comentario de arriba
    select coalesce(c.padre_id, c.id) into padre from public.comunidad_comentarios c where c.id = p_padre and c.post_id = p_id;
    if padre is null then
      raise exception 'Ese comentario ya no existe.';
    end if;
  end if;
  if not (yo->>'admin')::boolean and
     (select count(*) from public.comunidad_comentarios
       where autor_email = yo->>'email' and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'Vas muy rápido. Espera un momento antes de comentar otra vez.';
  end if;
  insert into public.comunidad_comentarios (post_id, padre_id, autor_email, autor_nombre, autor_grupo, es_admin, texto)
  values (p_id, padre, yo->>'email', yo->>'nombre', yo->>'grupo', (yo->>'admin')::boolean, txt)
  returning id into nuevo;
  return nuevo;
end;
$$;
grant execute on function public.comunidad_comentar(uuid, text, uuid) to anon, authenticated;

-- 7) Soporte: si la persona reabre su ticket, vuelve a esperar respuesta -----
create or replace function public.soporte_estado(p_id uuid, p_estado text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo  jsonb := public.soporte_yo();
  adm boolean;
begin
  adm := public.soporte_acceso(p_id, yo);
  if p_estado not in ('abierto', 'cerrado') then
    raise exception 'Ese estado no existe.';
  end if;
  -- (a la derecha del = van los valores de antes del cambio)
  update public.soporte_tickets
     set estado = p_estado,
         ultimo_de_equipo = case when not coalesce(adm, false) and p_estado = 'abierto' and estado = 'cerrado'
                                 then false else ultimo_de_equipo end,
         updated_at = case when not coalesce(adm, false) and p_estado = 'abierto' and estado = 'cerrado'
                           then now() else updated_at end
   where id = p_id;
end;
$$;
grant execute on function public.soporte_estado(uuid, text) to anon, authenticated;

-- 8) Sesiones que se cierran solas -------------------------------------------
-- Al desactivar o quitar a una persona: si ya no está activa en ningún
-- grupo, se cierran sus sesiones abiertas.
create or replace function public.admin_actualizar_miembro(p_id bigint, p_nombre text, p_rol text, p_activo boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo text;
begin
  if not public.is_admin() then
    raise exception 'sin permiso';
  end if;
  if p_rol not in ('estudiante', 'responsable') then
    raise exception 'Rol no válido';
  end if;
  update public.miembros
     set nombre = left(btrim(coalesce(p_nombre, '')), 120), rol = p_rol, activo = p_activo
   where id = p_id
  returning email into correo;
  if correo is not null and not coalesce(p_activo, false)
     and not exists (select 1 from public.miembros m where m.email = correo and m.activo) then
    delete from public.sesiones where email = correo;
  end if;
end;
$$;
grant execute on function public.admin_actualizar_miembro(bigint, text, text, boolean) to anon, authenticated;

create or replace function public.admin_quitar_miembro(p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo text;
begin
  if not public.is_admin() then
    raise exception 'sin permiso';
  end if;
  delete from public.miembros where id = p_id returning email into correo;
  if correo is not null
     and not exists (select 1 from public.miembros m where m.email = correo and m.activo) then
    delete from public.sesiones where email = correo;
  end if;
end;
$$;
grant execute on function public.admin_quitar_miembro(bigint) to anon, authenticated;

-- Al ponerle una contraseña nueva a una cuenta de admin que ya existía, se
-- cierran sus sesiones (menos la de quien lo hace, si es su propia cuenta).
-- (admin_cambiar_clave ya lo hacía; crear_admin va en el punto 9.)
create or replace function public.admin_agregar(p_email text, p_nombre text, p_clave text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;
  if correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Escribe un correo válido.'; end if;
  if correo !~ '@porcontar\.com$' then raise exception 'Solo correos @porcontar.com pueden ser admin.'; end if;
  if char_length(coalesce(p_clave, '')) < 8 then raise exception 'La contraseña temporal debe tener al menos 8 caracteres.'; end if;
  insert into public.admins (email, nombre, clave_hash, activo)
  values (correo, left(btrim(coalesce(p_nombre, '')), 80), extensions.crypt(p_clave, extensions.gen_salt('bf', 10)), true)
  on conflict (email) do update
    set nombre = case when excluded.nombre <> '' then excluded.nombre else public.admins.nombre end,
        clave_hash = excluded.clave_hash, activo = true;
  delete from public.admin_sesiones where email = correo
     and token_hash <> encode(extensions.digest(
           coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-admin-sesion', ''), 'sha256'), 'hex');
end;
$$;
grant execute on function public.admin_agregar(text, text, text) to anon, authenticated;

-- 9) Bloqueo por intentos: por correo Y por dirección (IP) -------------------
-- Antes bastaba fallar varias veces con el correo de otra persona para
-- dejarla por fuera 15 minutos. Ahora cuenta desde dónde se falla.
alter table public.intentos_acceso add column if not exists ip text;
create index if not exists intentos_ip_idx on public.intentos_acceso (ip, created_at desc);

-- La IP de quien llama (la pone Cloudflare; si no, el primer valor de
-- x-forwarded-for). Sin cabeceras devuelve null, sin fallar.
create or replace function public.ip_cliente()
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  h  json;
  ip text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  if h is null then return null; end if;
  ip := nullif(btrim(h ->> 'cf-connecting-ip'), '');
  if ip is null then
    ip := nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), '');
  end if;
  return left(ip, 60);
exception when others then
  return null;
end;
$$;
revoke all on function public.ip_cliente() from public, anon, authenticated;

-- ¿Está bloqueado? (fallos de los últimos 15 minutos)
--   · ese correo desde esa IP ≥ el umbral de siempre, o
--   · esa IP con cualquier correo ≥ 30, o
--   · ese correo desde cualquier IP ≥ 40.
-- Sin IP, como antes: ese correo ≥ el umbral.
create or replace function public.acceso_bloqueado(p_quien text, p_ip text, p_umbral int)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case when p_ip is null then
    (select count(*) from public.intentos_acceso
      where email = p_quien and not ok and created_at > now() - interval '15 minutes') >= p_umbral
  else
    (select count(*) from public.intentos_acceso
      where email = p_quien and ip = p_ip and not ok and created_at > now() - interval '15 minutes') >= p_umbral
    or (select count(*) from public.intentos_acceso
         where ip = p_ip and not ok and created_at > now() - interval '15 minutes') >= 30
    or (select count(*) from public.intentos_acceso
         where email = p_quien and not ok and created_at > now() - interval '15 minutes') >= 40
  end;
$$;
revoke all on function public.acceso_bloqueado(text, text, int) from public, anon, authenticated;

-- Entrar (estudiantes y responsables): igual que antes, correo + contraseña del grupo
create or replace function public.entrar(p_email text, p_clave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo   text := lower(btrim(coalesce(p_email, '')));
  ip       text := public.ip_cliente();
  vigentes int;
  vencio   date;
  token    text;
begin
  if correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or coalesce(p_clave, '') = '' then
    return jsonb_build_object('error', 'Escribe tu correo y la contraseña.');
  end if;

  if public.acceso_bloqueado(correo, ip, 8) then
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
    insert into public.intentos_acceso (email, ok, ip) values (correo, false, ip);
    return jsonb_build_object('error', 'El correo o la contraseña no coinciden. Revisa que sea el correo con el que te inscribieron.');
  end if;

  if vigentes = 0 then
    insert into public.intentos_acceso (email, ok, ip) values (correo, true, ip);
    return jsonb_build_object('error',
      'El acceso de tu grupo terminó el ' || to_char(vencio, 'DD/MM/YYYY') || '. Escríbenos si necesitas más tiempo.');
  end if;

  token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.sesiones (token_hash, email)
  values (encode(extensions.digest(token, 'sha256'), 'hex'), correo);
  insert into public.intentos_acceso (email, ok, ip) values (correo, true, ip);
  update public.miembros set ultimo_acceso = now() where email = correo;

  -- Limpieza de paso: sesiones vencidas e intentos viejos
  delete from public.sesiones where vence < now();
  delete from public.intentos_acceso where created_at < now() - interval '7 days';

  return jsonb_build_object('token', token);
end;
$$;
grant execute on function public.entrar(text, text) to anon, authenticated;

create or replace function public.entrar_admin(p_email text, p_clave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo text := lower(btrim(coalesce(p_email, '')));
  ip     text := public.ip_cliente();
  fila   public.admins;
begin
  if correo = '' or coalesce(p_clave, '') = '' then
    return jsonb_build_object('error', 'Escribe tu correo y tu contraseña.');
  end if;
  if public.acceso_bloqueado('admin:' || correo, ip, 6) then
    return jsonb_build_object('error', 'Demasiados intentos seguidos. Espera 15 minutos.');
  end if;

  -- Fuera del dominio: el mismo mensaje que una contraseña mala (no se da pista)
  if correo !~ '@porcontar\.com$' then
    return jsonb_build_object('error', 'El correo o la contraseña no coinciden.');
  end if;

  select * into fila from public.admins where email = correo and activo;
  if found and fila.clave_hash is null then
    return jsonb_build_object('primera_vez', true);
  end if;
  if not found or fila.clave_hash <> extensions.crypt(p_clave, fila.clave_hash) then
    insert into public.intentos_acceso (email, ok, ip) values ('admin:' || correo, false, ip);
    return jsonb_build_object('error', 'El correo o la contraseña no coinciden.');
  end if;

  insert into public.intentos_acceso (email, ok, ip) values ('admin:' || correo, true, ip);
  delete from public.intentos_acceso where created_at < now() - interval '7 days';
  return jsonb_build_object('token', public.admin_abrir_sesion(correo), 'nombre', fila.nombre);
end;
$$;
grant execute on function public.entrar_admin(text, text) to anon, authenticated;

-- Con la llave de emergencia. Primero se mira la llave: la correcta nunca
-- queda bloqueada. Al cambiar la contraseña de una cuenta que ya existía se
-- cierran sus sesiones anteriores.
create or replace function public.crear_admin(p_llave text, p_email text, p_nombre text, p_clave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo text := lower(btrim(coalesce(p_email, '')));
  ip     text := public.ip_cliente();
begin
  if not public.es_llave_admin(p_llave) then
    if public.acceso_bloqueado('llave:' || correo, ip, 5) then
      return jsonb_build_object('error', 'Demasiados intentos seguidos. Espera 15 minutos.');
    end if;
    insert into public.intentos_acceso (email, ok, ip) values ('llave:' || correo, false, ip);
    return jsonb_build_object('error', 'La llave de emergencia no es la correcta.');
  end if;
  if correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('error', 'Escribe un correo válido.');
  end if;
  if correo !~ '@porcontar\.com$' then
    return jsonb_build_object('error', 'Solo correos @porcontar.com pueden ser admin.');
  end if;
  if char_length(coalesce(p_clave, '')) < 8 then
    return jsonb_build_object('error', 'La contraseña debe tener al menos 8 caracteres.');
  end if;

  insert into public.admins (email, nombre, clave_hash, activo)
  values (correo, left(btrim(coalesce(p_nombre, '')), 80), extensions.crypt(p_clave, extensions.gen_salt('bf', 10)), true)
  on conflict (email) do update
    set clave_hash = excluded.clave_hash, activo = true,
        nombre = case when excluded.nombre <> '' then excluded.nombre else public.admins.nombre end;
  delete from public.admin_sesiones where email = correo;
  insert into public.intentos_acceso (email, ok, ip) values ('llave:' || correo, true, ip);
  delete from public.intentos_acceso where created_at < now() - interval '7 days';
  return jsonb_build_object('token', public.admin_abrir_sesion(correo));
end;
$$;
grant execute on function public.crear_admin(text, text, text, text) to anon, authenticated;

-- 10) Almacén -------------------------------------------------------------
-- >>> ALMACEN
-- Nadie de fuera puede listar lo que hay en el almacén. Los enlaces públicos
-- siguen funcionando (el bucket sigue public = true). La app no lista, pero
-- para BORRAR o reemplazar un archivo el almacén pide poder leer la fila:
-- por eso queda la lectura solo para el admin.
drop policy if exists "retomkt videos lectura publica" on storage.objects;
drop policy if exists "retomkt videos admin lee" on storage.objects;
create policy "retomkt videos admin lee" on storage.objects
  for select using (bucket_id = 'videos-academia' and public.is_admin());
-- <<< ALMACEN

-- 11) «Publicar ya» solo sirve para lo que sigue programado -----------------
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
  if r.publicar_en is null or r.publicar_en <= now() then
    raise exception 'Esa publicación ya está publicada.';
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
grant execute on function public.comunidad_publicar_ya(uuid) to anon, authenticated;

-- 12) Puntos: el doble clic no los da dos veces ------------------------------
-- Si quien los da ya dio los mismos puntos, a la misma persona y con el mismo
-- motivo hace menos de 10 segundos, se devuelve ese registro y no se repite.
create or replace function public.dar_puntos(p_grupo uuid, p_email text, p_puntos int, p_motivo text default '')
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  correo text := lower(btrim(coalesce(p_email, '')));
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 200);
  autor  text := coalesce(public.admin_email(), 'Claude');   -- igual que el valor por defecto de «por»
  nuevo  bigint;
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;
  if p_puntos is null or p_puntos < 1 or p_puntos > 100 then raise exception 'Los puntos van de 1 a 100.'; end if;
  if not exists (select 1 from public.miembros m where m.grupo_id = p_grupo and m.email = correo and m.activo) then
    raise exception 'Esa persona no está activa en este grupo.';
  end if;
  perform pg_advisory_xact_lock(hashtext('puntos:' || p_grupo::text || ':' || correo));
  select pm.id into nuevo from public.puntos_manuales pm
   where pm.grupo_id = p_grupo and pm.email = correo and pm.puntos = p_puntos
     and pm.motivo = v_motivo and pm.por = autor
     and pm.creado_el > clock_timestamp() - interval '10 seconds'
   order by pm.id desc limit 1;
  if nuevo is not null then
    return nuevo;
  end if;
  insert into public.puntos_manuales (grupo_id, email, puntos, motivo, por)
  values (p_grupo, correo, p_puntos, v_motivo, autor)
  returning id into nuevo;
  return nuevo;
end;
$$;
revoke all on function public.dar_puntos(uuid, text, int, text) from public;
grant execute on function public.dar_puntos(uuid, text, int, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: todo debe decir «sí» (la llave nueva NO se muestra aquí)
select
  (select case when count(*) = 1 then 'sí' else 'no' end from public.app_config where key = 'admin_key_rotada') as llave_rotada,
  (select case when char_length(value) = 48 then 'sí' else 'no' end from public.app_config where key = 'admin_key') as llave_al_azar,
  (select case when column_default = '2' then 'sí' else 'no' end from information_schema.columns
    where table_schema = 'public' and table_name = 'quizzes' and column_name = 'intentos') as quiz_2_intentos,
  (select case when count(*) = 1 then 'sí' else 'no' end from information_schema.columns
    where table_schema = 'public' and table_name = 'intentos_acceso' and column_name = 'ip') as intentos_con_ip,
  case when to_regproc('public.ip_cliente') is not null and to_regproc('public.acceso_bloqueado') is not null
       then 'sí' else 'no' end as funciones_bloqueo,
  case when public.asis_toks('María de la Cruz') = array['maria', 'cruz'] then 'sí' else 'no' end as cruce_sin_particulas,
  (select case when count(*) = 0 then 'sí' else 'no' end from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'retomkt videos lectura publica') as almacen_sin_listado;
