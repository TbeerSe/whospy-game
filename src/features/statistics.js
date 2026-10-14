/* =========================================================
   features/statistics.js — история раундов (статистика)
   PATCH 0.7.0

   Новые события:
   - intercept_public_started
   - intercept_success
   - intercept_failure
   - vote_success_partial
   - verificator_used
   - verificator_burned

   recordRound теперь сохраняет ВСЕ попытки перехвата в
   entry.intercepts (массив). Для обратной совместимости
   оставлено entry.intercept (последняя/единственная попытка).
========================================================= */
// @ts-nocheck
"use strict";

import { state } from "../core/state.js";
import { $, openDialog } from "../core/dom.js";
import { escapeHtml } from "../core/utils.js";
import {
  appendRoundHistory,
  clearRoundHistory as clearRoundHistoryStorage
} from "../core/storage.js";

/* =========================================================
   Вспомогательные функции
========================================================= */

function getWinner(outcome) {
  if (
    outcome === "voting" ||
    outcome === "spy-location-failure" ||
    outcome === "all-spies-failed"
  ) {
    return "civilians";
  }
  return "spies";
}

function collectUsedGadgets(player) {
  const active = state.activeGadgets[player];
  if (!active || typeof active !== "object") return [];

  const list = [];

  if (active.radar) list.push("radar" + active.radar);
  if (active.jammer) list.push("jammer");
  if (active.fakeId) list.push("fakeId");
  if (active.extraInterrogation) list.push("extraInterrogation");
  if (active.insurance) list.push("insurance");

  return list;
}

/* ---------- Использовал ли игрок Верификатор в этом раунде ---------- */
function getUsedVerificator(player) {
  if (!state.verificatorUsedThisRound) return null;
  if (!state.verificatorUsedThisRound.has(player)) return null;

  const assignment = state.assignments.find(
    (item) => item.player === player
  );

  if (!assignment) return null;

  return assignment.roleType === "spy" ? "spy" : "civilian";
}

function formatDateTime(ts) {
  if (!Number.isFinite(ts)) return "—";
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    pad(d.getDate()) + "." +
    pad(d.getMonth() + 1) + "." +
    d.getFullYear() + " " +
    pad(d.getHours()) + ":" +
    pad(d.getMinutes())
  );
}

function formatEventAt(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return (
    String(m).padStart(2, "0") +
    ":" +
    String(r).padStart(2, "0")
  );
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return r + " с";
  return m + " мин " + r + " с";
}

