import { useEffect, useState } from "react";
import { SliderRow, ToggleRow } from "@/components/ui/control";
import { developmentCurve, developmentMode, exposureIndexRatio } from "@/lib/film/development";
import { loadProfile } from "@/lib/film/profiles";
import { useDarkroom } from "@/lib/film/store";
import { isFilmBypass, type FilmProfile } from "@/lib/film/types";

function DensityDiagram({
  profile,
  gamma,
  ev,
}: {
  profile: FilmProfile;
  gamma: number;
  ev: number;
}) {
  const { min, max } = profile.logExposure;
  const top = Math.max(0.1, ...profile.densityCurves.flat());
  const path = (channel: number, g: number, e: number) =>
    developmentCurve(profile, g, e, channel)
      .map(
        ([x, y], i) =>
          `${i ? "L" : "M"}${(24 + ((x - min) / (max - min)) * 256).toFixed(2)},${(144 - (y / top) * 128).toFixed(2)}`,
      )
      .join(" ");
  return (
    <figure className="development-diagram">
      <svg
        viewBox="0 0 304 176"
        role="img"
        aria-label="Кривые плотности негатива: пунктир — нормальная проявка при той же экспозиции"
      >
        <path
          d="M24 16V144H280 M24 80H280 M152 16V144"
          fill="none"
          stroke="currentColor"
          opacity=".16"
        />
        {[0, 1, 2].map((channel) => (
          <path
            key={`base${channel}`}
            d={path(channel, 1, ev)}
            fill="none"
            stroke="currentColor"
            opacity=".4"
            strokeDasharray="4 4"
          />
        ))}
        {["#e09891", "#b9cf83", "#8cb8db"].map((color, channel) => (
          <path
            key={color}
            d={path(channel, gamma, ev)}
            fill="none"
            stroke={color}
            strokeWidth="1.8"
          />
        ))}
        <text x="5" y="14">
          D
        </text>
        <text x="155" y="169" textAnchor="middle">
          log H сцены
        </text>
      </svg>
      <figcaption>
        Пунктир — γ 1 при той же экспозиции. Цветные линии — выбранная проявка.
      </figcaption>
    </figure>
  );
}

