---
name: auditoria-completa
description: Auditoría de solo lectura de un proyecto de software con varios agentes y verificación independiente de cada hallazgo. Cubre seguridad, lógica de negocio y bugs, arquitectura, rendimiento, dependencias y despliegue, pruebas, y experiencia de uso y diseño. Usar cuando pidan "audita el proyecto", "auditoría completa", "revisa la seguridad", "busca errores en todo", "segunda opinión del código" o "qué tan bien está hecho esto". No corrige nada: entrega un informe en español y un plan de corrección.
---

# Auditoría completa

Encuentra problemas reales de un proyecto, los demuestra con evidencia y entrega un orden de corrección.
Vale más un informe corto y cierto que uno largo y especulativo: cinco hallazgos confirmados sirven más que veinte
sospechas.

Mezcla dos fuentes: la amplitud de una auditoría integral (seguridad, lógica, arquitectura, rendimiento,
dependencias, pruebas) y el método del skill `security-audit` de Cloudflare (licencia MIT): cobertura llevada en
una tabla, quien verifica un hallazgo nunca es quien lo encontró, y la gravedad solo se asigna a lo demostrado.
Suma dos frentes que ninguna de las dos trae: lógica del negocio y experiencia de uso.

## Reglas que no se negocian

1. **Solo lectura.** No modificar código, configuración ni dependencias; no hacer commits, cambiar de rama,
   correr migraciones, desplegar ni tocar datos reales. Los archivos del informe se escriben fuera del
   repositorio (ver «Preparación»).
2. **Nada contra sistemas en vivo.** No consultar ni probar producción, bases de datos reales, APIs de terceros
   ni cuentas de usuarios. Lo único permitido hacia afuera es consultar fuentes públicas de vulnerabilidades de
   dependencias. No dar por hecho que un entorno «de desarrollo» está separado de producción.
3. **Pruebas solo locales y con datos inventados.** Se permite revisar sintaxis, leer, buscar, y correr
   comprobaciones sobre una copia en la carpeta temporal con datos simulados. No correr scripts del gestor de
   paquetes, hooks, instaladores ni pruebas de integración del proyecto si pueden escribir en el repositorio o
   llamar a un servicio. Si no se puede saber que un comando es inocuo, no se corre y se anota como limitación.
4. **Todo hallazgo lleva evidencia verificable:** archivo, línea y el recorrido concreto. Sin eso, no es hallazgo.
5. **No inflar.** Una buena práctica ausente, una capa extra de protección que falta o una preferencia de diseño
   no son defectos. Se pueden anotar como observación, sin gravedad.
6. **No simular agentes.** Si la plataforma no permite lanzar subagentes, hacer cada frente como fase separada y
   decirlo en el informe.

## Preparación

Antes de lanzar nada:

- **Decisiones ya tomadas.** Leer la memoria del proyecto, `CLAUDE.md`, `README` y cualquier informe de auditoría
  anterior. Lo que el dueño ya decidió dejar como está (por ejemplo, un método de acceso elegido a propósito) va
  en una lista aparte, «Decisiones aceptadas», y no se reporta como hallazgo. Sí se reporta si el código no
  cumple lo que esa decisión prometía.
- **Corridas anteriores.** Si hay un informe previo, esta corrida es aditiva: revalidar lo que quedó «confirmado»
  solo donde el código cambió, convertir lo «por validar» en trabajo actual y dirigir los agentes a lo que no se
  cubrió. Una sola corrida no agota un proyecto; decirlo en el informe.
- **Perfil.** Elegir según el pedido y el tamaño, y decir cuál se usó:
  - `rápida`: hasta 5 agentes. Un agente por dos o tres frentes y un solo verificador para todos los candidatos.
  - `normal` (por defecto): hasta 10 agentes.
  - `profunda`: sin tope fijo; solo si la persona la pide con esas palabras, porque cuesta bastante más.
  - `parcial`: una carpeta, un frente o lo que cambió desde un commit. Todo lo demás queda como «fuera de
    alcance», nunca como «revisado».
- **Carpeta de salida.** Fuera del repositorio: la carpeta temporal de la sesión, o
  `~/auditorias/<proyecto>/corrida-<N>`. Anotar el commit revisado y si había cambios sin guardar.
- **Reservar antes de buscar.** Del tope de agentes, apartar primero el de crítica de cobertura y los de
  verificación (alrededor de un tercio). Si el presupuesto no alcanza para verificar, se reduce el alcance; nunca
  se entrega un candidato sin verificar como si fuera hallazgo.

## Fase 1. Reconocimiento

La hace el agente principal, leyendo. Produce dos cosas:

