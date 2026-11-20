-- =====================================================================
-- Borrar los prompts duplicados del catálogo (2026-11-20)
-- Sirve igual para la Academia PorContar y para Biz Nation.
--
-- Dos prompts son el mismo si su título es igual sin contar mayúsculas,
-- tildes, signos ni espacios dobles. De cada grupo de iguales:
--   · si alguno está prendido, se borran los apagados (los prendidos quedan todos);
--   · si todos están apagados, queda el más antiguo y se borran los demás.
-- Nunca se borra un prompt prendido.
--
-- Antes de borrar, cada uno se copia a la tabla skills_respaldo_duplicados,
-- así se puede recuperar. Al final salen los que se borraron.
-- =====================================================================

-- El respaldo: misma forma que skills, cerrado para todos menos la base
create table if not exists public.skills_respaldo_duplicados as
  select s.*, now() as borrado_el from public.skills s where false;
alter table public.skills_respaldo_duplicados enable row level security;
revoke all on public.skills_respaldo_duplicados from anon, authenticated;

drop table if exists _dup;
create temp table _dup as
with n as (
  select s.id, s.visible, s.created_at,
         btrim(regexp_replace(translate(lower(s.title), 'áéíóúüñàèìòù', 'aeiouunaeiou'), '[^a-z0-9]+', ' ', 'g')) as k
    from public.skills s
)
select n.id
  from n
 where n.visible is not true
   and exists (select 1 from n o where o.k = n.k and o.id <> n.id)
   and (exists (select 1 from n o where o.k = n.k and o.visible)
        or n.id <> (select o.id from n o where o.k = n.k order by o.created_at, o.id limit 1));

insert into public.skills_respaldo_duplicados
select s.*, now() from public.skills s where s.id in (select id from _dup);

delete from public.skills s where s.id in (select id from _dup);

-- Los que se borraron en esta corrida (quedan en skills_respaldo_duplicados)
select r.id, r.title, r.area
  from public.skills_respaldo_duplicados r
 where r.borrado_el = now()
 order by r.title;
