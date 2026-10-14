// Сквозные сценарии через реальный UI. Запуск: node tests/e2e.cjs
// Нужен статический сервер: python3 -m http.server 8765
const H = require("./helpers.cjs");

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log("  PASS", name);
  else {
    failed++;
    console.log("  FAIL", name, extra === undefined ? "" : JSON.stringify(extra));
  }
}

const P5 = ["Аня", "Боря", "Вика", "Гена", "Даша"];
const click = (page, sel) => page.$eval(sel, (e) => e.click());

async function setup(names = P5, spies = "1", opts = {}) {
  const t = await H.launch();
  await H.open(t.page);
  await t.page.evaluate((s) => {
    localStorage.setItem("spyfall_settings", JSON.stringify({ spiesSetting: s, durationMinutes: 10 }));
  }, spies);
  await t.page.reload();
  await t.page.waitForSelector("#settings-screen.is-active");
  await H.addPlayers(t.page, names);
  if (opts.beforeStart) await opts.beforeStart(t.page);
  await H.startMission(t.page);
  t.info = await H.dealAll(t.page);
  // События (Кризис / Охота) меняют суммы — их проверяет tests/unit.cjs.
  await H.stateOf(t.page, "(state.activeEvent = null)");
  t.roles = await H.stateOf(t.page, "state.assignments.map(a=>({p:a.player,r:a.roleType,c:a.accessCode}))");
  t.spy = t.roles.filter((x) => x.r === "spy");
  t.civ = t.roles.filter((x) => x.r === "civilian");
  return t;
}
async function startTimer(t) {
  await t.page.click("#start-timer");
  await t.page.waitForSelector("#game-screen.is-active");
}
async function balances(page) {
  return H.stateOf(page, "JSON.parse(JSON.stringify(state.balances))");
}
async function openIntercept(page) {
  await click(page, "#open-intercept-window");
}
async function status(page) {
  return (await page.textContent("#access-status")).trim();
}

