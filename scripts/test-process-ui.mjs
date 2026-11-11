import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const errors = [],
  checked = new Set();
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.TEST_URL ?? "http://127.0.0.1:8093/", { waitUntil: "networkidle" });
  const nav = page.getByRole("navigation", { name: "Этапы обработки" });
  assert.deepEqual(
    (await nav.getByRole("button").allTextContents()).map((s) => s.trim()),
    ["Камера", "Плёнка", "Проявка", "Эффекты", "Печать", "Скан", "Финиш"],
  );
  await page.locator(".zalupa-app>input[type=file]").setInputFiles("public/samples/still-life.jpg");
  await page.getByRole("img", { name: "Предпросмотр обработки", exact: true }).waitFor();
  await page.getByRole("button",{name:"Инструменты просмотра",exact:true}).click();
  await page.getByRole("button",{name:"1:1",exact:true}).waitFor();
  await page.getByRole("button",{name:"Инструменты просмотра",exact:true}).click();
  assert.equal(await page.getByRole("button",{name:"1:1",exact:true}).count(),0);
  const stage = async (name) => {
    const b = nav.getByRole("button", { name, exact: true });
    if ((await b.getAttribute("aria-pressed")) !== "true") await b.click();
  };
  const tab = async (name) => page.getByRole("tab", { name, exact: true }).click();
  const set = async (label, value) => {
    await page.getByRole("button", { name: "Точное значение: " + label, exact: true }).click();
    await page.getByRole("textbox", { name: "Точное значение", exact: true }).fill(String(value));
    await page.getByRole("button", { name: "Применить", exact: true }).click();
  };
  const val = async (label) =>
    Number(
      await page.getByRole("slider", { name: label, exact: true }).getAttribute("aria-valuenow"),
    );
  const toggle = async (label, on = true) => {
    const b = page.getByRole("switch", { name: label, exact: true });
    if ((await b.getAttribute("aria-checked")) !== String(on)) await b.click();
  };
  const exercise = async () => {
    const labels = await page
      .locator(".z-control-page [role=slider][aria-disabled=false]")
      .evaluateAll((es) => es.map((e) => e.getAttribute("aria-label")));
    for (const label of labels) {
      const slider = page.getByRole("slider", { name: label, exact: true });
      if ((await slider.count()) !== 1) continue;
      const before = Number(await slider.getAttribute("aria-valuenow")),
        max = Number(await slider.getAttribute("aria-valuemax"));
      await slider.focus();
      await slider.press(before >= max ? "ArrowLeft" : "ArrowRight");
      const after = Number(await slider.getAttribute("aria-valuenow"));
      assert.ok(Number.isFinite(after) && after !== before, label + " must update its bound state");
      checked.add(label);
    }
  };
  await stage("Плёнка");
  await page.locator('[data-stock-id="kodak_gold_200"]').click();
  await stage("Камера");
  await tab("Экспозиция");
  await set("EV", "1,25");
  await tab("Баланс белого");
  await set("Тинт", "17");
  await tab("Экспозиция");
  assert.equal(await val("EV"), 1.25);
  await page.getByRole("button", { name: "Сбросить текущую страницу" }).click();
  assert.equal(await val("EV"), 0);
  await tab("Баланс белого");
  assert.equal(await val("Тинт"), 17);
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await tab("Экспозиция");
  assert.equal(await val("EV"), 1.25);
  for (const name of [
    "Экспозиция",
    "Баланс белого",
    "Подготовка",
    "Оптика",
    "Цветной фильтр",
    "Входной цвет",
  ]) {
    await tab(name);
    if (name === "Оптика") await toggle("Диффузия");
    await exercise();
  }
  console.log("PASS camera controls, exact comma input, independent reset and Undo");
  await stage("Плёнка");
  await tab("Формат");
  await page.getByRole("combobox", { name: "Готовый формат кадра" }).selectOption("70");
  assert.equal(await val("Формат, мм"), 70);
  await set("Формат, мм", "56");
  assert.equal(
    await page.getByRole("combobox", { name: "Готовый формат кадра" }).inputValue(),
    "56",
  );
  await tab("Спектр");
  await page.getByRole("combobox", { name: "RGB → спектр" }).waitFor();
  await exercise();
  await tab("Основа и маска");
  await toggle("Настройка основы плёнки");
  await exercise();
  await stage("Эффекты");
  await tab("Зерно");
  await toggle("Зерно");
  const grain = page.getByRole("combobox", { name: "Модель зерна" });
  await grain.selectOption("classic");
  await set("Частица, µm²", ".8");
  await toggle("Подслои");
  await exercise();
  await grain.selectOption("rms");
  await set("RMS красного канала", "22");
  await exercise();
  const rms = await val("RMS красного канала");
  await grain.selectOption("classic");
  assert.ok(Math.abs((await val("Частица, µm²")) - 0.82) < 0.0001);
  await grain.selectOption("rms");
  assert.equal(await val("RMS красного канала"), rms);
  await toggle("Зерно", false);
  assert.equal(
    await page.getByRole("slider", { name: "RMS красного канала" }).getAttribute("aria-disabled"),
    "true",
  );
  await toggle("Зерно");
  await page.getByRole("button", { name: "Сбросить текущую страницу" }).click();
  await page.getByRole("button", { name: "Отменить", exact: true }).click();
  await page.waitForFunction(()=>document.querySelector('select[aria-label="Модель зерна"]')?.value==="rms",null,{timeout:5000});
  assert.equal(await grain.inputValue(), "rms");
  assert.equal(await val("RMS красного канала"), rms);
  await tab("Галяция");
  await toggle("Галяция");
  const halo = page.getByRole("combobox", { name: "Модель галяции" });
  await halo.selectOption("legacy");
  await exercise();
  await halo.selectOption("layered");
  await set("Толщина основы", "1,5");
  await exercise();
  const thickness = await val("Толщина основы");
  await halo.selectOption("legacy");
  await halo.selectOption("layered");
  assert.equal(await val("Толщина основы"), thickness);
  await stage("Проявка");
  await tab("DIR");
  await toggle("DIR-каплеры");
  const dir = page.getByRole("combobox", { name: "Модель DIR" });
  await dir.selectOption("classic");
  await exercise();
  await dir.selectOption("langmuir");
  await exercise();
  await tab("Push / Pull");
  await exercise();
  await tab("Химия");
  await toggle("Химия плёнки по слоям");
  await exercise();
  console.log(
    "PASS unified models, all visible sliders, preservation of inactive models and shared physical format",
  );
  await stage("Печать");
  await tab("Вывод");
  const output = page.getByRole("combobox", { name: "Способ получения результата" });
  for (const mode of ["digital", "auto-levels", "lab-scan", "negative", "paper"]) {
    await output.selectOption(mode);
    await exercise();
  }
  await output.selectOption("lab-scan");
  await set("Характер минилаба", ".55");
  await tab("Бумага и печать");
  await page.getByText("Этот этап сейчас обходится", { exact: true }).waitFor();
  assert.equal(await page.locator("[data-stock-id]").count(), 0);
  await page.getByRole("button", { name: "Использовать фотобумагу", exact: true }).click();
  await page.locator('[data-stock-id="kodak_endura_premier"]').click();
  for (const name of ["Химия бумаги", "Диффузия печати", "Блик"]) await toggle(name);
  await exercise();
  await tab("Основа бумаги");
  await toggle("Настройка основы бумаги");
  await set("Циан основы", "1.5");
  await exercise();
  await tab("Бумага и печать");
  await page.getByRole("button", { name: "Сбросить текущую страницу" }).click();
  await tab("Основа бумаги");
  assert.ok((await val("Циан основы")) >= 1.5);
  await tab("Пробная печать");
  await page.getByRole("button", { name: "Открыть пробную печать" }).waitFor();
  await stage("Скан");
  await tab("Отделка скана");
  await toggle("Коррекция белого");
  await toggle("Коррекция чёрного");
  await exercise();
  await page.getByRole("button", { name: "Скан негатива", exact: true }).click();
  await page.getByRole("tab", { name: "Настоящий негатив", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("combobox", { name: "Источник изображения", exact: true }).isDisabled(),
    true,
  );
  await page
    .getByText("Калибровка и конвертация настоящего негатива выполняются в Android APK.", {
      exact: false,
    })
    .waitFor();
  console.log(
    "PASS output alternatives, paper bypass, separate negative route and honest browser capability",
  );
  await page.getByRole("button", { name: "Ещё", exact: true }).click();
  await page.getByRole("button", { name: "Найти инструмент или параметр", exact: true }).click();
  await page.getByRole("combobox", { name: "Раздел обработки" }).selectOption("effects");
  await page
    .getByRole("searchbox", { name: "Поиск инструмента или параметра" })
    .fill("толщина основы");
  await page.locator(".ux-param-result").first().click();
  await page.getByRole("combobox", { name: "Модель галяции" }).waitFor();
  await stage("Финиш");
  await tab("Рамка");
  await page.getByRole("button", { name: "135 — перфорация и DX", exact: true }).click();
  await page.getByRole("switch", { name: "DX-полоса", exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Дата на снимке" }).fill("2026-11-11");
  await tab("Кадрирование");
  await exercise();
  await tab("Цвет и размер");
  await page.getByRole("combobox", { name: "Выходной гамут" }).waitFor();
  await exercise();
  await page.getByRole("button", { name: "Сбросить текущую страницу" }).click();
  await tab("Файл");
  await page.getByRole("button", { name: "Сбросить текущую страницу" }).click();
  for (const size of [
    { width: 320, height: 568 },
    { width: 360, height: 740 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(150);
    const g = await page.evaluate(() => {
      const box = (s) => document.querySelector(s).getBoundingClientRect().toJSON();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        picture: box(".z-picture"),
        panel: box(".z-inspector"),
        bar: box(".z-decks"),
        buttons: [...document.querySelectorAll(".z-decks>button")].map((b) =>
          b.getBoundingClientRect().toJSON(),
        ),
      };
    });
    assert.equal(g.overflow, false);
    assert.ok(g.picture.height >= 100);
    assert.ok(g.picture.bottom <= g.panel.top + 1 || g.picture.right <= g.panel.left + 1);
    assert.ok(g.panel.bottom <= g.bar.top + 1);
    for (const b of g.buttons)
      assert.ok(b.left >= -1 && b.right <= size.width + 1, "all seven stages must be visible");
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `artifacts/process-${size.width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => !document.querySelector('button[aria-label="Открыть"]').disabled,
  );
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспортировать кадр", exact: true }).click();
  const download = await downloading;
  assert.equal(await download.failure(), null);
  await download.saveAs("artifacts/process-export.jpg");
  const bytes = fs.readFileSync("artifacts/process-export.jpg");
  assert.equal(bytes[0], 255);
  assert.equal(bytes[1], 216);
  assert.ok(bytes.length > 1000);
  await page.getByRole("button", { name: "Ещё", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Расчёт", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Настройки", exact: true }).click();
  await page.getByRole("slider", { name: "LUT превью", exact: true }).waitFor();
  const labels = page.getByRole("switch", { name: "Подписи вкладок", exact: true });
  await labels.click();
  assert.equal(await page.locator("[data-z-deck-label]").count(), 0);
  await labels.click();
  assert.deepEqual(errors, []);
  console.log(
    `PASS ${checked.size} distinct slider bindings exercised, search, 5 screen sizes, real JPEG export ${bytes.length} bytes; no page errors`,
  );
} finally {
  await browser.close();
}
