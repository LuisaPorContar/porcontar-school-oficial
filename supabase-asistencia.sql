-- ================================================================
-- PorContar Academia · Asistencia por encuentro y correos desde Gmail
--
--   · asistencia: una fila por persona activa del grupo y por encuentro
--     (la parte 1 de una clase, o la parte 2 cuando la clase va partida).
--     Con aparecer basta. Cuentan estudiantes y responsables.
--   · asistencia_cruzar: cruza la lista pegada (celdas del Excel de Meet,
--     nombres o correos) con las personas del grupo. Vive aquí para que la
--     app y Claude crucen exactamente igual.
--   · asistencia_guardar: guarda un encuentro.
--   · asistencia_correo: arma el correo para la empresa (para, copia,
--     asunto y texto). El correo NO sale de aquí: la app lo abre ya escrito
--     en el Gmail de quien lo manda y esa persona le da Enviar.
--   · envios: el registro de cada correo preparado (quién, cuándo, a quién).
--     Lo usarán también las encuestas, el diagnóstico y el aviso de contenido.
--
-- Solo las admin leen y escriben (también Claude por el MCP, con la llave).
-- Va DESPUÉS de supabase-clases.sql y supabase-admins.sql.
-- Supabase → SQL Editor → New query → pegar TODO → Run. Se puede correr
-- varias veces: no borra asistencia guardada. No lleva la clave de admin.
-- ================================================================

-- 1) Tablas -----------------------------------------------------------
create table if not exists public.asistencia (
  grupo_id       uuid not null references public.grupos(id) on delete cascade,
  sesion_id      text not null references public.reto_sesiones(id) on delete cascade,
  parte          smallint not null check (parte in (1, 2)),
  email          text not null,
  presente       boolean not null default false,
  fuente         text not null default 'lista' check (fuente in ('lista', 'manual')),
  actualizado_el timestamptz not null default now(),
  primary key (grupo_id, sesion_id, parte, email)
);
alter table public.asistencia enable row level security;
drop policy if exists "asistencia admin" on public.asistencia;
create policy "asistencia admin" on public.asistencia
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.asistencia to anon, authenticated;

create table if not exists public.envios (
  id         bigserial primary key,
  tipo       text not null check (tipo in ('asistencia', 'encuesta', 'diagnostico', 'contenido', 'bienvenida')),
  grupo_id   uuid references public.grupos(id) on delete cascade,
  sesion_id  text references public.reto_sesiones(id) on delete set null,
  parte      smallint,
  para       text[] not null default '{}',
  asunto     text not null default '',
  por        text not null default coalesce(public.admin_email(), 'Claude'),
  creado_el  timestamptz not null default now()
);
create index if not exists envios_grupo_idx on public.envios (grupo_id, tipo, creado_el desc);
alter table public.envios enable row level security;
drop policy if exists "envios admin" on public.envios;
create policy "envios admin" on public.envios
  for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.envios to anon, authenticated;
grant usage, select on sequence public.envios_id_seq to anon, authenticated;

-- 2) Texto sin tildes ni mayúsculas, y sus palabras ---------------------
create or replace function public.asis_norm(t text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
           translate(lower(coalesce(t, '')), 'áéíóúüñàèìòùâêîôûäëïöç', 'aeiouunaeiouaeiouaeioc'),
           '[^a-z0-9 ]+', ' ', 'g'));
$$;

-- Palabras de un nombre: sin números y de 2 letras o más
create or replace function public.asis_toks(t text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(w), '{}')
    from unnest(regexp_split_to_array(public.asis_norm(t), '\s+')) w
   where w <> '' and w !~ '[0-9]' and length(w) >= 2;
$$;

