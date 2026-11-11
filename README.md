# PorContar Academia Oficial

Muro de la **Academia de PorContar**. Sitio estático, sin build ni dependencias que instalar: se publica la carpeta `public` y funciona.

## Qué hay en el menú

- **Gestión** (solo admin y responsables)
  - **Empresas y cohortes** — el admin crea cada grupo (B2B o B2C) con su contraseña y su fecha de vencimiento, y pega los correos de las personas.
  - **Panel de avance** — quién entró, qué videos vio, qué tareas completó y cómo le fue en los quizzes. Se actualiza solo cada minuto y se descarga para Excel. El responsable de una empresa ve solo el de su equipo.
- **Sesiones** — las clases, cada una con sus publicaciones de texto, video, imagen o PDF. Cada estudiante puede ocultar las que no quiere ver (ojito).
- **Extras**
  - **Trabajo autónomo** — las tareas de cada sesión, con el avance de cada persona.
  - **Quizzes** — para evaluar lo aprendido.
  - **Catálogo de prompts** — fichas de skills por área; el admin las prende y apaga, o las sube desde un `.md`.
  - **Vocabulario y términos** — la guía embebida.
  - **Guardados**. Las dudas van a la **Comunidad** (Preguntas frecuentes se quitó). Los videos cortos van en **Cursos** (el interruptor «Cursos» de cada grupo).
  - **Configurar Claude** — oculto por ahora (`hidden` en `index.html`).

## Accesos

| Quién | Cómo entra | Qué ve |
|---|---|---|
| Estudiante | la raíz del sitio, con su correo y la contraseña de su empresa o cohorte | lo dirigido a todos y a sus grupos |
| Responsable | igual que un estudiante (rol `responsable` en su grupo) | lo mismo, más el panel de su equipo |
| Admin | la raíz + `?admin=LA-CLAVE` una vez (la clave se borra de la URL al entrar) | todo, y administra grupos |

La clave de admin **no está en el código**: está en `supabase-academia.sql`, que no se sube al repositorio.

**A quién va cada contenido.** Cada publicación, quiz y prompt tiene «¿Quién lo ve?»: sin marcar nada lo ven todos los grupos (también los que se creen después); si no, *todas las empresas*, *todas las cohortes* o grupos puntuales. Lo filtra la base de datos, no el navegador. Con «Ver como» el admin revisa el muro como lo ve cada grupo.

**Vencimiento.** Cuando pasa la fecha de un grupo, o el admin desactiva a una persona, el acceso se corta de inmediato, incluso con la sesión abierta.

## Estructura

```
public/
├── index.html             estructura y sprite de iconos SVG
├── styles.css             identidad PorContar (azul #2B4FE8, amarillo #FFF401)
├── app.js                 publicaciones, skills, quizzes, FAQ, empresas, panel y almacenamiento
├── programa.js            inicio y cronograma, sesiones del reto y grabaciones con el reproductor
├── config.js              URL y clave pública de Supabase
├── sesion.js              sesión del estudiante y clave de admin (compartido)
├── trabajo-autonomo.html  tareas de cada sesión (+ trabajo-autonomo.js)
├── resumen.html           guía de vocabulario y términos
├── configuracion.html     guía para configurar Claude
├── marca/                 logos, burbuja (favicon) y foto
└── vendor/                cliente de Supabase servido desde el propio proyecto
```

Las sesiones del reto se administran desde la app (botón «Editar» junto a Sesiones). La lista al inicio de `app.js` es solo el respaldo del modo local.

## Datos

Supabase: proyecto `lcbonixjumchbhffyxee`. Para montar la base, en Supabase → SQL Editor, en este orden:

1. `supabase-academia.sql` — publicaciones, prompts, quizzes, tareas y la clave de admin (no está en el repositorio).
2. `supabase-empresas.sql` — empresas y cohortes, acceso con correo, audiencias, videos vistos y panel.
3. `supabase-fase1.sql` — ficha de empresa (logo, contacto, WhatsApp), sesiones editables, cronograma por empresa y grabaciones con progreso.