**Mapa del sistema** (una página): cómo arranca, qué piezas tiene, por dónde entran datos, dónde se valida cada
entrada, dónde se decide quién puede hacer qué, dónde se guarda y qué servicios externos intervienen. Nombrar los
**límites de confianza**: cada punto donde alguien con menos permisos le entrega algo a una parte con más
permisos (visitante → usuario, usuario → otro usuario u otra empresa, usuario → administrador, navegador →
base de datos, servicio externo → sistema, texto de un usuario → un modelo de IA).

**Tabla de cobertura:** una fila por unidad de trabajo (superficie × frente), con estado `pendiente`,
`revisada`, `con candidato`, `bloqueada` o `fuera de alcance`, y qué agente la tomó. Solo el agente principal la
actualiza. Ninguna unidad queda sin asignar en silencio: si no alcanza el presupuesto, se marca `aplazada`.

Orden de prioridad de las unidades: primero lo que puede tocar alguien sin iniciar sesión; después lo que protege
lo más valioso (credenciales, datos de otra empresa o persona, dinero, permisos de administrador); después lo que
cambió o quedó pendiente de una corrida anterior.

## Fase 2. Búsqueda por frentes

Lanzar en paralelo, en un solo mensaje, un agente por frente. Omitir un frente solo si el reconocimiento muestra
que no aplica, y decirlo. A cada agente se le entrega: el mapa, sus unidades de la tabla, las rutas donde empezar,
las reglas de esta sección y la lista de decisiones aceptadas. No se le entregan sospechas ni conclusiones de
otros: un agente al que se le da una hipótesis tiende a devolverla confirmada.

| Frente | Qué busca |
|---|---|
| **Acceso y datos** | Inicio de sesión, sesiones, permisos, ver o cambiar datos ajenos, escalar a administrador, reglas de la base de datos, secretos expuestos, límites de intentos |
| **Entradas e integraciones** | Inyección (SQL, comandos, HTML/scripts), archivos subidos, enlaces y redirecciones, llamadas a servicios externos, cabeceras, y si hay IA: instrucciones escondidas en datos y herramientas con demasiado poder |
| **Lógica del negocio y errores** | Reglas que el producto promete y el código no cumple (vencimientos, cupos, intentos, estados), casos límite, dobles clics y carreras, fechas y zonas horarias, operaciones a medias, diferencias entre lo que muestra la pantalla y lo que guarda la base |
| **Arquitectura y rendimiento** | Acoplamiento que ya causa errores, consultas repetidas, trabajo innecesario al cargar, lo que deja de servir al crecer. Separar lo medido de lo teórico |
| **Dependencias y despliegue** | Versiones declaradas contra vulnerabilidades conocidas y si la parte afectada se usa; scripts de instalación; configuración de despliegue y de CI; qué queda público |
| **Pruebas y confiabilidad** | Qué se prueba de verdad, qué caminos críticos no tienen prueba, qué pasa cuando falla un servicio externo |
| **Experiencia de uso y diseño** | Flujos que confunden o se rompen, mensajes de error, estados vacíos y de carga, celular, accesibilidad (contraste, teclado, lectores de pantalla), controles duplicados o inconexos |

### Método para cada agente

Trabajar desde una regla concreta, no desde una lista de chequeo:

1. Nombrar quién actúa y con qué permisos empieza.
2. Nombrar qué entrega o qué acción hace.
3. Encontrar el control que debería rechazarlo, limitarlo o aislarlo.
4. Seguir el recorrido exacto en el código después de ese control, incluidos los caminos hermanos: versión
   vieja, carga masiva, reintento, cancelación, error. Comparar si los controles hermanos son equivalentes, no
   solo si existen.
5. Parar en el efecto mínimo que demuestra el problema.
6. Proponer el cambio más pequeño que lo corrige y la prueba que lo detectaría.

Probar los casos tristes solo donde la interfaz los acepta: vacío, cero, negativo, máximo, repetido, vencido,
revocado, fuera de orden, simultáneo.

Para experiencia de uso y diseño, la regla equivalente es: qué persona, qué quería hacer, en qué paso se traba y
qué ve. Sin ese escenario es una preferencia, no un defecto.

Si lo que decide el caso está fuera del código (configuración del proveedor, un ajuste del panel, cómo se
desplegó), no suponer ni que está ni que falta: devolverlo como `por validar` con la comprobación exacta que
debe hacer el dueño.

### Qué devuelve cada agente

Una lista de candidatos, cada uno con: título, frente, archivo y líneas, quién actúa, recorrido paso a paso,
efecto concreto, controles que ya existen, arreglo mínimo propuesto, prueba propuesta, y qué no pudo comprobar.
Además, el estado de cada unidad que tenía asignada y cualquier superficie nueva que encontró fuera de su alcance.

## Fase 3. Verificación independiente

