/* ================================================================
   PorContar Academia — Asistencia por encuentro (supabase-asistencia.sql)

   · En la página de cada clase, en el espacio de una empresa (solo admin),
     el bloque «Asistencia» con un renglón por encuentro: la clase, o sus
     dos partes cuando va partida.
   · «Tomar asistencia»: se pega la lista (celdas del Excel de Meet,
     nombres o correos), la base la cruza con las personas del grupo
     (asistencia_cruzar, la misma que usa Claude) y se revisa con casillas.
     Con aparecer basta; cuentan estudiantes y responsables.
   · «Enviar a la empresa»: abre el correo ya escrito en el Gmail de quien
     lo toca (para el contacto y los responsables, copia a las otras admin).
     Esa persona lo revisa y le da Enviar: no sale nada solo.

   Comparte el estado y las utilidades de app.js y programa.js.
   ================================================================ */

let ASIS = { gid:null, filas:[], envios:[], cargando:false, falla:'', t:0 };
let AM = null;   // la ventana abierta: { gid, sesion, parte, titulo, miembros, marcados, sinCruzar, paso, fuente }

/** Los encuentros de una clase para la asistencia: parte 1 y, si va partida, parte 2. */
function encuentrosAsis(r){
  const e = encuentrosDe(r);
  return e.length ? e.map(x => ({ ...x, parte:Math.max(1, x.parte) })) : [{ parte:1, fecha:null }];
}

async function cargarAsistencia(gid){
  ASIS = { ...ASIS, gid, cargando:true, falla:'' };
  try {
    const d = await store.asistencia(gid);
    ASIS = { gid, filas:d.filas, envios:d.envios, cargando:false, falla:'', t:Date.now() };
  } catch (err){
    console.warn(err);
    ASIS = { gid, filas:[], envios:[], cargando:false, t:Date.now(),
             falla:/asistencia|envios|schema cache|does not exist/i.test(err.message || '')
               ? 'Falta correr supabase-asistencia.sql en Supabase.' : errorMsg(err) };
  }
  if (view.type === 'session') render();
}

const quienPor = por => por === 'Claude' ? 'Claude'
  : (typeof ADMINS !== 'undefined' && ADMINS.find?.(a => a.email === por)?.nombre?.split(' ')[0]) || String(por || '').split('@')[0];

/** El bloque de la clase. g = la empresa del espacio; r = su cronograma para esta clase. */
function asistenciaHtml(s, g, r){
  if (store.kind === 'local') return '';
  // Se vuelve a leer al cambiar de empresa o si lo que hay tiene más de 2 minutos
  if (!ASIS.cargando && (ASIS.gid !== g.id || Date.now() - ASIS.t > 12e4)) cargarAsistencia(g.id);
  const cab = `<div class="rec-cab"><span>Asistencia</span></div>`;
  if (ASIS.gid !== g.id || (ASIS.cargando && !ASIS.t)) return `${cab}<div class="as-bloque"><p class="as-nota">Cargando la asistencia…</p></div>`;
  if (ASIS.falla) return `${cab}<div class="as-bloque"><p class="as-nota">${escapeHtml(ASIS.falla)}</p></div>`;

  const encs = encuentrosAsis(r), partida = encs.length > 1;
  return `${cab}
    <div class="as-bloque">${encs.map(e => {
      const filas = ASIS.filas.filter(x => x.sesion_id === s.id && x.parte === e.parte);
      const si = filas.filter(x => x.presente).length;
      const env = ASIS.envios.find(x => x.sesion_id === s.id && x.parte === e.parte);
      const nombre = (partida ? `Parte ${e.parte}` : 'Encuentro') + ' · ' + (e.fecha ? diaCortoTxt(e.fecha) : 'sin fecha');
      const estado = !filas.length ? '<span class="as-sin">Sin tomar</span>'
        : `<b>${si} de ${filas.length}</b> ${si === 1 ? 'vino' : 'vinieron'}` + (env
          ? ` · <span class="as-ok">Correo preparado el ${escapeHtml(fechaCorta(String(env.creado_el).slice(0, 10)))} por ${escapeHtml(quienPor(env.por))}</span>`
          : ' · <span class="as-sin">Sin enviar a la empresa</span>');
      const acciones = !filas.length
        ? `<button class="btn btn-primary" data-as-tomar="${e.parte}">Tomar asistencia</button>`
        : `<button class="btn" data-as-tomar="${e.parte}">Ver o corregir</button>
           <button class="btn ${env ? '' : 'btn-primary'}" data-as-enviar="${e.parte}" title="Abre el correo ya escrito en tu Gmail: lo revisas y le das Enviar">
             <svg class="ico"><use href="#i-mail"/></svg> ${env ? 'Enviar de nuevo' : 'Enviar a la empresa'}</button>`;
      return `
      <div class="as-fila">
        <span class="as-nombre">${escapeHtml(nombre)}</span>
        <span class="as-estado">${estado}</span>
        <span class="as-acc">${acciones}</span>
      </div>`;
    }).join('')}</div>`;
}

