/* =========================================================
   features/economy.js — балансы, ранги, начисления
========================================================= */
// @ts-nocheck
"use strict";

import {
  state,
  STORAGE_KEYS,
  MIN_BALANCE,
  ELITE_THRESHOLD,
  DEBTOR_MARKUP,
  ELITE_DISCOUNT,
  DEBTOR_TAX
} from "../core/state.js";
import { saveToStorage } from "../core/storage.js";

/* ---------- Ранг игрока по балансу ---------- */
export function getPlayerRank(player) {
  const balance = getBalance(player);

  if (balance < 0) {
    return {
      label: "Должник Синдиката",
      modifier: "debtor"
    };
  }

  if (balance > ELITE_THRESHOLD) {
    return {
      label: "Элита МИ-6",
      modifier: "elite"
    };
  }

  return {
    label: "Агент под прикрытием",
    modifier: "agent"
  };
}

/* ---------- Цена с учётом скидки/наценки ---------- */
export function getEffectivePrice(player, basePrice) {
  const balance = getBalance(player);

  let price = basePrice;

  if (balance > ELITE_THRESHOLD) {
    price = Math.max(1, Math.floor(price * (1 - ELITE_DISCOUNT)));
  }

  if (balance < 0) {
    price = Math.max(1, Math.ceil(price * (1 + DEBTOR_MARKUP)));
  }

  return price;
}

/* ---------- Приведение балансов в валидный вид ---------- */
export function normalizeBalances() {
  const result = {};

  state.players.forEach((player) => {
    const storedValue = Number(state.balances[player]);

    result[player] = Number.isFinite(storedValue)
      ? Math.max(MIN_BALANCE, Math.floor(storedValue))
      : 0;
  });

  state.balances = result;
  saveToStorage(STORAGE_KEYS.balances, state.balances);
}

/* ---------- Чтение баланса ---------- */
export function getBalance(player) {
  const value = Number(state.balances[player]);
  return Number.isFinite(value) ? Math.floor(value) : 0;
}

/* ---------- Изменение баланса ---------- */
// PATCH 0.4.2 — при активном трекинге фиксируем фактическое изменение.
export function changeBalance(player, amount) {
  if (!player) return;

  const before = getBalance(player);
  const nextValue = before + Number(amount || 0);

  state.balances[player] = Math.max(
    MIN_BALANCE,
    Math.floor(nextValue)
  );

  saveToStorage(STORAGE_KEYS.balances, state.balances);

  if (state.lastBalanceChanges) {
    const after = getBalance(player);
    const actual = after - before;

    state.lastBalanceChanges[player] =
      (state.lastBalanceChanges[player] || 0) + actual;
  }
}

/* ---------- Начисление/списание с учётом событий и страховки ---------- */
export function applyRoundReward(player, baseAmount) {
  if (!player || !Number.isFinite(baseAmount) || baseAmount === 0) {
    return 0;
  }

  let amount = baseAmount;

  // Событие «Кризис» удваивает и награды, и штрафы ДО срабатывания
  // страховки. То есть страховка обнуляет уже удвоенный штраф —
  // это осознанное решение (страховка полностью покрывает урон
  // даже в кризис, но не даёт «прибыли»).
  if (state.activeEvent === "crisis") {
    amount = amount * 2;
  }

  if (amount < 0) {
    const gadgets = state.activeGadgets[player];

    if (gadgets && gadgets.insurance) {
      gadgets.insurance = false;
      return 0;
    }
  }

  if (amount > 0 && getBalance(player) < 0) {
    amount = Math.floor(amount * (1 - DEBTOR_TAX));
  }

  changeBalance(player, amount);

  return amount;
}
