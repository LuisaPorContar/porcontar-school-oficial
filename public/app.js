/* ================================================================
   PorContar Academia — Muro de sesiones

   Almacenamiento: Supabase (tabla posts + bucket videos) cuando hay
   clave en config.js; si no, modo local con IndexedDB en el navegador.
   ================================================================ */

const CFG = window.MURO_CONFIG || {};

/* Las clases de la Academia, en el orden del cronograma (una por semana). */
const SESSIONS = [
  { id:'s0', icon:'s-0', short:'Sesión 0', name:'Kick off',
    desc:'Arranque del reto: cómo funciona, qué vamos a construir y qué dejar listo.' },
  { id:'s1', icon:'s-base', short:'Sesión 1', name:'Arquitectura de tu Máquina Comercial con IA',
    desc:'Las piezas de Claude (skills, plugins, artefactos y design system) y cómo se arman en una máquina comercial.' },
  { id:'s2', icon:'s-funnel', short:'Sesión 2', name:'Cerebro Comercial y Funnel Inteligente con IA',
    desc:'El camino que hace el cliente desde que te descubre hasta que compra, y dónde ayuda la IA.' },
  { id:'s3', icon:'s-design', short:'Sesión 3', name:'Sistema Creativo de Diseño Gráfico con IA',
    desc:'Piezas gráficas hechas con Claude Design y Claude Code.' },
  { id:'s4', icon:'s-web', short:'Sesión 4', name:'Páginas web, SEO y GEO con IA',
    desc:'Visibilidad y conversión en la nueva búsqueda: que Google y las IA te encuentren.' },
  { id:'s5', icon:'s-video', short:'Sesión 5', name:'Sistema de Producción Audiovisual con IA',
    desc:'Producir videos con ayuda de la inteligencia artificial.' },
  { id:'s6', icon:'s-viral', short:'Sesión 6', name:'Máquina de Crecimiento y Contenido en Redes Sociales',
    desc:'Planeación, publicación y medición del contenido en redes.' },
  { id:'s7', icon:'s-1', short:'Sesión 7', name:'Sistema de Ventas y Calificación con IA',
    desc:'Diseñar el proceso de ventas y calificar a los prospectos.' },
  { id:'s8', icon:'s-agent', short:'Sesión 8', name:'Fuerza Comercial de Agentes de IA',
    desc:'Agentes que hacen tareas comerciales solos, sin que estés encima.' },
  { id:'s9', icon:'s-crm', short:'Sesión 9', name:'Empleados Digitales para Ventas',
    desc:'Asistentes de IA que atienden, responden y hacen seguimiento como parte del equipo.' },
  { id:'s10', icon:'s-prospec', short:'Sesión 10', name:'Motor de Prospección y Adquisición de Leads con IA',
    desc:'Encontrar clientes nuevos y escribirles.' },
  { id:'s11', icon:'s-dash', short:'Sesión 11', name:'Analítica de Datos e Inteligencia Comercial con IA',
    desc:'Lead scoring, dashboard de seguimiento, cierres y optimización del pipeline.' },
  { id:'s12', icon:'s-ads', short:'Sesión 12', name:'Pauta Digital de Alto Rendimiento con Meta Ads e IA',
    desc:'Anuncios pagados en Meta: cómo armarlos y cuánto invertir.' },
].map(s => ({ ...s, title: `${s.short}. ${s.name}` }));

const REACTIONS = [
  { id:'like',  label:'Me gusta', path:'M7 21V10l5-7a2 2 0 0 1 3 2l-1 5h4.5a2 2 0 0 1 2 2.4l-1.5 7A2 2 0 0 1 17 21H7Zm0 0H3V10h4' },
  { id:'clap',  label:'Aplauso',  path:'M9 12 6.5 8.2a1.4 1.4 0 0 1 2.3-1.6l3 4M12 10.5 9.8 6.3a1.4 1.4 0 0 1 2.5-1.3L15 10M15 10.7l-1.2-3a1.4 1.4 0 0 1 2.6-1l2.1 5.4c1.2 3.1-.2 6.3-3.2 7.5s-6.2-.1-7.4-3.2L6.4 13a1.4 1.4 0 0 1 2.4-1.4' },
  { id:'idea',  label:'Idea',     path:'M9.5 18h5M10 21h4M12 3a6 6 0 0 1 3.6 10.8c-.6.5-.9 1.1-.9 1.7H9.3c0-.6-.3-1.2-.9-1.7A6 6 0 0 1 12 3Z' },
  { id:'fire',  label:'Top',      path:'M12 3s5 4 5 8a5 5 0 0 1-10 0c0-1.4.6-2.6 1.3-3.6C9 9.4 10 10 10 11c1-1.4 2-4.6 2-8Z' },
];
const REACTION_IDS = REACTIONS.map(r => r.id);

