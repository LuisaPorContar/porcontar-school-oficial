-- ================================================================
-- Academia · skills del Catálogo de prompts (catalogo-skill.netlify.app)
-- Correr COMPLETO una vez en Supabase → SQL Editor (proyecto lcbonixjumchbhffyxee).
-- Se puede correr de nuevo sin duplicar: si una ya existe, se actualiza y se prende.
--
-- Las 14 skills que se ven en el catálogo publicado, en el mismo orden.
-- Entran prendidas y para todos los grupos (audiencia vacía).
-- ================================================================

alter table public.skills add column if not exists visible boolean not null default true;

insert into public.skills (id, title, area, level, tags, objective, prompt, visible, created_at) values
  ('pmupxjjt91am3w', 'Creador de voz de marca (tono de voz)', 'Redes sociales', 'Básico', '', 'Defina el tono de voz completo de una marca (personalidad, vocabulario, estilo de escritura y pautas de comunicación) para que todo el equipo escriba de manera consistente en todos los canales.', '## Cuándo usar

- Al crear una marca desde cero o desarrollar su branding.
- Cuando la comunicación de la marca es inconsistente entre canales.
- Al contratar escritores, equipos de redes sociales o una agencia.
- En procesos de rebranding o reposicionamiento.

## Cómo usar

1. Copia el siguiente mensaje en Claude o ChatGPT.
2. Describe la marca, la audiencia y las referencias.
3. Recibe la guía completa de tono de voz.
4. Distribúyela como documento guía para todo el equipo.

## El Prompt

Eres un estratega de marca especializado en definir el tono de voz. Sabes que el tono de voz es lo que hace que una marca parezca una persona y no una empresa. Cuando está bien definido, el público puede reconocer la marca incluso sin ver el logo.

Crea la guía de tono de voz para:

**Marca:** [nombre]  
**Qué haces:** [producto o servicio en 1 frase]  
**Público objetivo:** [a quién se dirige la marca]  
**Cómo quieres que se sienta la audiencia al interactuar con la marca:** [confiada, inspirada, divertida, segura, etc.]  
**Marcas que admiras como referencia:** [ej. Nubank, Netflix, Apple]  
**Adjetivos que describen la marca:** [3-5 adjetivos]

Entregar:

**1. Personalidad de marca**  
Define la Brand Persona como si la marca fuera una persona. Describe cómo piensa, cómo habla, qué actitud tiene y qué la diferencia.

**2. Pilares del tono de voz**  
Define 4 dimensiones del tono, por ejemplo:

Formal ↔ Casual  
Serio ↔ Divertido  
Técnico ↔ Simple  
Distante ↔ Cercano

Asigna un porcentaje a cada dimensión y explica qué significa en la práctica.

**3. Vocabulario de marca**  
Define 20 palabras o expresiones que la marca **USA** y 20 que **NUNCA USA**. Prioriza palabras relacionadas con la industria, personalidad y audiencia.

**4. Reglas de escritura**  
Define las reglas para emojis, jerga, anglicismos, mayúsculas, signos de puntuación, longitud de frases, números, llamados a la acción y formato.

**5. Tono por canal**  
Adapta el tono para:

Instagram  
Correo electrónico  
WhatsApp  
Sitio web

Mantén la misma personalidad, pero explica qué cambia según el contexto de cada canal.

**6. Ejemplos prácticos**  
Crea 10 pares de ejemplos:

**HAZ ESTO:** [ejemplo de cómo habla la marca]  
**NO HAGAS ESTO:** [ejemplo incorrecto]

Los ejemplos deben estar relacionados con situaciones reales de comunicación de la marca.

**7. Lista de verificación**  
Crea una checklist de máximo 10 preguntas que cualquier persona del equipo pueda usar antes de publicar un contenido para comprobar si realmente suena como la marca.

La guía debe ser práctica y suficientemente clara para que un escritor, community manager, diseñador o agencia pueda aplicarla sin necesitar explicaciones adicionales.

No uses lenguaje genérico de branding. Cada recomendación debe estar conectada con la información proporcionada sobre la marca, su audiencia y su posicionamiento.

## Ejemplo de uso

### Input

**Marca:** Fintech de inversión para jóvenes  
**Público:** 22-35 años, primer contacto con inversiones  
**Referencias tonales:** Nubank, Duolingo  
**Adjetivos:** Accesible, confiable, ligero, inteligente.

### Output

**Pilares tonales**

**Formal ↔ Casual:** 70% casual. Habla como alguien que conoce el mercado financiero, pero explica las cosas como se las explicaría a un amigo.

**Serio ↔ Divertido:** 60% divertido. Utiliza humor para desmitificar las inversiones, pero evita bromear cuando se habla de pérdidas, riesgos o decisiones financieras importantes.

**Vocabulario**

**USA:** dinero, invertir, empezar, crecer, aprender, elegir, ganar, entender, construir, opciones.

**NUNCA USA:** estimado cliente, le informamos, aporte, activos financieros, rentabilidad garantizada, beneficiario, instrumento financiero.

**Ejemplo**

**HAZ ESTO:** “Tu dinero ganó $12,50 este mes. ¿Parece poco? Así se empieza.”

**NO HAGAS ESTO:** “Le informamos que el rendimiento de su cartera durante el período correspondió a $12,50.”

---

**Tags:** Intermedio | Generación | Marketing, Ventas y Publicidad', true, now() + interval '0 seconds'),
  ('pmuq0ni4rab6su', 'Sistema de Seguimiento y Cierre de Clientes', 'Ventas', 'Básico', '', '', 'Eres un experto en ventas consultivas.

Clientes potenciales: [describir]

Entregar:
1. Secuencia de seguimiento
2. Mensajes listos
3. Momento óptimo
4. Estrategias de cierre', true, now() + interval '1 seconds'),
  ('pmuq12be4dyo5t', 'Guión para Redes Sociales', 'Estrategia', 'Básico', '', '', '**1. Duración y Formato:**

- Duración: [30 segundos]
- Formato: [Horizontal.]

*Instrucciones:* Usando la estructura PAS (Problema, Agitación, Solución), el guion debe incluir una de las siguientes frases en cualquier parte del discurso:

*"Si tuviera que empezar de nuevo, Errores que cometí cuando, X pasos para, Dato curioso, Lo más loco acaba de pasar en..., no lo creerás, ¿Sabías que, Esto es lo único que necesitas saber sobre, No me odies, pero, Esta es la razón por la que tu, Deja de hacer/en su lugar, Averigüemos por qué, ¿Qué pasa cuando nosotros…?, Probé todos (HACK/CONSEJO/TRUCO) que desearía haber sabido antes."*

### **Prompt:**

*Crea un guion efectivo para un Reel en formato de voz en off basado en la siguiente información:*

1. **Tema:** [percepción negativa de las prendas second hand (feas, defectuosas, sucias) y la sensación de pérdida de estatus.]
2. Lista de problemas: []
- Las plataformas actuales no educan suficientemente al consumidor sobre el valor y la calidad del second hand.
- Falta de experiencias de compra atractivas que destaquen la calidad, diseño y beneficios ecológicos de las prendas usadas.
- Deficiencia en crear una narrativa aspiracional y de prestigio alrededor del second hand que cambie la percepción social.

*El guion debe seguir la estructura PAS (Problema, Agitación, Solución) y utilizar una de las siguientes frases:*

- "Si tuviera que empezar de nuevo"
- "Errores que cometí cuando"
- "X pasos para"
- "Dato curioso"
- "Lo más loco acaba de pasar en..."
- "No lo creerás"
- "¿Sabías que?"
- "Esto es lo único que necesitas saber sobre"
- "No me odies, pero"
- "Esta es la razón por la que tu"
- "Deja de hacer/en su lugar"
- "Averigüemos por qué"
- "¿Qué pasa cuando nosotros...?"
- "Probé todos (HACK/CONSEJO/TRUCO) que desearía haber sabido antes"

El guión debe incluir:

- **Problema**: Introduce un problema clave que enfrenta la audiencia relacionado con el tema.
- **Agitación**: Explica las consecuencias negativas de este problema para generar interés.
- **Solución**: Ofrece una solución práctica y concreta que les ayude a resolver el problema.
- **Frase específica**: Debe usarse de manera natural en el guion para captar la atención de la audiencia.
- **Lenguaje simple:** lo debe entender hasta un niño
- El texto se debe ser pronunciado por una persona en 30 segundos, asi que se conciso', true, now() + interval '2 seconds'),
  ('pmuvbk1wbc8vfy', 'Guiones de venta', 'Estrategia', 'Básico', '', 'El objetivo es utilizar una de estas plantillas como guiones de venta', '81 plantillas en cuatro bloques, más una guía de buenas prácticas. Bloque 1, primer contacto (25). Bloque 2, seguimiento (30). Bloque 3, despedida o cierre de ciclo (20). Bloque 4, correo en frío según datos de Apollo (6 plantillas y reglas de redacción).

---

# BLOQUE 1. PRIMER CONTACTO (25)

## Detonantes de noticias

### Plantilla 1. El anuncio de financiación
**Asunto:** Felicidades por la Serie [A/B/C], una idea rápida sobre crecer

Hola [Nombre],

Vi la noticia de la ronda de $[monto] de [Empresa]. Buen momento para ustedes.

Cuando [empresa similar] cerró su Serie [X], se encontró de inmediato con [reto propio de esa etapa]. Les ayudamos a resolverlo en [plazo] con [solución breve].

El enfoque iba en contra de lo que uno esperaría, pero funcionó muy bien.

¿Te sirve una llamada de 15 minutos para contarte lo que aprendimos?

[Firma]

### Plantilla 2. Nueva contratación ejecutiva
**Asunto:** Bienvenida a [nuevo ejecutivo] en [Empresa], una idea sobre [área]

Hola [Nombre],

Vi que [Empresa] acaba de incorporar a [nombre del ejecutivo] como [cargo]. Buena decisión.

Cuando [empresa similar] trajo a su [cargo similar], los primeros 90 días se centraron en [iniciativa típica del cargo]. El reto que nadie veía venir fue [dato específico].

Trabajamos con ellos para lograr [logro específico]. A [nombre del ejecutivo] quizá le sirva saber qué funcionó y qué no.

Si [iniciativa] está en sus planes, con gusto te comparto el método que armamos.

¿Te interesa?

[Firma]

### Plantilla 3. Fallas de servicio de un competidor
**Asunto:** ¿[Competidor] caído? ¿Necesitas ayuda?

Hola [Nombre],

Vi que [Competidor] lleva [plazo] con [problemas específicos].

Si son clientes suyos, seguramente están corriendo para [dolor específico].

Solo esta semana migramos 3 empresas desde [Competidor]. Podemos tenerlos operando en [plazo] y con mejor [capacidad específica].

Tenemos un paquete de migración urgente si lo necesitan.

¿Hablamos un momento?

[Firma]

### Plantilla 4. Nueva herramienta en su operación
**Asunto:** Vi que incorporaron [Tecnología], un dato sobre la integración

Hola [Nombre],

Noté que [Empresa] acaba de implementar [Tecnología] (lo vi en [fuente: oferta de empleo, datos tecnográficos, etc.]).

Tres cosas que la mayoría de usuarios de [Tecnología] descubre tarde:
- [Reto de integración en tu categoría]
- [Costo o complejidad oculta]
- [Oportunidad de optimización que se pierde]

Trabajamos con más de 40 clientes de [Tecnología] y encontramos solución para las tres. [Empresa similar] nos contó que la integración les ahorró [métrica de tiempo, dinero o recursos].

Como apenas empiezan la implementación, pueden evitar estos problemas desde ya.

¿Quieres la guía de integración que desarrollamos?

[Firma]

### Plantilla 5. Lo que revela una oferta de empleo
**Asunto:** Contratar un [cargo] suele significar [conclusión]

Hola [Nombre],

Me llamó la atención su vacante de [cargo], sobre todo el requisito de [habilidad o experiencia].

Esa combinación casi siempre indica que [Empresa] está resolviendo [reto específico]. ¿Voy bien?

Cuando [empresa similar] armó esa área, se encontró con [reto inesperado]. Les ayudamos a [solución y resultado].

Te podría ahorrar meses de prueba y error.

¿Te interesa saber qué aprendimos?

[Firma]

### Plantilla 6. Integración tras una adquisición
**Asunto:** Integración de [empresa adquirida], cómo evitar el error de $[X] millones

Hola [Nombre],

Felicidades por la adquisición de [Empresa]. La integración de [área: tecnología, operaciones, ventas] es donde la cosa se pone interesante.

Hemos acompañado 4 adquisiciones parecidas en [sector]. El error que cuesta millones es [reto de integración más común].

[Empresa similar] lo aprendió por las malas y le costó [métrica]. En su siguiente adquisición nos llamó desde el principio y todo salió bien.

El primer paso clave no es el que la mayoría de equipos imagina. Es [dato contraintuitivo].

Tenemos un plan de integración de 90 días pensado para [tipo de adquisición: tecnológica, competitiva, expansión de mercado].

Con lo que está en juego, ¿vale la pena conversar?

[Firma]

### Plantilla 7. Anuncio de alianza
**Asunto:** Alianza con [Socio], cómo sacarle el máximo provecho

Hola [Nombre],

Vi su alianza con [Socio]. Trabajamos con otros 3 aliados de [Socio].

Los que más valor obtienen hacen algo concreto, [estrategia o punto de integración inesperado].

[Empresa similar] triplicó el retorno de su alianza con este enfoque. [Socio] incluso nos recomienda a sus aliados por esa razón.

Si te sirve, te comparto el método.

¿Hablamos?

[Firma]

### Plantilla 8. Lanzamiento de producto
**Asunto:** Lanzamiento de [Producto], un dato sobre distribución

Hola [Nombre],

El lanzamiento de [Producto] se ve muy bien, sobre todo [función o capacidad].

Un dato rápido. Cuando [empresa similar] lanzó algo parecido, descubrió que [reto de adopción, distribución o posicionamiento].

Les ayudamos a resolverlo con [solución breve]. Resultado, [mejora en métrica].

Lo que nadie esperaba fue [elemento inesperado que lo hizo funcionar].

Como están en plena fase de lanzamiento, podrían aplicarlo de inmediato y ahorrarse los 3 meses de aprendizaje que ellos tuvieron.

¿Quieres que te cuente la historia completa?

[Firma]

## Enfocadas en un problema

### Plantilla 9. Los datos no cuadran
**Asunto:** ¿Los números de [Empresa] no cuadran?

Hola [Nombre],

Noté algo curioso. Su sitio web muestra [métrica A], pero [fuente] reporta [métrica B].

Esa diferencia suele indicar [problema: fallas de medición, sistemas desconectados, un proceso que se rompió].

Lo vemos mucho en empresas de [sector o tamaño]. Arreglarlo no es complicado; encontrar la causa sí.

[Empresa similar] tenía el mismo problema. Lo rastreamos hasta [causa específica] y lo resolvimos en [plazo].

¿Quieres saber cómo lo diagnosticamos?

[Firma]

### Plantilla 10. El reto de escala
**Asunto:** ¿[Proceso] se está rompiendo con su tamaño actual?

Hola [Nombre],

Con el tamaño actual de [Empresa] (unos [empleados, ingresos o clientes]), [proceso] suele empezar a fallar.

Los síntomas:
- [Síntoma 1 que probablemente viven]
- [Síntoma 2]
- [Síntoma 3]

¿Te suena?

[Empresa similar] chocó con lo mismo al llegar a [métrica similar]. Los parches lo empeoraron.

Rediseñamos su [proceso] para soportar [X veces] el volumen. Tomó [plazo]. Hoy operan a [escala actual] con el mismo sistema.

La clave estuvo en [solución contraintuitiva], sin sumar herramientas ni personas.

¿Lo conversamos antes de que se vuelva crítico?

[Firma]

### Plantilla 11. El proceso manual
**Asunto:** ¿Todavía hacen [proceso] a mano?

Hola [Nombre],

Noté que su equipo [indicio de proceso manual, por ejemplo "publica actualizaciones en una hoja de cálculo" o "envía confirmaciones una por una"].

Haciendo cuentas rápidas, con su volumen son unas [horas] semanales de trabajo manual. Eso significa [costo directo o costo de oportunidad].

Automatizamos ese mismo flujo para [empresa similar]. Pasaron de [tiempo] a [tiempo reducido] por [unidad].

La automatización se pagó sola en [plazo].

¿Quieres ver el flujo antes y después?

[Firma]

### Plantilla 12. El patrón de quejas
**Asunto:** Sus reseñas mencionan mucho [problema]

Hola [Nombre],

Revisé las reseñas recientes de [Empresa]. [Queja específica] aparece en el [X]% de ellas.

Ese patrón suele apuntar a [causa raíz]. Tiene arreglo, pero no es evidente.

[Empresa similar] recibía comentarios idénticos. El problema estaba donde no lo buscaban, en [causa inesperada].

Lo resolvimos con [enfoque de solución]. Su [NPS, reseñas o CSAT] mejoró [cantidad] en [plazo].

Bastó con [descripción breve del enfoque], sin rehacer todo.

¿Quieres saber exactamente qué hicimos?

[Firma]

### Plantilla 13. La desventaja competitiva
**Asunto:** [Función o anuncio] de [Competidor], ¿hay que responder?

Hola [Nombre],

[Competidor] acaba de lanzar [función o capacidad]. Seguramente sus clientes ya están preguntando por eso.

Lo que no cuentan es que esa función tiene [limitación oculta]. Lo sabemos porque construimos algo similar para [otra empresa] y lo aprendimos por las malas.

Igualarlos función por función no es la mejor jugada. Conviene más [alternativa mejor].

Hace 6 meses [empresa similar] estaba en su misma posición. En vez de correr detrás, les ayudamos a [solución superior]. Terminaron quitándole clientes a [tipo de competidor] al presentarlo como [ventaja específica].

La implementación es más rápida de lo que parece, [plazo], y los deja adelante.

¿Te interesan los detalles?

[Firma]

## Referencias y contenido

### Plantilla 14. La referencia cálida
**Asunto:** [Contacto en común] me dijo que deberíamos hablar

Hola [Nombre],

[Contacto en común] me sugirió escribirte. El año pasado le ayudamos [a él, a ella o a su empresa] con [reto específico].

Me contó que [Empresa] está trabajando en [iniciativa] y pensó que nuestro enfoque les podría servir.

Para darte contexto, al principio [contacto] tenía dudas por [duda específica]. Después de ver [resultado], se volvió de los que más nos recomienda.

Sus palabras fueron: "[cita breve sobre por qué deberían hablar]".

Si [iniciativa] sigue siendo prioridad, te cuento qué funcionó con [contacto] y cómo lo adaptaríamos a [Empresa].

¿Lo exploramos?

[Firma]

### Plantilla 15. Mención en un podcast o contenido
**Asunto:** Lo que dijiste sobre [tema] en [podcast o webinar]

Hola [Nombre],

Acabo de escuchar tu entrevista en [podcast o webinar]. Me identifiqué con lo que contaste sobre [problema mencionado].

Dijiste que probaron [enfoque que no funcionó]. Nosotros lo resolvimos para [empresa similar] con [enfoque distinto].

La clave fue [dato contraintuitivo]. El resultado, [logro específico].

Si te sirve, te cuento los detalles. Sin agenda, solo pensé que te gustaría saber que hay una solución que funciona.

¿Te interesa?

[Firma]

### Plantilla 16. La historia de éxito de un cliente
**Asunto:** Cómo [Cliente] pasó de [problema] a [resultado]

Hola [Nombre],

[Cliente] tenía tu mismo reto con [problema]. Probaron [solución común que no sirve]. No funcionó.

Luego les ayudamos a [descripción breve del enfoque distinto].

Resultados después de [plazo]:
- [Mejora 1]
- [Mejora 2]
- [Mejora 3]

Su CEO me dijo: "[cita corta sobre el impacto]".

Lo interesante es que arrancaron con [limitación que el prospecto también tiene], así que tuvimos que [cómo se resolvió].

[Empresa] parece estar en una situación parecida, con los mismos retos y las mismas oportunidades.

¿Quieres conocer la historia completa?

[Firma]

## Contacto con ejecutivos

### Plantilla 17. El mandato de la junta
**Asunto:** [Meta estratégica pública] de [Empresa], ¿prioridad de la junta?

Hola [Nombre],

Seguramente la junta directiva está presionando fuerte por [iniciativa del informe anual o la presentación a inversionistas].

El reto oculto de [iniciativa] a su escala es [reto que las juntas no siempre ven].

Acabamos de ayudar a [empresa similar] a cumplir esa misma meta ante su junta. Lo que movió los resultados fue [factor inesperado], no lo que ellos esperaban.

Resultados que presentaron en su última reunión de junta:
- [Métrica relevante para la junta 1]
- [Métrica relevante para la junta 2]
- [Reducción de riesgo]

¿Tenemos una conversación estratégica sobre cómo [Empresa] podría lograr algo similar?

[Firma]

### Plantilla 18. Encontrar a la persona correcta
**Asunto:** ¿Eres la persona indicada para [área]?

Hola [Nombre],

Estoy buscando a la persona que maneja [función o reto] en [Empresa].

También les escribí a [Persona X] y [Persona Y] con ese fin, pero quise consultarte por tu rol en [área].

Lo que hacemos. [Tu empresa] ayuda a [empresas similares del sector] a resolver [problema] con [enfoque propio]. Hace poco ayudamos a [cliente destacado] a lograr [resultado medible] en [plazo].

Por qué te escribo ahora. [Detonante o razón de urgencia].

Un caso concreto. [Empresa similar] tenía problemas con [reto]. Las soluciones tradicionales exigían [desventajas del enfoque convencional]. Nosotros usamos [método propio] y logramos [mejora]. Recuperaron la inversión [métrica de retorno] en [plazo].

Las empresas suelen buscarnos cuando:
- [Escenario 1]
- [Escenario 2]
- [Escenario 3]

Si eres la persona indicada, ¿cómo tienes la agenda para una llamada corta?

Si no, ¿con quién me recomiendas hablar?

Gracias por orientarme.

[Firma]

### Plantilla 19. La promesa de rapidez
**Asunto:** De [problema] a [solución] en 5 minutos

Hola [Nombre],

Es probable que [Empresa] dedique [X horas o días] a [proceso].

Nosotros lo hacemos en [mucho menos tiempo].

Te muestro cómo en 5 minutos. No es una presentación de ventas, es una demo rápida del enfoque.

Si no te sirve, al menos sabrás lo que es posible.

¿Mañana a las 2 o el jueves a las 10?

[Firma]

### Plantilla 20. La iniciativa estratégica
**Asunto:** El camino de [Empresa] hacia [meta]

Hola [Nombre],

Revisé [sitio web, informe anual o anuncio reciente] de [Empresa] y noté su foco en [meta estratégica].

Por nuestro trabajo con [empresas similares], lograr [meta] suele exigir hacerlo muy bien en tres frentes.

1. [Primer requisito]. Situación actual, [con qué lucha la mayoría]. Factor crítico, [qué genera resultados].
2. [Segundo requisito]. Situación actual, [reto común]. Factor crítico, [clave para avanzar].
3. [Tercer requisito]. Situación actual, [brecha típica]. Factor crítico, [qué hacen distinto los que ganan].

[Empresa similar] dominó los tres y logró [resultado ligado a la meta].

Lo sorprendente es que estaban más atrasados en [área inesperada], y eso terminó destrabando todo lo demás.

Si [meta] sigue siendo prioridad, te comparto su método y cómo se adaptaría a la situación de [Empresa].

¿Tienes espacio la próxima semana para una conversación estratégica?

[Firma]

## Situaciones especiales

### Plantilla 21. Recuperar un prospecto
**Asunto:** ¿Qué ha cambiado desde la última vez que hablamos?

Hola [Nombre],

Han pasado [plazo] desde que conversamos sobre [tema o solución].

En ese momento, [razón por la que no avanzó].

¿Ha cambiado algo? Te pregunto porque:
- [Cambio en el mercado]
- [Cambio que noté en la empresa]
- [Nueva solución o capacidad que ahora ofrecemos]

Si ahora es mejor momento, retomamos donde quedamos, pero con [mejora o nuevo enfoque].

¿Vale la pena retomarlo?

[Firma]

### Plantilla 22. Contacto en un evento
**Asunto:** Seguimiento de [evento]

Hola [Nombre],

Un gusto conocerte ayer en [evento]. Me quedé pensando en lo que dijiste sobre [reto conversado].

Mencionaste [problema]. El enfoque que te describí funciona así: [explicación breve].

[Empresa similar] lo usó para [resultado] en [plazo].

¿Seguimos la conversación con calma? ¿Un café esta semana o una videollamada la próxima?

[Firma]

### Plantilla 23. Asistente a un webinar
**Asunto:** Tu pregunta en el webinar de [tema]

Hola [Nombre],

Vi que asististe a nuestro webinar sobre [tema] y preguntaste por [pregunta] (o te quedaste hasta el final).

Esa pregunta suele indicar [reto específico]. Hemos ayudado a [número] empresas a resolver justo eso.

El webinar explicó el qué, pero no el cómo para tu caso.

¿Conversamos sobre cómo funcionaría [solución] en [Empresa]?

[Firma]

### Plantilla 24. Se fue el contacto que impulsaba el proyecto
**Asunto:** Vi que [contacto anterior] dejó [Empresa]

Hola [Nombre],

Noté que [contacto anterior] salió de [Empresa] y que asumiste [responsabilidad].

Estábamos trabajando con [él o ella] en [iniciativa o solución]. Habían llegado a [etapa].

No sé si sigue siendo prioridad para ti, pero con gusto te pongo al día sobre:
- Lo que aprendimos de la situación de [Empresa]
- Por qué [contacto anterior] estaba interesado
- En qué punto quedó todo

¿Hacemos una llamada corta para pasarte el contexto?

[Firma]

### Plantilla 25. Interés entrante
**Asunto:** Re: Tu consulta sobre [solución]

Hola [Nombre],

Gracias por escribirnos sobre [interés, descarga o consulta].

Por lo que contaste sobre [situación], imagino que buscas [meta].

La mayoría de empresas en tu situación se traba con [reto]. Nosotros lo resolvemos con [enfoque breve].

Un ejemplo. [Empresa similar] pasó de [situación problema] a [situación de éxito] en [plazo].

¿Exploramos si podemos lograr lo mismo para [Empresa]?

[Firma]

---

# BLOQUE 2. SEGUIMIENTO (30)

## Seguimientos que aportan valor

### Plantilla 1. Compartir un artículo relevante
**Asunto:** Vi esto sobre [tema] y pensé en ti

Hola [Nombre],

Me encontré este [artículo o informe] sobre [reto que conversamos]: [enlace]

La parte de [sección] tiene que ver directamente con lo que mencionaste sobre [su situación].

Lo más útil, [idea breve y relevante del artículo].

Me hizo pensar que nuestra conversación sobre [solución] es todavía más oportuna.

¿Sigues interesado en explorarlo?

[Firma]

### Plantilla 2. La noticia del sector
**Asunto:** [Empresa] + [tendencia del sector]

Hola [Nombre],

Acaban de anunciar [noticia o cambio del sector], y afecta directamente lo que hablamos sobre [reto].

Tres formas en que [Empresa] podría aprovecharlo:
- [Oportunidad]
- [Oportunidad]
- [Oportunidad]

Ayudamos a [empresa similar] a atravesar este mismo cambio. Con gusto te comparto cómo lo hicieron.

¿Hablamos un momento?

[Firma]

### Plantilla 3. El avance de un par
**Asunto:** [Empresa similar] acaba de lograr [resultado]

Hola [Nombre],

¿Recuerdas cuando hablamos de [reto]?

[Empresa similar] acaba de resolverlo con nuestro enfoque. Resultados:
- [Mejora en métrica]
- [Mejora en métrica]
- [Tiempo que tomó]

Empezaron exactamente donde están ustedes hoy.

¿Quieres saber cómo lo hicieron?

[Firma]

### Plantilla 4. Compartir un recurso
**Asunto:** El [recurso] que pediste

Hola [Nombre],

Mencionaste que querías saber más sobre [tema].

Aquí está la [guía, plantilla o lista de verificación] que te comenté: [enlace]

La página [X] responde tu pregunta sobre [inquietud].

Cuando la revises, te muestro cómo la implementó [empresa similar].

¿Retomamos el [día] o el [día]?

[Firma]

### Plantilla 5. Publicación de un caso de éxito
**Asunto:** Nuevo caso, cómo [empresa similar] resolvió [reto]

Hola [Nombre],

Acabamos de publicar cómo [empresa similar] enfrentó [reto que ustedes tienen].

El enfoque fue poco convencional, [enfoque breve].

Resultados
- [Métrica 1]
- [Métrica 2]
- [Plazo]

Caso completo aquí: [enlace]

Su punto de partida se parece mucho al de [Empresa] hoy. ¿Conversamos sobre cómo replicar su resultado?

[Firma]

## Otro ángulo

### Plantilla 6. El cálculo de retorno
**Asunto:** Cuentas rápidas sobre lo que hablamos

Hola [Nombre],

Después de la llamada hice un análisis.

Con base en su [métrica], resolver [problema] probablemente:
- Ahorraría [horas o dinero] por [periodo]
- Aumentaría [métrica] cerca de un [porcentaje]
- Recuperarían la inversión en [plazo]

Supuestos:
- [Supuesto basado en sus datos]
- [Supuesto]

¿Revisamos el cálculo completo?

[Firma]

### Plantilla 7. La mirada de otra área
**Asunto:** Pensando en la perspectiva de [área]

Hola [Nombre],

Después de nuestra conversación caí en cuenta de que a [otra área] quizá le importe esto incluso más que a [tu área].

Probablemente verían valor en:
- [Beneficio para esa área]
- [Beneficio para esa área]

¿Tiene sentido invitar a [cargo o área] para conocer su opinión?

Si te sirve, preparo un resumen enfocado en [área].

[Firma]

### Plantilla 8. Inteligencia competitiva
**Asunto:** Lo que [competidor] no te está contando

Hola [Nombre],

Vi que ayer [competidor] anunció [iniciativa similar].

Por dentro, lo que enfrentan es [reto de ese enfoque].

Ayudamos a [empresa similar] a superar a ese mismo competidor con [enfoque distinto].

¿Te interesan los detalles?

[Firma]

### Plantilla 9. Reducir el riesgo
**Asunto:** Cómo prevenir [riesgo] que mencionaste

Hola [Nombre],

He estado pensando en tu preocupación por [riesgo].

[Empresa similar] tenía la misma inquietud. Incluimos estas protecciones:
- [Protección]
- [Protección]
- [Plan de contingencia]

Cero incidentes en [tiempo] de operación.

¿Este enfoque resuelve tus dudas?

[Firma]

### Plantilla 10. Oferta de piloto
**Asunto:** ¿Empezamos en pequeño con [solución]?

Hola [Nombre],

Entiendo que comprometerse con una implementación completa se siente grande.

¿Y si empezamos con un piloto?
- [Alcance limitado]
- [Plazo más corto]
- [Menor inversión]
- [Métricas de éxito claras]

[Empresa similar] empezó así. Después de ver [resultado], ampliaron de inmediato.

Menos riesgo y la misma información. ¿Te interesa?

[Firma]

## Manejo de objeciones

### Plantilla 11. ¿Sigues interesado?
**Asunto:** ¿Cierro tu caso?

Hola [Nombre],

En [fecha] hablamos de [solución] para [reto].

No he tenido respuesta, así que me pregunto si
A) cambiaron las prioridades,
B) lo resolvieron de otra forma, o
C) sigue el interés pero no es buen momento.

Sin presión. Solo cuéntame si cierro tu caso o te escribo de nuevo en [plazo].

[Firma]

### Plantilla 12. La objeción de presupuesto
**Asunto:** Re: Inquietudes de presupuesto

Hola [Nombre],

Entiendo que el presupuesto está apretado. Dos ideas.
- [Empresa similar] empezó con nuestra [opción más pequeña] y vio retorno en [plazo]
- No resolver [problema] probablemente les cuesta [costo o riesgo]

¿Alguna de estas opciones les funciona mejor?

¿O lo retomamos cuando se abra el nuevo presupuesto?

[Firma]

### Plantilla 13. "Necesito más información"
**Asunto:** Los detalles que pediste

Hola [Nombre],

Me pediste más detalles sobre [aspecto]. Aquí van.
- [Detalle 1, breve]
- [Detalle 2, breve]
- [Detalle 3, breve]

Documentación completa aquí: [enlace]

¿Qué otra inquietud te resuelvo?

[Firma]

### Plantilla 14. Necesita aprobación interna
**Asunto:** ¿Te ayudo a convencer a [persona clave]?

Hola [Nombre],

Mencionaste que necesitas el visto bueno de [persona o equipo].

Preparé un caso de negocio de una página que responde sus posibles dudas.
- [Duda 1], [respuesta breve]
- [Duda 2], [respuesta breve]
- [Retorno para su área], [beneficio específico]

¿Te lo envío? ¿O me uno a una llamada para presentarlo directamente?

[Firma]

### Plantilla 15. "Estoy muy ocupado"
**Asunto:** Mal momento, lo entiendo

Hola [Nombre],

Me contaste que estás a tope con [prioridad].

Una idea rápida. [Solución] podría ayudarte justo con [prioridad] porque [cómo ayuda].

Si ahora no es el momento, ¿cuándo te vuelvo a escribir? ¿Después de [evento o plazo]?

Me anoto retomarlo en esa fecha, salvo que me digas otra cosa.

[Firma]

## Seguimientos por tiempo

### Plantilla 16. "Escríbeme más adelante"
**Asunto:** Me pediste retomar en [plazo]

Hola [Nombre],

Cuando hablamos en [mes], mencionaste que [prioridad] iba a retrasar la decisión.

Me pediste escribirte ahora.

¿Cambió [situación]? Si es así, esto es lo nuevo de nuestro lado: [novedad relevante].

¿Retomamos o te escribo de nuevo en [plazo]?

[Firma]

### Plantilla 17. Cierre de trimestre o de año
**Asunto:** Se acerca el cierre de [Q4 o año]

Hola [Nombre],

Un recordatorio rápido. Si [Empresa] quiere [resultado] antes del cierre de [trimestre o año], tendríamos que empezar a más tardar el [fecha].

Cronograma
- Implementación, [plazo]
- Primeros resultados, [plazo]
- Retorno completo, [plazo]

Todavía se puede, pero el margen se está cerrando. ¿Te interesa?

[Firma]

### Plantilla 18. Relevancia por temporada
**Asunto:** Época de planear [temporada o evento]

Hola [Nombre],

Ya empezó la planeación de [temporada o evento]. El año pasado mencionaste [reto en esa época].

Desde entonces hemos ayudado a [número] empresas a prepararse para [temporada o evento] con [solución].

Resultado promedio, [mejora específica].

¿Evitamos el corre-corre del año pasado?

[Firma]

### Plantilla 19. El aniversario
**Asunto:** Un año desde [evento]

Hola [Nombre],

Ya se cumplió un año de [evento: lanzamiento, iniciativa, etc.].

¿Cómo les fue con [métrica]?

Si no cumplió lo esperado, tenemos enfoques nuevos que el año pasado no existían.

¿Hacemos una llamada para ponernos al día?

[Firma]

## Después de una interacción

### Plantilla 20. Después de dejar un mensaje de voz
**Asunto:** Intenté llamarte por [motivo]

Hola [Nombre],

Te acabo de llamar por [tema o urgencia].

En corto, [resumen de una o dos frases].

Vuelvo a intentar el [día] a las [hora], pero si prefieres puedes:
- Responder con un mejor horario
- Llamarme al [número]
- Decirme si te queda mejor el correo

[Firma]

### Plantilla 21. Después de una demo o reunión
**Asunto:** Próximos pasos de la llamada del [día]

Hola [Nombre],

Gracias por tu tiempo el [día]. Por lo que me contaste sobre [reto], esto es lo que recomiendo.

Próximos pasos
- [Acción]
- [Acción]
- [Decisión pendiente]

Mencionaste que querías [meta]. Con este enfoque lo lograrían en [plazo].

¿Qué preguntas te surgieron después de la llamada?

[Firma]

### Plantilla 22. Después de interactuar con contenido
**Asunto:** Vi que revisaste [recurso]

Hola [Nombre],

Noté que [descargaste o viste] nuestro [recurso] sobre [tema].

La mayoría de quienes lo revisan intenta resolver [problema]. ¿Es tu caso?

Si es así, el recurso muestra el qué, pero no siempre el cómo. Con gusto te cuento cómo lo implementó [empresa similar].

¿Hablamos un momento?

[Firma]

### Plantilla 23. Después de registrarse a una prueba gratis
**Asunto:** ¿Le estás sacando provecho a la prueba de [producto]?

Hola [Nombre],

Vi que llevas [X días] de prueba. Te escribo rápido.

¿Te has trabado en algo? La mayoría necesita ayuda con:
- [Reto común 1]
- [Reto común 2]

[Empresa similar] logró [resultado] en su primera semana enfocándose en [función o caso de uso].

¿Quieres que te muestre cómo lo hicieron?

[Firma]

### Plantilla 24. Después de hablar de precio
**Asunto:** ¿Qué te pareció la propuesta económica?

Hola [Nombre],

Te escribo por la propuesta de precio que te envié para [solución].

Sé que [monto] es una inversión importante. Como referencia, [empresa similar] la recuperó en [plazo] gracias a [factor de retorno].

¿Te ayudaría
- ver el cálculo de retorno,
- empezar con un paquete más pequeño, o
- hablar con [empresa similar] para conocer su experiencia?

¿Qué te facilitaría tomar la decisión?

[Firma]

## Mantener la relación

### Plantilla 25. "Voy a estar en tu ciudad"
**Asunto:** ¿Un café en [ciudad] el [fecha]?

Hola [Nombre],

Voy a estar en [ciudad] el [fecha] por [contexto: reuniones con clientes o un evento].

¿Tienes 30 minutos para un café? Me encantaría conocerte en persona y saber cómo va [iniciativa].

¿[Lugar] a las [hora] o a las [hora]?

[Firma]

### Plantilla 26. Saludo sin intención de venta
**Asunto:** Sigo pensando en tu reto con [tema]

Hola [Nombre],

Esto no es una venta, solo quería compartirte algo.

¿Recuerdas tu reto con [tema]? Acabo de ver que [empresa similar] lo resolvió con [enfoque inesperado].

Pensé que te gustaría saber que hay otra forma de hacerlo.

Si algún día quieres detalles, ya sabes dónde encontrarme.

[Firma]

### Plantilla 27. Felicitación
**Asunto:** Felicidades por [logro]

Hola [Nombre],

Vi la noticia de [logro]. ¡Excelente!

Seguramente esto trae [siguiente reto u oportunidad]. Si necesitas apoyo en eso, tenemos experiencia que vale la pena compartir.

En cualquier caso, felicidades de nuevo. Bien merecido.

[Firma]

## Seguimientos para cerrar

### Plantilla 28. "¿Qué tendría que cambiar?"
**Asunto:** Una pregunta rápida

Hola [Nombre],

Gracias por contarme que esto no es prioridad ahora.

Una pregunta. ¿Qué tendría que cambiar en [Empresa] para que valga la pena explorarlo?

Tu respuesta me ayuda a saber si vuelvo a escribirte y cuándo.

Gracias por la franqueza.

[Firma]

### Plantilla 29. Plan de cierre conjunto
**Asunto:** Pasos para trabajar juntos, [Empresa] y [Tu empresa]

Hola [Nombre],

Para asegurarnos de estar alineados, esto es lo que tiene que pasar para avanzar.

De su lado
- [ ] [Requisito]
- [ ] [Requisito]

De nuestro lado
- [ ] [Entregable]
- [ ] [Entregable]

Fecha objetivo de decisión, [fecha].

¿Coincide con lo que tienes en mente? ¿Qué falta?

[Firma]

### Plantilla 30. La evaluación honesta
**Asunto:** ¿Seguimos?

Hola [Nombre],

Llevamos [número] correos en [plazo].

O estoy
A) entendiendo mal lo que necesitas,
B) escribiéndote en mal momento, o
C) ofreciendo algo que en realidad no necesitas.

