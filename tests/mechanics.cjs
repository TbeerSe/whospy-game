// Новые механики: мягкая ротация шпионов и 15 секунд на перехват.
const H = require("./helpers.cjs");

let failed = 0;
function check(name, condition, details) {
  if (condition) console.log("  PASS", name);
  else {
    failed += 1;
    console.log("  FAIL", name, details === undefined ? "" : JSON.stringify(details));
  }
}

(async () => {
  const { browser, page, errors } = await H.launch({
    viewport: { width: 390, height: 844 }
  });
  await H.open(page);

  console.log("1. Ротация шпионов");
  const rotation = await page.evaluate(async () => {
    const A = await import("/src/features/assignments.js");
    const U = await import("/src/core/utils.js");
    const S = await import("/src/core/state.js");
    const ST = await import("/src/core/storage.js");
    const { state } = S;

    const weights = [0, 1, 2, 4, 8].map((streak) =>
      A.getSpySelectionWeight("Игрок", { Игрок: streak })
    );

    const people = ["Аня", "Боря", "Вика", "Гена", "Даша"].map((player) => ({
      player,
      roleType: "civilian"
    }));
    const streaks = { Аня: 4 };
    const wins = Object.fromEntries(people.map((p) => [p.player, 0]));

    for (let i = 0; i < 12000; i += 1) {
      const random = U.createRandomGenerator(i * 7919 + 17);
      const [picked] = A.selectWeightedSpyIndexes(people, 1, random, streaks);
      wins[people[picked].player] += 1;
    }

    state.players = ["Аня", "Боря"];
    state.spyStreaks = {};
    const spyA = [{ player: "Аня", roleType: "spy" }, { player: "Боря", roleType: "civilian" }];
    const spyB = [{ player: "Аня", roleType: "civilian" }, { player: "Боря", roleType: "spy" }];
    ST.updateSpyStreaks(spyA);
    ST.updateSpyStreaks(spyA);
    const afterTwo = { ...state.spyStreaks };
    ST.updateSpyStreaks(spyB);
    const afterSwitch = { ...state.spyStreaks };

    return {
      weights,
      wins,
      afterTwo,
      afterSwitch,
      saved: JSON.parse(localStorage.getItem("spyfall_spy_streaks"))
    };
  });

  check(
    "вес серии: 100% → 75% → 50% → минимум 10%",
    JSON.stringify(rotation.weights) === JSON.stringify([1, 0.75, 0.5, 0.1, 0.1]),
    rotation.weights
  );
  check(
    "игрок с длинной серией выпадает реже остальных",
    ["Боря", "Вика", "Гена", "Даша"].every((p) => rotation.wins.Аня < rotation.wins[p]),
    rotation.wins
  );
  check(
    "две роли шпиона подряд дают серию 2",
    rotation.afterTwo.Аня === 2,
    rotation.afterTwo
  );
  check(
    "смена шпиона сбрасывает прошлую серию и сохраняется",
    !rotation.afterSwitch.Аня && rotation.afterSwitch.Боря === 1 && rotation.saved.Боря === 1,
    rotation
  );

  console.log("2. Таймер окна перехвата");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector("#settings-screen.is-active");
  await H.addPlayers(page, ["Аня", "Боря", "Вика", "Гена", "Даша"]);
  await H.startMission(page);
  await H.dealAll(page);
  const spy = await H.stateOf(
    page,
    "(() => { const a = state.assignments.find(x => x.roleType === 'spy'); return { player: a.player, code: a.accessCode }; })()"
  );
  await page.click("#start-timer");
  await page.waitForSelector("#game-screen.is-active");
  await page.$eval("#open-intercept-window", (button) => button.click());
  await H.typeCode(page, spy.code);
  await page.waitForSelector("#intercept-window-modal[open]");

  const seconds = Number(await page.textContent("[data-intercept-countdown-value]"));
  check("отсчёт начинается с 15 секунд", seconds >= 13 && seconds <= 15, seconds);
  check("кнопки отмены больше нет", !(await page.$("[data-intercept-cancel]")));

  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  check("Escape не закрывает окно", !!(await page.$("#intercept-window-modal[open]")));

  const mobileLayout = await page.evaluate(() => {
    const list = document.querySelector(".intercept-window__locations");
    const confirm = document.querySelector("[data-intercept-confirm]");
    list.scrollTop = list.scrollHeight;
    const rect = confirm.getBoundingClientRect();

    return {
      scrollable: list.scrollHeight > list.clientHeight,
      scrolled: list.scrollTop > 0,
      confirmVisible: rect.top >= 0 && rect.bottom <= window.innerHeight,
      listHeight: list.clientHeight,
      scrollHeight: list.scrollHeight,
      confirmBottom: rect.bottom,
      viewportHeight: window.innerHeight
    };
  });
  check(
    "на телефоне прокручивается только список локаций",
    mobileLayout.scrollable && mobileLayout.scrolled,
    mobileLayout
  );
  check(
    "кнопка подтверждения остаётся в пределах экрана",
    mobileLayout.confirmVisible,
    mobileLayout
  );
  await page.screenshot({ path: "/tmp/whospy-intercept-countdown.png" });

  await page.waitForSelector("#game-result:not(.is-hidden)", { timeout: 20000 });
  const result = await page.evaluate(async () => {
    const { state } = await import("/src/core/state.js");
    return {
      ended: state.gameEnded,
      outcome: state.gameOutcome,
      result: state.interceptResults[0],
      excluded: state.assignments.find((a) => a.roleType === "spy").excluded,
      attempted: state.interceptAttempts.has(state.assignments.find((a) => a.roleType === "spy").player),
      modalOpen: Boolean(document.querySelector("#intercept-window-modal[open]"))
    };
  });

  check("истечение 15 секунд завершает перехват провалом", result.ended && result.outcome === "all-spies-failed", result);
  check("причина провала — timeout", result.result?.reason === "timeout", result.result);
  check("шпион выбывает и попытка расходуется", result.excluded && result.attempted, result);
  check("окно перехвата закрыто", !result.modalOpen, result);
  check("ошибок страницы нет", errors.length === 0, errors);

  console.log("3. Общий таймер стоит, пока открыто окно перехвата");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector("#settings-screen.is-active");
  await H.addPlayers(page, ["Аня", "Боря", "Вика", "Гена", "Даша"]);
  await H.startMission(page);
  await H.dealAll(page);
  const lastSecondSpy = await H.stateOf(
    page,
    "(() => { const a = state.assignments.find(x => x.roleType === 'spy'); return { player: a.player, code: a.accessCode }; })()"
  );
  await page.click("#start-timer");
  await page.waitForSelector("#game-screen.is-active");

  // До конца раунда остаётся ~1,5 с: без паузы таймер истёк бы в окне.
  await page.evaluate(async () => {
    const { state } = await import("/src/core/state.js");
    state.timerDeadline = Date.now() + 1500;
    state.timerRemainingSeconds = 2;
  });
  await page.$eval("#open-intercept-window", (button) => button.click());
  await H.typeCode(page, lastSecondSpy.code);
  await page.waitForSelector("#intercept-window-modal[open]");
  await page.waitForTimeout(2500);

  const during = await page.evaluate(async () => {
    const { state } = await import("/src/core/state.js");
    return {
      ended: state.gameEnded,
      paused: state.timerPaused,
      modalOpen: Boolean(document.querySelector("#intercept-window-modal[open]"))
    };
  });
  check("общий таймер не завершил раунд в окне", !during.ended && during.paused && during.modalOpen, during);

  const realLocation = await H.stateOf(page, "state.currentRoundLocation");
  await page.$eval(`[data-intercept-location="${realLocation}"]`, (b) => b.click());
  await page.$eval("[data-intercept-confirm]", (b) => b.click());
  await page.waitForSelector("#game-result:not(.is-hidden)", { timeout: 10000 });
  check("итог — перехват, а не время", (await H.stateOf(page, "state.gameOutcome")) === "spy-location-success");
  check("ошибок страницы нет", errors.length === 0, errors);

  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