Después, `supabase-agenda.sql` — la sesión QA antes de la Presentación y la 2.ª parte de cada clase en el cronograma, para la agenda automática de «Editar cronograma» (1 clase de 2 horas por semana, o 2 encuentros de 1 hora).

`supabase-comunidad-programar.sql` (después de `supabase-comunidad.sql`) — en la Comunidad, publicaciones programadas (entre 1 minuto y 90 días) y encuestas con fecha de cierre.

`supabase-clases.sql` (después de `supabase-formatos.sql`, `supabase-cursos.sql` y `supabase-agenda.sql`) — las tres modalidades de grupo (**Estándar virtual**, **Estándar presencial** y **Hiperpersonalizado**), el **candado por grupo** (cada clase nace cerrada y el admin la abre desde el menú, en el espacio del grupo; lo cerrado no lo entrega la base) y la **clase** de cada prompt y de cada cápsula de curso. En el presencial no hay grabaciones: en cada clase se ven las cápsulas marcadas con esa clase. La primera vez deja abiertas las clases de los grupos que ya existían.

`supabase-candado-unico.sql` (después de `supabase-clases.sql`) — **un solo control por clase**: se quita el Encendida/Apagada de las sesiones y queda solo el candado por empresa. En «Sesiones del reto», dentro del espacio de una empresa, el interruptor es ese mismo candado (Abierta/Cerrada para esa empresa); en el espacio general dice en cuántas empresas está abierta. Las sesiones que estaban apagadas quedan cerradas para todas las empresas.

`supabase-asistencia.sql` (después de `supabase-candado-unico.sql`) — **asistencia por encuentro**. En cada clase, dentro del espacio de una empresa, el bloque «Asistencia» tiene un renglón por encuentro (la clase, o sus dos partes si va partida). «Tomar asistencia»: se pega la lista (celdas del Excel de Meet, nombres o correos), la base la cruza con las personas del grupo (correo, nombre completo, o nombre con apellido, sin tildes ni mayúsculas) y se revisa con casillas. Con aparecer basta; cuentan estudiantes y responsables. «Enviar a la empresa» abre el correo ya escrito **en el Gmail de quien lo toca** (para el contacto de la ficha y los responsables, copia a las otras admin), con quiénes vinieron, quiénes no y el acumulado del programa. Queda registrado en la tabla `envios`.

`supabase-formularios.sql` (después de `supabase-asistencia.sql`) — **diagnóstico y encuestas de satisfacción**, dentro de la app (sin escribir el nombre: la app ya sabe quién es). El estudiante ve arriba de su inicio lo que le falta responder; los enlaces de los correos (`?f=diagnostico`, `?f=encuesta`) lo abren solo al entrar. En el inicio de cada empresa, el admin ve cuántos respondieron, las respuestas (el diagnóstico se descarga para Excel), abre o cierra cada una de las **5 encuestas** eligiendo de qué clase es, y con un botón abre en su Gmail el aviso o el recordatorio a quienes faltan (en copia oculta). Los dos se apagan por empresa en «Editar empresa»; Maper queda sin diagnóstico.

`supabase-participacion.sql` (después de `supabase-puntos.sql`) — **participación y asistencia por empresa**, solo para las admin. En el inicio de cada empresa, una tabla con una fila por persona: a qué encuentros vino (Kickoff, C1, C2…, y las dos partes si la clase va partida) y su %, qué encuestas respondió, si hizo el diagnóstico, su mejor puntaje en cada quiz, los puntos extra y el total. Arriba, los promedios del grupo. Se busca por nombre, se ordena tocando la columna y se descarga para Excel.