¿Cuál es? Sin resentimientos, solo quiero respetar tu tiempo (y el mío).

Si es A o B, con gusto ajusto. Si es C, dejo de escribirte.

[Firma]

---

# BLOQUE 3. DESPEDIDA O CIERRE DE CICLO (20)

## Despedidas directas

### Plantilla 1. Las tres opciones
**Asunto:** ¿Dejo de escribirte?

Hola [Nombre],

Te he escrito [número] veces sobre [solución o reto] y no he tenido respuesta. Eso me dice una de tres cosas.
1. Resolvieron [reto] de otra forma. ¡Felicidades!
2. No es prioridad ahora. Lo entiendo.
3. Te interesa pero estás a tope. Me ha pasado.

Respóndeme con 1, 2 o 3 y actúo según eso.

[Firma]

### Plantilla 2. Permiso para cerrar
**Asunto:** ¿Puedo cerrar tu caso?

Hola [Nombre],

Estoy depurando mis oportunidades de [mes o trimestre].

Como no he tenido respuesta sobre [solución conversada], pienso cerrar tu caso.

Si todavía te interesa [resultado o beneficio], avísame. Si no, asumiré que no es el momento y dejaré de escribirte.

¿Te parece justo?

[Firma]

### Plantilla 3. La revisión honesta
**Asunto:** ¿Leí mal la situación?

