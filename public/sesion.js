/* ================================================================
   Sesión de la Academia — compartida por el muro y el trabajo autónomo

   · Estudiante / responsable: entra con su correo y la contraseña de su
     empresa o cohorte. La base devuelve un token que se guarda en este
     navegador y viaja en la cabecera x-sesion. La base decide qué ve.
   · Admin: la dirección termina en /admin (academia.porcontar.com/admin).
     La primera vez pide la clave y la recuerda en este equipo. Mientras la
     dirección diga /admin se está en modo admin; sin /admin se ve la
     academia como un estudiante. Los enlaces viejos ?admin=CLAVE guardan
     la clave y pasan a /admin.
   ================================================================ */
(function(){
  var TOKEN_KEY = 'academia-sesion';
  var ADMIN_KEY = 'academia-admin';          // la clave guardada en este equipo

  function leer(store, k){ try { return store.getItem(k) || ''; } catch (e) { return ''; } }
  function escribir(store, k, v){
    try { v ? store.setItem(k, v) : store.removeItem(k); } catch (e) {}
  }
  // De versiones anteriores
  try { sessionStorage.removeItem(ADMIN_KEY); } catch (e) {}

  /** La ubicación que manda: la de la página, o la que contiene al trabajo autónomo (iframe). */
  function ubicacion(){
    try { if (window.parent !== window) return window.parent.location; } catch (e) {}
    return location;
  }
  var enAdmin = /\/admin\/?$/.test(ubicacion().pathname);

  // Enlace viejo ?admin=CLAVE: se guarda la clave y se pasa a /admin
  (function(){
    if (window.parent !== window) return;
    var params = new URLSearchParams(location.search);
    var clave = (params.get('admin') || '').trim();
    if (!clave) return;
    escribir(localStorage, ADMIN_KEY, clave);
    location.replace(location.origin + '/admin' + location.hash);
  })();

  window.ACADEMIA = {
    /** ¿La dirección es la de admin? (con o sin clave guardada) */
    rutaAdmin: function(){ return enAdmin; },
    token:    function(){ return leer(localStorage, TOKEN_KEY); },
    /** La clave solo cuenta dentro de /admin: fuera de ahí se ve como estudiante. */
    adminKey: function(){ return enAdmin ? leer(localStorage, ADMIN_KEY) : ''; },
    guardarAdmin: function(c){ escribir(localStorage, ADMIN_KEY, (c || '').trim()); },
    olvidarAdmin: function(){ escribir(localStorage, ADMIN_KEY, ''); },
    guardarToken: function(t){ escribir(localStorage, TOKEN_KEY, t); },
    olvidarToken: function(){ escribir(localStorage, TOKEN_KEY, ''); },

    /** Cabeceras que identifican a quien pide: la base las lee en cada consulta. */
    headers: function(){
      var h = {}, a = this.adminKey(), t = this.token();
      if (a) h['x-admin-key'] = a;
      if (t) h['x-sesion'] = t;
      return h;
    },

    /** Cliente de Supabase con la identidad de quien mira (o null si no hay nube). */
    cliente: function(extra){
      var CFG = window.MURO_CONFIG || {};
      if (!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase)) return null;
      var h = this.headers();
      for (var k in (extra || {})) h[k] = extra[k];
      return window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession:false },
        global: { headers: h },
      });
    },
  };
})();
