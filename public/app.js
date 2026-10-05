/* ================================================================
   PorContar Academia — Muro de sesiones

   Almacenamiento: Supabase (tabla posts + bucket videos) cuando hay
   clave en config.js; si no, modo local con IndexedDB en el navegador.
   ================================================================ */

const CFG = window.MURO_CONFIG || {};

/* Las clases del reto. Se administran desde la app (tabla reto_sesiones);
   esta lista es solo el arranque y el respaldo del modo local. */
const SESIONES_BASE = [
  { id:'pre', icon:'s-pre',  short:'Antes de empezar', name:'Preconfiguración', desc:'', tipo:'clase' },
  { id:'s0',  icon:'s-0',    short:'Clase 00', name:'Kickoff', desc:'', tipo:'kickoff' },
  { id:'s1',  icon:'s-base', short:'Clase 1',  name:'Claude socio estratégico', desc:'', tipo:'clase' },
  { id:'s2',  icon:'s-2',    short:'Clase 2',  name:'Claude y la construcción de datos', desc:'', tipo:'clase' },
  { id:'s3',  icon:'s-3',    short:'Clase 3',  name:'Automatización de procesos', desc:'', tipo:'clase' },
  { id:'s4',  icon:'s-4',    short:'Clase 4',  name:'Claude Code', desc:'', tipo:'clase' },
  { id:'s5',  icon:'s-5',    short:'Clase 5',  name:'Presentación de proyectos', desc:'', tipo:'proyecto' },
].map(s => ({ ...s, title: `${s.short}. ${s.name}` }));
let SESSIONS = SESIONES_BASE.slice();

/** Fila de reto_sesiones → sesión que entiende la app. */
const deSesion = r => ({
  id:r.id, orden:r.orden || 0, short:r.corto, name:r.nombre, desc:r.descripcion || '',
  icon:r.icono || 's-1', tipo:r.tipo || 'clase', title:`${r.corto}. ${r.nombre}`,
  visible:r.visible !== false,   // sin la columna (antes del SQL) todas se ven
});
const TIPOS_SESION = { kickoff:'Kick off', clase:'Clase', proyecto:'Proyecto', cierre:'Cierre' };
const ICONOS_SESION = ['s-0','s-base','s-funnel','s-design','s-web','s-video','s-viral','s-1','s-agent',
                       's-crm','s-prospec','s-dash','s-ads','s-ecom','s-pre','s-2','s-3','s-4','s-5'];

const REACTIONS = [
  { id:'like',  label:'Me gusta', path:'M7 21V10l5-7a2 2 0 0 1 3 2l-1 5h4.5a2 2 0 0 1 2 2.4l-1.5 7A2 2 0 0 1 17 21H7Zm0 0H3V10h4' },
  { id:'clap',  label:'Aplauso',  path:'M9 12 6.5 8.2a1.4 1.4 0 0 1 2.3-1.6l3 4M12 10.5 9.8 6.3a1.4 1.4 0 0 1 2.5-1.3L15 10M15 10.7l-1.2-3a1.4 1.4 0 0 1 2.6-1l2.1 5.4c1.2 3.1-.2 6.3-3.2 7.5s-6.2-.1-7.4-3.2L6.4 13a1.4 1.4 0 0 1 2.4-1.4' },
  { id:'idea',  label:'Idea',     path:'M9.5 18h5M10 21h4M12 3a6 6 0 0 1 3.6 10.8c-.6.5-.9 1.1-.9 1.7H9.3c0-.6-.3-1.2-.9-1.7A6 6 0 0 1 12 3Z' },
  { id:'fire',  label:'Top',      path:'M12 3s5 4 5 8a5 5 0 0 1-10 0c0-1.4.6-2.6 1.3-3.6C9 9.4 10 10 10 11c1-1.4 2-4.6 2-8Z' },
];
const REACTION_IDS = REACTIONS.map(r => r.id);

const ME = { name:'PorContar', initials:'PC' };

/* Quién mira (lo resuelve sesion.js y lo confirma la base):
   · admin: entra por /admin (la clave se pide una vez por equipo); publica, edita, borra
     y administra empresas y cohortes. La base valida la clave (is_admin()).
   · estudiante: entra con su correo y la contraseña de su empresa o cohorte.
     Solo recibe lo que va dirigido a sus grupos.
   · responsable: un estudiante que además ve el panel de su equipo.      */
const ADMIN_KEY = window.ACADEMIA ? ACADEMIA.adminKey() : '';
let IS_ADMIN = false;   // se confirma contra la base en el arranque
let PERFIL = null;      // estudiante: { email, nombre, grupos:[{id, nombre, tipo, rol, vence_el}] }
let GRUPOS = [];        // admin: todas las empresas y cohortes
let gruposFalla = '';   // por qué no cargaron (p. ej. falta correr supabase-empresas.sql)
/* Admin: espacio de trabajo. '' = Principal (el contenido para todos);
   el id de una empresa = lo que ve esa empresa, y lo nuevo queda solo para ella. */
const ESPACIO_KEY = 'academia-espacio';
let vistaComo = (() => { try { return localStorage.getItem(ESPACIO_KEY) || ''; } catch { return ''; } })();
let vistos = new Set(); // estudiante: publicaciones con video que marcó como vistas

/* Fase 1 (supabase-fase1.sql): la lógica vive en programa.js */
let fase1 = false;       // ¿la base ya tiene reto, cronograma y grabaciones?
let CRONO = [];          // cronograma: estudiante, el de sus grupos; admin, el de todos
let GRABS = [];          // grabaciones: estudiante, las de sus grupos; admin, todas
let progresoVideo = {};  // estudiante: { idGrabacion: { segundos, duracion, completado, vistas } }

/** Grupos donde la persona es responsable: los que puede ver en el panel. */
const gruposResponsable = () => (PERFIL?.grupos || []).filter(g => g.rol === 'responsable');

const MAX_VIDEO_MB = 300;
const MAX_IMAGE_MB = 10;
const MAX_PDF_MB   = 25;
const RE_IMAGEN = /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i;
const RE_PDF    = /\.pdf(\?|$)/i;

/** El adjunto puede ser video, imagen o PDF; el nombre del archivo dice cual es. */
const esImagen = p => RE_IMAGEN.test(p.videoName || '') || RE_IMAGEN.test(p.videoUrl || '');
const esPdf    = p => RE_PDF.test(p.videoName || '')    || RE_PDF.test(p.videoUrl || '');

/** El PDF se lee dentro de la publicación y se puede abrir aparte o descargar. */
function pdfHtml(url, nombre){
  const n = escapeHtml(nombre || 'Documento.pdf'), u = escapeHtml(url);
  return `<div class="post-media es-pdf">
    <iframe src="${u}#view=FitH" title="${n}" loading="lazy"></iframe>
    <div class="pdf-bar">
      <svg class="ico"><use href="#i-resumen"/></svg><span>${n}</span>
      <a class="btn" href="${u}" target="_blank" rel="noopener">Abrir</a>
      <a class="btn btn-primary" href="${u}" download="${n}"><svg class="ico"><use href="#i-download"/></svg> Descargar</a>
    </div></div>`;
}

/* Áreas del catálogo de skills. Para añadir o quitar un departamento,
   edita solo esta lista: el sidebar y el editor se arman a partir de ella.
   Si cambias el nombre de un área, las skills ya guardadas conservan el
   nombre viejo hasta que las edites.                                    */
const AREAS = [
  'Marketing',
  'Ventas',
  'Estrategia',
  'Data',
  'Finanzas',
  'Recursos Humanos',
  'Operaciones',
  'Calidad',
  'Tecnología',
  'Servicio al cliente',
];
/** Las áreas del catálogo: las de la lista más las que traigan los prompts (p. ej. los importados). */
const areasCatalogo = () => {
  const extra = [...new Set(skills.map(s => s.area).filter(a => a && !AREAS.includes(a)))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  return [...AREAS, ...extra];
};
const NIVELES = ['Básico', 'Intermedio', 'Avanzado'];

/* ================================================================
   Preferencias de quien mira (guardados y qué reaccioné).
   Son personales, así que viven en este navegador y no en la base.
   ================================================================ */


/* Documento que se muestra en el módulo "Vocabulario y skills".
   El parámetro evita que el navegador muestre una versión vieja en caché. */
const GUIA_URL = 'resumen.html?v=' + Date.now();

/* Guía de qué dejar activo en la organización de Claude. */
const CONFIG_URL = 'configuracion.html?v=' + Date.now();

/* Trabajo autónomo: las tareas de cada sesión, con el avance de cada persona. */
const TAREAS_URL = 'trabajo-autonomo.html?v=' + Date.now();

/* Las preguntas frecuentes se guardan como publicaciones con esta sesión,
   así usan la misma base y el mismo composer que el resto del muro. */
const FAQ_ID = 'faq';
const FAQ = { id:FAQ_ID, title:'Preguntas frecuentes', short:'Preguntas frecuentes',
              icon:'i-faq',
              desc:'Las dudas que se repiten, respondidas en texto o en video.' };

/* Tutoriales express: pasos cortos, en video o en texto, para resolver algo
   puntual. Se guardan igual que las preguntas frecuentes —publicaciones con
   su propia sesión— así reusan el mismo composer, la misma base y el mismo
   bucket de videos, sin tocar Supabase. */
const TUTO_ID = 'tuto';
const TUTO = { id:TUTO_ID, title:'Tutoriales express', short:'Tutorial express',
               icon:'i-tuto',
               desc:'Videos cortos y pasos concretos para resolver algo puntual.' };

/* Las dos secciones que no son clases: no se mezclan con el muro. */
const APARTE = [FAQ_ID, TUTO_ID];

/* Los estudiantes también pueden dejar preguntas: entran a Preguntas frecuentes
   sin respuesta y el admin las responde editándolas. La base valida el largo. */
const PREGUNTA_MIN = 8, PREGUNTA_MAX = 280;
/** Pregunta frecuente que todavía no tiene respuesta (ni texto ni video). */
const sinRespuesta = p => p.session === FAQ_ID && !(p.body || '').trim() && !p.videoUrl && !p.videoId;
let borrador = '';   // lo que va escrito en el formulario, para no perderlo al redibujar

/* ================================================================
   Preferencias de quien mira (guardados y qué reaccioné).
   Son personales, así que viven en este navegador y no en la base.
   ================================================================ */
const PREFS_KEY = 'muro-academia-prefs';
const prefs = (() => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; }
  catch { return {}; }
})();
prefs.saved   = prefs.saved   || [];
prefs.reacted = prefs.reacted || {};
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {} };

const isSaved   = id => prefs.saved.includes(id);
const myReacts  = id => prefs.reacted[id] || [];
function toggleSaved(id){
  prefs.saved = isSaved(id) ? prefs.saved.filter(x => x !== id) : [...prefs.saved, id];
  savePrefs();
}
function markReacted(id, key, on){
  const cur = myReacts(id);
  prefs.reacted[id] = on ? [...cur, key] : cur.filter(k => k !== key);
  if (!prefs.reacted[id].length) delete prefs.reacted[id];
  savePrefs();
}

/* Ojito: clases que el estudiante ocultó de su vista. Como los guardados,
   viven solo en este navegador. El admin siempre ve todo, para no editar
   a ciegas si alguna vez ocultó algo desde este mismo equipo.          */
prefs.hidden = prefs.hidden || [];
const isHidden = id => !IS_ADMIN && prefs.hidden.includes(id);
function setHidden(id, on){
  prefs.hidden = prefs.hidden.filter(x => x !== id);
  if (on) prefs.hidden.push(id);
  savePrefs();
}

/* ================================================================
   Capa de almacenamiento
   ================================================================ */
const CLOUD = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
let store;