Hola [Nombre],

Después de [número] intentos de hablar sobre [tema], me pregunto si interpreté mal tu interés.

Si fue así, no pasa nada. Ocurre.

Solo cuéntame para saber si dejo de llenarte el correo o sigo ayudándote con [reto].

[Firma]

### Plantilla 4. No es el momento
**Asunto:** No es el momento, dejo de escribir

Hola [Nombre],

Está claro que este no es el momento para que [Empresa] resuelva [reto].

Dejo de escribirte, pero te dejo esta idea. Cuando pase [evento detonante], es cuando empresas como la tuya suelen necesitar lo que hacemos.

Escríbeme entonces. Aquí estaré.

[Firma]

### Plantilla 5. La pregunta directa
**Asunto:** ¿Sí o no?

Hola [Nombre],

Una pregunta simple. ¿Sigues interesado en resolver [problema]?

- Si respondes "Sí", te envío los próximos pasos
- Si respondes "No", cierro tu caso
- Si no respondes, asumiré que es un no y dejaré de escribirte

[Firma]

## Recordar el valor antes de irse

### Plantilla 6. El costo de no hacer nada
**Asunto:** Me despido, pero antes una idea

Hola [Nombre],

Este es mi último correo. Antes de irme, piensa en esto.

[Problema] suele costarle a empresas como la tuya
- [Costo o impacto 1]
- [Costo o impacto 2]
- [Oportunidad perdida]

