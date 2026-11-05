// @ts-nocheck — escrito en JavaScript plano dentro de un .ts: sin esto Supabase podría rechazarlo por tipos.
// ============================================================
// MCP Academia — la Academia de PorContar como herramientas para una IA.
//
// Un servidor MCP (Model Context Protocol, transporte HTTP) que le da a
// Claude (o cualquier agente) lo mismo que hace el admin en
// academia.porcontar.com/admin: empresas y cohortes, personas, avance,
// cronograma, grabaciones, publicaciones, skills, quizzes, cursos y soporte.
//
// Reglas (las mismas del MCP del CRM):
//  · NADA se escribe sin autorización. Crear, modificar y eliminar van en dos
//    pasos: sin confirmar=true solo devuelven lo que harían; con confirmar=true
//    se ejecutan. El servidor no puede saber si una PERSONA aprobó: eso lo
//    garantizan el agente (las instrucciones se lo exigen) y la app donde corre.
//  · Lo que la app hace con una función de la base (grupos, personas,
//    soporte) se hace con esa MISMA función, como admin: mismas validaciones,
//    mismas contraseñas cifradas. Para eso la función manda la llave de admin
//    (app_config.admin_key) en la cabecera x-admin-key, igual que la app.
//  · Cada escritura comprueba que la base respondió (nunca se anuncia un
//    éxito que no ocurrió) y cada llamada queda en mcp_acciones
//    (supabase-mcp.sql).
//  · Entra solo con la clave MCP_TOKEN: "Authorization: Bearer <clave>" o
//    ?key=<clave> en la URL, para las apps que no dejan poner encabezados.
//
// PUBLICAR (panel de Supabase, sin instalar nada):
//   1. Correr supabase-mcp.sql en SQL Editor.
//   2. Edge Functions → Secrets → agregar MCP_TOKEN = una clave larga al azar.
//   3. Edge Functions → Deploy a new function → "Via Editor", nombre
//      mcp-academia, pegar este archivo completo y desplegar.
//   4. En la función → Details: APAGAR "Enforce JWT verification" (la función
//      revisa su propia clave).
//   5. URL del MCP: https://academia.porcontar.com/mcp?key=<clave>
//      (functions/mcp.js le pasa los pedidos a esta función).
// ============================================================

const VERSION = '1.0.0'
const PROTOCOLOS = ['2025-06-18', '2025-03-26', '2024-11-05']
const BUCKET = 'videos-academia'
const EXTRAS = ['tareas', 'skills', 'resumen', 'config', 'tuto', 'faq']
const TIPOS_SESION = ['kickoff', 'clase', 'qa', 'proyecto', 'cierre']
const NIVELES = ['Básico', 'Intermedio', 'Avanzado']
const FICHA = ['logo_url', 'nit', 'sector', 'plazas', 'contacto_nombre', 'contacto_cargo', 'contacto_email',
  'contacto_telefono', 'whatsapp_url', 'fecha_inicio', 'fecha_fin', 'formato', 'extras_off']

// Herramientas que escriben: sin confirmar=true solo devuelven lo que harían.
// Las eliminar_* además muestran lo que se borra (y lo que arrastran).
const ESCRIBEN = new Set([
  'crear_grupo', 'actualizar_grupo', 'eliminar_grupo',
  'agregar_personas', 'actualizar_persona', 'quitar_persona',
  'actualizar_sesion', 'programar_sesion', 'abrir_clase', 'agregar_grabacion', 'eliminar_grabacion',
  'crear_publicacion', 'actualizar_publicacion', 'eliminar_publicacion',
  'crear_skill', 'actualizar_skill', 'eliminar_skill',
  'crear_quiz', 'actualizar_quiz', 'eliminar_quiz',
  'crear_curso', 'actualizar_curso', 'eliminar_curso', 'crear_capsula', 'actualizar_capsula', 'eliminar_capsula',
  'abrir_ticket', 'responder_ticket', 'cambiar_estado_ticket',
])
const AVISO_AUTORIZACION = ' REQUIERE AUTORIZACIÓN: llámala primero sin confirmar (no cambia nada, devuelve lo que haría), muéstraselo a la persona y solo si lo aprueba vuelve a llamarla igual con confirmar=true.'
function autorizado(v) { return v === true || v === 'true' }

// ── Utilidades ──────────────────────────────────────────────────────────

class ErrorUsuario extends Error {}
function falla(msg) { throw new ErrorUsuario(msg) }

function texto(v, max) {
  const s = v == null ? '' : String(v).trim()
  return max ? s.slice(0, max) : s
}
function req(v, campo) {
  if (v === undefined || v === null || texto(v) === '') falla('falta ' + campo)
  return v
}
function viene(a, k) { return a && Object.prototype.hasOwnProperty.call(a, k) && a[k] !== undefined }
function fecha(v, campo) {
  const s = texto(v)
  if (!s) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10)) || isNaN(Date.parse(s.slice(0, 10)))) falla(campo + ' debe ser una fecha AAAA-MM-DD')
  return s.slice(0, 10)
}
function hora(v, campo) {
  const s = texto(v)
  if (!s) return null
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  if (!m || +m[1] > 23 || +m[2] > 59) falla((campo || 'hora') + ' debe ser HH:MM (24 horas, Bogotá)')
  return (m[1].length === 1 ? '0' : '') + m[1] + ':' + m[2]
}
function url(v, campo) {
  const s = texto(v)
  if (!s) return null
  const u = /^https?:\/\//i.test(s) ? s : 'https://' + s
  try { new URL(u) } catch (_e) { falla(campo + ' no es un enlace válido') }
  return u
}
function entero(v, campo, min, max) {
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) falla(campo + ' debe ser un número entero entre ' + min + ' y ' + max)
  return n
}
function booleano(v) { return v === true || v === 'true' }
function nuevoId(prefijo) { return prefijo + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }
function corto(s, n) { const t = s == null ? '' : String(s); return t.length > n ? t.slice(0, n) + '…' : t }

// Lectura: devuelve las filas o lanza el error.
async function leer(q) {
  const r = await q
  if (r.error) throw new Error(r.error.message)
  return r.data || []
}
// Escritura en tabla: tiene que devolver filas. Sin error y sin filas = no escribió.
async function escribir(q, queCosa) {
  const r = await q
  if (r.error) throw new Error(r.error.message)
  if (!r.data || !r.data.length) throw new Error('la base no guardó ' + queCosa + ' (¿existe el id?)')
  return r.data
}

/** Saca el id de un enlace de YouTube (watch, youtu.be, shorts, embed, live) o del id suelto. Igual que programa.js. */
function idYoutube(t) {
  t = texto(t)
  if (/^[A-Za-z0-9_-]{11}$/.test(t)) return t
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : 'https://' + t)
    if (u.hostname.replace(/^www\.|^m\./, '') === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
    if (/youtube\.com$/.test(u.hostname)) {
      if (u.searchParams.get('v')) return u.searchParams.get('v')
      const m = u.pathname.match(/\/(embed|shorts|live)\/([A-Za-z0-9_-]{6,20})/)
      if (m) return m[2]
    }
  } catch (_e) { /* no es enlace */ }
  return null
}
/** Saca el id de un archivo de Google Drive (file/d/ID, open?id=ID, uc?id=ID). */
function idDrive(t) {
  try {
    const s = texto(t)
    const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s)
    if (!/(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/.test(u.hostname)) return null
    const m = u.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,80})/)
    const id = m ? m[1] : u.searchParams.get('id')
    return id && /^[A-Za-z0-9_-]{10,80}$/.test(id) ? id : null
  } catch (_e) { return null }
}

/** Preguntas de un quiz en el formato de la app: [{text, options[], correctIndex}]. */
function preguntasQuiz(lista) {
  if (!Array.isArray(lista) || !lista.length) falla('preguntas debe ser una lista con al menos una pregunta')
  if (lista.length > 100) falla('máximo 100 preguntas por quiz')
  return lista.map((p, i) => {
    const n = 'pregunta ' + (i + 1)
    const txt = texto(p && (p.pregunta ?? p.text), 1000)
    if (!txt) falla(n + ': falta el texto')
    const ops = (p.opciones ?? p.options)
    if (!Array.isArray(ops) || ops.length < 2 || ops.length > 8) falla(n + ': debe tener entre 2 y 8 opciones')
    const opciones = ops.map((o) => texto(o, 500))
    if (opciones.some((o) => !o)) falla(n + ': hay una opción vacía')
    let c = p.correcta ?? p.correctIndex
    // Un texto vale primero como la opción misma (las opciones pueden ser números: «4»)
    if (typeof c === 'string') c = opciones.includes(texto(c)) ? opciones.indexOf(texto(c)) : /^\d+$/.test(texto(c)) ? Number(c) : -1
    c = Number(c)
    if (!Number.isInteger(c) || c < 0 || c >= opciones.length) falla(n + ': «correcta» debe ser el número de la opción correcta (0 = la primera) o su texto exacto')
    return { text: txt, options: opciones, correctIndex: c }
  })
}

// ── Herramientas ────────────────────────────────────────────────────────