-- "martes 10 de noviembre"
create or replace function public.asis_fecha(d date)
returns text
language sql
immutable
as $$
  select case when d is null then 'sin fecha' else
    (array['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])[extract(isodow from d)::int]
    || ' ' || extract(day from d)::int || ' de ' ||
    (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from d)::int]
  end;
$$;

-- 3) Cruzar la lista pegada con el grupo --------------------------------
-- Devuelve { encontrados: [{email, nombre, linea, por}], sin_cruzar: [{linea, opciones:[email]}] }
-- Orden: el correo; si no, el nombre completo; si no, el primer nombre con
-- otra palabra de su nombre (p. ej. el primer apellido). Si una línea
-- puede ser de dos personas, va a sin_cruzar con esas dos como opciones.
create or replace function public.asistencia_cruzar(p_grupo uuid, p_texto text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  linea   text;
  l       text;
  correo  text;
  toks    text[];
  cands   text[];
  por     text;
  n       int := 0;
  ya      text[] := '{}';
  enc     jsonb := '[]';
  sin     jsonb := '[]';
  re_mail constant text := '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}';
  encabez constant text[] := array['nombre','nombres','apellido','apellidos','correo','email','mail','name',
    'first','last','duracion','duration','participante','participantes','asistente','asistentes','joined','exited','hora','time'];
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;

  for linea in select x from regexp_split_to_table(coalesce(p_texto, ''), E'\r?\n') x loop
    l := btrim(regexp_replace(linea, E'[\\t;,|]+', ' ', 'g'));
    continue when l = '';
    n := n + 1;
    exit when n > 3000;
    correo := lower((regexp_match(l, re_mail))[1]);
    toks := public.asis_toks(regexp_replace(l, re_mail, ' ', 'g'));
    -- Encabezados del Excel ("Nombre", "Correo", "Duración"…)
    continue when correo is null and toks && encabez;
    continue when correo is null and cardinality(toks) = 0;

    cands := '{}'; por := null;
    if correo is not null then
      select coalesce(array_agg(m.email), '{}') into cands
        from public.miembros m where m.grupo_id = p_grupo and m.activo and m.email = correo;
      if cardinality(cands) > 0 then por := 'correo'; end if;
    end if;

    if cardinality(cands) = 0 and cardinality(toks) > 0 then
      -- Todas las palabras de su nombre están en la línea (gana el nombre más largo)
      select coalesce(array_agg(z.email), '{}') into cands from (
        select m.email, cardinality(public.asis_toks(m.nombre)) c,
               max(cardinality(public.asis_toks(m.nombre))) over () mx
          from public.miembros m
         where m.grupo_id = p_grupo and m.activo
           and cardinality(public.asis_toks(m.nombre)) > 0
           and public.asis_toks(m.nombre) <@ toks) z
       where z.c = z.mx;
      if cardinality(cands) > 0 then por := 'nombre'; end if;
    end if;

    if cardinality(cands) = 0 and cardinality(toks) > 0 then
      -- Primer nombre + otra palabra de su nombre (p. ej. el primer apellido)
      select coalesce(array_agg(m.email), '{}') into cands
        from public.miembros m
       where m.grupo_id = p_grupo and m.activo
         and cardinality(public.asis_toks(m.nombre)) > 1
         and (public.asis_toks(m.nombre))[1] = any(toks)
         and (public.asis_toks(m.nombre))[2:] && toks;
      if cardinality(cands) > 0 then por := 'nombre y apellido'; end if;
    end if;

    if cardinality(cands) = 1 then
      if not (cands[1] = any(ya)) then
        ya := ya || cands[1];
        enc := enc || jsonb_build_object('email', cands[1], 'linea', left(l, 200), 'por', por,
          'nombre', (select m.nombre from public.miembros m where m.grupo_id = p_grupo and m.email = cands[1]));
      end if;
    else
      sin := sin || jsonb_build_object('linea', left(l, 200), 'opciones', to_jsonb(cands));
    end if;
  end loop;

  return jsonb_build_object('encontrados', enc, 'sin_cruzar', sin);
end;
$$;
revoke all on function public.asistencia_cruzar(uuid, text) from public;
grant execute on function public.asistencia_cruzar(uuid, text) to anon, authenticated;

-- 4) Guardar un encuentro ------------------------------------------------
-- Escribe una fila por cada persona activa del grupo: presente si su correo
-- viene en p_presentes. Volver a guardar reemplaza lo de ese encuentro.
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

  delete from public.asistencia a
   where a.grupo_id = p_grupo and a.sesion_id = p_sesion and a.parte = p_parte;
  insert into public.asistencia (grupo_id, sesion_id, parte, email, presente, fuente)
  select p_grupo, p_sesion, p_parte, m.email, m.email = any(pres),
         case when p_fuente = 'manual' then 'manual' else 'lista' end
    from public.miembros m
   where m.grupo_id = p_grupo and m.activo;

  select count(*), count(*) filter (where presente) into total, si
    from public.asistencia a
   where a.grupo_id = p_grupo and a.sesion_id = p_sesion and a.parte = p_parte;
  return jsonb_build_object('presentes', si, 'total', total);
end;
$$;
revoke all on function public.asistencia_guardar(uuid, text, int, text[], text) from public;
grant execute on function public.asistencia_guardar(uuid, text, int, text[], text) to anon, authenticated;