const ME = { name:'PorContar', initials:'PC' };

/* Dos accesos, sin usuarios ni contraseñas: la URL decide.
   index.html?admin=<clave> → puede publicar, editar y borrar
   index.html               → solo lee y reacciona

   La clave nunca está en el código: viaja en la URL de quien
   administra y quien la valida es la base de datos (is_admin()).   */
const ADMIN_KEY = (new URLSearchParams(location.search).get('admin') || '').trim();
let IS_ADMIN = false;   // se confirma contra la base en el arranque

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
  'Estrategia',
  'Email marketing',
  'Pauta digital',
  'Redes sociales',
  'Ventas',
  'SEO y GEO',
  'Contenido',
  'Diseño',
  'Video',
  'Prospección',
  'Analítica',
  'Agentes y automatización',
];
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
  const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession:false },
    global: { headers: ADMIN_KEY ? { 'x-admin-key': ADMIN_KEY } : {} },
  });
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
  });

  const fromRow = r => ({
    id:r.id, session:r.session, title:r.title || '', body:r.body || '',
    pinned:!!r.pinned, orden:Number.isFinite(r.orden) ? r.orden : null,
    author:r.author, initials:r.initials,
    videoUrl:r.video_url || null, videoPath:r.video_path || null, videoName:r.video_name || null,
    reactions:r.reactions || {}, createdAt:new Date(r.created_at).getTime(),
  });
  const toRow = p => ({
    id:p.id, session:p.session, title:p.title, body:p.body, pinned:p.pinned,
    // "orden" solo viaja si el admin ya movió la publicación: así, mientras
    // no se corra supabase-extras.sql, publicar y editar siguen funcionando
    ...(Number.isFinite(p.orden) ? { orden:p.orden } : {}),
    author:p.author, initials:p.initials,
    video_url:p.videoUrl, video_path:p.videoPath, video_name:p.videoName,
    updated_at:new Date().toISOString(),
  });
  const check = ({ error }) => { if (error) throw error; };

  const fromSkill = r => ({
    id:r.id, title:r.title || '', area:r.area || AREAS[0], level:r.level || NIVELES[0],
    tags:r.tags || '', objective:r.objective || '', prompt:r.prompt || '',
    visible:r.visible !== false,   // sin la columna (antes del SQL) todas se ven
    createdAt:new Date(r.created_at).getTime(),
  });
  const toSkill = s => ({
    id:s.id, title:s.title, area:s.area, level:s.level,
    tags:s.tags, objective:s.objective, prompt:s.prompt,
    // visible solo viaja si está apagada o se acaba de cambiar: así guardar sigue
    // funcionando aunque aún no se haya corrido supabase-skills-visibles.sql
    ...(s.visible === false || s.cambioVisible ? { visible:s.visible !== false } : {}),
    updated_at:new Date().toISOString(),
  });


  return {
    kind:'cloud',
    async init(){},

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
        orden:q.orden, preguntas:q.preguntas, updated_at:new Date().toISOString(),
      }));
    },
    /** La base califica y guarda el intento; devuelve el puntaje y las correctas. */
    async submitQuiz(id, nombre, respuestas){
      const { data, error } = await sb.rpc(rpcQzEnviar, { p_id:id, p_nombre:nombre, p_respuestas:respuestas });
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

  return {
    kind:'local',
    async checkAdmin(){ return !!ADMIN_KEY; },   // sin nube no hay quién valide
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
    async submitQuiz(id, nombre, respuestas){
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
const QUIZ_NOMBRE_KEY = 'muro-academia-nombre';
let quizzes       = [];
let estadisticas  = [];          // solo admin
let quizFalla     = '';          // por qué no cargaron (p. ej. falta correr el SQL)
let quizAbierto   = null;        // el quiz que se está respondiendo
let quizElegidas  = [];          // opción marcada en cada pregunta
let quizResultado = null;        // {puntaje, total, aciertos, correctas}
let quizEditando  = null;        // copia que edita el admin
let quizVista     = 'lista';     // lista | responder | resultado | stats | editar
let quizNombre    = (() => { try { return localStorage.getItem(QUIZ_NOMBRE_KEY) || ''; } catch { return ''; } })();
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

const sessionOf = id => id === FAQ_ID ? FAQ : id === TUTO_ID ? TUTO
                      : SESSIONS.find(s => s.id === id) || SESSIONS[0];
/** Vista que le corresponde a una publicación según su sección. */
const vistaDe = id => id === FAQ_ID ? { type:'faq' } : id === TUTO_ID ? { type:'tuto' }
                    : { type:'session', id };

/* ================================================================
   Sidebar y navegación
   ================================================================ */
function buildNav(){
  $('#navSessions').innerHTML = SESSIONS.map(s => `
    <div class="nav-row" data-row="${s.id}">
      <button class="nav-item" data-view="session" data-id="${s.id}" title="${escapeHtml(s.title)}">
        <svg class="ico"><use href="#${s.icon}"/></svg>
        <span class="nav-label">
          <em>${escapeHtml(s.short)}</em>
          <b>${escapeHtml(s.name)}</b>
        </span>
        <span class="count" data-count="${s.id}">0</span>
      </button>
      <button class="nav-eye" data-hide="${s.id}" aria-pressed="false"
              aria-label="Ocultar ${escapeHtml(s.short)}" title="Ocultar esta clase">
        <svg class="ico"><use href="#i-eye"/></svg>
      </button>
    </div>`).join('') + `
    <button class="nav-item" data-view="quiz" title="Quizzes para evaluar lo aprendido">
      <svg class="ico"><use href="#i-quiz"/></svg>
      <span class="nav-label">
        <em>Evaluación</em>
        <b>Quizz</b>
      </span>
      <span class="count" id="countQuiz">0</span>
    </button>`;

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

  $('#nav').addEventListener('click', e => {
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
  if (type === 'quiz'){                 // se entra siempre por la lista, con datos frescos
    quizVista = 'lista'; quizAbierto = null; quizResultado = null; quizEditando = null;
    cargarQuizzes().catch(err => console.warn(err)).then(render);   // si falla, la vista dice por qué
  }
  render();
  window.scrollTo({ top:0, behavior:'smooth' });
}

function currentList(){
  let list = posts.slice();
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
function render(){
  objectUrls.splice(0).forEach(URL.revokeObjectURL);

  if (view.type === 'session' && query){
    $('#viewTitle').textContent = 'Resultados de búsqueda';
    $('#viewSubtitle').textContent = `“${query}” en todas las clases`;
  } else if (view.type === 'session'){
    const s = sessionOf(view.id);
    $('#viewTitle').textContent = s.title;
    $('#viewSubtitle').textContent = s.desc;
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
    $('#viewTitle').textContent = 'Quizz';
    $('#viewSubtitle').textContent = IS_ADMIN
      ? 'Arma los quizzes y mira cuánto acertó el grupo'
      : 'Pon a prueba lo aprendido en cada clase';
  } else if (view.type === 'tareas'){
    $('#viewTitle').textContent = 'Trabajo autónomo';
    $('#viewSubtitle').textContent = IS_ADMIN
      ? 'El avance de cada persona en las tareas de cada sesión'
      : 'Las tareas de cada sesión: marca cada paso a medida que lo termines';
  } else if (view.type === 'config'){
    $('#viewTitle').textContent = 'Configurar Claude';
    $('#viewSubtitle').textContent = 'Qué dejar activo en la organización: qué hace cada ajuste y qué conviene encender';
  } else if (view.type === 'saved'){
    $('#viewTitle').textContent = 'Guardados';
    $('#viewSubtitle').textContent = 'Publicaciones que marcaste para revisar';
  }

  // Mientras se busca en todas las clases, ninguna queda marcada en el menú
  $$('.nav-item').forEach(b => b.classList.toggle('is-active',
    b.dataset.view === view.type && (b.dataset.id || null) === view.id &&
    !(view.type === 'session' && query)));

  SESSIONS.forEach(s => {
    const n = posts.filter(p => p.session === s.id).length;
    const c = $(`[data-count="${s.id}"]`);      if (c) c.textContent = n;
    const r = $(`[data-railcount="${s.id}"]`);  if (r) r.textContent = n;
    const d = $(`[data-dot="${s.id}"]`);        if (d) d.classList.toggle('on', n > 0);

    const oculta = isHidden(s.id);
    const fila = $(`[data-row="${s.id}"]`);
    if (fila){
      fila.classList.toggle('is-hidden', oculta);
      const ojo = $('[data-hide]', fila);
      ojo.setAttribute('aria-pressed', oculta);
      ojo.setAttribute('aria-label', (oculta ? 'Mostrar ' : 'Ocultar ') + s.short);
      ojo.title = oculta ? 'Mostrar esta clase' : 'Ocultar esta clase';
      $('use', ojo).setAttribute('href', oculta ? '#i-eye-off' : '#i-eye');
    }
    const li = $(`[data-rail="${s.id}"]`);      if (li) li.classList.toggle('is-hidden', oculta);
  });
  $('#countSaved').textContent = posts.filter(p => isSaved(p.id)).length;
  const ct = $('#countTuto');
  if (ct) ct.textContent = posts.filter(p => p.session === TUTO_ID).length;
  const pendientes = posts.filter(sinRespuesta).length;
  const cf = $('#countFaq');
  if (cf){   // al admin el contador le muestra lo que falta responder, resaltado
    const alerta = IS_ADMIN && pendientes > 0;
    cf.textContent = alerta ? pendientes : posts.filter(p => p.session === FAQ_ID).length;
    cf.classList.toggle('is-alert', alerta);
    cf.title = alerta ? `${pendientes} por responder` : '';
  }
  if (IS_ADMIN) $('#railPregunta').innerHTML = railAdminHtml(pendientes);

  const withContent = SESSIONS.filter(s => posts.some(p => p.session === s.id)).length;
  $('#progressFill').style.width = (withContent / SESSIONS.length * 100) + '%';
  $('#progressText').textContent = `${withContent} de ${SESSIONS.length} sesiones con contenido`;

  // El documento ocupa todo el panel: sin composer ni publicaciones
  // Catálogo de skills: las áreas se filtran desde el sidebar
  const enSkills  = view.type === 'skills';
  const enQuiz    = view.type === 'quiz';
  const enResumen = view.type === 'resumen';
  const enConfig  = view.type === 'config';
  const enTareas  = view.type === 'tareas';
  // Las clases del body van todas aquí: cada vista sale antes con su return
  document.body.classList.toggle('vista-skills', enSkills);
  document.body.classList.toggle('vista-quiz', enQuiz);
  document.body.classList.toggle('vista-resumen', enResumen || enConfig || enTareas);
  $('#countSkills').textContent = skills.length;
  const cq = $('#countQuiz');
  if (cq) cq.textContent = IS_ADMIN ? quizzes.filter(q => q.activo).length : quizzes.length;
  $('#navAreas').hidden = !enSkills;
  if (enSkills){
    $('#navAreas').innerHTML = ['todas', ...AREAS].map(a => {
      const n = a === 'todas' ? skills.length : skills.filter(s => s.area === a).length;
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
  ? skills
  : skills.filter(s => s.area === skillArea);

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
  $('#skfArea').innerHTML  = AREAS.map(a => `<option>${escapeHtml(a)}</option>`).join('');
  $('#skfLevel').innerHTML = NIVELES.map(n => `<option>${escapeHtml(n)}</option>`).join('');
  $('#skfTitle').value     = s ? s.title : '';
  $('#skfArea').value      = s ? s.area  : (skillArea === 'todas' ? AREAS[0] : skillArea);
  $('#skfLevel').value     = s ? s.level : NIVELES[0];
  $('#skfTags').value      = s ? s.tags  : '';
  $('#skfObjective').value = s ? s.objective : '';
  $('#skfPrompt').value    = s ? s.prompt : '';
  $('#skEdMsg').textContent = '';
  $('#skEdOverlay').hidden = false;
  setTimeout(() => $('#skfTitle').focus(), 40);
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
    </div>
  </article>`;
}

/** Una pregunta frecuente, en acordeón. La respuesta puede ser texto, video o ambos. */
function faqHtml(p, i, lista){
  const pendiente = sinRespuesta(p);
  return `
  <details class="faq ${pendiente ? 'is-pending' : ''}" data-post="${p.id}">
    <summary>
      <span class="faq-q">
        ${escapeHtml(p.title || 'Pregunta sin título')}
        ${pendiente ? `<span class="faq-badge">Sin responder</span>` : ''}
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

  const tarjetas = quizzes.map(q => {
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
  conDatos.forEach(s => (s.intentos || []).forEach(i => personas.add((i.nombre || '').toLowerCase())));
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
      <button class="btn quiz-volver" data-quiz-volver>← Volver a los quizzes</button>
      <h2 class="quiz-titulo">${escapeHtml(q.titulo)}</h2>
      ${q.descripcion ? `<p class="quiz-desc">${escapeHtml(q.descripcion)}</p>` : ''}
      <label class="field quiz-nombre">
        <span>Tu nombre</span>
        <input type="text" id="quizNombre" maxlength="80" placeholder="Nombre y apellido"
               value="${escapeHtml(quizNombre)}" autocomplete="name" />
      </label>
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
      <button class="btn quiz-volver" data-quiz-volver>← Volver a los quizzes</button>
      <div class="quiz-puntaje">
        <b>${r.puntaje} de ${r.total}</b>
        <span>${porcentaje}% de aciertos</span>
        <div class="quiz-barra"><i style="width:${porcentaje}%"></i></div>
      </div>
      <h2 class="quiz-titulo">${escapeHtml(q.titulo)}</h2>
      <ol class="quiz-lista">${detalle}</ol>
      <div class="quiz-enviar">
        <span class="quiz-meta">Puedes repetirlo: cuenta tu último intento.</span>
        <button class="btn btn-primary" data-quiz-abrir="${q.id}">Repetir el quiz</button>
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
    <tr><td>${escapeHtml(i.nombre)}</td><td>${i.puntaje} de ${i.total}</td>
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
      <button class="btn quiz-volver" data-quiz-volver>← Volver a los quizzes</button>
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
      <button class="btn quiz-volver" data-quiz-volver>← Volver a los quizzes</button>
      <h2 class="quiz-titulo">Editar el quiz ${q.orden || ''}</h2>
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
    const act = ev.target.closest('button')?.dataset.act; if (!act) return;
    closeMenus();
    if (act === 'edit') return openComposer(p);
    if (act === 'pin'){
      p.pinned = !p.pinned;
      try { await store.save(p); } catch (err){ p.pinned = !p.pinned; toast(errorMsg(err)); }
      render(); return;
    }
    if (act === 'del'){
      if (!confirm('¿Eliminar esta publicación? No se puede deshacer.')) return;
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
  $('#modalMsg').textContent = '';

  // un enlace embebible va en la pestaña "Enlace"; un archivo subido, en "Subir"
  const esEnlace = !!(post && post.videoUrl && toEmbed(post.videoUrl));
  $('#fUrl').value = esEnlace ? post.videoUrl : '';
  setTab(esEnlace ? 'url' : 'file');

  if (post && (post.videoPath || post.videoId)) showFileChip(post.videoName || 'Archivo adjunto');
  else { $('#fileChip').hidden = true; $('#dropzone').hidden = false; }

  $('#overlay').hidden = false;
  setTimeout(() => $('#fTitle').focus(), 40);
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
  const url   = $('#fUrl').value.trim();
  const usingUrl = $('.tab.is-active').dataset.tab === 'url';

  if (!title && !body && !pendingFile && !(usingUrl && url))
    return void ($('#modalMsg').textContent = 'Añade al menos un título, un texto o un video.');
  if (usingUrl && url && !/^https?:\/\//i.test(url))
    return void ($('#modalMsg').textContent = 'El enlace debe empezar por http:// o https://');

  const existing = editingId ? posts.find(p => p.id === editingId) : null;
  const p = existing
    ? { ...existing }
    : { id:uid(), author:ME.name, initials:ME.initials, createdAt:Date.now(), reactions:{} };

  p.session = $('#fSession').value;
  p.title   = title;
  p.body    = body;
  p.pinned  = $('#fPinned').checked;

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
    toast(existing ? 'Publicación actualizada' : 'Publicación creada');
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
  if (!confirm(`¿Eliminar la skill «${s.title}»? No se puede deshacer.`)) return;
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
    area:      deLista(AREAS,   meta.area),
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
  const badge = document.createElement('span');
  badge.className = 'mode ' + (IS_ADMIN ? 'mode-admin' : 'mode-read');
  badge.innerHTML = IS_ADMIN
    ? `<svg class="ico"><use href="#i-edit"/></svg>Modo edición`
    : `<svg class="ico"><use href="#i-feed"/></svg>Solo lectura`;
  $('.topbar-right').prepend(badge);
  // Columna derecha: el estudiante pregunta; el admin ve lo pendiente (se pinta en render)
  if (!IS_ADMIN) $('#railPregunta').innerHTML = preguntaFormHtml('rail');
  document.body.classList.toggle('modo-estudiante', !IS_ADMIN);   // el ojito es solo para estudiantes

  if (!IS_ADMIN){
    $('#btnNew').remove();
    $('#composerTrigger').remove();
    $('.brand-sub').textContent = 'Academia';
  }
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
    if (!confirm(`¿Quitar las respuestas de ${quien} en este quiz? No se puede deshacer.`)) return;
    try {
      await store.borrarPersonaQuiz(quizAbierto, borrarPersona.dataset.quizBorrarPersona);
      estadisticas = await store.quizStats();
      toast('Respuestas borradas');
    } catch (err){ toast(errorMsg(err)); }
    render();
    return;
  }

  if (e.target.closest('[data-quiz-vaciar]')){
    if (!confirm('¿Borrar todas las respuestas de este quiz? Las preguntas quedan como están.')) return;
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
  if (t.id === 'quizNombre'){ quizNombre = t.value; return; }
  if (!quizEditando) return;
  if (t.id === 'quizTitulo'){ quizEditando.titulo = t.value; return; }
  if (t.id === 'quizDesc'){ quizEditando.descripcion = t.value; return; }
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
  if (t.dataset.quizCorrecta !== undefined && quizEditando){
    quizEditando.preguntas[+t.dataset.quizCorrecta].correctIndex = +t.value;
    render();
  }
});

async function enviarQuiz(){
  const msg = $('#quizMsg'), btn = $('[data-quiz-enviar]');
  const nombre = (quizNombre || '').replace(/\s+/g, ' ').trim();
  if (nombre.length < 2){
    msg.textContent = 'Escribe tu nombre para enviar el quiz.';
    return $('#quizNombre')?.focus();
  }
  btn.disabled = true; btn.textContent = 'Enviando…'; msg.textContent = '';
  try {
    quizResultado = await store.submitQuiz(quizAbierto.id, nombre, quizElegidas);
    quizNombre = nombre;
    try { localStorage.setItem(QUIZ_NOMBRE_KEY, nombre); } catch {}
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
    verQuizzes();
    toast('Quiz guardado');
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
(async function init(){
  buildNav();
  store = CLOUD ? cloudStore() : localStore();

  try {
    await store.init();

    if (ADMIN_KEY){
      IS_ADMIN = await store.checkAdmin();
      if (!IS_ADMIN) toast('Esa clave de admin no es válida: entras en modo lectura');
    }
    applyMode();

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
  // Sin Feed, el muro abre en la primera clase que el estudiante no haya ocultado
  const inicio = SESSIONS.find(s => !isHidden(s.id)) || SESSIONS[0];
  view = { type:'session', id:inicio.id };
  render();
})();
