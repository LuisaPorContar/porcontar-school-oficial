// @ts-nocheck — JavaScript plano dentro de un .ts, como mcp-academia.
// ============================================================
// Avisos de la Comunidad: cuando una persona publica o comenta, la base
// (trigger comunidad_avisar, supabase-avisos.sql) llama a esta función y
// esta les manda un correo a las admin activas desde el buzón de Hostinger.
//
// PUBLICAR (panel de Supabase, una vez):
//   1. Correr supabase-avisos.sql en SQL Editor.
//   2. Edge Functions → Secrets → SMTP_PASS = la contraseña del buzón
//      hola@comercial.porcontar.com (SMTP_USER es opcional: otro buzón).
//   3. Deploy a new function → «Via Editor», nombre avisos-comunidad,
//      pegar este archivo y desplegar.
//   4. En Details: APAGAR «Verify JWT» (la función revisa su propia clave,
//      la que la base guarda en app_config.avisos_clave).
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const SITIO = 'https://academia.porcontar.com/admin'
const USUARIO = (Deno.env.get('SMTP_USER') || 'hola@comercial.porcontar.com').trim()
const CLAVE = (Deno.env.get('SMTP_PASS') || '').trim()
const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const corto = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t }
const respuesta = (txt, status = 200) => new Response(txt, { status })

async function una(tabla, id) {
  const { data, error } = await sb.from(tabla).select('*').eq('id', id).limit(1)
  if (error) throw new Error(error.message)
  return data && data[0]
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respuesta('Método no permitido', 405)
  const { data: k } = await sb.from('app_config').select('value').eq('key', 'avisos_clave').limit(1)
  const clave = k && k[0] && k[0].value
  if (!clave || req.headers.get('x-aviso') !== clave) return respuesta('No autorizado', 401)
  if (!CLAVE) return respuesta('Falta configurar el secreto SMTP_PASS', 500)

  try {
    const { tabla, id } = await req.json()
    let quien, grupo, accion, titulo, texto
    if (tabla === 'comunidad_posts') {
      const p = await una('comunidad_posts', id)
      if (!p) return respuesta('No existe', 404)
      quien = p.autor_nombre; grupo = p.autor_grupo
      accion = 'publicó en la Comunidad'
      titulo = p.titulo; texto = p.texto
    } else if (tabla === 'comunidad_comentarios') {
      const c = await una('comunidad_comentarios', id)
      if (!c) return respuesta('No existe', 404)
      const p = await una('comunidad_posts', c.post_id)
      quien = c.autor_nombre; grupo = c.autor_grupo
      accion = 'comentó en «' + corto(p ? (p.titulo || p.texto) : 'una publicación', 70) + '»'
      titulo = ''; texto = c.texto
    } else return respuesta('Tabla no válida', 400)

    const { data: admins, error } = await sb.from('admins').select('email').eq('activo', true)
    if (error) throw new Error(error.message)
    const para = (admins || []).map((a) => a.email).filter(Boolean)
    if (!para.length) return respuesta('Sin admin activas a quién avisar')

    const asunto = 'Comunidad · ' + quien + (grupo ? ' (' + grupo + ')' : '') + ' ' + accion
    const plano = asunto + '\n\n' + (titulo ? titulo + '\n\n' : '') + texto + '\n\nÁbrelo en ' + SITIO
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1a1f36">
      <p style="font-size:15px;margin:0 0 14px"><b>${esc(quien)}</b>${grupo ? ' <span style="color:#5b6275">(' + esc(grupo) + ')</span>' : ''} ${esc(accion)}</p>
      <div style="border-left:4px solid #2B4FE8;background:#f4f6ff;padding:12px 16px;border-radius:8px;font-size:14px;line-height:1.5">
        ${titulo ? '<p style="margin:0 0 8px;font-weight:bold">' + esc(titulo) + '</p>' : ''}
        <p style="margin:0;white-space:pre-wrap">${esc(corto(texto, 1500))}</p>
      </div>
      <p style="margin:20px 0"><a href="${SITIO}" style="background:#2B4FE8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-weight:bold;font-size:14px">Abrir la Comunidad</a></p>
      <p style="font-size:12px;color:#8a90a2">Aviso automático de la Academia PorContar.</p></div>`

    const cliente = new SMTPClient({ connection: { hostname: 'smtp.hostinger.com', port: 465, tls: true, auth: { username: USUARIO, password: CLAVE } } })
    await cliente.send({ from: 'Academia PorContar <' + USUARIO + '>', to: para, subject: asunto, content: plano, html })
    await cliente.close()
    return respuesta('Enviado a ' + para.length)
  } catch (e) {
    console.error(e)
    return respuesta('No se pudo enviar: ' + ((e && e.message) || e), 500)
  }
})