export function DevelopmentControls() {
  const params = useDarkroom((s) => s.params),
    setParam = useDarkroom((s) => s.setParam),
    setTool = useDarkroom((s) => s.setTool);
  const [loaded, setLoaded] = useState<FilmProfile | null>(null),
    [error, setError] = useState("");
  const profile = loaded?.id === params.filmStock ? loaded : null;
  useEffect(() => {
    let active = true;
    setError("");
    setLoaded(null);
    if (!isFilmBypass(params.filmStock))
      void loadProfile(params.filmStock)
        .then((value) => {
          if (active) setLoaded(value);
        })
        .catch(() => {
          if (active) setError("Не удалось загрузить профиль плёнки.");
        });
    return () => {
      active = false;
    };
  }, [params.filmStock]);
  const ratio = exposureIndexRatio(params.exposureCompensationEv);
  const mode = developmentMode(params.filmGamma);
  const disabled =
    params.rawEngine !== "spektrafilm" ||
    isFilmBypass(params.filmStock) ||
    !profile ||
    profile.type !== "negative";
  return (
    <section className="development-controls" aria-label="Настройки Push / Pull">
      <header>
        <span className="development-kicker">ПРОЯВКА НЕГАТИВА</span>
        <h2>Push / Pull</h2>
        <p>Экспозиция при съёмке и проявка — два отдельных этапа.</p>
      </header>
      <button type="button" className="development-stock" onClick={() => setTool("film")}>
        <strong>{profile?.name ?? "Выбрать негативную плёнку"}</strong>
        <span>Сменить плёнку →</span>
      </button>
      {disabled ? (
        <p className="lab-note" role="status">
          {error ||
            (params.rawEngine !== "spektrafilm"
              ? "Выберите движок Spektrafilm в Опциях."
              : isFilmBypass(params.filmStock)
                ? "Выберите негативную плёнку в меню «Плёнка»."
                : !profile
                  ? "Загрузка профиля…"
                  : "Эти настройки предназначены для негативной плёнки. Выберите негатив вместо слайда.")}
        </p>
      ) : (
        <>
          <div className="development-state" data-mode={mode}>
            <strong>{mode}</strong>
            <span>
              γ {params.filmGamma.toFixed(2)} · {params.exposureCompensationEv > 0 ? "+" : ""}
              {params.exposureCompensationEv.toFixed(2)} EV
            </span>
          </div>
          <div className="development-section">
            <h3>01 · Экспонирование</h3>
            <SliderRow
              label="Экспозиция при съёмке"
              hint={`${params.exposureCompensationEv > 0 ? "+" : ""}${params.exposureCompensationEv.toFixed(2)} EV`}
              min={Math.min(-6, params.exposureCompensationEv)}
              max={Math.max(6, params.exposureCompensationEv)}
              step={0.1}
              value={params.exposureCompensationEv}
              onChange={(value) => setParam("exposureCompensationEv", value)}
            />
            <div className="development-exposures" aria-label="Ступени экспозиции">
              {[-2, -1, 0, 1, 2].map((ev) => (
                <button
                  key={ev}
                  type="button"
                  aria-pressed={Math.abs(params.exposureCompensationEv - ev) < 0.001}
                  onClick={() => setParam("exposureCompensationEv", ev)}
                >
                  {ev > 0 ? "+" : ""}
                  {ev} EV
                </button>
              ))}
            </div>
            <p className="lab-note">
              {profile.iso
                ? `При номинале ISO ${profile.iso}: индекс экспозиции EI ≈ ${Math.round(profile.iso * ratio)}.`
                : `Индекс экспозиции относительно номинала: ×${ratio.toFixed(2)}.`}{" "}
              Это не прирост чувствительности.
            </p>
          </div>
          <div className="development-section">
            <h3>02 · Проявление</h3>
            <SliderRow
              label="Коэффициент проявки γ"
              hint={params.filmGamma.toFixed(2)}
              min={Math.min(0.5, params.filmGamma)}
              max={Math.max(2, params.filmGamma)}
              step={0.05}
              value={params.filmGamma}
              onChange={(value) => setParam("filmGamma", value)}
            />
            <div className="development-scale">
              <span>Pull · меньше контраст</span>
              <span>Push · больше контраст</span>
            </div>
            <button
              type="button"
              className="lab-ghost"
              disabled={params.filmGamma === 1}
              onClick={() => setParam("filmGamma", 1)}
            >
              Нормальная проявка · γ 1
            </button>
            <p className="lab-note">γ — коэффициент кривой негатива, не количество ступеней EV.</p>
            <details>
              <summary>Кривые плотности</summary>
              <DensityDiagram
                profile={profile}
                gamma={params.filmGamma}
                ev={params.exposureCompensationEv}
              />
            </details>
          </div>
          <div className="development-section">
            <h3>03 · Замер и печать</h3>
            <ToggleRow
              label="Автозамер исходного кадра"
              checked={params.autoExposure}
              onChange={(value) => setParam("autoExposure", value)}
            />
            <p className="lab-note">
              EV — та же поправка, что в меню «Камера».{" "}
              {params.autoExposure
                ? "Сначала движок выполняет автозамер, затем применяет эту поправку."
                : "Поправка применяется к исходному кадру без автозамера."}
            </p>

            <ToggleRow
              label="Автокомпенсация печати"
              checked={params.printExposureCompensation}
              onChange={(value) => setParam("printExposureCompensation", value)}
            />
            <p className="lab-note">
              Компенсация может выровнять общую яркость отпечатка, сохранив различия в тенях и
              контрасте.{" "}
              {params.scanFilm || params.printPaper === "none"
                ? "В режиме сканирования негатива этот переключатель не действует."
                : "Отключите её, чтобы оценить изменение плотности без компенсации печатью."}
            </p>
          </div>
          <details className="development-limit">
            <summary>Как работают Push и Pull</summary>
            <p>
              Для Push: недодержка (EV &lt; 0) и усиленная проявка (γ &gt; 1). Для Pull: передержка
              (EV &gt; 0) и ослабленная проявка (γ &lt; 1). Можно менять проявку и без поправки
              экспозиции.
            </p>
            <p>
              Модель Spektrafilm меняет кривые плотности выбранной плёнки. Универсального пересчёта
              γ в «Push +1» или минуты проявки нет. Зерно рассчитывается штатной моделью движка;
              химия и температура отдельно не моделируются.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