/* ---------- La ventana «Tomar asistencia» ---------- */
function asisVentana(){
  if ($('#asOverlay')) return;
  document.body.insertAdjacentHTML('beforeend', `
  <div class="overlay" id="asOverlay" hidden>
    <div class="modal as-modal" role="dialog" aria-modal="true" aria-labelledby="asTit">
      <header class="modal-head">
        <h2 id="asTit">Asistencia</h2>
        <button class="icon-btn" data-as-cerrar aria-label="Cerrar"><svg class="ico"><use href="#i-close"/></svg></button>
      </header>
      <div class="modal-body" id="asCuerpo"></div>
      <footer class="modal-foot">
        <span class="modal-msg" id="asMsg"></span>
        <div id="asPie"></div>
      </footer>
    </div>
  </div>`);
  const ov = $('#asOverlay');
  ov.addEventListener('click', asisClic);
  ov.addEventListener('change', e => {
    const c = e.target.closest('[data-as-email]');
    if (c){ c.checked ? AM.marcados.add(c.dataset.asEmail) : AM.marcados.delete(c.dataset.asEmail); AM.fuente = AM.fuente || 'manual'; return asisResumen(); }
    const a = e.target.closest('[data-as-asignar]');
    if (a){
      const i = +a.dataset.asAsignar, antes = AM.sinCruzar[i].elegido;
      if (antes && antes !== a.value) AM.marcados.delete(antes);
      AM.sinCruzar[i].elegido = a.value;
      if (a.value) AM.marcados.add(a.value);
      asisPintar();
    }
  });
}

async function abrirAsistencia(parte){
  const g = grupoPorId(vistaComo), s = sessionOf(view.id); if (!g || !s) return;
  const r = cronoDe(g.id).get(s.id);
  const e = encuentrosAsis(r).find(x => x.parte === parte) || { parte, fecha:null };
  const partida = encuentrosAsis(r).length > 1;
  const filas = ASIS.filas.filter(x => x.sesion_id === s.id && x.parte === parte);
  AM = { gid:g.id, sesion:s.id, parte, miembros:[], marcados:new Set(filas.filter(x => x.presente).map(x => x.email)),
         sinCruzar:[], paso:filas.length ? 'revisar' : 'pegar', fuente:filas[0]?.fuente || '', guardando:false,
         titulo:`${s.short}${partida ? ' · parte ' + parte : ''} · ${e.fecha ? diaCortoTxt(e.fecha) : 'sin fecha'}` };
  asisVentana();
  $('#asTit').textContent = 'Asistencia · ' + AM.titulo;
  $('#asMsg').textContent = '';
  $('#asCuerpo').innerHTML = '<p class="as-nota">Cargando las personas del grupo…</p>';
  $('#asPie').innerHTML = '';
  $('#asOverlay').hidden = false;
  try {
    AM.miembros = (await store.miembros(g.id)).filter(m => m.activo);
  } catch (err){ $('#asCuerpo').innerHTML = `<p class="as-nota">${escapeHtml(errorMsg(err))}</p>`; return; }
  if (!AM.miembros.length){ $('#asCuerpo').innerHTML = '<p class="as-nota">Este grupo todavía no tiene personas activas. Agrégalas en Gestionar → Personas.</p>'; return; }
  asisPintar();
  if (AM.paso === 'pegar') enfocar('#asTexto');
}
const cerrarAsistencia = () => { if ($('#asOverlay')) $('#asOverlay').hidden = true; AM = null; };