function herramientas(sb) {
  // La función de la base que corre; devuelve lo que responde o lanza su error.
  async function rpc(fn, args) {
    const r = await sb.rpc(fn, args || {})
    if (r.error) throw new Error(r.error.message)
    return r.data
  }

  // Grupos: por id o por nombre (exacto, o parte del nombre si es uno solo).
  let cacheGrupos = null
  async function grupos() {
    if (!cacheGrupos) cacheGrupos = await leer(sb.from('grupos').select('*').order('nombre'))
    return cacheGrupos
  }
  async function grupo(ref) {
    const t = texto(req(ref, 'grupo'))
    const gs = await grupos()
    const porId = gs.find((g) => g.id === t)
    if (porId) return porId
    const min = t.toLowerCase()
    const exactos = gs.filter((g) => g.nombre.toLowerCase() === min)
    if (exactos.length === 1) return exactos[0]
    const parte = gs.filter((g) => g.nombre.toLowerCase().includes(min))
    if (parte.length === 1) return parte[0]
    if (!parte.length) falla('no hay ningún grupo que se llame «' + t + '». Usa listar_grupos para ver los nombres.')
    falla('«' + t + '» coincide con varios grupos: ' + parte.map((g) => g.nombre + ' (' + g.id + ')').join(', ') + '. Usa el id.')
  }
  function sinClave(g) { const { clave_hash: _c, ...resto } = g; return resto }

  // Audiencia: [] = todos; 'empresas' → tipo:b2b; 'cohortes' → tipo:b2c; o nombres/ids de grupo.
  async function audiencia(v) {
    if (v === undefined) return undefined
    const lista = Array.isArray(v) ? v : [v]
    const out = []
    for (const x of lista) {
      const t = texto(x).toLowerCase()
      if (!t) continue
      if (t === 'todos' || t === 'todas') return []
      if (t === 'empresas' || t === 'tipo:b2b' || t === 'b2b') out.push('tipo:b2b')
      else if (t === 'cohortes' || t === 'tipo:b2c' || t === 'b2c') out.push('tipo:b2c')
      else out.push((await grupo(x)).id)
    }
    return [...new Set(out)]
  }
  async function quienVe(aud) {
    if (!aud || !aud.length) return 'todos los grupos'
    const gs = await grupos()
    return aud.map((x) => x === 'tipo:b2b' ? 'todas las empresas' : x === 'tipo:b2c' ? 'todas las cohortes'
      : (gs.find((g) => g.id === x) || {}).nombre || x).join(', ')
  }
  const ESQ_AUDIENCIA = { type: 'array', items: { type: 'string' },
    description: '¿Quién lo ve? Nombres o ids de grupo, "empresas" (todas las B2B), "cohortes" (todas las B2C) o "todos". Vacío o "todos" = todos los grupos.' }

  // Sesiones válidas para una publicación: las del reto, las propias de grupos cortos, faq y tuto.
  /** Las clases de un grupo: una por su id, o todas las que sigue ("todas"). */
  async function clasesDe(g, id) {
    const propias = (g.formato || 'reto') === 'corto'
    if (texto(id) === 'todas') {
      let q = sb.from('reto_sesiones').select('*').order('orden')
      q = propias ? q.eq('grupo_id', g.id) : q.is('grupo_id', null)
      const r = await leer(q)
      if (!r.length) falla(g.nombre + ' todavía no tiene sesiones')
      return r
    }
    const s = await sesion(req(id, 'sesion_id'))
    if (s.grupo_id ? s.grupo_id !== g.id : propias) falla('la sesión ' + s.id + ' no es de ' + g.nombre + '. Usa listar_sesiones con este grupo.')
    return [s]
  }
  /** La clase de un prompt o una cápsula: "" o null = ninguna. */
  async function claseOpcional(id) {
    return id == null || texto(id) === '' ? null : (await sesion(id)).id
  }

  async function sesion(id, permitirExtras) {
    const t = texto(req(id, 'sesion_id'))
    if (permitirExtras && (t === 'faq' || t === 'tuto')) return { id: t, nombre: t === 'faq' ? 'Preguntas frecuentes' : 'Tutoriales express', grupo_id: null }
    const s = await leer(sb.from('reto_sesiones').select('*').eq('id', t).limit(1))
    if (!s.length) falla('no existe la sesión «' + t + '». Usa listar_sesiones para ver los ids.')
    return s[0]
  }

  async function quitarArchivo(p) {
    // Solo si el archivo está en el almacenamiento de la Academia (los de Maper siguen en el muro).
    if (!p.video_path || !String(p.video_url || '').includes('/' + BUCKET + '/')) return false
    const r = await sb.storage.from(BUCKET).remove([p.video_path])
    return !r.error
  }

  // Paso 1 (sin confirmar): qué se borraría. Paso 2 (confirmar=true): borra y comprueba.
  async function borrar(tabla, id, queCosa, confirmar, vista, despues) {
    if (!autorizado(confirmar)) {
      return { borrado: false, vista_previa: vista, siguiente_paso: 'Muéstrale esto a la persona. Para borrar de verdad, vuelve a llamar con confirmar=true. No se puede deshacer.' }
    }
    await escribir(sb.from(tabla).delete().eq('id', id).select('id'), queCosa)
    if (despues) await despues()
    return { borrado: true, ...vista }
  }

  return {
    // ═════════ Lectura ═════════

    resumen_academia: {
      descripcion: 'Foto general de la Academia: grupos vigentes, personas, quién no ha entrado, próximas sesiones (14 días) y tickets de soporte esperando respuesta. Buen punto de partida.',
      esquema: { type: 'object', properties: {} },
      async correr() {
        const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10)   // Bogotá
        const en14 = new Date(Date.now() - 5 * 3600e3 + 14 * 86400e3).toISOString().slice(0, 10)
        const [gs, crono, sesiones] = await Promise.all([
          rpc('admin_grupos'),
          leer(sb.from('cronograma').select('*').gte('fecha', hoy).lte('fecha', en14).order('fecha')),
          leer(sb.from('reto_sesiones').select('id,corto,nombre')),
        ])
        let tickets = null
        try { tickets = (await rpc('soporte_tickets', { p_email: null })).filter((t) => t.espera_equipo).length } catch (_e) { /* soporte sin instalar */ }
        const nom = Object.fromEntries((gs || []).map((g) => [g.id, g.nombre]))
        const ses = Object.fromEntries(sesiones.map((s) => [s.id, s.corto + '. ' + s.nombre]))
        const vigentes = (gs || []).filter((g) => g.vigente)
        return {
          hoy,
          grupos_vigentes: vigentes.map((g) => ({ id: g.id, nombre: g.nombre, tipo: g.tipo, formato: g.formato, vence_el: g.vence_el,
            personas: g.miembros, han_entrado: g.han_entrado, sin_entrar: Math.max(0, g.miembros - g.han_entrado) })),
          grupos_vencidos_o_inactivos: (gs || []).filter((g) => !g.vigente).map((g) => g.nombre),
          proximas_sesiones: crono.map((c) => ({ grupo: nom[c.grupo_id] || c.grupo_id, sesion: ses[c.sesion_id] || c.sesion_id,
            fecha: c.fecha, hora: c.hora ? String(c.hora).slice(0, 5) : null, enlace: c.enlace })),
          tickets_esperando_respuesta: tickets,
        }
      },
    },

    listar_grupos: {
      descripcion: 'Lista las empresas (b2b) y cohortes (b2c) con su estado: vigente, vencimiento, modalidad (formato: reto = Estándar virtual, presencial = Estándar presencial, corto = Hiperpersonalizado), cuántas personas tienen y cuántas han entrado.',
      esquema: { type: 'object', properties: { solo_vigentes: { type: 'boolean' } } },
      async correr(a) {
        const gs = (await rpc('admin_grupos')) || []
        return gs.filter((g) => !a.solo_vigentes || g.vigente).map((g) => ({
          id: g.id, nombre: g.nombre, tipo: g.tipo, formato: g.formato || 'reto', vigente: g.vigente, activo: g.activo, vence_el: g.vence_el,
          personas: g.miembros, responsables: g.responsables, han_entrado: g.han_entrado,
          fecha_inicio: g.fecha_inicio, fecha_fin: g.fecha_fin, contacto: g.contacto_nombre || null, contacto_email: g.contacto_email || null,
        }))
      },
    },

    ver_grupo: {
      descripcion: 'Todo de un grupo: su ficha, las personas (con su id de miembro), el cronograma sesión por sesión y las grabaciones.',
      esquema: { type: 'object', properties: { grupo: { type: 'string', description: 'Nombre o id del grupo' } }, required: ['grupo'] },
      async correr(a) {
        const g = await grupo(a.grupo)
        const [miembros, crono, grabs, sesiones] = await Promise.all([
          rpc('admin_miembros', { p_grupo: g.id }),
          leer(sb.from('cronograma').select('*').eq('grupo_id', g.id)),
          leer(sb.from('grabaciones').select('*').eq('grupo_id', g.id).order('orden')),
          leer(sb.from('reto_sesiones').select('*').order('orden')),
        ])
        // El candado (supabase-clases.sql); sin la tabla, todo se considera abierto
        const abiertas = await leer(sb.from('clases_abiertas').select('sesion_id').eq('grupo_id', g.id)).then((r) => r.map((x) => x.sesion_id)).catch(() => null)
        const propias = (g.formato || 'reto') === 'corto'
        const suyas = sesiones.filter((s) => propias ? s.grupo_id === g.id : !s.grupo_id)
        return {
          grupo: sinClave(g),
          personas: miembros,
          cronograma: suyas.map((s) => {
            const c = crono.find((x) => x.sesion_id === s.id) || {}
            return { sesion_id: s.id, sesion: s.corto + '. ' + s.nombre, tipo: s.tipo, visible: s.visible,
              abierta: abiertas ? abiertas.includes(s.id) : true,
              fecha: c.fecha || null, hora: c.hora ? String(c.hora).slice(0, 5) : null, plataforma: c.plataforma || null, enlace: c.enlace || null,
              nota: c.nota || null, fecha2: c.fecha2 || null, hora2: c.hora2 ? String(c.hora2).slice(0, 5) : null, enlace2: c.enlace2 || null }
          }),
          grabaciones: grabs.map((x) => ({ id: x.id, sesion_id: x.sesion_id, titulo: x.titulo,
            video: x.youtube_id ? 'https://youtu.be/' + x.youtube_id : 'https://drive.google.com/file/d/' + x.drive_id + '/view' })),
        }
      },
    },

    buscar_personas: {
      descripcion: 'Busca personas por correo o nombre en todos los grupos. Devuelve el id de miembro (para actualizar_persona o quitar_persona) y su grupo.',
      esquema: { type: 'object', properties: { texto: { type: 'string' }, limite: { type: 'integer' } }, required: ['texto'] },
      async correr(a) {
        const t = texto(req(a.texto, 'texto'), 80).replace(/[,()%]/g, ' ')
        const filas = await leer(sb.from('miembros').select('id,email,nombre,rol,activo,ultimo_acceso,grupo_id')
          .or('email.ilike.%' + t + '%,nombre.ilike.%' + t + '%').order('email').limit(Math.min(Number(a.limite) || 30, 200)))
        const gs = await grupos()
        return filas.map((m) => ({ ...m, grupo: (gs.find((g) => g.id === m.grupo_id) || {}).nombre || null }))
      },
    },

    avance_grupo: {
      descripcion: 'El avance de cada persona de un grupo (lo mismo del Panel de avance): último acceso, días activos, tareas completadas, videos vistos, grabaciones completas y notas de los quizzes. Incluye quién no ha entrado.',
      esquema: { type: 'object', properties: { grupo: { type: 'string', description: 'Nombre o id del grupo' } }, required: ['grupo'] },
      async correr(a) {
        const g = await grupo(a.grupo)
        const p = await rpc('panel_grupo', { p_grupo: g.id })
        const videos = new Set((p.posts || []).map((x) => x.id))
        const quizzes = Object.fromEntries((p.quizzes || []).map((q) => [q.id, q.titulo]))
        const personas = (p.miembros || []).map((m) => {
          const tareas = Object.values(m.tareas || {}).filter((x) => x && (x.ok === true || x === true)).length
          const grab = Object.values(m.grabaciones || {})
          return {
            nombre: m.nombre || null, email: m.email, rol: m.rol, activo: m.activo, ultimo_acceso: m.ultimo_acceso,
            dias_activos: m.dias_activos, tareas_completadas: tareas,
            videos_vistos: (m.vistos || []).filter((id) => videos.has(id)).length,
            grabaciones_completas: grab.filter((x) => x.completado).length,
            quizzes: (m.quizzes || []).map((q) => ({ quiz: quizzes[q.quiz_id] || q.quiz_id, puntaje: q.puntaje, total: q.total, fecha: q.fecha })),
          }
        })
        return {
          grupo: p.grupo,
          totales: { personas: personas.length, videos_publicados: videos.size, grabaciones: (p.grabaciones || []).length, quizzes: (p.quizzes || []).length },
          nunca_entraron: personas.filter((x) => !x.ultimo_acceso).map((x) => x.nombre || x.email),
          personas,
        }
      },
    },

    listar_sesiones: {
      descripcion: 'Las sesiones (clases) con su id. Sin grupo: las del reto, que siguen todos los grupos de formato reto. Con un grupo de formato corto (bootcamp o charla): sus sesiones propias.',
      esquema: { type: 'object', properties: { grupo: { type: 'string', description: 'Opcional: nombre o id de un grupo corto' } } },
      async correr(a) {
        let q = sb.from('reto_sesiones').select('*').order('orden')
        if (a.grupo) {
          const g = await grupo(a.grupo)
          q = (g.formato || 'reto') === 'corto' ? q.eq('grupo_id', g.id) : q.is('grupo_id', null)
        } else q = q.is('grupo_id', null)
        return (await leer(q)).map((s) => ({ id: s.id, orden: s.orden, corto: s.corto, nombre: s.nombre, tipo: s.tipo, visible: s.visible, descripcion: s.descripcion }))
      },
    },

    listar_publicaciones: {
      descripcion: 'Publicaciones del muro (texto, video, imagen, PDF o enlace) por sesión. sesion_id "faq" = preguntas frecuentes, "tuto" = tutoriales express. Con grupo: solo lo que ese grupo ve.',
      esquema: { type: 'object', properties: {
        sesion_id: { type: 'string' }, grupo: { type: 'string' }, texto: { type: 'string', description: 'Busca en título y contenido' },
        limite: { type: 'integer', description: 'Por defecto 50' },
      } },
      async correr(a) {
        let q = sb.from('posts').select('id,session,title,body,pinned,orden,video_url,video_name,audiencia,created_at')
          .order('created_at', { ascending: false }).limit(Math.min(Number(a.limite) || 50, 300))
        if (a.sesion_id) q = q.eq('session', texto(a.sesion_id))
        if (a.texto) { const t = texto(a.texto, 80).replace(/[,()%]/g, ' '); q = q.or('title.ilike.%' + t + '%,body.ilike.%' + t + '%') }
        let filas = await leer(q)
        if (a.grupo) {
          const g = await grupo(a.grupo)
          const etq = [g.id, 'tipo:' + g.tipo]
          filas = filas.filter((p) => !p.audiencia || !p.audiencia.length || p.audiencia.some((x) => etq.includes(x)))
        }
        const out = []
        for (const p of filas) out.push({ id: p.id, sesion_id: p.session, titulo: p.title, texto: corto(p.body, 300), fijada: p.pinned,
          adjunto: p.video_url ? { nombre: p.video_name || null, url: p.video_url } : null, quien_lo_ve: await quienVe(p.audiencia), creada: p.created_at })
        return out
      },
    },

    ver_publicacion: {
      descripcion: 'Una publicación completa, con su texto entero.',
      esquema: { type: 'object', properties: { publicacion_id: { type: 'string' } }, required: ['publicacion_id'] },
      async correr(a) {
        const f = await leer(sb.from('posts').select('*').eq('id', texto(req(a.publicacion_id, 'publicacion_id'))).limit(1))
        if (!f.length) falla('no existe la publicación ' + a.publicacion_id)
        return { ...f[0], quien_lo_ve: await quienVe(f[0].audiencia) }
      },
    },

    listar_skills: {
      descripcion: 'El catálogo de prompts (skills): título, área, nivel, si está prendida y quién la ve. Sin el prompt completo (usa ver_skill).',
      esquema: { type: 'object', properties: { texto: { type: 'string' }, area: { type: 'string' } } },
      async correr(a) {
        let q = sb.from('skills').select('*').order('area').order('title')
        if (a.area) q = q.ilike('area', '%' + texto(a.area, 60) + '%')
        if (a.texto) { const t = texto(a.texto, 80).replace(/[,()%]/g, ' '); q = q.or('title.ilike.%' + t + '%,tags.ilike.%' + t + '%,objective.ilike.%' + t + '%') }
        const out = []
        for (const s of await leer(q)) out.push({ id: s.id, titulo: s.title, area: s.area, nivel: s.level, etiquetas: s.tags,
          objetivo: corto(s.objective, 200), clase: s.sesion_id || null, prendida: s.visible !== false, quien_la_ve: await quienVe(s.audiencia) })
        return out
      },
    },

    ver_skill: {
      descripcion: 'Una skill completa, con su prompt.',
      esquema: { type: 'object', properties: { skill_id: { type: 'string' } }, required: ['skill_id'] },
      async correr(a) {
        const f = await leer(sb.from('skills').select('*').eq('id', texto(req(a.skill_id, 'skill_id'))).limit(1))
        if (!f.length) falla('no existe la skill ' + a.skill_id)
        return { ...f[0], quien_la_ve: await quienVe(f[0].audiencia) }
      },
    },

    listar_quizzes: {
      descripcion: 'Los quizzes: sesión a la que pertenecen, si están publicados, % para aprobar, intentos permitidos, cuántas preguntas tienen y quién los ve.',
      esquema: { type: 'object', properties: {} },
      async correr() {
        const out = []
        for (const q of await leer(sb.from('quizzes').select('*').order('orden'))) out.push({ id: q.id, titulo: q.titulo, sesion_id: q.sesion_id || null,
          publicado: q.activo, aprobar: q.aprobar, intentos: q.intentos, obligatorio: q.obligatorio,
          preguntas: Array.isArray(q.preguntas) ? q.preguntas.length : 0, quien_lo_ve: await quienVe(q.audiencia) })
        return out
      },
    },

    ver_quiz: {
      descripcion: 'Un quiz completo con sus preguntas, opciones y cuál es la correcta (correctIndex, 0 = la primera).',
      esquema: { type: 'object', properties: { quiz_id: { type: 'string' } }, required: ['quiz_id'] },
      async correr(a) {
        const f = await leer(sb.from('quizzes').select('*').eq('id', texto(req(a.quiz_id, 'quiz_id'))).limit(1))
        if (!f.length) falla('no existe el quiz ' + a.quiz_id)
        return { ...f[0], quien_lo_ve: await quienVe(f[0].audiencia) }
      },
    },

    resultados_quiz: {
      descripcion: 'Cómo le fue a cada persona en un quiz: su último intento, su mejor nota y cuántas veces lo hizo. Con grupo, solo las personas de ese grupo.',
      esquema: { type: 'object', properties: { quiz_id: { type: 'string' }, grupo: { type: 'string' } }, required: ['quiz_id'] },
      async correr(a) {
        const id = texto(req(a.quiz_id, 'quiz_id'))
        let filas = await leer(sb.from('quiz_resultados').select('email,nombre,puntaje,total,created_at').eq('quiz_id', id).order('created_at'))
        if (a.grupo) {
          const g = await grupo(a.grupo)
          const correos = new Set((await leer(sb.from('miembros').select('email').eq('grupo_id', g.id))).map((m) => m.email))
          filas = filas.filter((r) => r.email && correos.has(r.email))
        }
        const por = {}
        for (const r of filas) {
          const k = r.email || r.nombre
          const x = por[k] || (por[k] = { persona: r.nombre || r.email, email: r.email, intentos: 0, mejor: 0, total: r.total })
          x.intentos++; x.mejor = Math.max(x.mejor, r.puntaje); x.ultimo = r.puntaje; x.fecha = r.created_at; x.total = r.total
        }
        return Object.values(por)
      },
    },

    listar_cursos: {
      descripcion: 'Los cursos a tu ritmo con cuántas cápsulas tienen, si están visibles y quién los ve.',
      esquema: { type: 'object', properties: {} },
      async correr() {
        const [cs, caps] = await Promise.all([
          leer(sb.from('cursos').select('*').order('orden')),
          leer(sb.from('cursos_capsulas').select('curso_id')),
        ])
        const out = []
        for (const c of cs) out.push({ id: c.id, titulo: c.titulo, area: c.area, nivel: c.nivel, instructor: c.instructor, visible: c.visible,
          capsulas: caps.filter((k) => k.curso_id === c.id).length, quien_lo_ve: await quienVe(c.audiencia) })
        return out
      },
    },

    ver_curso: {
      descripcion: 'Un curso con todas sus cápsulas (video, resumen, recursos) en orden.',
      esquema: { type: 'object', properties: { curso_id: { type: 'string' } }, required: ['curso_id'] },
      async correr(a) {
        const id = texto(req(a.curso_id, 'curso_id'))
        const [c, caps] = await Promise.all([
          leer(sb.from('cursos').select('*').eq('id', id).limit(1)),
          leer(sb.from('cursos_capsulas').select('*').eq('curso_id', id).order('orden')),
        ])
        if (!c.length) falla('no existe el curso ' + id)
        return { curso: { ...c[0], quien_lo_ve: await quienVe(c[0].audiencia) }, capsulas: caps }
      },
    },

    listar_tickets: {
      descripcion: 'Tickets de soporte. espera_equipo = la persona escribió y nadie le ha respondido.',
      esquema: { type: 'object', properties: {
        estado: { type: 'string', enum: ['abierto', 'cerrado', 'esperando'], description: '"esperando" = abiertos sin respuesta del equipo' },
        email: { type: 'string', description: 'Solo los de esta persona' },
      } },
      async correr(a) {
        let t = (await rpc('soporte_tickets', { p_email: a.email ? texto(a.email).toLowerCase() : null })) || []
        if (a.estado === 'esperando') t = t.filter((x) => x.espera_equipo)
        else if (a.estado) t = t.filter((x) => x.estado === a.estado)
        return t
      },
    },

    ver_ticket: {
      descripcion: 'Un ticket de soporte con toda la conversación. No lo marca como leído.',
      esquema: { type: 'object', properties: { ticket_id: { type: 'string' } }, required: ['ticket_id'] },
      async correr(a) {
        const id = texto(req(a.ticket_id, 'ticket_id'))
        const [t, m] = await Promise.all([
          leer(sb.from('soporte_tickets').select('*').eq('id', id).limit(1)),
          leer(sb.from('soporte_mensajes').select('es_equipo,autor,autor_email,texto,created_at').eq('ticket_id', id).order('created_at')),
        ])
        if (!t.length) falla('no existe el ticket ' + id)
        return { ticket: t[0], mensajes: m }
      },
    },

    // ═════════ Grupos y personas ═════════

    crear_grupo: {
      descripcion: 'Crea una empresa (b2b) o cohorte (b2c) con su contraseña de acceso. Modalidad (formato): "reto" = Estándar virtual, "presencial" = Estándar presencial, "corto" = Hiperpersonalizado con sesiones propias. Todas las clases nacen cerradas: se abren con abrir_clase. Después se agregan las personas con agregar_personas.',
      esquema: { type: 'object', properties: {
        nombre: { type: 'string' }, tipo: { type: 'string', enum: ['b2b', 'b2c'] },
        clave: { type: 'string', description: 'Contraseña del grupo (mínimo 6 caracteres). Cada persona entra con su correo + esta clave.' },
        vence_el: { type: 'string', description: 'Último día con acceso, AAAA-MM-DD. Vacío = no vence.' },
        formato: { type: 'string', enum: ['reto', 'presencial', 'corto'], description: 'reto = Estándar virtual, presencial = Estándar presencial (sin grabaciones: en cada clase ve los videos del curso marcados con esa clase), corto = Hiperpersonalizado (sesiones propias)' },
        fecha_inicio: { type: 'string' }, fecha_fin: { type: 'string' },
        contacto_nombre: { type: 'string' }, contacto_cargo: { type: 'string' }, contacto_email: { type: 'string' }, contacto_telefono: { type: 'string' },
        nit: { type: 'string' }, sector: { type: 'string' }, plazas: { type: 'integer' }, whatsapp_url: { type: 'string' }, logo_url: { type: 'string' },
        extras_off: { type: 'array', items: { type: 'string', enum: EXTRAS }, description: 'Extras del menú que este grupo NO ve' },
      }, required: ['nombre', 'tipo', 'clave'] },
      async correr(a) {
        const clave = texto(req(a.clave, 'clave'))
        const id = await rpc('admin_guardar_grupo', { p_id: null, p_nombre: texto(req(a.nombre, 'nombre'), 120), p_tipo: a.tipo,
          p_clave: clave, p_vence: fecha(a.vence_el, 'vence_el'), p_activo: true })
        if (!id) throw new Error('la base no creó el grupo')
        const ficha = {}
        for (const k of FICHA) if (viene(a, k)) ficha[k] = a[k]
        if (!ficha.formato) ficha.formato = 'reto'
        await rpc('admin_ficha_grupo', { p_id: id, p_ficha: ficha })
        return { creado: true, grupo_id: id, nombre: texto(a.nombre), siguiente_paso: 'Agrega las personas con agregar_personas.' }
      },
    },

    actualizar_grupo: {
      descripcion: 'Cambia lo que se indique de un grupo: nombre, tipo, contraseña (al cambiarla se cierran las sesiones abiertas de sus personas), vencimiento, activo, formato, extras apagados o datos de la ficha. Lo que no se mande queda igual. vence_el vacío ("") = deja de vencer.',
      esquema: { type: 'object', properties: {
        grupo: { type: 'string', description: 'Nombre o id' },
        nombre: { type: 'string' }, tipo: { type: 'string', enum: ['b2b', 'b2c'] }, clave: { type: 'string' },
        vence_el: { type: 'string' }, activo: { type: 'boolean' }, formato: { type: 'string', enum: ['reto', 'presencial', 'corto'], description: 'reto = Estándar virtual, presencial = Estándar presencial (sin grabaciones: en cada clase ve los videos del curso marcados con esa clase), corto = Hiperpersonalizado (sesiones propias)' },
        fecha_inicio: { type: 'string' }, fecha_fin: { type: 'string' },
        contacto_nombre: { type: 'string' }, contacto_cargo: { type: 'string' }, contacto_email: { type: 'string' }, contacto_telefono: { type: 'string' },
        nit: { type: 'string' }, sector: { type: 'string' }, plazas: { type: 'integer' }, whatsapp_url: { type: 'string' }, logo_url: { type: 'string' },
        extras_off: { type: 'array', items: { type: 'string', enum: EXTRAS } },
      }, required: ['grupo'] },
      async vista(a) {
        const g = await grupo(a.grupo)
        const cambios = {}
        for (const k of ['nombre', 'tipo', 'vence_el', 'activo', ...FICHA]) if (viene(a, k)) cambios[k] = { antes: g[k] ?? null, despues: a[k] }
        if (viene(a, 'clave')) cambios.clave = { antes: '(oculta)', despues: '(nueva) — se cierran las sesiones abiertas de sus personas' }
        return { grupo: g.nombre, cambios }
      },
      async correr(a) {
        const g = await grupo(a.grupo)
        let tocado = false
        if (['nombre', 'tipo', 'clave', 'vence_el', 'activo'].some((k) => viene(a, k))) {
          await rpc('admin_guardar_grupo', { p_id: g.id,
            p_nombre: viene(a, 'nombre') ? texto(a.nombre, 120) : g.nombre,
            p_tipo: viene(a, 'tipo') ? a.tipo : g.tipo,
            p_clave: viene(a, 'clave') ? texto(a.clave) : '',
            p_vence: viene(a, 'vence_el') ? fecha(a.vence_el, 'vence_el') : g.vence_el,
            p_activo: viene(a, 'activo') ? booleano(a.activo) : g.activo })
          tocado = true
        }
        if (FICHA.some((k) => viene(a, k))) {
          // admin_ficha_grupo reemplaza la ficha entera: se parte de lo que ya tiene
          const ficha = {}
          for (const k of FICHA) ficha[k] = viene(a, k) ? a[k] : (g[k] ?? null)
          await rpc('admin_ficha_grupo', { p_id: g.id, p_ficha: ficha })
          tocado = true
        }
        if (!tocado) falla('no mandaste nada para cambiar')
        cacheGrupos = null
        return { actualizado: true, grupo: sinClave(await grupo(g.id)) }
      },
    },

    eliminar_grupo: {
      descripcion: 'Elimina un grupo con TODAS sus personas, su cronograma y sus grabaciones; lo publicado deja de dirigirse a él. Si solo se quiere cortar el acceso, mejor actualizar_grupo con activo=false. Primero sin confirmar; después con confirmar=true.',
      esquema: { type: 'object', properties: { grupo: { type: 'string' }, confirmar: { type: 'boolean', description: 'true para borrar de verdad. Sin esto solo muestra qué se borraría.' } }, required: ['grupo'] },
      async correr(a) {
        const g = await grupo(a.grupo)
        const [m, c, gr] = await Promise.all([
          leer(sb.from('miembros').select('id').eq('grupo_id', g.id)),
          leer(sb.from('cronograma').select('sesion_id').eq('grupo_id', g.id)),
          leer(sb.from('grabaciones').select('id').eq('grupo_id', g.id)),
        ])
        const vista = { grupo: g.nombre, tambien_se_borra: { personas: m.length, sesiones_programadas: c.length, grabaciones: gr.length } }
        if (!autorizado(a.confirmar)) return { borrado: false, vista_previa: vista, siguiente_paso: 'Muéstrale esto a la persona. Para borrar de verdad, vuelve a llamar con confirmar=true. No se puede deshacer.' }
        await rpc('admin_borrar_grupo', { p_id: g.id })
        cacheGrupos = null
        if ((await grupos()).some((x) => x.id === g.id)) throw new Error('la base no borró el grupo')
        return { borrado: true, ...vista }
      },
    },

    agregar_personas: {
      descripcion: 'Da de alta personas en un grupo (hasta 5000). Si el correo ya estaba, lo reactiva y actualiza su nombre (y su rol si viene). rol "responsable" = ve el panel de avance de su equipo.',
      esquema: { type: 'object', properties: {
        grupo: { type: 'string' },
        personas: { type: 'array', items: { type: 'object', properties: {
          email: { type: 'string' }, nombre: { type: 'string' }, rol: { type: 'string', enum: ['estudiante', 'responsable'] } }, required: ['email'] } },
      }, required: ['grupo', 'personas'] },
      async correr(a) {
        const g = await grupo(a.grupo)
        if (!Array.isArray(a.personas) || !a.personas.length) falla('personas debe ser una lista con al menos un correo')
        const filas = a.personas.map((p) => ({ email: texto(p.email).toLowerCase(), nombre: texto(p.nombre, 120), ...(p.rol ? { rol: p.rol } : {}) }))
        const r = await rpc('admin_agregar_miembros', { p_grupo: g.id, p_filas: filas })
        return { grupo: g.nombre, ...r, recuerda: 'Cada persona entra en academia.porcontar.com con su correo y la contraseña del grupo.' }
      },
    },

    actualizar_persona: {
      descripcion: 'Cambia el nombre, el rol (estudiante o responsable) o el acceso (activo=false corta su acceso de inmediato) de una persona. Usa el miembro_id de ver_grupo o buscar_personas.',
      esquema: { type: 'object', properties: {
        miembro_id: { type: 'integer' }, nombre: { type: 'string' }, rol: { type: 'string', enum: ['estudiante', 'responsable'] }, activo: { type: 'boolean' },
      }, required: ['miembro_id'] },
      async vista(a) {
        const m = await leer(sb.from('miembros').select('*').eq('id', Number(a.miembro_id)).limit(1))
        if (!m.length) falla('no existe el miembro ' + a.miembro_id)
        return { persona: m[0].email, grupo: (await grupo(m[0].grupo_id)).nombre,
          cambios: Object.fromEntries(['nombre', 'rol', 'activo'].filter((k) => viene(a, k)).map((k) => [k, { antes: m[0][k], despues: a[k] }])) }
      },
      async correr(a) {
        const m = await leer(sb.from('miembros').select('*').eq('id', Number(req(a.miembro_id, 'miembro_id'))).limit(1))
        if (!m.length) falla('no existe el miembro ' + a.miembro_id)
        const x = m[0]
        await rpc('admin_actualizar_miembro', { p_id: x.id,
          p_nombre: viene(a, 'nombre') ? texto(a.nombre, 120) : x.nombre,
          p_rol: viene(a, 'rol') ? a.rol : x.rol,
          p_activo: viene(a, 'activo') ? booleano(a.activo) : x.activo })
        return { actualizado: true, persona: (await leer(sb.from('miembros').select('id,email,nombre,rol,activo').eq('id', x.id)))[0] }
      },
    },

    quitar_persona: {
      descripcion: 'Saca a una persona de un grupo (borra su fila en ese grupo; su avance queda guardado por correo). Para solo cortarle el acceso, mejor actualizar_persona con activo=false. Primero sin confirmar; después con confirmar=true.',
      esquema: { type: 'object', properties: { miembro_id: { type: 'integer' }, confirmar: { type: 'boolean', description: 'true para borrar de verdad.' } }, required: ['miembro_id'] },
      async correr(a) {
        const m = await leer(sb.from('miembros').select('id,email,nombre,rol,grupo_id').eq('id', Number(req(a.miembro_id, 'miembro_id'))).limit(1))
        if (!m.length) falla('no existe el miembro ' + a.miembro_id)
        const vista = { persona: m[0], grupo: (await grupo(m[0].grupo_id)).nombre }
        if (!autorizado(a.confirmar)) return { borrado: false, vista_previa: vista, siguiente_paso: 'Muéstrale esto a la persona. Para quitarla de verdad, vuelve a llamar con confirmar=true.' }
        await rpc('admin_quitar_miembro', { p_id: m[0].id })
        if ((await leer(sb.from('miembros').select('id').eq('id', m[0].id))).length) throw new Error('la base no quitó a la persona')
        return { borrado: true, ...vista }
      },
    },

    // ═════════ Sesiones, cronograma y grabaciones ═════════

    actualizar_sesion: {
      descripcion: 'Cambia el nombre, el texto corto ("Clase 1"), la descripción, el tipo o si está visible de una sesión. OJO: las sesiones del reto (sin grupo) son las mismas para todos los grupos de formato reto.',
      esquema: { type: 'object', properties: {
        sesion_id: { type: 'string' }, corto: { type: 'string' }, nombre: { type: 'string' }, descripcion: { type: 'string' },
        tipo: { type: 'string', enum: TIPOS_SESION }, visible: { type: 'boolean' },
      }, required: ['sesion_id'] },
      async vista(a) {
        const s = await sesion(a.sesion_id)
        return { sesion: s.corto + '. ' + s.nombre, afecta_a: s.grupo_id ? (await grupo(s.grupo_id)).nombre : 'todos los grupos de formato reto',
          cambios: Object.fromEntries(['corto', 'nombre', 'descripcion', 'tipo', 'visible'].filter((k) => viene(a, k)).map((k) => [k, { antes: s[k], despues: a[k] }])) }
      },
      async correr(a) {
        const s = await sesion(a.sesion_id)
        const c = {}
        if (viene(a, 'corto')) c.corto = texto(req(a.corto, 'corto'), 40)
        if (viene(a, 'nombre')) c.nombre = texto(req(a.nombre, 'nombre'), 160)
        if (viene(a, 'descripcion')) c.descripcion = texto(a.descripcion, 2000)
        if (viene(a, 'tipo')) { if (!TIPOS_SESION.includes(a.tipo)) falla('tipo no válido'); c.tipo = a.tipo }
        if (viene(a, 'visible')) c.visible = booleano(a.visible)
        if (!Object.keys(c).length) falla('no mandaste nada para cambiar')
        c.updated_at = new Date().toISOString()
        return { actualizado: true, sesion: (await escribir(sb.from('reto_sesiones').update(c).eq('id', s.id).select(), 'la sesión'))[0] }
      },
    },

    abrir_clase: {
      descripcion: 'Abre una clase para un grupo (sus personas ya ven su contenido) o la cierra con abrir=false (la ven con candado y sin contenido). Cada clase nace cerrada para cada grupo. sesion_id "todas" abre o cierra todas las clases del grupo.',
      esquema: { type: 'object', properties: {
        grupo: { type: 'string' }, sesion_id: { type: 'string', description: 'Id de la sesión (listar_sesiones) o "todas"' },
        abrir: { type: 'boolean', description: 'true = abrir (por defecto), false = cerrar' },
      }, required: ['grupo', 'sesion_id'] },
      async vista(a) {
        const g = await grupo(a.grupo), abrir = viene(a, 'abrir') ? booleano(a.abrir) : true
        const ses = await clasesDe(g, a.sesion_id)
        return { grupo: g.nombre, accion: abrir ? 'abrir' : 'cerrar', clases: ses.map((s) => s.corto + '. ' + s.nombre) }
      },
      async correr(a) {
        const g = await grupo(a.grupo), abrir = viene(a, 'abrir') ? booleano(a.abrir) : true
        const ses = await clasesDe(g, a.sesion_id)
        if (abrir) await escribir(sb.from('clases_abiertas').upsert(ses.map((s) => ({ grupo_id: g.id, sesion_id: s.id })), { onConflict: 'grupo_id,sesion_id' }).select(), 'el candado')
        else await leer(sb.from('clases_abiertas').delete().eq('grupo_id', g.id).in('sesion_id', ses.map((s) => s.id)).select())   // cerrar la que ya estaba cerrada no es error
        return { hecho: true, grupo: g.nombre, accion: abrir ? 'abiertas' : 'cerradas', clases: ses.map((s) => s.corto + '. ' + s.nombre) }
      },
    },

    programar_sesion: {
      descripcion: 'Pone o cambia en el cronograma de un grupo la fecha, hora (Bogotá), plataforma, enlace y nota de una sesión, y si la clase va partida en dos encuentros, la fecha2, hora2 y enlace2 de la 2.ª parte. Lo que no se mande queda igual; "" lo borra.',
      esquema: { type: 'object', properties: {
        grupo: { type: 'string' }, sesion_id: { type: 'string' },
        fecha: { type: 'string', description: 'AAAA-MM-DD' }, hora: { type: 'string', description: 'HH:MM' },
        plataforma: { type: 'string', description: 'Por defecto Google Meet' }, enlace: { type: 'string' }, nota: { type: 'string' },
        fecha2: { type: 'string' }, hora2: { type: 'string' }, enlace2: { type: 'string' },
      }, required: ['grupo', 'sesion_id'] },
      async vista(a) {
        const g = await grupo(a.grupo), s = await sesion(a.sesion_id)
        const c = (await leer(sb.from('cronograma').select('*').eq('grupo_id', g.id).eq('sesion_id', s.id)))[0] || {}
        return { grupo: g.nombre, sesion: s.corto + '. ' + s.nombre,
          cambios: Object.fromEntries(['fecha', 'hora', 'plataforma', 'enlace', 'nota', 'fecha2', 'hora2', 'enlace2'].filter((k) => viene(a, k)).map((k) => [k, { antes: c[k] ?? null, despues: a[k] }])) }
      },
      async correr(a) {
        const g = await grupo(a.grupo), s = await sesion(a.sesion_id)
        if (s.grupo_id ? s.grupo_id !== g.id : (g.formato || 'reto') === 'corto') falla('la sesión ' + s.id + ' no es de ' + g.nombre + '. Usa listar_sesiones con este grupo.')
        const fila = { grupo_id: g.id, sesion_id: s.id, updated_at: new Date().toISOString() }
        if (viene(a, 'fecha')) fila.fecha = fecha(a.fecha, 'fecha')
        if (viene(a, 'hora')) fila.hora = hora(a.hora, 'hora')
        if (viene(a, 'plataforma')) fila.plataforma = texto(a.plataforma, 60) || 'Google Meet'
        if (viene(a, 'enlace')) fila.enlace = url(a.enlace, 'enlace')
        if (viene(a, 'nota')) fila.nota = texto(a.nota, 500) || null
        if (viene(a, 'fecha2')) fila.fecha2 = fecha(a.fecha2, 'fecha2')
        if (viene(a, 'hora2')) fila.hora2 = hora(a.hora2, 'hora2')
        if (viene(a, 'enlace2')) fila.enlace2 = url(a.enlace2, 'enlace2')
        if (Object.keys(fila).length <= 3) falla('no mandaste nada para programar')
        const r = await escribir(sb.from('cronograma').upsert(fila, { onConflict: 'grupo_id,sesion_id' }).select(), 'el cronograma')
        return { programado: true, grupo: g.nombre, sesion: s.corto + '. ' + s.nombre, cronograma: r[0] }
      },
    },

    agregar_grabacion: {
      descripcion: 'Agrega la grabación de una clase para un grupo: enlace de YouTube (puede ser oculto) o de Google Drive. Solo la ve ese grupo, en esa sesión.',
      esquema: { type: 'object', properties: {
        grupo: { type: 'string' }, sesion_id: { type: 'string' }, enlace: { type: 'string' }, titulo: { type: 'string' },
      }, required: ['grupo', 'sesion_id', 'enlace'] },
      async correr(a) {
        const g = await grupo(a.grupo), s = await sesion(a.sesion_id)
        const yt = idYoutube(a.enlace), dr = yt ? null : idDrive(a.enlace)
        if (!yt && !dr) falla('el enlace debe ser de un video de YouTube o de un archivo de Google Drive')
        const hay = await leer(sb.from('grabaciones').select('id').eq('grupo_id', g.id).eq('sesion_id', s.id))
        const fila = { id: nuevoId('g'), grupo_id: g.id, sesion_id: s.id, youtube_id: yt, drive_id: dr, orden: hay.length,
          titulo: texto(a.titulo, 160) || (hay.length ? 'Parte ' + (hay.length + 1) : 'Grabación de la clase') }
        return { agregada: true, grupo: g.nombre, sesion: s.corto + '. ' + s.nombre, grabacion: (await escribir(sb.from('grabaciones').insert(fila).select(), 'la grabación'))[0] }
      },
    },

    eliminar_grabacion: {
      descripcion: 'Quita una grabación (y el registro de quién la vio). Usa el id de ver_grupo. Primero sin confirmar; después con confirmar=true.',
      esquema: { type: 'object', properties: { grabacion_id: { type: 'string' }, confirmar: { type: 'boolean' } }, required: ['grabacion_id'] },
      async correr(a) {
        const id = texto(req(a.grabacion_id, 'grabacion_id'))
        const f = await leer(sb.from('grabaciones').select('*').eq('id', id).limit(1))
        if (!f.length) falla('no existe la grabación ' + id)
        return borrar('grabaciones', id, 'la grabación', a.confirmar, { grabacion: f[0].titulo, grupo: (await grupo(f[0].grupo_id)).nombre, sesion_id: f[0].sesion_id })
      },
    },

    // ═════════ Publicaciones ═════════

    crear_publicacion: {
      descripcion: 'Publica en el muro de una sesión (o en "faq" = preguntas frecuentes, "tuto" = tutoriales express): título, texto y, si hay, un enlace (YouTube, Drive, Loom, una página…). Los archivos (subir video, imagen o PDF) se hacen desde la app. Por defecto la ven todos los grupos: usa audiencia para dirigirla.',
      esquema: { type: 'object', properties: {
        sesion_id: { type: 'string' }, titulo: { type: 'string' }, texto: { type: 'string', description: 'Admite **negrita**, > cita y enlaces' },
        enlace: { type: 'string' }, fijada: { type: 'boolean', description: 'Destacarla arriba' }, audiencia: ESQ_AUDIENCIA,
      }, required: ['sesion_id', 'titulo'] },
      async vista(a) {
        const s = await sesion(a.sesion_id, true)
        return { sesion: s.corto ? s.corto + '. ' + s.nombre : s.nombre, titulo: a.titulo, texto: corto(a.texto, 400), enlace: a.enlace || null,
          fijada: booleano(a.fijada), quien_la_ve: await quienVe(await audiencia(a.audiencia)) }
      },
      async correr(a) {
        const s = await sesion(a.sesion_id, true)
        const ahora = new Date().toISOString()
        const fila = { id: nuevoId('p'), session: s.id, title: texto(req(a.titulo, 'titulo'), 300), body: texto(a.texto, 20000),
          pinned: booleano(a.fijada), author: 'PorContar', initials: 'PC', video_url: url(a.enlace, 'enlace'), video_path: null, video_name: null,
          reactions: {}, audiencia: (await audiencia(a.audiencia)) || [], created_at: ahora, updated_at: ahora }
        const r = (await escribir(sb.from('posts').insert(fila).select(), 'la publicación'))[0]
        return { publicada: true, publicacion_id: r.id, sesion_id: r.session, quien_la_ve: await quienVe(r.audiencia) }
      },
    },

    actualizar_publicacion: {
      descripcion: 'Cambia el título, texto, sesión, enlace, si está fijada o quién la ve de una publicación. Lo que no se mande queda igual.',
      esquema: { type: 'object', properties: {
        publicacion_id: { type: 'string' }, sesion_id: { type: 'string' }, titulo: { type: 'string' }, texto: { type: 'string' },
        enlace: { type: 'string', description: '"" quita el enlace' }, fijada: { type: 'boolean' }, audiencia: ESQ_AUDIENCIA,
      }, required: ['publicacion_id'] },
      async vista(a) {
        const p = (await leer(sb.from('posts').select('*').eq('id', texto(a.publicacion_id)).limit(1)))[0]
        if (!p) falla('no existe la publicación ' + a.publicacion_id)
        const c = {}
        if (viene(a, 'sesion_id')) c.sesion_id = { antes: p.session, despues: a.sesion_id }
        if (viene(a, 'titulo')) c.titulo = { antes: p.title, despues: a.titulo }
        if (viene(a, 'texto')) c.texto = { antes: corto(p.body, 300), despues: corto(a.texto, 300) }
        if (viene(a, 'enlace')) c.enlace = { antes: p.video_url, despues: a.enlace || null }
        if (viene(a, 'fijada')) c.fijada = { antes: p.pinned, despues: booleano(a.fijada) }
        if (viene(a, 'audiencia')) c.quien_la_ve = { antes: await quienVe(p.audiencia), despues: await quienVe(await audiencia(a.audiencia)) }
        return { publicacion: p.title, cambios: c }
      },
      async correr(a) {
        const id = texto(req(a.publicacion_id, 'publicacion_id'))
        const p = (await leer(sb.from('posts').select('*').eq('id', id).limit(1)))[0]
        if (!p) falla('no existe la publicación ' + id)
        const c = {}
        if (viene(a, 'sesion_id')) c.session = (await sesion(a.sesion_id, true)).id
        if (viene(a, 'titulo')) c.title = texto(req(a.titulo, 'titulo'), 300)
        if (viene(a, 'texto')) c.body = texto(a.texto, 20000)
        if (viene(a, 'enlace')) {
          if (p.video_path) falla('esta publicación tiene un archivo subido: cámbialo desde la app')
          c.video_url = url(a.enlace, 'enlace')
        }
        if (viene(a, 'fijada')) c.pinned = booleano(a.fijada)
        if (viene(a, 'audiencia')) c.audiencia = await audiencia(a.audiencia)
        if (!Object.keys(c).length) falla('no mandaste nada para cambiar')
        c.updated_at = new Date().toISOString()
        const r = (await escribir(sb.from('posts').update(c).eq('id', id).select(), 'la publicación'))[0]
        return { actualizada: true, publicacion_id: r.id, sesion_id: r.session, titulo: r.title, quien_la_ve: await quienVe(r.audiencia) }
      },
    },

    eliminar_publicacion: {
      descripcion: 'Elimina una publicación (y su archivo, si se subió a la Academia). Primero sin confirmar; después con confirmar=true.',
      esquema: { type: 'object', properties: { publicacion_id: { type: 'string' }, confirmar: { type: 'boolean' } }, required: ['publicacion_id'] },
      async correr(a) {
        const id = texto(req(a.publicacion_id, 'publicacion_id'))
        const p = (await leer(sb.from('posts').select('*').eq('id', id).limit(1)))[0]
        if (!p) falla('no existe la publicación ' + id)
        return borrar('posts', id, 'la publicación', a.confirmar,
          { publicacion: p.title, sesion_id: p.session, archivo: p.video_name || null, quien_la_ve: await quienVe(p.audiencia) },
          () => quitarArchivo(p))
      },
    },

    // ═════════ Skills (catálogo de prompts) ═════════

    crear_skill: {
      descripcion: 'Agrega una skill al catálogo de prompts. Nace prendida salvo que se mande visible=false.',
      esquema: { type: 'object', properties: {
        titulo: { type: 'string' }, area: { type: 'string' }, nivel: { type: 'string', enum: NIVELES }, etiquetas: { type: 'string', description: 'Separadas por coma' },
        objetivo: { type: 'string' }, prompt: { type: 'string' }, visible: { type: 'boolean' }, audiencia: ESQ_AUDIENCIA,
        sesion_id: { type: 'string', description: 'Opcional: la clase (listar_sesiones). Con clase, aparece en esa clase y solo cuando esté abierta para el grupo. "" la quita.' },
      }, required: ['titulo', 'area', 'prompt'] },
      async correr(a) {
        if (a.nivel && !NIVELES.includes(a.nivel)) falla('nivel debe ser ' + NIVELES.join(', '))
        const ahora = new Date().toISOString()
        const fila = { id: nuevoId('p'), title: texto(req(a.titulo, 'titulo'), 200), area: texto(req(a.area, 'area'), 80), level: a.nivel || 'Básico',
          tags: texto(a.etiquetas, 300), objective: texto(a.objetivo, 2000) || null, prompt: texto(req(a.prompt, 'prompt'), 50000),
          visible: viene(a, 'visible') ? booleano(a.visible) : true, audiencia: (await audiencia(a.audiencia)) || [], created_at: ahora, updated_at: ahora }
        if (viene(a, 'sesion_id')) fila.sesion_id = await claseOpcional(a.sesion_id)
        const r = (await escribir(sb.from('skills').insert(fila).select(), 'la skill'))[0]
        return { creada: true, skill_id: r.id, titulo: r.title, quien_la_ve: await quienVe(r.audiencia) }
      },
    },

    actualizar_skill: {
      descripcion: 'Cambia lo que se indique de una skill; visible=false la apaga (solo la ve el admin). Lo que no se mande queda igual.',
      esquema: { type: 'object', properties: {
        skill_id: { type: 'string' }, titulo: { type: 'string' }, area: { type: 'string' }, nivel: { type: 'string', enum: NIVELES },
        etiquetas: { type: 'string' }, objetivo: { type: 'string' }, prompt: { type: 'string' }, visible: { type: 'boolean' }, audiencia: ESQ_AUDIENCIA,
        sesion_id: { type: 'string', description: 'Opcional: la clase (listar_sesiones). Con clase, aparece en esa clase y solo cuando esté abierta para el grupo. "" la quita.' },
      }, required: ['skill_id'] },
      async correr(a) {
        const id = texto(req(a.skill_id, 'skill_id'))
        const c = {}
        if (viene(a, 'titulo')) c.title = texto(req(a.titulo, 'titulo'), 200)
        if (viene(a, 'area')) c.area = texto(req(a.area, 'area'), 80)
        if (viene(a, 'nivel')) { if (!NIVELES.includes(a.nivel)) falla('nivel no válido'); c.level = a.nivel }
        if (viene(a, 'etiquetas')) c.tags = texto(a.etiquetas, 300)
        if (viene(a, 'objetivo')) c.objective = texto(a.objetivo, 2000) || null
        if (viene(a, 'prompt')) c.prompt = texto(req(a.prompt, 'prompt'), 50000)
        if (viene(a, 'visible')) c.visible = booleano(a.visible)
        if (viene(a, 'audiencia')) c.audiencia = await audiencia(a.audiencia)
        if (viene(a, 'sesion_id')) c.sesion_id = await claseOpcional(a.sesion_id)
        if (!Object.keys(c).length) falla('no mandaste nada para cambiar')
        c.updated_at = new Date().toISOString()
        const r = (await escribir(sb.from('skills').update(c).eq('id', id).select(), 'la skill'))[0]
        return { actualizada: true, skill_id: r.id, titulo: r.title, prendida: r.visible !== false, quien_la_ve: await quienVe(r.audiencia) }
      },
    },

    eliminar_skill: {
      descripcion: 'Elimina una skill del catálogo. Para solo ocultarla, mejor actualizar_skill con visible=false. Primero sin confirmar; después con confirmar=true.',
      esquema: { type: 'object', properties: { skill_id: { type: 'string' }, confirmar: { type: 'boolean' } }, required: ['skill_id'] },
      async correr(a) {
        const id = texto(req(a.skill_id, 'skill_id'))
        const s = (await leer(sb.from('skills').select('id,title,area').eq('id', id).limit(1)))[0]
        if (!s) falla('no existe la skill ' + id)
        return borrar('skills', id, 'la skill', a.confirmar, { skill: s.title, area: s.area })
      },
    },

    // ═════════ Quizzes ═════════

    crear_quiz: {
      descripcion: 'Crea un quiz. Con sesion_id queda como el quiz de esa clase (una sesión tiene a lo sumo uno). Cada pregunta: {pregunta, opciones[], correcta} donde correcta es el número de la opción (0 = la primera) o su texto exacto. Nace sin publicar salvo publicado=true.',
      esquema: { type: 'object', properties: {
        titulo: { type: 'string' }, descripcion: { type: 'string' }, sesion_id: { type: 'string' },
        preguntas: { type: 'array', items: { type: 'object', properties: {
          pregunta: { type: 'string' }, opciones: { type: 'array', items: { type: 'string' } }, correcta: { description: 'Número (0 = la primera) o texto de la opción correcta' } },
          required: ['pregunta', 'opciones', 'correcta'] } },
        publicado: { type: 'boolean' }, aprobar: { type: 'integer', description: '% mínimo para aprobar (por defecto 70)' },
        intentos: { type: 'integer', description: 'Máximo por persona; 0 = sin límite' }, obligatorio: { type: 'boolean' }, audiencia: ESQ_AUDIENCIA,
      }, required: ['titulo', 'preguntas'] },
      async vista(a) {
        const ps = preguntasQuiz(a.preguntas)
        return { titulo: a.titulo, sesion_id: a.sesion_id || null, preguntas: ps.map((p) => p.text + ' → ' + p.options[p.correctIndex]),
          publicado: booleano(a.publicado), quien_lo_ve: await quienVe(await audiencia(a.audiencia)) }
      },
      async correr(a) {
        const preguntas = preguntasQuiz(a.preguntas)
        const s = a.sesion_id ? await sesion(a.sesion_id) : null
        const orden = (await leer(sb.from('quizzes').select('orden').order('orden', { ascending: false }).limit(1)))[0]
        const ahora = new Date().toISOString()
        const fila = { id: nuevoId('q'), titulo: texto(req(a.titulo, 'titulo'), 200), descripcion: texto(a.descripcion, 2000), activo: booleano(a.publicado),
          orden: ((orden && orden.orden) || 0) + 1, preguntas, audiencia: (await audiencia(a.audiencia)) || [], created_at: ahora, updated_at: ahora,
          ...(s ? { sesion_id: s.id } : {}),
          ...(viene(a, 'aprobar') ? { aprobar: entero(a.aprobar, 'aprobar', 0, 100) } : {}),
          ...(viene(a, 'intentos') ? { intentos: entero(a.intentos, 'intentos', 0, 50) } : {}),
          ...(viene(a, 'obligatorio') ? { obligatorio: booleano(a.obligatorio) } : {}) }
        const r = (await escribir(sb.from('quizzes').insert(fila).select(), 'el quiz'))[0]
        return { creado: true, quiz_id: r.id, titulo: r.titulo, preguntas: preguntas.length, publicado: r.activo, quien_lo_ve: await quienVe(r.audiencia) }
      },
    },

    actualizar_quiz: {
      descripcion: 'Cambia lo que se indique de un quiz: título, descripción, preguntas (reemplaza la lista entera), publicado, % para aprobar, intentos, obligatorio o quién lo ve.',
      esquema: { type: 'object', properties: {
        quiz_id: { type: 'string' }, titulo: { type: 'string' }, descripcion: { type: 'string' },
        preguntas: { type: 'array', items: { type: 'object' }, description: 'Lista COMPLETA nueva: [{pregunta, opciones[], correcta}]' },
        publicado: { type: 'boolean' }, aprobar: { type: 'integer' }, intentos: { type: 'integer' }, obligatorio: { type: 'boolean' }, audiencia: ESQ_AUDIENCIA,
      }, required: ['quiz_id'] },
      async correr(a) {
        const id = texto(req(a.quiz_id, 'quiz_id'))
        const c = {}
        if (viene(a, 'titulo')) c.titulo = texto(req(a.titulo, 'titulo'), 200)
        if (viene(a, 'descripcion')) c.descripcion = texto(a.descripcion, 2000)
        if (viene(a, 'preguntas')) c.preguntas = preguntasQuiz(a.preguntas)
        if (viene(a, 'publicado')) c.activo = booleano(a.publicado)
        if (viene(a, 'aprobar')) c.aprobar = entero(a.aprobar, 'aprobar', 0, 100)
        if (viene(a, 'intentos')) c.intentos = entero(a.intentos, 'intentos', 0, 50)
        if (viene(a, 'obligatorio')) c.obligatorio = booleano(a.obligatorio)
        if (viene(a, 'audiencia')) c.audiencia = await audiencia(a.audiencia)
        if (!Object.keys(c).length) falla('no mandaste nada para cambiar')
        c.updated_at = new Date().toISOString()
        const r = (await escribir(sb.from('quizzes').update(c).eq('id', id).select(), 'el quiz'))[0]
        return { actualizado: true, quiz_id: r.id, titulo: r.titulo, publicado: r.activo, preguntas: (r.preguntas || []).length }
      },
    },

    eliminar_quiz: {
      descripcion: 'Elimina un quiz y TODOS sus resultados. Para solo ocultarlo, mejor actualizar_quiz con publicado=false. Primero sin confirmar; después con confirmar=true.',
      esquema: { type: 'object', properties: { quiz_id: { type: 'string' }, confirmar: { type: 'boolean' } }, required: ['quiz_id'] },
      async correr(a) {
        const id = texto(req(a.quiz_id, 'quiz_id'))
        const q = (await leer(sb.from('quizzes').select('id,titulo,sesion_id').eq('id', id).limit(1)))[0]
        if (!q) falla('no existe el quiz ' + id)
        const res = await leer(sb.from('quiz_resultados').select('id').eq('quiz_id', id))
        return borrar('quizzes', id, 'el quiz', a.confirmar, { quiz: q.titulo, sesion_id: q.sesion_id, tambien_se_borra: { resultados: res.length } })
      },
    },

    // ═════════ Cursos a tu ritmo ═════════

    crear_curso: {
      descripcion: 'Crea un curso a tu ritmo. Nace oculto (visible=false) hasta que se prenda con actualizar_curso; después se le agregan cápsulas con crear_capsula.',
      esquema: { type: 'object', properties: {
        titulo: { type: 'string' }, descripcion: { type: 'string' }, area: { type: 'string' }, nivel: { type: 'string', enum: NIVELES },
        instructor: { type: 'string' }, portada_url: { type: 'string' }, audiencia: ESQ_AUDIENCIA,
      }, required: ['titulo'] },
      async correr(a) {
        if (a.nivel && !NIVELES.includes(a.nivel)) falla('nivel no válido')
        const ult = (await leer(sb.from('cursos').select('orden').order('orden', { ascending: false }).limit(1)))[0]
        const fila = { id: nuevoId('c'), orden: ((ult && ult.orden) || 0) + 1, titulo: texto(req(a.titulo, 'titulo'), 200), descripcion: texto(a.descripcion, 4000),
          area: texto(a.area, 80), nivel: a.nivel || 'Básico', instructor: texto(a.instructor, 120), portada_url: url(a.portada_url, 'portada_url'),
          visible: false, audiencia: (await audiencia(a.audiencia)) || [] }
        const r = (await escribir(sb.from('cursos').insert(fila).select(), 'el curso'))[0]
        return { creado: true, curso_id: r.id, titulo: r.titulo, visible: false }
      },
    },

    actualizar_curso: {
      descripcion: 'Cambia lo que se indique de un curso; visible=true lo publica. Lo que no se mande queda igual.',
      esquema: { type: 'object', properties: {
        curso_id: { type: 'string' }, titulo: { type: 'string' }, descripcion: { type: 'string' }, area: { type: 'string' }, nivel: { type: 'string', enum: NIVELES },
        instructor: { type: 'string' }, portada_url: { type: 'string' }, visible: { type: 'boolean' }, orden: { type: 'integer' }, audiencia: ESQ_AUDIENCIA,
      }, required: ['curso_id'] },
      async correr(a) {
        const id = texto(req(a.curso_id, 'curso_id'))
        const c = {}
        if (viene(a, 'titulo')) c.titulo = texto(req(a.titulo, 'titulo'), 200)
        if (viene(a, 'descripcion')) c.descripcion = texto(a.descripcion, 4000)
        if (viene(a, 'area')) c.area = texto(a.area, 80)
        if (viene(a, 'nivel')) { if (!NIVELES.includes(a.nivel)) falla('nivel no válido'); c.nivel = a.nivel }
        if (viene(a, 'instructor')) c.instructor = texto(a.instructor, 120)
        if (viene(a, 'portada_url')) c.portada_url = url(a.portada_url, 'portada_url')
        if (viene(a, 'visible')) c.visible = booleano(a.visible)
        if (viene(a, 'orden')) c.orden = entero(a.orden, 'orden', 0, 10000)
        if (viene(a, 'audiencia')) c.audiencia = await audiencia(a.audiencia)
        if (!Object.keys(c).length) falla('no mandaste nada para cambiar')
        c.updated_at = new Date().toISOString()
        const r = (await escribir(sb.from('cursos').update(c).eq('id', id).select(), 'el curso'))[0]
        return { actualizado: true, curso_id: r.id, titulo: r.titulo, visible: r.visible, quien_lo_ve: await quienVe(r.audiencia) }
      },
    },

    eliminar_curso: {
      descripcion: 'Elimina un curso con TODAS sus cápsulas, el avance y los comentarios. Para solo ocultarlo, mejor actualizar_curso con visible=false. Primero sin confirmar; después con confirmar=true.',
      esquema: { type: 'object', properties: { curso_id: { type: 'string' }, confirmar: { type: 'boolean' } }, required: ['curso_id'] },
      async correr(a) {
        const id = texto(req(a.curso_id, 'curso_id'))
        const c = (await leer(sb.from('cursos').select('id,titulo').eq('id', id).limit(1)))[0]
        if (!c) falla('no existe el curso ' + id)
        const caps = await leer(sb.from('cursos_capsulas').select('id').eq('curso_id', id))
        return borrar('cursos', id, 'el curso', a.confirmar, { curso: c.titulo, tambien_se_borra: { capsulas: caps.length } })
      },
    },

    crear_capsula: {
      descripcion: 'Agrega una cápsula (lección en video) al final de un curso. recursos: [{nombre, url}].',
      esquema: { type: 'object', properties: {
        curso_id: { type: 'string' }, titulo: { type: 'string' }, seccion: { type: 'string', description: 'Opcional: «Introducción», «Ejecución»…' },
        resumen: { type: 'string' }, video_url: { type: 'string', description: 'YouTube, Drive, Vimeo, Loom…' }, duracion: { type: 'string', description: '«04:28»' },
        recursos: { type: 'array', items: { type: 'object', properties: { nombre: { type: 'string' }, url: { type: 'string' } } } }, visible: { type: 'boolean' },
        sesion_id: { type: 'string', description: 'Opcional: la clase del reto. Los grupos presenciales ven la cápsula dentro de esa clase, en el lugar de la grabación.' },
      }, required: ['curso_id', 'titulo'] },
      async correr(a) {
        const curso = texto(req(a.curso_id, 'curso_id'))
        if (!(await leer(sb.from('cursos').select('id').eq('id', curso))).length) falla('no existe el curso ' + curso)
        const ult = (await leer(sb.from('cursos_capsulas').select('orden').eq('curso_id', curso).order('orden', { ascending: false }).limit(1)))[0]
        const fila = { id: nuevoId('k'), curso_id: curso, orden: ult ? (ult.orden || 0) + 1 : 0, titulo: texto(req(a.titulo, 'titulo'), 200),
          seccion: texto(a.seccion, 80), resumen: texto(a.resumen, 4000), video_url: url(a.video_url, 'video_url'), duracion: texto(a.duracion, 12),
          recursos: (Array.isArray(a.recursos) ? a.recursos : []).map((x) => ({ nombre: texto(x.nombre, 120) || 'Recurso', url: url(req(x.url, 'url del recurso'), 'url del recurso') })),
          visible: viene(a, 'visible') ? booleano(a.visible) : true }
        if (viene(a, 'sesion_id')) fila.sesion_id = await claseOpcional(a.sesion_id)
        const r = (await escribir(sb.from('cursos_capsulas').insert(fila).select(), 'la cápsula'))[0]
        return { creada: true, capsula_id: r.id, titulo: r.titulo, orden: r.orden }
      },
    },

    actualizar_capsula: {
      descripcion: 'Cambia lo que se indique de una cápsula. recursos reemplaza la lista entera. Lo que no se mande queda igual.',
      esquema: { type: 'object', properties: {
        capsula_id: { type: 'string' }, titulo: { type: 'string' }, seccion: { type: 'string' }, resumen: { type: 'string' }, video_url: { type: 'string' },
        duracion: { type: 'string' }, recursos: { type: 'array', items: { type: 'object' } }, visible: { type: 'boolean' }, orden: { type: 'integer' },
        sesion_id: { type: 'string', description: 'La clase del reto; "" la quita' },
      }, required: ['capsula_id'] },
      async correr(a) {
        const id = texto(req(a.capsula_id, 'capsula_id'))
        const c = {}
        if (viene(a, 'titulo')) c.titulo = texto(req(a.titulo, 'titulo'), 200)
        if (viene(a, 'seccion')) c.seccion = texto(a.seccion, 80)
        if (viene(a, 'resumen')) c.resumen = texto(a.resumen, 4000)
        if (viene(a, 'video_url')) c.video_url = url(a.video_url, 'video_url')
        if (viene(a, 'duracion')) c.duracion = texto(a.duracion, 12)
        if (viene(a, 'recursos')) c.recursos = (Array.isArray(a.recursos) ? a.recursos : []).map((x) => ({ nombre: texto(x.nombre, 120) || 'Recurso', url: url(req(x.url, 'url del recurso'), 'url del recurso') }))
        if (viene(a, 'visible')) c.visible = booleano(a.visible)
        if (viene(a, 'orden')) c.orden = entero(a.orden, 'orden', 0, 10000)
        if (viene(a, 'sesion_id')) c.sesion_id = await claseOpcional(a.sesion_id)
        if (!Object.keys(c).length) falla('no mandaste nada para cambiar')
        c.updated_at = new Date().toISOString()
        const r = (await escribir(sb.from('cursos_capsulas').update(c).eq('id', id).select(), 'la cápsula'))[0]
        return { actualizada: true, capsula_id: r.id, titulo: r.titulo, visible: r.visible }
      },
    },

    eliminar_capsula: {
      descripcion: 'Elimina una cápsula con su avance y comentarios. Primero sin confirmar; después con confirmar=true.',
      esquema: { type: 'object', properties: { capsula_id: { type: 'string' }, confirmar: { type: 'boolean' } }, required: ['capsula_id'] },
      async correr(a) {
        const id = texto(req(a.capsula_id, 'capsula_id'))
        const k = (await leer(sb.from('cursos_capsulas').select('id,titulo,curso_id').eq('id', id).limit(1)))[0]
        if (!k) falla('no existe la cápsula ' + id)
        return borrar('cursos_capsulas', id, 'la cápsula', a.confirmar, { capsula: k.titulo, curso_id: k.curso_id })
      },
    },

    // ═════════ Soporte ═════════

    abrir_ticket: {
      descripcion: 'Abre un ticket de soporte a nombre de una persona (tiene que estar en algún grupo); el mensaje va como del equipo PorContar.',
      esquema: { type: 'object', properties: {
        email: { type: 'string' }, asunto: { type: 'string' }, categoria: { type: 'string', description: 'Por defecto "Otro"' }, texto: { type: 'string' },
      }, required: ['email', 'asunto', 'texto'] },
      async correr(a) {
        const id = await rpc('soporte_abrir', { p_asunto: texto(req(a.asunto, 'asunto'), 160), p_categoria: texto(a.categoria, 60) || 'Otro',
          p_texto: texto(req(a.texto, 'texto')), p_email: texto(req(a.email, 'email')).toLowerCase() })
        if (!id) throw new Error('la base no abrió el ticket')
        return { abierto: true, ticket_id: id }
      },
    },

    responder_ticket: {
      descripcion: 'Responde un ticket de soporte como el equipo PorContar. La persona lo ve en su Soporte.',
      esquema: { type: 'object', properties: { ticket_id: { type: 'string' }, texto: { type: 'string' } }, required: ['ticket_id', 'texto'] },
      async vista(a) {
        const t = (await leer(sb.from('soporte_tickets').select('email,nombre,asunto,estado').eq('id', texto(a.ticket_id)).limit(1)))[0]
        if (!t) falla('no existe el ticket ' + a.ticket_id)
        return { ticket: t.asunto, para: (t.nombre || '') + ' <' + t.email + '>', respuesta: a.texto }
      },
      async correr(a) {
        const id = texto(req(a.ticket_id, 'ticket_id'))
        const antes = await leer(sb.from('soporte_mensajes').select('id').eq('ticket_id', id))
        await rpc('soporte_responder', { p_id: id, p_texto: texto(req(a.texto, 'texto')) })
        const despues = await leer(sb.from('soporte_mensajes').select('id').eq('ticket_id', id))
        if (despues.length <= antes.length) throw new Error('la base no guardó la respuesta')
        return { respondido: true, ticket_id: id }
      },
    },

    cambiar_estado_ticket: {
      descripcion: 'Cierra o reabre un ticket de soporte.',
      esquema: { type: 'object', properties: { ticket_id: { type: 'string' }, estado: { type: 'string', enum: ['abierto', 'cerrado'] } }, required: ['ticket_id', 'estado'] },
      async correr(a) {
        const id = texto(req(a.ticket_id, 'ticket_id'))
        await rpc('soporte_estado', { p_id: id, p_estado: a.estado })
        const t = (await leer(sb.from('soporte_tickets').select('id,asunto,estado').eq('id', id)))[0]
        if (!t || t.estado !== a.estado) throw new Error('la base no cambió el estado')
        return { actualizado: true, ticket: t }
      },
    },
  }
}