/* ---------- Supabase ---------- */
function cloudStore(){
  const sb = ACADEMIA.cliente();   // lleva la clave de admin o el token de la sesión
  const bucket = CFG.BUCKET || 'videos';
  const tablaSk = CFG.TABLE_SKILLS || 'skills';   // catalogo de prompts
  const tablaQz = CFG.TABLE_QUIZZES   || 'quizzes';
  const rpcQzLista  = CFG.RPC_QUIZ_LISTA  || 'quizzes_publicos';
  const rpcQz       = CFG.RPC_QUIZ        || 'quiz_publico';
  const rpcQzEnviar = CFG.RPC_QUIZ_ENVIAR || 'responder_quiz';
  const rpcQzStats  = CFG.RPC_QUIZ_STATS  || 'quiz_stats';
  const rpcQzBorrarP = CFG.RPC_QUIZ_BORRAR_PERSONA || 'borrar_persona_quiz';
  const rpcQzBorrarT = CFG.RPC_QUIZ_BORRAR_TODO    || 'borrar_intentos_quiz';

  /** Fila de la tabla -> quiz que entiende la app. */
  const fromQuiz = r => ({
    id:r.id, titulo:r.titulo || '', descripcion:r.descripcion || '',
    activo:!!r.activo, orden:r.orden || 0,
    preguntas:Array.isArray(r.preguntas) ? r.preguntas : [],
    audiencia:Array.isArray(r.audiencia) ? r.audiencia : [],
    sesion_id:r.sesion_id || null, aprobar:r.aprobar ?? 70, intentos:r.intentos ?? 0, obligatorio:!!r.obligatorio,
  });

  const fromRow = r => ({
    id:r.id, session:r.session, title:r.title || '', body:r.body || '',
    pinned:!!r.pinned, orden:Number.isFinite(r.orden) ? r.orden : null,
    author:r.author, initials:r.initials,
    videoUrl:r.video_url || null, videoPath:r.video_path || null, videoName:r.video_name || null,
    audiencia:Array.isArray(r.audiencia) ? r.audiencia : [],
    reactions:r.reactions || {}, createdAt:new Date(r.created_at).getTime(),
  });
  const toRow = p => ({
    id:p.id, session:p.session, title:p.title, body:p.body, pinned:p.pinned,
    // "orden" solo viaja si el admin ya movió la publicación: así, mientras
    // no se corra supabase-extras.sql, publicar y editar siguen funcionando
    ...(Number.isFinite(p.orden) ? { orden:p.orden } : {}),
    author:p.author, initials:p.initials,
    video_url:p.videoUrl, video_path:p.videoPath, video_name:p.videoName,
    audiencia:p.audiencia || [],
    updated_at:new Date().toISOString(),
  });
  const check = ({ error }) => { if (error) throw error; };
  /** Llama una función de la base y devuelve lo que responde (o lanza su error). */
  const rpc = async (fn, args) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw error;
    return data;
  };

  const fromSkill = r => ({
    id:r.id, title:r.title || '', area:r.area || AREAS[0], level:r.level || NIVELES[0],
    tags:r.tags || '', objective:r.objective || '', prompt:r.prompt || '',
    visible:r.visible !== false,   // sin la columna (antes del SQL) todas se ven
    audiencia:Array.isArray(r.audiencia) ? r.audiencia : [],
    createdAt:new Date(r.created_at).getTime(),
  });
  const toSkill = s => ({
    id:s.id, title:s.title, area:s.area, level:s.level,
    tags:s.tags, objective:s.objective, prompt:s.prompt,
    // visible solo viaja si está apagada o se acaba de cambiar: así guardar sigue
    // funcionando aunque aún no se haya corrido supabase-skills-visibles.sql
    ...(s.visible === false || s.cambioVisible ? { visible:s.visible !== false } : {}),
    audiencia:s.audiencia || [],
    updated_at:new Date().toISOString(),
  });


  return {
    kind:'cloud',
    async init(){},

    /* ---------- Sesión, grupos y avance (supabase-empresas.sql) ---------- */
    perfil:       ()           => rpc('mi_perfil'),
    salir:        ()           => rpc('salir'),
    misVistos:    async ()     => (await rpc('mis_vistos')) || [],
    marcarVisto:  (id, on)     => rpc('marcar_visto', { p_post:id, p_visto:on }),
    panel:        grupo        => rpc('panel_grupo', { p_grupo:grupo }),
    grupos:       async ()     => (await rpc('admin_grupos')) || [],
    guardarGrupo: g            => rpc('admin_guardar_grupo', {
      p_id:g.id || null, p_nombre:g.nombre, p_tipo:g.tipo, p_clave:g.clave || '',
      p_vence:g.vence_el || null, p_activo:g.activo }),
    borrarGrupo:  id           => rpc('admin_borrar_grupo', { p_id:id }),
    miembros:     async grupo  => (await rpc('admin_miembros', { p_grupo:grupo })) || [],
    agregarMiembros: (grupo, filas) => rpc('admin_agregar_miembros', { p_grupo:grupo, p_filas:filas }),
    actualizarMiembro: m       => rpc('admin_actualizar_miembro', {
      p_id:m.id, p_nombre:m.nombre, p_rol:m.rol, p_activo:m.activo }),
    quitarMiembro: id          => rpc('admin_quitar_miembro', { p_id:id }),

    /* ---------- Fase 1: ficha, reto, cronograma y grabaciones (supabase-fase1.sql) ---------- */
    fichaGrupo: (id, ficha)    => rpc('admin_ficha_grupo', { p_id:id, p_ficha:ficha }),
    async subirLogo(grupoId, file){
      const ext = (file.name.match(/\.(\w+)$/) || [, 'png'])[1].toLowerCase();
      const path = `logos/${grupoId}-${Date.now().toString(36)}.${ext}`;
      const { error } = await sb.storage.from(bucket).upload(path, file, { upsert:true, contentType:file.type, cacheControl:'31536000' });
      if (error) throw error;
      return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    },
    async sesiones(){
      const { data, error } = await sb.from('reto_sesiones').select('*').order('orden', { ascending:true });
      if (error) throw error;
      return data.map(deSesion);
    },
    async guardarSesiones(lista){
      if (!lista.length) return;
      check(await sb.from('reto_sesiones').upsert(lista.map(s => ({
        id:s.id, orden:s.orden, corto:s.short, nombre:s.name, descripcion:s.desc || '',
        icono:s.icon, tipo:s.tipo || 'clase',
        // visible solo viaja si está apagada o se acaba de cambiar: así guardar sigue funcionando
        // aunque la base todavía no tenga la columna
        ...(s.visible === false || s.cambioVisible ? { visible:s.visible !== false } : {}),
        updated_at:new Date().toISOString() }))));
    },
    async borrarSesion(id){ check(await sb.from('reto_sesiones').delete().eq('id', id)); },
    async cronograma(grupoId){
      let q = sb.from('cronograma').select('*');
      if (grupoId) q = q.eq('grupo_id', grupoId);
      const { data, error } = await q;
      if (error) throw error;
      // La fecha siempre como AAAA-MM-DD y la hora como HH:MM, venga como venga
      return data.map(r => ({ ...r, fecha:r.fecha ? String(r.fecha).slice(0, 10) : null,
                              hora:r.hora ? String(r.hora).slice(0, 5) : null }));
    },
    async guardarCronograma(filas){
      if (filas.length) check(await sb.from('cronograma').upsert(filas));
    },
    async grabaciones(grupoId){
      let q = sb.from('grabaciones').select('*').order('orden', { ascending:true });
      if (grupoId) q = q.eq('grupo_id', grupoId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    async guardarGrabacion(g){ check(await sb.from('grabaciones').upsert(g)); },
    async borrarGrabacion(id){ check(await sb.from('grabaciones').delete().eq('id', id)); },
    registrarVideo: (id, evento, pos, dur) => rpc('registrar_video', { p_id:id, p_evento:evento, p_pos:pos, p_dur:dur }),
    miProgresoVideo: async () => (await rpc('mi_progreso_video')) || {},

    /** ¿La clave de la URL es la buena? Lo dice la base, no el navegador. */
    async checkAdmin(){
      if (!ADMIN_KEY) return false;
      const { data, error } = await sb.rpc('is_admin');
      if (error) throw error;
      return data === true;
    },

    async list(){
      const { data, error } = await sb.from('posts').select('*').order('created_at', { ascending:false });
      if (error) throw error;
      return data.map(fromRow);
    },

    async save(p){
      check(await sb.from('posts').upsert(toRow(p)));
    },

    /** Reordenar cambia varias publicaciones: van todas en una sola llamada. */
    async saveMany(lista){
      if (!lista.length) return;
      check(await sb.from('posts').upsert(lista.map(toRow)));
    },

    async remove(p){
      if (p.videoPath) await sb.storage.from(bucket).remove([p.videoPath]);
      check(await sb.from('posts').delete().eq('id', p.id));
    },

    async uploadVideo(p, file){
      const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
      const path = `${p.id}/${safe}`;
      const { error } = await sb.storage.from(bucket)
        .upload(path, file, { upsert:true, contentType:file.type, cacheControl:'31536000' });
      if (error) throw error;
      p.videoPath = path;
      p.videoName = file.name;
      p.videoUrl  = sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    },

    async deleteVideo(p){
      if (p.videoPath) await sb.storage.from(bucket).remove([p.videoPath]);
      p.videoPath = null; p.videoName = null; p.videoUrl = null;
    },

    async react(p, key, delta){
      const { data, error } = await sb.rpc('bump_reaction', { p_id:p.id, p_key:key, p_delta:delta });
      if (error) throw error;
      p.reactions = data || p.reactions;
    },

    /** Un estudiante deja una pregunta frecuente. La base valida largo, duplicados y spam. */
    async ask(texto){
      const { data, error } = await sb.rpc('preguntar', { p_texto:texto });
      if (error) throw error;
      return fromRow(Array.isArray(data) ? data[0] : data);
    },

    /* ---------- Quizzes ----------
       El admin lee y escribe la tabla; el estudiante solo pasa por las
       funciones, que nunca le mandan cuál es la respuesta correcta. */
    async listQuizzes(){
      if (IS_ADMIN){
        const { data, error } = await sb.from(tablaQz).select('*').order('orden', { ascending:true });
        if (error) throw error;
        return data.map(fromQuiz);
      }
      const { data, error } = await sb.rpc(rpcQzLista);
      if (error) throw error;
      return data || [];
    },
    async getQuiz(id){
      if (IS_ADMIN){
        const { data, error } = await sb.from(tablaQz).select('*').eq('id', id).single();
        if (error) throw error;
        return fromQuiz(data);
      }
      const { data, error } = await sb.rpc(rpcQz, { p_id:id });
      if (error) throw error;
      return data;
    },
    async saveQuiz(q){
      check(await sb.from(tablaQz).upsert({
        id:q.id, titulo:q.titulo, descripcion:q.descripcion, activo:q.activo,
        orden:q.orden, preguntas:q.preguntas, audiencia:q.audiencia || [],
        // El quiz de cada sesión y sus reglas (supabase-fase1.sql)
        ...(q.sesion_id ? { sesion_id:q.sesion_id, aprobar:q.aprobar ?? 70, intentos:q.intentos ?? 0, obligatorio:!!q.obligatorio } : {}),
        updated_at:new Date().toISOString(),
      }));
    },
    /** La base califica y guarda el intento a nombre de la sesión; devuelve el puntaje y las correctas. */
    async submitQuiz(id, respuestas){
      const { data, error } = await sb.rpc(rpcQzEnviar, { p_id:id, p_respuestas:respuestas });
      if (error) throw error;
      return data;
    },
    async quizStats(){
      const { data, error } = await sb.rpc(rpcQzStats);
      if (error) throw error;
      return data || [];
    },
    /** Borra los intentos de una persona en un quiz (para limpiar pruebas). */
    async borrarPersonaQuiz(quizId, persona){
      const { error } = await sb.rpc(rpcQzBorrarP, { p_quiz_id:quizId, p_persona:persona });
      if (error) throw error;
    },
    /** Borra todos los intentos de un quiz. Las preguntas quedan intactas. */
    async borrarIntentosQuiz(quizId){
      const { error } = await sb.rpc(rpcQzBorrarT, { p_quiz_id:quizId });
      if (error) throw error;
    },

    /* ---------- Catálogo de skills ---------- */
    async listSkills(){
      const { data, error } = await sb.from(tablaSk).select('*').order('created_at', { ascending:true });
      if (error) throw error;
      return data.map(fromSkill);
    },
    async saveSkill(s){
      check(await sb.from(tablaSk).upsert(toSkill(s)));
    },
    async removeSkill(s){
      check(await sb.from(tablaSk).delete().eq('id', s.id));
    },
  };
}

/* ---------- IndexedDB (modo local) ---------- */
function localStore(){
  const DB_NAME = 'muro-academia', DB_VER = 3;   // v2 catálogo de skills · v3 quizzes
  let db;
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx  = (s, m='readonly') => db.transaction(s, m).objectStore(s);

  // Empresas, sesiones y paneles viven solo en la base: aquí no existen
  const soloNube = async () => { throw new Error('Esto solo funciona con la base de datos en la nube (config.js).'); };

  return {
    kind:'local',
    async checkAdmin(){ return !!ADMIN_KEY; },   // sin nube no hay quién valide
    async perfil(){ return null; },
    async salir(){},
    async misVistos(){ return []; },
    async marcarVisto(){},
    panel:soloNube, grupos:soloNube, guardarGrupo:soloNube, borrarGrupo:soloNube,
    miembros:soloNube, agregarMiembros:soloNube, actualizarMiembro:soloNube, quitarMiembro:soloNube,
    fichaGrupo:soloNube, subirLogo:soloNube, guardarSesiones:soloNube, borrarSesion:soloNube,
    guardarCronograma:soloNube, guardarGrabacion:soloNube, borrarGrabacion:soloNube,
    async sesiones(){ return SESIONES_BASE.slice(); },
    async cronograma(){ return []; },
    async grabaciones(){ return []; },
    async registrarVideo(){ return {}; },
    async miProgresoVideo(){ return {}; },
    async init(){
      db = await new Promise((res, rej) => {
        const r = indexedDB.open(DB_NAME, DB_VER);
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains('posts'))  d.createObjectStore('posts',  { keyPath:'id' });
          if (!d.objectStoreNames.contains('videos')) d.createObjectStore('videos', { keyPath:'id' });
          if (!d.objectStoreNames.contains('skills')) d.createObjectStore('skills', { keyPath:'id' });
          if (!d.objectStoreNames.contains('quizzes'))  d.createObjectStore('quizzes',  { keyPath:'id' });
          if (!d.objectStoreNames.contains('quizres'))  d.createObjectStore('quizres',  { keyPath:'id' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror   = () => rej(r.error);
      });
      // Los cuatro quizzes existen desde el arranque, como en la base real
      if (!(await req(tx('quizzes').count()))){
        for (let i = 1; i <= 4; i++){
          await req(tx('quizzes','readwrite').put({
            id:'q' + i, titulo:'Quiz ' + i, descripcion:'', activo:false, orden:i, preguntas:[],
          }));
        }
      }
    },
    async list(){ return (await req(tx('posts').getAll())).map(p => ({ reactions:{}, ...p })); },
    async save(p){ await req(tx('posts','readwrite').put({ ...p })); },
    async saveMany(lista){ for (const p of lista) await this.save(p); },
    async remove(p){
      if (p.videoId) await req(tx('videos','readwrite').delete(p.videoId));
      await req(tx('posts','readwrite').delete(p.id));
    },
    async uploadVideo(p, file){
      const vid = 'v' + p.id;
      await req(tx('videos','readwrite').put({ id:vid, blob:file }));
      p.videoId = vid; p.videoName = file.name; p.videoUrl = null;
    },
    async deleteVideo(p){
      if (p.videoId) await req(tx('videos','readwrite').delete(p.videoId));
      p.videoId = null; p.videoName = null;
    },
    async react(p, key, delta){
      p.reactions = p.reactions || {};
      p.reactions[key] = Math.max(0, (p.reactions[key] || 0) + delta);
      await this.save(p);
    },
    async ask(texto){
      const repetida = (await this.list()).find(p =>
        p.session === FAQ_ID && (p.title || '').toLowerCase() === texto.toLowerCase());
      if (repetida) return repetida;
      const p = { id:uid(), session:FAQ_ID, title:texto, body:'', pinned:false,
                  author:'Estudiante', initials:'ES', createdAt:Date.now(), reactions:{} };
      await this.save(p);
      return p;
    },
    async blobUrl(videoId){
      const rec = await req(tx('videos').get(videoId));
      return rec ? URL.createObjectURL(rec.blob) : null;
    },
    async listSkills(){
      const all = await req(tx('skills').getAll());
      return all.sort((a,b) => a.createdAt - b.createdAt);
    },

    /* ---------- Quizzes (mismas reglas que en la nube, pero aquí) ---------- */
    async listQuizzes(){
      const todos = (await req(tx('quizzes').getAll())).sort((a,b) => (a.orden || 0) - (b.orden || 0));
      if (IS_ADMIN) return todos;
      return todos.filter(q => q.activo && q.preguntas.length)
                  .map(q => ({ id:q.id, titulo:q.titulo, descripcion:q.descripcion, preguntas:q.preguntas.length }));
    },
    async getQuiz(id){
      const q = await req(tx('quizzes').get(id));
      if (!q) throw new Error('Ese quiz no está disponible');
      if (IS_ADMIN) return q;
      if (!q.activo || !q.preguntas.length) throw new Error('Ese quiz no está disponible');
      return { id:q.id, titulo:q.titulo, descripcion:q.descripcion,
               preguntas:q.preguntas.map(p => ({ text:p.text, options:p.options })) };
    },
    async saveQuiz(q){ await req(tx('quizzes','readwrite').put({ ...q })); },
    async submitQuiz(id, respuestas){
      const nombre = 'Prueba local';
      const q = await req(tx('quizzes').get(id));
      if (!q || !q.activo || !q.preguntas.length) throw new Error('Ese quiz no está disponible');
      const aciertos = q.preguntas.map((p, i) => Number(respuestas[i]) === p.correctIndex ? 1 : 0);
      const puntaje = aciertos.reduce((a,b) => a + b, 0);
      await req(tx('quizres','readwrite').put({
        id:uid(), quiz_id:id, persona:nombre.toLowerCase(), nombre,
        puntaje, total:q.preguntas.length, aciertos, respuestas, created_at:Date.now(),
      }));
      return { puntaje, total:q.preguntas.length, aciertos, correctas:q.preguntas.map(p => p.correctIndex) };
    },
    async borrarPersonaQuiz(quizId, persona){
      const todos = await req(tx('quizres').getAll());
      for (const r of todos)
        if (r.quiz_id === quizId && r.persona === String(persona || '').trim().toLowerCase())
          await req(tx('quizres','readwrite').delete(r.id));
    },
    async borrarIntentosQuiz(quizId){
      const todos = await req(tx('quizres').getAll());
      for (const r of todos)
        if (r.quiz_id === quizId) await req(tx('quizres','readwrite').delete(r.id));
    },
    async quizStats(){
      const todos = (await req(tx('quizzes').getAll())).sort((a,b) => (a.orden || 0) - (b.orden || 0));
      // Orden ascendente: al armar el Map, el último intento de cada persona pisa a los anteriores
      const res = (await req(tx('quizres').getAll())).sort((a,b) => a.created_at - b.created_at);
      return todos.map(q => {
        // De cada persona cuenta su último intento
        const ultimos = [...new Map(res.filter(r => r.quiz_id === q.id).map(r => [r.persona, r])).values()];
        return {
          id:q.id, titulo:q.titulo, activo:q.activo, preguntas:q.preguntas.length,
          personas:ultimos.length,
          aciertos:ultimos.reduce((a,r) => a + r.puntaje, 0),
          respondidas:ultimos.reduce((a,r) => a + r.total, 0),
          detalle:ultimos.map(r => r.aciertos),
          intentos:ultimos.map(r => ({ persona:r.persona, nombre:r.nombre,
                                       puntaje:r.puntaje, total:r.total,
                                       fecha:new Date(r.created_at).toISOString() })),
        };
      });
    },
    async saveSkill(s){ await req(tx('skills','readwrite').put({ ...s })); },
    async removeSkill(s){ await req(tx('skills','readwrite').delete(s.id)); },
  };
}

/* ================================================================
   Estado
   ================================================================ */
let posts = [];
let skills      = [];      // catálogo de skills

/* ---------- Quizzes ----------
   La vista tiene cuatro momentos: la lista, responder, el resultado y,
   solo para el admin, la estadística y el editor.                       */
let quizzes       = [];
let estadisticas  = [];          // solo admin
let quizFalla     = '';          // por qué no cargaron (p. ej. falta correr el SQL)
let quizAbierto   = null;        // el quiz que se está respondiendo
let quizElegidas  = [];          // opción marcada en cada pregunta
let quizResultado = null;        // {puntaje, total, aciertos, correctas}
let quizEditando  = null;        // copia que edita el admin
let quizDesde     = null;        // la sesión desde la que se abrió el quiz (para volver a ella)
let quizVista     = 'lista';     // lista | responder | resultado | stats | editar
let skillArea   = 'todas';
let editingSkillId = null;
let openSkillId    = null;
let view = { type:'session', id:SESSIONS[0].id };   // no hay Feed: el muro siempre muestra una clase
let query = '';
let editingId = null;
let pendingFile = null;
let removeExistingVideo = false;
const objectUrls = [];

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);

/* ================================================================
   Utilidades
   ================================================================ */
/** Un enlace pegado sin https:// (meet.google.com/…, chat.whatsapp.com/…) se completa solo. */
function enlace(v){
  v = String(v || '').trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : 'https://' + v.replace(/^\/+/, '');
}

/** Pone el cursor en el primer campo de un formulario recién abierto, salvo que ya se esté
    escribiendo en otro campo de ese mismo formulario (no se le roba el foco a nadie). */
function enfocar(sel){
  setTimeout(() => {
    const el = $(sel); if (!el) return;
    const caja = el.closest('.overlay'), activo = document.activeElement;
    if (caja && activo && activo !== el && caja.contains(activo) && activo.matches('input, textarea, select')) return;
    el.focus();
  }, 40);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/** Texto plano -> HTML seguro: **negrita**, > cita, enlaces, párrafos. */
function renderBody(text){
  if (!text || !text.trim()) return '';
  return text.replace(/\r/g,'').split(/\n{2,}/).map(block => {
    const lines = block.split('\n');
    const isQuote = lines.every(l => l.trim().startsWith('>') || !l.trim());
    const clean = isQuote ? lines.map(l => l.replace(/^\s*>\s?/,'')) : lines;
    const html = inline(clean.join('\n')).replace(/\n/g,'<br>');
    return isQuote ? `<blockquote>${html}</blockquote>` : `<p>${html}</p>`;
  }).join('');
}
function inline(raw){
  return escapeHtml(raw)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(https?:\/\/[^\s<]+)/g, u => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}

function timeAgo(ts){
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60)     return 'ahora';
  if (s < 3600)   return Math.floor(s/60) + ' min.';
  if (s < 86400)  return Math.floor(s/3600) + ' h';
  if (s < 604800) return Math.floor(s/86400) + ' d';
  return new Date(ts).toLocaleDateString('es-ES', { day:'numeric', month:'short' });
}

/** YouTube / Vimeo -> URL embebible. Si no lo es, null. */
function toEmbed(url){
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./,'');
    if (h === 'youtu.be')     return 'https://www.youtube.com/embed/' + u.pathname.slice(1);
    if (h.endsWith('youtube.com')){
      if (u.pathname.startsWith('/embed/')) return u.href;
      const v = u.searchParams.get('v');
      if (v) return 'https://www.youtube.com/embed/' + v;
    }
    if (h.endsWith('vimeo.com')){
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (/^\d+$/.test(id)) return 'https://player.vimeo.com/video/' + id;
    }
  } catch { /* url inválida */ }
  return null;
}

function toast(msg){
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 3200);
}
function errorMsg(err){
  const m = err?.message || String(err);
  // La sesión venció o le quitaron el acceso mientras navegaba: de vuelta a la entrada
  if (/sesión terminó/i.test(m) && !IS_ADMIN && CLOUD){
    ACADEMIA.olvidarToken();
    setTimeout(() => mostrarLogin('Tu sesión terminó. Vuelve a entrar.'), 600);
    return 'Tu sesión terminó.';
  }
  if (/Solo el responsable/i.test(m)) return 'Solo el responsable de ese grupo puede ver su avance.';
  if (/sin permiso/i.test(m)) { ACADEMIA.olvidarAdmin(); return 'La base no reconoce la clave de admin: recarga /admin y escríbela de nuevo.'; }
  if (/admin_|mi_perfil|panel_grupo|marcar_visto|mis_vistos|entrar/i.test(m) && /could not find|schema cache|does not exist/i.test(m))
    return 'Falta correr supabase-empresas.sql en Supabase.';
  // Lo que crea supabase-extras.sql (quizzes y la columna "orden"): si falta, se dice claro
  if (/quiz|orden/i.test(m) && /could not find|schema cache|does not exist/i.test(m))
    return IS_ADMIN
      ? 'Esta parte del muro aún no está lista en la base de datos: falta correr supabase-extras.sql en Supabase.'
      : 'Esta parte del muro todavía no está activada. Avísale al equipo.';
  if (/preguntar|PGRST202/i.test(m))
    return 'Las preguntas todavía no están activadas en el muro. Avísale al equipo.';
  if (/row-level security|violates|permission/i.test(m))
    return 'La base rechazó el cambio: revisa que la clave de admin coincida con la del SQL.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión con la nube. Revisa tu internet.';
  return m;
}

/* ================================================================
   Audiencia: a quién va dirigido cada contenido
   Lista vacía = todos. 'tipo:b2b' / 'tipo:b2c' = todas las empresas /
   todas las cohortes. Si no, el id de cada grupo. Quien filtra de verdad
   es la base; aquí solo se arma el selector y la vista previa del admin.
   ================================================================ */
const AUD_B2B = 'tipo:b2b', AUD_B2C = 'tipo:b2c';
const audDe = x => Array.isArray(x?.audiencia) ? x.audiencia : [];
const grupoPorId = id => GRUPOS.find(g => g.id === id);
const veGrupo = (aud, g) => !aud.length || aud.includes(g.id) || aud.includes('tipo:' + g.tipo);

/** ¿Va dirigido a grupos puntuales (contenido exclusivo de una empresa o cohorte)? */
const esExclusivo = x => audDe(x).some(v => !v.startsWith('tipo:'));

/** Qué ve el admin según su espacio de trabajo:
    · Principal: el contenido general (lo exclusivo vive en el espacio de su empresa).
      Las preguntas frecuentes se ven todas, para responder las de cualquier empresa.
    · Una empresa: exactamente lo que ve esa empresa (lo general y lo suyo). */
const alcance = x => {
  if (!IS_ADMIN || !CLOUD) return true;
  if (!vistaComo) return x.session === FAQ_ID || !esExclusivo(x);
  const g = grupoPorId(vistaComo);
  return !g || veGrupo(audDe(x), g);
};
const vis = lista => lista.filter(alcance);

/** Audiencia con la que nace lo que se crea: la del espacio en que está el admin. */
const audDefecto = () => vistaComo && grupoPorId(vistaComo) ? [vistaComo] : [];

function audienciaTxt(aud){
  if (!aud.length) return 'Todos los grupos';
  return aud.map(v => v === AUD_B2B ? 'Todas las empresas'
                    : v === AUD_B2C ? 'Todas las cohortes'
                    : grupoPorId(v)?.nombre || 'Grupo eliminado').join(' · ');
}

/** Etiqueta para el admin: a quién va dirigido, si no es para todos. */
const audTagHtml = x => IS_ADMIN && audDe(x).length
  ? `<span class="tag tag-aud" title="Solo lo ven: ${escapeHtml(audienciaTxt(audDe(x)))}">
       <svg class="ico"><use href="#i-lock"/></svg>${escapeHtml(audienciaTxt(audDe(x)))}</span>` : '';

/** Selector de audiencia: casillas; sin marcar ninguna, lo ven todos. */
function audienciaHtml(aud = []){
  const marca = '<span class="aud-check"><svg viewBox="0 0 24 24"><path d="m6 12.5 4 4 8-9"/></svg></span>';
  const op = (valor, texto, av = '', sub = '') => `
    <label class="aud-op">
      <input type="checkbox" data-aud value="${escapeHtml(valor)}" ${aud.includes(valor) ? 'checked' : ''} />
      ${marca}${av}
      <span class="aud-txt">${texto}${sub ? `<em>${sub}</em>` : ''}</span>
    </label>`;
  const grupos = GRUPOS.slice().sort((a,b) => a.nombre.localeCompare(b.nombre, 'es'));
  // Un grupo borrado que siga en la lista se muestra para poder quitarlo
  const huerfanos = aud.filter(v => !v.startsWith('tipo:') && !grupoPorId(v));
  const avGrupo = g => g.logo_url
    ? `<span class="aud-av has-logo"><img src="${escapeHtml(g.logo_url)}" alt="" onerror="this.remove()" /></span>`
    : `<span class="aud-av ${g.tipo === 'b2c' ? 'is-b2c' : ''}">${escapeHtml(iniciales(g.nombre))}</span>`;
  return `
    <p class="aud-resumen"><svg class="ico"><use href="#i-eye"/></svg> Lo ven: <b>${escapeHtml(audienciaTxt(aud))}</b></p>
    <div class="aud-ops">
      ${op(AUD_B2B, 'Todas las empresas', '', 'B2B')}
      ${op(AUD_B2C, 'Todas las cohortes', '', 'B2C')}
    </div>
    ${grupos.length || huerfanos.length ? `
      <span class="aud-sep">O solo estos grupos</span>
      <div class="aud-ops">
        ${grupos.map(g => op(g.id, escapeHtml(g.nombre), avGrupo(g), g.vigente === false ? 'Sin acceso' : '')).join('')}
        ${huerfanos.map(v => op(v, 'Grupo eliminado')).join('')}
      </div>` : ''}
    <p class="aud-nota">${gruposFalla
      ? escapeHtml(gruposFalla)
      : grupos.length
        ? 'Si no marcas nada, lo ven todos los grupos, también los que crees después.'
        : 'Todavía no hay empresas ni cohortes creadas: por ahora lo ven todos.'}</p>`;
}
const leerAudiencia = cont => $$('input[data-aud]:checked', cont).map(i => i.value);

// El resumen de cada selector se actualiza mientras se marca
document.addEventListener('change', e => {
  const caja = e.target.closest('.aud'); if (!caja || !e.target.matches('[data-aud]')) return;
  const aud = leerAudiencia(caja);
  const r = $('.aud-resumen b', caja); if (r) r.textContent = audienciaTxt(aud);
  if (caja.id === 'quizAud' && quizEditando) quizEditando.audiencia = aud;
});

/** ¿La publicación trae un video (y no una imagen o un PDF)? Solo esos se marcan como vistos. */
const esVideo = p => !!(p.videoUrl || p.videoId) && (!!(p.videoUrl && toEmbed(p.videoUrl)) || (!esImagen(p) && !esPdf(p)));

const sessionOf = id => id === FAQ_ID ? FAQ : id === TUTO_ID ? TUTO
                      : SESSIONS.find(s => s.id === id) || SESSIONS[0];
/** Vista que le corresponde a una publicación según su sección. */
const vistaDe = id => id === FAQ_ID ? { type:'faq' } : id === TUTO_ID ? { type:'tuto' }
                    : { type:'session', id };

/* ================================================================
   Sidebar y navegación
   ================================================================ */
/** Dibuja las sesiones en el menú, en el selector del composer y en la columna derecha.
    Se llama al arrancar y cada vez que el admin edita el reto. */
function pintarNav(){
  $('#navSessions').innerHTML = SESSIONS.map(s => `
    <div class="nav-row ${s.visible === false ? 'is-apagada' : ''}" data-row="${s.id}">
      <button class="nav-item" data-view="session" data-id="${s.id}" title="${escapeHtml(s.title)}">
        <svg class="ico" data-icono="${s.icon}"><use href="#${s.icon}"/></svg>
        <span class="nav-label">
          <em>${escapeHtml(s.short)}</em>
          <b>${escapeHtml(s.name)}</b>
        </span>
        ${s.visible === false ? '<span class="nav-apagada">Apagada</span>' : ''}
        <span class="count" data-count="${s.id}">0</span>
      </button>
      <button class="nav-eye" data-hide="${s.id}" aria-pressed="false"
              aria-label="Ocultar ${escapeHtml(s.short)}" title="Ocultar esta clase">
        <svg class="ico"><use href="#i-eye"/></svg>
      </button>
    </div>`).join('');

  $('#fSession').innerHTML = SESSIONS
    .map(s => `<option value="${s.id}">${escapeHtml(s.title)}</option>`).join('')
    + `<option value="${TUTO_ID}">${escapeHtml(TUTO.title)}</option>`
    + `<option value="${FAQ_ID}">${escapeHtml(FAQ.title)}</option>`;

  $('#railSessions').innerHTML = SESSIONS.map(s => `
    <li data-rail="${s.id}"><button data-id="${s.id}">
      <span class="dot" data-dot="${s.id}"></span>
      <span class="t">${escapeHtml(s.title)}</span>
      <em data-railcount="${s.id}">0</em>
    </button></li>`).join('');
}

function buildNav(){
  pintarNav();
  $('#nav').addEventListener('click', e => {
    if (e.target.closest('[data-editar-reto]')){ setView('reto'); $('#sidebar').classList.remove('is-open'); return; }
    const ojo = e.target.closest('[data-hide]');
    if (ojo){                        // el ojito no navega: solo oculta o muestra la clase
      const s = sessionOf(ojo.dataset.hide);
      const ocultar = !isHidden(s.id);
      setHidden(s.id, ocultar);
      toast(ocultar ? `Ocultaste «${s.name}» de tu vista` : `«${s.name}» vuelve a verse`);
      render();
      return;
    }
    const area = e.target.closest('.nav-area');
    if (area){                       // filtro de áreas: solo cambia el listado
      skillArea = area.dataset.area;
      render();
      return;
    }
    const b = e.target.closest('.nav-item'); if (!b) return;
    setView(b.dataset.view, b.dataset.id);
    $('#sidebar').classList.remove('is-open');
  });
  $('#railSessions').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    setView('session', b.dataset.id);
  });
}

