/* =========================================================
   features/economy.js — балансы, ранги, расчёт раунда

   МОДЕЛЬ ЭКОНОМИКИ
   ----------------
   Игра с нулевой суммой между командами:

   1. Банк раунда  = POT_PER_CIVILIAN × число мирных (не больше MAX_POT).
      Кризис умножает банк на 2, успешный перехват — на множитель
      от размера пула локаций (чем больше локаций, тем он больше).
   2. Проигравшая команда платит банк, победившая делит ровно то,
      что собрано. Страховка и нижняя граница MIN_BALANCE уменьшают
      выплату победителям, а не создают монеты из воздуха.
      Доли внутри команды зависят от весов (см. computeSettlement).
   3. Все расчёты происходят ОДИН РАЗ — в конце раунда. Во время
      раунда деньги не двигаются, поэтому отмена раунда безопасна,
      а двойных штрафов за одно и то же не бывает.
   4. Страховка, налог должника и бонус за участие применяются
      к итоговой сумме игрока.

   Источник новых монет — только бонус за участие
   (PARTICIPATION_BONUS каждому игроку за сыгранный раунд).
   Стоки — покупки в магазине и налог должника (burned).
========================================================= */
// @ts-nocheck
"use strict";

import {
  state,
  STORAGE_KEYS,
  MIN_BALANCE,
  ELITE_THRESHOLD,
  ELITE_DISCOUNT,
  DEBTOR_TAX,
  POT_PER_CIVILIAN,
  MAX_POT,
  PARTICIPATION_BONUS,
  INITIATOR_WEIGHT,
  PARTIAL_INITIATOR_BONUS,
  EXPELLED_WIN_WEIGHT,
  EXPELLED_LOSS_WEIGHT,
  INTERCEPTOR_WEIGHT,
  WRONG_VOTE_STEP,
  WRONG_VOTE_MIN_WEIGHT,
  INTERCEPT_POT_PER_LOCATION,
  INTERCEPT_POT_MIN_MULT,
  INTERCEPT_POT_MAX_MULT,
  HUNT_STEAL
} from "../core/state.js";
import { saveToStorage } from "../core/storage.js";

/* ---------- Исходы, при которых побеждают мирные / шпионы ---------- */
const CIVILIAN_WIN_OUTCOMES = ["voting", "all-spies-failed"];
const SPY_WIN_OUTCOMES = ["timeout", "shutdown", "spy-location-success"];

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

/* ---------- Цена с учётом скидки элиты ---------- */
// Наценки для должников нет: с отрицательным балансом купить
// всё равно ничего нельзя, поэтому наценка была бы мёртвой.
export function getEffectivePrice(player, basePrice) {
  const balance = getBalance(player);

  let price = basePrice;

  if (balance > ELITE_THRESHOLD) {
    price = Math.max(1, Math.floor(price * (1 - ELITE_DISCOUNT)));
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
// При активном трекинге (во время раунда) фиксируем фактическое
// изменение — оно показывается в итогах и статистике.
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

/* =========================================================
   БАНК РАУНДА
========================================================= */

/* Множитель банка при успешном перехвате:
   pool × 0.25, но в пределах [0.5; 2].
   6 локаций → ×1.5, 8 и больше → ×2, 1–2 локации → ×0.5. */
export function getInterceptMultiplier(poolSize) {
  const raw = Math.max(0, Number(poolSize) || 0) * INTERCEPT_POT_PER_LOCATION;

  return Math.min(
    INTERCEPT_POT_MAX_MULT,
    Math.max(INTERCEPT_POT_MIN_MULT, raw)
  );
}

export function getRoundPot(civilianCount, options = {}) {
  const { crisis = false, interceptMultiplier = 1 } = options;

  let pot = Math.min(
    MAX_POT,
    POT_PER_CIVILIAN * Math.max(0, civilianCount)
  );

  if (crisis) pot *= 2;

  pot *= interceptMultiplier;

  return Math.round(pot);
}

/* Делит целую сумму total по весам методом наибольших остатков,
   чтобы сумма долей ровно равнялась total. */
function distribute(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);

  if (!(sum > 0) || total <= 0) {
    return weights.map(() => 0);
  }

  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);

  let remainder = total - floors.reduce((a, b) => a + b, 0);

  const order = raw
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  for (let i = 0; remainder > 0 && i < order.length; i += 1) {
    floors[order[i].index] += 1;
    remainder -= 1;
  }

  return floors;
}

