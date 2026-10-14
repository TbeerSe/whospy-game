/* =========================================================
   features/players.js — реестр игроков и их карточек
========================================================= */
// @ts-nocheck
"use strict";

import {
  state,
  STORAGE_KEYS,
  MIN_BALANCE,
  MIN_PLAYERS
} from "../core/state.js";
import { elements } from "../core/dom.js";
import {
  readFromStorage,
  saveToStorage
} from "../core/storage.js";
import {
  escapeHtml,
  showToast,
  downloadJsonFile,
  isReservedName
} from "../core/utils.js";
import { playFailure } from "../core/audio.js";
import {
  getBalance,
  getPlayerRank,
  normalizeBalances
} from "./economy.js";
import {
  createEmptyInventory,
  normalizeGadgets,
  saveGadgets,
  migrateOldRadarPurchases
} from "./gadgets.js";

/* ---------- Загрузка списка игроков из localStorage ---------- */
export function loadPlayers() {
  const savedPlayers = readFromStorage(STORAGE_KEYS.players, []);

  state.players = Array.isArray(savedPlayers)
    ? savedPlayers
        .filter((player) => typeof player === "string")
        .map((player) => player.trim())
        .filter(Boolean)
        .filter((player) => !isReservedName(player))
    : [];

  state.balances = readFromStorage(STORAGE_KEYS.balances, {});
  state.gadgets = readFromStorage(STORAGE_KEYS.gadgets, {});

  normalizeBalances();
  normalizeGadgets();
  migrateOldRadarPurchases();
  normalizeGadgets();

  renderPlayers();
}

/* ---------- Сохранение списка игроков ---------- */
export function savePlayers() {
  saveToStorage(STORAGE_KEYS.players, state.players);
}

/* ---------- Добавление игрока ---------- */
export function addPlayer(name) {
  const normalizedName = name.trim();

  if (!normalizedName) {
    showToast("Введите имя участника");
    return;
  }

  if (isReservedName(normalizedName)) {
    showToast("Это имя зарезервировано, выберите другое");
    return;
  }

  if (
    state.players.some(
      (player) =>
        player.toLowerCase() === normalizedName.toLowerCase()
    )
  ) {
    showToast("Такой участник уже добавлен");
    return;
  }

  if (state.players.length >= 100) {
    showToast("Максимальное количество участников — 100");
    return;
  }

  state.players.push(normalizedName);

  if (!Number.isFinite(Number(state.balances[normalizedName]))) {
    state.balances[normalizedName] = 0;
  }

  state.gadgets[normalizedName] = createEmptyInventory();

  savePlayers();
  normalizeBalances();
  normalizeGadgets();
  renderPlayers();

  elements.playerName.value = "";
  elements.playerName.focus();
}

/* ---------- Удаление игрока ---------- */
// PATCH 0.4.2 — запрещаем удаление игроков во время раунда.
export function removePlayer(index) {
  if (state.assignments.length > 0) {
    showToast("Нельзя удалять игроков во время раунда");
    playFailure();
    return;
  }

  const player = state.players[index];

  state.players.splice(index, 1);

  if (player) {
    delete state.balances[player];
    delete state.gadgets[player];
  }

  savePlayers();
  saveToStorage(STORAGE_KEYS.balances, state.balances);
  saveGadgets();

  renderPlayers();
}

/* ---------- Подсказка по числу игроков ---------- */
function renderPlayersWarning() {
  const box = elements.playersWarning;

  if (!box) return;

  const count = state.players.length;
  let text = "";

  if (count > 0 && count < MIN_PLAYERS) {
    text = `Нужно ещё игроков: ${MIN_PLAYERS - count} (минимум ${MIN_PLAYERS}).`;
  } else if (count === MIN_PLAYERS) {
    text =
      "С 4 игроками всегда 1 шпион, и мирным легко ошибиться. " +
      "Лучше всего играется от 5–6 человек.";
  }

  box.textContent = text;
  box.classList.toggle("is-hidden", !text);
}

/* ---------- Отрисовка карточек игроков ---------- */
export function renderPlayers() {
  elements.playersList.innerHTML = "";
  elements.playersCount.textContent = String(state.players.length);
  elements.playersEmpty.hidden = state.players.length > 0;

  renderPlayersWarning();

  state.players.forEach((player, index) => {
    const item = document.createElement("div");
    item.className = "player-item";

    const balance = getBalance(player);
    const rank = getPlayerRank(player);
    item.innerHTML = `
      <div class="player-item__identity">
        <span class="player-item__number">${index + 1}</span>

        <button
          type="button"
          class="player-item__name player-name-button"
          data-open-shop="${escapeHtml(player)}"
          title="Открыть магазин игрока"
        >
          ${escapeHtml(player)}
          <span class="player-item__balance">
            (${balance} 🪙)
          </span>
          <span class="player-item__rank player-item__rank--${rank.modifier}">
            ${escapeHtml(rank.label)}
          </span>
        </button>
      </div>

      <button
        type="button"
        class="player-item__remove"
        aria-label="Удалить ${escapeHtml(player)}"
        title="Удалить участника"
        data-remove-player="${index}"
      >
        ×
      </button>
    `;

    elements.playersList.appendChild(item);
  });
}