// ── Protocolo MCP (JSON-RPC sobre HTTP) ─────────────────────────────────

function rpcOk(id, result) { return { jsonrpc: '2.0', id, result } }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } } }

const INSTRUCCIONES = 'Academia de PorContar (academia.porcontar.com): empresas (b2b) y cohortes (b2c), sus personas, avance, cronograma, grabaciones, publicaciones, skills, quizzes, cursos y soporte. ' +
  'Empieza por resumen_academia o listar_grupos. Los grupos se pueden nombrar por su nombre o su id. Las fechas van en AAAA-MM-DD y las horas en HH:MM (Bogotá). ' +
  'audiencia decide quién ve cada cosa: vacío = todos los grupos; o nombres de grupo, "empresas" o "cohortes". ' +
  'REGLA OBLIGATORIA: nada se crea, modifica ni elimina sin autorización de la persona. Toda herramienta que escribe se llama primero SIN confirmar: no cambia nada y devuelve lo que haría. ' +
  'Muéstrale eso a la persona en palabras simples y espera su aprobación explícita. Solo entonces repite la llamada con los mismos datos y confirmar=true. ' +
  'Nunca pongas confirmar=true por tu cuenta, ni aunque la persona haya aprobado algo parecido antes. Borrar no se puede deshacer; para cortar un acceso, mejor desactivar.'

