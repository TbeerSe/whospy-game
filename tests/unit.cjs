// Проверки экономики и распределений на РЕАЛЬНОМ коде игры.
// Запуск: node tests/unit.cjs (нужен статический сервер на :8765)
const H = require("./helpers.cjs");

(async () => {
  const { browser, page, errors } = await H.launch();
  await H.open(page);
  const res = await page.evaluate(async () => {
    const S = await import("/src/core/state.js");
    const E = await import("/src/features/economy.js");
    const D = await import("/src/features/dealing.js");
    const G = await import("/src/features/gadgets.js");
    const A = await import("/src/features/assignments.js");
    const AC = await import("/src/features/accessCode.js");
    const U = await import("/src/core/utils.js");
    const { state } = S;
    const out = {};

    const mk = (n, spies) => {
      state.assignments = Array.from({ length: n }, (_, i) => ({
        player: "p" + i, roleType: i < spies ? "spy" : "civilian",
        excluded: false, accessCode: String(1000 + i)
      }));
      state.balances = {};
      state.assignments.forEach((a) => (state.balances[a.player] = 0));
      state.activeGadgets = {};
      state.wrongVotes = {};
      state.partialCatches = [];
      state.activeEvent = null;
    };
    const maxSpies = (n) => Math.max(1, Math.ceil(n / 2) - 1);

    // 1. Нулевая сумма: Σ дельт = N × бонус при любом исходе, событии и неверных голосах
    const outcomes = ["voting", "all-spies-failed", "timeout", "shutdown", "spy-location-success"];
    let worst = 0, cases = 0;
    for (const n of [4, 5, 6, 8, 10, 12, 20]) {
      for (let sp = 1; sp <= maxSpies(n); sp++) {
        for (const oc of outcomes) {
          for (const ev of [null, "crisis", "hunt"]) {
            for (const wrong of [0, 3]) {
              mk(n, sp);
              state.activeEvent = ev;
              if (wrong) state.wrongVotes = { ["p" + sp]: wrong, ["p" + (sp + 1)]: 1 };
              state.assignments[sp].excluded = wrong > 0; // исключённый мирный
              if (sp > 1) state.assignments[1].excluded = true; // выгнанный шпион
              state.partialCatches = sp > 1 ? [{ suspect: "p1", initiator: "p" + sp }] : [];
              const r = E.computeSettlement({ outcome: oc, initiator: "p" + sp, interceptor: "p0", poolSize: 12 });
              const sum = Object.values(r.deltas).reduce((a, b) => a + b, 0);
              worst = Math.max(worst, Math.abs(sum - n * S.PARTICIPATION_BONUS));
              cases++;
            }
          }
        }
      }
    }
    out.zeroSum = { cases, worstDeviationFromBonusSum: worst };

    // 2. Среднее ожидание по ролям при разной силе шпионов (без событий и гаджетов)
    const ev = {};
    for (const n of [5, 6, 8, 10]) {
      const sp = Math.max(1, Math.floor(n / 4));
      for (const pSpy of [0.3, 0.5, 0.7]) {
        mk(n, sp);
        const win = E.computeSettlement({ outcome: "timeout", poolSize: 24 }).deltas;
        const lose = E.computeSettlement({ outcome: "voting", initiator: "p" + sp, poolSize: 24 }).deltas;
        const spyEV = pSpy * win.p0 + (1 - pSpy) * lose.p0;
        const civEV = pSpy * win["p" + sp] + (1 - pSpy) * lose["p" + (sp + 1)];
        const roleAvg = (sp * spyEV + (n - sp) * civEV) / n;
        ev[`n=${n} spies=${sp} spyWin=${pSpy}`] = {
          spyEV: +spyEV.toFixed(1), civEV: +civEV.toFixed(1), perRoundDrift: +roleAvg.toFixed(2)
        };
      }
    }
    out.roleEV = ev;

    // 3. Радар
    const radar = {};
    let radarOk = true;
    for (let total = S.MIN_LOCATIONS; total <= 40; total++) {
      const l1 = D.getRadarCandidateCount(total, 1), l2 = D.getRadarCandidateCount(total, 2);
      if (!(l2 < l1) || l1 >= total || l2 < 2) radarOk = false;
      if ([3, 4, 5, 6, 8, 12, 24].includes(total)) radar[total] = [l1, l2];
    }
    out.radar = { ok: radarOk, table: radar };

    // 4. Шум таймера — равномерность по сидам
    const hist = {};
    for (let i = 0; i < 20000; i++) {
      state.entropySeed = (Math.imul(i + 1, 2654435761) ^ (i << 7)) >>> 0;
      const v = G.rollTimerNoise();
      hist[v] = (hist[v] || 0) + 1;
    }
    out.timerNoise = hist;

    // 5. Активация Верификаторов: доля у владельцев
    const act = {};
    for (const holders of [1, 2, 3, 5]) {
      let total = 0, got = 0;
      for (let i = 0; i < 4000; i++) {
        mk(6, 1);
        state.entropySeed = (Math.imul(i + 7, 2246822519) ^ i) >>> 0;
        state.gadgets = {};
        state.assignments.forEach((a, idx) => {
          state.gadgets[a.player] = { verificatorCivilian: a.roleType === "civilian" && idx - 1 < holders ? 1 : 0, verificatorSpy: 0 };
        });
        G.rollVerificators();
        total += holders;
        got += Object.keys(state.verificatorActive).length;
      }
      act[holders] = +(got / total).toFixed(3);
    }
    out.verificatorActivationShare = act;

    // 6. Коды доступа
    const codes = AC.generateAccessCodes(100);
    out.codes = { unique: new Set(codes).size === 100, allFourDigits: codes.every((c) => /^\d{4}$/.test(c)) };

    // 7. Число шпионов
    const spyDist = {};
    for (const n of [4, 5, 6, 8, 12]) {
      for (const setting of ["1", "p25", "p50", "p100"]) {
        const h = {};
        for (let i = 0; i < 3000; i++) {
          const c = A.getSpiesCount(n, setting, U.createRandomGenerator(i * 7919 + 1));
          h[c] = (h[c] || 0) + 1;
        }
        spyDist[`n=${n} ${setting}`] = h;
      }
    }
    out.spyCounts = spyDist;

    // 8. Множитель перехвата
    out.interceptMult = Object.fromEntries([3, 5, 6, 8, 12, 24].map((k) => [k, E.getInterceptMultiplier(k)]));

    // 9. Должник и страховка
    mk(5, 1);
    state.balances.p1 = -50;
    const d1 = E.computeSettlement({ outcome: "voting", initiator: "p1", poolSize: 24 }).deltas;
    mk(5, 1);
    state.activeGadgets = { p2: { insurance: true } };
    const d2 = E.computeSettlement({ outcome: "timeout", poolSize: 24 });
    mk(5, 1);
    const d0 = E.computeSettlement({ outcome: "voting", initiator: "p1", poolSize: 24 }).deltas;
    out.debtor = { normalInitiator: d0.p1, debtorInitiator: d1.p1 };
    out.insurance = { insuredPlayerDelta: d2.deltas.p2, insured: d2.insured };

    // 10. Двойной расчёт невозможен
    mk(5, 1);
    state.roundSettled = false;
    E.settleRound({ outcome: "timeout", poolSize: 24 });
    const snap = JSON.stringify(state.balances);
    E.settleRound({ outcome: "timeout", poolSize: 24 });
    out.doubleSettle = JSON.stringify(state.balances) === snap;

    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  console.log("errors:", errors);
  await browser.close();
})();