-- 5) El correo para la empresa -------------------------------------------
-- Para: el contacto de la ficha y los responsables activos.
-- Copia: las admin activas, menos la que lo está mandando.
create or replace function public.asistencia_correo(p_grupo uuid, p_sesion text, p_parte int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g        public.grupos%rowtype;
  s        public.reto_sesiones%rowtype;
  c        public.cronograma%rowtype;
  yo       text := public.admin_email();
  para     text[];
  cc       text[];
  partida  boolean;
  dia      date;
  enc      text;
  vinieron text;
  faltaron text;
  acum     text;
  n_si     int;
  n_total  int;
  tomados  int;
  saludo   text;
  cuerpo   text;
begin
  if not public.is_admin() then raise exception 'sin permiso'; end if;
  select * into g from public.grupos where id = p_grupo;
  if not found then raise exception 'no existe el grupo'; end if;
  select * into s from public.reto_sesiones where id = p_sesion;
  if not found then raise exception 'no existe la clase'; end if;
  select * into c from public.cronograma where grupo_id = p_grupo and sesion_id = p_sesion;

  select count(*), count(*) filter (where a.presente) into n_total, n_si
    from public.asistencia a
   where a.grupo_id = p_grupo and a.sesion_id = p_sesion and a.parte = p_parte;
  if n_total = 0 then raise exception 'todavía no se ha tomado la asistencia de este encuentro'; end if;

  partida := c.fecha2 is not null;
  dia := case when p_parte = 2 then c.fecha2 else c.fecha end;
  enc := s.corto || ': ' || s.nombre || case when partida then ' (parte ' || p_parte || ')' else '' end
         || ' · ' || public.asis_fecha(dia);

  select array_agg(distinct e) into para from (
    select lower(btrim(g.contacto_email)) e where coalesce(btrim(g.contacto_email), '') <> ''
    union
    select m.email from public.miembros m where m.grupo_id = p_grupo and m.activo and m.rol = 'responsable'
  ) x;
  select array_agg(a.email order by a.email) into cc
    from public.admins a where a.activo and a.email is distinct from yo and not (a.email = any(coalesce(para, '{}')));

  select string_agg('• ' || coalesce(nullif(btrim(m.nombre), ''), a.email), E'\n' order by lower(coalesce(nullif(btrim(m.nombre), ''), a.email)))
         filter (where a.presente),
         string_agg('• ' || coalesce(nullif(btrim(m.nombre), ''), a.email), E'\n' order by lower(coalesce(nullif(btrim(m.nombre), ''), a.email)))
         filter (where not a.presente)
    into vinieron, faltaron
    from public.asistencia a
    left join public.miembros m on m.grupo_id = a.grupo_id and m.email = a.email
   where a.grupo_id = p_grupo and a.sesion_id = p_sesion and a.parte = p_parte;

  -- Acumulado: de los encuentros ya tomados, a cuántos vino cada persona activa
  select count(*) into tomados from (
    select distinct a.sesion_id, a.parte from public.asistencia a where a.grupo_id = p_grupo) t;
  select string_agg('• ' || nom || ' — ' || vino || ' de ' || de || ' (' || round(100.0 * vino / nullif(de, 0)) || ' %)',
                    E'\n' order by lower(nom))
    into acum
    from (
      select coalesce(nullif(btrim(m.nombre), ''), m.email) nom,
             count(*) filter (where a.presente) vino, count(a.*) de
        from public.miembros m
        join public.asistencia a on a.grupo_id = m.grupo_id and a.email = m.email
       where m.grupo_id = p_grupo and m.activo
       group by m.email, m.nombre
    ) z;

  saludo := 'Hola' || coalesce(', ' || nullif(split_part(btrim(coalesce(g.contacto_nombre, '')), ' ', 1), ''), '') || ':';
  cuerpo := saludo || E'\n\n'
    || 'Les compartimos la asistencia de ' || enc || '.' || E'\n\n'
    || 'Asistieron (' || n_si || ' de ' || n_total || '):' || E'\n' || coalesce(vinieron, '• Nadie') || E'\n\n'
    || 'No asistieron (' || (n_total - n_si) || '):' || E'\n' || coalesce(faltaron, '• Nadie, vinieron todos') || E'\n\n'
    || 'Acumulado del programa (' || tomados || ' ' || case when tomados = 1 then 'encuentro' else 'encuentros' end || ' hasta hoy):' || E'\n'
    || coalesce(acum, '') || E'\n\n'
    || 'Cualquier duda, con gusto la resolvemos.' || E'\n\n'
    || 'Equipo PorContar' || E'\n' || 'Academia PorContar · academia.porcontar.com';

  return jsonb_build_object(
    'para', coalesce(to_jsonb(para), '[]'::jsonb),
    'cc', coalesce(to_jsonb(cc), '[]'::jsonb),
    'asunto', 'Asistencia ' || s.corto || case when partida then ' (parte ' || p_parte || ')' else '' end || ' · ' || g.nombre,
    'cuerpo', cuerpo,
    'presentes', n_si, 'total', n_total);
end;
$$;
revoke all on function public.asistencia_correo(uuid, text, int) from public;
grant execute on function public.asistencia_correo(uuid, text, int) to anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: las dos tablas y las tres funciones deben decir sí
select
  (select case when count(*) = 2 then 'sí' else 'no' end from information_schema.tables
    where table_schema = 'public' and table_name in ('asistencia', 'envios'))        as tablas,
  (select case when count(*) = 3 then 'sí' else 'no' end from pg_proc
    where proname in ('asistencia_cruzar', 'asistencia_guardar', 'asistencia_correo')) as funciones;
