const H = require("./helpers.cjs");
const OUT = process.argv[2] || "/tmp/shots";
require("fs").mkdirSync(OUT, { recursive: true });
(async () => {
  const { browser, page, errors } = await H.launch({ viewport: { width: 390, height: 844 } });
  await H.open(page);
  await H.addPlayers(page, ["Аня", "Боря", "Вика", "Гена"]);
  await page.screenshot({ path: OUT + "/1-settings.png", fullPage: true });
  await H.addPlayers(page, ["Даша"]);
  await H.startMission(page);
  await page.click("#reveal-role");
  await page.waitForSelector("#role-card:not(.is-hidden)");
  await page.screenshot({ path: OUT + "/2-role.png", fullPage: true });
  await page.click("#hide-role");
  for (let i = 0; i < 4; i++) { await page.click("#reveal-role"); await page.click("#hide-role"); }
  await page.click("#start-timer");
  await page.waitForSelector("#game-screen.is-active");
  await page.screenshot({ path: OUT + "/3-game.png", fullPage: true });
  await page.$eval("#open-intercept-window", (e) => e.click());
  await page.waitForSelector("#access-code-modal[open]");
  await page.click('[data-access-key="1"]'); await page.click('[data-access-key="2"]');
  await page.screenshot({ path: OUT + "/4-code.png" });
  await page.reload();
  await page.waitForSelector("#resume-round-modal[open]");
  await page.screenshot({ path: OUT + "/5-resume.png" });
  console.log("errors", errors);
  await browser.close();
})();