function getWrongVotes(player) {
  return Number(state.wrongVotes[player]) || 0;
}

/* ---------- Вес игрока в доле ВЫИГРЫША своей команды ---------- */
function getWinWeight(assignment, context) {
  const { civilWin, initiator, interceptor } = context;
  const player = assignment.player;

  if (assignment.roleType === "civilian") {
    let weight = 1;

    if (civilWin) {
      if (player === initiator) weight = INITIATOR_WEIGHT;

      const partial = state.partialCatches.filter(
        (item) => item.initiator === player
      ).length;

      weight += PARTIAL_INITIATOR_BONUS * partial;
    }

    const wrong = getWrongVotes(player);

    if (wrong > 0) {
      weight *= Math.max(
        WRONG_VOTE_MIN_WEIGHT,
        1 - WRONG_VOTE_STEP * wrong
      );
    }

    return weight;
  }

  // Шпион.
  if (!civilWin && interceptor && player === interceptor) {
    return INTERCEPTOR_WEIGHT;
  }

  return assignment.excluded ? EXPELLED_WIN_WEIGHT : 1;
}

/* ---------- Вес игрока в доле ПРОИГРЫША своей команды ---------- */
function getLossWeight(assignment) {
  if (assignment.roleType === "civilian") {
    return 1 + WRONG_VOTE_STEP * getWrongVotes(assignment.player);
  }

  return assignment.excluded ? EXPELLED_LOSS_WEIGHT : 1;
}

/* =========================================================
   РАСЧЁТ РАУНДА (без применения)

   params:
     outcome     — "voting" | "all-spies-failed" |
                   "timeout" | "shutdown" | "spy-location-success"
     initiator   — инициатор финального голосования (или null)
     interceptor — шпион, угадавший локацию (или null)
     poolSize    — размер пула локаций (для множителя перехвата)

   Возвращает { pot, nominalPot, burned, deltas, insured, civilWin, hunt }.
   deltas — итоговое изменение баланса каждого игрока.
   Инвариант: Σ deltas = N × PARTICIPATION_BONUS − burned.
========================================================= */
export function computeSettlement(params) {
  const {
    outcome,
    initiator = null,
    interceptor = null,
    poolSize = 0
  } = params || {};

  const assignments = state.assignments;

  const civilians = assignments.filter(
    (item) => item.roleType === "civilian"
  );

  const spies = assignments.filter((item) => item.roleType === "spy");

  const deltas = {};
  const insured = [];

  assignments.forEach((item) => {
    deltas[item.player] = 0;
  });

  const civilWin = CIVILIAN_WIN_OUTCOMES.includes(outcome);
  const spyWin = SPY_WIN_OUTCOMES.includes(outcome);

  let pot = 0;
  let collected = 0;
  let burned = 0;

  if ((civilWin || spyWin) && civilians.length && spies.length) {
    pot = getRoundPot(civilians.length, {
      crisis: state.activeEvent === "crisis",
      interceptMultiplier:
        outcome === "spy-location-success"
          ? getInterceptMultiplier(poolSize)
          : 1
    });

    const winners = civilWin ? civilians : spies;
    const losers = civilWin ? spies : civilians;

    const context = { civilWin, initiator, interceptor };

    // 1) Сначала считаем, сколько проигравшие РЕАЛЬНО заплатят.
    //    Страховка обнуляет списание, а нижняя граница MIN_BALANCE
    //    ограничивает его балансом игрока. Победители делят только
    //    собранное, поэтому ни страховка, ни клэмп не создают монет.
    const losses = distribute(
      pot,
      losers.map((item) => getLossWeight(item))
    );

    losers.forEach((item, index) => {
      let amount = losses[index];

      if (item.roleType === "civilian") {
        const active = state.activeGadgets[item.player];

        if (amount > 0 && active && active.insurance) {
          amount = 0;
          insured.push(item.player);
        }
      }

      // Бонус за участие приходит в той же дельте, поэтому он
      // расширяет доступный лимит списания.
      const room = Math.max(
        0,
        getBalance(item.player) + PARTICIPATION_BONUS - MIN_BALANCE
      );

      amount = Math.min(amount, room);

      collected += amount;
      deltas[item.player] -= amount;
    });

    // 2) Победители делят собранную сумму (а не номинальный банк).
    const gains = distribute(
      collected,
      winners.map((item) => getWinWeight(item, context))
    );

    winners.forEach((item, index) => {
      let amount = gains[index];

      // Должник отдаёт 25% дохода в счёт долга. Эти монеты уходят
      // из игры (сток, как и покупки в магазине) и учитываются в burned.
      if (amount > 0 && getBalance(item.player) < 0) {
        const kept = Math.floor(amount * (1 - DEBTOR_TAX));
        burned += amount - kept;
        amount = kept;
      }

      deltas[item.player] += amount;
    });
  }

  // Бонус за участие — всем, не облагается налогом и не страхуется.
  assignments.forEach((item) => {
    deltas[item.player] += PARTICIPATION_BONUS;
  });

  const huntActive =
    state.activeEvent === "hunt" &&
    civilWin &&
    Boolean(initiator) &&
    civilians.some((item) => item.player === initiator);

  return {
    // pot — сколько монет реально перешло от проигравших к победителям.
    // nominalPot — банк по формуле (до страховки и нижней границы).
    pot: collected,
    nominalPot: pot,
    burned,
    deltas,
    insured,
    civilWin,
    hunt: huntActive ? { initiator, spies: spies.map((s) => s.player) } : null
  };
}

