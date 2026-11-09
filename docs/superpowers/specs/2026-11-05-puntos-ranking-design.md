# Puntos, cinturones y ranking (Fase 1 de la gamificación)

**Fecha:** 2026-11-05
**Pidió:** Ximena
**Estado:** diseño acordado en la conversación; pendiente de revisar este documento.

## Para qué

Que aprender en la Academia sea atractivo, divertido y claro: cada persona ve que lo que hace suma, en qué cinturón va, en qué puesto está dentro de su empresa y qué le falta para subir.

La idea es de Ximena, que está cerca de su cinta negra en karate: se escala de cinta blanca a cinta negra, como en las artes marciales y como el «Black Belt» de Six Sigma. Six Sigma lo conocen bien las empresas, y ahí la cinta negra se gana con un proyecto que demuestra un ahorro medible.

**Sin terminología de karate:** nada de palabras en japonés. Se usan los cinturones de colores, puntos de 1, 2 y 3 y faltas, todo en español sencillo.

Es la base de lo que sigue: el Pasaporte de misiones (Fase 2) y el Demo Day del proyecto final (Fase 3).

## La filosofía (sin las palabras, con el espíritu)

| Principio | Cómo se vive en la Academia |
|---|---|
| **El cinturón se gana, no se regala** | Cada punto sale de algo que la persona hizo, y la base lo calcula. El cinturón negro exige el proyecto final aprobado, como un examen de grado. |
| **La constancia vence al talento** | Puntos chicos por práctica diaria, con topes por día: sirve más venir seguido que hacer todo en una noche. La tarjeta muestra lo que ganó esta semana. |
| **Primero compites contigo** | Lo más grande en la tarjeta es su cinturón y su avance hacia el siguiente. El puesto en el ranking va después. |
| **El que sabe, enseña** | Comentarle a un compañero suma, y lo que el equipo destaca (una buena respuesta, una ayuda) vale lo máximo: +3. |
| **Respeto y juego limpio** | Las faltas (amonestación, advertencia y descalificación) cuidan la experiencia de todos. Son privadas y se pueden quitar. |
| **El grado se celebra frente al grupo** | Cuando alguien sube de cinturón, la Comunidad de su empresa lo anuncia («🟢 Ana ganó el cinturón verde»), y cualquiera puede felicitarla. Las faltas nunca se anuncian. |

## Decisiones

- **Competencia individual**, dentro de su empresa o cohorte. Nunca se compara con otras empresas. Los equipos podrán sumarse después sin rehacer esto.
- **Los puntos se calculan en la base** a partir de lo que ya se guarda. No hay un contador que se pueda desincronizar, y cuenta lo que los grupos actuales ya hicieron.
- **Asistencia en vivo y encuesta** se suman cuando existan esas partes de la Fase 1 de las PM.
- **Los «Me gusta» no dan puntos:** se pueden regalar entre amigos y ensucian la escala de 1, 2 y 3.

## Los puntos: 1, 2 o 3

| Puntos | Por | Regla | Fuente |
|---|---|---|---|
| **+1** | Ver un video del curso | Una vez por cápsula | `cursos_progreso` |
| **+1** | Publicar en la Comunidad | Máximo 3 al día | `comunidad_posts` (no del equipo, ya publicadas) |
| **+1** | Comentarle a un compañero | No cuenta comentar lo propio; máximo 5 al día | `comunidad_comentarios` |
| **+2** | Ver completa la grabación de una clase | Una vez por grabación | `progreso_video.completado` |
| **+2** | Tarea completada | Una vez por tarea, con todos sus pasos marcados | `avance_tareas.estado.c` + `tareas.pasos` (fecha aproximada: la última vez que actualizó su avance) |
| **+3** | Quiz aprobado | Una vez por quiz, en el primer intento aprobado | `quiz_resultados` + `quizzes.aprobar` |
| **+3** | Destacado por el equipo | Una vez por publicación o comentario | columna nueva `destacado` |
| *(después)* +2 | Responder la encuesta de la clase | | parte de la Fase 1 de las PM |
| *(después)* +3 | Asistir a la clase en vivo | | parte de la Fase 1 de las PM |

Las cifras van en una tabla de reglas de la base (`puntos_reglas`), así se pueden cambiar sin tocar el código.

## Los cinturones

| Cinturón | Desde |
|---|---|
| ⚪ Blanco | al entrar |
| 🟡 Amarillo | 10 puntos |
| 🟠 Naranja | 20 puntos |
| 🟢 Verde | 35 puntos |
| 🔵 Azul | 50 puntos |
| 🟤 Café | 70 puntos |
| ⚫ **Negro** | Café **y** el proyecto final aprobado por el equipo, **sin estar descalificado** |

Los umbrales van en la misma tabla de reglas.

El cinturón negro no se alcanza solo con puntos: el proyecto final es el «Proyecto Cinta Negra». En esta fase el equipo lo marca como aprobado a mano; en la Fase 3 lo hará el Demo Day.

## Las faltas: amonestación, advertencia y descalificación

