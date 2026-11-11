import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.TEST_URL ?? "http://127.0.0.1:8091/", { waitUntil: "networkidle" });
  assert.equal(await page.locator(".workbench-library").count(), 0);
  assert.equal(await page.getByRole("button", { name: "Плёнки", exact: true }).isDisabled(), true);
  await page.locator(".zalupa-app>input[type=file]").setInputFiles("public/samples/still-life.jpg");
  await page.getByRole("img", { name: "Предпросмотр обработки", exact: true }).waitFor();
  await page.getByRole("button", { name: "Плёнки", exact: true }).click();
  await page.getByRole("button", { name: "Kodak Gold 200", exact: true }).click();
  await page.locator('[data-stock-id="kodak_gold_200"][aria-pressed=true]').waitFor();
  console.log("PASS real image import and original film selection");
  const deck = async (name) => {
    const button = page
      .getByRole("navigation", { name: "Группы инструментов" })
      .getByRole("button", { name, exact: true });
    if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  };
  const owner = async (source) => {
    await page.locator(`.z-inspector[data-source="${source}"]`).waitFor();
    assert.equal(await page.locator(".z-inspector").getAttribute("data-source"), source);
  };
  const roots = await page
    .getByRole("navigation", { name: "Группы инструментов" })
    .getByRole("button")
    .allTextContents();
  assert.deepEqual(
    roots.map((t) => t.trim()),
    ["Плёнки", "Spektrafilm", "Experimental", "Negs", "Fotufilm"],
  );
  const tab = async (name) => page.getByRole("tab", { name, exact: true }).click();
  const value = async (label, text) => {
    await page.getByRole("button", { name: "Точное значение: " + label, exact: true }).click();
    await page.getByRole("textbox", { name: "Точное значение", exact: true }).fill(text);
    await page.getByRole("button", { name: "Применить", exact: true }).click();
  };
  await deck("Spektrafilm");
  assert.equal(await page.getByRole("slider", { name: "Тинт", exact: true }).count(), 0);
  await value("EV", "1,25");
  await tab("Баланс");
  await value("Тинт", "17");
  await tab("Экспозиция");
  assert.equal(
    await page.getByRole("slider", { name: "EV", exact: true }).getAttribute("aria-valuenow"),
    "1.25",
  );
  await page.getByRole("button", { name: "Сбросить текущую страницу" }).click();
  assert.equal(
    await page.getByRole("slider", { name: "EV", exact: true }).getAttribute("aria-valuenow"),
    "0",
  );
  await tab("Баланс");
  assert.equal(
    await page.getByRole("slider", { name: "Тинт", exact: true }).getAttribute("aria-valuenow"),
    "17",
  );
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await tab("Экспозиция");
  assert.equal(
    await page.getByRole("slider", { name: "EV", exact: true }).getAttribute("aria-valuenow"),
    "1.25",
  );
  await tab("Оптика");
  await page.getByRole("slider", { name: "UV-срез", exact: true }).waitFor();
  assert.equal(await page.getByRole("slider", { name: "EV", exact: true }).count(), 0);
  await deck("Experimental");
  await owner("experimental");
  await deck("Spektrafilm");
  await owner("spektrafilm");
  assert.equal(
    await page.getByRole("tab", { name: "Оптика", exact: true }).getAttribute("aria-selected"),
    "true",
  );
  await tab("Экспозиция");
  console.log(
    "PASS independent pages, exact controls, isolated reset, Undo and remembered group page",
  );
  await tab("Push / Pull");
  assert.equal(
    await page.getByRole("switch", { name: "Химия плёнки по слоям", exact: true }).count(),
    0,
  );
  await deck("Experimental");
  await owner("experimental");
  await tab("Химия плёнки");
  await page.getByRole("switch", { name: "Химия плёнки по слоям", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("slider", { name: "Экспозиция при съёмке", exact: true }).count(),
    0,
  );
  await tab("RMS-зерно");
  const rms = page.getByRole("switch", { name: "Зернистость по RMS", exact: true });
  if ((await rms.getAttribute("aria-checked")) === "false") await rms.click();
  await page.getByRole("slider", { name: "RMS красного канала", exact: true }).waitFor();
  await page.getByRole("slider", { name: "Размытие зерна", exact: true }).waitFor();
  await value("Размытие зерна", "0,5");
  await page.getByRole("button", { name: "Точное значение: Размытие зерна", exact: true }).click();
  await page.getByRole("button", { name: "По умолчанию", exact: true }).click();
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  assert.equal(
    await page
      .getByRole("slider", { name: "Размытие зерна", exact: true })
      .getAttribute("aria-valuenow"),
    "0.65",
  );
  await deck("Spektrafilm");
  await tab("Зерно");
  assert.equal(
    await page.getByRole("switch", { name: "Зернистость по RMS", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "Сбросить текущую страницу", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Открыть Experimental →", exact: true }).click();
  await owner("experimental");
  await tab("Langmuir DIR");
  await page.getByRole("switch", { name: "Нелинейная модель Langmuir", exact: true }).waitFor();
  await page.getByRole("slider", { name: "Диффузия, µm", exact: true }).waitFor();
  await deck("Negs");
  await owner("negs");
  await tab("Профиль Negs");
  assert.equal(
    await page
      .getByRole("button", { name: "Вернуть зерно из профиля Negs", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(await page.getByRole("slider").count(), 0);
  assert.equal(
    await page.getByRole("switch", { name: "Зернистость по RMS", exact: true }).count(),
    0,
  );
  await deck("Плёнки");
  await page.locator('[data-stock-id="negs_cinestill_800t"]').click();
  await deck("Experimental");
  await tab("RMS-зерно");
  const red = page.getByRole("slider", { name: "RMS красного канала", exact: true });
  await red.waitFor();
  const originalRed = await red.getAttribute("aria-valuenow");
  await value("RMS красного канала", String(Number(originalRed) + 1));
  assert.equal(
    await page.getByRole("button", { name: "Взять зерно из профиля Negs", exact: true }).count(),
    0,
  );
  await deck("Negs");
  await tab("Профиль Negs");
  await page.getByRole("button", { name: "Вернуть зерно из профиля Negs", exact: true }).click();
  await deck("Experimental");
  await tab("RMS-зерно");
  assert.equal(await red.getAttribute("aria-valuenow"), originalRed);
  await deck("Negs");
  await tab("Prep");
  await page.getByRole("slider", { name: "Экспозиция подготовки", exact: true }).waitFor();
  await tab("Форматы кадра");
  await page.getByRole("combobox", { name: "Формат кадра · Negs", exact: true }).waitFor();
  console.log(
    "PASS five separate sources, isolated experimental chemistry/RMS/DIR, shared rows and Negs profile restoration",
  );
  await deck("Spektrafilm");
  await tab("Печать");
  await page.getByRole("region", { name: "Каталог бумаги", exact: true }).waitFor();
  await page.locator('[data-stock-id="kodak_endura_premier"]').click();
  await page.locator('[data-stock-id="kodak_endura_premier"][aria-pressed=true]').waitFor();
  assert.equal(
    await page.getByRole("switch", { name: "Настройка основы бумаги", exact: true }).count(),
    0,
  );
  await deck("Experimental");
  await tab("Основа бумаги");
  const base = page.getByRole("switch", { name: "Настройка основы бумаги", exact: true });
  if ((await base.getAttribute("aria-checked")) === "false") await base.click();
  await value("Циан основы", "1,5");
  await deck("Spektrafilm");
  await tab("Печать");
  await page.getByRole("button", { name: "Сбросить текущую страницу", exact: true }).click();
  await deck("Experimental");
  await tab("Основа бумаги");
  assert.equal(
    await page
      .getByRole("slider", { name: "Циан основы", exact: true })
      .getAttribute("aria-valuenow"),
    "1.5",
  );
  await deck("Fotufilm");
  await tab("Outputs / Lab Scan");
  await page
    .getByRole("combobox", { name: "Способ получения результата" })
    .selectOption("lab-scan");
  await value("Характер минилаба", "0,55");
  await tab("Layered Transport");
  const layered = page.getByRole("switch", { name: "Использовать Layered Transport", exact: true });
  if ((await layered.getAttribute("aria-checked")) === "false") await layered.click();
  await value("Толщина основы", "1,5");
  await tab("Outputs / Lab Scan");
  assert.equal(
    await page
      .getByRole("slider", { name: "Характер минилаба", exact: true })
      .getAttribute("aria-valuenow"),
    "0.55",
  );
  await deck("Spektrafilm");
  await tab("Рамка");
  await page.getByRole("button", { name: "135 — перфорация и DX", exact: true }).click();
  await page.getByRole("switch", { name: "DX-полоса", exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Дата на снимке", exact: true }).fill("2026-11-11");
  console.log("PASS original Negs, Fotufilm, Lab Scan, layered optics and 135/DX frame controls");
  await page.getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("button", { name: "Найти инструмент или параметр", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Источник инструментов", exact: true })
    .selectOption("experimental");
  await page
    .getByRole("searchbox", { name: "Поиск инструмента или параметра" })
    .fill("насыщение донора");
  assert.equal(await page.locator('.ux-results>section[data-source="negs"]').count(), 0);
  await page.locator(".ux-param-result").first().click();
  await owner("experimental");
  await page.getByRole("tab", { name: "Langmuir DIR", exact: true }).waitFor();
  await page.getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("button", { name: "Найти инструмент или параметр", exact: true }).click();
  await page.getByRole("searchbox", { name: "Поиск инструмента или параметра" }).fill("EV");
  await page.locator(".ux-param-result").filter({ hasText: /^EV/ }).first().click();
  await page.locator('.lab-slider-row.ux-found[data-control-label="EV"]').waitFor();
  assert.equal(
    await page.getByRole("tab", { name: "Экспозиция", exact: true }).getAttribute("aria-selected"),
    "true",
  );
  for (const size of [
    { width: 320, height: 568 },
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(150);
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      picture: document.querySelector(".z-picture").getBoundingClientRect().toJSON(),
      panel: document.querySelector(".z-inspector").getBoundingClientRect().toJSON(),
      bar: document.querySelector(".z-decks").getBoundingClientRect().toJSON(),
      image: document
        .querySelector('[data-print] img[alt="Предпросмотр обработки"]')
        .getBoundingClientRect()
        .toJSON(),
    }));
    assert.equal(geometry.overflow, false);
    assert.ok(geometry.picture.height >= 110);
    assert.ok(
      geometry.picture.bottom <= geometry.panel.top + 1 ||
        geometry.picture.right <= geometry.panel.left + 1,
    );
    assert.ok(geometry.panel.bottom <= geometry.bar.top + 1);
    assert.ok(
      geometry.image.left >= geometry.picture.left - 1 &&
        geometry.image.right <= geometry.picture.right + 1 &&
        geometry.image.top >= geometry.picture.top - 1 &&
        geometry.image.bottom <= geometry.picture.bottom + 1,
      "full framed image must fit the canvas",
    );
    await page.screenshot({ path: `artifacts/zalupa-${size.width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("navigation", { name: "Группы инструментов" })
    .getByRole("button", { name: "Spektrafilm", exact: true })
    .click();
  assert.equal(await page.locator(".z-inspector").count(), 0);
  await deck("Spektrafilm");
  assert.equal(
    await page.getByRole("slider", { name: "EV", exact: true }).getAttribute("aria-valuenow"),
    "1.25",
  );
  console.log(
    "PASS direct parameter routing, portrait/landscape/desktop bounds and panel close/reopen",
  );
  await page.waitForFunction(
    () => !document.querySelector('button[aria-label="Открыть"]').disabled,
  );
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспортировать кадр", exact: true }).click();
  const download = await downloaded;
  assert.equal(await download.failure(), null);
  await download.saveAs("artifacts/zalupa-export.jpg");
  const bytes = fs.readFileSync("artifacts/zalupa-export.jpg");
  assert.equal(bytes[0], 255);
  assert.equal(bytes[1], 216);
  assert.ok(bytes.length > 1000);
  let dimensions;
  for (let at = 2; at < bytes.length;) {
    if (bytes[at] !== 255) {
      at++;
      continue;
    }
    const marker = bytes[at + 1];
    if (marker === 192 || marker === 194) {
      dimensions = { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
      break;
    }
    if (marker === 216 || marker === 217) {
      at += 2;
      continue;
    }
    at += 2 + bytes.readUInt16BE(at + 2);
  }
  assert.deepEqual(dimensions, { width: 1628, height: 1536 });
  await page.getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  const labels = page.getByRole("switch", { name: "Подписи вкладок", exact: true });
  await labels.click();
  assert.equal(await page.locator("[data-z-deck-label]").count(), 0);
  await labels.click();
  const pins = page.getByRole("switch", { name: "Лаб и журнал в рейке", exact: true });
  await pins.click();
  await page
    .getByRole("navigation", { name: "Группы инструментов" })
    .getByRole("button", { name: "Расчёт", exact: true })
    .waitFor();
  await pins.click();
  const licence = await page.request.get(
    (process.env.TEST_URL ?? "http://127.0.0.1:8091/") + "zalupa-ui-notice.txt",
  );
  assert.equal(licence.status(), 200);
  assert.ok((await licence.text()).includes("Apache License"));
  console.log("PASS retained interface preferences and bundled UI notice");
  assert.deepEqual(errors, []);
  console.log(
    `PASS real full-size JPEG export with original 135 frame: ${bytes.length} bytes, ${JSON.stringify(dimensions)}; no page errors`,
  );
} finally {
  await browser.close();
}
