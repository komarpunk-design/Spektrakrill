// React UI adaptation of flutter/lib/ui/phone/phone_films.dart (Apache-2.0).
import { useEffect, useRef, useState } from "react";
import { Film, Search, Star } from "lucide-react";
import { useDarkroom } from "@/lib/film/store";
import { stockCategory, stockDetail } from "@/lib/film/stock-details";
import type { Catalog } from "@/lib/film/profiles";
const chips = [
  ["all", "Все"],
  ["negative", "Негатив"],
  ["positive", "Слайд"],
  ["bw", "Ч/Б"],
  ["cine", "Кино"],
  ["favorites", "Избранное"],
  ["negs", "Negs"],
  ["experimental", "Experimental"],
] as const;
export function ZalupaFilmStrip({
  catalog,
  kind = "film",
  query,
  originalUrl,
  processedUrl,
}: {
  catalog: Catalog;
  kind?: "film" | "paper";
  query: string;
  originalUrl?: string | null;
  processedUrl?: string | null;
}) {
  const params = useDarkroom((s) => s.params),
    chooseFilm = useDarkroom((s) => s.applyFilmDefaults),
    setParam = useDarkroom((s) => s.setParam),
    favorites = useDarkroom((s) => s.prefs.favoriteStocks),
    setPref = useDarkroom((s) => s.setPref);
  const [category, setCategory] = useState("all"),
    [local, setLocal] = useState("");
  const strip = useRef<HTMLDivElement>(null);
  const q = (query + " " + local).trim().toLowerCase();
  const selectedId = kind === "paper" ? params.printPaper : params.filmStock;
  const items = kind === "paper" ? catalog.papers : catalog.films;
  const choose = (id: string) => (kind === "paper" ? setParam("printPaper", id) : chooseFilm(id));
  const films = items.filter((f) => {
    const bw = /бел|bw/i.test(stockCategory(f.id)),
      match =
        category === "all" ||
        (category === "favorites" && favorites.includes(f.id)) ||
        (category === "negative" && f.type === "negative" && !bw) ||
        (category === "positive" && f.type === "positive") ||
        (category === "bw" && bw) ||
        (category === "cine" && f.use === "cine") ||
        (category === "negs" && f.negs) ||
        (category === "experimental" && f.experimental);
    return (
      match &&
      (!q ||
        `${f.name} ${f.iso ?? ""} ${stockCategory(f.id)} ${stockDetail(f.id)?.summary ?? ""}`
          .toLowerCase()
          .includes(q))
    );
  });
  useEffect(() => {
    const list = strip.current,
      tile = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (list && tile)
      list.scrollLeft =
        tile.offsetLeft - list.offsetLeft - (list.clientWidth - tile.clientWidth) / 2;
  }, [selectedId, category]);
  const selected = items.find((f) => f.id === selectedId);
  return (
    <section
      className="z-films"
      aria-label={kind === "paper" ? "Каталог бумаги" : "Каталог плёнок"}
    >
      <div className="z-film-search">
        <Search size={15} />
        <input
          aria-label={kind === "paper" ? "Поиск бумаги" : "Поиск плёнки"}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder={kind === "paper" ? "Название бумаги" : "Название, ISO или характер плёнки"}
        />
      </div>
      <div className="z-chips" aria-label={kind === "paper" ? "Коллекция бумаги" : "Тип плёнки"}>
        {chips
          .filter(
            ([id]) => kind !== "paper" || ["all", "favorites", "negs", "experimental"].includes(id),
          )
          .map(([id, title]) => (
            <button
              type="button"
              key={id}
              aria-pressed={category === id}
              onClick={() => setCategory(id)}
            >
              {title}
            </button>
          ))}
      </div>
      <div className="z-film-strip" ref={strip}>
        {category === "all" && !q ? (
          <button
            type="button"
            className="z-film-tile"
            aria-label={kind === "paper" ? "Без бумаги" : "Без плёнки"}
            aria-pressed={selectedId === "none"}
            onClick={() => void choose("none")}
          >
            <span className="z-film-thumb">
              {originalUrl ? <img src={originalUrl} alt="Исходный кадр" /> : <Film size={25} />}
            </span>
            <strong>{kind === "paper" ? "Без бумаги" : "Как снято"}</strong>
            <small>{kind === "paper" ? "Прямой скан" : "Без плёнки"}</small>
          </button>
        ) : null}
        {films.map((f) => (
          <button
            type="button"
            key={f.id}
            className="z-film-tile"
            data-stock-id={f.id}
            aria-label={f.name + (f.experimental ? " · Experimental" : f.negs ? " · Negs" : "")}
            aria-pressed={f.id === selectedId}
            onClick={() => void choose(f.id)}
          >
            <span className="z-film-thumb">
              {originalUrl ? (
                <img
                  loading="lazy"
                  src={f.id === selectedId ? processedUrl || originalUrl : originalUrl}
                  alt={f.id === selectedId ? "Текущий результат" : "Исходный кадр"}
                />
              ) : (
                <Film size={25} />
              )}
              <span>
                {f.iso
                  ? `ISO ${f.iso}`
                  : f.type === "positive"
                    ? "СЛАЙД"
                    : kind === "paper"
                      ? "БУМАГА"
                      : "ПЛЁНКА"}
              </span>
            </span>
            <strong>{f.name}</strong>
            <small>{f.negs ? "Negs" : f.experimental ? "Experimental" : "Spektrafilm"}</small>
          </button>
        ))}
        {!films.length ? (
          <p className="z-empty-result">В этой категории ничего не найдено.</p>
        ) : null}
      </div>
      {selected ? (
        <div className="z-selected-film">
          <div>
            <strong>{selected.name}</strong>
            <small>
              {stockCategory(selected.id)}
              {selected.iso ? ` · ISO ${selected.iso}` : ""}
            </small>
          </div>
          <button
            type="button"
            aria-label={
              (favorites.includes(selected.id) ? "Убрать из избранного: " : "В избранное: ") +
              selected.name
            }
            aria-pressed={favorites.includes(selected.id)}
            onClick={() =>
              setPref(
                "favoriteStocks",
                favorites.includes(selected.id)
                  ? favorites.filter((id) => id !== selected.id)
                  : [...favorites, selected.id],
              )
            }
          >
            <Star size={18} fill={favorites.includes(selected.id) ? "currentColor" : "none"} />
          </button>
          {stockDetail(selected.id)?.summary ? <p>{stockDetail(selected.id)?.summary}</p> : null}
          {selected.creative || selected.approximate || selected.estimatedDevelopment ? (
            <p>
              {selected.creative
                ? "Творческая модель. "
                : selected.approximate
                  ? "Приблизительная модель. "
                  : ""}
              {selected.estimatedDevelopment ? "Время проявки оценено авторами." : ""}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="z-film-note">
          {kind === "paper"
            ? "Выберите бумагу — результат появится на основном кадре."
            : "Выберите плёнку — результат появится на основном кадре."}
        </p>
      )}
    </section>
  );
}
