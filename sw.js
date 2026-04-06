const CACHE_NAME = 'sgc-logistica-dinamico-v1'; // Última vez que você muda o nome!
const ASSETS = [
  './',
  './index.html',
  './motorista.html',
  './style.css',
  './script.js',
  './images.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.tailwindcss.com'
];

// Instalação
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Força o Service Worker novo a assumir na hora, sem frescura
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Ativação: limpa os lixos velhos
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

// 🔥 A MÁGICA AQUI: Estratégia "Network First" (Rede Primeiro, Cache depois)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Se a internet tá pegando e achou o arquivo novo, atualiza o cache escondido
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        return response;
      })
      .catch(() => {
        // Se deu erro (sem internet), aí sim ele puxa a versão salva no cache!
        return caches.match(e.request);
      })
  );
});