/* ---------- Человекочитаемое описание события раунда ---------- */
function humanizeRoundEvent(evt) {
  if (!evt || typeof evt !== "object") return null;
  const d = evt.data || {};
  const esc = escapeHtml;

  switch (evt.type) {
    case "timer_start":
      return {
        icon: "⏱",
        text:
          "Таймер запущен: " +
          Math.round((d.totalSeconds || 0) / 60) +
          " мин" +
          (d.modifierSeconds
            ? " (модификатор " +
              (d.modifierSeconds > 0 ? "+" : "") +
              Math.round(d.modifierSeconds / 60) +
              " мин)"
            : "")
      };
    case "timer_paused":
      return { icon: "⏸", text: "Пауза" };
    case "timer_resumed":
      return { icon: "▶", text: "Продолжение" };
    case "timer_warning":
      return {
        icon: "⚠",
        text: "Осталось " + (d.remaining || 0) + " с"
      };
    case "vote_suspect_selected":
      return {
        icon: "🎯",
        text: "Выбран подозреваемый: " + esc(d.suspect || "—")
      };
    case "vote_initiator_selected":
      return {
        icon: "🎤",
        text:
          "Инициатор: " + esc(d.initiator || "—") +
          " (против " + esc(d.suspect || "—") + ")"
      };
    case "vote_cast":
      return {
        icon: "✚",
        text:
          esc(d.voter || "—") + " → " +
          esc(d.suspect || "—") +
          " (" + (d.totalVoters || 1) + ")"
      };
    case "vote_cancelled":
      return {
        icon: "✖",
        text:
          esc(d.voter || "—") +
          " отменил голос против " +
          esc(d.suspect || "—")
      };
    case "vote_fake_id_used":
      return {
        icon: "✎",
        text:
          "Фальшивое удостоверение спасло " +
          esc(d.suspect || "—")
      };
    case "vote_success":
      return {
        icon: "✅",
        text:
          "Последний шпион " + esc(d.suspect || "—") +
          " вычислен голосованием (" +
          (d.voters || []).length + " голосов)"
      };

    // PATCH 0.7.0 — промежуточный выгон шпиона.
    case "vote_success_partial":
      return {
        icon: "⚔",
        text:
          "Шпион " + esc(d.suspect || "—") +
          " вычислен голосованием (" +
          (d.voters || []).length +
          " голосов). Игра продолжается."
      };

    case "vote_excluded":
      return {
        icon: "⛔",
        text:
          "Исключены " + esc(d.suspect || "—") +
          " (" + esc(d.suspectRole || "?") + ") и " +
          esc(d.initiator || "—") +
          " (" + esc(d.initiatorRole || "?") + ", инициатор)"
      };

    // PATCH 0.7.0 — публичное вскрытие перехвата.
    case "intercept_public_started":
      return {
        icon: "📡",
        text:
          "Публичное вскрытие перехвата: " +
          esc(d.player || "—") + " взял телефон"
      };

    case "intercept_success":
      return {
        icon: "🎉",
        text:
          "Перехват удачен: " + esc(d.player || "—") +
          " угадал локацию " + esc(d.location || "—") +
          (d.priorFailures
            ? " (провалов до: " + d.priorFailures + ")"
            : "")
      };

    case "intercept_failure":
      return {
        icon: "💥",
        text:
          "Перехват провален: " + esc(d.player || "—") +
          " ошибся с локацией и выбывает" +
          (d.priorFailures
            ? " (провалов до: " + d.priorFailures + ")"
            : "")
      };


    // PATCH 0.7.0 — Верификатор.
    case "verificator_used":
      return {
        icon: d.isSpy ? "🔺" : "🔻",
        text:
          "Верификатор (" +
          (d.kind === "spy" ? "шпионский" : "мирный") +
          "): " + esc(d.owner || "—") +
          " проверил " + esc(d.target || "—") +
          " — «" + esc(d.verdict || "—") + "»"
      };

    case "verificator_burned":
      return {
        icon: "🔥",
        text:
          "Верификатор сгорел у " +
          esc(d.owner || "—") +
          " (" +
          (d.kind === "spy" ? "шпионский" : "мирный") +
          ")"
      };

    case "reveal_role_shown":
      return {
        icon: "◉",
        text: "Роль показана: " + esc(d.player || "—")
      };
    case "reveal_role_hidden":
      return {
        icon: "↪",
        text: "Роль скрыта: " + esc(d.player || "—")
      };

    default:
      return {
        icon: "•",
        text: evt.type
      };
  }
}

/* =========================================================
   Публичный API
========================================================= */

/* ---------- Запись раунда в историю ---------- */
export function recordRound(options) {
  const opts = options || {};
  const outcome = opts.outcome || state.gameOutcome || "timeout";
  const startedAt = state.currentRoundStartedAt || Date.now();
  const endedAt = Date.now();

  const players = state.assignments.map((assignment) => {
    const delta =
      (state.lastBalanceChanges &&
        state.lastBalanceChanges[assignment.player]) ||
      0;

    const usedVerificator = getUsedVerificator(assignment.player);

    return {
      name: assignment.player,
      role: assignment.role || null,
      roleType: assignment.roleType,
      excluded: Boolean(assignment.excluded),
      usedGadgets: collectUsedGadgets(assignment.player),
      balanceDelta: Number(delta) || 0,
      // PATCH 0.7.0 — если игрок использовал Верификатор:
      // "spy" для шпионского, "civilian" для мирного.
      usedVerificator
    };
  });

  const voters = {};
  Object.entries(state.voting.committedVotes || {}).forEach(
    ([voter, suspect]) => {
      voters[voter] = suspect;
    }
  );

  const wrongVotes = {};
  Object.entries(state.wrongVotes || {}).forEach(([player, count]) => {
    if (count > 0) wrongVotes[player] = count;
  });

  const events = Array.isArray(state.currentRoundEvents)
    ? state.currentRoundEvents.map((e) => ({
        at: Number(e?.at) || 0,
        type: String(e?.type || ""),
        data:
          e?.data && typeof e.data === "object"
            ? { ...e.data }
            : {}
      }))
    : [];

  // PATCH 0.7.0 — снимок ВСЕХ попыток перехвата.
  const intercepts = Array.isArray(state.interceptResults)
    ? state.interceptResults.map((r) => ({
        player: String(r?.player || ""),
        location: String(r?.location || ""),
        success: Boolean(r?.success),
        priorFailures: Number(r?.priorFailures) || 0,
        reward: Number(r?.reward) || 0
      }))
    : [];

  // Обратная совместимость: последняя попытка в старом формате.
  // Если попыток не было — пусто.
  const lastIntercept = intercepts.length
    ? intercepts[intercepts.length - 1]
    : null;

  const entry = {
    id: "round_" + endedAt,
    startedAt,
    endedAt,
    durationSeconds: Math.max(
      0,
      Math.floor((endedAt - startedAt) / 1000)
    ),
    outcome,
    winner: getWinner(outcome),
    realLocation: state.currentRoundLocation || "—",
    event: state.activeEvent || null,
    players,
    voting: {
      suspect: state.voting.suspect || null,
      initiator: state.voting.initiator || null,
      voters,
      wrongVotes
    },
    // Новый формат — массив всех попыток.
    intercepts,
    // Старый формат — для совместимости рендера и бэкапов.
    intercept: {
      attempted: Boolean(lastIntercept),
      guessedLocation: lastIntercept ? lastIntercept.location : null,
      correct: lastIntercept ? lastIntercept.success : false
    },
    events
  };

  appendRoundHistory(entry);

  return entry;
}

