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
  - **Tutoriales express**, **Preguntas frecuentes** y **Guardados**.
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

Los tres se pueden correr más de una vez. Sin claves en `config.js`, el muro funciona en modo local (IndexedDB) solo para probar.
