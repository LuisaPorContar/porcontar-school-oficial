-- ================================================================
-- PorContar Academia · Soporte: tickets entre cada persona y el equipo
--
--   · Cada persona con acceso abre tickets (asunto, tema y mensaje), ve
--     solo los suyos y conversa con el equipo ahí mismo.
--   · El admin ve todos, responde, cierra o reabre, y también abre un ticket
--     a nombre de una persona (desde su fila en Empresas y cohortes).
--   · Cada lado sabe qué tiene sin leer: el admin, lo que espera respuesta;
--     la persona, lo que el equipo le respondió.
--
-- Va DESPUÉS de supabase-empresas.sql y supabase-admins.sql.
-- Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se puede correr varias veces: no borra contenido. No lleva la clave de admin.
-- ================================================================

create table if not exists public.soporte_tickets (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,                 -- la persona del ticket
  nombre           text not null default '',
  grupo            text not null default '',      -- su empresa o cohorte al abrirlo
  asunto           text not null,
  categoria        text not null default 'Otro',
  estado           text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  ultimo_de_equipo boolean not null default false, -- el último mensaje lo escribió el equipo
  leido_persona    timestamptz,
  leido_equipo     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()   -- el último mensaje
);
create index if not exists soporte_tickets_email_idx on public.soporte_tickets (email, updated_at desc);
create index if not exists soporte_tickets_estado_idx on public.soporte_tickets (estado, updated_at desc);

create table if not exists public.soporte_mensajes (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.soporte_tickets(id) on delete cascade,
  es_equipo   boolean not null default false,
  autor       text not null,
  autor_email text not null,
  texto       text not null,
  created_at  timestamptz not null default now()
);
create index if not exists soporte_mensajes_ticket_idx on public.soporte_mensajes (ticket_id, created_at);

alter table public.soporte_tickets  enable row level security;
alter table public.soporte_mensajes enable row level security;
-- Sin policies: solo se tocan con las funciones de abajo.

-- Quién escribe: { email, nombre, grupo, admin } o null si no tiene sesión
create or replace function public.soporte_yo()
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
  select m.nombre, g.nombre as grupo into r
    from public.miembros m
    join public.grupos g on g.id = m.grupo_id
   where m.email = correo and m.activo
   order by g.activo desc, (m.nombre <> '') desc, g.nombre
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
revoke all on function public.soporte_yo() from public, anon, authenticated;

-- ¿Quien mira puede ver este ticket? Devuelve si es del equipo; error si no puede
create or replace function public.soporte_acceso(p_id uuid, yo jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  dueno text;
begin
  if yo is null then
    raise exception 'sin permiso';
  end if;
  select email into dueno from public.soporte_tickets where id = p_id;
  if not found then
    raise exception 'Ese ticket ya no existe.';
  end if;
  if not (yo->>'admin')::boolean and dueno <> yo->>'email' then
    raise exception 'sin permiso';
  end if;
  return (yo->>'admin')::boolean;
end;
$$;
revoke all on function public.soporte_acceso(uuid, jsonb) from public, anon, authenticated;

-- Los tickets: el admin ve todos (o los de una persona); cada persona, los suyos
create or replace function public.soporte_tickets(p_email text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  yo  jsonb := public.soporte_yo();
  adm boolean;
begin
  if yo is null then
    raise exception 'sin permiso';
  end if;
  adm := (yo->>'admin')::boolean;
  return (
    select coalesce(jsonb_agg(x order by x.updated_at desc), '[]'::jsonb)
      from (
        select t.id, t.email, t.nombre, t.grupo, t.asunto, t.categoria, t.estado, t.created_at, t.updated_at, t.ultimo_de_equipo,
               (select count(*) from public.soporte_mensajes m where m.ticket_id = t.id) as mensajes,
               (select left(m.texto, 160) from public.soporte_mensajes m where m.ticket_id = t.id order by m.created_at desc limit 1) as ultimo_texto,
               -- Espera respuesta del equipo: abierto y lo último lo escribió la persona
               (t.estado = 'abierto' and not t.ultimo_de_equipo) as espera_equipo,
               -- Sin leer para quien mira: lo último lo escribió el otro lado y no lo ha abierto
               case when adm then not t.ultimo_de_equipo and (t.leido_equipo is null or t.leido_equipo < t.updated_at)
                    else t.ultimo_de_equipo and (t.leido_persona is null or t.leido_persona < t.updated_at) end as nuevo
          from public.soporte_tickets t
         where (adm and (p_email is null or t.email = lower(btrim(p_email))))
            or (not adm and t.email = yo->>'email')
         order by t.updated_at desc
         limit 500
      ) x
  );
end;
$$;

-- Abrir un ticket. El admin lo abre a nombre de una persona (p_email) y su mensaje va como del equipo
create or replace function public.soporte_abrir(p_asunto text, p_categoria text, p_texto text, p_email text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo   jsonb := public.soporte_yo();
  adm  boolean;
  asu  text := left(btrim(coalesce(p_asunto, '')), 140);
  cat  text := btrim(coalesce(p_categoria, ''));
  txt  text := btrim(coalesce(p_texto, ''));
  correo text; nom text; gru text;
  r record;
  nuevo uuid;
begin
  if yo is null then
    raise exception 'sin permiso';
  end if;
  adm := (yo->>'admin')::boolean;
  if char_length(asu) < 3 then
    raise exception 'Escribe el asunto del ticket.';
  end if;
  if char_length(txt) < 2 then
    raise exception 'Cuéntanos en qué te ayudamos.';
  end if;
  if char_length(txt) > 4000 then
    raise exception 'El mensaje es muy largo (máximo 4.000 caracteres).';
  end if;
  if cat not in ('Acceso a la plataforma', 'Clases en vivo', 'Cursos', 'Tareas y quizzes', 'Facturación', 'Otro') then
    cat := 'Otro';
  end if;

  if adm then
    correo := lower(btrim(coalesce(p_email, '')));
    if correo = '' then
      raise exception 'Elige a la persona del ticket.';
    end if;
    select m.nombre, g.nombre as grupo into r
      from public.miembros m join public.grupos g on g.id = m.grupo_id
     where m.email = correo
     order by m.activo desc, g.activo desc, g.nombre limit 1;
    if not found then
      raise exception 'Esa persona no está en ningún grupo.';
    end if;
    nom := coalesce(nullif(btrim(r.nombre), ''), initcap(replace(split_part(correo, '@', 1), '.', ' ')));
    gru := r.grupo;
  else
    correo := yo->>'email'; nom := yo->>'nombre'; gru := yo->>'grupo';
    if (select count(*) from public.soporte_tickets where email = correo and created_at > now() - interval '1 day') >= 5 then
      raise exception 'Ya abriste varios tickets hoy. Escribe en uno de los que tienes abiertos.';
    end if;
  end if;

  insert into public.soporte_tickets (email, nombre, grupo, asunto, categoria, ultimo_de_equipo, leido_persona, leido_equipo)
  values (correo, nom, gru, asu, cat, adm, case when adm then null else now() end, case when adm then now() else null end)
  returning id into nuevo;
  insert into public.soporte_mensajes (ticket_id, es_equipo, autor, autor_email, texto)
  values (nuevo, adm, yo->>'nombre', yo->>'email', txt);
  return nuevo;
end;
$$;

-- La conversación de un ticket. Abrirla la marca como leída para quien mira
create or replace function public.soporte_mensajes(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo  jsonb := public.soporte_yo();
  adm boolean := public.soporte_acceso(p_id, yo);
begin
  if adm then
    update public.soporte_tickets set leido_equipo = now() where id = p_id;
  else
    update public.soporte_tickets set leido_persona = now() where id = p_id;
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', m.id, 'es_equipo', m.es_equipo, 'autor', m.autor, 'texto', m.texto, 'created_at', m.created_at,
             'foto', case when m.es_equipo then (select a.foto_url from public.admins a where a.email = m.autor_email) end,
             'mio', m.autor_email = yo->>'email')
           order by m.created_at), '[]'::jsonb)
      from public.soporte_mensajes m where m.ticket_id = p_id
  );