Cuando quieras resolverlo, ya sabes dónde encontrarme.

Mucha suerte con [iniciativa].

[Firma]

### Plantilla 7. El competidor que sí avanzó
**Asunto:** Cierro tu caso, novedad sobre [competidor]

Hola [Nombre],

Como no he tenido respuesta, voy a cerrar tu caso.

Una novedad rápida. [Competidor] acaba de implementar lo que hablamos y ya está viendo [resultado].

Si algún día quieres saber cómo lo hicieron, aquí estoy.

¡Éxitos!

[Firma]

### Plantilla 8. Dónde podrían estar
**Asunto:** Dónde podría estar [Empresa]

Hola [Nombre],

Último correo y me retiro.

A estas alturas, [Empresa] ya podría tener
- [Logro según el plazo]
- [Mejora en métrica]
- [Ventaja competitiva]

Todavía están a tiempo. Pero dejo que tú des el siguiente paso.

Saludos,

[Firma]

### Plantilla 9. La oportunidad perdida
**Asunto:** La oportunidad que hablamos ya pasó

Hola [Nombre],

¿Recuerdas [oportunidad] que conversamos? Esa ventana ya se cerró.

[Detalle de lo que se perdieron].

Vendrán otras, pero esta ya pasó.

Cuando llegue la próxima, ya sabes dónde encontrarme.

[Firma]

## Ofrecer una alternativa

### Plantilla 10. La opción más pequeña
**Asunto:** ¿Te ofrecí lo que no era?

Hola [Nombre],

Quizá entendí mal tus necesidades y te ofrecí demasiado y demasiado rápido.

¿Tendría más sentido algo más pequeño?
- [Opción ligera]
- [Programa piloto]
- [Solo consultoría]

Si no, no te preocupes. De todas formas este es mi último correo.

[Firma]

### Plantilla 11. Pedir una referencia
**Asunto:** Si no eres tú, ¿quién?

Hola [Nombre],

Parece que esto no es para ti por ahora. No hay problema.

Una pregunta rápida. ¿Quién de tu red está lidiando con [reto]? Con gusto le ayudo.

No te vuelvo a molestar, pero te agradecería cualquier referencia.

Gracias,

[Firma]

### Plantilla 12. Despedida con recursos gratis
**Asunto:** Algo de ayuda gratis antes de irme

Hola [Nombre],

Como no vamos a trabajar juntos, te dejo algunos recursos gratuitos para [reto].
- [Recurso 1]
- [Recurso 2]
- [Plantilla o guía para su situación]

Te van a servir para lo básico.

Si necesitas algo más que hacerlo por tu cuenta, ya sabes dónde encontrarme.

Saludos,

[Firma]

## Romper el patrón

### Plantilla 13. La nota del CEO
**Asunto:** Una nota de nuestro CEO

Hola [Nombre],

Nuestro CEO me preguntó por qué no pudimos ayudar a [Empresa] con [reto].

Le dije que no habías respondido. Me pidió intentarlo una vez más.

Así que aquí estoy. ¿Sigues interesado? Si no, le diré que lo intentamos.

[Firma]

P. D. Este sí es mi último correo.

### Plantilla 14. La verdad sin adornos
**Asunto:** Por qué dejo de insistir

Hola [Nombre],

Me rindo, y te cuento por qué.

Después de [número] intentos sin respuesta, entiendo que [solución] no es tan importante para [Empresa] como para dedicarle 15 minutos.

Cuando lo sea (suele pasar cuando [evento detonante]), escríbeme.

Mientras tanto, me retiro.

[Firma]

### Plantilla 15. Con humor
**Asunto:** 🎵 Lo nuestro terminó (por ahora) 🎵

Hola [Nombre],

Como Taylor Swift, sé cuándo es momento de seguir adelante.

Pero a diferencia de Taylor, con gusto volvemos si algún día quieres resolver [reto].

Mientras tanto, considera esto mi última serenata.

[Firma]

P. D. Te prometo que mi solución funciona mejor que mi humor.

## Mirar hacia adelante

### Plantilla 16. Retomar el próximo trimestre
**Asunto:** ¿Hablamos en el Q[X]?

Hola [Nombre],

Cierro tu caso por ahora, pero sé que las prioridades cambian.

Te vuelvo a escribir en [3 meses], cuando
- se abran los nuevos presupuestos,
- empiece la planeación de [evento de temporada], o
- [evento del sector] pueda cambiar las prioridades.

Salvo que me digas lo contrario, espera un correo en [mes].

¿Te parece?

[Firma]

### Plantilla 17. La puerta abierta
**Asunto:** Aquí sigo cuando lo necesites

Hola [Nombre],

Este es mi último correo programado, pero sigo disponible.

Cuando [Empresa] esté lista para [resultado], este es mi número directo: [teléfono]

Sin intermediarios ni procesos de venta. Solo soluciones.

De verdad te deseo éxito con [reto].

[Firma]

P. D. Guarda este correo. Te puede servir cuando pase [evento detonante].

### Plantilla 18. Nos vemos en 6 meses
**Asunto:** ¿Hablamos en 6 meses?

Hola [Nombre],

Me quedo en silencio por ahora, pero te escribo de nuevo en 6 meses.

¿Por qué entonces? Porque es cuando las empresas que descartan [solución] suelen darse cuenta de que la necesitan.

Si quieres hablar antes, ya tienes mis datos.

[Firma]

## Situaciones especiales

### Plantilla 19. Recuperar un negocio perdido
**Asunto:** ¿Cómo te va con [solución del competidor]?

Hola [Nombre],

Han pasado [plazo] desde que eligieron a [competidor].

Solo quería saber cómo les está funcionando.

Si es todo lo que esperaban, excelente. Si no, aquí estoy.

Varios de nuestros mejores clientes probaron primero a [competidor].

[Firma]

### Plantilla 20. Después de un no
**Asunto:** Gracias por la respuesta sincera

Hola [Nombre],

Gracias por contarme que eligieron [otra solución o ninguna].

Respeto la decisión. [Lo que aprendiste de ellos] nos ayudó a mejorar nuestro enfoque.

Si las cosas no salen como esperan, aquí estoy. Sin reproches, solo para ayudar.

Mucha suerte,

[Firma]

---

# BLOQUE 4. CORREO EN FRÍO, HALLAZGOS Y PLANTILLAS (FUENTE APOLLO)

Las cifras de este bloque vienen del análisis que publicó Apollo sobre correos de alto desempeño. Son datos de esa empresa, no de una investigación independiente.

## Cómo leen correo los ejecutivos

Apollo analizó miles de correos en frío enviados a CEO, fundadores y directores comerciales. Solo el 8 % obtuvo respuestas útiles, y ese 8 % seguía patrones repetibles. El otro 92 % falló por romper alguna de las reglas de este bloque.

- **Regla de los 3 segundos.** Un ejecutivo tarda en promedio 3 segundos en decidir si lee, reenvía o borra. El asunto y la primera frase lo definen todo.
- **Lectura en el celular.** El 73 % de las aperturas de ejecutivos ocurre en el celular, casi siempre entre reuniones. El valor tiene que llegar antes de deslizar el pulgar.
- **Filtro de patrones.** Los ejecutivos reconocen una plantilla genérica desde la primera palabra. Sin personalización, el correo no sobrevive.

## Hallazgo 1. Asuntos que sobreviven a la bandeja de entrada

**El dato.** Los asuntos de los correos con mejor resultado tienen en promedio 7,4 palabras y 49 caracteres.

**Por qué funciona.** Son lo bastante cortos para leerse en el celular y lo bastante específicos para despertar curiosidad.

**Lo que encontraron**
- Mencionar algo concreto rinde más. "Sobre su lanzamiento del Q3" superó a "Una pregunta rápida" en 340 %.
- Incluir el nombre de la empresa en el asunto subió la tasa de apertura 23 %.
- Ningún correo de alto desempeño usó palabras exageradas como "revolucionario", "disruptivo" o "exclusivo".

**Fórmulas de asunto que funcionan**
- "Sobre su [iniciativa específica]"
- "Una pregunta sobre [evento de la empresa]"
- "Vi esto en [nombre de la empresa]"
- "Cómo [empresa par] resolvió [problema específico]"
- "[Nombre], pensé en [empresa] cuando vi esto"

### Plantilla A1. El gancho del evento reciente
**Cuándo usarla.** La empresa acaba de anunciar financiación, un producto nuevo, una adquisición o una contratación importante.

**Asunto:** Felicidades por [evento específico]

Hola {{nombre}},

Felicidades por [evento específico + un detalle que muestre que leíste la noticia]. Con [contexto del evento], imagino que [reto probable] está entre sus prioridades.

Acabamos de ayudar a {{empresa_par}} con algo parecido después de [tipo de evento] y lograron [resultado concreto en X tiempo].

¿Te sirve una llamada corta para contarte qué les funcionó?

Saludos, {{tu_nombre}}

**Por qué funciona.** Muestra que sigues su negocio, conecta el evento con un reto probable y aporta la prueba de una empresa par.

## Hallazgo 2. Aperturas que demuestran que investigaste