const nombreDe = m => m.nombre || m.email;

function asisPintar(){
  if (!AM) return;
  if (AM.paso === 'pegar'){
    $('#asCuerpo').innerHTML = `
      <p class="as-ayuda">Copia del Excel de asistencia de Meet las filas de las personas (con nombre o correo) y pégalas aquí.
        También sirve una lista de nombres o de correos, uno por línea.</p>
      <textarea id="asTexto" rows="10" placeholder="Ana María Pérez&#10;jlopez@empresa.com&#10;…"></textarea>`;
    $('#asPie').innerHTML = `
      ${AM.marcados.size || AM.miembros.length ? `<button class="btn" data-as-amano>Marcar a mano</button>` : ''}
      <button class="btn" data-as-cerrar>Cancelar</button>
      <button class="btn btn-primary" data-as-cruzar>Cruzar con el grupo</button>`;
    return;
  }
  const libres = AM.miembros.filter(m => !AM.marcados.has(m.email));
  const opcion = (m, sel) => `<option value="${escapeHtml(m.email)}" ${sel ? 'selected' : ''}>${escapeHtml(nombreDe(m))}</option>`;
  $('#asCuerpo').innerHTML = `
    <p class="as-resumen" id="asResumen"></p>
    ${AM.sinCruzar.length ? `
    <div class="as-sincruzar">
      <h3>No se reconocieron (${AM.sinCruzar.length})</h3>
      <p class="as-ayuda">Elige quién es cada una o déjala en «Descartar».</p>
      ${AM.sinCruzar.map((x, i) => {
        const cand = x.opciones.length ? AM.miembros.filter(m => x.opciones.includes(m.email)) : [];
        const resto = libres.filter(m => !x.opciones.includes(m.email) && m.email !== x.elegido);
        const elegido = x.elegido ? AM.miembros.find(m => m.email === x.elegido) : null;
        return `
        <label class="as-linea">
          <span title="${escapeHtml(x.linea)}">${escapeHtml(x.linea)}</span>
          <select data-as-asignar="${i}">
            <option value="">Descartar</option>
            ${elegido && !x.opciones.includes(elegido.email) ? opcion(elegido, true) : ''}
            ${cand.length ? `<optgroup label="Puede ser">${cand.map(m => opcion(m, m.email === x.elegido)).join('')}</optgroup>` : ''}
            ${resto.length ? `<optgroup label="${cand.length ? 'Otra persona' : 'Personas que aún no están marcadas'}">${resto.map(m => opcion(m, false)).join('')}</optgroup>` : ''}
          </select>
        </label>`;
      }).join('')}
    </div>` : ''}
    <div class="as-personas">${AM.miembros.map(m => `
      <label class="as-persona">
        <input type="checkbox" data-as-email="${escapeHtml(m.email)}" ${AM.marcados.has(m.email) ? 'checked' : ''} />
        <span><b>${escapeHtml(nombreDe(m))}</b>${m.rol === 'responsable' ? ' <em class="as-rol">Responsable</em>' : ''}
          ${m.nombre ? `<em>${escapeHtml(m.email)}</em>` : ''}</span>
      </label>`).join('')}</div>`;
  $('#asPie').innerHTML = `
    <button class="btn" data-as-pegar>Pegar otra lista</button>
    <button class="btn" data-as-cerrar>Cancelar</button>
    <button class="btn btn-primary" data-as-guardar ${AM.guardando ? 'disabled' : ''}>Guardar asistencia</button>`;
  asisResumen();
}

function asisResumen(){
  const n = AM.miembros.filter(m => AM.marcados.has(m.email)).length, no = AM.miembros.length - n;
  const el = $('#asResumen');
  if (el) el.innerHTML = `<b>${n}</b> ${n === 1 ? 'se encuentra' : 'se encuentran'} · <b>${no}</b> no`;
}

