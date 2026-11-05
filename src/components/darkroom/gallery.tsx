import {
  listNativeGallery,
  listPhoneLibrary,
  loadNativeGalleryJpeg,
  requestPhoneLibrary,
  isNativeRawAvailable,
  type PhoneShot,
} from "@/lib/film/native-raw";
import { loadLocalGallery, type GalleryShot } from "@/lib/film/gallery";
import { Images } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

function merge(native: GalleryShot[], local: GalleryShot[]): GalleryShot[] {
  const seen = new Set<string>();
  const out: GalleryShot[] = [];
  for (const s of [...native, ...local]) {
    const k = s.uri || s.id;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.sort((a, b) => b.at - a.at);
}

export function GalleryPane({
  tick = 0,
  onOpenFile,
  onOpenPhone,
}: {
  tick?: number;
  onOpenFile?: () => void;
  onOpenPhone?: (uri: string, name: string, roll: PhoneShot[], more: boolean) => void;
}) {
  const native = isNativeRawAvailable();
  const [tab, setTab] = useState<"phone" | "saved">(native ? "phone" : "saved");
  const [saved, setSaved] = useState<GalleryShot[]>(() => loadLocalGallery());
  const [phone, setPhone] = useState<PhoneShot[]>([]);
  const [granted, setGranted] = useState<boolean | null>(native ? null : false);
  const [limited, setLimited] = useState(false);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<GalleryShot | null>(null);
  const [full, setFull] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loadingRef = useRef(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const local = loadLocalGallery();
      if (!native) {
        if (live) setSaved(local);
        return;
      }
      const listed = await listNativeGallery();
      if (!live) return;
      setSaved(merge(listed, local));
    })();
    return () => {
      live = false;
    };
  }, [tick, native]);

  const loadPhone = useCallback(async (reset: boolean) => {
    if (!native || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const offset = reset ? 0 : phone.length;
      const page = await listPhoneLibrary(offset, 48);
      setGranted(page.granted);
      setLimited(page.limited);
      setMore(page.more);
      setPhone((prev) => {
        const base = reset ? [] : prev;
        const seen = new Set(base.map((s) => s.uri));
        const add = page.items.filter((s) => !seen.has(s.uri));
        return reset ? add : [...base, ...add];
      });
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [native, phone.length]);

  useEffect(() => {
    if (!native || tab !== "phone") return;
    void loadPhone(true);
    // only when entering the phone tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native, tab, tick]);

  useEffect(() => {
    if (!open) {
      setFull(null);
      return;
    }
    if (!open.uri || !native) {
      setFull(open.thumb || null);
      return;
    }
    let live = true;
    setBusy(true);
    void loadNativeGalleryJpeg(open.uri, 1600).then((src) => {
      if (!live) return;
      setFull(src || open.thumb || null);
      setBusy(false);
    });
    return () => {
      live = false;
    };
  }, [open, native]);

  const askAccess = async () => {
    const r = await requestPhoneLibrary();
    setGranted(r.granted);
    setLimited(r.limited);
    if (r.granted) void loadPhone(true);
  };

  if (open && tab === "saved") {
    return (
      <div className="lab-gallery-view">
        <button type="button" className="lab-gallery-back" onClick={() => setOpen(null)}>
          ← К сетке
        </button>
        {full ? (
          <img className="lab-gallery-full" src={full} alt={open.name} />
        ) : (
          <p className="lab-note">{busy ? "Открываю…" : "Нет превью"}</p>
        )}
        <p className="lab-gallery-meta">
          {open.name}
          {open.w > 0 ? ` · ${open.w}×${open.h}` : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="lab-library">
      {native ? (
        <div className="lab-filters" role="tablist" aria-label="Кадры">
          <button
            type="button"
            className={tab === "phone" ? "lab-filter is-on" : "lab-filter"}
            onClick={() => setTab("phone")}
          >
            Телефон
          </button>
          <button
            type="button"
            className={tab === "saved" ? "lab-filter is-on" : "lab-filter"}
            onClick={() => setTab("saved")}
          >
            Проявка
          </button>
          {onOpenFile ? (
            <button type="button" className="lab-filter" onClick={onOpenFile}>
              Из файлов
            </button>
          ) : null}
        </div>
      ) : null}
      {limited && tab === "phone" ? (
        <p className="lab-library-note">Показаны только фото, которые ты разрешил. Остальные — через «Из файлов».</p>
      ) : null}
      {tab === "phone" && native ? (
        granted === false ? (
          <div className="lab-gallery-empty">
            <Images className="lab-empty-icon" strokeWidth={1.2} />
            <p>Нужен доступ к фото, чтобы листать их здесь, без системного выбора файла.</p>
            <button type="button" className="lab-btn is-solid" onClick={() => void askAccess()}>
              Разрешить фото
            </button>
            {onOpenFile ? (
              <button type="button" className="lab-btn is-ghost" onClick={onOpenFile}>
                Из файлов
              </button>
            ) : null}
          </div>
        ) : phone.length === 0 && !loading && granted ? (
          <div className="lab-gallery-empty">
            <Images className="lab-empty-icon" strokeWidth={1.2} />
            <p>На телефоне не нашлось изображений.</p>
            {onOpenFile ? (
              <button type="button" className="lab-btn is-ghost" onClick={onOpenFile}>
                Из файлов
              </button>
            ) : null}
          </div>
        ) : (
          <div
            className="lab-gallery"
            onScroll={(e) => {
              if (!more || loading) return;
              const el = e.currentTarget;
              if (el.scrollTop + el.clientHeight > el.scrollHeight - 480) void loadPhone(false);
            }}
          >
            {phone.map((shot) => (
              <button
                key={shot.uri}
                type="button"
                className="lab-gallery-cell"
                onClick={() => onOpenPhone?.(shot.uri, shot.name, phone, more)}
                title={shot.name}
              >
                {shot.thumb ? <img src={shot.thumb} alt="" /> : <span className="lab-gallery-ph" />}
                {shot.raw ? <span className="lab-gallery-raw">RAW</span> : null}
              </button>
            ))}
            {loading ? <p className="lab-library-note">Загружаю…</p> : null}
          </div>
        )
      ) : saved.length === 0 ? (
        <div className="lab-gallery-empty">
          <Images className="lab-empty-icon" strokeWidth={1.2} />
          <p>Пока пусто. Сохрани кадр — он появится здесь.</p>
          {onOpenFile ? (
            <button type="button" className="lab-btn is-ghost" onClick={onOpenFile}>
              Открыть кадр
            </button>
          ) : null}
        </div>
      ) : (
        <div className="lab-gallery">
          {saved.map((shot) => (
            <button
              key={shot.id}
              type="button"
              className="lab-gallery-cell"
              onClick={() => setOpen(shot)}
              title={shot.name}
            >
              {shot.thumb ? <img src={shot.thumb} alt="" /> : <span className="lab-gallery-ph" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
