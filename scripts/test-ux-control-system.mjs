import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.TEST_URL ?? "http://127.0.0.1:8089/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Камера", exact: true }).click();
  const slider = page.getByRole("slider", { name: "EV", exact: true });
  await slider.waitFor();
  await page.getByRole("button", { name: "Точное значение: EV", exact: true }).click();
  await page.getByRole("textbox", { name: "Точное значение" }).fill("999999");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await page.getByRole("alert").waitFor();
  await page.getByRole("textbox", { name: "Точное значение" }).fill("1,25");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  assert.equal(await slider.getAttribute("aria-valuenow"), "1.25");
  await slider.click();
  assert.equal(await slider.getAttribute("aria-valuenow"), "1.25");
  await page.getByRole("button", { name: "Точное значение: EV", exact: true }).click();
  await page.getByRole("button", { name: "По умолчанию", exact: true }).click();
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  assert.equal(await slider.getAttribute("aria-valuenow"), "0");
  await page.keyboard.press("Control+z");
  assert.equal(await slider.getAttribute("aria-valuenow"), "1.25");

  await page.getByRole("button", { name: "Точное значение: EV", exact: true }).click();
  await page.getByRole("button", { name: "Сменить знак значения", exact: true }).click();
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  assert.equal(await slider.getAttribute("aria-valuenow"), "-1.25");
  await page.waitForFunction(() =>
    Object.values(localStorage).some((v) => v.includes('\"exposureCompensationEv\":-1.25')),
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Камера", exact: true }).click();
  assert.equal(await slider.getAttribute("aria-valuenow"), "-1.25");
  await page.getByRole("button", { name: "Найти инструмент или параметр", exact: true }).click();
  await page.getByRole("searchbox", { name: "Поиск инструмента или параметра" }).fill("EV");
  await page.getByRole("button", { name: /^EV/ }).click();
  await page.locator(".lab-slider-row.ux-found").waitFor();
  assert.equal(await slider.getAttribute("aria-valuenow"), "-1.25");
  await page.getByRole("button", { name: "Найти инструмент или параметр", exact: true }).click();
  await page.getByRole("searchbox", { name: "Поиск инструмента или параметра" }).fill("толщина");
  await page.getByRole("button", { name: "Толщина основы", exact: false }).last().click();
  await page.waitForTimeout(500);
  await page.getByRole("heading", { name: "Инструменты Fotufilm", exact: true }).waitFor();
  await page.getByRole("button", { name: "Найти инструмент или параметр", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Поиск инструмента или параметра" })
    .fill("насыщение донора");
  assert.ok((await page.locator(".ux-param-result").count()) > 0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Найти инструмент или параметр", exact: true }).click();
  await page.getByRole("searchbox", { name: "Поиск инструмента или параметра" }).fill("пуш");
  assert.ok(
    (await page.locator(".ux-tool-result").allTextContents()).some((t) =>
      t.includes("Push / Pull"),
    ),
  );
  await page.keyboard.press("Escape");
  async function findParameter(query, label = query) {
    await page.getByRole("button", { name: "Найти инструмент или параметр", exact: true }).click();
    await page.getByRole("searchbox", { name: "Поиск инструмента или параметра" }).fill(query);
    await page.locator(".ux-param-result").filter({ hasText: label }).first().click();
    await page.waitForTimeout(350);
  }
  await findParameter("Источник изображения");
  await page.locator('[data-control-label="Источник изображения"].ux-found').waitFor();
  await page.getByRole("combobox", { name: "Источник изображения", exact: true }).waitFor();
  await page.getByRole("button", { name: "Плёнка", exact: true }).click();
  await page.getByRole("button", { name: "Kodak Gold 200", exact: true }).click();
  await page.locator('button[aria-label="Kodak Gold 200"][aria-pressed="true"]').waitFor();
  await findParameter("Использовать Layered Transport");
  const switchBox = await page
    .getByRole("switch", { name: "Использовать Layered Transport", exact: true })
    .boundingBox();
  assert.ok(switchBox.height >= 48 && switchBox.width >= 48);
  await page.getByRole("switch", { name: "Использовать Layered Transport", exact: true }).click();
  await findParameter("Толщина основы");
  await page.locator('[data-control-label="Толщина основы"].ux-found').waitFor();
  await page
    .getByRole("combobox", { name: "Способ получения результата" })
    .selectOption("lab-scan");
  await findParameter("Характер минилаба");
  await page.locator('[data-control-label="Характер минилаба"].ux-found').waitFor();
  await page
    .getByRole("button", { name: "Точное значение: Характер минилаба", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Точное значение" }).fill("0,55");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  assert.equal(
    await page
      .getByRole("slider", { name: "Характер минилаба", exact: true })
      .getAttribute("aria-valuenow"),
    "0.55",
  );
  await findParameter("рамка", "Рамка фотографии");
  await page
    .getByRole("group", { name: "Рамка фотографии" })
    .getByRole("button", { name: "135 — перфорация и DX", exact: true })
    .click();
  await findParameter("Дата на снимке");
  await page.getByRole("textbox", { name: "Дата на снимке" }).fill("2026-11-11");
  await findParameter("DX-полоса");
  await page.locator('[data-control-label="DX-полоса"].ux-found').waitFor();
  await findParameter("LUT превью");
  await page.getByRole("button", { name: "Точное значение: LUT превью", exact: true }).click();
  await page.getByRole("button", { name: "По умолчанию", exact: true }).click();
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  const lut = page.getByRole("slider", { name: "LUT превью", exact: true });
  assert.equal(await lut.getAttribute("aria-valuenow"), "17");
  await lut.focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await lut.getAttribute("aria-valuenow"), "21");
  for (const size of [
    { width: 360, height: 740 },
    { width: 844, height: 390 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(size);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: `artifacts/ux-controls-${size.width}.png` });
  }
  await page.getByRole("button", { name: "Пример: лес", exact: true }).click();
  await page.getByRole("img", { name: "Предпросмотр обработки", exact: true }).waitFor();
  await page.waitForTimeout(700);
  await page.waitForFunction(() => !document.querySelector('[aria-label="Открыть"]').disabled);
  await page.locator('.lab-app > input[type="file"]').setInputFiles("public/samples/still-life.jpg");
  await page.getByRole("banner").getByText("still-life.jpg",{exact:true}).waitFor();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Открыть"]').disabled);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспортировать кадр", exact: true }).click();
  const download = await downloaded;
  assert.equal(await download.failure(), null);
  const path = await download.path();
  const fs = await import("node:fs");
  const bytes = fs.readFileSync(path);
  assert.ok(bytes.length > 1000);
  assert.equal(bytes[0], 255);
  assert.equal(bytes[1], 216);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByRole("button", { name: "Камера", exact: true }).click();
  await page.screenshot({ path: "artifacts/ux-workspace-photo-360.png" });
  await page.getByRole("button", { name: "Точное значение: EV", exact: true }).click();
  await page.getByRole("textbox", { name: "Точное значение" }).fill("1,25");
  await page.screenshot({ path: "artifacts/ux-number-360.png" });
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await page.getByRole("button", { name: "Найти инструмент или параметр", exact: true }).click();
  await page.getByRole("checkbox", { name: "Только изменённые разделы" }).check();
  await page.getByRole("searchbox", { name: "Поиск инструмента или параметра" }).fill("Съёмка");
  assert.equal(await page.locator(".ux-tool-result").count(), 1);
  await page.screenshot({ path: "artifacts/ux-directory-360.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS exact decimal input, invalid-value validation, factory reset, Undo, safe tap, direct parameter search incl dynamic donor controls, narrow/landscape/desktop layout, actual file import and real JPEG export",
  );
} finally {
  await browser.close();
}
