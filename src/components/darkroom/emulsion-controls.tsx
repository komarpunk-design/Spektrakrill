import {ControlSection} from "@/components/darkroom/workflow-ui";
import { isNativeRawAvailable, nativeCalibrateNegative } from "@/lib/film/native-raw";
import { useEffect, useState } from "react";
import { Field, Select, SliderRow, ToggleRow } from "@/components/ui/control";
import { useDarkroom } from "@/lib/film/store";
import { loadProfile } from "@/lib/film/profiles";
import scanIlluminants from "@/lib/film/experimental-illuminants.json";
import experimentalFamilies from "@/lib/film/experimental-families.json";
import negsFamilies from "@/lib/film/negs-families.json";
const families=[...experimentalFamilies,...negsFamilies];
import type { FilmProfile } from "@/lib/film/types";
import type { ExperimentalParams } from "@/lib/film/experimental";
import {
  defaultExperimental,
  experimentalGrainPreset,
  experimentalCouplersPreset,
} from "@/lib/film/experimental";

export function EmulsionControls({mode="advanced"}:{mode?:"advanced"|"negative"|"chemistry"|"grain"|"dir"|"paper"}) {
  const params = useDarkroom((s) => s.params),
    setParam = useDarkroom((s) => s.setParam),
    setTool = useDarkroom((s) => s.setTool),
    patch = useDarkroom((s) => s.patch);
  const e = params.experimental ?? defaultExperimental();
  const [loaded, setLoaded] = useState<FilmProfile | null>(null);
  useEffect(() => {
    let active = true;
    setLoaded(null);
    void loadProfile(params.filmStock)
      .then((p) => {
        if (active) setLoaded(p);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [params.filmStock]);
  const profile = loaded?.id === params.filmStock ? loaded : null;
  const change = <K extends keyof ExperimentalParams>(key: K, value: ExperimentalParams[K]) =>
    setParam("experimental", { ...e, [key]: value });
  const slider = (
    key: keyof ExperimentalParams,
    label: string,
    min = 0.2,
    max = 2,
    step = 0.05,
  ) => (
    <SliderRow
      key={key}
      label={label}
      hint={Number(e[key]).toFixed(2)}
      min={min}
      max={max}
      step={step}
      value={Number(e[key])}
      onChange={(v) => change(key, v)}
    />
  );
  const [calibrating, setCalibrating] = useState(false),
    [calibrationNote, setCalibrationNote] = useState("");
  const calibrate = async (base: boolean) => {
    if (calibrating) return;
    const snapshot = useDarkroom.getState();
    setCalibrating(true);
    setCalibrationNote(base ? "Определение маски…" : "Подбор матрицы сканера…");
    try {
      const result = await nativeCalibrateNegative(
        params as unknown as Record<string, unknown>,
        base,
      );
      const current = useDarkroom.getState();
      if (
        current.fileName !== snapshot.fileName ||
        current.source !== snapshot.source ||
        current.params !== snapshot.params
      ) {
        setCalibrationNote("Кадр или настройки изменились. Повторите калибровку.");
        return;
      }
      if (base && result.base?.length === 3 && typeof result.exposure === "number")
        patch({
          experimental: {
            ...e,
            filmBaseActive: true,
            filmBaseCyan: result.base[0],
            filmBaseMagenta: result.base[1],
            filmBaseYellow: result.base[2],
            scanExposure: result.exposure,
          },
        });
      else if (result.matrix?.length === 9)
        patch({
          experimental: { ...e, scanCalibration: result.matrix.map((v) => v.toFixed(5)).join(" ") },
        });
      else throw new Error("Не удалось подобрать параметры скана");
      setCalibrationNote("Применено. Результат можно отменить.");
    } catch (error) {
      setCalibrationNote(error instanceof Error ? error.message : String(error));
    } finally {
      setCalibrating(false);
    }
  };

  const family = families.find((f) => f.members.some((m) => m.id === params.filmStock));
  const paperFamily = families.find((f) => f.members.some((m) => m.id === params.printPaper));
  return (<section className="emulsion-controls" aria-label="Материал и спектральные настройки">
    {params.rawEngine!=="spektrafilm"?<p className="lab-note">Для этих инструментов выберите движок Spektrafilm в настройках приложения.</p>:null}
{mode==="negative"?<div className="development-section">
        <h3>Обработка скана негатива</h3>
        <p className="lab-note">Здесь нужен скан или пересъёмка настоящего негатива. Для обычного кадра используйте выбор плёнки.</p><Field label="Источник изображения">
          <Select
            ariaLabel="Источник изображения"
            disabled={!isNativeRawAvailable() && e.workflow==="normal"}
            value={e.workflow}
            onChange={(v) => change("workflow", v)}
            options={[
              { value: "normal", label: "Обычная фотография · эмуляция плёнки" },
              { value: "negative-print", label: "Скан негатива → отпечаток" },
              { value: "negative-scan", label: "Скан негатива → плотности → скан" },
              { value: "negative-clear", label: "Скан негатива → без маски основы" },
            ]}
          />
        </Field>
        {e.workflow !== "normal" ? (
          <>
            <p className="lab-note">
              Загрузите скан или пересъёмку цветного негатива и выберите соответствующую плёнку.
              Позитив получается через печать на бумаге; снятие маски оставляет негатив.
              Автоэкспозиция, зерно и съёмочные эффекты при восстановлении плотностей не
              применяются. Точный расчёт может занять время.
            </p>
            {profile?.monochrome || profile?.type === "positive" || params.filmStock === "none" ? (
              <p role="alert" className="lab-note">
                Нужен профиль цветной негативной плёнки.
              </p>
            ) : null}
            <Field label="Свет сканера / пересъёмки">
              <Select
                ariaLabel="Свет сканера"
                value={e.scanIlluminant}
                onChange={(v) => change("scanIlluminant", v)}
                options={scanIlluminants.map((value) => ({ value, label: value }))}
              />
            </Field>
            <ToggleRow
              label="Ускорять предпросмотр скана"
              checked={e.scanUseLut}
              onChange={(v) => change("scanUseLut", v)}
            />
            {slider("scanExposure", "Экспозиция скана · EV", -12, 12, 0.1)}
            {slider("scanBasePercentile", "Порог определения маски · %", 90, 100, 0.1)}
            <button
              type="button"
              className="lab-ghost"
              disabled={calibrating}
              onClick={() => void calibrate(true)}
            >
              Определить маску негатива
            </button>
            <button
              type="button"
              className="lab-ghost"
              disabled={calibrating}
              onClick={() => void calibrate(false)}
            >
              Подобрать матрицу сканера
            </button>
            <p className="lab-note">
              Маска определяется по самым светлым участкам — оставьте в скане незасвеченный край
              плёнки. Подбор матрицы экспериментальный и лучше работает на кадрах с разнообразными
              цветами.
            </p>
            {calibrationNote ? (
              <p role="status" className="lab-note">
                {calibrationNote}
              </p>
            ) : null}
            <ControlSection title="Матрица сканера" description="Ручная коррекция цветового отклика устройства. Обычно достаточно автоматического подбора."><Field label="Матрица устройства · 9 чисел">
              <input
                aria-label="Матрица устройства"
                className="lab-input"
                value={e.scanCalibration}
                onChange={(ev) => change("scanCalibration", ev.target.value)}
              />
            </Field>
            <p className="lab-note">
              RGB × матрица. При неверной записи используется единичная матрица. Маску настраивайте
              ниже в «Основа плёнки».
            </p>
            </ControlSection><button type="button" className="lab-ghost" onClick={() => setTool("print")}>
              Выбрать фотобумагу →
            </button>
          </>
        ) : null}
      </div>:null}
{mode==="advanced"?<><ControlSection title="Цветной фильтр перед объективом" description="Меняет проходящий через объектив свет, особенно заметно на чёрно-белой плёнке." defaultOpen><div className="development-section">
        <h3>Цветной съёмочный фильтр</h3>
        <Field label="Фильтр перед объективом">
          <Select
            value={e.colorFilter}
            onChange={(v) => change("colorFilter", v)}
            options={[
              { value: "none", label: "Без фильтра" },
              { value: "hoya_x0", label: "Hoya X0 · жёлто-зелёный" },
              { value: "hoya_x1", label: "Hoya X1 · зелёный" },
              { value: "hoya_y2", label: "Hoya Y2 · жёлтый" },
              { value: "hoya_ya3", label: "Hoya YA3 · насыщенный жёлтый" },
              { value: "hoya_r1", label: "Hoya R1 · красный" },
            ]}
          />
        </Field>
        <p className="lab-note">
          Пропускание фильтра применяется к спектральной чувствительности плёнки до проявки. Без
          выбранной плёнки фильтр не действует.
        </p>
      </div></ControlSection><ControlSection title="Восстановление спектра" description="Выбор способа расчёта света из RGB. По умолчанию достаточно «Авто»." keys={["experimental.spectralMethod"]}><div className="development-section">
        <h3>Восстановление спектра</h3>
        <Field label="Метод спектральной реконструкции">
          <Select
            ariaLabel="Метод спектральной реконструкции"
            disabled={!isNativeRawAvailable()}
            value={e.spectralMethod}
            onChange={(v) => change("spectralMethod", v)}
            options={[
              { value: "legacy", label: "Авто · профиль / прежние настройки" },
              { value: "hanatos2025", label: "Hanatos 2025 · experimental" },
              { value: "mallett2019", label: "Mallett & Yuksel 2019" },
              { value: "otsu2018", label: "Otsu 2018" },
              { value: "jakob2019", label: "Jakob & Hanika 2019" },
              { value: "arctic2026beta04", label: "Arctic 2026 beta04" },
              { value: "gauss-lasers", label: "Gauss lasers" },
            ]}
          />
        </Field>
        <p className="lab-note">
          Полный спектральный расчёт выполняется в Android APK. В браузере доступен сокращённый
          RGB-предпросмотр. У профилей experimental режим «Авто» использует Hanatos этой ветки.
        </p>
      </div></ControlSection></>:null}
{mode==="chemistry"?<ControlSection title="Химия и время проявки" description="Измеренные времена и отдельные коэффициенты чувствительных слоёв." keys={["experimental.filmChemistry","experimental.filmFast","experimental.filmSlow","experimental.filmExhaustion"]}><div className="development-section">
        <h3>Проявление негатива</h3>
        <button type="button" className="development-stock" onClick={() => setTool("film")}>
          <strong>{profile?.name ?? "Выбрать плёнку"}</strong>
          <span>Каталог плёнок →</span>
        </button>
        {family ? (
          <Field label="Время проявки из профиля">
            <Select
              value={params.filmStock}
              onChange={(id) => setParam("filmStock", id)}
              options={family.members.map((m) => ({ value: m.id, label: `${m.minutes} мин${"estimated" in m&&m.estimated?" · оценка":""}` }))}
            />
          </Field>
        ) : (
          <p className="lab-note">
            Время доступно у серий Double‑X, 2302 и чёрно-белых профилей Negs. Оценённые авторами времена отмечены отдельно.
          </p>
        )}
        <ToggleRow
          label="Химия плёнки по слоям"
          checked={e.filmChemistry}
          onChange={(v) => {
            if (!v || profile?.densityModel) change("filmChemistry", v);
          }}
        />
        {!profile?.densityModel ? (
          <p className="lab-note">
            Для этой функции выберите плёнку с параметрической моделью слоёв.
          </p>
        ) : null}
        {e.filmChemistry ? (
          <>
            <SliderRow
              label="Общая проявка γ"
              hint={params.filmGamma.toFixed(2)}
              min={0.5}
              max={2}
              step={0.05}
              value={params.filmGamma}
              onChange={(v) => setParam("filmGamma", v)}
            />
            {slider("filmFast", "Быстрые слои γ")}
            {slider("filmSlow", "Средние и медленные слои γ")}
            {slider("filmRed", profile?.monochrome ? "Канал эмульсии γ" : "Красный канал γ")}
            {!profile?.monochrome ? (
              <>
                {slider("filmGreen", "Зелёный канал γ")}
                {slider("filmBlue", "Синий канал γ")}
              </>
            ) : null}
            {slider("filmExhaustion", "Истощение проявителя", 0, 1)}
            <p className="lab-note">
              Кривые и подслои пересчитываются вместе. Истощение меняет форму, сохраняя плотность
              при log H = 0. Это модель кривых experimental; коэффициенты не калиброваны в EV.
            </p>
          </>
        ) : null}
      </div></ControlSection>:null}
{mode==="dir"?<ControlSection title="Нелинейное взаимодействие · Langmuir" description="Насыщение ингибиторов и длинный хвост их распространения в эмульсии." keys={["experimental.dirLangmuir","experimental.dirDonorRed","experimental.dirTailUm"]}><div className="development-section">
        <h3>DIR · насыщение ингибиторов</h3>
        {profile ? (
          <button
            type="button"
            className="lab-ghost"
            onClick={() => patch(experimentalCouplersPreset(profile, params))}
          >
            {profile.negs?"Взять DIR из профиля Negs":"Взять DIR из профиля experimental"}
          </button>
        ) : null}

        <ToggleRow
          label="Нелинейная модель Langmuir"
          checked={e.dirLangmuir}
          onChange={(v) => change("dirLangmuir", v)}
        />
        {e.dirLangmuir ? (
          <>
            {profile?.type === "positive" ? (
              <>
                {slider("dirReceiverRed", "Насыщение приёмника R", 0.05, 10)}
                {!profile?.monochrome ? (
                  <>
                    {slider("dirReceiverGreen", "Насыщение приёмника G", 0.05, 10)}
                    {slider("dirReceiverBlue", "Насыщение приёмника B", 0.05, 10)}
                  </>
                ) : null}
              </>
            ) : (
              <>
                {slider("dirDonorRed", "Насыщение донора R", 0.05, 10)}
                {!profile?.monochrome ? (
                  <>
                    {slider("dirDonorGreen", "Насыщение донора G", 0.05, 10)}
                    {slider("dirDonorBlue", "Насыщение донора B", 0.05, 10)}
                  </>
                ) : null}
              </>
            )}
            {slider("dirTailUm", "Хвост диффузии, мкм", 0, 1000, 10)}
            {slider("dirTailWeight", "Доля хвоста диффузии", 0, 1, 0.01)}
            <p className="lab-note">
              В негативе насыщается выделение ингибитора донором; в слайде — реакция принимающего
              слоя после диффузии. Включите DIR-каплеры в меню «Плёнка».
            </p>
          </>
        ) : null}
      </div></ControlSection>:null}
{mode==="grain"?<ControlSection title="Модель зерна · RMS" description="Штатное зерно Negs и experimental задаётся гранулярностью; ручной размер частицы используется при выключенном RMS." keys={["experimental.grainRms","experimental.grainRmsRed","experimental.grainUsmAmount"]}><div className="development-section">
        <h3>Зерно · модель RMS</h3>
        <ToggleRow
          label="Зернистость по RMS"
          checked={e.grainRms}
          onChange={(v) => change("grainRms", v)}
        />
        {profile ? (
          <button
            type="button"
            className="lab-ghost"
            onClick={() => patch(experimentalGrainPreset(profile, params))}
          >
            {profile.negs?"Взять зерно из профиля Negs":"Взять зерно из профиля experimental"}
          </button>
        ) : null}
        {e.grainRms ? (
          <>
            {slider(
              "grainRmsRed",
              profile?.monochrome ? "RMS эмульсии" : "RMS красного канала",
              0.1,
              60,
              0.1,
            )}
            {!profile?.monochrome ? (
              <>
                {slider("grainRmsGreen", "RMS зелёного канала", 0.1, 60, 0.1)}
                {slider("grainRmsBlue", "RMS синего канала", 0.1, 60, 0.1)}
              </>
            ) : null}
            {slider("grainUniformityRed", "Равномерность R", 0, 1, 0.01)}
            {!profile?.monochrome ? (
              <>
                {slider("grainUniformityGreen", "Равномерность G", 0, 1, 0.01)}
                {slider("grainUniformityBlue", "Равномерность B", 0, 1, 0.01)}
              </>
            ) : null}
            {slider("grainFloorRed", "Минимальная плотность R", 0, 0.5, 0.01)}
            {!profile?.monochrome ? (
              <>
                {slider("grainFloorGreen", "Минимальная плотность G", 0, 0.5, 0.01)}
                {slider("grainFloorBlue", "Минимальная плотность B", 0, 0.5, 0.01)}
              </>
            ) : null}
            {slider("grainScaleFast", "Размер частиц · слой 1", 0.05, 3)}
            {slider("grainScaleMid", "Размер частиц · слой 2", 0.05, 3)}
            {slider("grainScaleSlow", "Размер частиц · слой 3", 0.05, 3)}
            {slider("grainUsmSigma", "Радиус резкости плотности", 0, 3, 0.1)}
            {slider("grainUsmAmount", "Усиление резкости плотности", 0, 4, 0.1)}
            <p className="lab-note">
              RMS измеряется для апертуры 48 мкм. Размер частиц рассчитывается по пику дисперсии
              подслоёв. Резкость плотности сохраняет суммарную плотность каждого канала.
            </p>
          </>
        ) : null}
      </div></ControlSection>:null}
{mode==="paper"?<>      {paperFamily ? (
        <div className="development-section">
          <Field label="Время проявки печатной плёнки">
            <Select
              value={params.printPaper}
              onChange={(id) => setParam("printPaper", id)}
              options={paperFamily.members.map((m) => ({ value: m.id, label: `${m.minutes} мин${"estimated" in m&&m.estimated?" · оценка":""}` }))}
            />
          </Field>
        </div>
      ) : null}
</>:null}
{["advanced","negative","paper"].includes(mode)?<ControlSection title={mode==="paper"?"Основа бумаги":"Основа и маска плёнки"} description={mode==="paper"?"Плотность и оттенок подложки фотобумаги.":"Цвет и плотность подложки. Для негативов это настройка оранжевой маски."} keys={[mode==="paper"?"experimental.printBaseActive":"experimental.filmBaseActive"]}>      {(mode==="paper"?["print"] as const:["film"] as const).map((kind) => {
        const prefix = kind === "film" ? "filmBase" : "printBase";
        const active = (prefix + "Active") as keyof ExperimentalParams;
        return (
          <div key={kind} className="development-section">
            <h3>{kind === "film" ? "Основа плёнки и маска" : "Основа фотобумаги"}</h3>
            <ToggleRow
              label={kind === "film" ? "Настройка основы плёнки" : "Настройка основы бумаги"}
              checked={Boolean(e[active])}
              onChange={(v) => change(active, v)}
            />
            {e[active] ? (
              <>
                {slider(
                  (prefix + "Scale") as keyof ExperimentalParams,
                  "Общая плотность основы",
                  0,
                  3,
                )}
                {slider((prefix + "Cyan") as keyof ExperimentalParams, "Циан основы", 0, 3)}
                {slider((prefix + "Magenta") as keyof ExperimentalParams, "Маджента основы", 0, 3)}
                {slider((prefix + "Yellow") as keyof ExperimentalParams, "Жёлтый основы", 0, 3)}
                {kind === "film" ? slider("filmBaseTilt", "Спектральный наклон", -1, 1) : null}
              </>
            ) : null}
          </div>
        );
      })}
</ControlSection>:null}
</section>);
}
