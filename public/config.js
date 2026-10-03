/* ================================================================
   Configuración del muro — PorContar Academia
   ================================================================
   OJO: este archivo se descarga con la página, así que TODO lo que
   pongas aquí es público. La clave de admin NO va aquí: viaja solo
   en la URL de quien administra (index.html?admin=LA-CLAVE) y quien
   decide si es válida es la base de datos, no el navegador.

   Mientras la URL y la anon key estén vacías, el muro funciona en
   modo local (IndexedDB): sirve para probarlo, pero no se comparte.
   ================================================================ */
window.MURO_CONFIG = {

  // PENDIENTE: Project URL del proyecto de Supabase de la academia
  SUPABASE_URL: '',

  // PENDIENTE: anon public key (Project Settings → API). Es pública por diseño.
  // NUNCA pongas aquí la service_role.
  SUPABASE_ANON_KEY: '',

  // Bucket de Supabase Storage donde se suben videos e imágenes (el nombre lo fija supabase-academia.sql)
  BUCKET: 'videos-academia',

  // Catálogo de skills (lo crea supabase-academia.sql)
  TABLE_SKILLS: 'skills',

  // Quizzes (los crea supabase-academia.sql): la tabla solo la lee el admin;
  // el estudiante pasa por las funciones, que nunca le mandan la correcta
  TABLE_QUIZZES:  'quizzes',
  RPC_QUIZ_LISTA: 'quizzes_publicos',
  RPC_QUIZ:       'quiz_publico',
  RPC_QUIZ_ENVIAR:'responder_quiz',
  RPC_QUIZ_STATS: 'quiz_stats',
  RPC_QUIZ_BORRAR_PERSONA: 'borrar_persona_quiz',   // limpiar pruebas: solo admin
  RPC_QUIZ_BORRAR_TODO:    'borrar_intentos_quiz',
};
