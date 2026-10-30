// Регрессии: залипшее голосование, закрытие окна перехвата, раздача на 360×640.
// Запуск: node tests/fixes.cjs (нужен сервер: python3 -m http.server 8765)
const H = require("./helpers.cjs");

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log("  PASS", name);
  else {
    failed++;
    console.log("  FAIL", name, extra === undefined ? "" : JSON.stringify(extra));
  }
}

const click = (page, sel) => page.$eval(sel, (e) => e.click());
const NAMES8 = ["Аня", "Боря", "Вика", "Гена", "Даша", "Егор", "Женя", "Зоя"];

async function setup(names, spies, viewport, deal = true) {
  const t = await H.launch(viewport ? { viewport } : {});
  await H.open(t.page);
  await t.page.evaluate((s) => {
    localStorage.setItem("spyfall_settings", JSON.stringify({ spiesSetting: s, durationMinutes: 10 }));
  }, spies);
  await t.page.reload();
  await t.page.waitForSelector("#settings-screen.is-active");
  await H.addPlayers(t.page, names);
  await H.startMission(t.page);
  if (deal) {
    await H.dealAll(t.page);
    await H.stateOf(t.page, "(state.activeEvent = null)");
    await t.page.click("#start-timer");
    await t.page.waitForSelector("#game-screen.is-active");
  }
  t.roles = await H.stateOf(t.page, "state.assignments.map(a=>({p:a.player,r:a.roleType,c:a.accessCode}))");
  t.spy = t.roles.filter((x) => x.r === "spy");
  t.civ = t.roles.filter((x) => x.r === "civilian");
  return t;
}

async function failIntercept(page, code) {
  await click(page, "#open-intercept-window");
  await H.typeCode(page, code);
  await page.waitForSelector("#intercept-window-modal[open]");
  const real = await H.stateOf(page, "state.currentRoundLocation");
  const wrong = await page.$$eval("[data-intercept-location]", (btns, r) =>
    btns.map((b) => b.dataset.interceptLocation).find((n) => n !== r), real);
  await click(page, `[data-intercept-location="${wrong}"]`);
  await click(page, "[data-intercept-confirm]");
  await page.waitForTimeout(300);
}

