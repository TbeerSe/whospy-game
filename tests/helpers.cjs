// Playwright берётся из node_modules (npm install). Запасной путь —
// переменная PLAYWRIGHT_PATH или старое расположение.
let playwright;
try {
  playwright = require("playwright");
} catch (error) {
  playwright = require(
    process.env.PLAYWRIGHT_PATH || "/opt/npm-tools/node_modules/playwright"
  );
}
const { chromium } = playwright;

const URL = process.env.WHOSPY_URL || "http://127.0.0.1:8765/index.html";

async function launch(opts = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 420, height: 900 }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });
  return { browser, context, page, errors };
}

async function open(page) {
  await page.goto(URL);
  await page.waitForSelector("#settings-screen.is-active");
}

async function addPlayers(page, names) {
  for (const n of names) {
    await page.fill("#player-name", n);
    await page.click("#player-form button[type=submit]");
  }
}

// Раздаёт роли через реальный UI, возвращает { player: {code, roleType} }
async function dealAll(page) {
  const info = {};
  const total = await page.evaluate(
    async () => (await import("/src/core/state.js")).state.assignments.length
  );
  for (let i = 0; i < total; i++) {
    const name = (await page.textContent("#current-player-name")).trim();
    await page.click("#reveal-role");
    await page.waitForSelector("#role-card:not(.is-hidden)");
    const code = (await page.textContent(".role-card__code-value")).trim();
    const label = (await page.textContent("#role-card-label")).trim();
    info[name] = { code, label };
    await page.click("#hide-role");
    await page.waitForTimeout(60);
  }
  return info;
}

async function startMission(page) {
  await page.click("#start-mission");
  await page.waitForSelector("#dealing-screen.is-active", { timeout: 30000 });
}

async function stateOf(page, expr) {
  return page.evaluate(async (e) => {
    const S = await import("/src/core/state.js");
    return new Function("state", "return (" + e + ")")(S.state);
  }, expr);
}

async function typeCode(page, code) {
  await page.waitForSelector("#access-code-modal[open]");
  for (const d of code) {
    await page.click(`#access-code-modal [data-access-key="${d}"]`);
  }
}

module.exports = { launch, open, addPlayers, dealAll, startMission, stateOf, typeCode, URL };
