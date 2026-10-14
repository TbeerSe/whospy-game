// Быстрые проверки экономики без браузера (Node 22+).
// Запуск: node tests/economy.unit.mjs
// localStorage и document заглушены: тестируется чистая логика.

globalThis.localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {}
};
globalThis.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => ({}),
  body: {}
};
globalThis.window = {
  scrollTo() {},
  addEventListener() {},
  setInterval() {},
  clearInterval() {}
};

const S = await import("../src/core/state.js");
const E = await import("../src/features/economy.js");
const { state } = S;

let failed = 0;
let checks = 0;

function check(name, condition, details = "") {
  checks += 1;
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${name} ${details}`);
  }
}

function setup(n, spies) {
  state.assignments = Array.from({ length: n }, (_, i) => ({
    player: "p" + i,
    roleType: i < spies ? "spy" : "civilian",
    excluded: false,
    accessCode: String(1000 + i)
  }));
  state.balances = {};
  state.assignments.forEach((a) => (state.balances[a.player] = 0));
  state.activeGadgets = {};
  state.wrongVotes = {};
  state.partialCatches = [];
  state.activeEvent = null;
}

const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const maxSpies = (n) => Math.max(1, Math.ceil(n / 2) - 1);
const outcomes = [
  "voting",
  "all-spies-failed",
  "timeout",
  "shutdown",
  "spy-location-success"
];

/* 1. Инвариант: Σ дельт = N × бонус − burned (страховка, должники,
      клэмп MIN_BALANCE и неверные голоса монет не создают). */
let cases = 0;
for (const n of [4, 5, 6, 8, 12]) {
  for (let sp = 1; sp <= maxSpies(n); sp += 1) {
    for (const oc of outcomes) {
      for (const ev of [null, "crisis", "hunt"]) {
        for (const scenario of ["plain", "insured", "debtors", "floor"]) {
          setup(n, sp);
          state.activeEvent = ev;
          state.wrongVotes = { ["p" + sp]: 2 };

          if (scenario === "insured") {
            state.assignments.forEach((a) => {
              if (a.roleType === "civilian") {
                state.activeGadgets[a.player] = { insurance: true };
              }
            });
            // Один мирный без страховки, чтобы банк не был пустым.
            delete state.activeGadgets["p" + sp];
          }

          if (scenario === "debtors") {
            state.assignments.forEach((a, i) => {
              if (i % 2 === 0) state.balances[a.player] = -80;
            });
          }

          if (scenario === "floor") {
            state.assignments.forEach((a, i) => {
              state.balances[a.player] = i % 2 ? S.MIN_BALANCE : 5;
            });
          }

          const r = E.computeSettlement({
            outcome: oc,
            initiator: "p" + sp,
            interceptor: "p0",
            poolSize: 12
          });

          const expected = n * S.PARTICIPATION_BONUS - r.burned;
          check(
            `zero-sum n=${n} sp=${sp} ${oc} ${ev} ${scenario}`,
            sum(r.deltas) === expected,
            `sum=${sum(r.deltas)} expected=${expected}`
          );
          check(
            `pot<=nominal ${oc} ${scenario}`,
            r.pot <= r.nominalPot
          );

          // Никто не уходит ниже MIN_BALANCE.
          state.assignments.forEach((a) => {
            const after = (state.balances[a.player] || 0) + r.deltas[a.player];
            check(
              `floor ${a.player} ${scenario}`,
              after >= S.MIN_BALANCE,
              `after=${after}`
            );
          });
          cases += 1;
        }
      }
    }
  }
}

/* 2. Страховка: застрахованный не платит, победители получают меньше. */
setup(5, 1);
const base = E.computeSettlement({ outcome: "timeout", poolSize: 24 });
setup(5, 1);
state.activeGadgets = { p2: { insurance: true } };
const ins = E.computeSettlement({ outcome: "timeout", poolSize: 24 });
check("insured pays nothing", ins.deltas.p2 === S.PARTICIPATION_BONUS);
check("insured listed", ins.insured.includes("p2"));
check("insurance shrinks winner take", ins.pot < base.pot);

/* 3. Нижняя граница: проигравший на MIN_BALANCE платит только бонусом. */
setup(5, 1);
state.balances.p1 = S.MIN_BALANCE;
const floor = E.computeSettlement({ outcome: "timeout", poolSize: 24 });
check(
  "floor loser pays at most bonus",
  floor.deltas.p1 >= 0,
  `delta=${floor.deltas.p1}`
);

/* 4. Налог должника уходит в burned. */
setup(5, 1);
state.balances.p1 = -50;
const debt = E.computeSettlement({
  outcome: "voting",
  initiator: "p1",
  poolSize: 24
});
check("debtor tax burned", debt.burned > 0, `burned=${debt.burned}`);

/* 5. Двойной расчёт невозможен. */
setup(5, 1);
state.roundSettled = false;
state.lastBalanceChanges = {};
E.settleRound({ outcome: "timeout", poolSize: 24 });
const snap = JSON.stringify(state.balances);
E.settleRound({ outcome: "timeout", poolSize: 24 });
check("double settle is a no-op", JSON.stringify(state.balances) === snap);

/* 6. Кэп таймера задан и разумен. */
check(
  "timer cap is 120s",
  S.TIMER_MODIFIER_CAP_SECONDS === 120
);

/* 7. Блокировка кода: 5 попыток и 15 секунд. */
check("code lock 15s", S.ACCESS_CODE_LOCK_SECONDS === 15);
check("code attempts 5", S.ACCESS_CODE_MAX_FAILURES === 5);

console.log(`economy unit: ${checks} checks, ${cases} scenarios, ${failed} failed`);
process.exit(failed ? 1 : 0);
