/* Service worker del gafete: guarda la app en el teléfono para que abra sin internet.
   Al cambiar cualquier archivo de la app, subir VERSION (y el ?v= de app.js en index.html) para que los teléfonos descarguen la nueva.
   Con internet siempre pide la versión nueva (hasta 4 s); sin internet usa la guardada. Así la página y el programa nunca quedan
   de versiones distintas (antes el teléfono podía mostrar el botón nuevo con el programa viejo). */
var VERSION = 'gafete-v5';
var ARCHIVOS = ['./', 'index.html', 'app.js', 'qrcode.min.js', 'logo.jpg', 'manifest.webmanifest', 'icono-192.png', 'icono-512.png', 'icono-apple.png'];
var FUENTES = 'gafete-fuentes';
var ESPERA_RED_MS = 4000;

self.addEventListener('install', function (ev) {
  // cache:'reload' = directo de GitHub, sin la copia de 10 minutos del navegador
  ev.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(ARCHIVOS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (claves) {
    return Promise.all(claves.filter(function (k) { return k !== VERSION && k !== FUENTES; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Primero la red (sin copia vieja); si no hay internet o tarda más de 4 s, lo guardado
function redPrimero(req, clave) {
  var claveCache = clave || req;
  return new Promise(function (listo) {
    var terminado = false;
    function responder(r) { if (!terminado && r) { terminado = true; listo(r); } }
    function guardado() { return caches.match(claveCache, { ignoreSearch: true }); }
    var tiempo = setTimeout(function () { guardado().then(responder); }, ESPERA_RED_MS);
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
      clearTimeout(tiempo);
      if (r && r.ok) {
        var copia = r.clone();
        caches.open(VERSION).then(function (c) { c.put(claveCache, copia); });
      }
      responder(r);
    }).catch(function () {
      clearTimeout(tiempo);
      guardado().then(function (g) { responder(g || Response.error()); });
    });
  });
}

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Letras de Google Fonts: primero lo guardado, si no, la red (y se guarda)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    ev.respondWith(caches.open(FUENTES).then(function (c) {
      return c.match(req).then(function (g) {
        return g || fetch(req).then(function (r) { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; });
      });
    }));
    return;
  }

  // El servidor de Apps Script (revisar la tarjeta) siempre va a la red
  if (url.origin !== self.location.origin) return;

  // La página: cualquier ?c=...&d=... es el mismo index.html
  if (req.mode === 'navigate') { ev.respondWith(redPrimero(req, 'index.html')); return; }

  ev.respondWith(redPrimero(req));
});
