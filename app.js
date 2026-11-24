/* App del gafete JOMA sin internet.
   - El enlace personal es ?c=<clave firmada> (la da el panel ▸ Gafetes ▸ Enlace).
   - Con internet pide los datos a Apps Script (?tarjetajson=) y los guarda en el teléfono (localStorage y en la dirección
     como &d=..., porque el iPhone guarda la dirección exacta al «Agregar a inicio» y la app instalada no ve lo de Safari).
   - Sin internet muestra lo guardado. Si el servidor dice que la tarjeta ya no vale (baja o enlace cambiado), la borra. */
(function () {
  'use strict';

  // Dirección del registro publicado (Apps Script). Si cambia el despliegue, cambiarla aquí.
  var SERVIDOR = 'https://script.google.com/macros/s/AKfycbwpR49YM084EgYbrXM5-zfeahkm8aQEv9-b-5vtl2ys921t6rW_tfqeSiqNnaeJaA/exec';
  // Solo para probar en la computadora (localhost): servidor falso de probar-local.js
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') SERVIDOR = location.origin + '/falso';
  var CLAVE_LOCAL = 'gafeteJoma';

  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var clave = params.get('c') || '';
  var guardado = leerGuardado();
  if (!clave && guardado && guardado.c) clave = guardado.c;

  // ---- Guardar y leer ----
  function aBase64(obj) {
    var bytes = new TextEncoder().encode(JSON.stringify(obj)), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function deBase64(txt) {
    try {
      var b = String(txt).replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      var bin = atob(b), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) { return null; }
  }
  function leerGuardado() {
    var desdeUrl = params.get('d') ? deBase64(params.get('d')) : null;
    var local = null;
    try { local = JSON.parse(localStorage.getItem(CLAVE_LOCAL) || 'null'); } catch (e) { local = null; }
    // Si el enlace es de otra persona (otra clave), no usar lo guardado de antes
    var c = params.get('c');
    if (local && c && local.c !== c) local = null;
    if (desdeUrl && c && desdeUrl.c !== c) desdeUrl = null;
    var d = local || desdeUrl;
    return d && d.numero ? d : null;
  }
  function guardar(d) {
    try { localStorage.setItem(CLAVE_LOCAL, JSON.stringify(d)); } catch (e) {}
    try {
      var u = new URL(location.href);
      u.search = '?c=' + encodeURIComponent(d.c) + '&d=' + aBase64(d);
      history.replaceState(null, '', u.toString());
    } catch (e) {}
  }
  function borrar() {
    try { localStorage.removeItem(CLAVE_LOCAL); } catch (e) {}
    try { history.replaceState(null, '', location.pathname + (clave ? '?c=' + encodeURIComponent(clave) : '')); } catch (e) {}
  }

  // ---- Pintar ----
  // El QR se dibuja en un lienzo con cuadritos de pixeles enteros (sin rayitas entre ellos) y margen blanco de 4 cuadritos,
  // para que los lectores de la entrada lo lean bien en la pantalla del teléfono.
  function dibujarQr(caja, texto) {
    caja.innerHTML = '';
    if (typeof qrcode !== 'function') return;
    var q;
    try { q = qrcode(0, 'M'); q.addData(String(texto)); q.make(); } catch (e) { return; }
    var n = q.getModuleCount(), margen = 4, total = n + margen * 2;
    var lado = Math.max(caja.clientWidth, 120) * (window.devicePixelRatio || 1);
    var celda = Math.max(1, Math.floor(lado / total)), px = celda * total;
    var c = document.createElement('canvas');
    c.width = px; c.height = px;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#000000';
    for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) ctx.fillRect((k + margen) * celda, (r + margen) * celda, celda, celda);
    caja.appendChild(c);
  }

  function mostrarPase(d) {
    $('vistaAviso').hidden = true;
    $('vistaPase').hidden = false;
    $('pNombre').textContent = d.nombre;
    $('pNumero').textContent = d.numero;
    $('pSeccion').textContent = d.seccion || '';
    $('pLugar').textContent = d.lugar || '';
    $('cSeccion').hidden = !d.seccion;
    $('cLugar').hidden = !d.lugar;
    if (!d.seccion && d.lugar) $('cLugar').className = 'ancho'; else $('cLugar').className = '';
    if (d.seccion && !d.lugar) $('cSeccion').className = 'ancho'; else $('cSeccion').className = '';
    codigoActual = d.codigo;
    dibujarQr($('pQr'), d.codigo);
    $('pQr').setAttribute('role', 'img');
    $('pQr').setAttribute('aria-label', 'Código QR ' + d.codigo);
    $('pCodigo').textContent = d.codigo;
    // Reverso: código de turno extra (JOMAX + número). El registro lo toma como entrada con turno extra.
    $('xNombre').textContent = d.nombre;
    $('xNumero').textContent = d.numero;
    $('xCodigo').textContent = codigoExtra(d);
    dibujarQr($('xQr'), codigoExtra(d));
    $('gCodigo').textContent = d.codigo;
    $('gNombre').textContent = d.nombre;
    document.title = 'Gafete · ' + d.nombre;
    pedirPantallaEncendida();
  }

  function mostrarAviso(titulo, texto, reintentar) {
    $('vistaPase').hidden = true;
    $('vistaAviso').hidden = false;
    document.title = 'Mi gafete JOMA';
    $('avisoTitulo').textContent = titulo;
    $('avisoTexto').textContent = texto;
    $('btnReintentar').hidden = !reintentar;
  }

  function estado(texto, listo) {
    $('estadoTexto').textContent = texto;
    $('estado').classList.toggle('espera', !listo);
  }

  function horaCorta(ms) {
    try { return new Date(ms).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return ''; }
  }

  function estadoGuardado(d) {
    var sw = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
    if (sw) estado('Lista sin internet' + (d.revisada ? ' · revisada ' + horaCorta(d.revisada) : ''), true);
    else estado('Guardando para usar sin internet…', false);
  }

  // ---- Revisar con el servidor ----
  function revisar() {
    if (!clave) return Promise.resolve(null);
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var tiempo = setTimeout(function () { if (ctrl) ctrl.abort(); }, 12000);
    return fetch(SERVIDOR + '?tarjetajson=' + encodeURIComponent(clave), { signal: ctrl ? ctrl.signal : undefined, cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .finally(function () { clearTimeout(tiempo); });
  }

  function iniciar() {
    if (guardado) { mostrarPase(guardado); estadoGuardado(guardado); }
    else if (!clave) {
      mostrarAviso('Abre tu enlace personal', 'Para ver tu gafete, abre el enlace que te mandó tu encargado. Solo la primera vez necesitas internet.', false);
      return;
    } else {
      mostrarAviso('Cargando tu gafete…', 'Un momento, por favor.', false);
    }

    revisar().then(function (r) {
      if (!r) return;
      if (r.ok) {
        var d = { c: clave, nombre: r.nombre, numero: r.numero, seccion: r.seccion || '', lugar: r.lugar || '', codigo: r.codigo, revisada: Date.now() };
        guardar(d);
        guardado = d;
        mostrarPase(d);
        estadoGuardado(d);
      } else if (r.baja) {
        borrar();
        guardado = null;
        mostrarAviso('No se puede mostrar el gafete', r.motivo || 'Este enlace ya no es válido. Pide uno nuevo a tu encargado.', false);
      } else if (!guardado) {
        mostrarAviso('No se pudo cargar', r.motivo || 'Intenta de nuevo en un momento.', true);
      }
    }).catch(function () {
      if (guardado) estadoGuardado(guardado);
      else mostrarAviso('Necesitas internet la primera vez', 'Conéctate a internet o a wifi y vuelve a intentarlo. Después tu gafete funcionará sin internet.', true);
    });
  }

  $('btnReintentar').addEventListener('click', iniciar);

  // ---- Código en grande ----
  var codigoActual = '';
  var volteado = false;
  function codigoExtra(d) { return 'JOMAX' + d.numero; }
  function codigoVisible() { return volteado && guardado ? codigoExtra(guardado) : codigoActual; }
  function abrirGrande() {
    var g = $('grande');
    g.classList.toggle('extra', volteado);
    $('gSello').hidden = !volteado;
    g.setAttribute('aria-label', (volteado ? 'Código de turno extra. ' : '') + 'Toca para cerrar');
    g.classList.add('abierto');
    $('gCodigo').textContent = codigoVisible();
    dibujarQr($('gQr'), codigoVisible());
    g.focus();
  }
  $('btnQr').addEventListener('click', abrirGrande);
  $('btnQrExtra').addEventListener('click', abrirGrande);
  $('btnVoltear').addEventListener('click', function () {
    volteado = !volteado;
    $('giro').classList.toggle('volteado', volteado);
    $('btnVoltear').setAttribute('aria-pressed', volteado ? 'true' : 'false');
    $('btnVoltearTexto').textContent = volteado ? 'Voltear: gafete normal' : 'Voltear: turno extra';
    $('caraFrente').setAttribute('aria-hidden', volteado ? 'true' : 'false');
    $('caraReverso').setAttribute('aria-hidden', volteado ? 'false' : 'true');
    $('btnQr').tabIndex = volteado ? -1 : 0;
    $('btnQrExtra').tabIndex = volteado ? 0 : -1;
  });
  window.addEventListener('resize', function () {
    if (!codigoActual) return;
    dibujarQr($('pQr'), codigoActual);
    if (guardado) dibujarQr($('xQr'), codigoExtra(guardado));
    if ($('grande').classList.contains('abierto')) dibujarQr($('gQr'), codigoVisible());
  });
  $('grande').addEventListener('click', function () { $('grande').classList.remove('abierto'); (volteado ? $('btnQrExtra') : $('btnQr')).focus(); });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') $('grande').classList.remove('abierto'); });

  // ---- Pantalla encendida mientras se ve el gafete ----
  function pedirPantallaEncendida() {
    try { if (navigator.wakeLock && document.visibilityState === 'visible') navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (guardado) pedirPantallaEncendida(); });

  // ---- Instalar ----
  var enApp = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var esIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var aviso = null;
  if (!enApp) {
    if (esIos) $('ayudaIos').hidden = false;
    else $('ayudaAndroid').hidden = false;
  }
  window.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault();
    aviso = ev;
    $('btnInstalar').hidden = false;
    $('ayudaAndroid').hidden = true;
  });
  $('btnInstalar').addEventListener('click', function () {
    if (!aviso) return;
    aviso.prompt();
    aviso.userChoice.finally(function () { aviso = null; $('btnInstalar').hidden = true; });
  });
  window.addEventListener('appinstalled', function () { $('btnInstalar').hidden = true; $('ayudaAndroid').hidden = true; });

  // ---- Service worker (para abrir sin internet) ----
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (guardado) estadoGuardado(guardado); });
  }

  iniciar();
})();