- Por ahora **las pone el equipo a mano**, con un motivo, desde el ranking completo del grupo. Cuando exista la asistencia se podrán poner solas (por ejemplo, faltar a una clase y no ver la grabación en 7 días).
- 2 amonestaciones suman 1 advertencia; 2 advertencias, la descalificación. El equipo también puede descalificar directo.
- **Descalificado no pierde el acceso:** pierde la opción del cinturón negro y de los premios del Demo Day.
- Una falta se puede quitar.
- **Son privadas:** las ven la persona y el equipo, nunca el grupo.

## Lo que ve la persona

- **Tarjeta en Inicio:**
  - su cinturón (dibujado en su color);
  - sus puntos, en grande;
  - la barra hasta el siguiente cinturón;
  - su puesto («4.º de 28 en Maper»);
  - una frase que empuja: «Te faltan 5 puntos para el cinturón verde» o «para pasar a Laura».
- **Celebración:** si al entrar tiene más puntos que la última vez, ve «¡Ganaste 6 puntos desde tu última visita!». Si sube de cinturón, ve una animación del cinturón nuevo con confeti. Lo recuerda su navegador.
- **Pantalla «Ranking»** (en Extras):
  - podio con los 3 primeros (🥇🥈🥉, con el 1.º más alto), cada uno con su cinturón;
  - debajo, del 4.º al 10.º;
  - su propia fila resaltada, aunque no esté en el top;
  - **«Cómo gané mis puntos»:** cada acción con su ícono, la fecha y +1, +2 o +3;
  - **«Cómo ganar más»:** las reglas y los cinturones, en lenguaje simple;
  - **sus faltas**, si tiene, solo para ella o él.
- Solo ve nombres y puntos de su propio grupo.

## Lo que ve el equipo (admin)

- **En el espacio de un grupo,** el ranking completo con todas sus personas. En la fila de cada una:
  - **Poner falta** (tipo y motivo) y quitarla;
  - **Proyecto final aprobado**, que habilita el cinturón negro.
- **En el Panel de avance,** columnas de puntos, cinturón y faltas, que salen también en el Excel.
- **En la Comunidad,** el botón **Destacar** en publicaciones y comentarios, con una estrella visible para todos.
- **En «Lo que ve este grupo»,** el interruptor **Ranking**, encendido por defecto. Apagado, el grupo no ve la pantalla ni la tarjeta, y el equipo sí.
- **En el MCP:**
  - `ranking_grupo` («¿quién va ganando en Maper?»), solo lee;
  - `destacar`, `poner_falta`, `quitar_falta` y `aprobar_proyecto`, que piden aprobación, como todo lo que escribe.

## Diseño visual

- Colores de la marca: azul #2B4FE8 y amarillo #FFF401.
- Los cinturones se dibujan como una cinta con nudo, en su color, sin palabras extranjeras.
- Las medallas del podio son oro, plata y bronce.
- Números grandes; el contador sube de 0 a sus puntos al abrir.
- El podio es visual (alturas distintas y avatar con iniciales), no una tabla.
- Cada tipo de acción tiene ícono y color propios en el historial.
- Las faltas usan tonos sobrios (amarillo, naranja y rojo suaves), nunca alarmantes.
- Todo es legible en celular.

## Piezas

1. `supabase-puntos.sql`:
   - las tablas `puntos_reglas`, `puntos_faltas` (persona, grupo, tipo, motivo, quién y cuándo) y `puntos_proyectos` (persona, grupo, aprobado el);
   - la columna `destacado` en publicaciones y comentarios;
   - la tabla `puntos_cinturones` (el último cinturón anunciado de cada persona). Al calcular, si alguien subió, se guarda y se publica el anuncio en la Comunidad de su grupo, firmado por «Academia PorContar»; como lo publica el equipo, no dispara correo de aviso;
   - la función `mis_puntos()`: lo mío, con total, cinturón, puesto, historial y faltas;
   - la función `ranking_grupo(grupo)`: top 10 más la propia fila para el estudiante, completo con faltas y proyecto para el admin;
   - las funciones de admin para destacar, poner y quitar faltas, y aprobar el proyecto;
   - el extra `ranking` en los grupos.
2. La app:
   - la tarjeta de Inicio y la pantalla Ranking (archivo nuevo `public/puntos.js` y estilos);
   - el botón Destacar en la Comunidad;
   - las acciones del admin en el ranking;
   - el interruptor del grupo y las columnas del panel.
3. El MCP: las herramientas de arriba.

## Pruebas

- **SQL en PGlite:**
  - cada regla suma lo que debe y los topes diarios se respetan;
  - no se cuentan los comentarios en lo propio;
  - los cinturones salen por umbral, y el negro solo con el proyecto aprobado y sin descalificación;
  - las faltas se acumulan (2 amonestaciones = 1 advertencia, 2 advertencias = descalificación);
  - un estudiante ve solo su grupo y solo sus propias faltas;
  - el admin ve todo.
- **Chrome con base simulada:**
  - la tarjeta, el podio, la fila propia resaltada, el historial y la celebración;
  - el botón Destacar, poner una falta y aprobar el proyecto;
  - el interruptor apagado;
  - sin errores en la consola.

## Fuera de esta fase

- El Pasaporte de misiones con evidencia (Fase 2).
- El Demo Day del proyecto final, la galería, los votos y la pantalla en vivo (Fase 3).
- Los equipos y los premios.
- Las faltas automáticas por inasistencia, que dependen de la asistencia.