/* =========================================================
   РАСЧЁТ РАУНДА (с применением)

   Вызывается строго один раз за раунд из rounds.js.
   Возвращает { pot, deltas } — фактические изменения балансов.
========================================================= */
export function settleRound(params) {
  if (state.roundSettled) {
    return { pot: 0, nominalPot: 0, burned: 0, deltas: {}, hunt: null };
  }

  state.roundSettled = true;

  if (!state.lastBalanceChanges) {
    state.lastBalanceChanges = {};
  }

  const result = computeSettlement(params);

  const before = {};

  state.assignments.forEach((item) => {
    before[item.player] = getBalance(item.player);
  });

  Object.entries(result.deltas).forEach(([player, delta]) => {
    changeBalance(player, delta);
  });

  // Сработавшая страховка сгорает (в инвентаре её уже нет —
  // она сгорает при старте раунда).
  result.insured.forEach((player) => {
    if (state.activeGadgets[player]) {
      state.activeGadgets[player].insurance = false;
    }
  });

  // Событие «Охота за головами»: инициатор успешного голосования
  // забирает HUNT_STEAL монет у шпионов (поровну, из их балансов).
  let hunt = null;

  if (result.hunt && result.hunt.spies.length) {
    const perSpy = Math.floor(HUNT_STEAL / result.hunt.spies.length);

    let stolen = 0;

    if (perSpy > 0) {
      result.hunt.spies.forEach((spy) => {
        const spyBefore = getBalance(spy);
        changeBalance(spy, -perSpy);
        stolen += spyBefore - getBalance(spy);
      });

      if (stolen > 0) {
        changeBalance(result.hunt.initiator, stolen);
      }
    }

    hunt = { initiator: result.hunt.initiator, stolen };
  }

  const applied = {};

  state.assignments.forEach((item) => {
    applied[item.player] = getBalance(item.player) - before[item.player];
  });

  return {
    pot: result.pot,
    nominalPot: result.nominalPot,
    burned: result.burned,
    deltas: applied,
    hunt
  };
}
