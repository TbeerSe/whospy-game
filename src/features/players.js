/* =========================================================
   features/players.js — реестр игроков и их карточек
========================================================= */
// @ts-nocheck
"use strict";

import { state, STORAGE_KEYS } from "../core/state.js";
import { elements } from "../core/dom.js";
import {
  readFromStorage,
  saveToStorage
} from "../core/storage.js";
import { escapeHtml, showToast } from "../core/utils.js";
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

/* ---------- Отрисовка карточек игроков ---------- */
export function renderPlayers() {
  elements.playersList.innerHTML = "";
  elements.playersCount.textContent = String(state.players.length);
  elements.playersEmpty.hidden = state.players.length > 0;

  state.players.forEach((player, index) => {
    const item = document.createElement("div");
    item.className = "player-item";

    const balance = getBalance(player);
    const rank = getPlayerRank(player);
    const inventory =
      state.gadgets[player] || createEmptyInventory();

    const badges = [];

    if (inventory.radar) {
      badges.push(`◉ Радар ${inventory.radar}`);
    }

    if (inventory.jammer) badges.push("⌁ Глушитель");
    if (inventory.fakeId) badges.push("✎ Удостоверение");
    if (inventory.lieDetector) badges.push("? Детектор");
    if (inventory.extraInterrogation) badges.push("+ Допрос");
    if (inventory.insurance) badges.push("⛨ Страховка");

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
          ${
            badges.length
              ? `<span class="player-item__gadgets">${badges
                  .map(escapeHtml)
                  .join(" · ")}</span>`
              : ""
          }
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