(async () => {
  console.log("1. Голосование не залипает после провала перехвата подозреваемым");
  {
    let t = null;
    for (let i = 0; i < 30; i++) {
      t = await setup(NAMES8, "2");
      if (t.spy.length >= 2) break;
      await t.browser.close();
      t = null;
    }
    check("получили раунд с 2+ шпионами", !!t);
    if (t) {
      const { page } = t;
      const suspect = t.spy[0];
      const init = t.civ[0].p;
      await click(page, `[data-suspect="${suspect.p}"]`);
      await click(page, `[data-initiator="${init}"]`);
      for (const c of t.civ.slice(0, 5)) await click(page, `[data-voter="${c.p}"]`);
      check("панель голосования открыта", await page.$eval("#voter-panel", (e) => !e.hidden));

      await failIntercept(page, suspect.c);

      check("подозреваемый выбыл", await H.stateOf(page, `state.assignments.find(a=>a.player==="${suspect.p}").excluded`));
      check("голосование сброшено", (await H.stateOf(page, "state.voting.suspect")) === null);
      check("панель голосования закрыта", await page.$eval("#voter-panel", (e) => e.hidden));
      await click(page, "#submit-vote");
      await page.waitForTimeout(200);
      check("поимка выбывшего не засчитана", (await H.stateOf(page, "state.partialCatches.length")) === 0);
      check("раунд продолжается", !(await H.stateOf(page, "state.gameEnded")));
      await t.browser.close();
    }
  }

  console.log("2. Голосование выбывшего напрямую (подстраховка submitVote)");
  {
    let t = null;
    for (let i = 0; i < 30; i++) {
      t = await setup(NAMES8, "2");
      if (t.spy.length >= 2) break;
      await t.browser.close();
      t = null;
    }
    if (t) {
      const { page } = t;
      const suspect = t.spy[0];
      await click(page, `[data-suspect="${suspect.p}"]`);
      await click(page, `[data-initiator="${t.civ[0].p}"]`);
      for (const c of t.civ.slice(0, 5)) await click(page, `[data-voter="${c.p}"]`);
      await H.stateOf(page, `(state.assignments.find(a=>a.player==="${suspect.p}").excluded = true)`);
      await click(page, "#submit-vote");
      await page.waitForTimeout(200);
      check("partialCatches пуст", (await H.stateOf(page, "state.partialCatches.length")) === 0);
      check("голосование сброшено", (await H.stateOf(page, "state.voting.suspect")) === null);
      await t.browser.close();
    }
  }

  console.log("3. Закрытие окна перехвата не даёт новых 15 секунд");
  {
    const t = await setup(["Аня", "Боря", "Вика", "Гена", "Даша"], "1");
    const { page } = t;
    const spy = t.spy[0];
    await click(page, "#open-intercept-window");
    await H.typeCode(page, spy.c);
    await page.waitForSelector("#intercept-window-modal[open]");
    // имитация системной кнопки «Назад»: закрытие без Escape и без подтверждения
    await page.evaluate(() => document.querySelector("#intercept-window-modal").close());
    await page.waitForTimeout(300);
    check("попытка списана", await H.stateOf(page, `state.interceptAttempts.has("${spy.p}")`));
    check("шпион выбыл", await H.stateOf(page, `state.assignments.find(a=>a.player==="${spy.p}").excluded`));
    check("причина — timeout", (await H.stateOf(page, "state.interceptResults[0]?.reason")) === "timeout");
    await t.browser.close();
  }

  console.log("4. Раздача на 360×640");
  {
    const t = await setup(["Аня", "Боря", "Вика", "Гена", "Даша"], "1", { width: 360, height: 640 }, false);
    const { page } = t;
    await click(page, "#reveal-role");
    await page.waitForSelector("#role-card:not(.is-hidden)");
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const vh = window.innerHeight;
      const rect = (s) => document.querySelector(s)?.getBoundingClientRect();
      const turn = document.querySelector(".player-turn-card");
      return {
        vh,
        turnHidden: getComputedStyle(turn).display === "none",
        title: rect("#role-card-title"),
        code: rect(".role-card__code-value"),
        hide: rect("#hide-role"),
        scrollY: window.scrollY
      };
    });
    await page.screenshot({ path: "/tmp/whospy-deal-360x640.png" });
    check("карточка получателя скрыта", r.turnHidden);
    check("роль видна без прокрутки", r.title && r.title.top >= 0 && r.title.bottom <= r.vh, r);
    check("код виден без прокрутки", r.code && r.code.bottom <= r.vh, r);
    check("«Скрыть карту» внутри экрана", r.hide && r.hide.bottom <= r.vh && r.hide.top >= 0, r);
    await page.click("#hide-role");
    await page.waitForTimeout(200);
    check("после скрытия снова виден «Показать роль»", await page.isVisible("#reveal-role"));
    await t.browser.close();
  }

  console.log("5. Фальшивое удостоверение: окно перехвата открывается само на 10 секунд");
  {
    async function voteOutSpy(t, withFake) {
      const { page } = t;
      const suspect = t.spy[0];
      if (withFake) {
        await H.stateOf(page, `(state.activeGadgets["${suspect.p}"] = { ...(state.activeGadgets["${suspect.p}"]||{}), fakeId: true })`);
      }
      await click(page, `[data-suspect="${suspect.p}"]`);
      await click(page, `[data-initiator="${t.civ[0].p}"]`);
      for (const c of t.civ.slice(0, 5)) await click(page, `[data-voter="${c.p}"]`);
      await click(page, "#submit-vote");
      await page.waitForTimeout(250);
      return suspect;
    }
    async function pick(page, correct) {
      const real = await H.stateOf(page, "state.currentRoundLocation");
      const name = correct
        ? real
        : await page.$$eval("[data-intercept-location]", (b, r) => b.map((x) => x.dataset.interceptLocation).find((n) => n !== r), real);
      await click(page, `[data-intercept-location="${name}"]`);
      await click(page, "[data-intercept-confirm]");
      await page.waitForTimeout(300);
    }
    async function twoSpies() {
      for (let i = 0; i < 30; i++) {
        const t = await setup(NAMES8, "2");
        if (t.spy.length >= 2) return t;
        await t.browser.close();
      }
      return null;
    }

    // а) ошибся
    let t = await twoSpies();
    check("раунд с 2+ шпионами", !!t);
    if (t) {
      const { page } = t;
      const before = await H.stateOf(page, "state.timerRemainingSeconds");
      const suspect = await voteOutSpy(t, true);
      check("окно открылось само", !!(await page.$("#intercept-window-modal[open]")));
      check("заголовок для шпиона", /Шпион, выбирайте/.test(await page.textContent(".intercept-window-modal__title")));
      check("отсчёт 10 секунд", Number(await page.textContent("[data-intercept-countdown-value]")) <= 10);
      check("общий таймер на паузе", await H.stateOf(page, "state.timerPaused"));
      check("шпион ещё в игре", !(await H.stateOf(page, `state.assignments.find(a=>a.player==="${suspect.p}").excluded`)));
      await pick(page, false);
      check("ошибка: шпион выбыл", await H.stateOf(page, `state.assignments.find(a=>a.player==="${suspect.p}").excluded`));
      check("таймер снова идёт", !(await H.stateOf(page, "state.timerPaused")));
      check("игра продолжается", !(await H.stateOf(page, "state.gameEnded")));
      await t.browser.close();
    }

    // б) угадал
    t = await twoSpies();
    if (t) {
      const { page } = t;
      await voteOutSpy(t, true);
      await pick(page, true);
      check("угадал: победа шпионов", (await H.stateOf(page, "state.gameOutcome")) === "spy-location-success");
      await t.browser.close();
    }

    // в) не успел за 10 секунд
    t = await twoSpies();
    if (t) {
      const { page } = t;
      const suspect = await voteOutSpy(t, true);
      await page.waitForTimeout(10600);
      check("не успел: окно закрыто", !(await page.$("#intercept-window-modal[open]")));
      check("не успел: шпион выбыл", await H.stateOf(page, `state.assignments.find(a=>a.player==="${suspect.p}").excluded`));
      check("не успел: таймер идёт", !(await H.stateOf(page, "state.timerPaused")));
      await t.browser.close();
    }
  }

  console.log("6. Обычный перехват ставит общий таймер на паузу");
  {
    const t = await setup(["Аня", "Боря", "Вика", "Гена", "Даша"], "1");
    const { page } = t;
    await click(page, "#open-intercept-window");
    await H.typeCode(page, t.spy[0].c);
    await page.waitForSelector("#intercept-window-modal[open]");
    check("в окне таймер на паузе", await H.stateOf(page, "state.timerPaused"));
    const a = await H.stateOf(page, "state.timerRemainingSeconds");
    await page.waitForTimeout(2200);
    const b = await H.stateOf(page, "state.timerRemainingSeconds");
    check("время не идёт", a === b, [a, b]);
    check("отсчёт окна 15", /15/.test(await page.textContent(".intercept-window__countdown-copy strong")));
    await t.browser.close();
  }

  console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
