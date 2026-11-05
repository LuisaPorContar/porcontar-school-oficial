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

`supabase-avisos.sql` (después de `supabase-comunidad.sql`, `supabase-admins.sql` y `supabase-soporte.sql`) — cuando una persona publica o comenta en la Comunidad, les llega un correo a las admin activas (función `supabase/functions/avisos-comunidad`, que envía por el SMTP de Hostinger con el secreto `SMTP_PASS`; *Verify JWT* apagado) y un contador en «Comunidad». Además, solo el **responsable** de cada grupo abre tickets de soporte.

`supabase-soporte.sql` — tickets de soporte: cada persona abre los suyos y conversa con el equipo; el admin ve todos, responde, cierra y abre tickets a nombre de alguien.

Todos se pueden correr más de una vez. Sin claves en `config.js`, el muro funciona en modo local (IndexedDB) solo para probar.

## MCP: conectar la Academia con Claude

`https://academia.porcontar.com/mcp?key=<MCP_TOKEN>` le da a Claude lo mismo que hace el admin: empresas y cohortes, personas, avance, cronograma, grabaciones, publicaciones, skills, quizzes, cursos y soporte. **Nada se escribe sin autorización**: toda herramienta que crea, cambia o borra se llama primero sin `confirmar` (solo muestra lo que haría) y se ejecuta solo con `confirmar=true` después de que la persona lo aprueba.

- Código: `supabase/functions/mcp-academia/index.ts` (función de Supabase). `functions/mcp.js` (Cloudflare Pages) le pasa los pedidos.
- Grupos y personas pasan por las mismas funciones de admin de la base que usa la app (con la llave `admin_key` de `app_config`), así que valen las mismas reglas.
- Cada llamada queda en la tabla `mcp_acciones` (`supabase-mcp.sql`); las contraseñas de grupo no se guardan.

Publicarlo (una vez, desde el panel de Supabase): correr `supabase-mcp.sql` → Edge Functions → Secrets → `MCP_TOKEN` = una clave larga → Deploy a new function → *Via Editor*, nombre `mcp-academia`, pegar el archivo → en Details apagar *Enforce JWT verification*. En Claude: Configuración → Conectores → Agregar conector personalizado → la URL de arriba.
