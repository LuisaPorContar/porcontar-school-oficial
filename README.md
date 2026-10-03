# PorContar Academia Oficial

Muro de la **Academia de PorContar**. Sitio estático, sin build ni dependencias que instalar: se publica la carpeta `public` y funciona.

## Qué hay en el menú

- **Sesiones** — las clases, cada una con sus publicaciones de texto, video, imagen o PDF. Cada estudiante puede ocultar las que no quiere ver (ojito).
- **Extras**
  - **Trabajo autónomo** — las tareas de cada sesión, con el avance de cada persona.
  - **Quizzes** — para evaluar lo aprendido.
  - **Catálogo de prompts** — fichas de skills por área; el admin las prende y apaga, o las sube desde un `.md`.
  - **Vocabulario y términos** — la guía embebida.
  - **Tutoriales express**, **Preguntas frecuentes** y **Guardados**.
  - **Configurar Claude** — oculto por ahora (`hidden` en `index.html`).

## Accesos

| Quién | URL |
|---|---|
| Estudiantes | la raíz del sitio |
| Admin | la raíz + `?admin=LA-CLAVE` |

La clave de admin **no está en el código**: está en `supabase-academia.sql`, que no se sube al repositorio.

## Estructura

```
public/
├── index.html             estructura y sprite de iconos SVG
├── styles.css             identidad PorContar (azul #2B4FE8, amarillo #FFF401)
├── app.js                 sesiones, publicaciones, skills, quizzes, FAQ y almacenamiento
├── config.js              URL y clave pública de Supabase
├── trabajo-autonomo.html  tareas de cada sesión (+ trabajo-autonomo.js)
├── resumen.html           guía de vocabulario y términos
├── configuracion.html     guía para configurar Claude
├── marca/                 logos, burbuja (favicon) y foto
└── vendor/                cliente de Supabase servido desde el propio proyecto
```

Las sesiones se editan en la lista `SESSIONS` al inicio de `app.js`.

## Datos

Supabase: proyecto **PENDIENTE**. Mientras `config.js` tenga las claves vacías, el muro funciona en modo local (IndexedDB del navegador). Ver `LEEME.md`.