Juntar los candidatos, fusionar los que comparten causa raíz y entregar cada uno a un agente **nuevo, que no lo
encontró**, con esta instrucción: «No escribiste este candidato. Intenta tumbarlo». El verificador recibe solo el
candidato y el mapa, no la opinión de otro verificador, y debe:

1. Releer cada archivo y línea citados en la versión actual.
2. Reconstruir el control más fuerte que haya en el recorrido, en cualquier capa.
3. Reproducir el efecto mínimo si puede hacerlo en local con datos inventados.
4. Comprobar que la gravedad y el arreglo propuesto no dicen más de lo que la evidencia sostiene.

Devuelve uno de tres veredictos:

- **Confirmado:** recorrido completo y efecto demostrado. Solo estos llevan gravedad.
- **Por validar:** hipótesis apoyada en el código, bloqueada por un hecho concreto que está fuera del código.
  Lleva el dato exacto que falta y cómo comprobarlo sin riesgo. **No lleva gravedad.** No es un lugar para
  dejar ideas sueltas.
- **Descartado:** el código, un control visible o la falta de efecto real lo refutan. Se guarda con el motivo,
  para que la próxima corrida no lo repita.

En perfil `rápida` un solo verificador puede revisar todos los candidatos, pero sigue siendo un agente distinto.

### Gravedad (solo para confirmados)

- **Crítica:** alguien sin iniciar sesión ejecuta código, lee toda la base o toma cuentas ajenas.
- **Alta:** se burla por completo un control explícito con consecuencias reales: entrar sin credenciales, ver o
  cambiar datos de otra empresa, un script guardado que afecta a otros usuarios, tumbar el servicio sin sesión;
  o un error de lógica que daña o pierde datos reales.
- **Media:** falla real con alcance limitado o condiciones poco comunes.
- **Baja:** se filtra información no sensible, o un efecto menor que exige mucho esfuerzo.
- **Observación:** mejora o riesgo sin efecto demostrado. Aquí van las capas extra de protección que faltan.

Para decidir entre alta y media: ¿el control quedó anulado o solo debilitado? Si no se puede decir cuál es el
daño concreto, la gravedad es menor de lo que parece. La gravedad (qué tan grave) y la confianza (qué tan
seguro) se informan por separado.

## Fase 4. Crítica de cobertura

Un agente nuevo recibe el mapa y la tabla de cobertura, sin los hallazgos, y busca huecos: superficies del mapa
sin unidad, unidades marcadas como revisadas sin rutas leídas, caminos hermanos que nadie siguió. Si encuentra
huecos y queda presupuesto, se lanza una segunda tanda corta; si no, quedan como `aplazada` en el informe.

## Fase 5. Informe

En español, sin relleno, guardado en la carpeta de salida. Si lo va a leer alguien que no programa, cada
hallazgo lleva además una frase en lenguaje llano sobre qué puede pasar.

1. **Recomendación principal:** una o dos frases con lo primero que hay que hacer.
2. **Resumen:** estado general, perfil usado, commit revisado, cuántos hallazgos por veredicto y gravedad.
3. **Mapa del sistema** y por dónde se puede entrar.
4. **Hallazgos confirmados,** de más a menos graves. Cada uno: identificador, título, gravedad, confianza,
   ubicación, qué pasa, recorrido, evidencia, controles que ya existen, arreglo mínimo, riesgo de romper algo al
   corregir, prueba recomendada, esfuerzo.
5. **Por validar:** el dato que falta y cómo comprobarlo.
6. **Descartados,** con el motivo.
7. **Causas raíz** que explican varios hallazgos a la vez.
8. **Decisiones aceptadas** que no se reportaron.
9. **Plan de corrección:** urgentes, importantes, estructurales, preventivas; con dependencias entre tareas y
   criterio de aceptación de cada una.
10. **Cobertura y límites:** qué se revisó, qué quedó aplazado o fuera de alcance, qué comandos se corrieron,
    qué no se pudo comprobar. No decir que algo se auditó completo si la tabla no lo respalda.

## Cuándo termina

Cuando todo candidato tiene veredicto de un agente distinto al que lo encontró, la tabla de cobertura no tiene
unidades `pendiente` y el informe existe. Si el presupuesto se acaba antes, el informe empieza diciendo que la
corrida quedó incompleta y qué faltó. Las correcciones son una fase aparte, que solo empieza cuando la persona
la autoriza.

## Errores a evitar

1. Presentar una desviación de una lista de chequeo como vulnerabilidad.
2. Poner gravedad a algo «por validar».
3. Suponer cómo está configurado el proveedor, el proxy o el panel cuando no está en el código.
4. Reportar un efecto más fuerte que el observado.
5. Volver a reportar una decisión que el dueño ya tomó.
6. Escribir el informe antes de la verificación independiente.
7. Presentar un gusto de diseño como defecto.