**El dato.** El 100 % de los correos de alto desempeño usó el nombre de la persona. El 67 % mencionó noticias recientes de la empresa o algo propio del cargo.

**Fórmula del gancho de investigación.** Empieza con algo que demuestre que entiendes su mundo.
- Financiación o adquisición reciente
- Lanzamiento de producto o función
- Contratación o ascenso de un ejecutivo
- Premio o reconocimiento del sector
- Resultados trimestrales o anuncio de la empresa

**Ejemplos que funcionan**
- "Vi que acaban de cerrar la Serie B, felicidades por la ronda de $15 millones."
- "Por las vacantes recientes, veo que este trimestre se están expandiendo a Europa."
- "Felicidades por la nota en TechCrunch sobre sus nuevas capacidades de IA."

**Ejemplos que fallan**
- "Espero que te encuentres bien."
- "Sé que estás ocupado, pero..."
- "Me encontré tu perfil en LinkedIn."

### Plantilla A2. Primero el problema
**Cuándo usarla.** Identificaste un problema que la empresa probablemente enfrenta por su sector, tamaño o cambios recientes.

**Asunto:** Una pregunta sobre [área del negocio]

Hola {{nombre}},

Noté [observación específica sobre la empresa o el sector]. Es justo lo que vivía {{empresa_par}} antes de que les ayudáramos a [resultado concreto].

El enfoque que usamos podría funcionar también para {{empresa}}, y es bastante distinto de lo que intenta la mayoría de empresas de [sector].

¿Te sirve una llamada de 10 minutos para mostrarte la estrategia?

{{tu_nombre}}

**Por qué funciona.** Abre con una observación y no con una venta, y deja curiosidad sobre el "enfoque distinto".

## Hallazgo 3. Propuesta de valor en una sola frase

**El dato.** Los correos de alto desempeño explicaron su valor central en 15 palabras o menos.

**La fórmula.** Ayudamos a [tipo de empresa] a [resultado concreto] sin [dolor común].

**Propuestas fuertes**
- "Ayudamos a empresas SaaS a reducir la cancelación de clientes 25 % sin cambiar su plan de producto."
- "Ayudamos a equipos comerciales a agendar 40 % más reuniones sin contratar más personas."
- "Ayudamos a equipos de marketing a demostrar el retorno de su inversión en generación de demanda sin modelos de atribución complicados."

**Propuestas débiles**
- "Ofrecemos soluciones integrales para empresas que quieren crecer."
- "Nuestra plataforma transforma la manera en que las empresas se relacionan con sus clientes."
- "Usamos tecnología de punta para generar resultados."

### Plantilla A3. La comparación con un par
**Cuándo usarla.** Tienes un caso de éxito sólido de una empresa parecida.

**Asunto:** Cómo [empresa par] logró [métrica específica]

Hola {{nombre}},

{{empresa_par}} acaba de lograr [logro específico] con un enfoque bastante distinto al habitual en [sector].

Por lo que sé de [iniciativa o meta] de {{empresa}}, creo que podrían ver resultados parecidos.

¿Te envío el resumen de 3 minutos de lo que hicieron?

{{tu_nombre}}

**Por qué funciona.** A los ejecutivos les pesa compararse con sus pares. Además entrega valor antes de pedir tiempo.

## Hallazgo 4. Prueba social que presta confianza

**El dato.** El 78 % de los correos de alto desempeño incluyó referencias a empresas pares o métricas concretas.

**Estrategia con empresas pares.** Menciona empresas de tamaño, sector o región parecidos.
- "Acabamos de ayudar a [empresa similar] a bajar su ciclo de venta de 90 a 45 días."
- "El mes pasado, [empresa par] usó nuestro enfoque para llegar al 127 % de su cuota."

**Prueba con métricas.** Sé específico con los números.
- "Redujimos el tiempo de incorporación de 14 días a 3"
- "Aumentamos 73 % las oportunidades calificadas en 60 días"
- "Bajamos el costo de adquisición en $2.400 por negocio"

**Contactos en común.** Cuando sea posible, menciona a alguien que ambos conozcan.
- "[Contacto en común] me dijo que te podría interesar cómo ayudamos a [su empresa]."

### Plantilla A4. El gancho de tendencia del sector
**Cuándo usarla.** Hay una tendencia o cambio del sector que afecta su negocio.

**Asunto:** [Nombre], una idea sobre [tendencia del sector]

Hola {{nombre}},

Seguramente ya viste cómo [tendencia o cambio] está afectando a [su sector]. La mayoría de empresas responde con [enfoque común], pero hay una forma mejor.

Ayudamos a {{empresa_par}} a convertir este mismo reto en una ventaja frente a su competencia, [resultado concreto en un plazo].

¿Te gustaría saber si este enfoque podría funcionar en {{empresa}}?

{{tu_nombre}}

**Por qué funciona.** Te ubica como conocedor del sector, cuestiona la respuesta habitual y sugiere una ventaja competitiva.

## Hallazgo 5. Llamados a la acción que suenan a conversación

**El dato.** El 73 % de los correos de alto desempeño terminó con una pregunta y no con una afirmación.

**Preguntas de cierre que funcionan**
- "¿Te sirve una llamada de 10 minutos para ver si esto aplica a [empresa]?"
- "¿Te gustaría saber cómo [empresa par] resolvió este reto?"
- "¿Te da curiosidad saber si este enfoque ayudaría a [empresa] a lograr [meta]?"
- "¿Te envío el caso de éxito de 2 minutos?"

**Cuándo usar enlace de agenda** (aparece en el 27 % de los correos de alto desempeño)
- Solo después de que haya interés inicial
- Ofrece franjas concretas, por ejemplo "¿Tienes 15 minutos el martes o el miércoles en la mañana?"
- Preséntalo como un compromiso pequeño, por ejemplo "una llamada corta para ver si encajamos"

### Plantilla A5. El contacto en común
**Cuándo usarla.** Tienes un contacto en común real que te da credibilidad.

**Asunto:** [Contacto en común] me sugirió escribirte

Hola {{nombre}},

{{contacto_en_comun}} me comentó que te podría interesar cómo ayudamos a [su empresa o una empresa similar] a [resultado concreto].

El enfoque es bastante sencillo y podría servirle a {{empresa}} para [meta o iniciativa].

¿Te sirve una llamada corta para revisar los detalles?

{{tu_nombre}}

**Por qué funciona.** Toma prestada la confianza del contacto, es concreto sobre el resultado y el cierre no presiona.

## Hallazgo 6. Una estructura que se lee como un mensaje de texto

**El dato.** Los correos de alto desempeño tienen en promedio 127 palabras, y cada párrafo 1,8 oraciones.

**Estructura fácil de leer**
1. Apertura personalizada (1 oración)
2. Propuesta de valor (1 o 2 oraciones)
3. Prueba social o credibilidad (1 oración)
4. Llamado a la acción simple (1 pregunta)

**Reglas de formato**
- Máximo 3 oraciones por párrafo
- Sin viñetas en el primer correo en frío (guárdalas para los seguimientos)
- Sin adjuntos en el primer contacto
- Texto plano, sin diseño HTML

### Plantilla A6. Valor rápido de entrada
**Cuándo usarla.** Tienes un recurso o una idea valiosa para compartir desde el principio.

**Asunto:** Lectura de 2 minutos, [idea específica] para [empresa]

Hola {{nombre}},

Vi que {{empresa}} está [iniciativa específica]. Me recordó una estrategia que ayudó a {{empresa_par}} a [resultado concreto] en [plazo].

Aquí va el resumen de 2 minutos: [idea breve o enlace al recurso].

¿Crees que este enfoque podría funcionar en {{empresa}}?

{{tu_nombre}}

**Por qué funciona.** Empieza dando valor y no pidiendo algo. El compromiso es corto y el resultado, concreto.

## Personalización avanzada

### Investigación previa de la empresa
Antes de escribir cualquier correo en frío, dedica 3 minutos a reunir esto.
- **Noticias recientes.** Financiación, lanzamientos, contrataciones de ejecutivos.
- **Contexto del sector.** Tendencias que afectan su negocio.
- **Información de pares.** Qué están haciendo empresas parecidas.
- **Información personal.** Publicaciones recientes, charlas, entrevistas en podcasts.

### Ángulo según el cargo
- **CEO.** Ventaja competitiva, posición en el mercado y métricas de crecimiento.
- **Director comercial.** Oportunidades en curso, cumplimiento de cuota y eficiencia.
- **Director de marketing.** Atribución, retorno de la inversión y calidad de los leads.
- **Fundador.** Rapidez, simplicidad y retos para crecer.

### Momento de envío
Según los datos de Apollo sobre cuándo leen correo los ejecutivos:
- **Mejores días.** De martes a jueves.
- **Mejor horario.** De 8 a 10 a. m. en la zona horaria del prospecto.
- **Evitar.** Viernes en la tarde, lunes en la mañana y el cierre o inicio de trimestre.

## Errores que hunden la tasa de respuesta

- **Enviar a todos lo mismo.** Mandar la misma plantilla genérica a 500 prospectos. Los ejecutivos detectan un correo masivo de inmediato.
- **Lista de funciones.** Enumerar capacidades del producto en lugar de resultados para el negocio. A ningún ejecutivo le importan tus 47 funciones.
- **Seguimiento agresivo.** Escribir todos los días o usar culpa y presión. Eso daña la relación para siempre.
- **Exceso de adjuntos.** Incluir PDF, casos o presentaciones en el primer correo. Se nota de lejos que es una venta.
- **Asunto débil.** Usar asuntos vagos como "Una pregunta rápida" o "Haciendo seguimiento". Se borran sin abrir.

## Cómo medir el desempeño

**Métricas principales**
- **Tasa de apertura.** Apollo proponía 40 % o más. Datos más recientes (ver Bloque 6) ubican lo aceptable entre 15 % y 25 %, y la apertura ya no es confiable por las protecciones de privacidad de Apple.
- **Tasa de respuesta.** Apollo proponía entre 8 % y 12 %. El promedio actual está entre 3,4 % y 5,8 %, y solo las mejores campañas pasan de 10 %.
- **Tasa de reuniones agendadas.** Entre 3 % y 5 %. Depende del llamado a la acción.

**Métricas secundarias**
- **Tiempo hasta la primera respuesta.** Si es rápido, hay más interés.
- **Tono de la respuesta.** Positivo, neutral o negativo.
- **Reenvíos.** Correos que se comparten dentro de la empresa.

**Seguimiento avanzado** (con la medición de interacción de Apollo)
- Qué prospectos abrieron el correo varias veces
- Cuánto tiempo pasaron leyéndolo
- En qué enlaces hicieron clic
- Cómo responden a los seguimientos

## Secuencia de seguimiento

El correo en frío casi nunca se gana en el primer intento. Esta es la cadencia que propone Apollo.

1. **Contacto 1, valor inicial.** El correo en frío, con cualquiera de las plantillas de este bloque.
2. **Contacto 2, valor adicional (3 días después).** Un recurso, caso de éxito o dato del sector.
3. **Contacto 3, otro ángulo (1 semana después).** Una propuesta de valor o enfoque distinto.
4. **Contacto 4, despedida suave (1 semana después).** Una salida fácil que deja la puerta abierta.
5. **Contacto 5, relación a largo plazo (3 meses después).** Retomar con un nuevo detonante o una idea nueva.

## Cómo cargar las plantillas en Apollo

1. Entra a Sequences en el panel de Apollo.
2. Crea una secuencia nueva y elige "Email".
3. Pega la plantilla personalizada con las variables en formato {{variable}}.
4. Define las reglas de envío (martes a jueves, de 8 a 10 a. m. en la zona horaria del prospecto).
5. Agrega los pasos de seguimiento según la secuencia anterior.
6. Prueba con un grupo pequeño antes de escalar.

## Idea de cierre del documento original

