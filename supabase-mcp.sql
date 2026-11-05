-- ================================================================
-- PorContar Academia · Registro del MCP (conectar la Academia a Claude)
--
-- La función supabase/functions/mcp-academia escribe aquí cada
-- herramienta que usa la IA: qué pidió, con qué datos y si salió bien.
-- Sirve para auditar lo que hizo y para deshacer a mano si hace falta.
-- Las contraseñas de grupo nunca se guardan (salen como «(oculta)»).
--
-- Va DESPUÉS de los demás archivos. Correrlo ANTES de publicar la función.
-- Supabase → SQL Editor → New query → pegar TODO → Run.
-- Se puede correr varias veces. No lleva ninguna clave.
-- ================================================================

create table if not exists public.mcp_acciones (
  id          bigserial primary key,
  herramienta text not null,
  argumentos  jsonb not null default '{}'::jsonb,
  ok          boolean not null,
  resultado   text not null default '',       -- resumen o error (recortado)
  fecha       timestamptz not null default now()
);
create index if not exists mcp_acciones_fecha_idx on public.mcp_acciones (fecha desc);

-- Solo la escribe la función (service_role). Desde el navegador nadie la lee
alter table public.mcp_acciones enable row level security;

-- La función llama las funciones de admin con la llave de app_config:
-- tiene que existir, o todo lo de grupos y personas responde «sin permiso».
select (select count(*) from public.app_config where key = 'admin_key' and value <> '') as llave_admin_lista,
       to_regclass('public.mcp_acciones') as tabla_registro;
