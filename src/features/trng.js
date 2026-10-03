/* =========================================================
   features/trng.js — сбор энтропии, аудит, случайные события
========================================================= */
// @ts-nocheck
"use strict";

import { state, CRISIS_CHANCE } from "../core/state.js";
import { elements } from "../core/dom.js";
import {
  sleep,
  stringToSeed,
  createRandomGenerator
} from "../core/utils.js";
import { playAuditClick } from "../core/audio.js";
import { getBalance } from "./economy.js";
import { RANDOM_EVENTS } from "../constants/events.js";

/* ---------- Батарея как источник энтропии ---------- */
async function getBatteryEntropy() {
  const fallback = {
    level: "unavailable",
    charging: "unknown"
  };

  try {
    if (!navigator.getBattery) {
      return fallback;
    }

    const battery = await navigator.getBattery();

    return {
      level: Math.round(battery.level * 100),
      charging: battery.charging ? "yes" : "no"
    };
  } catch (error) {
    return fallback;
  }
}

/* ---------- Память как источник энтропии ---------- */
function getMemoryEntropy() {
  if (
    performance.memory &&
    Number.isFinite(performance.memory.usedJSHeapSize)
  ) {
    return Math.round(
      performance.memory.usedJSHeapSize / 1024 / 1024
    );
  }

  return "unavailable";
}

/* ---------- Сбор энтропии ---------- */
async function collectEntropy() {
  const battery = await getBatteryEntropy();
  const memory = getMemoryEntropy();
  const preciseTime = performance.now();
  const wallClockTime = Date.now();

  let cryptoPart = "";

  if (window.crypto?.getRandomValues) {
    const randomBytes = new Uint32Array(4);

    window.crypto.getRandomValues(randomBytes);

    cryptoPart = Array.from(randomBytes).join("-");
  }

  const pool = [
    preciseTime.toFixed(6),
    wallClockTime,
    battery.level,
    battery.charging,
    memory,
    state.lastPointer.x,
    state.lastPointer.y,
    window.innerWidth,
    window.innerHeight,
    navigator.language,
    navigator.hardwareConcurrency || "unknown",
    navigator.platform || "unknown",
    cryptoPart
  ].join("|");

  return {
    pool,
    preciseTime,
    battery,
    memory,
    seed: stringToSeed(pool)
  };
}

/* ---------- Строка аудита в терминал ---------- */
function addAuditLine(text, type = "") {
  const line = document.createElement("div");

  line.className = "audit-log__line";

  if (type) {
    line.classList.add(`audit-log__line--${type}`);
  }

  line.textContent = text;
  elements.auditLog.appendChild(line);

  playAuditClick();
}

/* ---------- Игрок с самым низким балансом ---------- */
export function getLowestBalancePlayer() {
  if (!state.players.length) return null;

  let lowestPlayer = state.players[0];
  let lowestBalance = getBalance(lowestPlayer);

  state.players.forEach((player) => {
    const balance = getBalance(player);

    if (balance < lowestBalance) {
      lowestBalance = balance;
      lowestPlayer = player;
    }
  });

  return lowestPlayer;
}

/* ---------- Ролл случайного события ---------- */
function rollRandomEvent(random) {
  const eventRoll = random();

  if (eventRoll >= CRISIS_CHANCE) {
    return null;
  }

  const pick = random();

  if (pick < 0.34) return "crisis";
  if (pick < 0.67) return "hunt";

  return "philanthropist";
}

/* ---------- Полный аудит энтропии (публичный) ---------- */
export async function runEntropyAudit() {
  elements.auditLog.innerHTML = "";

  elements.auditProgressBar.style.animation = "none";
  elements.auditProgressBar.offsetHeight;
  elements.auditProgressBar.style.animation = "";

  const entropyPromise = collectEntropy();

  addAuditLine("Считывание энтропии устройства...");
  await sleep(300);

  const entropy = await entropyPromise;

  addAuditLine(`Заряд батареи: ${entropy.battery.level}%`);

  await sleep(300);

  addAuditLine(
    `Микросекунды клика: ${entropy.preciseTime.toFixed(6)}...`
  );

  await sleep(300);

  addAuditLine(`Поток RAM: ${entropy.memory}MB...`);

  await sleep(300);

  addAuditLine("Смешивание хаотичных параметров...");

  await sleep(300);

  addAuditLine(
    "АНАЛИЗ ХАОСА ЗАВЕРШЕН. РОЛИ РАСПРЕДЕЛЕНЫ",
    "success"
  );

  await sleep(400);

  const eventRandom = createRandomGenerator(
    (entropy.seed ^ 0x9e3779b9) >>> 0
  );

  const eventKey = rollRandomEvent(eventRandom);

  state.pendingEvent = eventKey;

  if (eventKey) {
    const eventData = RANDOM_EVENTS[eventKey];

    addAuditLine(
      `СЛУЧАЙНОЕ СОБЫТИЕ: ${eventData.title}`,
      "danger"
    );

    await sleep(320);

    addAuditLine(eventData.description, "danger");

    await sleep(360);
  }

  await sleep(420);

  return entropy;
}
