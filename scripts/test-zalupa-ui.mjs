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
  assert.equal(await page.getByRole("button", { name: "Плёнка", exact: true }).isDisabled(), true);
  await page.locator(".zalupa-app>input[type=file]").setInputFiles("public/samples/still-life.jpg");
  await page.getByRole("img", { name: "Предпросмотр обработки", exact: true }).waitFor();
  await page.getByRole("button", { name: "Плёнка", exact: true }).click();
  await page.getByRole("button", { name: "Kodak Gold 200", exact: true }).click();
  await page.locator('[data-stock-id="kodak_gold_200"][aria-pressed=true]').waitFor();
  console.log("PASS real image import and original film selection");
  const deck = async (name) =>
    page
      .getByRole("navigation", { name: "Группы инструментов" })
      .getByRole("button", { name, exact: true })
      .click();
  const tab = async (name) => page.getByRole("tab", { name, exact: true }).click();
  const value = async (label, text) => {
    await page.getByRole("button", { name: "Точное значение: " + label, exact: true }).click();
    await page.getByRole("textbox", { name: "Точное значение", exact: true }).fill(text);
    await page.getByRole("button", { name: "Применить", exact: true }).click();
  };
  await deck("Свет и цвет");
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
  await deck("Оптика");
  await page.getByRole("slider", { name: "UV-срез", exact: true }).waitFor();
  assert.equal(await page.getByRole("slider", { name: "EV", exact: true }).count(), 0);
  await deck("Свет и цвет");
  assert.equal(
    await page.getByRole("tab", { name: "Экспозиция", exact: true }).getAttribute("aria-selected"),
    "true",
  );
  console.log(
    "PASS independent pages, exact controls, isolated reset, Undo and remembered group page",
  );
  await deck("Negs");
  await tab("RMS-зерно");
  const rms = page.getByRole("switch", { name: "Зернистость по RMS", exact: true });
  if ((await rms.getAttribute("aria-checked")) === "false") await rms.click();
  await page.getByRole("slider", { name: "RMS красного канала", exact: true }).waitFor();
  await tab("DIR");
  await page.getByRole("switch", { name: "Нелинейная модель Langmuir", exact: true }).waitFor();
  await deck("Печать");
  await tab("Бумага");
  await page.getByRole("region", { name: "Каталог бумаги", exact: true }).waitFor();
  await page.locator('[data-stock-id="kodak_endura_premier"]').click();
  await page.locator('[data-stock-id="kodak_endura_premier"][aria-pressed=true]').waitFor();
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
  await deck("Печать");
  await tab("Рамка");
  await page.getByRole("button", { name: "135 — перфорация и DX", exact: true }).click();
  await page.getByRole("switch", { name: "DX-полоса", exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Дата на снимке", exact: true }).fill("2026-11-11");
  console.log("PASS original Negs, Fotufilm, Lab Scan, layered optics and 135/DX frame controls");
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
  await deck("Свет и цвет");
  assert.equal(await page.locator(".z-inspector").count(), 0);
  await deck("Свет и цвет");
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