(async () => {
  /* ---------- 1. Коды на карте совпадают, перехват: ошибки одинаковы ---------- */
  console.log("1. Код-доступ");
  {
    const t = await setup();
    check("код на карте = код в state", t.roles.every((r) => t.info[r.p].code === r.c));
    check("коды уникальны", new Set(t.roles.map((r) => r.c)).size === 5);
    await startTimer(t);
    const { page } = t;
    await openIntercept(page);
    const civCode = t.civ[0].c;
    let bogus = "0000";
    while (t.roles.some((r) => r.c === bogus)) bogus = String(Number(bogus) + 1).padStart(4, "0");
    await H.typeCode(page, civCode);
    await page.waitForTimeout(150);
    const m1 = await status(page);
    await H.typeCode(page, bogus);
    await page.waitForTimeout(150);
    const m2 = await status(page);
    check("код мирного и несуществующий дают одно сообщение", m1 === m2 && m1.length > 0, [m1, m2]);
    for (let i = 0; i < 3; i += 1) {
      await H.typeCode(page, bogus);
      await page.waitForTimeout(150);
    }
    const m3 = await status(page);
    check("после 5 ошибок — блокировка", /Подождите/.test(m3), m3);
    // Даже верный код сейчас не пускает
    // Клавиатура заблокирована: клик не пройдёт (таймаут короткий,
    // иначе 15-секундная блокировка успеет истечь).
    await page
      .click('#access-code-modal [data-access-key="1"]', { timeout: 1500 })
      .catch(() => {});
    check("модалка выбора локации не открылась", !(await page.$("#intercept-window-modal[open]")));
    check("ошибок страницы нет", t.errors.length === 0, t.errors);
    await t.browser.close();
  }

  /* ---------- 2. Провал перехвата единственного шпиона ---------- */
  console.log("2. Перехват: провал единственного шпиона");
  {
    const t = await setup();
    await startTimer(t);
    const { page } = t;
    const before = await balances(page);
    await openIntercept(page);
    await H.typeCode(page, t.spy[0].c);
    await page.waitForSelector("#intercept-window-modal[open]");
    const cur = await H.stateOf(page, "state.currentRoundLocation");
    const wrong = await page.$$eval("[data-intercept-location]", (els, c) => els.map((e) => e.dataset.interceptLocation).find((n) => n !== c), cur);
    await page.click(`[data-intercept-location="${wrong}"]`);
    await page.click("[data-intercept-confirm]");
    await page.waitForTimeout(400);
    const after = await balances(page);
    const delta = Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - before[k]]));
    check("победа мирных, раунд окончен", await H.stateOf(page, "state.gameEnded && state.gameOutcome") === "all-spies-failed");
    check("шпион платит банк 120 − 15 бонус", delta[t.spy[0].p] === -105, delta);
    check("мирные получают 30+15", t.civ.every((c) => delta[c.p] === 45), delta);
    check("сумма изменений = бонус участия 75", Object.values(delta).reduce((a, b) => a + b, 0) === 75);
    check("снимок раунда удалён", await page.evaluate(() => localStorage.getItem("spyfall_active_round") === null));
    check("ошибок страницы нет", t.errors.length === 0, t.errors);
    await page.screenshot({ path: "/tmp/e2e_result.png" });
    await t.browser.close();
  }

  /* ---------- 3. Успешный перехват ---------- */
  console.log("3. Перехват: успех");
  {
    const t = await setup();
    await startTimer(t);
    const { page } = t;
    const before = await balances(page);
    await openIntercept(page);
    await H.typeCode(page, t.spy[0].c);
    await page.waitForSelector("#intercept-window-modal[open]");
    const cur = await H.stateOf(page, "state.currentRoundLocation");
    await page.click(`[data-intercept-location="${cur}"]`);
    await page.click("[data-intercept-confirm]");
    await page.waitForTimeout(400);
    const after = await balances(page);
    const delta = Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - before[k]]));
    check("исход: spy-location-success", (await H.stateOf(page, "state.gameOutcome")) === "spy-location-success");
    check("банк ×2 (24 локации): 240", (await H.stateOf(page, "state.lastPot")) === 240);
    check("шпион +255", delta[t.spy[0].p] === 255, delta);
    check("мирные −60+15", t.civ.every((c) => delta[c.p] === -45), delta);
    await t.browser.close();
  }

  /* ---------- 4. Голосование: победа мирных, инициатор ×2 ---------- */
  console.log("4. Голосование");
  {
    const t = await setup();
    await startTimer(t);
    const { page } = t;
    const before = await balances(page);
    const init = t.civ[0].p;
    const voters = t.civ.slice(0, 3).map((c) => c.p);
    await click(page, `[data-suspect="${t.spy[0].p}"]`);
    await click(page, `[data-initiator="${init}"]`);
    for (const v of voters) await click(page, `[data-voter="${v}"]`);
    await click(page, "#submit-vote");
    await page.waitForTimeout(400);
    const after = await balances(page);
    const delta = Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - before[k]]));
    check("исход voting", (await H.stateOf(page, "state.gameOutcome")) === "voting");
    check("инициатор 48+15", delta[init] === 63, delta);
    check("остальные мирные 24+15", t.civ.filter((c) => c.p !== init).every((c) => delta[c.p] === 39), delta);
    check("шпион −120+15", delta[t.spy[0].p] === -105, delta);
    check("нулевая сумма кроме бонуса", Object.values(delta).reduce((a, b) => a + b, 0) === 75);
    await t.browser.close();
  }

  /* ---------- 5. Мирный-подозреваемый: оба исключены, неверные голоса ---------- */
  console.log("5. Ошибочное обвинение");
  {
    const t = await setup(["Аня", "Боря", "Вика", "Гена", "Даша", "Егор", "Женя"]);
    await startTimer(t);
    const { page } = t;
    const susp = t.civ[0].p, init = t.civ[1].p;
    const voters = t.civ.filter((c) => c.p !== susp).slice(0, 4).map((c) => c.p);
    await click(page, `[data-suspect="${susp}"]`);
    await click(page, `[data-initiator="${init}"]`);
    for (const v of voters) await click(page, `[data-voter="${v}"]`);
    // подозреваемый не может голосовать за себя
    await click(page, `[data-voter="${susp}"]`);
    check("подозреваемый не в голосующих", !(await H.stateOf(page, `state.voting.voters.has(${JSON.stringify(susp)})`)));
    await click(page, "#submit-vote");
    await page.waitForTimeout(300);
    const ex = await H.stateOf(page, "state.assignments.filter(a=>a.excluded).map(a=>a.player)");
    check("исключён только подозреваемый", ex.length === 1 && ex.includes(susp), ex);
    const wv = await H.stateOf(page, "state.wrongVotes");
    check("у проголосовавших есть неверный голос", voters.every((v) => wv[v] === 1), wv);
    check("раунд продолжается", !(await H.stateOf(page, "state.gameEnded")));
    check("снимок содержит исключённого", await page.evaluate(() => JSON.parse(localStorage.getItem("spyfall_active_round")).assignments.filter((a) => a.excluded).length === 1));
    await t.browser.close();
  }

  /* ---------- 6. Отмена раунда возвращает предметы ---------- */
  console.log("6. Отмена раунда");
  {
    const give = (page) =>
      page.evaluate(async () => {
        const S = await import("/src/core/state.js");
        const G = await import("/src/features/gadgets.js");
        S.state.players.forEach((p) => {
          S.state.balances[p] = 200;
          S.state.gadgets[p].insurance = 1;
          S.state.gadgets[p].jammer = 1;
          S.state.gadgets[p].extraInterrogation = 1;
        });
        G.saveGadgets();
      });
    const t = await setup(P5, "1", { beforeStart: give });
    const { page } = t;
    const burned = await H.stateOf(page, "state.players.filter(p=>!state.gadgets[p].insurance).length");
    check("страховки мирных сгорели на старте (у шпиона заморожена)", burned === 4, burned);
    await startTimer(t);
    await click(page, "#end-game");
    await page.waitForSelector("#confirm-end-modal[open]");
    await click(page, "#confirm-end-game");
    await page.waitForSelector("#settings-screen.is-active");
    const b = await balances(page);
    check("балансы не изменились", Object.values(b).every((v) => v === 200), b);
    const back = await H.stateOf(page, "state.players.every(p=>state.gadgets[p].insurance===1 && state.gadgets[p].jammer===1 && state.gadgets[p].extraInterrogation===1)");
    check("предметы возвращены", back);
    check("снимок удалён", await page.evaluate(() => localStorage.getItem("spyfall_active_round") === null));
    // отмена на раздаче
    await H.startMission(page).catch(() => {});
    await page.click("#cancel-dealing");
    await page.waitForSelector("#settings-screen.is-active");
    const b2 = await balances(page);
    check("отмена на раздаче: баланс тот же", Object.values(b2).every((v) => v === 200), b2);
    check("отмена на раздаче: предметы целы", await H.stateOf(page, "state.players.every(p=>state.gadgets[p].insurance===1)"));
    check("ошибок страницы нет", t.errors.length === 0, t.errors);
    await t.browser.close();
  }

  /* ---------- 7. Перезагрузка: продолжить / отменить ---------- */
  console.log("7. Перезагрузка");
  {
    const t = await setup();
    const { page } = t;
    await startTimer(t);
    await page.waitForTimeout(3200);
    const codeBefore = t.spy[0].c;
    await page.reload();
    await page.waitForSelector("#resume-round-modal[open]");
    check("окно продолжения показано", true);
    const sum = await page.textContent("#resume-round-summary");
    check("в сводке есть время", /осталось/.test(sum), sum);
    await click(page, "#resume-round-continue");
    await page.waitForSelector("#game-screen.is-active");
    check("таймер на паузе", await H.stateOf(page, "state.timerPaused"));
    const rem = await H.stateOf(page, "state.timerRemainingSeconds");
    const total = await H.stateOf(page, "state.timerTotalSeconds");
    check("остаток ≈ полное время − 3 с", total - rem >= 2 && total - rem <= 8, [total, rem]);
    check("коды сохранились", (await H.stateOf(page, "state.assignments.find(a=>a.roleType==='spy').accessCode")) === codeBefore);
    check("интерфейс судейства есть", !!(await page.$("#judging-interface")));
    check("бейдж шпионов", /Шпионов: 1/.test(await page.textContent("#spy-count-badge")));
    // пауза не тикает
    await page.waitForTimeout(1500);
    check("на паузе время не идёт", (await H.stateOf(page, "state.timerRemainingSeconds")) === rem);
    await click(page, "#pause-game");
    await page.waitForTimeout(2300);
    const rem2 = await H.stateOf(page, "state.timerRemainingSeconds");
    check("после «Продолжить» время идёт", rem2 < rem, [rem, rem2]);
    // перехват работает после восстановления
    await openIntercept(page);
    await H.typeCode(page, codeBefore);
    check("код после восстановления принимается", !!(await page.waitForSelector("#intercept-window-modal[open]", { timeout: 3000 }).catch(() => null)));
    await page.click("[data-intercept-cancel]");
    // перезагрузка и отмена
    await page.reload();
    await page.waitForSelector("#resume-round-modal[open]");
    await click(page, "#resume-round-cancel");
    await page.waitForSelector("#settings-screen.is-active");
    check("после отмены снимка нет", await page.evaluate(() => localStorage.getItem("spyfall_active_round") === null));
    await page.reload();
    await page.waitForSelector("#settings-screen.is-active");
    check("после повторной загрузки окна нет", !(await page.$("#resume-round-modal[open]")));
    check("ошибок страницы нет", t.errors.length === 0, t.errors);
    await t.browser.close();
  }

  /* ---------- 8. Перезагрузка во время раздачи ---------- */
  console.log("8. Перезагрузка на раздаче");
  {
    const t = await setup();
    const { page } = t;
    // setup уже раздал все роли — для этого теста берём новый раунд
    await click(page, "#cancel-dealing");
    await page.waitForSelector("#settings-screen.is-active");
    await H.startMission(page);
    await page.click("#reveal-role");
    await page.click("#hide-role");
    await page.waitForTimeout(100);
    await page.reload();
    await page.waitForSelector("#resume-round-modal[open]");
    await click(page, "#resume-round-continue");
    await page.waitForSelector("#dealing-screen.is-active");
    check("прогресс раздачи сохранён", (await H.stateOf(page, "state.revealedCount")) === 1);
    check("код ещё не показан в DOM", (await page.textContent("#role-card-code")).trim() === "");
    await t.browser.close();
  }

  /* ---------- 9. Магазин / имена / должник ---------- */
  console.log("9. Магазин и имена");
  {
    const t = await H.launch();
    const { page } = t;
    await H.open(page);
    await H.addPlayers(page, ["__proto__", "constructor", "Аня"]);
    check("зарезервированные имена отклонены", (await H.stateOf(page, "state.players.join()")) === "Аня");
    await page.evaluate(async () => {
      const S = await import("/src/core/state.js");
      S.state.balances["Аня"] = -40;
    });
    await page.click('[data-open-shop="Аня"]');
    await page.waitForSelector("#equipment-shop-modal[open]");
    const allDisabled = await page.$$eval("[data-buy-gadget]", (b) => b.every((x) => x.disabled));
    check("должник не может покупать", allDisabled);
    const st = await page.textContent(".equipment-shop-modal__status");
    check("текст про должника без наценки", /покупки недоступны/.test(st) && !/наценка/.test(st), st);
    check("нет метки PATCH", !/PATCH/.test(await page.textContent(".equipment-shop-modal__eyebrow")));
    check("ошибок страницы нет", t.errors.length === 0, t.errors);
    await t.browser.close();
  }

  /* ---------- 10. Верификатор ---------- */
  console.log("10. Верификатор");
  {
    const give = (page) =>
      page.evaluate(async () => {
        const S = await import("/src/core/state.js");
        const G = await import("/src/features/gadgets.js");
        S.state.players.forEach((p) => (S.state.gadgets[p].verificatorCivilian = 1));
        G.saveGadgets();
      });
    const t = await setup(P5, "1", { beforeStart: give });
    const { page } = t;
    await startTimer(t);
    const owner = t.civ[0];
    await page.evaluate(async (p) => {
      const S = await import("/src/core/state.js");
      const J = await import("/src/features/judging.js");
      S.state.verificatorActive = {};
      S.state.verificatorRolledPlayers = new Set();
      S.state.verificatorActive[p] = true;
      S.state.verificatorRolledPlayers.add(p);
      J.renderJudgingInterface();
    }, owner.p);
    // чужой код (у кого нет активного Верификатора) и мусор — одинаковое сообщение
    await click(page, "[data-verificator-open]");
    await H.typeCode(page, t.civ[1].c);
    await page.waitForTimeout(150);
    const a = await status(page);
    let bogus = "0000";
    while (t.roles.some((r) => r.c === bogus)) bogus = String(Number(bogus) + 1).padStart(4, "0");
    await H.typeCode(page, bogus);
    await page.waitForTimeout(150);
    const b = await status(page);
    check("неактивный и несуществующий код неразличимы", a === b && a.length > 0, [a, b]);
    await H.stateOf(page, "(state.codeFailures=0,state.codeLockedUntil=0)");
    await H.typeCode(page, owner.c);
    await page.waitForSelector(".verificator-target-modal[open], dialog[open] .verificator-target-list", { timeout: 3000 });
    const title = await page.textContent(".verificator-target-modal__title");
    check("нейтральный заголовок", title.trim() === "Верификатор", title);
    const hint = await page.textContent(".verificator-target-modal__hint");
    check("нет упоминания типа в подсказке", !/шпионск|мирн/i.test(hint), hint);
    await page.click(`[data-verificator-target="${t.spy[0].p}"]`);
    await page.waitForSelector("dialog[open] .verificator-result__verdict-value", { timeout: 3000 });
    check("вердикт показан", true);
    check("Верификатор сгорел", (await H.stateOf(page, `state.gadgets[${JSON.stringify(owner.p)}].verificatorCivilian`)) === 0);
    check("ошибок страницы нет", t.errors.length === 0, t.errors);
    await t.browser.close();
  }

  /* ---------- 11. Частичная поимка (2+ шпиона) ---------- */
  console.log("11. Частичная поимка");
  {
    const names = ["Аня", "Боря", "Вика", "Гена", "Даша", "Егор", "Женя", "Зоя"];
    let t = null;
    for (let i = 0; i < 25; i++) {
      t = await setup(names, "p100");
      if (t.spy.length >= 2) break;
      await t.browser.close();
      t = null;
    }
    check("получили раунд с 2+ шпионами", !!t);
    if (t) {
      await startTimer(t);
      const { page } = t;
      const init = t.civ[0].p;
      const vot = t.civ.slice(0, 5).map((c) => c.p);
      await click(page, `[data-suspect="${t.spy[0].p}"]`);
      await click(page, `[data-initiator="${init}"]`);
      for (const v of vot) await click(page, `[data-voter="${v}"]`);
      await click(page, "#submit-vote");
      await page.waitForTimeout(300);
      check("игра продолжается", !(await H.stateOf(page, "state.gameEnded")));
      check("деньги ещё не двигались", (await H.stateOf(page, "state.roundSettled")) === false);
      check("бейдж: осталось меньше", /осталось/.test(await page.textContent("#spy-count-badge")), await page.textContent("#spy-count-badge"));
      check("partialCatches записан", (await H.stateOf(page, "state.partialCatches.length")) === 1);
      await t.browser.close();
    }
  }

  console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