function setView(type, id){
  view = { type, id: id || null };
  clearInterval(panelTimer);
  if (typeof grabAgregando !== 'undefined') grabAgregando = false;
  if (type !== 'inicio' && typeof inicioEditando !== 'undefined') inicioEditando = false;
  if (type === 'quiz'){                 // se entra siempre por la lista, con datos frescos
    quizVista = 'lista'; quizAbierto = null; quizResultado = null; quizEditando = null;
    cargarQuizzes().catch(err => console.warn(err)).then(render);   // si falla, la vista dice por qué
  }
  if (type === 'grupos'){
    grupoAbierto = id || null; miembros = []; miembrosFalla = '';
    (grupoAbierto ? cargarMiembros() : cargarGrupos()).then(render);
  }
  if (type === 'panel'){
    if (id) panelGrupo = id;
    cargarPanel().then(render);
    // "En vivo": mientras el panel esté abierto se actualiza solo cada minuto
    panelTimer = setInterval(() => {
      if (document.visibilityState === 'visible') cargarPanel().then(() => { if (view.type === 'panel') render(); });
    }, 60000);
  }
  render();
  window.scrollTo({ top:0, behavior:'smooth' });
}

function currentList(){
  let list = vis(posts);
  if (view.type === 'faq')        list = list.filter(p => p.session === FAQ_ID);
  else if (view.type === 'tuto')  list = list.filter(p => p.session === TUTO_ID);
  else if (view.type !== 'saved') list = list.filter(p => !APARTE.includes(p.session));
  // (el muro son las clases; en Guardados sí se ve todo lo que marcaste)
  // Sin Feed, buscar recorre todas las clases (menos las que el estudiante ocultó)
  if (view.type === 'session') list = list.filter(p =>
    query ? !isHidden(p.session) : p.session === view.id);
  if (view.type === 'saved')   list = list.filter(p => isSaved(p.id));
  if (query){
    const q = query.toLowerCase();
    list = list.filter(p =>
      (p.title || '').toLowerCase().includes(q) || (p.body || '').toLowerCase().includes(q));
  }
  // Manda el orden que puso el admin con las flechas; lo que todavía no lo
  // tiene es lo más nuevo, y va primero, como siempre.
  const orden = (a,b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned;
    const ta = Number.isFinite(a.orden), tb = Number.isFinite(b.orden);
    if (ta && tb && a.orden !== b.orden) return a.orden - b.orden;
    if (ta !== tb) return ta ? 1 : -1;
    return b.createdAt - a.createdAt;
  };
  // Las preguntas sin responder van primero: así el admin las encuentra arriba
  return list.sort((a,b) => (peso(a) - peso(b)) || orden(a,b));
}

/** Las preguntas sin responder pesan menos: suben. En las clases no cambia nada. */
const peso = p => sinRespuesta(p) ? 0 : 1;

/** Publicaciones del mismo bloque: solo entre ellas tiene sentido reordenar a mano.
    Una destacada no puede bajar debajo de una normal, porque el destaque manda. */
const bloqueDe = p => `${p.pinned ? 1 : 0}-${peso(p)}`;

/** ¿Se pueden mover las publicaciones de esta vista? */
const sePuedeOrdenar = () =>
  IS_ADMIN && !query && ['session','faq','tuto'].includes(view.type);

/** Las dos flechas de una publicación, apagadas cuando no hay a dónde ir. */
function flechasHtml(p, i, lista){
  if (!sePuedeOrdenar()) return '';
  const vecino = k => lista[k] && bloqueDe(lista[k]) === bloqueDe(p) ? lista[k] : null;
  const arriba = !vecino(i - 1), abajo = !vecino(i + 1);
  return `
    <span class="mover">
      <button class="icon-btn" data-mover="-1" data-id="${p.id}" ${arriba ? 'disabled' : ''}
              title="Subir esta publicación" aria-label="Subir esta publicación">
        <svg class="ico"><use href="#i-up"/></svg>
      </button>
      <button class="icon-btn" data-mover="1" data-id="${p.id}" ${abajo ? 'disabled' : ''}
              title="Bajar esta publicación" aria-label="Bajar esta publicación">
        <svg class="ico"><use href="#i-down"/></svg>
      </button>
    </span>`;
}

/** Sube o baja una publicación y deja el orden escrito en la base. */
async function moverPost(id, paso){
  const lista = currentList();
  const i = lista.findIndex(p => p.id === id);
  const j = i + paso;
  if (i < 0 || !lista[j] || bloqueDe(lista[j]) !== bloqueDe(lista[i])) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];

  // Se renumera la sección entera: así el orden queda explícito y deja de depender de la fecha
  const previo = new Map(lista.map(p => [p.id, p.orden]));
  lista.forEach((p, k) => { p.orden = k; });
  const cambiadas = lista.filter(p => previo.get(p.id) !== p.orden);
  render();
  try {
    await store.saveMany(cambiadas);
  } catch (err){
    lista.forEach(p => { p.orden = previo.get(p.id); });   // se deshace lo que no se pudo guardar
    toast(errorMsg(err));
    render();
  }
}

/* ================================================================
   Render
   ================================================================ */
/** Dibuja la vista y, aparte, el bloque de grabaciones (que no se rehace si no cambió). */
function render(){
  renderVista();
  if (typeof pintarGrabacion === 'function') pintarGrabacion();
}

function renderVista(){
  objectUrls.splice(0).forEach(URL.revokeObjectURL);

  if (view.type === 'session' && query){
    $('#viewTitle').textContent = 'Resultados de búsqueda';
    $('#viewSubtitle').textContent = `“${query}” en todas las clases`;
  } else if (view.type === 'session'){
    // Arriba solo la etiqueta: el nombre y la descripción van grandes en la página de la clase
    const s = sessionOf(view.id);
    $('#viewTitle').textContent = s.short;
    $('#viewSubtitle').textContent = TIPOS_SESION[s.tipo] && s.tipo !== 'clase' ? TIPOS_SESION[s.tipo] : 'El reto';
  } else if (view.type === 'skills'){
    $('#viewTitle').textContent = skillArea === 'todas' ? 'Skills' : skillArea;
    $('#viewSubtitle').textContent = 'Prompts listos para usar: ábrelos, cópialos o descárgalos en .md';
  } else if (view.type === 'faq'){
    $('#viewTitle').textContent = FAQ.title;
    $('#viewSubtitle').textContent = FAQ.desc;
  } else if (view.type === 'tuto'){
    $('#viewTitle').textContent = TUTO.title;
    $('#viewSubtitle').textContent = TUTO.desc;
  } else if (view.type === 'resumen'){
    $('#viewTitle').textContent = 'Vocabulario y términos';
    $('#viewSubtitle').textContent = 'La guía completa de la Academia: qué significa cada término, prompts y herramientas';
  } else if (view.type === 'quiz'){
    // Abierto desde una clase: el título es el de esa clase
    const sq = quizDesde ? sessionOf(quizDesde) : null;
    $('#viewTitle').textContent = sq ? 'Quiz · ' + sq.short : 'Quizz';
    $('#viewSubtitle').textContent = sq ? sq.name : IS_ADMIN
      ? 'Arma los quizzes y mira cuánto acertó el grupo'
      : 'Pon a prueba lo aprendido en cada clase';
  } else if (view.type === 'tareas'){
    $('#viewTitle').textContent = 'Trabajo autónomo';
    $('#viewSubtitle').textContent = IS_ADMIN
      ? 'Así ven las tareas los estudiantes. El avance de cada persona está en el Panel de avance'
      : 'Las tareas de cada sesión: marca cada paso a medida que lo termines';
  } else if (view.type === 'inicio'){
    const g = typeof grupoInicio === 'function' ? grupoInicio() : null;
    $('#viewTitle').textContent = IS_ADMIN && !g ? 'Cronogramas' : 'Inicio';
    $('#viewSubtitle').textContent = IS_ADMIN && !g
      ? 'El programa de cada empresa: fechas, encuentros y enlaces'
      : 'Tu programa: el próximo encuentro y el cronograma completo';
  } else if (view.type === 'reto'){
    $('#viewTitle').textContent = 'Sesiones del reto';
    $('#viewSubtitle').textContent = 'Agrega, edita, ordena o elimina las sesiones: el cambio se ve en todas las empresas';
  } else if (view.type === 'grupos'){
    const g = grupoAbierto && grupoPorId(grupoAbierto);
    $('#viewTitle').textContent = g ? g.nombre : 'Empresas y cohortes';
    $('#viewSubtitle').textContent = g
      ? 'Las personas de este grupo: entran con su correo y la contraseña del grupo'
      : 'Crea cada empresa o cohorte, dale una contraseña y da de alta los correos';
  } else if (view.type === 'panel'){
    $('#viewTitle').textContent = IS_ADMIN ? 'Panel de avance' : 'Panel de mi equipo';
    $('#viewSubtitle').textContent = 'Quién entró, qué videos vio, qué tareas completó y cómo le fue en los quizzes';
  } else if (view.type === 'config'){
    $('#viewTitle').textContent = 'Configurar Claude';
    $('#viewSubtitle').textContent = 'Qué dejar activo en la organización: qué hace cada ajuste y qué conviene encender';
  } else if (view.type === 'saved'){
    $('#viewTitle').textContent = 'Guardados';
    $('#viewSubtitle').textContent = 'Publicaciones que marcaste para revisar';
  }

  // Menú de atajos: marca el que corresponde a la vista abierta
  $$('#subnav [data-sub]').forEach(b => b.classList.toggle('is-on', b.dataset.sub === view.type));

  // Mientras se busca en todas las clases, ninguna queda marcada en el menú
  $$('.nav-item').forEach(b => b.classList.toggle('is-active',
    b.dataset.view === view.type && (b.dataset.id || null) === view.id &&
    !(view.type === 'session' && query)));

  const visibles = vis(posts);   // en la vista previa del admin, solo lo de ese grupo
  const bloqueadas = typeof sesionesBloqueadas === 'function' ? sesionesBloqueadas() : new Set();
  SESSIONS.forEach(s => {
    const n = visibles.filter(p => p.session === s.id).length;
    // Para el estudiante, la sesión con todas sus grabaciones vistas lleva una marca en vez del número
    const grabs = PERFIL ? GRABS.filter(g => g.sesion_id === s.id) : [];
    const hecha = grabs.length > 0 && grabs.every(g => progresoVideo[g.id]?.completado);
    const c = $(`[data-count="${s.id}"]`);
    if (c){ c.textContent = hecha ? '✓' : n || ''; c.classList.toggle('is-hecha', hecha); c.title = hecha ? 'Ya viste la grabación' : ''; }
    const r = $(`[data-railcount="${s.id}"]`);  if (r) r.textContent = n;
    const d = $(`[data-dot="${s.id}"]`);        if (d) d.classList.toggle('on', n > 0);

    const oculta = isHidden(s.id);
    const fila = $(`[data-row="${s.id}"]`);
    if (fila){
      // La clase que todavía no llega (según el cronograma de su grupo) va atenuada y con candado
      const futura = bloqueadas.has(s.id);
      fila.classList.toggle('is-futura', futura);
      const ico = $('[data-icono]', fila);
      if (ico) $('use', ico).setAttribute('href', '#' + (futura ? 'i-lock' : ico.dataset.icono));
      fila.classList.toggle('is-hidden', oculta);
      const ojo = $('[data-hide]', fila);
      ojo.setAttribute('aria-pressed', oculta);
      ojo.setAttribute('aria-label', (oculta ? 'Mostrar ' : 'Ocultar ') + s.short);
      ojo.title = oculta ? 'Mostrar esta clase' : 'Ocultar esta clase';
      $('use', ojo).setAttribute('href', oculta ? '#i-eye-off' : '#i-eye');
    }
    const li = $(`[data-rail="${s.id}"]`);      if (li) li.classList.toggle('is-hidden', oculta);
  });
  $('#countSaved').textContent = visibles.filter(p => isSaved(p.id)).length;
  const ct = $('#countTuto');
  if (ct) ct.textContent = visibles.filter(p => p.session === TUTO_ID).length;
  const pendientes = visibles.filter(sinRespuesta).length;
  const cf = $('#countFaq');
  if (cf){   // al admin el contador le muestra lo que falta responder, resaltado
    const alerta = IS_ADMIN && pendientes > 0;
    cf.textContent = alerta ? pendientes : visibles.filter(p => p.session === FAQ_ID).length;
    cf.classList.toggle('is-alert', alerta);
    cf.title = alerta ? `${pendientes} por responder` : '';
  }
  if (IS_ADMIN) $('#railPregunta').innerHTML = railAdminHtml(pendientes);
  // Columna derecha: el reto con el estado de cada sesión
  if (typeof retoRailHtml === 'function') $('#railSessions').innerHTML = retoRailHtml();

  if (PERFIL){
    // El estudiante ve su propio avance: cuántos videos de las clases ya vio
    // Cuentan las grabaciones de su grupo y los videos publicados en las clases
    const conVideo = visibles.filter(p => !APARTE.includes(p.session) && esVideo(p));
    const total = conVideo.length + GRABS.length;
    const hechos = conVideo.filter(p => vistos.has(p.id)).length + GRABS.filter(g => progresoVideo[g.id]?.completado).length;
    $('#progressFill').style.width = (total ? hechos / total * 100 : 0) + '%';
    $('#progressText').textContent = total
      ? `${hechos} de ${total} videos vistos` : 'Todavía no hay videos en las clases';
  } else {
    const withContent = SESSIONS.filter(s => visibles.some(p => p.session === s.id)).length;
    $('#progressFill').style.width = (withContent / SESSIONS.length * 100) + '%';
    $('#progressText').textContent = `${withContent} de ${SESSIONS.length} sesiones con contenido`;
  }

  // El documento ocupa todo el panel: sin composer ni publicaciones
  // Catálogo de skills: las áreas se filtran desde el sidebar
  const enSkills  = view.type === 'skills';
  const enQuiz    = view.type === 'quiz';
  const enResumen = view.type === 'resumen';
  const enConfig  = view.type === 'config';
  const enTareas  = view.type === 'tareas';
  const enGestion = view.type === 'grupos' || view.type === 'panel' || view.type === 'reto';
  const enInicio  = view.type === 'inicio';
  // Las clases del body van todas aquí: cada vista sale antes con su return
  document.body.classList.toggle('vista-skills', enSkills);
  document.body.classList.toggle('vista-quiz', enQuiz || enGestion || enInicio);
  document.body.classList.toggle('vista-gestion', enGestion);
  document.body.classList.toggle('vista-resumen', enResumen || enConfig || enTareas);
  const skillsVisibles = vis(skills);
  $('#countSkills').textContent = skillsVisibles.length;
  const cq = $('#countQuiz');
  if (cq) cq.textContent = IS_ADMIN ? vis(quizzes).filter(q => q.activo).length : quizzes.length;
  $('#navAreas').hidden = !enSkills;

  if (enGestion){
    $('#posts').innerHTML = view.type === 'grupos' ? gruposHtml() : view.type === 'reto' ? retoHtml() : panelHtml();
    return;
  }
  if (enInicio){
    $('#posts').innerHTML = inicioHtml();
    return;
  }

  if (enSkills){
    $('#navAreas').innerHTML = ['todas', ...areasCatalogo()].map(a => {
      const n = a === 'todas' ? skillsVisibles.length : skillsVisibles.filter(s => s.area === a).length;
      if (!n && a !== 'todas' && !IS_ADMIN && skillArea !== a) return '';   // al estudiante, solo áreas con prompts
      return `<button class="nav-area ${skillArea === a ? 'is-on' : ''}" data-area="${escapeHtml(a)}">
                <span class="t">${a === 'todas' ? 'Todas las áreas' : escapeHtml(a)}</span>
                <em>${n}</em>
              </button>`;
    }).join('');
    $('#posts').innerHTML = skillsHtml();
    return;
  }

  // Quizzes: ocupan todo el panel, como el catálogo de skills
  if (enQuiz){
    $('#posts').innerHTML = quizHtml();
    return;
  }

  if (enResumen || enConfig || enTareas){
    const url = enTareas ? TAREAS_URL : enConfig ? CONFIG_URL : GUIA_URL;
    const abierta = $('.guia iframe');
    // Si ya está abierta esa guía, no se vuelve a montar: recargarla perdería dónde va leyendo
    if (!abierta || abierta.getAttribute('src') !== url){
      $('#posts').innerHTML = `
        <div class="guia">
          <iframe src="${url}" title="${enTareas ? 'Trabajo autónomo' : enConfig ? 'Configurar Claude' : 'Vocabulario y términos'}"></iframe>
        </div>`;
    }
    return;
  }

  const list = currentList();
  const enFaq = view.type === 'faq';
  document.body.classList.toggle('vista-faq', enFaq);
  // Una clase (sin búsqueda) se ve como página de lección: video, sesión, recursos y siguiente
  const enClase = view.type === 'session' && !query && !isHidden(view.id);
  document.body.classList.toggle('vista-clase', enClase);
  if (enClase){
    $('#posts').innerHTML = claseHtml(list);
    list.forEach(p => { if (p.videoId && store.kind === 'local' && recursosAbiertos.has(p.id)) hydrateVideo(p); });
    return;
  }

  // Clase apagada con el ojito: en vez de sus publicaciones, el aviso para volver a verla
  if (view.type === 'session' && isHidden(view.id) && !query){
    $('#posts').innerHTML = hiddenHtml(sessionOf(view.id));
    return;
  }

  // Arriba de las FAQ: el estudiante ve el formulario; el admin, el botón y lo pendiente
  const cabeceraFaq = !enFaq ? ''
    : !IS_ADMIN ? preguntaFormHtml('faq')
    : list.length ? `
    <div class="faq-add">
      <button class="btn btn-primary" data-open-composer>
        <svg class="ico"><use href="#i-plus"/></svg> Agregar una pregunta
      </button>
      <span>${pendientes
        ? `<b>${pendientes}</b> ${pendientes === 1 ? 'pregunta espera' : 'preguntas esperan'} tu respuesta: están arriba.`
        : 'El título es la pregunta; el contenido, la respuesta en texto o video.'}</span>
    </div>` : '';
  $('#posts').innerHTML = cabeceraFaq + (list.length
    ? list.map(enFaq ? faqHtml : postHtml).join('')
    : emptyHtml());
  list.forEach(p => { if (p.videoId && store.kind === 'local') hydrateVideo(p); });
}

/* ================================================================
   Catálogo de skills
   ================================================================ */
const skillList = () => skillArea === 'todas'
  ? vis(skills)
  : vis(skills).filter(s => s.area === skillArea);

/** El número visible es la posición en el catálogo completo, no en el filtro:
    así una skill conserva su #04 aunque cambies de área. */
const skillNum = s => String(skills.findIndex(x => x.id === s.id) + 1).padStart(2, '0');

