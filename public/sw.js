// Basic Service Worker for PWA installability
const CACHE_NAME = 'cardapio-bot-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Pass-through strategy for now
    event.respondWith(fetch(event.request));
});
