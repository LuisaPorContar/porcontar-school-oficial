/* ================================================================
   Trabajo autónomo — avance por persona

   Cada persona escribe nombre y apellido y la base le guarda lo que
   marca (supabase-tareas.sql). El admin ve una tarjeta por persona.
   El nombre se recuerda en este navegador hasta que toca "No soy yo".
   Sin Supabase (modo prueba) todo se guarda en este navegador.
   ================================================================ */
(function(){
  var CFG = window.MURO_CONFIG || {};
  var CLOUD = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);

  // La clave de admin viaja en la URL del muro, la página que contiene a esta
  var ADMIN_KEY = (function(){
    var url;
    try { url = window.parent.location.search; } catch (e) { url = location.search; }
    return (new URLSearchParams(url).get('admin') || '').trim();
  })();
  var sb = CLOUD ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession:false },
    global: { headers: ADMIN_KEY ? { 'x-admin-key': ADMIN_KEY } : {} },
  }) : null;

  var NOMBRE_KEY = 'muro-academia-tareas-nombre';
  var LOCAL_KEY  = 'muro-academia-tareas-local';   // solo en modo prueba

  var $ = function(id){ return document.getElementById(id); };
  var checks   = [].slice.call(document.querySelectorAll('.steps input[type=checkbox]'));
  var radios   = [].slice.call(document.querySelectorAll('input[type=radio]'));
  var tasks    = [].slice.call(document.querySelectorAll('.task'));
  var sessions = [].slice.call(document.querySelectorAll('details.ses'));
  var nombre = '', esAdmin = false, timer = null;

  var limpio = function(t){ return String(t || '').trim().replace(/\s+/g, ' '); };
  var clave  = function(t){ return limpio(t).toLowerCase(); };
  var esc = function(t){
    return String(t).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; });
  };
  function recordarNombre(n){
    try { n ? localStorage.setItem(NOMBRE_KEY, n) : localStorage.removeItem(NOMBRE_KEY); } catch (e) {}
  }
  function nombreRecordado(){
    try { return localStorage.getItem(NOMBRE_KEY) || ''; } catch (e) { return ''; }
  }
  function leerLocal(){ try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {}; } catch (e) { return {}; } }
  function escribirLocal(o){ try { localStorage.setItem(LOCAL_KEY, JSON.stringify(o)); } catch (e) {} }

  var FALTA_SQL = /could not find the function|schema cache|does not exist/i;
  function errorTxt(err){
    var m = (err && err.message) || String(err);
    if (FALTA_SQL.test(m)) return 'Esta parte del muro todavía no está activada. Avísale al equipo.';
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
  /** Las tareas cumplidas según el estado guardado de otra persona (para el admin). */
  function tareasDe(s){
    s = s || {};
    var c = s.c || {}, r = s.r || {};
    return tasks.map(function(t){
      var ok = [].slice.call(t.querySelectorAll('.steps input')).every(function(b){ return c[b.id]; });
      var rads = t.querySelectorAll('input[type=radio]');
      if (rads.length && !r[rads[0].name]) ok = false;
      return { titulo:t.querySelector('h2').textContent, ok:ok };
    });
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
  function cargar(n){
    if (!CLOUD){ var f = leerLocal()[clave(n)]; return Promise.resolve(f ? f.estado : {}); }
    return rpc('tareas_cargar', { p_nombre:n }).then(function(d){ return d || {}; });
  }
  function guardar(n, estado){
    if (!CLOUD){
      var o = leerLocal();
      o[clave(n)] = { nombre:n, estado:estado, updated_at:new Date().toISOString() };
      escribirLocal(o);
      return Promise.resolve();
    }
    return rpc('tareas_guardar', { p_nombre:n, p_estado:estado });
  }
  function todos(){
    if (!CLOUD){ var o = leerLocal(); return Promise.resolve(Object.keys(o).map(function(k){ return o[k]; })); }
    return rpc('tareas_todos').then(function(d){ return d || []; });
  }
  function borrar(n){
    if (!CLOUD){ var o = leerLocal(); delete o[clave(n)]; escribirLocal(o); return Promise.resolve(); }
    return rpc('tareas_borrar', { p_nombre:n });
  }

  /* ---------- Estudiante ---------- */
  function mostrarLista(){
    $('who').hidden = true; $('lista').hidden = false; $('pie').hidden = false;
  }
  function entrar(n){
    $('wBtn').disabled = true; $('wMsg').textContent = '';
    return cargar(n).then(function(estado){
      nombre = n; recordarNombre(n);
      $('meNombre').textContent = n; $('me').hidden = false; $('estado').textContent = '';
      ponerEstado(estado); mostrarLista();
    }).catch(function(err){
      recordarNombre('');
      $('who').hidden = false; $('wMsg').textContent = errorTxt(err);
    }).then(function(){ $('wBtn').disabled = false; });
  }
  function pedirNombre(){
    nombre = ''; recordarNombre('');
    ponerEstado({});
    $('me').hidden = true; $('lista').hidden = true; $('pie').hidden = true;
    $('wNombre').value = ''; $('wApellido').value = ''; $('wMsg').textContent = '';
    $('who').hidden = false; $('wNombre').focus();
  }
  $('who').addEventListener('submit', function(e){
    e.preventDefault();
    var a = limpio($('wNombre').value), b = limpio($('wApellido').value);
    if (a.length < 2 || b.length < 2){ $('wMsg').textContent = 'Escribe tu nombre y tu apellido.'; return; }
    entrar(a + ' ' + b);
  });
  $('cambiar').addEventListener('click', pedirNombre);

  function alCambiar(){
    render();
    if (esAdmin || !nombre) return;   // el admin solo previsualiza la lista
    $('estado').textContent = 'Guardando…';
    clearTimeout(timer);
    timer = setTimeout(function(){
      guardar(nombre, leerEstado())
        .then(function(){ $('estado').textContent = 'Guardado'; })
        .catch(function(err){ $('estado').textContent = 'No se pudo guardar: ' + errorTxt(err); });
    }, 500);
  }
  checks.concat(radios).forEach(function(el){ el.addEventListener('change', alCambiar); });
  $('reset').addEventListener('click', function(){
    if (!esAdmin && !confirm('¿Borrar todo lo que marcaste?')) return;
    checks.forEach(function(c){ c.checked = false; });
    radios.forEach(function(r){ r.checked = false; });
    alCambiar();
  });

  /* ---------- Admin: una tarjeta por persona ---------- */
  function tarjeta(f){
    var total = tasks.length;
    var ts = tareasDe(f.estado), n = ts.filter(function(t){ return t.ok; }).length;
    var fecha = f.updated_at ? new Date(f.updated_at).toLocaleString('es', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
    return '<article class="persona' + (n === total ? ' full' : '') + '">' +
      '<div class="persona-top"><b>' + esc(f.nombre) + '</b>' +
      '<button class="x" type="button" title="Borrar esta tarjeta" data-borrar="' + esc(f.nombre) + '">×</button></div>' +
      '<small>' + n + ' de ' + total + ' tareas' + (fecha ? ' · ' + fecha : '') + '</small>' +
      '<div class="bar"><i style="width:' + (n / total * 100) + '%"></i></div>' +
      '<ul>' + ts.map(function(t){ return '<li class="' + (t.ok ? 'ok' : '') + '">' + esc(t.titulo) + '</li>'; }).join('') + '</ul>' +
      '</article>';
  }
  function pintarGrupo(){
    $('grupoTxt').textContent = 'Cargando…';
    return todos().then(function(filas){
      var completos = filas.filter(function(f){ return tareasDe(f.estado).every(function(t){ return t.ok; }); }).length;
      $('personas').innerHTML = filas.map(tarjeta).join('') ||
        '<p class="vacio">Todavía nadie ha entrado. Cuando alguien escriba su nombre y marque una tarea, aparece aquí.</p>';
      $('grupoTxt').textContent = filas.length + (filas.length === 1 ? ' persona' : ' personas') +
        ' · ' + completos + ' con todo completo';
    }).catch(function(err){
      $('grupoTxt').textContent = '';
      var m = (err && err.message) || '';
      $('personas').innerHTML = '<p class="vacio">' +
        esc(FALTA_SQL.test(m) ? 'Falta correr supabase-tareas.sql en Supabase.' : errorTxt(err)) + '</p>';
    });
  }
  $('grupoRefresh').addEventListener('click', pintarGrupo);
  $('personas').addEventListener('click', function(e){
    var b = e.target.closest('[data-borrar]'); if (!b) return;
    if (!confirm('¿Borrar el avance de ' + b.dataset.borrar + '? No se puede deshacer.')) return;
    borrar(b.dataset.borrar).then(pintarGrupo).catch(function(err){ alert(errorTxt(err)); });
  });

  /* ---------- Arranque ---------- */
  function esAdminReal(){
    if (!ADMIN_KEY) return Promise.resolve(false);
    if (!CLOUD) return Promise.resolve(true);
    return sb.rpc('is_admin').then(function(res){ return !res.error && res.data === true; });
  }
  ponerEstado({});
  esAdminReal().then(function(ok){
    esAdmin = ok;
    if (esAdmin){ $('grupo').hidden = false; mostrarLista(); pintarGrupo(); return; }
    var n = nombreRecordado();
    if (n) entrar(n); else pedirNombre();
  });
})();