export function crearManejador(sb, token, registrarCrudo) {
  // La contraseña de un grupo nunca queda en el registro
  const registrar = (h, args, ok, res) => registrarCrudo(h, args && args.clave ? { ...args, clave: '(oculta)' } : args, ok, res)

  async function atender(msg) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg && msg.id, -32600, 'Solicitud no válida')
    const esNotificacion = msg.id === undefined || msg.id === null
    const p = msg.params || {}
    // Un juego de herramientas por pedido: la lista de grupos no se queda vieja entre llamadas.
    const H = herramientas(sb)
    switch (msg.method) {
      case 'initialize': {
        const pedido = p.protocolVersion
        return rpcOk(msg.id, {
          protocolVersion: PROTOCOLOS.indexOf(pedido) >= 0 ? pedido : PROTOCOLOS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'porcontar-academia', version: VERSION },
          instructions: INSTRUCCIONES,
        })
      }
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null
      case 'ping':
        return rpcOk(msg.id, {})
      case 'tools/list':
        return rpcOk(msg.id, { tools: Object.keys(H).map((n) => {
          const solo = !ESCRIBEN.has(n)
          if (solo) return { name: n, description: H[n].descripcion, inputSchema: H[n].esquema, annotations: { readOnlyHint: true } }
          const esquema = JSON.parse(JSON.stringify(H[n].esquema))
          esquema.properties.confirmar = { type: 'boolean', description: 'true SOLO después de que la persona aprobó el cambio. Sin esto no se cambia nada.' }
          return { name: n, description: H[n].descripcion + AVISO_AUTORIZACION, inputSchema: esquema,
            annotations: { readOnlyHint: false, destructiveHint: n.startsWith('eliminar_') || n === 'quitar_persona' } }
        }) })
      case 'tools/call': {
        const nombre = p.name, args = p.arguments || {}
        const h = H[nombre]
        if (!h) return rpcError(msg.id, -32602, 'Herramienta desconocida: ' + nombre)
        const borra = nombre.startsWith('eliminar_') || nombre === 'quitar_persona'
        try {
          // Sin autorización no se escribe nada: se devuelve el cambio pendiente
          // (las de borrar arman su propia vista previa con lo que arrastran).
          if (ESCRIBEN.has(nombre) && !borra && !autorizado(args.confirmar)) {
            const { confirmar: _c, ...cambio } = args
            const vista = h.vista ? await h.vista(cambio) : cambio
            const txt = JSON.stringify({
              ejecutado: false,
              pendiente_de_autorizacion: { herramienta: nombre, cambio: vista },
              siguiente_paso: 'Muéstrale este cambio a la persona. Solo si lo aprueba, vuelve a llamar ' + nombre + ' con los mismos datos y confirmar=true.',
            }, null, 2)
            await registrar(nombre, args, true, 'pendiente de autorización')
            return rpcOk(msg.id, { content: [{ type: 'text', text: txt }] })
          }
          const r = await h.correr(args)
          const txt = JSON.stringify(r, null, 2)
          await registrar(nombre, args, true, txt)
          return rpcOk(msg.id, { content: [{ type: 'text', text: txt }] })
        } catch (e) {
          const m = (e && e.message) || String(e)
          await registrar(nombre, args, false, m)
          // Error de la herramienta (no del protocolo): el agente lo lee y corrige.
          return rpcOk(msg.id, { content: [{ type: 'text', text: 'Error: ' + m }], isError: true })
        }
      }
      default:
        return esNotificacion ? null : rpcError(msg.id, -32601, 'Método no soportado: ' + msg.method)
    }
  }

  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type, mcp-session-id, mcp-protocol-version',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  }
  function iguales(a, b) {
    if (!a || !b || a.length !== b.length) return false
    let d = 0
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
    return d === 0
  }

  return async function (req) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (!token) return new Response('Falta configurar el secreto MCP_TOKEN', { status: 500, headers: CORS })
    const u = new URL(req.url)
    const auth = req.headers.get('authorization') || ''
    const dada = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : (u.searchParams.get('key') || '')
    if (!iguales(dada, token)) return new Response(JSON.stringify(rpcError(null, -32001, 'No autorizado')), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } })
    // Sin flujo de eventos (SSE): cada pedido recibe su respuesta JSON.
    if (req.method !== 'POST') return new Response('Método no permitido', { status: 405, headers: { ...CORS, Allow: 'POST' } })
    let cuerpo
    try { cuerpo = await req.json() } catch (_e) {
      return new Response(JSON.stringify(rpcError(null, -32700, 'JSON no válido')), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }
    const lote = Array.isArray(cuerpo)
    const respuestas = (await Promise.all((lote ? cuerpo : [cuerpo]).map(atender))).filter(Boolean)
    if (!respuestas.length) return new Response(null, { status: 202, headers: CORS })
    return new Response(JSON.stringify(lote ? respuestas : respuestas[0]), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  }
}