end;
$$;

-- Responder. Si la persona escribe en un ticket cerrado, se vuelve a abrir
create or replace function public.soporte_responder(p_id uuid, p_texto text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo  jsonb := public.soporte_yo();
  adm boolean := public.soporte_acceso(p_id, yo);
  txt text := btrim(coalesce(p_texto, ''));
begin
  if char_length(txt) < 1 then
    raise exception 'Escribe tu respuesta.';
  end if;
  if char_length(txt) > 4000 then
    raise exception 'El mensaje es muy largo (máximo 4.000 caracteres).';
  end if;
  if not adm and (select count(*) from public.soporte_mensajes
                   where autor_email = yo->>'email' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Escribiste muchos mensajes seguidos. Espera un rato.';
  end if;
  insert into public.soporte_mensajes (ticket_id, es_equipo, autor, autor_email, texto)
  values (p_id, adm, yo->>'nombre', yo->>'email', txt);
  update public.soporte_tickets
     set updated_at = now(), ultimo_de_equipo = adm,
         leido_equipo  = case when adm then now() else leido_equipo end,
         leido_persona = case when adm then leido_persona else now() end,
         estado = case when adm then estado else 'abierto' end
   where id = p_id;
end;
$$;

-- Cerrar o reabrir (la persona, los suyos; el admin, cualquiera)
create or replace function public.soporte_estado(p_id uuid, p_estado text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  yo jsonb := public.soporte_yo();
begin
  perform public.soporte_acceso(p_id, yo);
  if p_estado not in ('abierto', 'cerrado') then
    raise exception 'Ese estado no existe.';
  end if;
  update public.soporte_tickets set estado = p_estado where id = p_id;
end;
$$;

-- Para el número del menú: el admin, lo que espera respuesta; la persona, respuestas sin leer
create or replace function public.soporte_pendientes()
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  yo jsonb := public.soporte_yo();
begin
  if yo is null then
    return 0;
  end if;
  if (yo->>'admin')::boolean then
    return (select count(*) from public.soporte_tickets where estado = 'abierto' and not ultimo_de_equipo);
  end if;
  return (select count(*) from public.soporte_tickets
           where email = yo->>'email' and ultimo_de_equipo and (leido_persona is null or leido_persona < updated_at));
end;
$$;

grant execute on function
  public.soporte_tickets(text), public.soporte_abrir(text, text, text, text), public.soporte_mensajes(uuid),
  public.soporte_responder(uuid, text), public.soporte_estado(uuid, text), public.soporte_pendientes()
  to anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: debe decir "soporte_tickets" y "soporte_mensajes"
select to_regclass('public.soporte_tickets') as tabla_tickets, to_regclass('public.soporte_mensajes') as tabla_mensajes;
