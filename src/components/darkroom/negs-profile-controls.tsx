import { useEffect, useState } from "react";
import { useDarkroom } from "@/lib/film/store";
import { loadProfile } from "@/lib/film/profiles";
import { experimentalGrainPreset, experimentalCouplersPreset } from "@/lib/film/experimental";
import type { FilmProfile } from "@/lib/film/types";

/** Negs supplies stock-specific values; the common model's manual controls belong to Experimental. */
export function NegsProfileControls() {
  const params = useDarkroom((s) => s.params),
    patch = useDarkroom((s) => s.patch),
    setTool = useDarkroom((s) => s.setTool);
  const [profile, setProfile] = useState<FilmProfile | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setProfile(null);
    setError("");
    if (params.filmStock === "none") return;
    void loadProfile(params.filmStock)
      .then((p) => {
        if (active) setProfile(p);
      })
      .catch(() => {
        if (active) setError("Не удалось загрузить профиль. Выберите материал заново.");
      });
    return () => {
      active = false;
    };
  }, [params.filmStock]);
  const ready = profile?.id === params.filmStock && profile.negs;
  return (
    <section className="source-controls negs-profile-controls" data-source="negs">
      <h3>Параметры выбранной плёнки Negs</h3>
      <p className="lab-note">
        Выбор плёнки Negs в общем каталоге уже применяет её исходные настройки зерна и DIR. Здесь
        можно вернуть их после ручных изменений.
      </p>
      <button type="button" className="source-link" onClick={() => setTool("film")}>
        {ready ? profile.name : "Выбрать плёнку Negs"} · общий каталог →
      </button>
      {!ready ? (
        <p className="lab-note">
          {error ||
            "Эти действия доступны для плёнок из коллекции Negs. Они не меняют материал на другую плёнку."}
        </p>
      ) : null}
      <button
        type="button"
        className="source-link"
        disabled={!ready}
        onClick={() => {
          if (ready && useDarkroom.getState().params.filmStock === profile.id)
            patch(experimentalGrainPreset(profile, params));
        }}
      >
        Вернуть зерно из профиля Negs
      </button>
      <button
        type="button"
        className="source-link"
        disabled={!ready}
        onClick={() => {
          if (ready && useDarkroom.getState().params.filmStock === profile.id)
            patch(experimentalCouplersPreset(profile, params));
        }}
      >
        Вернуть DIR из профиля Negs
      </button>
      <p className="lab-note">
        Ручная настройка общей модели: Experimental → RMS-зерно / Langmuir DIR. Восстановление
        параметров можно отменить кнопкой Undo.
      </p>
    </section>
  );
}
