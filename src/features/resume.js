/* =========================================================
   features/resume.js — продолжение прерванного раунда

   При запуске игры ищем снимок активного раунда (roundStore.js).
   Если он есть — предлагаем:
   - «Продолжить»: раунд восстанавливается, таймер на паузе;
   - «Отменить раунд»: никто ничего не получает и не теряет,
     купленные предметы возвращаются.
========================================================= */
// @ts-nocheck
"use strict";

import { state } from "../core/state.js";
import {
  elements,
  showScreen,
  openDialog,
  closeDialog
} from "../core/dom.js";
import { formatTime } from "../core/utils.js";
import {
  loadRoundSnapshot,
  applyRoundSnapshot,
  clearRoundSnapshot
} from "./roundStore.js";
import { prepareDealingScreen } from "./dealing.js";
import { restoreGameTimer } from "./timer.js";
import {
  createJudgingInterface,
  renderJudgingInterface
} from "./judging.js";
import { cancelRound } from "./rounds.js";
import { renderPlayers } from "./players.js";

let pendingSnapshot = null;

function describeSnapshot(snap) {
  const total = snap.assignments.length;

  if (snap.phase === "dealing") {
    return (
      `Игроков: ${total}. Идёт раздача ролей ` +
      `(роли увидели: ${Number(snap.revealedCount) || 0}).`
    );
  }

  const left = Math.ceil((Number(snap.remainingMs) || 0) / 1000);
  const time = formatTime(left);

  return (
    `Игроков: ${total}. Идёт игра, осталось ` +
    `${time.minutes}:${time.seconds}. Таймер встанет на паузу.`
  );
}

function restore(snap) {
  applyRoundSnapshot(snap);
  renderPlayers();

  if (snap.phase === "dealing") {
    prepareDealingScreen({ keepProgress: true });
    showScreen("dealing");
    return;
  }

  showScreen("game");
  restoreGameTimer();
  createJudgingInterface();
  renderJudgingInterface();
}

/* ---------- Вызывается один раз при запуске ---------- */
export function offerResumeIfNeeded() {
  const modal = elements.resumeRoundModal;

  if (!modal) return false;

  const snap = loadRoundSnapshot();

  if (!snap) {
    // Снимок битый или устарел — убираем, чтобы не мешал.
    clearRoundSnapshot();
    return false;
  }

  pendingSnapshot = snap;

  if (elements.resumeRoundSummary) {
    elements.resumeRoundSummary.textContent = describeSnapshot(snap);
  }

  // Escape не закрывает окно: нужно сделать осознанный выбор.
  modal.addEventListener("cancel", (event) => event.preventDefault());

  elements.resumeRoundContinue.addEventListener("click", () => {
    const snapshot = pendingSnapshot;
    pendingSnapshot = null;

    closeDialog(modal);

    if (snapshot) restore(snapshot);
  });

  elements.resumeRoundCancel.addEventListener("click", () => {
    const snapshot = pendingSnapshot;
    pendingSnapshot = null;

    closeDialog(modal);

    if (!snapshot) return;

    // Применяем снимок, чтобы знать, какие предметы вернуть,
    // и отменяем раунд штатным способом.
    applyRoundSnapshot(snapshot);
    cancelRound();
  });

  openDialog(modal);

  return true;
}