function skillsHtml(){
  const lista = skillList();
  const cabecera = `
    <div class="sk-head">
      <span class="sk-label">${lista.length} ${lista.length === 1 ? 'skill' : 'skills'}${
        skillArea === 'todas' ? ' en el catálogo' : ' en ' + escapeHtml(skillArea)}</span>
      ${IS_ADMIN ? `<button class="btn btn-primary" data-new-skill>
        <svg class="ico"><use href="#i-plus"/></svg> Nueva skill</button>` : ''}
    </div>`;

  if (!lista.length) return cabecera + `
    <div class="empty">
      <svg class="ico"><use href="#i-skill"/></svg>
      <h3>Todavía sin skills${skillArea === 'todas' ? '' : ' en esta área'}</h3>
      <p>${IS_ADMIN
        ? 'Crea la primera con <b>Nueva skill</b>: un nombre, el área y el prompt.'
        : 'Vuelve cuando el equipo publique los prompts de esta área.'}</p>
    </div>`;

  return cabecera + `<div class="sk-grid">${lista.map(s => `
    <article class="sk-card${s.visible === false ? ' is-off' : ''}" data-skill="${s.id}">
      <span class="sk-num">${skillNum(s)}</span>
      ${IS_ADMIN ? `<button class="sk-switch" data-sk-visible="${s.id}"
          title="${s.visible === false ? 'Oculta para los estudiantes: clic para mostrarla' : 'Visible: clic para ocultarla'}">
        <svg class="ico"><use href="#${s.visible === false ? 'i-eye-off' : 'i-eye'}"/></svg>
        ${s.visible === false ? 'Oculta' : 'Visible'}</button>` : ''}
      <div class="sk-body">
        <span class="sk-area">${escapeHtml(s.area)}</span>
        <h3>${escapeHtml(s.title)}</h3>
        <div class="sk-tags">
          <span class="sk-tag is-lvl">${escapeHtml(s.level)}</span>
          ${tagList(s.tags).map(t => `<span class="sk-tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        ${audTagHtml(s)}
      </div>
    </article>`).join('')}</div>`;
}

const tagList = t => (t || '').split(',').map(x => x.trim()).filter(Boolean);

/** Nombre de archivo limpio: sin tildes ni signos, para que baje bien en
    cualquier sistema operativo. */
function slug(texto){
  return (texto || 'skill').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'skill';
}

/** El .md sale con el frontmatter que esperan Claude y los sistemas de skills. */
function skillMarkdown(s){
  return `---
name: ${slug(s.title)}
description: ${(s.objective || s.title).replace(/\n+/g, ' ').trim()}
metadata:
  area: ${s.area}
  nivel: ${s.level}${tagList(s.tags).length ? `
  etiquetas: ${tagList(s.tags).join(', ')}` : ''}
---

# ${s.title}

${s.objective ? `## Objetivo\n\n${s.objective}\n\n` : ''}## Prompt

${s.prompt}
`;
}

function downloadSkill(s){
  const blob = new Blob([skillMarkdown(s)], { type:'text/markdown;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = slug(s.title) + '.md';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openSkill(id){
  const s = skills.find(x => x.id === id); if (!s) return;
  openSkillId = id;
  $('#skNum').textContent   = '#' + skillNum(s);
  $('#skTitle').textContent = s.title;
  $('#skTags').innerHTML =
    `<span class="sk-tag">${escapeHtml(s.area)}</span>
     <span class="sk-tag is-lvl">${escapeHtml(s.level)}</span>` +
    tagList(s.tags).map(t => `<span class="sk-tag">${escapeHtml(t)}</span>`).join('');
  $('#skObjectiveBlock').hidden = !s.objective;
  $('#skObjective').textContent = s.objective || '';
  $('#skPrompt').textContent    = s.prompt || '';
  $('#skAdmin').hidden = !IS_ADMIN;
  $('#skOverlay').hidden = false;
}
const closeSkill = () => { $('#skOverlay').hidden = true; openSkillId = null; };

function openSkillEditor(s = null){
  if (!IS_ADMIN) return;
  editingSkillId = s ? s.id : null;
  $('#skEdTitle').textContent = s ? 'Editar skill' : 'Nueva skill';
  $('#skfArea').innerHTML  = areasCatalogo().map(a => `<option>${escapeHtml(a)}</option>`).join('');
  $('#skfLevel').innerHTML = NIVELES.map(n => `<option>${escapeHtml(n)}</option>`).join('');
  $('#skfTitle').value     = s ? s.title : '';
  $('#skfArea').value      = s ? s.area  : (skillArea === 'todas' ? AREAS[0] : skillArea);
  $('#skfLevel').value     = s ? s.level : NIVELES[0];
  $('#skfTags').value      = s ? s.tags  : '';
  $('#skfObjective').value = s ? s.objective : '';
  $('#skfPrompt').value    = s ? s.prompt : '';
  $('#skfAudiencia').innerHTML = audienciaHtml(s ? audDe(s) : audDefecto());
  $('#skEdMsg').textContent = '';
  $('#skEdOverlay').hidden = false;
  enfocar('#skfTitle');
}
const closeSkillEditor = () => { $('#skEdOverlay').hidden = true; editingSkillId = null; };

/** Lo que ve el estudiante al entrar a una clase que ocultó. */
function hiddenHtml(s){
  const n = posts.filter(p => p.session === s.id).length;
  return `
    <div class="empty">
      <svg class="ico"><use href="#i-eye-off"/></svg>
      <h3>Ocultaste esta clase</h3>
      <p><b>${escapeHtml(s.title)}</b> tiene ${n} ${n === 1 ? 'publicación' : 'publicaciones'}
         que no se muestran mientras esté oculta. Solo cambia lo que ves tú.</p>
      <button class="btn btn-primary" data-show="${s.id}">
        <svg class="ico"><use href="#i-eye"/></svg> Mostrar esta clase
      </button>
    </div>`;
}

function emptyHtml(){
  // Si la clase ya tiene su grabación, el estudiante no necesita el aviso de «sin contenido»
  if (!IS_ADMIN && view.type === 'session' && !query && typeof grabacionesDe === 'function' && grabacionesDe(view.id).length) return '';
  if (query) return `
    <div class="empty">
      <svg class="ico"><use href="#i-search"/></svg>
      <h3>Sin resultados</h3>
      <p>No encontramos publicaciones que coincidan con “${escapeHtml(query)}”.</p>
    </div>`;
  if (view.type === 'faq') return IS_ADMIN ? `
    <div class="empty">
      <svg class="ico"><use href="#i-faq"/></svg>
      <h3>Todavía no hay preguntas</h3>
      <p>Crea la primera con <b>Nueva publicación</b>: el título es la pregunta y el contenido —texto o video— es la respuesta.</p>
      <button class="btn btn-primary" data-open-composer>
        <svg class="ico"><use href="#i-plus"/></svg> Agregar una pregunta
      </button>
    </div>` : `
    <div class="empty">
      <svg class="ico"><use href="#i-faq"/></svg>
      <h3>Todavía no hay preguntas</h3>
      <p>Sé la primera persona en preguntar: escríbela en el formulario de arriba.</p>
    </div>`;
  if (view.type === 'tuto') return IS_ADMIN ? `
    <div class="empty">
      <svg class="ico"><use href="#i-tuto"/></svg>
      <h3>Todavía no hay tutoriales</h3>
      <p>Sube el primero con <b>Nueva publicación</b>: un video corto o los pasos escritos
         para resolver algo puntual.</p>
      <button class="btn btn-primary" data-open-composer>
        <svg class="ico"><use href="#i-plus"/></svg> Subir un tutorial
      </button>
    </div>` : `
    <div class="empty">
      <svg class="ico"><use href="#i-tuto"/></svg>
      <h3>Todavía no hay tutoriales</h3>
      <p>Aquí irán los videos cortos con el paso a paso. Vuelve cuando el equipo suba el primero.</p>
    </div>`;
  if (view.type === 'saved') return `
    <div class="empty">
      <svg class="ico"><use href="#i-bookmark"/></svg>
      <h3>Nada guardado todavía</h3>
      <p>Usa el marcador de una publicación para tenerla a mano aquí.</p>
    </div>`;
  const where = view.type === 'session' ? sessionOf(view.id).title : null;
  if (!IS_ADMIN) return `
    <div class="empty">
      <svg class="ico"><use href="#i-empty"/></svg>
      <h3>Todavía sin contenido</h3>
      <p>${where ? `<b>${escapeHtml(where)}</b> aún no tiene publicaciones.` : 'Aún no hay publicaciones en el muro.'}
         Vuelve cuando el equipo suba el material de la sesión.</p>
    </div>`;
  return `
    <div class="empty">
      <svg class="ico"><use href="#i-empty"/></svg>
      <h3>Aún no hay publicaciones</h3>
      <p>Empieza ${where ? `<b>${escapeHtml(where)}</b>` : 'el muro'} con una nota, el resumen de la clase o un video.</p>
      <button class="btn btn-primary" data-open-composer>
        <svg class="ico"><use href="#i-plus"/></svg> Crear la primera publicación
      </button>
    </div>`;
}

function postHtml(p, i, lista){
  const s = sessionOf(p.session);
  const mine = myReacts(p.id);
  const botones = REACTIONS.map(r => {
    const n = (p.reactions && p.reactions[r.id]) || 0;
    return `<button class="react ${mine.includes(r.id) ? 'is-on' : ''}" data-react="${r.id}" data-id="${p.id}" title="${r.label}">
              <svg class="ico" fill="none" stroke="currentColor" stroke-width="1.7"
                   stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="${r.path}"/></svg>
              ${n > 0 ? `<b>${n}</b>` : ''}
            </button>`;
  }).join('');
  const total = REACTION_IDS.reduce((a,k) => a + ((p.reactions && p.reactions[k]) || 0), 0);
  const guardada = isSaved(p.id);

  return `
  <article class="card post ${p.pinned ? 'is-pinned' : ''}" data-post="${p.id}">
    <div class="post-head">
      <div class="avatar">${escapeHtml(p.initials || ME.initials)}</div>
      <div class="post-meta">
        <div class="post-author">
          ${escapeHtml(p.author || ME.name)}
          <span class="tag"><svg class="ico"><use href="#${s.icon}"/></svg>${escapeHtml(s.short)}</span>
          ${p.pinned ? `<span class="tag tag-pin"><svg class="ico"><use href="#i-pin"/></svg>Destacada</span>` : ''}
          ${audTagHtml(p)}
        </div>
        <div class="post-sub">Publicada en ${escapeHtml(s.title)} · ${timeAgo(p.createdAt)}</div>
      </div>
      <div class="post-actions">
        ${flechasHtml(p, i, lista)}
        <button class="icon-btn" data-copy="${p.id}" title="Copiar el texto">
          <svg class="ico"><use href="#i-copy"/></svg>
        </button>
        <button class="icon-btn" data-save="${p.id}" title="${guardada ? 'Quitar de guardados' : 'Guardar'}"
                style="${guardada ? 'color:var(--pc-blue)' : ''}">
          <svg class="ico" ${guardada ? 'fill="currentColor"' : ''}><use href="#i-bookmark"/></svg>
        </button>
        ${IS_ADMIN ? `<button class="icon-btn" data-menu="${p.id}" title="Editar o eliminar">
          <svg class="ico"><use href="#i-more"/></svg>
        </button>` : ''}
      </div>
    </div>

    ${p.title ? `<h2 class="post-title">${escapeHtml(p.title)}</h2>` : ''}
    <div class="post-body">${renderBody(p.body)}</div>
    ${mediaHtml(p)}

    <div class="reactions">
      ${botones}
      ${total > 0 ? `<span class="react-total">${total} ${total === 1 ? 'reacción' : 'reacciones'}</span>` : ''}
      ${vistoHtml(p)}
    </div>
  </article>`;
}

/** El estudiante marca que ya vio el video: es lo que mide el panel de su empresa. */
function vistoHtml(p){
  if (!PERFIL || !esVideo(p) || APARTE.includes(p.session)) return '';
  const on = vistos.has(p.id);
  return `<button class="visto ${on ? 'is-on' : ''}" data-visto="${p.id}" aria-pressed="${on}"
            title="${on ? 'Quitar la marca de visto' : 'Marca este video cuando lo termines'}">
            <svg class="ico"><use href="#i-check"/></svg>${on ? 'Visto' : 'Marcar como visto'}
          </button>`;
}

async function marcarVisto(id, on){
  if (!PERFIL || vistos.has(id) === on) return;
  on ? vistos.add(id) : vistos.delete(id);
  render();                                   // respuesta inmediata
  try { await store.marcarVisto(id, on); }
  catch (err){ on ? vistos.delete(id) : vistos.add(id); toast(errorMsg(err)); render(); }
}

// Un video subido que se ve hasta el final queda marcado solo
document.addEventListener('ended', e => {
  const card = e.target.closest?.('[data-post]');
  if (card && e.target.tagName === 'VIDEO') marcarVisto(card.dataset.post, true);
}, true);

/** Una pregunta frecuente, en acordeón. La respuesta puede ser texto, video o ambos. */
function faqHtml(p, i, lista){
  const pendiente = sinRespuesta(p);
  return `
  <details class="faq ${pendiente ? 'is-pending' : ''}" data-post="${p.id}">
    <summary>
      <span class="faq-q">
        ${escapeHtml(p.title || 'Pregunta sin título')}
        ${pendiente ? `<span class="faq-badge">Sin responder</span>` : ''}
        ${audTagHtml(p)}
      </span>
      ${pendiente && IS_ADMIN ? `<button class="btn btn-primary faq-reply" data-responder="${p.id}">
        <svg class="ico"><use href="#i-edit"/></svg> Responder
      </button>` : ''}
      <span class="faq-tools">
        ${flechasHtml(p, i, lista)}
        <button class="icon-btn" data-copy="${p.id}" title="${pendiente ? 'Copiar la pregunta' : 'Copiar la respuesta'}">
          <svg class="ico"><use href="#i-copy"/></svg>
        </button>
        ${IS_ADMIN ? `<button class="icon-btn" data-menu="${p.id}" title="Más opciones">
          <svg class="ico"><use href="#i-more"/></svg>
        </button>` : ''}
      </span>
      <span class="faq-caret"><svg class="ico"><use href="#i-plus"/></svg></span>
    </summary>
    <div class="faq-body">
      ${pendiente
        ? `<p class="faq-pending-note">${IS_ADMIN
            ? 'Una persona del grupo dejó esta pregunta. Respóndela con <b>Responder</b>: el título queda como la pregunta.'
            : 'El equipo todavía no la responde. Cuando lo haga, la respuesta aparece aquí.'}</p>`
        : `<div class="post-body">${renderBody(p.body)}</div>
           ${mediaHtml(p)}`}
    </div>
  </details>`;
}

/* ================================================================
   Quizzes: lista, responder, resultado, estadística y editor
   ================================================================ */
const pct = (parte, total) => total ? Math.round(parte / total * 100) : 0;

function quizHtml(){
  if (quizVista === 'responder') return quizResponderHtml();
  if (quizVista === 'resultado') return quizResultadoHtml();
  if (quizVista === 'stats')     return quizStatsHtml();
  if (quizVista === 'editar')    return quizEditorHtml();
  return quizListaHtml();
}

function quizListaHtml(){
  // Si la base todavía no tiene los quizzes (falta el SQL), se dice en vez de mostrar "vacío"
  if (quizFalla && !quizzes.length) return `
    <div class="empty">
      <svg class="ico"><use href="#i-quiz"/></svg>
      <h3>Los quizzes no están disponibles</h3>
      <p>${escapeHtml(quizFalla)}</p>
    </div>`;

  if (!quizzes.length) return `
    <div class="empty">
      <svg class="ico"><use href="#i-quiz"/></svg>
      <h3>Todavía no hay quizzes</h3>
      <p>${IS_ADMIN
        ? 'Los cuatro quizzes ya existen en la base: ábrelos con <b>Editar</b>, escribe las preguntas y actívalos.'
        : 'Cuando el equipo publique el primero, aparece aquí.'}</p>
    </div>`;

  const tarjetas = vis(quizzes).map(q => {
    const stat = estadisticas.find(s => s.id === q.id);
    const preguntas = IS_ADMIN ? (q.preguntas || []).length : q.preguntas;
    const listo = preguntas > 0;
    return `
    <article class="quiz-card" data-quiz="${q.id}">
      <div class="quiz-card-top">
        <h3>${escapeHtml(q.titulo || q.id)}</h3>
        ${IS_ADMIN ? `<span class="quiz-estado ${q.activo ? 'is-on' : ''}">${q.activo ? 'Publicado' : 'Borrador'}</span>` : ''}
      </div>
      ${q.descripcion ? `<p class="quiz-desc">${escapeHtml(q.descripcion)}</p>` : ''}
      ${audTagHtml(q) ? `<div>${audTagHtml(q)}</div>` : ''}
      <p class="quiz-meta">${preguntas} ${preguntas === 1 ? 'pregunta' : 'preguntas'}${
        IS_ADMIN && stat ? ` · ${stat.personas} ${stat.personas === 1 ? 'persona respondió' : 'personas respondieron'}` : ''}</p>
      ${IS_ADMIN && stat && stat.personas ? `
        <div class="quiz-barra"><i style="width:${pct(stat.aciertos, stat.respondidas)}%"></i></div>
        <p class="quiz-meta"><b>${pct(stat.aciertos, stat.respondidas)}%</b> de aciertos en el grupo</p>` : ''}
      <div class="quiz-acciones">
        ${IS_ADMIN
          ? `<button class="btn" data-quiz-editar="${q.id}"><svg class="ico"><use href="#i-edit"/></svg> Editar</button>
             <button class="btn" data-quiz-stats="${q.id}"><svg class="ico"><use href="#i-quiz"/></svg> Estadística</button>`
          : `<button class="btn btn-primary" data-quiz-abrir="${q.id}" ${listo ? '' : 'disabled'}>Responder</button>`}
      </div>
    </article>`;
  }).join('');

  const resumen = IS_ADMIN ? statsResumenHtml() : '';
  return `${resumen}<div class="quiz-grid">${tarjetas}</div>`;
}

/** Resumen de todos los quizzes, arriba de la lista del admin. */
function statsResumenHtml(){
  const conDatos = estadisticas.filter(s => s.personas);
  const aciertos = conDatos.reduce((a,s) => a + s.aciertos, 0);
  const respondidas = conDatos.reduce((a,s) => a + s.respondidas, 0);
  const personas = new Set();
  conDatos.forEach(s => (s.intentos || []).forEach(i => personas.add((i.persona || i.nombre || '').toLowerCase())));
  return `
    <div class="card quiz-resumen">
      <h3>Cómo va el grupo</h3>
      ${respondidas ? `
        <div class="quiz-cifras">
          <div><b>${pct(aciertos, respondidas)}%</b><span>de aciertos en total</span></div>
          <div><b>${personas.size}</b><span>${personas.size === 1 ? 'persona ha respondido' : 'personas han respondido'}</span></div>
          <div><b>${conDatos.length} de ${estadisticas.length}</b><span>quizzes con respuestas</span></div>
        </div>`
        : `<p class="quiz-desc">Todavía nadie ha respondido. Cuando lo hagan, aquí verás el promedio de aciertos.</p>`}
    </div>`;
}

function quizResponderHtml(){
  const q = quizAbierto;
  const preguntas = q.preguntas.map((p, i) => `
    <li class="quiz-pregunta">
      <p class="quiz-enunciado"><span>${i + 1}</span>${escapeHtml(p.text)}</p>
      <div class="quiz-opciones">
        ${p.options.map((o, j) => `
          <label class="quiz-opcion ${quizElegidas[i] === j ? 'is-on' : ''}">
            <input type="radio" name="p${i}" value="${j}" data-quiz-opcion="${i}" ${quizElegidas[i] === j ? 'checked' : ''}>
            <span>${escapeHtml(o)}</span>
          </label>`).join('')}
      </div>
    </li>`).join('');

  const faltan = q.preguntas.length - quizElegidas.filter(x => x !== null && x !== undefined).length;
  return `
    <div class="card quiz-responder">
      <button class="btn quiz-volver" data-quiz-volver>← ${quizDesde ? 'Volver a la clase' : 'Volver a los quizzes'}</button>
      <h2 class="quiz-titulo">${escapeHtml(q.titulo)}</h2>
      ${q.descripcion ? `<p class="quiz-desc">${escapeHtml(q.descripcion)}</p>` : ''}
      <ol class="quiz-lista">${preguntas}</ol>
      <div class="quiz-enviar">
        <span class="quiz-meta">${faltan ? `Te faltan ${faltan} ${faltan === 1 ? 'pregunta' : 'preguntas'}` : 'Ya respondiste todas'}</span>
        <button class="btn btn-primary" data-quiz-enviar ${faltan ? 'disabled' : ''}>Enviar respuestas</button>
      </div>
      <p class="quiz-msg" id="quizMsg"></p>
    </div>`;
}

function quizResultadoHtml(){
  const q = quizAbierto, r = quizResultado;
  const porcentaje = pct(r.puntaje, r.total);
  const detalle = q.preguntas.map((p, i) => {
    const bien = r.aciertos[i] === 1;
    const elegida = quizElegidas[i];
    return `
      <li class="quiz-pregunta ${bien ? 'is-bien' : 'is-mal'}">
        <p class="quiz-enunciado"><span>${i + 1}</span>${escapeHtml(p.text)}</p>
        <p class="quiz-respuesta">
          <b>${bien ? 'Correcto' : 'Incorrecto'}:</b>
          ${elegida === null || elegida === undefined ? 'no respondiste' : escapeHtml(p.options[elegida])}
        </p>
        ${bien ? '' : `<p class="quiz-respuesta quiz-correcta">La correcta era: ${escapeHtml(p.options[r.correctas[i]])}</p>`}
      </li>`;
  }).join('');

  return `
    <div class="card quiz-responder">
      <button class="btn quiz-volver" data-quiz-volver>← ${quizDesde ? 'Volver a la clase' : 'Volver a los quizzes'}</button>
      <div class="quiz-puntaje">
        <b>${r.puntaje} de ${r.total}</b>
        <span>${porcentaje}% de aciertos${typeof r.aprobado === 'boolean'
          ? ` · <strong class="${r.aprobado ? 'q-ok' : 'q-no'}">${r.aprobado ? '¡Aprobado!' : `Necesitas ${r.aprobar}% para aprobar`}</strong>` : ''}</span>
        <div class="quiz-barra"><i style="width:${porcentaje}%"></i></div>
      </div>
      <h2 class="quiz-titulo">${escapeHtml(q.titulo)}</h2>
      <ol class="quiz-lista">${detalle}</ol>
      <div class="quiz-enviar">
        ${(() => {
          const quedan = r.intentos > 0 ? r.intentos - (r.usados || 0) : Infinity;
          if (quedan <= 0) return `<span class="quiz-meta">Ya usaste tus ${r.intentos} intentos.</span><span></span>`;
          return `<span class="quiz-meta">${quedan === Infinity ? 'Puedes repetirlo cuando quieras.'
                    : `Te ${quedan === 1 ? 'queda 1 intento' : `quedan ${quedan} intentos`}.`}</span>
                  <button class="btn btn-primary" data-quiz-abrir="${q.id}">Repetir el quiz</button>`;
        })()}
      </div>
    </div>`;
}

function quizStatsHtml(){
  const stat = estadisticas.find(s => s.id === quizAbierto) || {};
  const quiz = quizzes.find(q => q.id === quizAbierto) || {};
  const preguntas = quiz.preguntas || [];
  const detalle = stat.detalle || [];

  const porPregunta = preguntas.map((p, i) => {
    const conDato = detalle.filter(d => d[i] !== undefined);
    const ok = conDato.filter(d => d[i] === 1).length;
    const porcentaje = pct(ok, conDato.length);
    return `
      <li class="quiz-pregunta">
        <p class="quiz-enunciado"><span>${i + 1}</span>${escapeHtml(p.text)}</p>
        <div class="quiz-barra ${porcentaje < 50 ? 'is-baja' : ''}"><i style="width:${porcentaje}%"></i></div>
        <p class="quiz-meta">${porcentaje}% acertó · ${ok} de ${conDato.length}</p>
      </li>`;
  }).join('');

  const intentos = (stat.intentos || []).map(i => `
    <tr><td>${escapeHtml(i.nombre)}${i.persona && i.persona !== (i.nombre || '').toLowerCase()
          ? `<small class="celda-sub">${escapeHtml(i.persona)}</small>` : ''}</td><td>${i.puntaje} de ${i.total}</td>
        <td>${pct(i.puntaje, i.total)}%</td><td>${timeAgo(new Date(i.fecha).getTime())}</td>
        <td class="quiz-borrar-celda">
          <button class="icon-btn" data-quiz-borrar-persona="${escapeHtml(i.persona || i.nombre)}"
                  title="Quitar a ${escapeHtml(i.nombre)} de la estadística"
                  aria-label="Quitar a ${escapeHtml(i.nombre)}">
            <svg class="ico"><use href="#i-trash"/></svg>
          </button>
        </td></tr>`).join('');

  return `
    <div class="card quiz-responder">
      <button class="btn quiz-volver" data-quiz-volver>← ${quizDesde ? 'Volver a la clase' : 'Volver a los quizzes'}</button>
      <h2 class="quiz-titulo">${escapeHtml(quiz.titulo || '')}</h2>
      ${stat.personas ? `
        <div class="quiz-cifras">
          <div><b>${pct(stat.aciertos, stat.respondidas)}%</b><span>de aciertos</span></div>
          <div><b>${stat.personas}</b><span>${stat.personas === 1 ? 'persona' : 'personas'}</span></div>
          <div><b>${preguntas.length}</b><span>${preguntas.length === 1 ? 'pregunta' : 'preguntas'}</span></div>
        </div>
        <h3 class="quiz-sub">Acierto por pregunta</h3>
        <ol class="quiz-lista">${porPregunta}</ol>
        <h3 class="quiz-sub">Quién respondió</h3>
        <div class="quiz-tabla">
          <table><thead><tr><th>Nombre</th><th>Puntaje</th><th>%</th><th>Cuándo</th><th></th></tr></thead>
          <tbody>${intentos}</tbody></table>
        </div>
        <button class="btn quiz-vaciar" data-quiz-vaciar>Borrar todas las respuestas de este quiz</button>
        <p class="quiz-nota">Solo borra las respuestas; las preguntas del quiz quedan como están.</p>`
        : `<p class="quiz-desc">Nadie ha respondido este quiz todavía.</p>`}
    </div>`;
}

function quizEditorHtml(){
  const q = quizEditando;
  const preguntas = q.preguntas.map((p, i) => `
    <li class="quiz-pregunta">
      <div class="quiz-pregunta-head">
        <span class="quiz-num">${i + 1}</span>
        <button class="icon-btn" data-quiz-borrar-p="${i}" title="Quitar esta pregunta">
          <svg class="ico"><use href="#i-trash"/></svg>
        </button>
      </div>
      <label class="field">
        <span>Pregunta</span>
        <input type="text" data-quiz-texto="${i}" maxlength="300" value="${escapeHtml(p.text)}" placeholder="¿Qué quieres preguntar?" />
      </label>
      <div class="quiz-opciones-edit">
        ${p.options.map((o, j) => `
          <label class="quiz-opcion-edit ${p.correctIndex === j ? 'is-on' : ''}">
            <input type="radio" name="c${i}" data-quiz-correcta="${i}" value="${j}" ${p.correctIndex === j ? 'checked' : ''}
                   title="Marcar como correcta" />
            <input type="text" data-quiz-opcion-edit="${i}-${j}" maxlength="200"
                   value="${escapeHtml(o)}" placeholder="Opción ${j + 1}" />
            ${p.options.length > 2 ? `<button class="icon-btn" data-quiz-borrar-o="${i}-${j}" title="Quitar opción">
              <svg class="ico"><use href="#i-close"/></svg></button>` : ''}
          </label>`).join('')}
        ${p.options.length < 4 ? `<button class="btn quiz-mini" data-quiz-add-o="${i}">Agregar opción</button>` : ''}
      </div>
      <p class="quiz-meta">Marca el círculo de la respuesta correcta.</p>
    </li>`).join('');

  return `
    <div class="card quiz-responder">
      <button class="btn quiz-volver" data-quiz-volver>← ${quizDesde ? 'Volver a la clase' : 'Volver a los quizzes'}</button>
      <h2 class="quiz-titulo">${q.sesion_id ? `Quiz de ${escapeHtml(sessionOf(q.sesion_id).title)}` : `Editar el quiz ${q.orden || ''}`}</h2>
      <label class="field"><span>Título</span>
        <input type="text" id="quizTitulo" maxlength="150" value="${escapeHtml(q.titulo)}" placeholder="Ej. Quiz 1 · Funnel inteligente con IA" />
      </label>
      <label class="field"><span>Descripción</span>
        <input type="text" id="quizDesc" maxlength="200" value="${escapeHtml(q.descripcion)}" placeholder="Una línea sobre qué evalúa" />
      </label>
      <label class="check quiz-activo">
        <input type="checkbox" id="quizActivo" ${q.activo ? 'checked' : ''} />
        <span>Publicado: los estudiantes lo ven y pueden responderlo</span>
      </label>
      ${q.sesion_id ? `
      <div class="quiz-reglas">
        <label class="field"><span>% para aprobar</span>
          <input type="number" id="quizAprobar" min="0" max="100" value="${q.aprobar ?? 70}" /></label>
        <label class="field"><span>Intentos por persona</span>
          <input type="number" id="quizIntentos" min="0" max="50" value="${q.intentos ?? 0}" />
          <small>0 = sin límite</small></label>
        <label class="check quiz-oblig">
          <input type="checkbox" id="quizOblig" ${q.obligatorio ? 'checked' : ''} />
          <span>Obligatorio: cuenta para completar la clase</span>
        </label>
      </div>` : ''}
      <div class="field quiz-aud">
        <span>¿Quién lo ve?</span>
        <div class="aud" id="quizAud">${audienciaHtml(audDe(q))}</div>
      </div>
      <ol class="quiz-lista">${preguntas}</ol>
      <button class="btn quiz-mini" data-quiz-add-p>+ Agregar pregunta</button>
      <div class="quiz-enviar">
        <span class="quiz-msg" id="quizMsg"></span>
        <button class="btn btn-primary" data-quiz-guardar>Guardar quiz</button>
      </div>
    </div>`;
}

/** Formulario para que un estudiante deje su pregunta (en la columna derecha y arriba de las FAQ). */
function preguntaFormHtml(lugar){
  return `
  <form class="pregunta ${lugar === 'faq' ? 'card pregunta-faq' : ''}" data-pregunta novalidate>
    <div class="pregunta-head">
      <span class="pregunta-ico"><svg class="ico"><use href="#i-faq"/></svg></span>
      <div>
        <h3>¿Tienes una <span class="u-mark">pregunta</span>?</h3>
        <p>Escríbela y aparece de una vez en <b>Preguntas frecuentes</b>. El equipo la responde ahí.</p>
      </div>
    </div>
    <label class="sr-only" for="pregunta-${lugar}">Tu pregunta</label>
    <textarea id="pregunta-${lugar}" rows="3" maxlength="${PREGUNTA_MAX}"
              placeholder="Ej. ¿Puedo usar Claude gratis durante el programa?">${escapeHtml(borrador)}</textarea>
    <div class="pregunta-foot">
      <span class="pregunta-cuenta" data-cuenta>${borrador.length}/${PREGUNTA_MAX}</span>
      <button class="btn btn-primary" type="submit">Enviar pregunta</button>
    </div>
    <p class="pregunta-msg" data-msg role="status"></p>
  </form>`;
}

/** En la columna derecha, el admin ve cuántas preguntas esperan respuesta. */
function railAdminHtml(pendientes){
  return `
    <div class="pregunta-head">
      <span class="pregunta-ico"><svg class="ico"><use href="#i-faq"/></svg></span>
      <div>
        <h3>Preguntas de la comunidad</h3>
        <p>${pendientes
          ? `<b>${pendientes}</b> ${pendientes === 1 ? 'pregunta espera' : 'preguntas esperan'} tu respuesta.`
          : 'No hay preguntas pendientes. Cuando alguien pregunte, aparece aquí.'}</p>
      </div>
    </div>
    <button class="btn ${pendientes ? 'btn-primary' : ''} pregunta-ir" data-ir-faq>
      ${pendientes ? 'Responder ahora' : 'Ver preguntas frecuentes'}
    </button>`;
}

/** Abre y resalta una pregunta frecuente en la lista. */
function resaltarFaq(id){
  const el = $(`details.faq[data-post="${id}"]`); if (!el) return;
  el.open = true;
  el.scrollIntoView({ behavior:'smooth', block:'center' });
  el.classList.remove('is-new'); void el.offsetWidth; el.classList.add('is-new');
}

function mediaHtml(p){
  if (p.videoUrl){
    const embed = toEmbed(p.videoUrl);
    if (embed) return `<div class="post-media"><iframe src="${escapeHtml(embed)}" allowfullscreen
        allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"></iframe></div>`;
    if (esPdf(p)) return pdfHtml(p.videoUrl, p.videoName);
    if (esImagen(p)) return `<div class="post-media es-imagen">
      <img src="${escapeHtml(p.videoUrl)}" alt="${escapeHtml(p.videoName || 'Imagen de la publicación')}" loading="lazy" /></div>`;
    return `<div class="post-media"><video src="${escapeHtml(p.videoUrl)}" controls playsinline preload="metadata"></video></div>`;
  }
  if (p.videoId) return `<div class="post-media" data-video="${p.id}"></div>`;
  return '';
}

