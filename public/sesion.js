/* ================================================================
   Sesión de la Academia — compartida por el muro y el trabajo autónomo

   · Estudiante / responsable: entra con su correo y la contraseña de su
     empresa o cohorte. La base devuelve un token que se guarda en este
     navegador y viaja en la cabecera x-sesion. La base decide qué ve.
   · Admin: la dirección con ?admin=LA-CLAVE. La clave se queda fija en la
     barra: mientras esté ahí, se está en modo admin; quitándola, se ve la
     academia como un estudiante. No se guarda en ningún otro lado.
   ================================================================ */
(function(){
  var TOKEN_KEY = 'academia-sesion';
  var ADMIN_KEY = 'academia-admin';

  function leer(store, k){ try { return store.getItem(k) || ''; } catch (e) { return ''; } }
  function escribir(store, k, v){
    try { v ? store.setItem(k, v) : store.removeItem(k); } catch (e) {}
  }

  // Antes la clave se guardaba en la pestaña: se borra para que solo mande la URL
  try { sessionStorage.removeItem(ADMIN_KEY); } catch (e) {}

  /** La clave de la URL. Dentro del trabajo autónomo (un iframe) se lee la de la página que lo contiene. */
  function claveUrl(){
    var q = location.search;
    try { if (window.parent !== window) q = window.parent.location.search; } catch (e) {}
    return (new URLSearchParams(q).get('admin') || '').trim();
  }

  window.ACADEMIA = {
    token:    function(){ return leer(localStorage, TOKEN_KEY); },
    adminKey: function(){ return claveUrl(); },
    guardarToken: function(t){ escribir(localStorage, TOKEN_KEY, t); },
    olvidarToken: function(){ escribir(localStorage, TOKEN_KEY, ''); },
    olvidarAdmin: function(){},   // la clave vive solo en la URL

    /** Cabeceras que identifican a quien pide: la base las lee en cada consulta. */
    headers: function(){
      var h = {}, a = this.adminKey(), t = this.token();
      if (a) h['x-admin-key'] = a;
      if (t) h['x-sesion'] = t;
      return h;
    },

    /** Cliente de Supabase con la identidad de quien mira (o null si no hay nube). */
    cliente: function(){
      var CFG = window.MURO_CONFIG || {};
      if (!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase)) return null;
      return window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession:false },
        global: { headers: this.headers() },
      });
    },
  };
})();