Según Apollo, el correo en frío sigue funcionando; lo que dejó de funcionar es el correo en frío mal hecho. Los ejecutivos que respondieron lo hicieron porque el remitente demostraba conocer su negocio, aportaba algo útil y les facilitaba aceptar una conversación. Su conclusión es que con estas plantillas y reglas se puede pasar del 92 % de correos ignorados al 8 % que recibe respuesta.', true, now() + interval '3 seconds'),
  ('pmuzvf0cw893wo', 'Perfil del cliente Ideal', 'Estrategia', 'Avanzado', '', '', 'Actúa como estratega de marketing especializado en investigación de clientes y mercados.

Quiero definir el cliente ideal para [EMPRESA], que ofrece [PRODUCTO/SERVICIO].

Antes de comenzar, hazme máximo 5 preguntas para completar la información necesaria. Agrupa las preguntas cuando sea posible. No empieces el análisis hasta tener las respuestas.

Con la información disponible, construye un perfil accionable del cliente ideal.

Incluye:

1. Cliente ideal
Define quién tiene mayor probabilidad de necesitar y comprar [PRODUCTO/SERVICIO].

2. Características demográficas o empresariales
Incluye edad, ubicación, ingresos, profesión, cargo, tamaño de empresa, industria u otras variables relevantes según se trate de B2C o B2B.

3. Características psicográficas y conductuales
Identifica motivaciones, prioridades, intereses, hábitos de compra, criterios de decisión y factores de confianza.

4. Problemas y necesidades
Identifica sus principales problemas, dolores, necesidades y situaciones que busca resolver.

5. Nichos o segmentos
Identifica los principales segmentos donde podría encontrarse este cliente y explica las diferencias entre ellos.

6. Qué busca en internet
Identifica preguntas, problemas, soluciones, productos, servicios y temas que probablemente busca antes de comprar.

Organiza las búsquedas según intención cuando sea posible:
información, problema, solución, comparación y compra.

7. Comportamiento de compra
Describe cómo enfrenta actualmente el problema, qué alternativas utiliza y qué podría impedirle comprar.

8. Priorización
Selecciona los 3 segmentos con mayor potencial comercial y explica por qué.

Entrega el resultado de forma práctica y específica. Evita crear un buyer persona genérico.
Este documento será utilizado como entrada para una posterior investigación de mercado y competencia.', true, now() + interval '4 seconds'),
  ('kterra-cotizacion-viaje', 'Cotización de viaje Terra Panamerica', 'Ventas', 'Intermedio', 'Cotización, Turismo, Viajes a medida, Terra Panamerica', 'Convertir una solicitud de viaje en una cotización clara, cálida y lista para enviar, con el estilo de Terra Panamerica (viajes a medida, responsables y auténticos por las Américas). Sirve para cualquier asesor, cualquier viajero y cualquier país de origen: adapta el idioma, la moneda y los requisitos de viaje a cada caso.', 'Actúa como asesor de viajes senior de **Terra Panamerica**, una red de agencias locales especializadas en viajes a medida por las Américas, con el lema **"Nothing like home"**. Tu trabajo es preparar una cotización profesional para un viajero y el mensaje con el que se la envías.

### Quién es Terra Panamerica (úsalo para el tono y los argumentos)

- Red de agencias locales con equipos en cada destino: **Canadá, Alaska, México, Guatemala, Belice, Nicaragua, Costa Rica, Panamá, Colombia y República Dominicana**.
- Viajes a medida, en pequeños grupos, de slow travel, de aventura, solidarios o de alto confort. Colecciones: *Annulation Facile* (cancelación flexible), *Osez l''aventure*, *Feel Good*, *Terra Secreta* y *Grande Traversée*.
- Promesas: **cotización personalizada en 48 horas**, también para salidas de último minuto; itinerarios "que no se parecen a ningún otro"; **viaje responsable**, con prestadores comprometidos y actividades de bajo impacto; y **asistencia 24/7** durante el viaje.
- Tono: evocador, humano y cercano. Habla del viaje como una experiencia auténtica, lejos de la rutina y de los clichés turísticos. "Viajar no es solo cambiar de paisaje."

### Paso 1. Reúne los datos

Pídeme lo que falte, en una sola lista corta. No inventes nada que deba confirmar el viajero:

1. Nombre del viajero, país y ciudad de residencia, e idioma en el que prefiere recibir la cotización.
2. Destino o destinos, y si combina varios países.
3. Fechas o temporada, y duración (número de noches).
4. Número de viajeros: adultos, niños con sus edades, y si viaja en pareja, en familia o en grupo.
5. Estilo de viaje: aventura, cultura, naturaleza, playa, gastronomía, solidario, lujo o slow travel.
6. Nivel de alojamiento: local con encanto, confort o alto standing.
7. Qué debe incluir: vuelos internacionales o no, traslados, guías, actividades, comidas, seguro.
8. Presupuesto aproximado y la moneda en la que quiere verlo.
9. Necesidades especiales: movilidad, alimentación, celebraciones, mascotas.

Si ya te di todo, pasa directo al paso 2.

### Paso 2. Diseña la propuesta

- Menciona el itinerario **solo en resumen, por etapas**: una línea por etapa con la zona, el número de noches y lo más destacado (por ejemplo: "Cartagena · 3 noches · ciudad amurallada y un día en las islas"). Máximo 8 líneas.
- **No lo detalles día por día** ni pongas horarios, actividades hora a hora o comidas de cada día: el itinerario detallado se arma aparte, con la skill de itinerario.
- Menciona al menos **una experiencia auténtica o de encuentro local** y, cuando aplique, una **actividad de turismo responsable**.
- Ajusta las etapas a distancias realistas: que el viaje se pueda vivir con calma.
- Si el viajero pidió algo poco recomendable (temporada de lluvias, ritmo muy apretado), dilo con tacto y propone una alternativa.

### Paso 3. Precios: nunca los inventes

- Si te doy las tarifas, calcula el total, el precio por persona y el desglose por concepto (alojamiento, traslados, actividades, guías, otros).
- Si no te doy tarifas, deja cada valor como **[PRECIO]** y marca la cotización como **borrador para completar**. No pongas cifras estimadas como si fueran reales.
- Muestra los valores en la **moneda del viajero** (USD, EUR, COP, MXN, CAD u otra) e indica que el valor final depende de la disponibilidad y del tipo de cambio en el momento de reservar.
- Indica la **vigencia** de la cotización (por defecto, 7 días) y las condiciones de pago y cancelación como **[CONDICIONES SEGÚN CGV]**, salvo que yo te las dé.

### Paso 4. Adapta al país del viajero

- Escribe en el **idioma del viajero** (español, inglés, francés, portugués u otro).
- Agrega una sección **"Antes de viajar"**: documentos y visa según su nacionalidad, vacunas recomendadas, seguro de viaje, clima en esas fechas, enchufes y moneda local. Si no estás seguro de un requisito migratorio, dilo y recomienda confirmarlo con el consulado o la aerolínea. No lo afirmes como un hecho.
- Usa el formato de fechas y de números habitual de su país.

### Paso 5. Entrega dos piezas

**A. La cotización**, con esta estructura:

1. Encabezado: "Cotización de viaje · Terra Panamerica", con el nombre del viajero, la fecha y el código de cotización (TP-AAAAMMDD-iniciales).
2. Resumen del viaje en 3 líneas: destino, fechas, viajeros y estilo.
3. Itinerario resumido por etapas, y al final la frase: "El itinerario detallado día por día se envía al confirmar la propuesta".
4. Qué incluye y qué no incluye, en dos listas.
5. Precio: total, por persona y desglose (o [PRECIO] si es borrador).
6. Antes de viajar.
7. Por qué viajar con Terra Panamerica: equipo local en destino, viaje a medida, asistencia 24/7 y compromiso responsable. Máximo 4 viñetas.
8. Siguiente paso y vigencia, y el contacto del asesor: **[NOMBRE DEL ASESOR] · [CORREO] · [TELÉFONO/WHATSAPP]**. Si es un solo destino, usa el correo de esa agencia (por ejemplo, terra-colombia, terra-maya para México o terra-dominicana); si no, contact@terra-panamerica.com.

**B. El mensaje para enviarla**, en dos versiones:

- **Correo**: asunto atractivo (máximo 60 caracteres) y un cuerpo de 5 a 8 líneas, que nombre algo concreto y emocionante del viaje, indique que la cotización va adjunta, diga hasta cuándo es válida y cierre con una pregunta que invite a responder.
- **WhatsApp**: máximo 5 líneas, cercano, con un emoji como mucho, y la misma invitación a responder.

### Reglas

- Nada de promesas que no puedas garantizar: ni disponibilidad, ni precios, ni visas.
- Nada de clichés vacíos ("paraíso", "experiencia única en la vida"). Muestra lo concreto: un lugar, un sabor, una persona.
- Sé breve en el mensaje y completo en la cotización.
- Al final, dime qué datos quedaron pendientes de confirmar antes de enviar.', true, now() + interval '5 seconds'),
  ('kterra-alianzas', 'Alianzas y cotizaciones con proveedores Terra Panamerica', 'Operaciones', 'Intermedio', 'Proveedores, Alianzas, Hoteles, Cotización, Terra Panamerica', 'Contactar a hoteles, transportistas, guías y operadores de actividades de cualquier país para proponerles una alianza o pedirles una cotización, con mensajes claros y profesionales que reflejen los criterios de turismo responsable de Terra Panamerica.', 'Actúa como responsable de **alianzas y compras** de **Terra Panamerica**, una red de agencias locales de viajes a medida por las Américas (Canadá, Alaska, México, Guatemala, Belice, Nicaragua, Costa Rica, Panamá, Colombia y República Dominicana). Trabajamos solo con prestadores que comparten nuestra **carta de proveedores**: condiciones de trabajo justas, cero trabajo infantil y cero turismo sexual, empleo y compras locales, bajo impacto ambiental, nada de animales en cautiverio, y seguridad estricta en el transporte.

### Paso 1. Pregúntame qué necesito

En una sola lista corta, pídeme lo que falte:

1. **Tipo de mensaje:** A) propuesta de **alianza** (trabajar juntos de forma estable) o B) **solicitud de cotización** para un viaje concreto.
2. **Tipo de proveedor:** hotel o alojamiento, transporte, guía, operador de actividades, restaurante u otro.
3. Nombre del proveedor, país y ciudad, y la persona de contacto si la conozco.
4. **Canal:** correo, WhatsApp o LinkedIn.
5. **Idioma** del proveedor.
6. Mi nombre, mi agencia (por ejemplo, Terra Colombia) y mi correo o teléfono.
7. **Solo si es cotización:** fechas, número de viajeros (adultos y niños), tipo de habitación o servicio, régimen de comidas, necesidades especiales y fecha límite para responder.
8. **Solo si es alianza:** qué nos interesa de ese proveedor y el volumen estimado de viajeros al año, si lo sé.

### Paso 2. Escribe el mensaje

**A. Propuesta de alianza:**
- Asunto corto y concreto.
- En 2 líneas, quiénes somos: red de agencias locales de viajes a medida y responsables, y qué tipo de viajero enviamos (pequeños grupos y viajeros que buscan autenticidad).
- Por qué ellos: algo específico de su lugar o servicio, no un elogio genérico.
- Qué proponemos: tarifas preferentes para agencia (**tarifa neta o comisión**), condiciones de reserva y de cancelación, y el envío de viajeros de forma regular.
- Qué pedimos: su tarifario de agencia, sus políticas y, si los tienen, sus sellos o prácticas sostenibles.
- Cierre con un siguiente paso claro: una llamada de 20 minutos o la respuesta con el tarifario.

**B. Solicitud de cotización:**
- Asunto: "Solicitud de cotización · [fechas] · [número] viajeros · Terra [país]".
- Los datos del pedido en una lista clara: fechas, viajeros, servicio, comidas y necesidades especiales.
- Pide de forma explícita: tarifa neta por persona o por unidad, qué incluye, impuestos, política de cancelación, condiciones de pago y **vigencia de la tarifa**.
- Fecha límite de respuesta. Recuerda que nosotros cotizamos al viajero en 48 horas.

### Paso 3. Entrega

1. El mensaje en el canal pedido. Correo: máximo 180 palabras. WhatsApp: máximo 6 líneas. LinkedIn: máximo 600 caracteres.
2. **Un seguimiento** corto para enviar si no responden en 3 días hábiles.
3. **Cinco preguntas** para evaluar si el proveedor cumple nuestra carta (por ejemplo, cómo contratan al personal, qué hacen con los residuos o si sus actividades tienen contacto con fauna).

### Reglas

- Tono cordial, profesional y de igual a igual: buscamos socios, no solo precios.
- No prometas volúmenes, fechas ni exclusividad que yo no te haya dado.
- No inventes datos del proveedor: si no los sé, deja [DATO].
- Si el proveedor ofrece algo que choca con nuestra carta (animales en cautiverio, por ejemplo), avísame antes de escribir el mensaje.', true, now() + interval '6 seconds'),
  ('kterra-newsletter', 'Newsletter Terra Panamerica', 'Email marketing', 'Básico', 'Newsletter, Correo, Contenido, Terra Panamerica', 'Que cualquier persona del equipo pueda tener una newsletter lista para enviar con solo decir el tema. Claude decide la estructura, el tono y el llamado a la acción según la marca.', 'Actúa como redactor de la newsletter de **Terra Panamerica**, una red de agencias locales de viajes a medida y responsables por las Américas (Canadá, Alaska, México, Guatemala, Belice, Nicaragua, Costa Rica, Panamá, Colombia y República Dominicana). Lema: **"Nothing like home"**.

### Lo único que me preguntas

**"¿Sobre qué tema es la newsletter?"**

No me preguntes nada más. Con el tema, decide tú lo demás siguiendo estas reglas. Si el tema es muy amplio, elige el ángulo más concreto y dime al final cuál elegiste.

### Cómo escribirla

- **Idioma:** español, salvo que el tema venga escrito en otro idioma; en ese caso, usa ese.
- **Tono:** evocador, humano y cercano, como un amigo local que conoce cada rincón. Concreto: un lugar, un sabor, una persona, un momento. Nada de "paraíso", "experiencia única en la vida", "exótico" ni clichés.
- **Responsable:** cuando encaje, menciona viajar en temporada baja, los encuentros con comunidades locales o las actividades de bajo impacto. Nunca propongas actividades con animales en cautiverio.
- **No inventes** precios, fechas de salida, ofertas ni datos que no puedas sostener. Si hace falta uno, déjalo como [DATO].
- Largo total: entre 300 y 450 palabras.

### Qué me entregas

1. **Tres opciones de asunto** (máximo 50 caracteres cada una) y **un preencabezado** (máximo 90 caracteres).
2. **La newsletter**, con esta estructura:
   - Un saludo corto y una frase de entrada que enganche.
   - **Historia principal:** el tema contado como una escena o una experiencia, con 2 o 3 párrafos cortos.
   - **3 ideas o consejos** concretos relacionados con el tema, en viñetas.
   - **Un viaje o una colección relacionada:** Grande Traversée, Osez l''aventure, Feel Good, Terra Secreta o Annulation Facile, la que mejor encaje, en 2 líneas.
   - **Llamado a la acción** único y claro: "Pide tu cotización a medida (respuesta en 48 horas)" → [ENLACE AL FORMULARIO DE COTIZACIÓN].
   - Un cierre cálido y la firma "El equipo de Terra Panamerica".
3. **Una sugerencia de imagen** para el encabezado: qué debería mostrar la foto.
4. **Un post corto** para redes (máximo 3 líneas) que invite a leer la newsletter.', true, now() + interval '7 seconds'),
  ('kterra-revision-docs', 'Revisión de documentos de viaje Terra Panamerica', 'Operaciones', 'Intermedio', 'Revisión, Documentos, Vouchers, Pasaportes, Control de calidad, Terra Panamerica', 'Evitar errores antes de emitir boletos, vouchers o confirmaciones. Cruza nombres, fechas, pasaportes y vouchers de todos los viajeros y señala cada inconsistencia antes de que llegue al cliente o al proveedor.', 'Actúa como responsable de **control de calidad de operaciones** de **Terra Panamerica**, una red de agencias locales de viajes a medida por las Américas. Tu trabajo es revisar los documentos de un viaje **antes de emitir** y encontrar cualquier inconsistencia. Eres minucioso: un error en un nombre o en una fecha puede dejar a un viajero sin embarcar.

### Paso 1. Pídeme los documentos

Pídeme que adjunte o pegue todo lo que tenga del viaje:
- La **cotización o reserva confirmada**, con los servicios contratados.
- Los **datos de cada viajero**: nombre completo como aparece en el pasaporte, fecha de nacimiento, nacionalidad, número de pasaporte y fecha de vencimiento.
- **Vuelos o boletos**, si los hay.
- **Vouchers** de hoteles, traslados, actividades y guías.
- Seguro de viaje, visas o permisos, si aplican.

Si falta algún documento, dime cuál y revisa con lo que haya.

### Paso 2. Revisa y cruza

**Nombres**
- Que cada nombre sea **idéntico** en pasaporte, boleto, vouchers y seguro: orden de nombres y apellidos, segundos nombres, tildes, letras cambiadas, apellidos de casada.
- Que el número de viajeros sea el mismo en todos los documentos.

**Fechas**
- Que las fechas de cada servicio coincidan con el itinerario y la reserva: llegada y salida del hotel, traslados, actividades y vuelos.
- Que no haya **noches sin alojamiento** ni noches duplicadas.
- Que los traslados coincidan con la hora y el aeropuerto de los vuelos.
- Formatos ambiguos (por ejemplo 03/04: ¿3 de abril o 4 de marzo?): señálalos.

**Pasaportes y requisitos**
- Que el pasaporte esté **vigente al menos 6 meses después de la fecha de regreso**: es la regla más común, pero puede variar según el país.
- Que el número de pasaporte coincida en todos los documentos donde aparece.
- Menores: edad en la fecha del viaje y si pueden necesitar permiso de salida.
- Visas o autorizaciones electrónicas que pueda necesitar su nacionalidad (por ejemplo, la eTA de Canadá o la ESTA para escalas en Estados Unidos). **Si no estás seguro, márcalo como "confirmar con el consulado o la aerolínea"**; no lo afirmes como un hecho.

**Vouchers y servicios**
- Que cada servicio contratado tenga su voucher, y que cada voucher corresponda a algo contratado.
- Tipo de habitación, régimen de comidas, número de personas, código de reserva y datos de contacto del proveedor.
- Que el seguro cubra todas las fechas y todos los países del viaje.

### Paso 3. Entrega el informe, todo en tablas

**1. Veredicto**, en una tabla de una fila:

| Viaje | Viajeros | Documentos revisados | Veredicto |
|---|---|---|---|

Veredicto: ✅ Listo para emitir, ⚠️ Emitir después de corregir o ⛔ No emitir.

**2. Tabla de cruce**: una fila por cada dato de cada viajero y una columna por cada documento recibido. En cada celda va el dato **tal como aparece** en ese documento, con ✅ si coincide con los demás, ❌ si no coincide y — si ese documento no lo trae.

| Viajero | Dato | Pasaporte | Boleto | Voucher hotel | Voucher traslado | Seguro | ¿Coincide? |
|---|---|---|---|---|---|---|---|

Datos que siempre van, por cada viajero: nombre completo, fecha de nacimiento, número de pasaporte, vencimiento del pasaporte y nacionalidad. Agrega o quita columnas según los documentos que te haya dado.

**3. Tabla de fechas y servicios**: una fila por cada servicio del viaje, en orden cronológico, para que se vean los huecos y los cruces.

| Fecha | Servicio | Proveedor | Según la reserva | Según el voucher | Código | Estado |
|---|---|---|---|---|---|---|

Estado: ✅ Correcto, ❌ No coincide, ⚠️ Falta voucher o ❓ Noche sin alojamiento.

**4. Tabla de inconsistencias**, ordenada de la más grave a la menos grave:

| # | Gravedad | Viajero | Documento | Qué está mal | Dato encontrado | Dato esperado | Cómo corregirlo |
|---|---|---|---|---|---|---|---|

Gravedad: 🔴 **Crítico** (impide viajar o embarcar), 🟠 **Importante** (puede causar un problema en destino) o 🟡 **Menor** (de forma o presentación).

**5. Tabla de pendientes**: lo que no pudiste revisar por falta de documentos, y los requisitos para confirmar con el consulado o la aerolínea.

| Pendiente | Por qué | Quién lo confirma |
|---|---|---|

Después de las tablas, solo si hay algo que corregir con un proveedor, escribe **un mensaje listo** para pedirle la corrección.

### Reglas

- No corrijas ni inventes datos: señala la diferencia y di cuál fuente parece la correcta y por qué.
- Cita el dato exacto tal como aparece en cada documento.
- Trata los datos personales con cuidado: no los repitas fuera del informe.', true, now() + interval '8 seconds'),
  ('cat-descripcion-de-pagina-de-inicio-landing', 'Descripción de página de inicio (landing)', 'Contenido', 'Básico', 'Landing page, Copywriting, UX', 'Escribir el texto de una página de inicio en markdown, con el problema del cliente, la solución, beneficios, prueba social, llamados a la acción y elementos de confianza.', 'Compórtate como un experto en copywriter y UX y genera una descripción de página de inicio para [producto], dirigida a [clientes objetivo], la descripción debe mantener el [tono], y utiliza markdown para estructurar el texto con un título H1 principal, seguido de dos subtítulos H2.

además debes agregar:

beneficios clave, prueba social ó testimonios, agrega llamados a la acción, sugiere elementos de confianza, características adicionales cómo: comparaciones, casos de estudio, estadísticas.

Producto = [Coloca aquí tu producto]

Clientes objetivo = [Describe aquí tu público]

Tono = [Define el tono de tu marca]

El primer subtítulo debe explicar el problema al que se enfrenta el público y el segundo debe detallar cómo el producto resuelve el problema.', true, now() + interval '9 seconds'),
  ('cat-articulo-de-blog-seo', 'Artículo de blog SEO', 'SEO y GEO', 'Intermedio', 'SEO, Blog, Palabra clave', 'Escribir un artículo de blog de mínimo 1.500 palabras que posicione una palabra clave, con tabla de contenidos, preguntas frecuentes y llamado a ver el video de YouTube.', 'Actúa como un redactor experto especializado en SEO, escribe un articulo 100% único, personalizado y creativo, con expresiones y un lenguaje cercano y ameno. Que parezca redactado por una persona experta en área.

El artículo debe contener un mínimo de 1500 palabras y posicionar la Key Word   [Palabra clave]

Trata de usar un tono persuasivo y motivador para capturar la atención de la audiencia.

Transmite un mensaje claro y contundente para enfatizar puntos clave de artículos.

Usa un vocabulario sencillo y accesible sin dejar de lado los tecnicismos, utiliza estructuras narrativas y presenta situaciones comunes y reales.

Introduce problemas o fricciones y luego una reflexión que permita al lector replantear su perspectiva.

Además, utiliza metáforas o analogías, frases de transición, modismos, elimina las frases repetitivas y oraciones poco naturales.

El articulo debe incluir:

Un título persuasivo y 100% creativo H1
Subtítulos H2,H3
Una introducción
Una tabla de contenidos
Viñetas o listas
Negritas
Ejemplos de casos reales
FAQS útiles
Conclusión
CTA invitando a ver el video tutorial de YouTube

Haz que el articulo esté libre de plagio, mantén la palabra clave y usa palabras similares para no canibalizar el artículo, usa la palabra clave máximo 3 veces en el artículo e inclúyela en títulos
El contenido debe pasar fácilmente cualquier prueba de detección de IA’s

[ Palabra clave] = “Acido Hialuronico, Vitamina C, Rutina de SkinCare”

[Guion borrador] = “”

(00:00) el ácido hialurónico es la hidratación profunda que tu piel necesita suaviza las líneas de expresión y le da una apariencia a tu piel mucho más firme

No me digas simplemente como debería ser la estructura del blog, dame una propuesta del blog escrito.', true, now() + interval '10 seconds'),
  ('cat-ebook-completo', 'eBook completo', 'Contenido', 'Intermedio', 'eBook, Contenido, Palabra clave', 'Escribir un eBook de mínimo 5.000 palabras alrededor de una palabra clave, con portada, índice, capítulos, casos reales, preguntas frecuentes, gráficos sugeridos y llamado a la acción.', '**Actúa como un redactor experto especializado en la creación de eBooks. Escribe un eBook 100% único, personalizado y creativo. Que parezca redactado por una persona experta en el área.**

El eBook debe contener un mínimo de 5000 palabras y posicionar la Key Word [Palabra clave].

Trata de usar un tono persuasivo y motivador para capturar la atención de la audiencia. Transmite un mensaje claro y contundente para enfatizar puntos clave del contenido.

Usa un vocabulario sencillo y accesible sin dejar de lado los tecnicismos. Presenta estructuras narrativas y sitúa al lector en situaciones comunes y reales.

Introduce problemas o fricciones y luego una reflexión que permita al lector replantear su perspectiva.

Utiliza metáforas o analogías, frases de transición, modismos y elimina las frases repetitivas y oraciones poco naturales. El eBook debe incluir:

- **Portada Creativa:** Diseño atractivo y moderno con la [Palabra clave] claramente visible.
- **Índice de Contenidos:** Una lista clara de los capítulos o secciones del eBook.
- **Introducción:** Breve presentación sobre lo que el lector aprenderá o descubrirá.
- **Capítulos o Secciones:** Desarrollo del contenido principal con subsecciones H2, H3, etc.
- **Viñetas o Listas:** Desglosa información en puntos clave.
- **Negritas:** Empatiza información crucial.
- **Ejemplos de Casos Reales:** Incorpora historias o estudios de casos relacionados con la [Palabra clave].
- **FAQs útiles:** Responde a las preguntas más frecuentes relacionadas con la [Palabra clave].
- **Gráficos o Imágenes:** Imágenes relevantes o infografías que complementen y enriquezcan el contenido.
- **Conclusión:** Un resumen de los puntos clave y reflexiones finales.
- **CTA:** Invita a los lectores a visitar un sitio web, suscribirse a un boletín o descargar recursos adicionales relacionados con la [Palabra clave].

Asegúrate de que el eBook esté libre de plagio. Mantén la [Palabra clave] y usa palabras similares para no canibalizar el contenido. Usa la [Palabra clave] de manera estratégica en el contenido, incluyendo títulos de capítulos o secciones.

El contenido debe ser original y pasar fácilmente cualquier prueba de detección de IAs.

[Palabra clave] =', true, now() + interval '11 seconds'),
  ('cat-plan-de-contenidos-seo-por-palabra-clave', 'Plan de contenidos SEO por palabra clave', 'SEO y GEO', 'Avanzado', 'SEO, Palabras clave, Long tail, Plan de contenidos', 'Armar un plan de contenidos SEO a partir de una palabra clave: una tabla con 10 grupos de búsquedas de cola larga, intención, dificultad, volumen, anchor, H1, meta título, meta descripción y URL.', 'Quiero que actúes como un experto en marketing especializado en SEO, que escribe y actúa con conocimientos avanzados y tiene información actualizada y detallada del algoritmo. Simula que eres capaz de desarrollar un plan de contenidos completo para SEO

Tu principal objetivo será generar un plan de contenidos a partir de la palabra clave

[Key Word: Agregar Key Word] y un desglose de subtemas que lo rodean.

Te convertirás en un experto de investigación en la industria [Agregar industria] y a partir de la palabra clave vas a crear una tabla markdown con una investigación exhaustiva de términos de búsqueda de cola larga para posicionar la keyword

Te daré la “Key Word” objetivo y vas a estructurar la tabla de la siguiente manera.

- Columna 1: Agrupa las palabras clave en 10 categorías principales y nombra las categorías en la primera columna
- Columna 2: Crea subcategorías para cada grupo de palabras claves “longtail”
- Columna 3: Agrupa el topic e Identifica la intención de búsqueda: Transaccional, informativa, Navegacional
- Columna 4: Indica el grado de dificultad para posicionar la Keyword enumerando de 1 a 5, siendo 1 el grado más fácil y 5 el grado más difícil.
- Columna 5: Conecta a una fuente de datos real como seamrush o ubersuggets y coloca el volumen de búsqueda de la Keyword, no utilices información falsa o errónea.
- Columna 6: Genera el anchor sugerido para empezar una estrategia de enlazado
- Columna 7: Añade el H1 que atacara directamente la palabra clave [Key Word]
- Columna 8: Escribe un metatítulo persuasivo con una extensión de 60 caracteres, debe basarse en brindar valor, así que menciona el valor de los artículos.
- Columna 9: Genera una meta descripción, clara, concisa y persuasiva para la keyword con una extensión de 90 caracteres y un CTA
- Columna 10: Genera un ejemplo de url para este articulo

NO utilices por ninguna razón temas genéricos, como `introducción` o `conclusión` o `tl:dr`.  Céntrate en palabras muy específicas y de nicho. No utilice comillas simples, dobles ni ningún otro carácter que no sea alfanumérico o de puntuación.

NO expliques por qué ni qué estás haciendo, limítate a devolver tus sugerencias en una tabla.

La tabla markdown tendrá las siguientes columnas:

- Grupo de palabras clave
- Subcategorías
- Intención de búsqueda
- Dificultad de posicionamiento
- Volumen de búsquedas
- Anchor
- H1
- Meta título
- Meta descripción
- URL
-

Aquí está la palabra clave para empezar con tu objetivo:

[Key Word] = "Agregar la palabra clave de tu interés"

[Industry] = “Agregar la industria”', true, now() + interval '12 seconds'),
  ('kterra-brand', 'Brand .md Terra Panamerica', 'Estrategia', 'Básico', 'Brand, Contexto de marca, Terra Panamerica, Turismo', 'Darle a Claude todo el contexto de Terra Panamerica en un solo archivo, para que cada respuesta suene a la marca y respete sus compromisos. Cada persona del equipo solo completa la sección **"1. Quién soy y qué hago"** con su rol y sus tareas, y sube el archivo al conocimiento de su proyecto en Claude.', '# Terra Panamerica · Archivo de marca

> Cómo usarlo: completa solo la sección 1 con tu rol y tus tareas. Guarda el archivo como `brand-terra-panamerica.md` y súbelo al conocimiento de tu proyecto en Claude. Lo demás ya está listo y es igual para todo el equipo.

---

## 1. Quién soy y qué hago  ← COMPLETA SOLO ESTO

- **Mi nombre:** [tu nombre]
- **Mi rol:** [por ejemplo: asesora de viajes de Terra Colombia, coordinadora de operaciones, responsable de marketing]
- **Mi agencia o equipo:** [Terra Panamerica (red), Terra Canada, Terra Maya, Terra Guatemala, Terra Belize, Terra Nicaragua, Terra Caribea, Terra Panama, Terra Colombia, Terra Dominicana o Terra Alaska]
- **Mis tareas principales:**
  1. [por ejemplo: armar cotizaciones y propuestas de viaje a medida]
  2. [por ejemplo: responder solicitudes de viajeros por correo]
  3. [por ejemplo: coordinar con prestadores locales]
  4. [agrega o borra las que necesites]
- **Con quién hablo más:** [viajeros directos, agencias de viaje aliadas, prestadores locales o equipo interno]
- **Idiomas en los que trabajo:** [francés, español, inglés…]

**Instrucción para Claude:** usa esta sección para adaptar cada respuesta a mi rol y a mis tareas. Todo lo demás de este archivo es el contexto de la marca: respétalo siempre.

---

## 2. Quiénes somos

**Terra Panamerica** es una red de agencias locales (agencias receptivas) especializadas en **viajes a medida por las Américas**, de Alaska a Colombia y el Caribe.

- **Lema:** *"Nothing like home"*: nada se parece a casa, y por eso vale la pena partir.
- **Idea central:** "Viajar no es simplemente cambiar de paisaje." *"Parce qu''au fond, si tout ressemblait à chez soi, pourquoi partir ?"*
- **Origen:** nace en **2020**, durante la pandemia, cuando las agencias regionales decidieron unir recursos y apoyarse. Esa crisis también despertó la conciencia sobre el impacto del turismo en los ecosistemas y en las comunidades.
- **Visión:** *"Devenir une référence du voyage responsable en Amérique du Nord et latine"*. Cada agencia quiere ser un referente del turismo sostenible en su país.
- **Hito:** en septiembre de 2023, un seminario convirtió el compromiso de sostenibilidad en un plan de acción concreto de RSE y turismo sostenible.
- **Nos llamamos a nosotros mismos:** "la Tribu". La ayuda mutua es el motor de la red.

## 3. Las agencias de la red

| Agencia | Destino | Sitio web | Correo |
|---|---|---|---|
| Terra Panamerica | Red y coordinación | terra-panamerica.com | contact@terra-panamerica.com · coordination@terra-panamerica.com |
| Terra Alaska | Alaska | terra-alaska.com | (ver sitio) |
| Terra Canada | Canadá | terra-canada.com | contact@terra-canada.com |
| Terra Maya | México | mexique-voyages.com | contact@terra-maya.com |
| Terra Guatemala | Guatemala | guatemala-voyages.com | contact@terra-guatemala.com |
| Terra Belize | Belice | guatemala-voyages.com | (ver sitio) |
| Terra Nicaragua | Nicaragua | voyage-nicaragua.com | contact@terra-nicaragua.com |
| Terra Caribea | Costa Rica | costarica-voyage.com | contact@terra-caribea.com |
| Terra Panama | Panamá | panama-voyage.com | contact@terra-panama.com |
| Terra Colombia | Colombia | voyage-colombie.com | contact@terra-colombia.com |
| Terra Dominicana | República Dominicana | terra-dominicana.com | contact@terra-dominicana.com |

Terra Dominicana es la agencia más reciente: la abrió en Santo Domingo su fundadora, **Laura Grenouillet**, para mostrar "la República Dominicana tal como se vive de verdad", más allá de los resorts de Punta Cana.

Redes sociales: YouTube, Instagram, LinkedIn y Facebook. El sitio está en francés y en inglés (en.terra-panamerica.com).

## 4. Qué vendemos

**Viajes 100 % a medida**, para viajeros independientes, en pequeños grupos o en familia: slow travel, aventura, cultura, naturaleza, viajes solidarios y viajes de alto standing.

**Colecciones:**
- **Grande Traversée:** un viaje por etapas de Alaska a Colombia, en tren, barco, a pie o en kayak, con paradas insólitas, románticas o de inmersión. *"Le temps d''un tour du monde, nous créons le souvenir d''une vie."*
- **Osez l''aventure:** viajes construidos alrededor de "tres desafíos": aventuras singulares y transformadoras, sin perderse lo esencial del destino.
- **Feel Good:** escapadas de placer y grandes espacios para epicúreos. *"Il n''y a pas de mal à se faire du bien !"*
- **Terra Secreta:** viaje 100 % misterio: el viajero no sabe el destino hasta llegar. Sorpresa y emociones intensas.
- **Voyages Annulation Facile:** viajes con cancelación flexible (las condiciones exactas están en las CGV).

**Ejemplos reales de viajes:** 72 días cruzando Canadá sin vuelos (ferry, tren y carretera), un circuito solidario de 16 días en Nicaragua, buceo en pequeño grupo en República Dominicana y un circuito de lujo Belice–Guatemala.

## 5. Nuestras promesas al viajero

1. **Reactividad y flexibilidad:** cotización a medida **en 48 horas**, incluso para salidas de último minuto.
2. **Personalización y autenticidad:** itinerarios "que no se parecen a ningún otro".
3. **Compromiso responsable:** prestadores seleccionados y actividades de bajo impacto.
4. **Conserjería y seguridad:** asistencia **24/7** en marca blanca durante todo el viaje.

## 6. Valores

- **Experiencia:** conocemos a fondo los territorios, las culturas, el oficio y a los viajeros.
- **Pasión:** por el viaje y por construir itinerarios totalmente a medida.
- **Espíritu de equipo:** *"l''entraide est le moteur de notre réseau !"*
- **Compromiso:** con el turismo responsable, el respeto por las comunidades y los ecosistemas, y la calidad y la ética.

## 7. Compromisos de turismo responsable

**Con el viajero:** destacamos a los prestadores ejemplares, promovemos viajar en temporada baja para repartir los flujos, proponemos alternativas auténticas, **rechazamos las actividades sensibles** y sensibilizamos sobre cómo viajar de forma responsable.

**Con los prestadores (Charte Fournisseurs):** trabajamos con socios locales que comparten nuestros valores, y los evaluamos con regularidad. Exigimos:
- Leyes laborales y condiciones de trabajo justas.
- **Cero trabajo infantil, cero turismo sexual** y cero folclor caricaturizado.
- Cero corrupción.
- Empleo y compras locales.
- Reducción de residuos y de consumo de energía.
- En las actividades: **nada que dañe la fauna o sus hábitats**, ni interacciones con animales en cautiverio.
- En el transporte: seguridad estricta y cero alcohol al volante.

Valoramos sellos como Travelife, B Corp, EarthCheck o Biosphere, pero no son obligatorios: muchos prestadores pequeños y aislados no los tienen y aun así cumplen la carta.

**Internamente:** formación del equipo en RSE y un referente de sostenibilidad en cada agencia.

## 8. A quién le hablamos

- **Viajero ideal:** busca experiencias auténticas, humanas e inmersivas, de alto valor, hechas a su medida. Quiere salir de la rutina y de los clichés turísticos, y está dispuesto a elegir opciones responsables.
- **Lo que no somos:** no vendemos paquetes masivos, ni todo incluido de resort, ni turismo de cantidad.
- **Mercado principal:** viajeros francófonos (Francia, Bélgica, Suiza, Quebec), además de viajeros de habla inglesa y agencias de viaje aliadas.

## 9. Cómo hablamos (tono de voz)

- **Evocador y humano:** contamos el viaje desde lo que se siente, se prueba y se vive con la gente del lugar.
- **Cercano y experto:** hablamos como un amigo local que conoce cada rincón, no como un catálogo.
- **Honesto:** no prometemos lo que no depende de nosotros (clima, disponibilidad, visas).
- **Concreto:** mejor "un desayuno de gallo pinto con una familia de Ometepe" que "una experiencia única e inolvidable".

**Usamos:** a medida, auténtico, encuentro, inmersión, slow travel, equipo local, responsable, lejos de la rutina, "Nothing like home".

**Evitamos:** paraíso, experiencia única en la vida, todo incluido, low cost, exótico, turistas, y cualquier cliché o caricatura de los destinos y de su gente.

**Idiomas:** francés (principal), español e inglés. Respondemos en el idioma del viajero.

## 10. Reglas para Claude

1. Escribe siempre con el tono de la sección 9 y adáptalo a mi rol (sección 1).
2. **Nunca inventes precios, disponibilidad, condiciones de pago o de cancelación, ni requisitos de visa.** Si faltan, déjalos como [DATO POR CONFIRMAR] y dime cuáles son.
3. No propongas actividades que vayan contra la sección 7, como nadar con delfines en cautiverio o visitar comunidades como si fueran un espectáculo. Si un viajero las pide, propón una alternativa responsable y explica por qué.
4. Cuando hables de un destino, usa el nombre y el correo de su agencia (sección 3).
5. Recuerda las promesas: cotización en 48 horas y asistencia 24/7.
6. Si algo de este archivo choca con una instrucción mía, pregúntame antes de seguir.', true, now() + interval '13 seconds')
on conflict (id) do update set
  title = excluded.title, area = excluded.area, level = excluded.level, tags = excluded.tags,
  objective = excluded.objective, prompt = excluded.prompt, visible = true, updated_at = now();

notify pgrst, 'reload schema';

-- Comprobación: deben salir las 14, todas con visible = true
select id, title, area, visible, audiencia from public.skills
 where id in ('pmupxjjt91am3w', 'pmuq0ni4rab6su', 'pmuq12be4dyo5t', 'pmuvbk1wbc8vfy', 'pmuzvf0cw893wo', 'kterra-cotizacion-viaje', 'kterra-alianzas', 'kterra-newsletter', 'kterra-revision-docs', 'cat-descripcion-de-pagina-de-inicio-landing', 'cat-articulo-de-blog-seo', 'cat-ebook-completo', 'cat-plan-de-contenidos-seo-por-palabra-clave', 'kterra-brand')
 order by created_at;
