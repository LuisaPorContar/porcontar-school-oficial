// @ts-nocheck — JavaScript plano dentro de un .ts, como mcp-academia.
// ============================================================
// Avisos de la Comunidad: cuando una persona (no el equipo) publica o
// comenta, la base (trigger comunidad_avisar, supabase-avisos.sql) llama a
// esta función, que les avisa a las admin activas por dos vías:
//
//   1. Al celular o al PC (Web Push): a cada dispositivo donde la admin
//      activó los avisos desde la campana (tabla push_suscripciones,
//      supabase-notificaciones.sql). Necesita los secretos VAPID_PUBLICA y
//      VAPID_PRIVADA.
//   2. Por correo: desde el Gmail que se configure (SMTP_USER + SMTP_PASS,
//      la contraseña de aplicación de Google). NUNCA desde
//      hola@comercial.porcontar.com: ese buzón es solo para envíos en frío.
//
// Cada vía funciona sola: si falta su secreto, esa vía se salta.
//
// Cuidados:
//   · Solo entra la base: el encabezado x-aviso debe traer la clave de
//     app_config.avisos_clave (se compara en tiempo constante).
//   · El correo tiene 10 segundos para salir; si no, se da por fallido (el
//     push sale igual).
//   · Freno de ráfaga del CORREO: máximo un correo por publicación cada
//     5 minutos (la publicación y sus comentarios cuentan juntos). El push
//     no se frena. La cuenta vive en la memoria del worker: mejor esfuerzo.
//
// PUBLICAR (panel de Supabase):
//   1. Edge Functions → Secrets:
//        VAPID_PUBLICA = la llave pública (la misma de config.js)
//        VAPID_PRIVADA = la llave privada
//        SMTP_USER     = el Gmail que envía (p. ej. info.porcontar@gmail.com)
//        SMTP_PASS     = su contraseña de aplicación de Google (16 letras)
//   2. Edge Functions → avisos-comunidad → Code → pegar este archivo → Deploy.
//   3. En Details: «Verify JWT» APAGADO (la función revisa su propia clave,
//      la que la base guarda en app_config.avisos_clave).
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2.58.0'
import webpush from 'npm:web-push@3.6.7'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const SITIO = 'https://academia.porcontar.com'
const env = (k) => (Deno.env.get(k) || '').trim()
const SMTP_USER = env('SMTP_USER'), SMTP_PASS = env('SMTP_PASS').replace(/\s+/g, ''), SMTP_HOST = env('SMTP_HOST') || 'smtp.gmail.com'
const VAPID_PUBLICA = env('VAPID_PUBLICA'), VAPID_PRIVADA = env('VAPID_PRIVADA')
// El buzón de envíos en frío no se usa para la Academia, aunque quede configurado
const CORREO_OK = !!(SMTP_USER && SMTP_PASS) && !/comercial\.porcontar\.com$/i.test(SMTP_USER)
const PUSH_OK = !!(VAPID_PUBLICA && VAPID_PRIVADA)
if (PUSH_OK) webpush.setVapidDetails(SITIO, VAPID_PUBLICA, VAPID_PRIVADA)

const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const corto = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t }
const respuesta = (txt, status = 200) => new Response(txt, { status })
/** Sin saltos de línea: lo que va al asunto del correo no puede colar encabezados. */
const unaLinea = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim()
/** Comparación en tiempo constante (no delata por el tiempo cuánto coincidió). */
function iguales(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
/** Espera a p como mucho ms milisegundos; si no llega, falla con ese mensaje. */
function conLimite(p, ms, mensaje) {
  let reloj
  return Promise.race([
    p,
    new Promise((_si, no) => { reloj = setTimeout(() => no(new Error(mensaje)), ms) }),
  ]).finally(() => clearTimeout(reloj))
}

// Freno de ráfaga del correo: un correo por publicación cada 5 minutos.
// MEJOR ESFUERZO: es un Map en la memoria de este worker. Se pierde cuando el
// worker se reinicia y no se comparte entre workers, así que en una ráfaga
// puede colarse algún correo de más; nunca frena el push.
const FRENO_CORREO_MS = 5 * 60 * 1000
const correoReciente = new Map()   // post id → cuándo salió (o empezó a salir) el último correo
function correoFrenado(postId, ahora) {
  for (const [k, t] of correoReciente) if (ahora - t >= FRENO_CORREO_MS) correoReciente.delete(k)   // limpieza
  return correoReciente.has(postId)
}
const TIPO = { duda: 'una duda', logro: 'un logro', prompt: 'un prompt' }

async function una(tabla, id) {
  const { data, error } = await sb.from(tabla).select('*').eq('id', id).limit(1)
  if (error) throw new Error(error.message)
  return data && data[0]
}

/** Avisa a cada dispositivo; los que ya no existen (el navegador los borró) se quitan de la lista */
async function avisarDispositivos(emails, aviso) {
  if (!PUSH_OK) return 'push sin configurar'
  const { data: subs, error } = await sb.from('push_suscripciones').select('endpoint, p256dh, auth, email').in('email', emails)
  if (error) return 'push: ' + error.message
  let ok = 0, fuera = 0
  await Promise.all((subs || []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(aviso), { TTL: 86400, urgency: 'high' })
      ok++
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) { fuera++; await sb.from('push_suscripciones').delete().eq('endpoint', s.endpoint) }
      else console.error('push', e && (e.statusCode || e.message), e && e.body)
    }
  }))
  return `push a ${ok} de ${(subs || []).length} dispositivos` + (fuera ? ` (${fuera} quitados)` : '')
}

