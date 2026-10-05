/* ================================================================
   Trabajo autónomo — avance de cada persona

   La persona ya entró a la Academia con su correo (sesion.js), así que
   no escribe su nombre: la base guarda lo que marca a nombre de su
   sesión (supabase-empresas.sql) y su responsable lo ve en el panel.
   El admin ve la lista como la ve un estudiante; lo que marca no se guarda.
   Sin Supabase (modo prueba) todo se guarda en este navegador.
   ================================================================ */
(function(){
  var CFG = window.MURO_CONFIG || {};
  var CLOUD = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);
  var sb = CLOUD ? ACADEMIA.cliente() : null;

  var LOCAL_KEY = 'muro-academia-tareas-local';   // solo en modo prueba

  var $ = function(id){ return document.getElementById(id); };
  var checks   = [].slice.call(document.querySelectorAll('.steps input[type=checkbox]'));
  var radios   = [].slice.call(document.querySelectorAll('input[type=radio]'));
  var tasks    = [].slice.call(document.querySelectorAll('.task'));
  var sessions = [].slice.call(document.querySelectorAll('details.ses'));
  var guarda = false, timer = null;

  var FALTA_SQL = /could not find the function|schema cache|does not exist/i;
  function errorTxt(err){
    var m = (err && err.message) || String(err);
    if (FALTA_SQL.test(m)) return 'Esta parte de la Academia todavía no está activada. Avísale al equipo.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Revisa tu internet.';
    return m;
  }

  /* ---------- Casillas ---------- */
  function leerEstado(){
    var s = { c:{}, r:{} };
    checks.forEach(function(c){ if (c.checked) s.c[c.id] = true; });
    radios.forEach(function(r){ if (r.checked) s.r[r.name] = r.value; });
    return s;
  }
  function ponerEstado(s){
    s = s || {};
    var c = s.c || {}, r = s.r || {};
    checks.forEach(function(x){ x.checked = !!c[x.id]; });
    radios.forEach(function(x){ x.checked = (r[x.name] === x.value); });
    render();
  }
  function taskStatus(t){
    var boxes = [].slice.call(t.querySelectorAll('.steps input'));
    var total = boxes.length, got = boxes.filter(function(b){ return b.checked; }).length;
    var rads = [].slice.call(t.querySelectorAll('input[type=radio]'));
    if (rads.length){ total += 1; if (rads.some(function(r){ return r.checked; })) got += 1; }
    return { got:got, total:total, ok:got === total };
  }
  function render(){
    var done = 0;
    tasks.forEach(function(t){
      var st = taskStatus(t);
      t.setAttribute('data-done', st.ok ? 'true' : 'false');
      t.querySelector('[data-count]').textContent = st.got + ' de ' + st.total;
      if (st.ok) done++;
    });
    sessions.forEach(function(d){
      var ts = [].slice.call(d.querySelectorAll('.task'));
      var n = ts.filter(function(t){ return t.getAttribute('data-done') === 'true'; }).length;
      var all = (n === ts.length);
      d.setAttribute('data-complete', all ? 'true' : 'false');
      d.querySelector('[data-pill]').textContent = all ? 'Completa' : n + ' de ' + ts.length + ' tareas';
    });
    $('progTxt').textContent = done + ' de ' + tasks.length;
    $('progFill').style.width = (done / tasks.length * 100) + '%';
    $('progBar').setAttribute('aria-valuenow', done);
    $('progBar').setAttribute('aria-valuemax', tasks.length);
    $('doneMsg').hidden = (done !== tasks.length);
  }

  /* ---------- Base de datos ---------- */
  function rpc(fn, args){
    return sb.rpc(fn, args).then(function(res){ if (res.error) throw res.error; return res.data; });
  }
  function cargar(){
    if (!CLOUD){ try { return Promise.resolve(JSON.parse(localStorage.getItem(LOCAL_KEY)) || {}); } catch (e) { return Promise.resolve({}); } }
    return rpc('tareas_cargar').then(function(d){ return d || {}; });
  }
  function guardar(estado){
    if (!CLOUD){ try { localStorage.setItem(LOCAL_KEY, JSON.stringify(estado)); } catch (e) {} return Promise.resolve(); }
    return rpc('tareas_guardar', { p_estado:estado });
  }

  function mostrarLista(){ $('lista').hidden = false; $('pie').hidden = false; }
  function aviso(titulo, texto){
    $('avisoTit').textContent = titulo; $('avisoTxt').textContent = texto; $('aviso').hidden = false;
  }

  function alCambiar(){
    render();
    if (!guarda) return;   // el admin solo previsualiza la lista
    $('estado').textContent = 'Guardando…';
    clearTimeout(timer);
    timer = setTimeout(function(){
      guardar(leerEstado())
        .then(function(){ $('estado').textContent = 'Guardado'; })
        .catch(function(err){ $('estado').textContent = 'No se pudo guardar: ' + errorTxt(err); });
    }, 500);
  }
  checks.concat(radios).forEach(function(el){ el.addEventListener('change', alCambiar); });
  $('reset').addEventListener('click', function(){
    if (guarda && !confirm('¿Borrar todo lo que marcaste?')) return;
    checks.forEach(function(c){ c.checked = false; });
    radios.forEach(function(r){ r.checked = false; });
    alCambiar();
  });

  /* ---------- Arranque ---------- */
  function esAdminReal(){
    if (!ACADEMIA.adminKey()) return Promise.resolve(false);
    if (!CLOUD) return Promise.resolve(true);
    return sb.rpc('is_admin').then(function(res){ return !res.error && res.data === true; });
  }
  ponerEstado({});
  esAdminReal().then(function(admin){
    if (admin){
      aviso('Vista previa', 'Así ven las tareas los estudiantes. Lo que marques aquí no se guarda. ' +
            'El avance de cada persona está en el Panel de avance del menú.');
      mostrarLista();
      return;
    }
    if (CLOUD && !ACADEMIA.token()){
      aviso('Entra a la Academia', 'Para ver y guardar tus tareas, entra primero a la Academia con tu correo.');
      return;
    }
    var perfil = CLOUD ? rpc('mi_perfil') : Promise.resolve({ nombre:'Prueba local' });
    return Promise.all([perfil, cargar()]).then(function(r){
      if (!r[0]){ aviso('Tu sesión terminó', 'Vuelve a entrar a la Academia con tu correo.'); return; }
      $('meNombre').textContent = r[0].nombre || r[0].email;
      $('me').hidden = false;
      guarda = true;
      ponerEstado(r[1]);
      mostrarLista();
    });
  }).catch(function(err){
    aviso('No pudimos cargar tus tareas', errorTxt(err));
  });
})();
