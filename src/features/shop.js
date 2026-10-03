/* =========================================================
   features/shop.js — магазин снаряжения
========================================================= */
// @ts-nocheck
"use strict";

import {
  state,
  ELITE_THRESHOLD
} from "../core/state.js";
import {
  $,
  openDialog,
  closeDialog
} from "../core/dom.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { playSuccess, playFailure } from "../core/audio.js";
import {
  changeBalance,
  getBalance,
  getEffectivePrice,
  getPlayerRank
} from "./economy.js";
import {
  createEmptyInventory,
  saveGadgets
} from "./gadgets.js";
import { renderPlayers } from "./players.js";
import { GADGET_CATALOG } from "../constants/gadgets.js";

/* ---------- Создание модального окна магазина ---------- */
export function createShopModal() {
  let modal = $("#equipment-shop-modal");

  if (modal) return modal;

  modal = document.createElement("dialog");
  modal.id = "equipment-shop-modal";
  modal.className = "equipment-shop-modal";

  modal.innerHTML = `
    <div class="equipment-shop-modal__content">
      <button
        type="button"
        class="modal-close"
        data-close-shop
        aria-label="Закрыть"
      >
        ×
      </button>

      <div class="equipment-shop-modal__eyebrow">
        EQUIPMENT MARKET // PATCH 0.3
      </div>

      <h2 class="equipment-shop-modal__title">
        Магазин снаряжения
      </h2>

      <p class="equipment-shop-modal__player"></p>

      <div class="equipment-shop-modal__balance"></div>

      <div class="equipment-shop-modal__items"></div>

      <p class="equipment-shop-modal__status"></p>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (
      event.target === modal ||
      event.target.closest("[data-close-shop]")
    ) {
      closeDialog(modal);
    }

    const buyButton = event.target.closest("[data-buy-gadget]");

    if (!buyButton) return;

    const player = modal.dataset.player;
    const gadgetId = buyButton.dataset.buyGadget;

    buyGadget(player, gadgetId);
    renderShopModal(player);
  });

  return modal;
}

/* ---------- Отрисовка содержимого магазина ---------- */
export function renderShopModal(player) {
  const modal = createShopModal();

  modal.dataset.player = player;

  const balance = getBalance(player);
  const rank = getPlayerRank(player);
  const inventory =
    state.gadgets[player] || createEmptyInventory();

  const playerElement = modal.querySelector(
    ".equipment-shop-modal__player"
  );

  const balanceElement = modal.querySelector(
    ".equipment-shop-modal__balance"
  );

  const itemsContainer = modal.querySelector(
    ".equipment-shop-modal__items"
  );

  const statusElement = modal.querySelector(
    ".equipment-shop-modal__status"
  );

  playerElement.textContent = `Профиль: ${player} — ${rank.label}`;
  balanceElement.textContent = `Баланс: ${balance} 🪙`;

  itemsContainer.innerHTML = GADGET_CATALOG.map((gadget) => {
    const owned =
      gadget.key === "radar"
        ? inventory.radar > 0
        : Boolean(inventory[gadget.key]);

    const price = getEffectivePrice(player, gadget.price);
    const canAfford = balance >= price;
    const crisis = state.activeEvent === "crisis";

    const disabled = owned || !canAfford || crisis;

    const buttonModifier =
      gadget.side === "spy"
        ? "button--danger"
        : "button--primary";

    const buttonLabel = owned
      ? "Уже куплено"
      : crisis
      ? "Заблокировано"
      : !canAfford
      ? `Недостаточно (${price} 🪙)`
      : `${price} 🪙`;

    return `
      <article class="equipment-item">
        <div class="equipment-item__icon">
          ${gadget.side === "spy" ? "☠" : "⛨"}
        </div>

        <div class="equipment-item__body">
          <h3>${escapeHtml(gadget.name)}</h3>
          <p>${escapeHtml(gadget.description)}</p>

          <div class="equipment-item__actions">
            <button
              type="button"
              class="button ${buttonModifier}"
              data-buy-gadget="${gadget.id}"
              ${disabled ? "disabled" : ""}
            >
              ${buttonLabel}
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("");

  if (state.activeEvent === "crisis") {
    statusElement.textContent =
      "⚠ ЭКОНОМИЧЕСКИЙ КРИЗИС: покупки временно заблокированы.";
    statusElement.className =
      "equipment-shop-modal__status equipment-shop-modal__status--danger";
  } else if (balance < 0) {
    statusElement.textContent =
      "⚠ Должник Синдиката: наценка +20%, выигрыш урезан на 25%.";
    statusElement.className =
      "equipment-shop-modal__status equipment-shop-modal__status--danger";
  } else if (balance > ELITE_THRESHOLD) {
    statusElement.textContent =
      "★ Элита МИ-6: автоматическая скидка 10% на все покупки.";
    statusElement.className =
      "equipment-shop-modal__status equipment-shop-modal__status--elite";
  } else {
    statusElement.textContent =
      "Предметы покупаются втайне. Если роль не подойдёт — предмет замораживается.";
    statusElement.className = "equipment-shop-modal__status";
  }
}

/* ---------- Открытие магазина для игрока ---------- */
export function openPlayerShop(player) {
  if (!state.players.includes(player)) return;

  if (state.activeEvent === "crisis") {
    showToast("Покупки заблокированы: экономический кризис");
    playFailure();
    return;
  }

  const modal = createShopModal();

  renderShopModal(player);
  openDialog(modal);
}

/* ---------- Покупка предмета ---------- */
export function buyGadget(player, gadgetId) {
  const gadget = GADGET_CATALOG.find(
    (item) => item.id === gadgetId
  );

  if (!gadget) return;

  if (state.activeEvent === "crisis") {
    showToast("Покупки заблокированы: экономический кризис");
    playFailure();
    return;
  }

  if (!state.gadgets[player]) {
    state.gadgets[player] = createEmptyInventory();
  }

  const inventory = state.gadgets[player];

  if (gadget.key === "radar") {
    if (inventory.radar) {
      showToast("У игрока уже есть радар");
      playFailure();
      return;
    }
  } else if (inventory[gadget.key]) {
    showToast("Этот предмет уже куплен");
    playFailure();
    return;
  }

  const price = getEffectivePrice(player, gadget.price);

  if (getBalance(player) < price) {
    showToast("Недостаточно коинов");
    playFailure();
    return;
  }

  changeBalance(player, -price);

  if (gadget.key === "radar") {
    inventory.radar = gadget.level;
  } else {
    inventory[gadget.key] = 1;

    // PATCH 0.4.2 — покупка нового удостоверения сбрасывает флаг использования.
    if (gadget.key === "fakeId") {
      inventory.fakeIdUsed = false;
    }
  }

  saveGadgets();
  renderPlayers();
  playSuccess();
  showToast(`Куплено: ${gadget.name} за ${price} 🪙`);
}
