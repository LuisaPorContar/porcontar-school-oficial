/* ================================================================
   Sesión de la Academia — compartida por el muro y el trabajo autónomo

   · Estudiante / responsable: entra con su correo y la contraseña de su
     empresa o cohorte. La base devuelve un token que se guarda en este
     navegador y viaja en la cabecera x-sesion. La base decide qué ve.
   · Admin: index.html?admin=LA-CLAVE una vez. La clave se pasa a la
     memoria de la pestaña y se borra de la URL, para que no quede en el
     historial ni salga en una captura o al compartir pantalla.
   ================================================================ */
(function(){
  var TOKEN_KEY = 'academia-sesion';
  var ADMIN_KEY = 'academia-admin';

  function leer(store, k){ try { return store.getItem(k) || ''; } catch (e) { return ''; } }
  function escribir(store, k, v){
    try { v ? store.setItem(k, v) : store.removeItem(k); } catch (e) {}
  }

  // La clave de admin llega por la URL solo la primera vez
  (function(){
    var params = new URLSearchParams(location.search);
    var clave = (params.get('admin') || '').trim();
    if (!clave) return;
    escribir(sessionStorage, ADMIN_KEY, clave);
    params.delete('admin');
    var limpia = location.pathname + (params.toString() ? '?' + params : '') + location.hash;
    try { history.replaceState(null, '', limpia); } catch (e) {}
  })();

  window.ACADEMIA = {
    token:    function(){ return leer(localStorage, TOKEN_KEY); },
    adminKey: function(){ return leer(sessionStorage, ADMIN_KEY); },
    guardarToken: function(t){ escribir(localStorage, TOKEN_KEY, t); },
    olvidarToken: function(){ escribir(localStorage, TOKEN_KEY, ''); },
    olvidarAdmin: function(){ escribir(sessionStorage, ADMIN_KEY, ''); },

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