async function hydrateVideo(p){
  const holder = $(`[data-video="${p.id}"]`); if (!holder) return;
  const url = await store.blobUrl(p.videoId); if (!url) return;
  objectUrls.push(url);
  if (esPdf(p)){ holder.outerHTML = pdfHtml(url, p.videoName); return; }
  holder.innerHTML = esImagen(p)
    ? `<img src="${url}" alt="${escapeHtml(p.videoName || 'Imagen de la publicación')}" />`
    : `<video src="${url}" controls playsinline preload="metadata"></video>`;
  holder.classList.toggle('es-imagen', esImagen(p));
}

/* ================================================================
   Interacciones del muro
   ================================================================ */
$('#posts').addEventListener('click', async e => {
  if (e.target.closest('[data-open-composer]')) return openComposer();
  if (e.target.closest('[data-new-skill]')) return openSkillEditor();

  const mover = e.target.closest('[data-mover]');
  if (mover){
    e.preventDefault();              // en las preguntas está dentro del summary
    if (!mover.disabled) await moverPost(mover.dataset.id, Number(mover.dataset.mover));
    return;
  }

  const responder = e.target.closest('[data-responder]');
  if (responder){
    e.preventDefault();              // está dentro del summary: que no abra ni cierre el acordeón
    const p = posts.find(x => x.id === responder.dataset.responder);
    if (p) openComposer(p);
    return;
  }

  const mostrar = e.target.closest('[data-show]');
  if (mostrar){
    const id = mostrar.dataset.show;
    if (id === 'todas') SESSIONS.forEach(s => setHidden(s.id, false));
    else setHidden(id, false);
    render();
    return;
  }

  const sw = e.target.closest('[data-sk-visible]');
  if (sw) return cambiarVisibleSkill(sw.dataset.skVisible);

  const card = e.target.closest('[data-skill]');
  if (card) return openSkill(card.dataset.skill);

  const visto = e.target.closest('[data-visto]');
  if (visto) return marcarVisto(visto.dataset.visto, !vistos.has(visto.dataset.visto));

  const react = e.target.closest('[data-react]');
  if (react){
    const p = posts.find(x => x.id === react.dataset.id); if (!p) return;
    const key = react.dataset.react;
    const on  = !myReacts(p.id).includes(key);
    markReacted(p.id, key, on);
    render();                                   // respuesta inmediata
    try { await store.react(p, key, on ? 1 : -1); }
    catch (err){ markReacted(p.id, key, !on); toast(errorMsg(err)); }
    render();
    return;
  }

  const copiar = e.target.closest('[data-copy]');
  if (copiar){
    e.preventDefault();
    const p = posts.find(x => x.id === copiar.dataset.copy); if (!p) return;
    const partes = [p.title, p.body, p.videoUrl].filter(Boolean);
    try {
      await navigator.clipboard.writeText(partes.join(String.fromCharCode(10,10)));
      toast('Texto copiado');
    } catch { toast('El navegador no dejó copiar'); }
    return;
  }

  const save = e.target.closest('[data-save]');
  if (save){
    toggleSaved(save.dataset.save);
    toast(isSaved(save.dataset.save) ? 'Guardada' : 'Quitada de guardados');
    render(); return;
  }

  const menuBtn = e.target.closest('[data-menu]');
  if (menuBtn){ e.preventDefault(); openMenu(menuBtn); }
});

function openMenu(btn){
  closeMenus();
  const p = posts.find(x => x.id === btn.dataset.menu);
  const el = document.createElement('div');
  el.className = 'menu';
  el.innerHTML = `
    <button data-act="edit"><svg class="ico"><use href="#i-edit"/></svg>Editar</button>
    <button data-act="pin"><svg class="ico"><use href="#i-pin"/></svg>${p.pinned ? 'Quitar destaque' : 'Destacar'}</button>
    <button data-act="del" class="danger"><svg class="ico"><use href="#i-trash"/></svg>Eliminar</button>`;
  btn.parentElement.appendChild(el);

  el.addEventListener('click', async ev => {
    ev.preventDefault();   // dentro de un recurso, el menú no abre ni cierra el desplegable
    const act = ev.target.closest('button')?.dataset.act; if (!act) return;
    closeMenus();
    if (act === 'edit') return openComposer(p);
    if (act === 'pin'){
      p.pinned = !p.pinned;
      try { await store.save(p); } catch (err){ p.pinned = !p.pinned; toast(errorMsg(err)); }
      render(); return;
    }
    if (act === 'del'){
      if (!(await confirmar({ titulo:'¿Eliminar esta publicación?', texto:'Se borra con su archivo adjunto. No se puede deshacer.', boton:'Eliminar' }))) return;
      try {
        await store.remove(p);
        posts = posts.filter(x => x.id !== p.id);
        toast('Publicación eliminada');
      } catch (err){ toast(errorMsg(err)); }
      render();
    }
  });
}
function closeMenus(){ $$('.menu').forEach(m => m.remove()); }
document.addEventListener('click', e => {
  if (!e.target.closest('.post-actions, .faq-tools')) closeMenus();
});

/* ================================================================
   Modal / composer
   ================================================================ */
function openComposer(post = null){
  if (!IS_ADMIN) return;
  editingId = post ? post.id : null;
  removeExistingVideo = false;
  pendingFile = null;

  const responder = !!(post && sinRespuesta(post));
  $('#modalTitle').textContent = responder ? 'Responder pregunta' : post ? 'Editar publicación' : 'Nueva publicación';
  $('#btnPublish').textContent = responder ? 'Publicar respuesta' : post ? 'Guardar cambios' : 'Publicar';
  $('#fSession').value  = post ? post.session
    : view.type === 'faq'     ? FAQ_ID
    : view.type === 'tuto'    ? TUTO_ID
    : view.type === 'session' ? view.id
    : SESSIONS[0].id;
  $('#fTitle').value    = post ? (post.title || '') : '';
  $('#fBody').value     = post ? (post.body  || '') : '';
  $('#fPinned').checked = post ? !!post.pinned : false;
  $('#fAudiencia').innerHTML = audienciaHtml(post ? audDe(post) : audDefecto());
  $('#modalMsg').textContent = '';

  // un enlace embebible va en la pestaña "Enlace"; un archivo subido, en "Subir"
  const esEnlace = !!(post && post.videoUrl && toEmbed(post.videoUrl));
  $('#fUrl').value = esEnlace ? post.videoUrl : '';
  setTab(esEnlace ? 'url' : 'file');

  if (post && (post.videoPath || post.videoId)) showFileChip(post.videoName || 'Archivo adjunto');
  else { $('#fileChip').hidden = true; $('#dropzone').hidden = false; }

  $('#overlay').hidden = false;
  enfocar('#fTitle');
}
function closeComposer(){
  $('#overlay').hidden = true;
  $('#fFile').value = '';
  pendingFile = null; editingId = null;
}

