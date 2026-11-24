/* Service worker del gafete: guarda la app en el teléfono para que abra sin internet.
   Al cambiar cualquier archivo de la app, subir VERSION para que los teléfonos descarguen la nueva. */
var VERSION = 'gafete-v1';
var ARCHIVOS = ['./', 'index.html', 'app.js', 'qrcode.min.js', 'logo.jpg', 'manifest.webmanifest', 'icono-192.png', 'icono-512.png', 'icono-apple.png'];
var FUENTES = 'gafete-fuentes';

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (claves) {
    return Promise.all(claves.filter(function (k) { return k !== VERSION && k !== FUENTES; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

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

  // La página: cualquier ?c=...&d=... abre el mismo index.html guardado
  if (req.mode === 'navigate') {
    ev.respondWith(caches.match('index.html').then(function (g) {
      var red = fetch(req).then(function (r) {
        if (r.ok) caches.open(VERSION).then(function (c) { c.put('index.html', r.clone()); });
        return r;
      }).catch(function () { return g; });
      return g || red;
    }));
    return;
  }

  // Lo demás de la app: lo guardado y, de fondo, se actualiza
  ev.respondWith(caches.match(req, { ignoreSearch: true }).then(function (g) {
    var red = fetch(req).then(function (r) {
      if (r.ok) caches.open(VERSION).then(function (c) { c.put(req, r.clone()); });
      return r;
    }).catch(function () { return g; });
    return g || red;
  }));
});
