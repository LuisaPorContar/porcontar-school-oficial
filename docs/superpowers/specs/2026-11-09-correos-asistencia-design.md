# Asistencia, encuestas y diagnóstico (correos desde Gmail)

**Fecha:** 2026-11-09 · **Estado:** construido; falta correr el SQL, publicar y probar con un grupo real.
Reemplaza la versión anterior de este documento, que mandaba los correos por el buzón de Hostinger. Ximena lo corrigió así:

## Regla de correos
- **Automáticos, solo los recordatorios de clase** (1 día y 15 minutos antes). Van por Hostinger Reach. Están pendientes: primero hay que probar que Reach los puede mandar.
- **Manuales, todo lo demás** (asistencia, encuestas, diagnóstico, «ya subí el contenido», bienvenida). Un clic abre el correo ya escrito en el Gmail de quien lo manda (Ximena o Luisa), y esa persona le da Enviar.
- **hola@comercial.porcontar.com** es solo para prospección en frío. No se usa en la Academia.

## Asistencia (`supabase-asistencia.sql`, `public/asistencia.js`)
- **Encuentros:** una fila por persona activa y encuentro. Un encuentro es la parte 1 o, si la clase va partida, la parte 2.
- **Quién cuenta:** con aparecer basta. Cuentan estudiantes y responsables.
- **Cruce de la lista:** lo hace `asistencia_cruzar` en la base, así la app y Claude cruzan igual. Busca por correo; si no, por nombre completo; si no, por primer nombre y otra palabra del nombre. Ignora tildes, mayúsculas y los encabezados del Excel de Meet. Las líneas dudosas quedan para elegir a mano.
- **Correo:** `asistencia_correo` arma para quién va, la copia, el asunto y el texto.
  - Para: el contacto de la ficha y los responsables.
  - Copia: las otras admin.
  - Texto: quiénes vinieron, quiénes no y el acumulado.
- **Registro:** cada correo preparado queda en `envios`.

## Encuestas de satisfacción (`supabase-formularios.sql`, `public/formularios.js`)
- **Cuántas:** 5 por grupo, sin importar si las clases van partidas. La admin abre cada una desde el inicio de la empresa y elige de qué clase es.
- **Preguntas:**
  - Instructor en general (1 a 5).
  - Contenido (1 a 5).
  - Instructor interesante y atractivo (1 a 5).
  - Material (1 a 5).
  - ¿Cumplió tus expectativas? (Sí, Parcialmente o No).
  - Un comentario opcional.
- **Quién responde:** cada persona, una vez, dentro de la app.
- **Resultados:** promedios, expectativas, comentarios, respuestas por persona y quién falta.

## Diagnóstico
- **Preguntas:** las 20 del 2026-11-03. «La cooperativa» se cambió por el nombre de la empresa. La respuesta se guarda junto con su pregunta.
- **Dónde aparece:** al estudiante, arriba de su inicio. El enlace del correo (`?f=diagnostico`) lo abre solo al entrar.
- **Lo que ve la admin:** las respuestas por persona, quién falta y la descarga para Excel.

## Interruptores
`extras_off` de cada grupo ahora acepta `diagnostico` y `encuestas`; los dos aparecen en «Editar empresa». Maper queda sin diagnóstico.

## Pruebas hechas
- **SQL:** se probó en una base local. Revisé permisos (sin admin no se hace nada), el cruce de listas reales, rangos de 1 a 5, encuestas cerradas, quién falta y que se pueda correr dos veces.
- **App:** se probó en Chrome con datos simulados, de punta a punta:
  - el estudiante responde el diagnóstico y la encuesta;
  - la admin ve resultados, abre una encuesta y abre en Gmail el aviso, el recordatorio y la asistencia;
  - se toma la asistencia pegando una lista.

## Pendiente
- Herramientas de Claude (MCP) para asistencia, encuestas y diagnóstico.
- Recordatorios automáticos por Reach (primero, la prueba).
- Dashboard con métricas claras.