`supabase-notificaciones.sql` (después de `supabase-avisos.sql`) — **notificaciones para las admin**. Arriba, una campana con lo que las personas publican y comentan en la Comunidad (lo nuevo marcado; al tocar, abre la publicación en su espacio). Al abrirla queda todo visto: es el mismo «visto» del número de Comunidad. Desde la campana, «Activar en este dispositivo» manda avisos al celular o al PC aunque la Academia esté cerrada (Web Push; en iPhone hay que instalar la Academia en la pantalla de inicio). Los manda la función `avisos-comunidad`, que también puede mandar correo desde un Gmail con contraseña de aplicación (secretos `VAPID_PUBLICA`, `VAPID_PRIVADA`, `SMTP_USER`, `SMTP_PASS`); nunca desde hola@comercial. Cada **estudiante** también tiene su campana: le avisa cuando alguien (del equipo, marcado aparte, o un compañero) comenta su publicación o responde su comentario.

**App en el celular.** La Academia se instala como app (`manifest.webmanifest`, `manifest-admin.webmanifest` y `sw.js`): en Android/Chrome, «Instalar app»; en iPhone, Compartir → Agregar a pantalla de inicio. Desde /admin se instala la app de administrar.

**Correos:** los recordatorios de clase serán automáticos (Hostinger Reach). Todo lo demás (asistencia, encuestas, diagnóstico, contenido) sale manual desde el Gmail de quien lo manda. El buzón hola@comercial.porcontar.com es solo para prospección en frío.

`supabase-avisos.sql` (después de `supabase-comunidad.sql`, `supabase-admins.sql` y `supabase-soporte.sql`) — cuando una persona publica o comenta en la Comunidad, les llega un correo a las admin activas (función `supabase/functions/avisos-comunidad`, que envía por el SMTP de Hostinger con el secreto `SMTP_PASS`; *Verify JWT* apagado) y un contador en «Comunidad». Además, solo el **responsable** de cada grupo abre tickets de soporte.

`supabase-comunidad-empresas.sql` (después de `supabase-comunidad-programar.sql`) — **una Comunidad por empresa o cohorte**: cada persona ve y comenta lo de su grupo y los avisos generales; el admin, en el espacio de un grupo, ve y publica solo para él, y en el Principal publica para todos. Después, `supabase-faq-a-comunidad.sql` pasa una sola vez las preguntas frecuentes de Maper a su Comunidad.

`supabase-soporte.sql` — tickets de soporte: cada persona abre los suyos y conversa con el equipo; el admin ve todos, responde, cierra y abre tickets a nombre de alguien.

Todos se pueden correr más de una vez. Sin claves en `config.js`, el muro funciona en modo local (IndexedDB) solo para probar.

## MCP: conectar la Academia con Claude

`https://academia.porcontar.com/mcp?key=<MCP_TOKEN>` le da a Claude lo mismo que hace el admin: empresas y cohortes, personas, avance, cronograma, grabaciones, publicaciones, skills, quizzes, cursos y soporte. **Nada se escribe sin autorización**: toda herramienta que crea, cambia o borra se llama primero sin `confirmar` (solo muestra lo que haría) y se ejecuta solo con `confirmar=true` después de que la persona lo aprueba.

- Código: `supabase/functions/mcp-academia/index.ts` (función de Supabase). `functions/mcp.js` (Cloudflare Pages) le pasa los pedidos.
- Grupos y personas pasan por las mismas funciones de admin de la base que usa la app (con la llave `admin_key` de `app_config`), así que valen las mismas reglas.
- Cada llamada queda en la tabla `mcp_acciones` (`supabase-mcp.sql`); las contraseñas de grupo no se guardan.

Publicarlo (una vez, desde el panel de Supabase): correr `supabase-mcp.sql` → Edge Functions → Secrets → `MCP_TOKEN` = una clave larga → Deploy a new function → *Via Editor*, nombre `mcp-academia`, pegar el archivo → en Details apagar *Enforce JWT verification*. En Claude: Configuración → Conectores → Agregar conector personalizado → la URL de arriba.
