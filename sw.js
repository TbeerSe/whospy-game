/* =========================================================
   sw.js — офлайн-кэш
   Стратегия: сеть в приоритете, кэш как запасной вариант.
   Пока есть интернет, игрок всегда получает свежие файлы;
   без интернета игра открывается из кэша, собранного при
   предыдущих запусках. Список файлов поддерживать не нужно.
   При смене версии игры поменяйте CACHE_NAME.
========================================================= */
"use strict";

const CACHE_NAME = "whospy-v0.9.0";
const SHELL = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }

        return response;
      })
      .catch(() =>
        caches
          .match(request)
          .then((cached) => cached || caches.match("./index.html"))
      )
  );
});