/* =========================================================
   PATCH 0.6.5 — экспорт / импорт игроков и сброс прогресса
========================================================= */

/* ---------- Выгружает список игроков с балансами ---------- */
export function exportPlayersToFile() {
  if (!state.players.length) {
    return { ok: false, reason: "empty" };
  }

  const payload = {
    spyfall: "players",
    version: 1,
    exportedAt: new Date().toISOString(),
    players: state.players.map((name) => ({
      name,
      balance: getBalance(name)
    }))
  };

  const timestamp = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  downloadJsonFile(
    "spyfall-players-" + timestamp + ".json",
    payload
  );

  return { ok: true, count: payload.players.length };
}

/* ---------- Читает JSON и восстанавливает игроков ----------
   Принимает:
   - объект { players: [{ name, balance }] }
   - массив [{ name, balance }]
   - массив строк ["Аня", "Боря"]
--------------------------------------------------------- */
export async function importPlayersFromFile(file) {
  if (!file) {
    return { ok: false, added: 0, updated: 0, skipped: 0, error: null };
  }

  let parsed;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch (e) {
    return {
      ok: false,
      added: 0,
      updated: 0,
      skipped: 0,
      error: "Не удалось прочитать JSON"
    };
  }

  let list = null;

  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && Array.isArray(parsed.players)) {
    list = parsed.players;
  }

  if (!list || !list.length) {
    return {
      ok: false,
      added: 0,
      updated: 0,
      skipped: 0,
      error: "Файл не содержит игроков"
    };
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;

  list.forEach((raw) => {
    // Поддерживаем как строки, так и объекты { name, balance }
    let name = "";
    let balance = 0;

    if (typeof raw === "string") {
      name = raw.trim();
    } else if (raw && typeof raw === "object") {
      name = typeof raw.name === "string" ? raw.name.trim() : "";
      balance = Number(raw.balance);
      if (!Number.isFinite(balance)) balance = 0;
    }

    if (!name || isReservedName(name)) {
      skipped += 1;
      return;
    }

    const existing = state.players.find(
      (p) => p.toLowerCase() === name.toLowerCase()
    );

    if (existing) {
      // Обновляем баланс существующего, сохраняя оригинальное написание имени
      state.balances[existing] = Math.max(MIN_BALANCE, Math.floor(balance));
      updated += 1;
    } else {
      if (state.players.length >= 100) {
        skipped += 1;
        return;
      }

      state.players.push(name);

      if (!state.gadgets[name]) {
        state.gadgets[name] = createEmptyInventory();
      }

      state.balances[name] = Math.max(
        MIN_BALANCE,
        Math.floor(balance)
      );

      added += 1;
    }
  });

  savePlayers();
  normalizeBalances();
  normalizeGadgets();
  saveGadgets();
  renderPlayers();

  return { ok: true, added, updated, skipped, error: null };
}

/* ---------- Сбрасывает балансы и гаджеты ВСЕХ игроков ----------
   Сами игроки остаются в списке.
--------------------------------------------------------- */
export function resetAllPlayerProgress() {
  if (!state.players.length) {
    return { ok: false, reason: "empty" };
  }

  state.players.forEach((player) => {
    state.balances[player] = 0;
    state.gadgets[player] = createEmptyInventory();
  });

  savePlayers();
  saveGadgets();
  saveToStorage(STORAGE_KEYS.balances, state.balances);

  renderPlayers();

  return { ok: true, count: state.players.length };
}


/* =========================================================
   PATCH 0.6.7 — Полное удаление всех игроков
   Удаляет имена, балансы, гаджеты. Список становится пустым.
========================================================= */
export function deleteAllPlayers() {
  if (!state.players.length) {
    return { ok: false, reason: "empty" };
  }

  const count = state.players.length;

  state.players = [];
  state.balances = {};
  state.gadgets = {};

  savePlayers();
  saveToStorage(STORAGE_KEYS.balances, state.balances);
  saveGadgets();
  renderPlayers();

  return { ok: true, count };
}
