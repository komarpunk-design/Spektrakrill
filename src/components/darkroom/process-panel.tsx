import { type ComponentProps } from "react";
import { ControlScope, Field, Select, ToggleRow } from "@/components/ui/control";
import { useDarkroom, type ToolId } from "@/lib/film/store";
import { NEGS_FILM_FORMATS } from "@/lib/film/negs-film-formats";
import { isNativeRawAvailable } from "@/lib/film/native-raw";
import { Panel } from "./panel";
import { EmulsionControls } from "./emulsion-controls";
import { TextureControls } from "./texture-controls";
import { HalationControls } from "./halation-controls";
import { OutputControls } from "./output-controls";
import { NegsProfileControls } from "./negs-profile-controls";
import { zBypassReason } from "./zalupa-navigation";

/** Compose existing parameter controls around the photographic task, not their donor. */
export function ProcessPanel(props: ComponentProps<typeof Panel> & {onNavigate?:(id:string)=>void}) {
  const p = useDarkroom((s) => s.params),
    patch = useDarkroom((s) => s.patch),
    setParam = useDarkroom((s) => s.setParam),
    prefs = useDarkroom((s) => s.prefs),
    setPref = useDarkroom((s) => s.setPref),
    setTool = useDarkroom((s) => s.setTool);
  const id = props.workspacePage ?? "films";
  const legacy = (tool: ToolId, page: string, embeddedModel = false) => (
    <Panel {...props} toolOverride={tool} workspacePage={page} embeddedModel={embeddedModel} />
  );
  const bypass = zBypassReason(p, id);
  const effect = id === "grain" || id === "halation" || id === "dir";
  const active =
    id === "grain" ? p.grainActive : id === "halation" ? p.halationActive : p.couplersActive;
  const model =
    id === "grain"
      ? p.experimental.grainRms
        ? "rms"
        : "classic"
      : id === "halation"
        ? p.transport.model
        : p.experimental.dirLangmuir
          ? "langmuir"
          : "classic";
  const changeModel = (value: string) => {
    if (id === "halation")
      setParam("transport", { ...p.transport, model: value as "legacy" | "layered" });
    else
      setParam("experimental", {
        ...p.experimental,
        [id === "grain" ? "grainRms" : "dirLangmuir"]: value !== "classic",
      });
  };
  let content;
  if (effect)
    content = (
      <>
        <ToggleRow
          label={id === "grain" ? "Зерно" : id === "halation" ? "Галяция" : "DIR-каплеры"}
          checked={active}
          onChange={(value) =>
            id === "grain"
              ? setParam("grainActive", value)
              : id === "halation"
                ? setParam("halationActive", value)
                : setParam("couplersActive", value)
          }
        />
        <div className="process-model">
          <Field
            label={
              id === "grain" ? "Модель зерна" : id === "halation" ? "Модель галяции" : "Модель DIR"
            }
          >
            <Select
              value={model}
              onChange={changeModel}
              options={
                id === "grain"
                  ? [
                      { value: "classic", label: "Spektrafilm · размер частиц" },
                      { value: "rms", label: "RMS · гранулярность эмульсии" },
                    ]
                  : id === "halation"
                    ? [
                        { value: "legacy", label: "Spektrafilm · рассеяние" },
                        { value: "layered", label: "Layered Transport · слои плёнки" },
                      ]
                    : [
                        { value: "classic", label: "Классическая · линейная" },
                        { value: "langmuir", label: "Langmuir · насыщение и диффузия" },
                      ]
              }
            />
          </Field>
        </div>
        {!active ? (
          <p className="process-note">
            Эффект выключен. Модель и её настройки сохраняются; включите эффект, чтобы применить их
            к фотографии.
          </p>
        ) : null}
        <ControlScope
          tool={id === "grain" || id === "dir" ? "negs" : "fotufilm"}
          disabled={!active || !!bypass}
        >
          <fieldset disabled={!active || !!bypass} className="process-fields">
            {id === "grain" ? (
              model === "rms" ? (
                <>
                  <EmulsionControls mode="grain" modelSelected />
                  <TextureControls scope="grain" />
                </>
              ) : (
                legacy("film", "grain", true)
              )
            ) : id === "halation" ? (
              model === "layered" ? (
                <HalationControls sourceOnly embeddedModel />
              ) : (
                legacy("film", "halation", true)
              )
            ) : model === "langmuir" ? (
              <>
                <TextureControls scope="dir" />
                <EmulsionControls mode="dir" modelSelected />
              </>
            ) : (
              legacy("film", "emulsion-dir", true)
            )}
          </fieldset>
        </ControlScope>
        <p className="process-note">
          Смена модели сохраняет значения другой модели. Сброс инструмента возвращает обе модели и
          общие параметры к исходным значениям; его можно отменить.
        </p>
      </>
    );
  else if (id === "format")
    content = (
      <>
        <div className="process-model">
          <Field label="Готовый формат кадра">
            <Select
              value={String(p.filmFormatMm)}
              onChange={(value) => setParam("filmFormatMm", Number(value))}
              options={[
                ...(!NEGS_FILM_FORMATS.some((f) => f.mm === p.filmFormatMm)
                  ? [{ value: String(p.filmFormatMm), label: `Свой · ${p.filmFormatMm} мм` }]
                  : []),
                ...NEGS_FILM_FORMATS.map((f) => ({ value: String(f.mm), label: f.label })),
              ]}
            />
          </Field>
        </div>
        {legacy("camera", "format")}
      </>
    );
  else if (id === "spectrum")
    content = (
      <>
        <EmulsionControls mode="spectrum" />
        {legacy("lab", "spectral-calc")}
      </>
    );
  else if (id === "taking-filter") content = <EmulsionControls mode="filter" />;
  else if (id === "film-base") content = <EmulsionControls mode="base" />;
  else if (id === "chemistry")
    content = (
      <>
        {p.experimental.workflow !== "normal" ? (
          <p className="process-note">
            При конвертации негатива это настройка профиля исходной плёнки: послойная химия меняет
            кривые, используемые для восстановления плотностей. Она не добавляет новую проявку
            поверх скана.
          </p>
        ) : null}
        <EmulsionControls mode="chemistry" />
      </>
    );
  else if (id === "profile") content = <NegsProfileControls />;
  else if (id === "paper" && bypass)
    content = (
      <p className="process-note">
        Настройки фотобумаги сохранены. Включите печатный вывод, чтобы продолжить работу с ними.
      </p>
    );
  else if (id === "paper-base") content = <EmulsionControls mode="paper" />;
  else if (id === "output") content = <OutputControls embedded />;
  else if (id === "test-print")
    content = (
      <section className="process-model">
        <h3>Виртуальный увеличитель</h3>
        <p className="process-note">
          Пять пробных выдержек печати рядом. Выберите подходящую и примените её к кадру.
          Экспериментальная функция.
        </p>
        <ToggleRow
          label="Виртуальный увеличитель"
          checked={prefs.experimentalEnlarger}
          onChange={(value) => setPref("experimentalEnlarger", value)}
        />
        <button
          type="button"
          className="lab-btn is-solid"
          disabled={!props.hasImage || !!bypass}
          onClick={() => {
            setPref("experimentalEnlarger", true);
            props.onOpenEnlarger?.();
          }}
        >
          Открыть пробную печать
        </button>
      </section>
    );
  else if (id === "negative")
    content = (
      <>
        {!isNativeRawAvailable() ? (
          <p className="process-note" role="status">
            Калибровка и конвертация настоящего негатива выполняются в Android APK. В браузере можно
            изучить интерфейс, но включение этого маршрута недоступно.
          </p>
        ) : null}
        <button type="button" className="lab-ghost" onClick={()=>props.onNavigate?.("films")}>Выбрать плёнку исходного негатива →</button>
        <EmulsionControls mode="negative" />
      </>
    );
  else
    content = legacy(
      ({ prep: "prep", develop: "development" } as Record<string, ToolId>)[id] ??
        props.toolOverride ??
        useDarkroom.getState().tool,
      id,
    );
  return (
    <div className="process-tool" data-process-tool={id}>
      {bypass ? (
        <div className="process-bypass" role="status">
          <strong>Этот этап сейчас обходится</strong>
          <p>{bypass}</p>
          {p.experimental.workflow !== "normal" ? (
            <button
              type="button"
              onClick={() => setParam("experimental", { ...p.experimental, workflow: "normal" })}
            >
              Вернуться к эмуляции плёнки
            </button>
          ) : p.rawEngine !== "spektrafilm" ? (
            <button type="button" onClick={() => setParam("rawEngine", "spektrafilm")}>
              Использовать Spektrafilm
            </button>
          ) : p.filmStock === "none" ? (
            <button type="button" onClick={() => props.onNavigate?props.onNavigate("films"):setTool("film")}>
              Выбрать плёнку
            </button>
          ) : (
            <button
              type="button"
              onClick={() => patch({ output: { ...p.output, mode: "paper" }, scanFilm: false })}
            >
              Использовать фотобумагу
            </button>
          )}
        </div>
      ) : null}
      {!effect && bypass && !["paper", "paper-base", "test-print"].includes(id) ? (
        <ControlScope disabled>
          <fieldset disabled className="process-fields">
            {content}
          </fieldset>
        </ControlScope>
      ) : (
        content
      )}
    </div>
  );
}