function setTab(name){
  $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.tab === name));
  $$('.tabpane').forEach(p => { p.hidden = p.dataset.pane !== name; });
}
$$('.tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));

function showFileChip(name){
  $('#fileName').textContent = name;
  $('#fileChip').hidden = false;
  $('#dropzone').hidden = true;
}

const dz = $('#dropzone');
dz.addEventListener('click', () => $('#fFile').click());
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('is-over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('is-over'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('is-over');
  const f = e.dataTransfer.files[0]; if (f) acceptFile(f);
});
$('#fFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) acceptFile(f); });
$('#fileClear').addEventListener('click', () => {
  pendingFile = null; removeExistingVideo = true;
  $('#fFile').value = '';
  $('#fileChip').hidden = true; $('#dropzone').hidden = false;
});

function acceptFile(f){
  const imagen = f.type.startsWith('image/');
  const pdf    = f.type === 'application/pdf' || RE_PDF.test(f.name);
  if (!imagen && !pdf && !f.type.startsWith('video/')) return toast('Adjunta un video, una imagen o un PDF');
  const tope = pdf ? MAX_PDF_MB : imagen ? MAX_IMAGE_MB : MAX_VIDEO_MB;
  if (f.size > tope * 1048576) return toast(`El archivo supera ${tope} MB`);
  pendingFile = f; removeExistingVideo = false;
  showFileChip(`${f.name} · ${(f.size / 1048576).toFixed(1)} MB`);
}

$$('.editor-tools [data-fmt]').forEach(b => b.addEventListener('click', () => {
  const ta = $('#fBody');
  const { selectionStart:a, selectionEnd:z, value:v } = ta;
  if (b.dataset.fmt === 'bold'){
    const sel = v.slice(a, z) || 'texto';
    ta.value = v.slice(0, a) + '**' + sel + '**' + v.slice(z);
    ta.setSelectionRange(a + 2, a + 2 + sel.length);
  } else {
    const start = v.lastIndexOf('\n', a - 1) + 1;
    ta.value = v.slice(0, start) + '> ' + v.slice(start);
    ta.setSelectionRange(a + 2, z + 2);
  }
  ta.focus();
}));

$('#btnPublish').addEventListener('click', async () => {
  const title = $('#fTitle').value.trim();
  const body  = $('#fBody').value.trim();
  const url   = enlace($('#fUrl').value);
  const usingUrl = $('.tab.is-active').dataset.tab === 'url';

  if (!title && !body && !pendingFile && !(usingUrl && url))
    return void ($('#modalMsg').textContent = 'Añade al menos un título, un texto o un video.');

  const existing = editingId ? posts.find(p => p.id === editingId) : null;
  const p = existing
    ? { ...existing }
    : { id:uid(), author:ME.name, initials:ME.initials, createdAt:Date.now(), reactions:{} };

  p.session = $('#fSession').value;
  p.title   = title;
  p.body    = body;
  p.pinned  = $('#fPinned').checked;
  p.audiencia = leerAudiencia($('#fAudiencia'));

  const btn = $('#btnPublish');
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = pendingFile ? 'Subiendo video…' : 'Guardando…';
  $('#modalMsg').textContent = '';

  try {
    if (usingUrl){
      if (p.videoPath || p.videoId) await store.deleteVideo(p);
      p.videoUrl = url || null;
    } else if (pendingFile){
      if (p.videoPath || p.videoId) await store.deleteVideo(p);
      await store.uploadVideo(p, pendingFile);
    } else if (removeExistingVideo){
      await store.deleteVideo(p);
      p.videoUrl = null;
    }

    await store.save(p);

    if (existing) posts = posts.map(x => x.id === p.id ? p : x);
    else posts.unshift(p);

    closeComposer();
    toast(!alcance(p)
      ? `Publicada solo para ${audienciaTxt(audDe(p))}: la ves en su espacio de trabajo`
      : existing ? 'Publicación actualizada' : 'Publicación creada');
    // Se va a la sección donde quedó la publicación (una clase, Tutoriales o Preguntas)
    const destino = vistaDe(p.session);
    if (view.type !== destino.type || (destino.id && view.id !== destino.id)) setView(destino.type, destino.id);
    else render();
  } catch (err){
    console.error(err);
    $('#modalMsg').textContent = errorMsg(err);
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
});

/* ---------- Ficha de la skill ---------- */
$('#skClose').addEventListener('click', closeSkill);
$('#skOverlay').addEventListener('click', e => { if (e.target.id === 'skOverlay') closeSkill(); });

$('#skDownload').addEventListener('click', () => {
  const s = skills.find(x => x.id === openSkillId); if (!s) return;
  downloadSkill(s);
  toast('Descargando ' + slug(s.title) + '.md');
});

$('#skCopy').addEventListener('click', async () => {
  const s = skills.find(x => x.id === openSkillId); if (!s) return;
  try { await navigator.clipboard.writeText(s.prompt); toast('Prompt copiado'); }
  catch { toast('Tu navegador bloqueó el portapapeles: selecciona y copia a mano'); }
});

$('#skEdit').addEventListener('click', () => {
  const s = skills.find(x => x.id === openSkillId); if (!s) return;
  closeSkill();
  openSkillEditor(s);
});

$('#skDelete').addEventListener('click', async () => {
  const s = skills.find(x => x.id === openSkillId); if (!s) return;
  if (!(await confirmar({ titulo:`¿Eliminar «${s.title}»?`, texto:'El prompt sale del catálogo de todas las empresas. No se puede deshacer.', boton:'Eliminar' }))) return;
  try {
    await store.removeSkill(s);
    skills = skills.filter(x => x.id !== s.id);
    closeSkill();
    toast('Skill eliminada');
    render();
  } catch (err){ toast(errorMsg(err)); }
});

/* ---------- Editor de skills ---------- */
$('#skEdClose').addEventListener('click', closeSkillEditor);
$('#skEdCancel').addEventListener('click', closeSkillEditor);
$('#skEdOverlay').addEventListener('click', e => { if (e.target.id === 'skEdOverlay') closeSkillEditor(); });

/* ---------- Prender y apagar skills (admin) ---------- */
async function cambiarVisibleSkill(id){
  const s = skills.find(x => x.id === id); if (!s || !IS_ADMIN) return;
  const nueva = { ...s, visible:s.visible === false, cambioVisible:true };
  try {
    await store.saveSkill(nueva);
    delete nueva.cambioVisible;
    skills = skills.map(x => x.id === id ? nueva : x);
    toast(nueva.visible ? 'La skill ya se ve en el catálogo' : 'Skill oculta: los estudiantes ya no la ven');
    render();
  } catch (err){
    console.error(err);
    toast(/visible/i.test(err?.message || '')
      ? 'Falta correr supabase-skills-visibles.sql en Supabase' : errorMsg(err));
  }
}

/* ---------- Subir la skill en .md ---------- */
const sinTildes = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
/** Busca el valor en la lista sin importar tildes ni mayúsculas. */
const deLista = (lista, valor) => lista.find(x => sinTildes(x) === sinTildes(valor)) || null;

/** Lee un .md de skill: el que descarga el muro o un SKILL.md cualquiera.
    Frontmatter (name, description, area, nivel, etiquetas), # Título,
    ## Objetivo y ## Prompt. Si no hay ## Prompt, el prompt es todo el cuerpo. */
function leerSkillMd(texto, archivo = ''){
  texto = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const meta = {};
  const fm = texto.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm){
    fm[1].split('\n').forEach(l => {
      const m = l.match(/^\s*([\w-]+)\s*:\s*(.*)$/);
      if (m && m[2].trim()) meta[m[1].toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, '');
    });
    texto = texto.slice(fm[0].length);
  }
  let cuerpo = texto.trim();

  let title = '';
  const h1 = cuerpo.match(/^#\s+(.+)\n*/);
  if (h1){ title = h1[1].trim(); cuerpo = cuerpo.slice(h1[0].length).trim(); }

  // Secciones de segundo nivel por nombre, sin tildes
  const seccion = nombre => {
    const re = new RegExp(`^##\\s+${nombre}\\s*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'mi');
    const m = cuerpo.match(re);
    return m ? { todo:m[0], texto:m[1].trim() } : null;
  };
  const obj = seccion('objetivo');
  const pr  = seccion('prompt');

  const deNombre = n => n.replace(/\.(md|markdown|txt)$/i, '').replace(/[-_]+/g, ' ').trim()
                         .replace(/^./, c => c.toUpperCase());
  const etiquetas = meta.etiquetas || meta.tags || '';
  return {
    title:     title || (meta.name ? deNombre(meta.name) : deNombre(archivo)),
    area:      deLista(areasCatalogo(), meta.area),
    level:     deLista(NIVELES, meta.nivel || meta.level),
    tags:      etiquetas.replace(/^\[|\]$/g, '').split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean).join(', '),
    objective: obj ? obj.texto : (meta.description || ''),
    prompt:    pr ? pr.texto : (obj ? cuerpo.replace(obj.todo, '') : cuerpo).trim(),
  };
}

async function cargarSkillMd(file){
  if (!file) return;
  if (!/\.(md|markdown|txt)$/i.test(file.name))
    return void ($('#skEdMsg').textContent = 'Ese archivo no es .md.');
  const s = leerSkillMd(await file.text(), file.name);
  if (!s.prompt) return void ($('#skEdMsg').textContent = 'El archivo está vacío.');
  $('#skfTitle').value     = s.title;
  if (s.area)  $('#skfArea').value  = s.area;
  if (s.level) $('#skfLevel').value = s.level;
  $('#skfTags').value      = s.tags;
  $('#skfObjective').value = s.objective;
  $('#skfPrompt').value    = s.prompt;
  // Si el área del archivo no está en la lista, se avisa para elegirla a mano
  $('#skEdMsg').textContent = s.area ? '' : 'Revisa el área: el archivo no trae una de la lista.';
  toast('Skill cargada desde ' + file.name + '. Revisa y guarda.');
}

const skDrop = $('#skDrop');
skDrop.addEventListener('click', () => $('#skFile').click());
$('#skFile').addEventListener('change', e => { cargarSkillMd(e.target.files[0]); e.target.value = ''; });
skDrop.addEventListener('dragover', e => { e.preventDefault(); skDrop.classList.add('is-over'); });
skDrop.addEventListener('dragleave', () => skDrop.classList.remove('is-over'));
skDrop.addEventListener('drop', e => {
  e.preventDefault(); skDrop.classList.remove('is-over');
  cargarSkillMd(e.dataTransfer.files[0]);
});

$('#skEdSave').addEventListener('click', async () => {
  const title  = $('#skfTitle').value.trim();
  const prompt = $('#skfPrompt').value.trim();
  if (!title)  return void ($('#skEdMsg').textContent = 'Ponle un nombre a la skill.');
  if (!prompt) return void ($('#skEdMsg').textContent = 'Falta el prompt: es lo que se descarga.');

  const existente = editingSkillId ? skills.find(s => s.id === editingSkillId) : null;
  const s = existente ? { ...existente } : { id:uid(), createdAt:Date.now() };
  s.title     = title;
  s.area      = $('#skfArea').value;
  s.level     = $('#skfLevel').value;
  s.tags      = $('#skfTags').value.trim();
  s.objective = $('#skfObjective').value.trim();
  s.prompt    = prompt;
  s.audiencia = leerAudiencia($('#skfAudiencia'));

  const btn = $('#skEdSave');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    await store.saveSkill(s);
    skills = existente ? skills.map(x => x.id === s.id ? s : x) : [...skills, s];
    closeSkillEditor();
    toast(existente ? 'Skill actualizada' : 'Skill creada');
    render();
  } catch (err){
    console.error(err);
    $('#skEdMsg').textContent = errorMsg(err);
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar skill';
  }
});

/* ================================================================
   UI suelta
   ================================================================ */
$('#btnNew').addEventListener('click', () => openComposer());
$('#composerTrigger').addEventListener('click', () => openComposer());
$('#btnCloseModal').addEventListener('click', closeComposer);
$('#btnCancel').addEventListener('click', closeComposer);
$('#overlay').addEventListener('click', e => { if (e.target.id === 'overlay') closeComposer(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#skEdOverlay').hidden) return closeSkillEditor();
  if (!$('#skOverlay').hidden)   return closeSkill();
  if (!$('#overlay').hidden)     return closeComposer();
});
// Menú de atajos: Cursos → tutoriales, Clases en vivo → cronograma
$('#subnav').addEventListener('click', e => {
  const b = e.target.closest('[data-sub]');
  if (b) setView(b.dataset.sub);
});
$('#btnMenu').addEventListener('click', () => $('#sidebar').classList.toggle('is-open'));

let searchTimer;
$('#search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const v = e.target.value;
  searchTimer = setTimeout(() => { query = v.trim(); render(); }, 180);
});

let modoAplicado = false;
function applyMode(){
  if (modoAplicado) return;
  modoAplicado = true;
  // Columna derecha: el estudiante pregunta; el admin ve lo pendiente (se pinta en render)
  if (!IS_ADMIN) $('#railPregunta').innerHTML = preguntaFormHtml('rail');
  document.body.classList.toggle('modo-estudiante', !IS_ADMIN);   // el ojito es solo para estudiantes
  document.body.classList.toggle('es-admin', IS_ADMIN);             // línea azul arriba en modo admin

  if (!IS_ADMIN){
    $('#btnNew').remove();
    $('#composerTrigger').remove();
  }

  // El admin cambia de espacio desde el menú; el responsable ve ahí el panel de su equipo
  $('#navEspacio').hidden = !(IS_ADMIN && CLOUD);
  $('#navGestion').hidden = IS_ADMIN || !gruposResponsable().length;
  $('[data-editar-reto]').hidden = !(IS_ADMIN && CLOUD);
  refrescarVerComo();

  // Menú de cuenta (arriba a la derecha): quién eres, accesos de gestión y cerrar sesión
  if (!IS_ADMIN && !PERFIL) return;
  const nombre = IS_ADMIN ? 'PorContar' : (PERFIL.nombre || PERFIL.email);
  const sub    = IS_ADMIN ? 'Admin · modo edición' : PERFIL.grupos.map(g => g.nombre).join(' · ');
  const av     = IS_ADMIN ? 'PC' : iniciales(nombre.split('@')[0]);
  const opcion = (vista, icono, titulo, detalle) => `
    <button role="menuitem" data-cfg-ir="${vista}"><svg class="ico"><use href="#${icono}"/></svg>
      <span><b>${titulo}</b><em>${detalle}</em></span></button>`;
  const opciones = IS_ADMIN && CLOUD
    ? opcion('grupos', 'i-users', 'Empresas y cohortes', 'Crear grupos, contraseñas y correos')
      + opcion('reto', 'i-cal', 'Sesiones del reto', 'Agregar, editar u ordenar las sesiones')
      + opcion('panel', 'i-chart', 'Panel de avance', 'Videos, tareas y quizzes de cada persona')
    : gruposResponsable().length
      ? opcion('panel', 'i-chart', 'Panel de mi equipo', 'El avance de cada persona de tu equipo') : '';

  // Insignia fija: con la clave en la URL se está en modo admin; sin ella, se ve como estudiante
  if (IS_ADMIN){
    const modo = document.createElement('span');
    modo.className = 'modo-admin';
    modo.title = 'Estás en modo admin porque la dirección termina en /admin. Sin /admin ves la academia como un estudiante.';
    modo.innerHTML = '<svg class="ico"><use href="#i-edit"/></svg>Modo admin';
    $('.topbar-right').prepend(modo);
  }

  const cuenta = document.createElement('div');
  cuenta.className = 'cuenta';
  cuenta.innerHTML = `
    <button class="cuenta-btn" data-cfg aria-haspopup="menu" aria-expanded="false" title="Tu cuenta">
      <span class="yo-av ${IS_ADMIN ? 'is-admin' : ''}">${escapeHtml(av)}</span>
      <span class="yo-txt"><b>${escapeHtml(nombre)}</b><em>${escapeHtml(sub)}</em></span>
      <svg class="ico cuenta-chev"><use href="#i-chev"/></svg>
    </button>
    <div class="cfg-menu" role="menu" hidden>
      <div class="cuenta-cab">
        <span class="yo-av ${IS_ADMIN ? 'is-admin' : ''}">${escapeHtml(av)}</span>
        <span><b>${escapeHtml(nombre)}</b>${IS_ADMIN ? '<em>Administración de la Academia</em>'
          : nombre !== PERFIL.email ? `<em>${escapeHtml(PERFIL.email)}</em>` : ''}
          ${IS_ADMIN ? '' : PERFIL.grupos.map(g => `<span class="gr-tipo">${escapeHtml(g.nombre)}</span>`).join(' ')}</span>
      </div>
      ${opciones ? `<div class="cuenta-ops">${opciones}</div>` : ''}
      <button role="menuitem" class="cuenta-salir" data-salir>
        <svg class="ico"><use href="#i-logout"/></svg>
        <span><b>${IS_ADMIN ? 'Salir del modo admin' : 'Cerrar sesión'}</b></span>
      </button>
    </div>`;
  $('.topbar-right').append(cuenta);
}

/* ---------- Salir y vista previa por grupo ---------- */
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-salir]')) return;
  if (IS_ADMIN){
    // El modo admin vive en la URL: salir es abrir la misma dirección sin la clave
    location.href = location.origin + '/';
    return;
  }
  try { await store.salir(); } catch (err){ console.warn(err); }
  ACADEMIA.olvidarToken();
  location.reload();
});
/* ---------- Configuración (engranaje de la barra superior) ---------- */
document.addEventListener('click', e => {
  const menu = $('.cfg-menu'); if (!menu) return;
  const btn = e.target.closest('[data-cfg]');
  const ir = e.target.closest('[data-cfg-ir]');
  if (btn){
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', !menu.hidden);
    return;
  }
  if (!e.target.closest('.cfg-menu') || ir){ menu.hidden = true; $('[data-cfg]').setAttribute('aria-expanded', 'false'); }
  if (ir) setView(ir.dataset.cfgIr, ir.dataset.cfgIr === 'panel' ? vistaComo || null : null);
});


/* ================================================================
   Confirmar: ventana propia para lo que no se deshace (los avisos del
   navegador se ven poco y Chrome deja bloquearlos)
   ================================================================ */
function confirmar({ titulo, texto, boton = 'Eliminar' }){
  return new Promise(resolve => {
    const ov = $('#cfOverlay');
    $('#cfTitulo').textContent = titulo;
    $('#cfTexto').textContent = texto;
    $('#cfSi').textContent = boton;
    ov.hidden = false;
    setTimeout(() => $('#cfNo').focus(), 40);
    const cerrar = valor => {
      ov.hidden = true;
      $('#cfSi').onclick = $('#cfNo').onclick = ov.onclick = document.onkeydown = null;
      resolve(valor);
    };
    $('#cfSi').onclick = () => cerrar(true);
    $('#cfNo').onclick = () => cerrar(false);
    ov.onclick = e => { if (e.target === ov) cerrar(false); };
    document.onkeydown = e => { if (e.key === 'Escape') cerrar(false); };
  });
}

/* ================================================================
   Quizzes: interacciones
   ================================================================ */
/** Trae los quizzes (y la estadística, si eres admin). Si falla, guarda por qué. */
async function cargarQuizzes(){
  try {
    quizzes = await store.listQuizzes();
    estadisticas = IS_ADMIN ? await store.quizStats() : [];
    quizFalla = '';
  } catch (err){
    quizFalla = errorMsg(err);
    throw err;
  }
}

function verQuizzes(){ quizVista = 'lista'; quizAbierto = null; quizResultado = null; quizEditando = null; render(); }

$('#posts').addEventListener('click', async e => {
  if (!e.target.closest('[data-quiz-abrir],[data-quiz-volver],[data-quiz-enviar],[data-quiz-editar],[data-quiz-stats],[data-quiz-guardar],[data-quiz-add-p],[data-quiz-add-o],[data-quiz-borrar-p],[data-quiz-borrar-o],[data-quiz-borrar-persona],[data-quiz-vaciar]')) return;

  const abrir = e.target.closest('[data-quiz-abrir]');
  if (abrir){
    try {
      quizAbierto = await store.getQuiz(abrir.dataset.quizAbrir);
      quizElegidas = quizAbierto.preguntas.map(() => null);
      quizResultado = null;
      quizVista = 'responder';
      render();
    } catch (err){ toast(errorMsg(err)); }
    return;
  }

  if (e.target.closest('[data-quiz-volver]')){
    await cargarQuizzes().catch(err => console.warn(err));
    if (quizDesde){ const s = quizDesde; quizDesde = null; return setView('session', s); }
    verQuizzes();
    return;
  }

  const stats = e.target.closest('[data-quiz-stats]');
  if (stats){
    try {
      quizAbierto = stats.dataset.quizStats;
      estadisticas = await store.quizStats();
      quizVista = 'stats';
      render();
    } catch (err){ toast(errorMsg(err)); }
    return;
  }

  const editar = e.target.closest('[data-quiz-editar]');
  if (editar){
    try {
      const q = await store.getQuiz(editar.dataset.quizEditar);
      quizEditando = { ...q, preguntas:(q.preguntas || []).map(p => ({ ...p, options:[...p.options] })) };
      if (!quizEditando.preguntas.length) quizEditando.preguntas.push(preguntaVacia());
      quizVista = 'editar';
      render();
    } catch (err){ toast(errorMsg(err)); }
    return;
  }

  if (e.target.closest('[data-quiz-enviar]')) return enviarQuiz();

  /* ---------- Limpiar respuestas (sirve para borrar las pruebas) ---------- */
  const borrarPersona = e.target.closest('[data-quiz-borrar-persona]');
  if (borrarPersona){
    const quien = borrarPersona.getAttribute('aria-label').replace('Quitar a ', '');
    if (!(await confirmar({ titulo:`¿Quitar las respuestas de ${quien}?`, texto:'Solo en este quiz. No se puede deshacer.', boton:'Quitar' }))) return;
    try {
      await store.borrarPersonaQuiz(quizAbierto, borrarPersona.dataset.quizBorrarPersona);
      estadisticas = await store.quizStats();
      toast('Respuestas borradas');
    } catch (err){ toast(errorMsg(err)); }
    render();
    return;
  }

  if (e.target.closest('[data-quiz-vaciar]')){
    if (!(await confirmar({ titulo:'¿Borrar todas las respuestas?', texto:'Las preguntas del quiz quedan como están; solo se borran los intentos.', boton:'Borrar respuestas' }))) return;
    try {
      await store.borrarIntentosQuiz(quizAbierto);
      estadisticas = await store.quizStats();
      toast('Respuestas borradas');
    } catch (err){ toast(errorMsg(err)); }
    render();
    return;
  }

  /* ---------- Editor ---------- */
  if (e.target.closest('[data-quiz-add-p]')){ quizEditando.preguntas.push(preguntaVacia()); render(); return; }

  const addO = e.target.closest('[data-quiz-add-o]');
  if (addO){ quizEditando.preguntas[+addO.dataset.quizAddO].options.push(''); render(); return; }

  const borrarP = e.target.closest('[data-quiz-borrar-p]');
  if (borrarP){
    quizEditando.preguntas.splice(+borrarP.dataset.quizBorrarP, 1);
    if (!quizEditando.preguntas.length) quizEditando.preguntas.push(preguntaVacia());
    render(); return;
  }

  const borrarO = e.target.closest('[data-quiz-borrar-o]');
  if (borrarO){
    const [i, j] = borrarO.dataset.quizBorrarO.split('-').map(Number);
    const p = quizEditando.preguntas[i];
    p.options.splice(j, 1);
    if (p.correctIndex >= p.options.length) p.correctIndex = 0;
    render(); return;
  }

  if (e.target.closest('[data-quiz-guardar]')) return guardarQuiz();
});

const preguntaVacia = () => ({ text:'', options:['', ''], correctIndex:0 });

/* Lo que se escribe o se marca se guarda en memoria, sin redibujar de más */
$('#posts').addEventListener('input', e => {
  const t = e.target;
  if (!quizEditando) return;
  if (t.id === 'quizTitulo'){ quizEditando.titulo = t.value; return; }
  if (t.id === 'quizDesc'){ quizEditando.descripcion = t.value; return; }
  if (t.id === 'quizAprobar'){ quizEditando.aprobar = Math.max(0, Math.min(100, parseInt(t.value, 10) || 0)); return; }
  if (t.id === 'quizIntentos'){ quizEditando.intentos = Math.max(0, Math.min(50, parseInt(t.value, 10) || 0)); return; }
  if (t.dataset.quizTexto !== undefined){ quizEditando.preguntas[+t.dataset.quizTexto].text = t.value; return; }
  if (t.dataset.quizOpcionEdit !== undefined){
    const [i, j] = t.dataset.quizOpcionEdit.split('-').map(Number);
    quizEditando.preguntas[i].options[j] = t.value;
  }
});

$('#posts').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.quizOpcion !== undefined){       // el estudiante marca su respuesta
    quizElegidas[+t.dataset.quizOpcion] = +t.value;
    render();
    return;
  }
  if (t.id === 'quizActivo' && quizEditando){ quizEditando.activo = t.checked; return; }
  if (t.id === 'quizOblig' && quizEditando){ quizEditando.obligatorio = t.checked; return; }
  if (t.dataset.quizCorrecta !== undefined && quizEditando){
    quizEditando.preguntas[+t.dataset.quizCorrecta].correctIndex = +t.value;
    render();
  }
});

async function enviarQuiz(){
  const msg = $('#quizMsg'), btn = $('[data-quiz-enviar]');
  btn.disabled = true; btn.textContent = 'Enviando…'; msg.textContent = '';
  try {
    // El intento queda a nombre de quien tiene la sesión: no hay que escribir el nombre
    quizResultado = await store.submitQuiz(quizAbierto.id, quizElegidas);
    quizVista = 'resultado';
    render();
    toast(`Listo: ${quizResultado.puntaje} de ${quizResultado.total}`);
  } catch (err){
    console.error(err);
    msg.textContent = errorMsg(err);
    btn.disabled = false; btn.textContent = 'Enviar respuestas';
  }
}

async function guardarQuiz(){
  const q = quizEditando, msg = $('#quizMsg'), btn = $('[data-quiz-guardar]');
  q.titulo = (q.titulo || '').trim();
  q.descripcion = (q.descripcion || '').trim();
  q.preguntas = q.preguntas
    .map(p => ({ text:(p.text || '').trim(), options:p.options.map(o => (o || '').trim()), correctIndex:p.correctIndex }))
    .filter(p => p.text || p.options.some(Boolean));

  if (!q.titulo) return void (msg.textContent = 'Ponle un título al quiz.');
  for (const [i, p] of q.preguntas.entries()){
    if (!p.text) return void (msg.textContent = `La pregunta ${i + 1} no tiene texto.`);
    if (p.options.some(o => !o)) return void (msg.textContent = `La pregunta ${i + 1} tiene una opción vacía.`);
    if (p.options.length < 2) return void (msg.textContent = `La pregunta ${i + 1} necesita al menos dos opciones.`);
  }
  if (q.activo && !q.preguntas.length) return void (msg.textContent = 'Para publicarlo, escribe al menos una pregunta.');

  btn.disabled = true; btn.textContent = 'Guardando…'; msg.textContent = '';
  try {
    await store.saveQuiz(q);
    await cargarQuizzes();
    toast(q.activo ? 'Quiz guardado y publicado' : 'Quiz guardado como borrador');
    if (quizDesde){ const s = quizDesde; quizDesde = null; return setView('session', s); }
    verQuizzes();
  } catch (err){
    console.error(err);
    msg.textContent = errorMsg(err);
    btn.disabled = false; btn.textContent = 'Guardar quiz';
  }
}

/* ================================================================
   Preguntas de estudiantes
   ================================================================ */
// Los dos formularios (columna derecha y arriba de las FAQ) comparten el borrador
document.addEventListener('input', e => {
  const campo = e.target.closest('[data-pregunta] textarea'); if (!campo) return;
  borrador = campo.value;
  $$('[data-pregunta] textarea').forEach(t => { if (t !== campo) t.value = borrador; });
  $$('[data-cuenta]').forEach(c => { c.textContent = `${borrador.length}/${PREGUNTA_MAX}`; });
});

document.addEventListener('submit', async e => {
  const form = e.target.closest('[data-pregunta]'); if (!form) return;
  e.preventDefault();
  const campo = $('textarea', form), msg = $('[data-msg]', form), btn = $('button[type="submit"]', form);
  const texto = campo.value.replace(/\s+/g, ' ').trim();
  msg.classList.remove('is-ok');
  if (texto.length < PREGUNTA_MIN){
    msg.textContent = `Escribe la pregunta completa (mínimo ${PREGUNTA_MIN} caracteres).`;
    return campo.focus();
  }

  btn.disabled = true; btn.textContent = 'Enviando…'; msg.textContent = '';
  try {
    const p = await store.ask(texto);
    const yaEstaba = posts.some(x => x.id === p.id);
    if (!yaEstaba) posts.unshift(p);
    borrador = '';
    $$('[data-pregunta] textarea').forEach(t => { t.value = ''; });
    $$('[data-cuenta]').forEach(c => { c.textContent = `0/${PREGUNTA_MAX}`; });

    if (view.type === 'faq'){
      render();
      resaltarFaq(p.id);
      toast(yaEstaba ? 'Esa pregunta ya estaba: te la mostramos' : 'Tu pregunta ya está en Preguntas frecuentes');
    } else {
      render();
      msg.classList.add('is-ok');
      msg.innerHTML = `${yaEstaba ? 'Esa pregunta ya estaba' : 'Listo: tu pregunta ya está'} en
        <button type="button" class="link-btn" data-ir-faq="${p.id}">Preguntas frecuentes</button>.`;
    }
  } catch (err){
    console.error(err);
    msg.textContent = errorMsg(err);
  } finally {
    btn.disabled = false; btn.textContent = 'Enviar pregunta';
  }
});

document.addEventListener('click', e => {
  const ir = e.target.closest('[data-ir-faq]'); if (!ir) return;
  setView('faq');
  if (ir.dataset.irFaq) resaltarFaq(ir.dataset.irFaq);
});

/* ================================================================
   Arranque
   ================================================================ */
/* ================================================================
   Empresas y cohortes (admin)
   ================================================================ */
let grupoAbierto   = null;   // id del grupo cuyas personas se están viendo
let miembros       = [];
let miembrosFalla  = '';
let miembrosFiltro = '';
let resultadoAlta  = '';
let editandoGrupo  = null;   // null = nuevo
const claveReciente = {};    // contraseña recién puesta, para el mensaje de bienvenida (solo en memoria)
const MAX_FILAS = 300;       // con miles de personas, la tabla se acota y se usa el buscador

async function cargarGrupos(){
  try { GRUPOS = await store.grupos(); gruposFalla = ''; }
  catch (err){ console.warn(err); gruposFalla = errorMsg(err); }
  refrescarVerComo();
}
async function cargarMiembros(){
  if (!GRUPOS.length) await cargarGrupos();
  try { miembros = await store.miembros(grupoAbierto); miembrosFalla = ''; }
  catch (err){ console.warn(err); miembrosFalla = errorMsg(err); }
}

/** El selector de espacio sigue la lista de grupos cuando se crea o se borra uno. */
let espacioFiltro = '';

/** Iniciales para el cuadrito de cada empresa: "Banco de Bogotá" → "BB", "Bancolombia" → "BA". */
function iniciales(nombre){
  const p = String(nombre || '').split(/[\s·\-_/]+/).filter(w => w && !/^(de|del|la|las|los|el|y|e)$/i.test(w));
  return (p.length > 1 ? p[0][0] + p[1][0] : (p[0] || '?').slice(0, 2)).toUpperCase();
}

const avEspacio = g => g?.logo_url
  ? `<span class="esp-av has-logo"><b>${escapeHtml(iniciales(g.nombre))}</b><img src="${escapeHtml(g.logo_url)}" alt="" onerror="this.remove()" /></span>`
  : g
  ? `<span class="esp-av ${g.tipo === 'b2c' ? 'is-b2c' : ''}">${escapeHtml(iniciales(g.nombre))}</span>`
  : `<span class="esp-av is-principal"><img src="marca/burbuja.svg" alt="" width="18" height="18" /></span>`;

function itemEspacio(g){
  const activo = (g?.id || '') === vistaComo;
  const sub = !g ? 'Contenido para todos'
            : g.vigente === false ? 'Sin acceso'
            : g.vence_el ? 'Hasta el ' + fechaLarga(g.vence_el) : 'Sin vencimiento';
  return `
    <button type="button" class="esp-item ${activo ? 'is-on' : ''}" role="option" aria-selected="${activo}" data-esp="${g?.id || ''}">
      ${avEspacio(g)}
      <span class="esp-txt"><b>${g ? escapeHtml(g.nombre) : 'Principal'}</b><em class="${g?.vigente === false ? 'is-off' : ''}">${escapeHtml(sub)}</em></span>
      ${activo ? '<svg class="ico esp-ok"><use href="#i-check"/></svg>' : ''}
    </button>`;
}

function pintarMenuEspacios(){
  const f = sinTildes(espacioFiltro);
  const ordenados = GRUPOS.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .filter(g => !f || sinTildes(g.nombre).includes(f));
  const bloque = (tipo, titulo) => {
    const lista = ordenados.filter(g => g.tipo === tipo);
    return lista.length ? `<p class="esp-grupo">${titulo}</p>${lista.map(itemEspacio).join('')}` : '';
  };
  $('#espMenu').innerHTML = `
    ${GRUPOS.length > 6 ? `<input type="search" class="esp-buscar" id="espBuscar" placeholder="Buscar empresa…" value="${escapeHtml(espacioFiltro)}" />` : ''}
    <div class="esp-lista">
      ${!f ? itemEspacio(null) : ''}
      ${bloque('b2b', 'Empresas')}
      ${bloque('b2c', 'Cohortes')}
      ${f && !ordenados.length ? `<p class="esp-vacio">Ninguna empresa coincide.</p>` : ''}
    </div>
    <button type="button" class="esp-nuevo" data-esp-nuevo><svg class="ico"><use href="#i-plus"/></svg> Nueva empresa o cohorte</button>`;
}

function abrirMenuEspacios(abrir){
  const menu = $('#espMenu');
  menu.hidden = !abrir;
  $('#espBtn').setAttribute('aria-expanded', abrir);
  if (abrir){
    espacioFiltro = '';
    pintarMenuEspacios();
    $('#espBuscar')?.focus();
  }
}

function refrescarVerComo(){
  if (!IS_ADMIN || !$('#espBtn')) return;
  if (vistaComo && !grupoPorId(vistaComo)){   // el grupo se borró: de vuelta al Principal
    vistaComo = '';
    try { localStorage.setItem(ESPACIO_KEY, ''); } catch {}
  }
  const g = grupoPorId(vistaComo);
  $('#espAv').outerHTML = avEspacio(g).replace('class="esp-av', 'id="espAv" class="esp-av');
  $('#espNombre').textContent = g ? g.nombre : 'Principal';
  $('#espBtn').title = g ? `Ves lo que ve ${g.nombre}. Lo que publiques aquí es solo para este grupo.`
                         : 'Lo que publiques aquí lo ven todas las empresas y cohortes';
  document.body.classList.toggle('en-espacio', !!g);
  if (!$('#espMenu').hidden) pintarMenuEspacios();

  const aviso = $('#espacioAviso');
  aviso.hidden = !g;
  if (g) aviso.innerHTML = `
    <svg class="ico"><use href="#i-lock"/></svg>
    <span>Estás en el espacio de <b>${escapeHtml(g.nombre)}</b>: ves el contenido general más el exclusivo
      (con candado). Lo que publiques aquí lo ve solo ${escapeHtml(g.nombre)}.</span>
    <button class="btn" data-espacio-principal>Volver al Principal</button>`;
}

/** Cambia de espacio de trabajo y lo recuerda en este navegador. */
function cambiarEspacio(id){
  abrirMenuEspacios(false);
  if (id === vistaComo) return;
  vistaComo = id;
  try { localStorage.setItem(ESPACIO_KEY, vistaComo); } catch {}
  refrescarVerComo();
  const g = grupoPorId(vistaComo);
  toast(g ? `Estás en el espacio de ${g.nombre}` : 'Estás en el espacio Principal');
  // En el panel se pasa al de ese grupo; en lo demás se redibuja con lo del espacio
  if (view.type === 'panel') setView('panel', vistaComo || null);
  else render();
  $('#sidebar').classList.remove('is-open');
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-espacio-principal]')) return cambiarEspacio('');
  if (!$('#espMenu')) return;
  if (e.target.closest('#espBtn')) return abrirMenuEspacios($('#espMenu').hidden);
  const item = e.target.closest('[data-esp]');
  if (item) return cambiarEspacio(item.dataset.esp);
  if (e.target.closest('[data-esp-nuevo]')){ abrirMenuEspacios(false); return abrirGrupoForm(); }
  if (!e.target.closest('#espMenu')) abrirMenuEspacios(false);
});
document.addEventListener('input', e => {
  if (e.target.id !== 'espBuscar') return;
  espacioFiltro = e.target.value;
  const pos = e.target.selectionStart;
  pintarMenuEspacios();
  const b = $('#espBuscar'); b.focus(); b.setSelectionRange(pos, pos);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#espMenu') && !$('#espMenu').hidden) abrirMenuEspacios(false);
});

/** "Hace 5 min.", "Hace un momento" o "El 3 oct" para lo que pasó hace más de una semana. */
function haceTxt(cuando){
  const t = timeAgo(new Date(cuando).getTime());
  if (t === 'ahora') return 'Hace un momento';
  return /^\d+ (min\.|h|d)$/.test(t) ? 'Hace ' + t : 'El ' + t;
}

const fechaLarga = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day:'numeric', month:'short', year:'numeric' }) : '';
const hoyIso = () => new Date().toLocaleDateString('en-CA');   // AAAA-MM-DD en la hora local

function estadoGrupo(g){
  if (!g.activo) return { txt:'Inactivo', cls:'is-off' };
  if (g.vence_el && g.vence_el < hoyIso()) return { txt:'Venció el ' + fechaLarga(g.vence_el), cls:'is-off' };
  if (!g.vence_el) return { txt:'Sin vencimiento', cls:'is-on' };
  const dias = Math.round((new Date(g.vence_el + 'T12:00:00') - new Date(hoyIso() + 'T12:00:00')) / 864e5);
  return { txt:'Hasta el ' + fechaLarga(g.vence_el), cls:dias <= 7 ? 'is-warn' : 'is-on' };
}
const tipoTxt = g => g.tipo === 'b2b' ? 'Empresa' : 'Cohorte';

function gruposHtml(){
  if (gruposFalla && !GRUPOS.length) return `
    <div class="empty">
      <svg class="ico"><use href="#i-users"/></svg>
      <h3>Las empresas no están disponibles</h3>
      <p>${escapeHtml(gruposFalla)}</p>
    </div>`;
  if (grupoAbierto) return grupoDetalleHtml();

  const b2b = GRUPOS.filter(g => g.tipo === 'b2b').length, b2c = GRUPOS.length - b2b;
  const cabecera = `
    <div class="sk-head">
      <span class="sk-label">${b2b} ${b2b === 1 ? 'empresa' : 'empresas'} · ${b2c} ${b2c === 1 ? 'cohorte' : 'cohortes'}</span>
      <button class="btn btn-primary" data-gr-nuevo><svg class="ico"><use href="#i-plus"/></svg> Nuevo grupo</button>
    </div>`;
  if (!GRUPOS.length) return cabecera + `
    <div class="empty">
      <svg class="ico"><use href="#i-users"/></svg>
      <h3>Todavía no hay empresas ni cohortes</h3>
      <p>Crea la primera con <b>Nuevo grupo</b>: un nombre, una contraseña y hasta cuándo tiene acceso. Después pegas los correos.</p>
    </div>`;

  return cabecera + `<div class="quiz-grid">${GRUPOS.map(g => {
    const e = estadoGrupo(g);
    return `
    <article class="quiz-card gr-card ${g.vigente ? '' : 'is-off'}">
      <div class="gr-top">
        <span class="gr-tipo">${tipoTxt(g)}</span>
        <span class="gr-estado ${e.cls}">${escapeHtml(e.txt)}</span>
      </div>
      <div class="gr-nombre">${typeof logoHtml === 'function' ? logoHtml(g) : ''}<h3>${escapeHtml(g.nombre)}</h3></div>
      <p class="quiz-meta"><b>${g.miembros}</b>${g.plazas ? ` de ${g.plazas}` : ''} ${g.plazas ? 'plazas' : g.miembros === 1 ? 'persona' : 'personas'} ·
         <b>${g.han_entrado}</b> ya ${g.han_entrado === 1 ? 'entró' : 'entraron'} ·
         <b>${g.responsables}</b> ${g.responsables === 1 ? 'responsable' : 'responsables'}</p>
      <div class="quiz-acciones">
        <button class="btn btn-primary" data-gr-abrir="${g.id}">Personas</button>
        <button class="btn" data-gr-editar="${g.id}">Editar</button>
        <button class="btn" data-gr-panel="${g.id}">Panel</button>
        <button class="icon-btn gr-borrar" data-gr-borrar="${g.id}" title="Eliminar ${escapeHtml(g.nombre)}" aria-label="Eliminar ${escapeHtml(g.nombre)}">
          <svg class="ico"><use href="#i-trash"/></svg></button>
      </div>
    </article>`;
  }).join('')}</div>`;
}

function grupoDetalleHtml(){
  const g = grupoPorId(grupoAbierto);
  if (!g) return `
    <div class="empty">
      <svg class="ico"><use href="#i-users"/></svg>
      <h3>Ese grupo ya no existe</h3>
      <button class="btn btn-primary" data-gr-volver>Ver todos los grupos</button>
    </div>`;
  const e = estadoGrupo(g);
  return `
    <div class="card gr-detalle">
      <button class="btn quiz-volver" data-gr-volver>← Todas las empresas y cohortes</button>
      <div class="gr-cab">
        <div class="gr-top">
          <span class="gr-tipo">${tipoTxt(g)}</span>
          <span class="gr-estado ${e.cls}">${escapeHtml(e.txt)}</span>
        </div>
        <div class="quiz-acciones">
          <button class="btn" data-gr-editar="${g.id}"><svg class="ico"><use href="#i-edit"/></svg> Editar grupo</button>
          <button class="btn" data-gr-bienvenida="${g.id}"><svg class="ico"><use href="#i-copy"/></svg> Copiar mensaje de bienvenida</button>
          <button class="btn" data-gr-panel="${g.id}"><svg class="ico"><use href="#i-chart"/></svg> Ver panel</button>
        </div>
      </div>

      ${fichaResumenHtml(g)}

      <h3 class="quiz-sub">Dar acceso a más personas</h3>
      <p class="quiz-desc">Pega la lista con un correo por línea. Puede llevar el nombre al lado (copiado de Excel o separado por coma).
         Si la línea dice <b>responsable</b>, esa persona también verá el panel de su equipo.</p>
      <textarea id="grLista" class="gr-lista" rows="6" spellcheck="false"
        placeholder="Ana Pérez, ana@empresa.com&#10;carlos@empresa.com&#10;Laura Gómez, laura@empresa.com, responsable"></textarea>
      <div class="gr-alta-foot">
        <label class="btn gr-csv"><svg class="ico"><use href="#i-upload"/></svg> Subir CSV
          <input type="file" id="grCsv" accept=".csv,.txt,text/csv,text/plain" hidden /></label>
        <span class="quiz-meta" id="grListaCuenta"></span>
        <button class="btn btn-primary" data-gr-agregar>Dar acceso</button>
      </div>
      <p class="gr-resultado" id="grAltaMsg">${resultadoAlta}</p>

      <div class="gr-personas-cab">
        <h3 class="quiz-sub">Personas con acceso (${miembros.filter(m => m.activo).length})</h3>
        ${miembros.length > 8 ? `<input type="search" id="grBuscar" class="gr-buscar" placeholder="Buscar por nombre o correo"
            value="${escapeHtml(miembrosFiltro)}" />` : ''}
      </div>
      ${miembrosFalla ? `<p class="quiz-msg">${escapeHtml(miembrosFalla)}</p>`
        : miembros.length ? `
        <div class="quiz-tabla">
          <table>
            <thead><tr><th>Persona</th><th>Rol</th><th>Acceso</th><th>Último ingreso</th><th></th></tr></thead>
            <tbody id="grTbody">${filasMiembrosHtml()}</tbody>
          </table>
        </div>`
        : `<p class="quiz-desc">Todavía no hay nadie. Pega los correos arriba y toca <b>Dar acceso</b>.</p>`}

      <button class="btn quiz-vaciar" data-gr-borrar="${g.id}">Eliminar este grupo</button>
      <p class="quiz-nota">Eliminarlo quita el acceso a todas sus personas y lo saca de la audiencia de lo publicado. El contenido no se borra.</p>
    </div>`;
}

/** La ficha de la empresa en su detalle: datos, contacto y WhatsApp. */
function fichaResumenHtml(g){
  const dato = (t, v) => v ? `<div><span>${t}</span><b>${v}</b></div>` : '';
  const filas = [
    dato('NIT', escapeHtml(g.nit || '')), dato('Sector', escapeHtml(g.sector || '')),
    dato('Plazas', g.plazas ? `${g.miembros} de ${g.plazas} usadas` : ''),
    dato('Programa', escapeHtml(rangoTxt?.(g.fecha_inicio, g.fecha_fin) || '')),
    dato('Contacto', escapeHtml([g.contacto_nombre, g.contacto_cargo].filter(Boolean).join(' · '))),
    dato('Correo', g.contacto_email ? `<a href="mailto:${escapeHtml(g.contacto_email)}">${escapeHtml(g.contacto_email)}</a>` : ''),
    dato('Teléfono', escapeHtml(g.contacto_telefono || '')),
    dato('WhatsApp', g.whatsapp_url ? `<a href="${escapeHtml(g.whatsapp_url)}" target="_blank" rel="noopener">Grupo de la empresa</a>` : ''),
  ].join('');
  return `
    <div class="gr-ficha">
      ${typeof logoHtml === 'function' ? logoHtml(g, 'gr-ficha-logo') : ''}
      ${filas ? `<div class="gr-ficha-datos">${filas}</div>`
        : `<p class="quiz-desc">Sin ficha todavía: toca <b>Editar grupo</b> para agregar el logo, el contacto y el grupo de WhatsApp.</p>`}
    </div>`;
}

function filasMiembrosHtml(){
  const f = sinTildes(miembrosFiltro);
  const lista = miembros.filter(m => !f || sinTildes(m.nombre + ' ' + m.email).includes(f));
  const filas = lista.slice(0, MAX_FILAS).map(m => `
    <tr class="${m.activo ? '' : 'is-off'}">
      <td><b>${escapeHtml(m.nombre || '—')}</b><small class="celda-sub">${escapeHtml(m.email)}</small></td>
      <td><select class="gr-rol" data-m-rol="${m.id}" aria-label="Rol de ${escapeHtml(m.email)}">
        <option value="estudiante" ${m.rol === 'estudiante' ? 'selected' : ''}>Estudiante</option>
        <option value="responsable" ${m.rol === 'responsable' ? 'selected' : ''}>Responsable</option>
      </select></td>
      <td><label class="check"><input type="checkbox" data-m-activo="${m.id}" ${m.activo ? 'checked' : ''} />
        ${m.activo ? 'Activo' : 'Sin acceso'}</label></td>
      <td>${m.ultimo_acceso ? haceTxt(m.ultimo_acceso) : '<span class="celda-sub">Nunca</span>'}</td>
      <td class="quiz-borrar-celda">
        <button class="icon-btn" data-m-quitar="${m.id}" title="Quitar a ${escapeHtml(m.email)} del grupo" aria-label="Quitar a ${escapeHtml(m.email)}">
          <svg class="ico"><use href="#i-trash"/></svg>
        </button>
      </td>
    </tr>`).join('');
  const resto = lista.length - MAX_FILAS;
  return filas + (resto > 0 ? `<tr><td colspan="5" class="celda-sub">Y ${resto} más: usa el buscador para encontrar a alguien.</td></tr>` : '')
               + (!lista.length ? `<tr><td colspan="5" class="celda-sub">Nadie coincide con «${escapeHtml(miembrosFiltro)}».</td></tr>` : '');
}

/** Lee la lista pegada: un correo por línea, con el nombre y "responsable" opcionales. */
function leerLista(texto){
  const filas = [], ya = new Set();
  const RE = /[^\s,;<>"'()\t|]+@[^\s,;<>"'()\t|]+\.[^\s,;<>"'()\t|]+/g;
  for (const linea of String(texto || '').split(/\r?\n/)){
    const correos = linea.match(RE) || [];
    const responsable = /\bresponsable\b/i.test(linea);
    // Con un solo correo en la línea, lo demás es el nombre; con varios, solo cuentan los correos
    const nombre = correos.length === 1
      ? linea.replace(correos[0], ' ').replace(/\b(responsable|estudiante)\b/ig, ' ')
             .replace(/[,;\t<>"|()]+/g, ' ').replace(/\s+/g, ' ').trim()
      : '';
    for (const c of correos){
      const email = c.toLowerCase().replace(/\.+$/, '');
      if (ya.has(email)) continue;
      ya.add(email);
      filas.push({ email, nombre, ...(responsable ? { rol:'responsable' } : {}) });
    }
  }
  return filas;
}

async function darAcceso(){
  const texto = $('#grLista').value;
  const filas = leerLista(texto);
  const msg = $('#grAltaMsg'), btn = $('[data-gr-agregar]');
  if (!filas.length){ msg.textContent = 'No encontré ningún correo en la lista.'; return; }

  btn.disabled = true; btn.textContent = `Dando acceso a ${filas.length}…`; msg.textContent = '';
  let nuevos = 0, actualizados = 0, invalidos = [];
  try {
    for (let i = 0; i < filas.length; i += 1000){   // en tandas, para listas muy largas
      const r = await store.agregarMiembros(grupoAbierto, filas.slice(i, i + 1000));
      nuevos += r.nuevos; actualizados += r.actualizados; invalidos = invalidos.concat(r.invalidos || []);
    }
    resultadoAlta = `<b>Listo:</b> ${nuevos} ${nuevos === 1 ? 'persona nueva' : 'personas nuevas'}` +
      (actualizados ? ` · ${actualizados} ya ${actualizados === 1 ? 'estaba' : 'estaban'} (se actualizaron)` : '') +
      (invalidos.length ? ` · <span class="quiz-msg">${invalidos.length} con el correo mal escrito: ${escapeHtml(invalidos.slice(0, 5).join(', '))}${invalidos.length > 5 ? '…' : ''}</span>` : '');
    await Promise.all([cargarMiembros(), cargarGrupos()]);
    render();
    toast('Acceso dado. Comparte el mensaje de bienvenida con el grupo.');
  } catch (err){
    console.error(err);
    msg.textContent = errorMsg(err);
    btn.disabled = false; btn.textContent = 'Dar acceso';
  }
}

function mensajeBienvenida(g){
  const url = location.origin + '/';   // la dirección de los estudiantes, nunca la de admin
  return [
    `Hola. Ya tienes acceso a la Academia de PorContar${g.tipo === 'b2b' ? ' con ' + g.nombre : ''}.`,
    '',
    `Entra aquí: ${url}`,
    'Correo: el mismo con el que te inscribimos',
    `Contraseña: ${claveReciente[g.id] || '[escribe aquí la contraseña del grupo]'}`,
    ...(g.vence_el ? ['', `Tu acceso está activo hasta el ${fechaLarga(g.vence_el)}.`] : []),
  ].join('\n');
}

/* ---------- Formulario del grupo ---------- */
function abrirGrupoForm(g = null){
  editandoGrupo = g;
  $('#grTitle').textContent = g ? 'Editar grupo' : 'Nuevo grupo';
  $('#grNombre').value = g ? g.nombre : '';
  $('#grTipo').value   = g ? g.tipo : 'b2b';
  $('#grVence').value  = g?.vence_el || '';
  $('#grClave').value  = '';
  $('#grClave').placeholder = g ? 'Déjala vacía para no cambiarla' : 'Mínimo 6 caracteres';
  $('#grClaveLbl').textContent = g ? 'Nueva contraseña (opcional)' : 'Contraseña del grupo';
  $('#grClaveNota').textContent = g
    ? 'Si la cambias, quienes ya entraron siguen dentro; la nueva sirve para entrar desde ahora.'
    : 'Todas las personas del grupo entran con su correo y esta contraseña.';
  $('#grActivo').checked = g ? g.activo : true;

  // Ficha
  const campos = { grNit:'nit', grSector:'sector', grPlazas:'plazas', grWhatsapp:'whatsapp_url',
                   grInicio:'fecha_inicio', grFin:'fecha_fin', grCNombre:'contacto_nombre',
                   grCCargo:'contacto_cargo', grCEmail:'contacto_email', grCTel:'contacto_telefono' };
  Object.entries(campos).forEach(([id, k]) => { $('#' + id).value = g?.[k] ?? ''; });
  logoNuevo = null;
  logoActual = g?.logo_url || '';
  pintarLogoForm();

  $('#grMsg').textContent = '';
  $('#grOverlay').hidden = false;
  enfocar('#grNombre');
}
const cerrarGrupoForm = () => { $('#grOverlay').hidden = true; editandoGrupo = null; logoNuevo = null; };

/* Logo: se elige aquí y se sube al guardar */
let logoNuevo = null, logoActual = '';
function pintarLogoForm(){
  const url = logoNuevo ? URL.createObjectURL(logoNuevo) : logoActual;
  $('#grLogoPrev').innerHTML = url ? `<img src="${escapeHtml(url)}" alt="Logo" />`
    : `<span>${escapeHtml(iniciales($('#grNombre').value || '?'))}</span>`;
  $('#grLogoQuitar').hidden = !url;
}
$('#grLogo').addEventListener('change', e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(f.type)) return void ($('#grMsg').textContent = 'El logo debe ser PNG, JPG, WebP o SVG.');
  if (f.size > 2 * 1048576) return void ($('#grMsg').textContent = 'El logo pesa más de 2 MB.');
  $('#grMsg').textContent = '';
  logoNuevo = f; pintarLogoForm();
});
$('#grLogoQuitar').addEventListener('click', () => { logoNuevo = null; logoActual = ''; pintarLogoForm(); });
$('#grNombre').addEventListener('input', () => { if (!logoNuevo && !logoActual) pintarLogoForm(); });
$('#grClose').addEventListener('click', cerrarGrupoForm);
$('#grCancel').addEventListener('click', cerrarGrupoForm);
$('#grOverlay').addEventListener('click', e => { if (e.target.id === 'grOverlay') cerrarGrupoForm(); });

/** Contraseña fácil de dictar: sin letras que se confunden (0/O, 1/l/I). */
$('#grGenerar').addEventListener('click', () => {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const azar = crypto.getRandomValues(new Uint32Array(8));
  $('#grClave').value = 'PC-' + [...azar].map(n => abc[n % abc.length]).join('');
});

$('#grSave').addEventListener('click', async () => {
  const nombre = $('#grNombre').value.trim();
  const clave  = $('#grClave').value.trim();
  const msg = $('#grMsg'), btn = $('#grSave');
  if (nombre.length < 2) return void (msg.textContent = 'Ponle un nombre al grupo.');
  if (!editandoGrupo && !clave) return void (msg.textContent = 'Ponle una contraseña (o toca Generar).');
  if (clave && clave.length < 6) return void (msg.textContent = 'La contraseña debe tener al menos 6 caracteres.');
  const v = id => id === 'grWhatsapp' ? enlace($('#' + id).value) : $('#' + id).value.trim();
  if (v('grInicio') && v('grFin') && v('grFin') < v('grInicio')) return void (msg.textContent = 'El fin del programa no puede ser antes del inicio.');
  if (v('grCEmail') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v('grCEmail'))) return void (msg.textContent = 'Revisa el correo del contacto.');

  const nuevo = !editandoGrupo;
  btn.disabled = true; btn.textContent = 'Guardando…'; msg.textContent = '';
  try {
    const id = await store.guardarGrupo({
      id:editandoGrupo?.id, nombre, tipo:$('#grTipo').value, clave,
      vence_el:$('#grVence').value || null, activo:$('#grActivo').checked,
    });
    if (clave) claveReciente[id] = clave;
    // Si algo de la ficha falla, volver a guardar edita este grupo en vez de crear otro
    if (!editandoGrupo) editandoGrupo = { id, activo:true };

    // La ficha va aparte; si la base aún no tiene la Fase 1, el grupo igual queda guardado
    if (fase1){
      const logo = logoNuevo ? await store.subirLogo(id, logoNuevo) : logoActual;
      await store.fichaGrupo(id, {
        logo_url:logo, nit:v('grNit'), sector:v('grSector'), plazas:v('grPlazas'), whatsapp_url:v('grWhatsapp'),
        fecha_inicio:v('grInicio'), fecha_fin:v('grFin'), contacto_nombre:v('grCNombre'),
        contacto_cargo:v('grCCargo'), contacto_email:v('grCEmail'), contacto_telefono:v('grCTel'),
      });
    }
    cerrarGrupoForm();
    await cargarGrupos();
    if (nuevo){
      toast('Grupo creado. Ahora pega los correos de las personas.');
      setView('grupos', id);
    } else {
      toast(clave ? 'Grupo guardado con la contraseña nueva' : 'Grupo guardado');
      render();
    }
  } catch (err){
    console.error(err);
    msg.textContent = errorMsg(err);
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar';
  }
});

/* ---------- Interacciones de la vista de grupos ---------- */
$('#posts').addEventListener('click', async e => {
  if (view.type !== 'grupos') return;
  const t = sel => e.target.closest(sel);

  if (t('[data-gr-nuevo]')) return abrirGrupoForm();
  if (t('[data-gr-editar]')) return abrirGrupoForm(grupoPorId(t('[data-gr-editar]').dataset.grEditar));
  if (t('[data-gr-abrir]'))  { resultadoAlta = ''; miembrosFiltro = ''; return setView('grupos', t('[data-gr-abrir]').dataset.grAbrir); }
  if (t('[data-gr-volver]')) { resultadoAlta = ''; return setView('grupos'); }
  if (t('[data-gr-panel]'))  return setView('panel', t('[data-gr-panel]').dataset.grPanel);
  if (t('[data-gr-agregar]')) return darAcceso();

  if (t('[data-gr-bienvenida]')){
    const g = grupoPorId(t('[data-gr-bienvenida]').dataset.grBienvenida);
    try {
      await navigator.clipboard.writeText(mensajeBienvenida(g));
      toast(claveReciente[g.id] ? 'Mensaje copiado, con la contraseña' : 'Mensaje copiado: completa la contraseña antes de enviarlo');
    } catch { toast('El navegador no dejó copiar'); }
    return;
  }

  const quitar = t('[data-m-quitar]');
  if (quitar){
    const m = miembros.find(x => String(x.id) === quitar.dataset.mQuitar); if (!m) return;
    if (!(await confirmar({ titulo:`¿Quitar a ${m.email}?`, texto:'Deja de entrar de inmediato. Su avance no se borra: si lo vuelves a agregar, lo recupera.', boton:'Quitar' }))) return;
    try {
      await store.quitarMiembro(m.id);
      miembros = miembros.filter(x => x !== m);
      await cargarGrupos();
      toast('Persona quitada del grupo');
      render();
    } catch (err){ toast(errorMsg(err)); }
    return;
  }

  const borrar = t('[data-gr-borrar]');
  if (borrar){
    const g = grupoPorId(borrar.dataset.grBorrar); if (!g) return;
    const ok = await confirmar({
      titulo:`¿Eliminar «${g.nombre}»?`,
      texto:`${g.miembros} ${g.miembros === 1 ? 'persona pierde' : 'personas pierden'} el acceso de inmediato, y se borran su cronograma y sus grabaciones. Lo publicado para todos no se toca. No se puede deshacer.`,
      boton:'Eliminar empresa',
    });
    if (!ok) return;
    try {
      await store.borrarGrupo(g.id);
      // La base ya lo quitó de las audiencias: aquí se refleja sin recargar
      [posts, skills, quizzes].forEach(l => l.forEach(x => { if (x.audiencia) x.audiencia = x.audiencia.filter(v => v !== g.id); }));
      await cargarGrupos();
      toast('Grupo eliminado');
      setView('grupos');
    } catch (err){ toast(errorMsg(err)); }
  }
});

$('#posts').addEventListener('change', async e => {
  if (view.type !== 'grupos') return;
  const t = e.target;

  if (t.id === 'grCsv' && t.files[0]){
    const texto = await t.files[0].text();
    const caja = $('#grLista');
    caja.value = (caja.value.trim() ? caja.value.trim() + '\n' : '') + texto;
    t.value = '';
    caja.dispatchEvent(new Event('input', { bubbles:true }));
    return;
  }

  const id = t.dataset.mRol || t.dataset.mActivo; if (!id) return;
  const m = miembros.find(x => String(x.id) === id); if (!m) return;
  const cambio = { ...m, rol:t.dataset.mRol ? t.value : m.rol, activo:t.dataset.mActivo ? t.checked : m.activo };
  try {
    await store.actualizarMiembro(cambio);
    Object.assign(m, cambio);
    toast(t.dataset.mRol
      ? (m.rol === 'responsable' ? `${m.email} ahora ve el panel del equipo` : `${m.email} ya no ve el panel`)
      : (m.activo ? `${m.email} vuelve a tener acceso` : `${m.email} ya no puede entrar`));
    cargarGrupos();
  } catch (err){ toast(errorMsg(err)); }
  render();
});

$('#posts').addEventListener('input', e => {
  if (view.type !== 'grupos') return;
  if (e.target.id === 'grLista'){
    const n = leerLista(e.target.value).length;
    $('#grListaCuenta').textContent = n ? `${n} ${n === 1 ? 'correo' : 'correos'} en la lista` : '';
  }
  if (e.target.id === 'grBuscar'){   // solo se redibuja la tabla, para no perder el foco
    miembrosFiltro = e.target.value;
    $('#grTbody').innerHTML = filasMiembrosHtml();
  }
});

/* ================================================================
   Panel de avance (responsable de la empresa y admin)
   Se actualiza solo cada minuto mientras está abierto.
   ================================================================ */
let panelGrupo   = '';
let panelData    = null;
let panelFalla   = '';
let panelAt      = 0;
let panelTimer   = null;
let panelBuscar  = '';
let panelOrden   = 'nombre';
let panelTareas  = null;     // las tareas, leídas de trabajo-autonomo.html (la misma fuente que ve el estudiante)

const panelOpciones = () => IS_ADMIN ? GRUPOS : gruposResponsable();

async function cargarTareasDef(){
  if (panelTareas) return panelTareas;
  try {
    const html = await (await fetch('trabajo-autonomo.html', { cache:'no-cache' })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    panelTareas = [...doc.querySelectorAll('.task')].map(t => ({
      titulo: t.querySelector('h2')?.textContent.trim() || '',
      checks: [...t.querySelectorAll('.steps input[type=checkbox]')].map(c => c.id),
      radio:  t.querySelector('input[type=radio]')?.name || null,
    }));
  } catch (err){ console.warn('No se pudieron leer las tareas:', err); panelTareas = []; }
  return panelTareas;
}

async function cargarPanel(){
  const ops = panelOpciones();
  if (!ops.some(g => g.id === panelGrupo)) panelGrupo = ops[0]?.id || '';
  if (!panelGrupo){ panelData = null; return; }
  try {
    const [data] = await Promise.all([store.panel(panelGrupo), cargarTareasDef()]);
    panelData = data; panelFalla = ''; panelAt = Date.now();
  } catch (err){ console.warn(err); panelFalla = errorMsg(err); }
}

/** Las cifras de cada persona: videos vistos, tareas completas y quizzes. */
function avanceDe(m){
  const videos = panelData.posts.filter(p => esVideo({ videoUrl:p.video_url, videoName:p.video_name }));
  const idsVideo = new Set(videos.map(p => p.id));
  const idsQuiz  = new Set(panelData.quizzes.map(q => q.id));
  const tareas = panelTareas || [];
  const c = m.tareas?.c || {}, r = m.tareas?.r || {};
  const hechas = tareas.filter(t => t.checks.every(id => c[id]) && (!t.radio || r[t.radio])).length;
  const quizzesR = (m.quizzes || []).filter(q => idsQuiz.has(q.quiz_id));
  // Grabaciones de su empresa: cuántas terminó y cuántas veces le dio reproducir
  const grabs = panelData.grabaciones || [];
  const pg = m.grabaciones || {};
  return {
    grabsVistas: grabs.filter(x => pg[x.id]?.completado).length, grabsTotal: grabs.length,
    reproducciones: Object.values(pg).reduce((n, x) => n + (x.vistas || 0), 0),
    dias: m.dias_activos || 0,
    vistos: (m.vistos || []).filter(id => idsVideo.has(id)).length, videos: videos.length,
    tareas: hechas, tareasTotal: tareas.length,
    quizzes: quizzesR.length, quizzesTotal: idsQuiz.size,
    nota: quizzesR.length ? Math.round(quizzesR.reduce((a, q) => a + q.puntaje / q.total, 0) / quizzesR.length * 100) : null,
  };
}

const miniBarra = (n, total) => `
  <div class="mini"><span>${n} de ${total}</span>
    <div class="quiz-barra ${total && n / total < .5 ? 'is-baja' : ''}"><i style="width:${pct(n, total)}%"></i></div></div>`;

function filasPanel(){
  const f = sinTildes(panelBuscar);
  const filas = panelData.miembros
    .filter(m => !f || sinTildes(m.nombre + ' ' + m.email).includes(f))
    .map(m => ({ m, a:avanceDe(m) }));
  const avance = ({ a }) => (pct(a.grabsVistas, a.grabsTotal) + pct(a.vistos, a.videos) + pct(a.tareas, a.tareasTotal) + (a.nota || 0)) / 4;
  filas.sort(panelOrden === 'menos' ? (x, y) => avance(x) - avance(y)
           : panelOrden === 'ingreso' ? (x, y) => (new Date(y.m.ultimo_acceso || 0)) - (new Date(x.m.ultimo_acceso || 0))
           : (x, y) => (x.m.nombre || x.m.email).localeCompare(y.m.nombre || y.m.email, 'es'));
  return filas;
}

function filasPanelHtml(){
  const filas = filasPanel();
  if (!filas.length) return `<tr><td colspan="7" class="celda-sub">${panelBuscar ? `Nadie coincide con «${escapeHtml(panelBuscar)}».` : 'Este grupo todavía no tiene personas.'}</td></tr>`;
  return filas.map(({ m, a }) => `
    <tr class="${m.activo ? '' : 'is-off'}">
      <td><b>${escapeHtml(m.nombre || m.email)}</b>${m.rol === 'responsable' ? ' <span class="gr-tipo">Responsable</span>' : ''}
          <small class="celda-sub">${escapeHtml(m.email)}${m.activo ? '' : ' · sin acceso'}</small></td>
      <td>${m.ultimo_acceso ? haceTxt(m.ultimo_acceso) : '<span class="celda-sub">Nunca ha entrado</span>'}</td>
      <td>${miniBarra(a.grabsVistas, a.grabsTotal)}${a.reproducciones ? `<small class="celda-sub">${a.reproducciones} ${a.reproducciones === 1 ? 'reproducción' : 'reproducciones'}</small>` : ''}</td>
      <td>${a.dias}</td>
      <td>${miniBarra(a.vistos, a.videos)}</td>
      <td>${miniBarra(a.tareas, a.tareasTotal)}</td>
      <td>${a.quizzesTotal ? `${a.quizzes} de ${a.quizzesTotal}${a.nota !== null ? ` · <b>${a.nota}%</b>` : ''}` : '—'}</td>
    </tr>`).join('');
}

function panelHtml(){
  const ops = panelOpciones();
  if (!ops.length) return `
    <div class="empty">
      <svg class="ico"><use href="#i-chart"/></svg>
      <h3>${IS_ADMIN ? 'Todavía no hay grupos' : 'No tienes equipos a cargo'}</h3>
      <p>${IS_ADMIN ? escapeHtml(gruposFalla) || 'Crea la primera empresa o cohorte en <b>Empresas y cohortes</b>.' : 'Si deberías ver el avance de tu equipo, escríbele al equipo de PorContar.'}</p>
    </div>`;
  if (panelFalla && !panelData) return `
    <div class="empty">
      <svg class="ico"><use href="#i-chart"/></svg>
      <h3>El panel no está disponible</h3>
      <p>${escapeHtml(panelFalla)}</p>
    </div>`;
  if (!panelData) return `<div class="empty"><svg class="ico"><use href="#i-chart"/></svg><h3>Cargando el panel…</h3></div>`;

  const g = panelData.grupo;
  const activos = panelData.miembros.filter(m => m.activo);
  const av = activos.map(avanceDe);
  const entraron = activos.filter(m => m.ultimo_acceso).length;
  const prom = (f, t) => av.length ? Math.round(av.reduce((s, a) => s + pct(f(a), t(a)), 0) / av.length) : 0;
  const notas = av.filter(a => a.nota !== null);
  const e = estadoGrupo({ ...g, activo:g.activo });

  return `
    <div class="card panel-cab">
      <div class="panel-cab-top">
        <div>
          ${ops.length > 1
            ? `<select class="panel-sel" data-panel-grupo aria-label="Grupo">${ops.map(o =>
                `<option value="${o.id}" ${o.id === panelGrupo ? 'selected' : ''}>${escapeHtml(o.nombre)}</option>`).join('')}</select>`
            : `<h3 class="panel-nombre">${escapeHtml(g.nombre)}</h3>`}
          <p class="quiz-meta"><span class="gr-estado ${e.cls}">${escapeHtml(e.txt)}</span>
            · Actualizado ${panelAt ? haceTxt(panelAt).toLowerCase() : ''} · se actualiza solo cada minuto</p>
        </div>
        <div class="quiz-acciones">
          <button class="btn" data-panel-refrescar>Actualizar</button>
          <button class="btn" data-panel-csv><svg class="ico"><use href="#i-download"/></svg> Descargar para Excel</button>
        </div>
      </div>
      <div class="quiz-cifras">
        <div><b>${entraron} de ${activos.length}</b><span>personas ya entraron</span></div>
        <div><b>${prom(a => a.grabsVistas, a => a.grabsTotal)}%</b><span>de las grabaciones vistas, en promedio</span></div>
        <div><b>${prom(a => a.tareas, a => a.tareasTotal)}%</b><span>de las tareas completas, en promedio</span></div>
        <div><b>${notas.length ? Math.round(notas.reduce((s, a) => s + a.nota, 0) / notas.length) + '%' : '—'}</b>
             <span>${notas.length ? `de aciertos en quizzes (${notas.length} ${notas.length === 1 ? 'persona' : 'personas'})` : 'nadie ha respondido quizzes'}</span></div>
      </div>
    </div>

    <div class="card panel-tabla">
      <div class="panel-tools">
        <input type="search" id="panelBuscar" placeholder="Buscar por nombre o correo" value="${escapeHtml(panelBuscar)}" />
        <select id="panelOrden" aria-label="Ordenar">
          <option value="nombre"  ${panelOrden === 'nombre'  ? 'selected' : ''}>Por nombre</option>
          <option value="menos"   ${panelOrden === 'menos'   ? 'selected' : ''}>Menos avance primero</option>
          <option value="ingreso" ${panelOrden === 'ingreso' ? 'selected' : ''}>Último ingreso</option>
        </select>
      </div>
      <div class="quiz-tabla">
        <table>
          <thead><tr><th>Persona</th><th>Último ingreso</th><th>Grabaciones</th><th>Días activos</th><th>Otros videos</th><th>Tareas</th><th>Quizzes</th></tr></thead>
          <tbody id="panelTbody">${filasPanelHtml()}</tbody>
        </table>
      </div>
    </div>`;
}

function descargarPanel(){
  const celda = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const filas = filasPanel().map(({ m, a }) => [
    m.nombre, m.email, m.rol, m.activo ? 'Sí' : 'No',
    m.ultimo_acceso ? new Date(m.ultimo_acceso).toLocaleString('es-CO') : 'Nunca',
    a.grabsVistas, a.grabsTotal, a.reproducciones, a.dias,
    a.vistos, a.videos, a.tareas, a.tareasTotal, a.quizzes, a.quizzesTotal, a.nota ?? '',
  ]);
  const cab = ['Nombre', 'Correo', 'Rol', 'Activo', 'Último ingreso',
               'Grabaciones vistas', 'Grabaciones en total', 'Reproducciones', 'Días activos',
               'Otros videos vistos', 'Otros videos en total',
               'Tareas completas', 'Tareas en total', 'Quizzes respondidos', 'Quizzes en total', 'Promedio quizzes (%)'];
  // Punto y coma y BOM: así Excel en español abre las columnas y las tildes bien
  const csv = '﻿' + [cab, ...filas].map(f => f.map(celda).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = `avance-${slug(panelData.grupo.nombre)}-${hoyIso()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('#posts').addEventListener('click', async e => {
  if (view.type !== 'panel') return;
  if (e.target.closest('[data-panel-refrescar]')){
    await cargarPanel(); render(); toast('Panel actualizado');
  }
  if (e.target.closest('[data-panel-csv]') && panelData) descargarPanel();
});
$('#posts').addEventListener('change', async e => {
  if (view.type !== 'panel') return;
  if (e.target.matches('[data-panel-grupo]')){
    panelGrupo = e.target.value; panelData = null; render();
    await cargarPanel(); render();
  }
  if (e.target.id === 'panelOrden'){ panelOrden = e.target.value; $('#panelTbody').innerHTML = filasPanelHtml(); }
});
$('#posts').addEventListener('input', e => {
  if (view.type === 'panel' && e.target.id === 'panelBuscar'){
    panelBuscar = e.target.value;
    $('#panelTbody').innerHTML = filasPanelHtml();
  }
});

/** Pantalla de entrada: correo + contraseña de la empresa o cohorte. */
function mostrarLogin(msg = ''){
  clearInterval(panelTimer);
  $('#login').hidden = false;
  document.body.classList.add('con-login');
  $('#loginMsg').textContent = msg;
  setTimeout(() => $('#loginEmail').focus(), 40);
}

/** Pantalla de la clave de admin (en /admin, la primera vez en cada equipo). Usa la misma tarjeta. */
let modoClaveAdmin = false;
function mostrarClaveAdmin(msg = ''){
  modoClaveAdmin = true;
  $('#loginForm h1').innerHTML = 'Modo <span class="u-mark">admin</span>';
  $('.login-sub').textContent = 'Escribe tu clave de admin. Se recuerda en este equipo: la próxima vez entras directo por /admin.';
  $('#loginEmail').closest('.field').hidden = true;
  $('#loginClave').closest('.field').querySelector('span').textContent = 'Clave de admin';
  $('#loginClave').autocomplete = 'off';
  $('.login-ayuda').innerHTML = '¿Querías entrar como estudiante? <a href="/">Ir a la academia</a>';
  mostrarLogin(msg);
  setTimeout(() => $('#loginClave').focus(), 60);
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (modoClaveAdmin){
    const clave = $('#loginClave').value.trim();
    const msg = $('#loginMsg'), btn = $('#loginBtn');
    if (!clave) return void (msg.textContent = 'Escribe la clave de admin.');
    btn.disabled = true; btn.textContent = 'Revisando…'; msg.textContent = '';
    try {
      // La base dice si la clave es la buena; solo entonces se guarda en este equipo
      const { data, error } = await ACADEMIA.cliente({ 'x-admin-key':clave }).rpc('is_admin');
      if (error) throw error;
      if (data !== true) throw new Error('Esa clave no es válida. Revisa que esté completa y sin espacios.');
      ACADEMIA.guardarAdmin(clave);
      location.reload();
    } catch (err){
      msg.textContent = /Failed to fetch|NetworkError/i.test(err?.message || '') ? 'Sin conexión. Revisa tu internet.' : (err?.message || String(err));
      btn.disabled = false; btn.textContent = 'Entrar';
    }
    return;
  }
  const email = $('#loginEmail').value.trim();
  const clave = $('#loginClave').value;
  const msg = $('#loginMsg'), btn = $('#loginBtn');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return void (msg.textContent = 'Escribe tu correo completo.');
  if (!clave) return void (msg.textContent = 'Escribe la contraseña.');

  btn.disabled = true; btn.textContent = 'Entrando…'; msg.textContent = '';
  try {
    ACADEMIA.olvidarToken();
    const { data, error } = await ACADEMIA.cliente().rpc('entrar', { p_email:email, p_clave:clave });
    if (error) throw error;
    if (!data?.token) throw new Error(data?.error || 'No se pudo entrar. Inténtalo de nuevo.');
    ACADEMIA.guardarToken(data.token);
    location.reload();   // arranca de cero con la identidad nueva
  } catch (err){
    msg.textContent = /Failed to fetch|NetworkError/i.test(err?.message || '')
      ? 'Sin conexión. Revisa tu internet.'
      : /could not find|schema cache/i.test(err?.message || '')
        ? 'La Academia todavía no está lista para entrar. Avísale al equipo de PorContar.'
        : (err?.message || String(err));
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});

(async function init(){
  buildNav();

  // Con la base en la nube nadie entra sin identificarse: o es admin o tiene sesión
  // /admin sin clave guardada en este equipo: se pide la clave de admin
  if (CLOUD && ACADEMIA.rutaAdmin() && !ADMIN_KEY) return mostrarClaveAdmin();
  if (CLOUD && !ADMIN_KEY && !ACADEMIA.token()) return mostrarLogin();
  store = CLOUD ? cloudStore() : localStore();

  try {
    await store.init();

    if (ADMIN_KEY){
      IS_ADMIN = await store.checkAdmin();
      if (!IS_ADMIN){
        // La clave guardada ya no sirve (se cambió o estaba mal escrita): se vuelve a pedir
        ACADEMIA.olvidarAdmin();
        return mostrarClaveAdmin('Esa clave no es válida. Escríbela de nuevo.');
      }
    }

    if (CLOUD && !IS_ADMIN){
      PERFIL = await store.perfil();
      if (!PERFIL || !PERFIL.grupos?.length){
        ACADEMIA.olvidarToken();
        return mostrarLogin(PERFIL
          ? 'Tu acceso terminó o ya no estás en un grupo activo. Escríbele a quien coordina el programa.'
          : 'Tu sesión terminó. Vuelve a entrar.');
      }
      vistos = new Set(await store.misVistos().catch(err => { console.warn(err); return []; }));
    }

    if (IS_ADMIN && CLOUD) await cargarGrupos();
    applyMode();

    // Fase 1: el reto, el cronograma y las grabaciones. Si falta supabase-fase1.sql,
    // la academia sigue con las sesiones de siempre y sin cronograma.
    try {
      const ss = await store.sesiones();
      if (ss.length) SESSIONS = ss;
      [CRONO, GRABS] = await Promise.all([store.cronograma(), store.grabaciones()]);
      if (PERFIL) progresoVideo = await store.miProgresoVideo();
      fase1 = true;
    } catch (err){ console.warn("Fase 1 no disponible (falta supabase-fase1.sql):", err); }
    pintarNav();

    posts = await store.list();

    // El catálogo de skills es independiente: si su tabla aún no existe,
    // el muro sigue funcionando y solo se queda vacío ese módulo.
    try {
      skills = await store.listSkills();
      if (!IS_ADMIN) skills = skills.filter(s => s.visible !== false);
    }
    catch (err){
      console.warn('Catálogo de skills no disponible:', err);
      skills = [];
    }

    // Los quizzes también: si falta su tabla (supabase-extras.sql), el resto del muro no se entera.
    try { await cargarQuizzes(); }
    catch (err){
      console.warn('Quizzes no disponibles:', err);
      quizzes = []; estadisticas = [];
    }
  } catch (err){
    console.error(err);
    applyMode();
    posts = [];
    toast(CLOUD ? 'No se pudo cargar el muro: ' + errorMsg(err)
                : 'No se pudo abrir el almacenamiento local');
  }

  if (!CLOUD) console.warn('Muro en modo local: falta SUPABASE_ANON_KEY en config.js');
  // Lo primero que se ve es el inicio con el cronograma; sin él, la primera clase no oculta
  const inicio = SESSIONS.find(s => !isHidden(s.id)) || SESSIONS[0];
  view = fase1 ? { type:'inicio', id:null } : { type:'session', id:inicio.id };
  render();
})();
