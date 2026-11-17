-- =====================================================================
-- Documentos en los recursos (2026-11-17)
-- El almacén de la Academia acepta también Excel, Word y PowerPoint
-- (sin macros) y CSV, además de lo que ya aceptaba. Suma, no quita.
-- Correr en Supabase → SQL Editor. Se puede correr las veces que sea.
-- (supabase-auditoria.sql repite este bloque, para que no se pierda.)
-- =====================================================================
update storage.buckets
   set allowed_mime_types = array(
         select distinct t from unnest(coalesce(allowed_mime_types, '{}') || array[
           'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
           'application/vnd.ms-excel',
           'text/csv',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
           'application/msword',
           'application/vnd.openxmlformats-officedocument.presentationml.presentation',
           'application/vnd.ms-powerpoint']) as t
         order by t)
 where id = 'videos-academia';

-- Comprobación: las tres columnas deben decir «sí»
select
  case when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' = any(allowed_mime_types) then 'sí' else 'no' end as excel,
  case when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' = any(allowed_mime_types) then 'sí' else 'no' end as word,
  case when 'application/vnd.openxmlformats-officedocument.presentationml.presentation' = any(allowed_mime_types) then 'sí' else 'no' end as powerpoint
  from storage.buckets where id = 'videos-academia';
