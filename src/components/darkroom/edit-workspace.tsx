import { useDarkroom } from "@/lib/film/store";
import { useLiveCatalog } from "@/lib/film/profiles";
import { Field, Select, SliderRow, ToggleRow } from "@/components/ui/control";
import { HalationControls } from "./halation-controls";
import { isFilmBypass } from "@/lib/film/types";
export function EditWorkspace({ hasImage, onOpen }: { hasImage: boolean; onOpen?: () => void }) {
  const params = useDarkroom((s) => s.params),
    patch = useDarkroom((s) => s.patch),
    setParam = useDarkroom((s) => s.setParam),
    setTool = useDarkroom((s) => s.setTool),
    catalog = useLiveCatalog();
  const displayMode =
    params.output.mode === "paper" && params.scanFilm ? "negative" : params.output.mode;
  const film = catalog.films.find((f) => f.id === params.filmStock),
    noFilm = isFilmBypass(params.filmStock);
  if (!hasImage)
    return (
      <div className="edit-welcome">
        <span>НАЧНИТЕ С ФОТОГРАФИИ</span>
        <h2>Ваш кадр — ваша плёнка</h2>
        <p>Откройте снимок, выберите материал и настройте его характер. Оригинал остаётся у вас.</p>
        <button type="button" className="lab-btn is-solid" onClick={onOpen}>
          Открыть фото
        </button>
        <ol>
          <li>Откройте JPEG, PNG или RAW.</li>
          <li>Выберите плёнку по названию или описанию.</li>
          <li>Настройте свет и фактуру, затем сохраните.</li>
        </ol>
      </div>
    );
  if (params.experimental.workflow !== "normal")
    return (
      <div className="edit-welcome">
        <span>СКАН НАСТОЯЩЕГО НЕГАТИВА</span>
        <h2>Конвертация негатива</h2>
        <p>
          Сейчас включён отдельный процесс для скана или пересъёмки негативной плёнки. Его
          экспозиция, маска и калибровка задаются в одном инструменте.
        </p>
        <button type="button" className="lab-btn is-solid" onClick={() => setTool("negative")}>
          Настроить скан негатива
        </button>
        <button
          type="button"
          className="edit-return-photo"
          onClick={() => setParam("experimental", { ...params.experimental, workflow: "normal" })}
        >
          Вернуться к обычной фотографии
        </button>
      </div>
    );
  return (
    <div className="edit-workspace">
      <header className="edit-heading">
        <span>ОСНОВНОЕ</span>
        <h2>Обработка фотографии</h2>
        <p>Начните со света. Плёнка задаёт характер, гало — свечение у ярких объектов.</p>
      </header>
      <section className="edit-block">
        <div className="edit-block-heading">
          <h3>Плёнка</h3>
          <button onClick={() => setTool("film")} type="button">
            Выбрать →
          </button>
        </div>
        <p className="edit-current-film">{film?.name ?? "Без плёнки · цифровой исходник"}</p>
        {noFilm ? (
          <p className="edit-caption">Выберите материал, чтобы включить плёночную обработку.</p>
        ) : null}
      </section>
      <section className="edit-block">
        <div className="edit-block-heading">
          <h3>Свет и цвет</h3>
          <button type="button" onClick={() => setTool("prep")}>
            Точная коррекция →
          </button>
        </div>
        <SliderRow
          label="Экспозиция кадра"
          hint={params.prep.exposure.toFixed(2) + " EV"}
          min={-3}
          max={3}
          step={0.05}
          value={params.prep.exposure}
          onChange={(v) => setParam("prep", { ...params.prep, exposure: v })}
        />
        <div className="px-4 py-2">
          <Field label="Освещение">
            <Select
              ariaLabel="Освещение"
              value={params.whiteBalance}
              onChange={(v) => setParam("whiteBalance", v as typeof params.whiteBalance)}
              options={[
                { value: "as_shot", label: "Как снято" },
                { value: "daylight", label: "Дневной свет" },
                { value: "tungsten", label: "Лампы накаливания" },
                { value: "custom", label: "Своя температура" },
              ]}
            />
          </Field>
        </div>
        {params.whiteBalance === "custom" ? (
          <SliderRow
            label="Температура света"
            hint={params.temperature + " K"}
            min={2000}
            max={12000}
            step={100}
            value={params.temperature}
            onChange={(v) => setParam("temperature", v)}
          />
        ) : null}
      </section>
      {!noFilm ? (
        <>
          <section className="edit-block">
            <div className="edit-block-heading">
              <h3>Зерно и свечение</h3>
              <button type="button" onClick={() => setTool("texture")}>
                Все параметры →
              </button>
            </div>
            <ToggleRow
              label="Плёночное зерно"
              hint="Текстура эмульсии. Отключите для более чистого изображения."
              checked={params.grainActive}
              onChange={(v) => setParam("grainActive", v)}
            />
            <HalationControls />
          </section>
          <section className="edit-block">
            <div className="edit-block-heading">
              <h3>Готовый вид</h3>
              <button type="button" onClick={() => setTool("outputs")}>
                Плотность и цвет →
              </button>
            </div>
            <div className="px-4 py-2">
              <Field label="Получение изображения">
                <Select
                  ariaLabel="Получение изображения"
                  value={displayMode}
                  onChange={(v) =>
                    patch({
                      output: { ...params.output, mode: v as typeof params.output.mode },
                      scanFilm: false,
                    })
                  }
                  options={[
                    { value: "paper", label: "Печать на фотобумаге" },
                    { value: "digital", label: "Нейтральный цифровой позитив" },
                    { value: "auto-levels", label: "Автоматический позитив" },
                    { value: "lab-scan", label: "Lab Scan · минилаб" },
                    { value: "negative", label: "Негатив на просвет" },
                  ]}
                />
              </Field>
            </div>
            {displayMode === "paper" ? (
              <div className="px-4 py-2">
                <Field label="Фотобумага">
                  <Select
                    ariaLabel="Фотобумага"
                    value={params.printPaper}
                    onChange={(v) => setParam("printPaper", v)}
                    options={catalog.papers.map((p) => ({ value: p.id, label: p.name }))}
                  />
                </Field>
              </div>
            ) : (
              <p className="edit-caption">
                {params.output.mode === "lab-scan"
                  ? "Позитив с характером минилаба: глубокий чёрный и прохладные тени."
                  : "Бумага не используется. Выбранная плёнка определяет цвет и тон."}
              </p>
            )}
          </section>
        </>
      ) : null}
      <div className="edit-next">
        <button className="lab-btn is-solid" type="button" onClick={() => setTool("export")}>
          Сохранить фотографию →
        </button>
        <p>Обрезка, рамки, Push / Pull и другие функции доступны в «Инструментах».</p>
      </div>
    </div>
  );
}
