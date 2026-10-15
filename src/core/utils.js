/* =========================================================
   core/utils.js — общие утилиты (не зависят от feature-модулей)
========================================================= */
// @ts-nocheck
"use strict";

import { elements } from "./dom.js";

/* ---------- Пауза ---------- */
export function sleep(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

/* ---------- HTML-экранирование ---------- */
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replaceAll("`", "&#96;");
}

/* ---------- Тост ---------- */
export function showToast(message) {
  if (!elements.toast) return;

  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");

  window.clearTimeout(showToast.timeout);

  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2800);
}

/* ---------- Форматирование времени ---------- */
export function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds));

  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return {
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(remainingSeconds).padStart(2, "0")
  };
}

/* ---------- FNV-1a — из строки в 32-битный сид ---------- */
export function stringToSeed(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

/* ---------- xorshift32 PRNG ----------
   Детерминированный поток от сида: нужен там, где результат должен
   повторяться (радар, вердикты Верификатора, шум таймера — их нельзя
   «перебросить» перезагрузкой). Для распределения ролей и выбора
   локации используется createCryptoRandom() ниже. */
export function createRandomGenerator(seed) {
  // Нулевой сид для xorshift — вырожденный (вечные нули).
  let currentSeed = (seed >>> 0) || 0x9e3779b9;

  return function random() {
    currentSeed ^= currentSeed << 13;
    currentSeed ^= currentSeed >>> 17;
    currentSeed ^= currentSeed << 5;
    currentSeed >>>= 0;

    return currentSeed / 4294967296;
  };
}

/* ---------- Криптостойкий random() ----------
   Возвращает функцию с тем же контрактом, что и Math.random():
   число в [0, 1) с 53 битами. Источник — crypto.getRandomValues,
   без 32-битного «бутылочного горлышка» сида. */
export function createCryptoRandom() {
  const cryptoApi =
    typeof globalThis !== "undefined" ? globalThis.crypto : null;

  if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
    return Math.random;
  }

  const buffer = new Uint32Array(2);

  return function random() {
    cryptoApi.getRandomValues(buffer);

    // 21 бит из первого слова + 32 из второго = 53 бита.
    return ((buffer[0] >>> 11) * 4294967296 + buffer[1]) / 9007199254740992;
  };
}

/* ---------- Перемешивание Фишера–Йетса ---------- */
export function shuffleArray(array, random) {
  const result = [...array];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(random() * (index + 1));

    [result[index], result[targetIndex]] = [
      result[targetIndex],
      result[index]
    ];
  }

  return result;
}

/* ---------- Скачивание JSON-файла ----------
   Универсальная утилита: используется и для локаций, и для игроков.
   В браузере — Blob + ObjectURL. В Android-приложении (Capacitor)
   скачивание через <a download> не работает, поэтому файл пишется
   в кэш приложения и открывается системное меню «Поделиться»
   (оттуда можно сохранить в «Файлы», Google Drive и т.д.). */
function isNativeApp() {
  return Boolean(
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === "function" &&
    window.Capacitor.isNativePlatform()
  );
}

function getNativePlugin(name) {
  const cap = window.Capacitor;

  // Нативный мост Capacitor кладёт плагины в Capacitor.Plugins,
  // даже если @capacitor/core не подключён к странице.
  if (cap.Plugins && cap.Plugins[name]) {
    return cap.Plugins[name];
  }

  if (typeof cap.registerPlugin === "function") {
    return cap.registerPlugin(name);
  }

  throw new Error("плагин " + name + " недоступен");
}

async function saveJsonNative(filename, json) {
  const filesystem = getNativePlugin("Filesystem");
  const share = getNativePlugin("Share");

  const written = await filesystem.writeFile({
    path: filename,
    data: json,
    directory: "CACHE",
    encoding: "utf8"
  });

  await share.share({
    title: filename,
    dialogTitle: "Сохранить файл",
    url: written.uri
  });
}

function downloadJsonInBrowser(filename, json) {
  try {
    const blob = new Blob(
      [json],
      { type: "application/json;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
      URL.revokeObjectURL(url);
    }, 1000);

    return true;
  } catch (error) {
    console.warn("Blob download failed, fallback to data URL:", error);
  }

  // Fallback — data URL
  const encoded = "data:application/json;charset=utf-8," +
    encodeURIComponent(json);

  const link = document.createElement("a");
  link.href = encoded;
  link.download = filename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    if (link.parentNode) {
      link.parentNode.removeChild(link);
    }
  }, 1000);

  return true;
}

function isAndroidWebView() {
  return /; wv\)/.test(navigator.userAgent || "");
}

export function downloadJsonFile(filename, data) {
  const json = JSON.stringify(data, null, 2);

  if (isNativeApp()) {
    saveJsonNative(filename, json).catch((error) => {
      // Пользователь закрыл меню «Поделиться» — это не ошибка.
      const message = String((error && error.message) || error || "");

      if (/cancel/i.test(message)) {
        return;
      }

      console.warn("Native save failed, fallback to browser:", error);
      window.alert("Не удалось сохранить файл: " + message);
      downloadJsonInBrowser(filename, json);
    });

    return true;
  }

  if (isAndroidWebView()) {
    window.alert(
      "Диагностика: приложение запущено в WebView, " +
      "но Capacitor не найден (window.Capacitor)."
    );
  }

  return downloadJsonInBrowser(filename, json);
}


/* ---------- Недопустимые имена игроков ----------
   Имена используются как ключи обычных объектов (балансы, гаджеты,
   голоса). Имя «__proto__» ломало бы эти объекты. */
const RESERVED_NAMES = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "hasownproperty",
  "tostring",
  "valueof"
]);

export function isReservedName(name) {
  return RESERVED_NAMES.has(String(name).trim().toLowerCase());
}