async function asisClic(e){
  const t = sel => e.target.closest(sel);
  if (e.target.id === 'asOverlay' || t('[data-as-cerrar]')) return cerrarAsistencia();
  if (!AM) return;
  if (t('[data-as-amano]')){ AM.paso = 'revisar'; AM.fuente = AM.fuente || 'manual'; return asisPintar(); }
  if (t('[data-as-pegar]')){ AM.paso = 'pegar'; asisPintar(); return enfocar('#asTexto'); }
  if (t('[data-as-cruzar]')){
    const texto = $('#asTexto').value.trim();
    if (!texto) return ($('#asMsg').textContent = 'Pega primero la lista.');
    $('#asMsg').textContent = 'Cruzando…';
    try {
      const r = await store.asistenciaCruzar(AM.gid, texto);
      (r.encontrados || []).forEach(x => AM.marcados.add(x.email));
      // Las que no cruzaron se suman a las que ya estaban por revisar
      AM.sinCruzar = AM.sinCruzar.concat((r.sin_cruzar || []).map(x => ({ linea:x.linea, opciones:x.opciones || [], elegido:'' })));
      AM.fuente = 'lista'; AM.paso = 'revisar';
      $('#asMsg').textContent = '';
      asisPintar();
    } catch (err){ $('#asMsg').textContent = errorMsg(err); }
    return;
  }
  if (t('[data-as-guardar]')){
    if (AM.guardando) return;
    AM.guardando = true; $('#asMsg').textContent = 'Guardando…';
    const { gid, sesion, parte } = AM;
    try {
      const r = await store.asistenciaGuardar(gid, sesion, parte, [...AM.marcados], AM.fuente === 'lista' ? 'lista' : 'manual');
      cerrarAsistencia();
      toast(`Asistencia guardada: ${r.presentes} de ${r.total}`);
      await cargarAsistencia(gid);
    } catch (err){ AM.guardando = false; $('#asMsg').textContent = errorMsg(err); }
  }
}

/* ---------- «Enviar a la empresa»: el correo ya escrito, en Gmail ---------- */
/** Gmail con un correo nuevo ya escrito (se abre en la cuenta de Gmail que esté abierta). */
const gmailUrl = ({ to = '', cc, bcc, su, body }) =>
  'https://mail.google.com/mail/?' + new URLSearchParams({ view:'cm', fs:'1', to, ...(cc ? { cc } : {}), ...(bcc ? { bcc } : {}), su, body }).toString();

async function enviarAsistencia(parte){
  const g = grupoPorId(vistaComo), s = sessionOf(view.id); if (!g || !s) return;
  // La pestaña se abre ya, con el clic: si se abre después de esperar a la base, el navegador la bloquea
  const w = window.open('about:blank', '_blank');
  try {
    const c = await store.asistenciaCorreo(g.id, s.id, parte);
    if (!c.para?.length){
      w?.close();
      return toast('La empresa no tiene contacto en su ficha ni responsables: agrégalos en Gestionar.');
    }
    let url = gmailUrl({ to:c.para.join(','), cc:(c.cc || []).join(','), su:c.asunto, body:c.cuerpo });
    // Un grupo muy grande no cabe en el enlace: el texto va copiado y se pega con Ctrl+V
    if (url.length > 7000){
      await navigator.clipboard.writeText(c.cuerpo).catch(() => {});
      url = gmailUrl({ to:c.para.join(','), cc:(c.cc || []).join(','), su:c.asunto,
                       body:'(Pega aquí la asistencia con Ctrl+V: el texto ya quedó copiado.)' });
      toast('El texto de la asistencia quedó copiado: pégalo en el correo con Ctrl+V');
    } else toast('Se abrió el correo en tu Gmail: revísalo y dale Enviar');
    if (w) w.location.href = url; else window.open(url, '_blank', 'noopener');
    await store.registrarEnvio({ tipo:'asistencia', grupo_id:g.id, sesion_id:s.id, parte, para:c.para, asunto:c.asunto });
    await cargarAsistencia(g.id);
  } catch (err){
    w?.close();
    toast(errorMsg(err));
  }
}

$('#posts').addEventListener('click', e => {
  if (view.type !== 'session' || !IS_ADMIN) return;
  const tomar = e.target.closest('[data-as-tomar]');
  if (tomar) return abrirAsistencia(+tomar.dataset.asTomar);
  const env = e.target.closest('[data-as-enviar]');
  if (env) return enviarAsistencia(+env.dataset.asEnviar);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && AM) cerrarAsistencia(); });
