/* ================================================================
   Idioma: español (el original) o inglés con la traducción automática
   de Google. La elección se recuerda en este navegador. El traductor solo
   se carga si alguien elige inglés; volver a español recarga la página
   para dejar el texto original intacto.
   ================================================================ */
(function(){
  const COOKIE = 'googtrans';   // la cookie con la que el traductor de Google sabe a qué idioma pasar
  const leer = () => { try { return localStorage.getItem('pc-idioma') === 'en' ? 'en' : 'es'; } catch { return 'es'; } };
  const guardar = lang => { try { localStorage.setItem('pc-idioma', lang); } catch {} };
  const ponerCookie = () => { document.cookie = `${COOKIE}=/es/en; path=/`; };
  const borrarCookie = () => {
    const host = location.hostname;
    ['', host, '.' + host].forEach(d => {
      document.cookie = `${COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d ? '; domain=' + d : ''}`;
    });
  };

  function cargarTraductor(){
    if (window.google?.translate?.TranslateElement || document.getElementById('gtScript')) return;
    window.pcTraductorListo = () => new google.translate.TranslateElement(
      { pageLanguage:'es', includedLanguages:'en', autoDisplay:false }, 'gTraductor');
    const s = document.createElement('script');
    s.id = 'gtScript';
    s.src = 'https://translate.google.com/translate_a/element.js?cb=pcTraductorListo';
    s.async = true;
    s.onerror = () => { if (typeof toast === 'function') toast('No se pudo cargar la traducción. Revisa tu conexión.'); };
    document.head.appendChild(s);
  }

  function marcar(lang){
    document.querySelectorAll('[data-idioma]').forEach(b => {
      const on = b.dataset.idioma === lang;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function poner(lang){
    guardar(lang);
    if (lang === 'es'){ borrarCookie(); location.reload(); return; }
    ponerCookie(); marcar('en');
    // Si el traductor ya está, basta con cambiarle el idioma; si no, al cargar lee la cookie
    const combo = document.querySelector('.goog-te-combo');
    if (combo){ combo.value = 'en'; combo.dispatchEvent(new Event('change')); }
    else cargarTraductor();
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-idioma]');
    if (b && b.dataset.idioma !== leer()) poner(b.dataset.idioma);
  });

  const inicial = leer();
  marcar(inicial);
  if (inicial === 'en'){ ponerCookie(); cargarTraductor(); }
  else if (document.cookie.includes(COOKIE + '=')) borrarCookie();   // una cookie vieja no traduce a escondidas
})();
