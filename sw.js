const CACHE_NAME = 'sgc-logistica-v3'; // Subi para v3 para forçar a atualização nos celulares
const ASSETS = [
  './',
  './index.html',
  './motorista.html', // ⚠️ COLOQUE O NOME DO ARQUIVO DO MOTORISTA AQUI!
  './style.css',
  './script.js',
  './images.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.tailwindcss.com'
];
// Instalação: Cacheia os arquivos
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Ativação: Limpa caches antigos (importante agora que mudamos a versão)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Fetch: Serve arquivos do cache se estiver offline
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});