/* ---------- Отрисовка списка раундов ---------- */
export function renderStatisticsModal() {
  const modal = $("#statistics-modal");
  if (!modal) return;

  const list = modal.querySelector("#statistics-list");
  const empty = modal.querySelector("#statistics-empty");
  const countEl = modal.querySelector("#statistics-count");
  const clearBtn = modal.querySelector("#statistics-clear");

  if (!list || !empty) return;

  const history = state.roundHistory.slice().reverse();

  if (countEl) {
    countEl.textContent = String(state.roundHistory.length);
  }

  if (clearBtn) {
    clearBtn.disabled = state.roundHistory.length === 0;
  }

  if (!history.length) {
    list.innerHTML = "";
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  list.innerHTML = history
    .map((entry) => {
      const winnerClass =
        entry.winner === "civilians"
          ? "stat-round__winner--civilians"
          : "stat-round__winner--spies";

      const winnerText =
        entry.winner === "civilians" ? "МИРНЫЕ" : "ШПИОНЫ";

      const playersHtml = entry.players
        .map((p) => {
          const roleText =
            p.roleType === "spy"
              ? "☠ ШПИОН"
              : "◈ " + escapeHtml(p.role || "—");

          const deltaClass =
            p.balanceDelta > 0
              ? "stat-player__delta--up"
              : p.balanceDelta < 0
              ? "stat-player__delta--down"
              : "stat-player__delta--zero";

          const sign = p.balanceDelta > 0 ? "+" : "";
          const deltaText =
            p.balanceDelta !== 0
              ? sign + p.balanceDelta + " 🪙"
              : "0";

          const excluded = p.excluded
            ? '<span class="stat-player__excluded">ИСКЛ</span>'
            : "";

          const gadgets = [];

          if (Array.isArray(p.usedGadgets) && p.usedGadgets.length) {
            gadgets.push.apply(gadgets, p.usedGadgets);
          }

          if (p.usedVerificator) {
            gadgets.push(
              "verificator" +
                (p.usedVerificator === "spy" ? "Spy" : "Civilian")
            );
          }

          const gadgetsHtml = gadgets.length
            ? '<span class="stat-player__gadgets">' +
              gadgets.map(escapeHtml).join(" · ") +
              "</span>"
            : "";

          return (
            '<div class="stat-player">' +
              '<span class="stat-player__name">' +
                escapeHtml(p.name) +
                excluded +
              "</span>" +
              '<span class="stat-player__role">' +
                roleText +
              "</span>" +
              gadgetsHtml +
              '<span class="stat-player__delta ' +
                deltaClass +
              '">' +
                deltaText +
              "</span>" +
            "</div>"
          );
        })
        .join("");

      const votersList = Object.entries(entry.voting.voters || {})
        .map(
          ([voter, suspect]) =>
            escapeHtml(voter) + " → " + escapeHtml(suspect)
        )
        .join(", ");

      const votingHtml = votersList
        ? '<p class="stat-detail__line"><strong>Голоса:</strong> ' +
          votersList + "</p>"
        : "";

      const initiatorHtml = entry.voting.initiator
        ? '<p class="stat-detail__line"><strong>Инициатор:</strong> ' +
          escapeHtml(entry.voting.initiator) + "</p>"
        : "";

      const suspectHtml = entry.voting.suspect
        ? '<p class="stat-detail__line"><strong>Подозреваемый:</strong> ' +
          escapeHtml(entry.voting.suspect) + "</p>"
        : "";

      const eventText = entry.event
        ? '<p class="stat-detail__line"><strong>Событие:</strong> ' +
          escapeHtml(entry.event) + "</p>"
        : "";

      // PATCH 0.7.0 — выводим все попытки перехвата из
      // нового массива. Фолбэк на старый формат — если
      // бэкап старый и в entry.intercepts пусто.
      let interceptHtml = "";

      const attempts = Array.isArray(entry.intercepts)
        ? entry.intercepts
        : [];

      if (attempts.length) {
        const rows = attempts
          .map(
            (r) =>
              escapeHtml(r.player || "—") +
              " → " +
              escapeHtml(r.location || "—") +
              " " +
              (r.success ? "✅" : "❌") +
              (r.reward ? " +" + r.reward + " 🪙" : "")
          )
          .join("<br>");

        interceptHtml =
          '<p class="stat-detail__line"><strong>Перехват:</strong><br>' +
          rows + "</p>";
      } else if (entry.intercept && entry.intercept.attempted) {
        interceptHtml =
          '<p class="stat-detail__line"><strong>Перехват:</strong> ' +
          escapeHtml(entry.intercept.guessedLocation || "—") +
          " — " +
          (entry.intercept.correct ? "✅ верно" : "❌ мимо") +
          "</p>";
      }

      return (
        '<details class="stat-round">' +
          "<summary>" +
            '<span class="stat-round__date">' +
              formatDateTime(entry.endedAt) +
            "</span>" +
            '<span class="stat-round__winner ' +
              winnerClass +
            '">' +
              winnerText +
            "</span>" +
            '<span class="stat-round__meta">' +
              formatDuration(entry.durationSeconds) +
              " · " +
              escapeHtml(entry.realLocation) +
            "</span>" +
            '<button type="button" class="stat-round__details-btn"' +
              ' data-round-detail="' + escapeHtml(entry.id) + '"' +
              ' aria-label="Детали раунда"' +
              ' title="Детали раунда">?</button>' +
          "</summary>" +
          '<div class="stat-round__body">' +
            '<div class="stat-players">' +
              playersHtml +
            "</div>" +
            '<div class="stat-detail">' +
              suspectHtml +
              initiatorHtml +
              votingHtml +
              eventText +
              interceptHtml +
            "</div>" +
          "</div>" +
        "</details>"
      );
    })
    .join("");
}

/* ---------- Открытие модалки статистики ---------- */
export function openStatisticsModal() {
  const modal = $("#statistics-modal");
  if (!modal) return;

  renderStatisticsModal();
  openDialog(modal);
}

/* =========================================================
   PATCH 0.6.7 — Детали раунда
========================================================= */

function renderRoundDetailBody(entry) {
  if (!entry || typeof entry !== "object") {
    return '<p class="judging-empty">Раунд не найден.</p>';
  }

  const esc = escapeHtml;

  const winnerClass =
    entry.winner === "civilians"
      ? "stat-round__winner--civilians"
      : "stat-round__winner--spies";

  const winnerText =
    entry.winner === "civilians" ? "МИРНЫЕ" : "ШПИОНЫ";

  const outcomeLabels = {
    "timeout": "Время истекло",
    "voting": "Голосование мирных",
    "spy-location-success": "Шпион угадал локацию",
    "spy-location-failure": "Шпион ошибся с локацией",
    "all-spies-failed": "Все шпионы провалили перехват",
    "shutdown": "Шпион победил по истощению"
  };

  const eventLabels = {
    "crisis": "🌪 Экономический кризис",
    "hunt": "🎯 Охота за головами",
    "philanthropist": "💚 Анонимный благотворитель"
  };

  const header =
    '<div class="round-detail__summary">' +
      '<div class="round-detail__summary-row">' +
        '<span class="round-detail__label">Начало:</span>' +
        '<span class="round-detail__value">' +
          formatDateTime(entry.startedAt) +
        "</span>" +
      "</div>" +
      '<div class="round-detail__summary-row">' +
        '<span class="round-detail__label">Конец:</span>' +
        '<span class="round-detail__value">' +
          formatDateTime(entry.endedAt) +
        "</span>" +
      "</div>" +
      '<div class="round-detail__summary-row">' +
        '<span class="round-detail__label">Длительность:</span>' +
        '<span class="round-detail__value">' +
          formatDuration(entry.durationSeconds) +
        "</span>" +
      "</div>" +
      '<div class="round-detail__summary-row">' +
        '<span class="round-detail__label">Победитель:</span>' +
        '<span class="stat-round__winner ' + winnerClass + '">' +
          winnerText +
        "</span>" +
      "</div>" +
      '<div class="round-detail__summary-row">' +
        '<span class="round-detail__label">Исход:</span>' +
        '<span class="round-detail__value">' +
          esc(outcomeLabels[entry.outcome] || entry.outcome || "—") +
        "</span>" +
      "</div>" +
      '<div class="round-detail__summary-row">' +
        '<span class="round-detail__label">Реальная локация:</span>' +
        '<span class="round-detail__value">' +
          esc(entry.realLocation || "—") +
        "</span>" +
      "</div>" +
      (entry.event
        ? '<div class="round-detail__summary-row">' +
            '<span class="round-detail__label">Событие:</span>' +
            '<span class="round-detail__value">' +
              esc(eventLabels[entry.event] || entry.event) +
            "</span>" +
          "</div>"
        : "") +
    "</div>";

  const events = Array.isArray(entry.events) ? entry.events : [];

  let timelineHtml = "";

  if (events.length) {
    const rows = events
      .map((evt) => {
        const human = humanizeRoundEvent(evt);

        if (!human) return "";

        return (
          '<li class="round-detail__event">' +
            '<span class="round-detail__event-time">' +
              formatEventAt(evt.at) +
            "</span>" +
            '<span class="round-detail__event-icon">' +
              esc(human.icon) +
            "</span>" +
            '<span class="round-detail__event-text">' +
              human.text +
            "</span>" +
          "</li>"
        );
      })
      .join("");

    timelineHtml =
      '<div class="round-detail__section">' +
        '<h4 class="round-detail__section-title">' +
          "Хронология (" + events.length + ")" +
        "</h4>" +
        '<ul class="round-detail__events">' +
          rows +
        "</ul>" +
      "</div>";
  } else {
    timelineHtml =
      '<div class="round-detail__section">' +
        '<h4 class="round-detail__section-title">Хронология</h4>' +
        '<p class="judging-empty">' +
          "Для этого раунда хронология не сохранена." +
        "</p>" +
      "</div>";
  }

  // --- Голосование ---
  const votersObj = entry.voting && entry.voting.voters
    ? entry.voting.voters
    : {};

  const voterEntries = Object.entries(votersObj);

  let votingHtml = "";

  if (
    entry.voting &&
    (entry.voting.suspect || entry.voting.initiator || voterEntries.length)
  ) {
    const rows = [];

    if (entry.voting.suspect) {
      rows.push(
        '<div class="round-detail__line">' +
          '<span class="round-detail__label">Подозреваемый:</span> ' +
          '<strong>' + esc(entry.voting.suspect) + "</strong>" +
        "</div>"
      );
    }

    if (entry.voting.initiator) {
      rows.push(
        '<div class="round-detail__line">' +
          '<span class="round-detail__label">Инициатор:</span> ' +
          '<strong>' + esc(entry.voting.initiator) + "</strong>" +
        "</div>"
      );
    }

    if (voterEntries.length) {
      rows.push(
        '<div class="round-detail__line">' +
          '<span class="round-detail__label">Голоса:</span>' +
        "</div>"
      );

      rows.push(
        '<ul class="round-detail__votes">' +
          voterEntries
            .map(
              ([voter, suspect]) =>
                "<li>" +
                  esc(voter) +
                  ' <span class="round-detail__arrow">→</span> ' +
                  esc(suspect) +
                "</li>"
            )
            .join("") +
        "</ul>"
      );
    }

    const wrongVotes = entry.voting.wrongVotes || {};
    const wrongEntries = Object.entries(wrongVotes);

    if (wrongEntries.length) {
      rows.push(
        '<div class="round-detail__line">' +
          '<span class="round-detail__label">Неверных голосов:</span> ' +
          wrongEntries
            .map(
              ([name, count]) =>
                esc(name) + " ×" + esc(String(count))
            )
            .join(", ") +
        "</div>"
      );
    }

    votingHtml =
      '<div class="round-detail__section">' +
        '<h4 class="round-detail__section-title">Голосование</h4>' +
        rows.join("") +
      "</div>";
  }

  // --- Игроки ---
  const playersHtml =
    '<div class="round-detail__section">' +
      '<h4 class="round-detail__section-title">' +
        "Игроки (" + (entry.players || []).length + ")" +
      "</h4>" +
      '<div class="stat-players">' +
        (entry.players || [])
          .map((p) => {
            const roleText =
              p.roleType === "spy"
                ? "☠ ШПИОН"
                : "◈ " + esc(p.role || "—");

            const deltaClass =
              p.balanceDelta > 0
                ? "stat-player__delta--up"
                : p.balanceDelta < 0
                ? "stat-player__delta--down"
                : "stat-player__delta--zero";

            const sign = p.balanceDelta > 0 ? "+" : "";
            const deltaText =
              p.balanceDelta !== 0
                ? sign + p.balanceDelta + " 🪙"
                : "0";

            const excluded = p.excluded
              ? '<span class="stat-player__excluded">ИСКЛ</span>'
              : "";

            const gadgets = [];

            if (Array.isArray(p.usedGadgets) && p.usedGadgets.length) {
              gadgets.push.apply(gadgets, p.usedGadgets);
            }

            if (p.usedVerificator) {
              gadgets.push(
                "verificator" +
                  (p.usedVerificator === "spy" ? "Spy" : "Civilian")
              );
            }

            const gadgetsHtml = gadgets.length
              ? '<span class="stat-player__gadgets">' +
                gadgets.map(esc).join(" · ") +
                "</span>"
              : "";

            return (
              '<div class="stat-player">' +
                '<span class="stat-player__name">' +
                  esc(p.name) + excluded +
                "</span>" +
                '<span class="stat-player__role">' +
                  roleText +
                "</span>" +
                gadgetsHtml +
                '<span class="stat-player__delta ' + deltaClass + '">' +
                  deltaText +
                "</span>" +
              "</div>"
            );
          })
          .join("") +
      "</div>" +
    "</div>";

  // --- Перехват локации (все попытки) ---
  let interceptHtml = "";

  const attempts = Array.isArray(entry.intercepts)
    ? entry.intercepts
    : [];

  if (attempts.length) {
    const rows = attempts
      .map(
        (r) =>
          '<div class="round-detail__line">' +
            '<strong>' + esc(r.player || "—") + "</strong>" +
            " → " + esc(r.location || "—") +
            " — " +
            (r.success
              ? '<strong class="round-detail__ok">✅ верно</strong>'
              : '<strong class="round-detail__bad">❌ мимо</strong>') +
            (r.reward
              ? " <span class=\"round-detail__ok\">+" +
                esc(String(r.reward)) + " 🪙</span>"
              : "") +
            (r.priorFailures
              ? ' <span class="round-detail__label">(до: ' +
                esc(String(r.priorFailures)) + ")</span>"
              : "") +
          "</div>"
      )
      .join("");

    interceptHtml =
      '<div class="round-detail__section">' +
        '<h4 class="round-detail__section-title">Перехват локации</h4>' +
        rows +
      "</div>";
  } else if (entry.intercept && entry.intercept.attempted) {
    // Фолбэк для старых записей.
    interceptHtml =
      '<div class="round-detail__section">' +
        '<h4 class="round-detail__section-title">Перехват локации</h4>' +
        '<div class="round-detail__line">' +
          '<span class="round-detail__label">Выбрана:</span> ' +
          esc(entry.intercept.guessedLocation || "—") +
        "</div>" +
        '<div class="round-detail__line">' +
          '<span class="round-detail__label">Результат:</span> ' +
          (entry.intercept.correct
            ? '<strong class="round-detail__ok">✅ верно</strong>'
            : '<strong class="round-detail__bad">❌ мимо</strong>') +
        "</div>" +
      "</div>";
  }

  return header + timelineHtml + votingHtml + playersHtml + interceptHtml;
}

/* ---------- Открыть модалку деталей раунда ---------- */
export function openRoundDetailModal(roundId) {
  const modal = document.getElementById("round-detail-modal");
  const body = document.getElementById("round-detail-body");

  if (!modal || !body) return;

  const entry = state.roundHistory.find((r) => r.id === roundId);

  body.innerHTML = renderRoundDetailBody(entry);

  openDialog(modal);
}

/* ---------- Очистка истории + перерисовка ---------- */
export function clearRoundHistoryAndRender() {
  clearRoundHistoryStorage();
  renderStatisticsModal();
}