// ── Arranque en Supabase (Deno) ─────────────────────────────────────────
// Fuera de Deno (pruebas en Node) este bloque no corre y solo se exporta crearManejador.
const D = globalThis.Deno
if (D) {
  const { createClient } = await import('npm:@supabase/supabase-js@2')
  const URL_SB = D.env.get('SUPABASE_URL'), SERVICIO = D.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const base = createClient(URL_SB, SERVICIO, { auth: { persistSession: false } })
  // La llave de admin (la misma que acepta is_admin()) para llamar las funciones de admin de la base
  const { data: llave } = await base.from('app_config').select('value').eq('key', 'admin_key').limit(1)
  const sb = createClient(URL_SB, SERVICIO, { auth: { persistSession: false },
    global: { headers: { 'x-admin-key': (llave && llave[0] && llave[0].value) || '' } } })
  const registrar = async (herramienta, argumentos, ok, resultado) => {
    try { await base.from('mcp_acciones').insert({ herramienta, argumentos, ok, resultado: String(resultado).slice(0, 2000) }) } catch (_e) { /* el registro no tumba la respuesta */ }
  }
  // trim: al pegar el secreto en el panel suele colarse un salto de línea.
  D.serve(crearManejador(sb, (D.env.get('MCP_TOKEN') || '').trim(), registrar))
}
