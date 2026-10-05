/* ================================================================
   Sesión de la Academia — compartida por el muro y el trabajo autónomo

   · Estudiante / responsable: entra con su correo y la contraseña de su
     empresa o cohorte. La base devuelve un token que se guarda en este
     navegador y viaja en la cabecera x-sesion. La base decide qué ve.
   · Admin: entra por /admin (academia.porcontar.com/admin) con SU correo
     y SU contraseña. La base devuelve una sesión de admin que vence a los
     7 días y viaja en la cabecera x-admin-sesion. Fuera de /admin se ve
     la academia como un estudiante.
   ================================================================ */
(function(){
  var TOKEN_KEY = 'academia-sesion';
  var ADMIN_KEY = 'academia-admin-sesion';

  function leer(store, k){ try { return store.getItem(k) || ''; } catch (e) { return ''; } }
  function escribir(store, k, v){
    try { v ? store.setItem(k, v) : store.removeItem(k); } catch (e) {}
  }
  // Las versiones anteriores guardaban la clave larga: se borra de este equipo
  try { sessionStorage.removeItem('academia-admin'); localStorage.removeItem('academia-admin'); } catch (e) {}

  /** La ubicación que manda: la de la página, o la que contiene al trabajo autónomo (iframe). */
  function ubicacion(){
    try { if (window.parent !== window) return window.parent.location; } catch (e) {}
    return location;
  }
  var enAdmin = /\/admin\/?$/.test(ubicacion().pathname);

  // Enlace viejo ?admin=…: ya no se usa; lleva a /admin, donde se entra con correo y contraseña
  if (window.parent === window && new URLSearchParams(location.search).has('admin')){
    location.replace(location.origin + '/admin');
  }

  window.ACADEMIA = {
    /** ¿La dirección es la de admin? */
    rutaAdmin: function(){ return enAdmin; },
    token:    function(){ return leer(localStorage, TOKEN_KEY); },
    /** La sesión de admin solo cuenta dentro de /admin: fuera de ahí se ve como estudiante. */
    adminKey: function(){ return enAdmin ? leer(localStorage, ADMIN_KEY) : ''; },
    guardarAdmin: function(t){ escribir(localStorage, ADMIN_KEY, t); },
    olvidarAdmin: function(){ escribir(localStorage, ADMIN_KEY, ''); },
    guardarToken: function(t){ escribir(localStorage, TOKEN_KEY, t); },
    olvidarToken: function(){ escribir(localStorage, TOKEN_KEY, ''); },

    /** Cabeceras que identifican a quien pide: la base las lee en cada consulta. */
    headers: function(){
      var h = {}, a = this.adminKey(), t = this.token();
      if (a) h['x-admin-sesion'] = a;
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