async function avisarCorreo(para, asunto, quien, grupo, accion, titulo, texto, enlace) {
  if (!CORREO_OK) return 'correo sin configurar'
  const plano = asunto + '\n\n' + (titulo ? titulo + '\n\n' : '') + texto + '\n\nÁbrelo en ' + enlace
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1a1f36">
    <p style="font-size:15px;margin:0 0 14px"><b>${esc(quien)}</b>${grupo ? ' <span style="color:#5b6275">(' + esc(grupo) + ')</span>' : ''} ${esc(accion)}</p>
    <div style="border-left:4px solid #2B4FE8;background:#f4f6ff;padding:12px 16px;border-radius:8px;font-size:14px;line-height:1.5">
      ${titulo ? '<p style="margin:0 0 8px;font-weight:bold">' + esc(titulo) + '</p>' : ''}
      <p style="margin:0;white-space:pre-wrap">${esc(corto(texto, 1500))}</p>
    </div>
    <p style="margin:20px 0"><a href="${enlace}" style="background:#2B4FE8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:bold;font-size:14px">Abrir la publicación</a></p>
    <p style="font-size:12px;color:#8a90a2">Aviso automático de la Academia PorContar.</p></div>`
  const cliente = new SMTPClient({ connection: { hostname: SMTP_HOST, port: 465, tls: true, auth: { username: SMTP_USER, password: SMTP_PASS } } })
  try {
    await conLimite(cliente.send({ from: 'Academia PorContar <' + SMTP_USER + '>', to: para, subject: asunto, content: plano, html }),
      10000, 'el correo no salió en 10 segundos')
    return 'correo a ' + para.length
  } finally {
    // Cerrar siempre, sin que un fallo (o un cuelgue) al cerrar tape el resultado del envío
    try { await conLimite(Promise.resolve().then(() => cliente.close()), 3000, 'el cierre tardó más de 3 segundos') }
    catch (e) { console.error('smtp close', (e && e.message) || e) }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respuesta('Método no permitido', 405)
  const { data: k } = await sb.from('app_config').select('value').eq('key', 'avisos_clave').limit(1)
  const clave = k && k[0] && k[0].value
  if (!iguales(req.headers.get('x-aviso') || '', clave || '')) return respuesta('No autorizado', 401)
  if (!PUSH_OK && !CORREO_OK) return respuesta('Sin configurar: faltan VAPID_PUBLICA/VAPID_PRIVADA o SMTP_USER/SMTP_PASS', 500)

  try {
    const { tabla, id } = await req.json()
    let quien, grupo, accion, titulo, texto, post
    if (tabla === 'comunidad_posts') {
      post = await una('comunidad_posts', id)
      if (!post) return respuesta('No existe', 404)
      quien = post.autor_nombre; grupo = post.autor_grupo
      accion = 'publicó ' + (TIPO[post.tipo] || 'en la Comunidad')
      titulo = post.titulo; texto = post.texto
    } else if (tabla === 'comunidad_comentarios') {
      const c = await una('comunidad_comentarios', id)
      if (!c) return respuesta('No existe', 404)
      post = await una('comunidad_posts', c.post_id)
      quien = c.autor_nombre; grupo = c.autor_grupo
      accion = 'comentó ' + (post && post.es_admin ? 'tu publicación' : 'en') + ' «' + corto(post ? (post.titulo || post.texto) : 'una publicación', 70) + '»'
      titulo = ''; texto = c.texto
    } else return respuesta('Tabla no válida', 400)

    const { data: admins, error } = await sb.from('admins').select('email').eq('activo', true)
    if (error) throw new Error(error.message)
    const para = (admins || []).map((a) => a.email).filter(Boolean)
    if (!para.length) return respuesta('Sin admin activas a quién avisar')

    // Nombre, grupo y acción los escribió una persona: sin saltos de línea antes de armar el asunto
    quien = unaLinea(quien); grupo = unaLinea(grupo); accion = unaLinea(accion)
    const enlace = SITIO + '/admin?post=' + encodeURIComponent(post ? post.id : '') + (post && post.grupo_id ? '&g=' + encodeURIComponent(post.grupo_id) : '')
    const asunto = 'Comunidad · ' + quien + (grupo ? ' (' + grupo + ')' : '') + ' ' + accion

    // Freno de ráfaga (solo del correo): se anota ANTES de enviar para que dos avisos
    // simultáneos de la misma publicación no manden dos correos; si el envío falla, se desanota.
    const clavePost = String(post ? post.id : id)
    const frenado = CORREO_OK && correoFrenado(clavePost, Date.now())
    if (CORREO_OK && !frenado) correoReciente.set(clavePost, Date.now())

    // Las dos vías a la vez; si una falla, la otra igual sale
    const [r1, r2] = await Promise.allSettled([
      avisarDispositivos(para, {
        titulo: quien + (grupo ? ' · ' + grupo : ''),
        cuerpo: accion.charAt(0).toUpperCase() + accion.slice(1) + ': ' + corto(titulo || texto, 140),
        url: enlace, tag: 'post-' + (post ? post.id : id),
      }),
      frenado ? 'correo omitido (ya salió uno por esta publicación en los últimos 5 minutos)'
        : avisarCorreo(para, asunto, quien, grupo, accion, titulo, texto, enlace).catch((e) => { correoReciente.delete(clavePost); throw e }),
    ])
    const txt = [r1, r2].map((r) => r.status === 'fulfilled' ? r.value : 'falló: ' + ((r.reason && r.reason.message) || r.reason)).join(' · ')
    console.log(txt)
    return respuesta(txt, [r1, r2].every((r) => r.status === 'rejected') ? 500 : 200)
  } catch (e) {
    console.error(e)
    return respuesta('No se pudo avisar: ' + ((e && e.message) || e), 500)
  }
})
