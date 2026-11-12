-- ================================================================
-- PorContar Academia · Un solo control por clase: el candado
--
-- Antes cada sesión tenía dos controles que no iban de la mano:
--   · Encendida/Apagada (reto_sesiones.visible), igual para todas las
--     empresas: apagada, la clase desaparecía.
--   · Candado por grupo (clases_abiertas): cerrada, la clase se ve con
--     candado y sin contenido.
-- Desde ahora solo existe el candado. El interruptor de «Sesiones del
-- reto», en el espacio de una empresa, abre o cierra la clase para ella.
--
-- Lo que hace este archivo: cada sesión que estaba Apagada queda CERRADA
-- para todas las empresas (se ve con candado, sin contenido) y deja de
-- estar apagada. La columna visible se queda, pero la app ya no la usa.
--
-- Va DESPUÉS de supabase-clases.sql. Supabase → SQL Editor → New query →
-- pegar TODO → Run. Se puede correr varias veces. No lleva la clave de admin.
-- ================================================================

-- 1) Lo apagado queda cerrado en todas las empresas
delete from public.clases_abiertas a
 using public.reto_sesiones s
 where a.sesion_id = s.id
   and s.visible = false;

-- 2) Ninguna sesión queda apagada: lo que se ve lo decide el candado
update public.reto_sesiones
   set visible = true, updated_at = now()
 where visible = false;

notify pgrst, 'reload schema';

-- Comprobación: apagadas debe decir 0
select
  (select count(*) from public.reto_sesiones where visible = false) as apagadas,
  (select count(*) from public.clases_abiertas)                     as clases_abiertas;
