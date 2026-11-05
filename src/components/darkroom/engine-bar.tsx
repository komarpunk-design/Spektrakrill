import { haptic } from "@/lib/film/haptic";
import { engineChipLabel, engineFullLabel } from "@/lib/film/engine-slots";
import { RAW_ENGINES, type RawEngine } from "@/lib/film/raw-engine";
import { useDarkroom } from "@/lib/film/store";

export function EngineBar() {
  const engine = useDarkroom((s) => s.params.rawEngine);
  const selectEngine = useDarkroom((s) => s.selectEngine);

  return (
    <div className="lab-engines" role="tablist" aria-label="Движок">
      {RAW_ENGINES.map((item) => {
        const on = item.id === engine;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={on}
            className={on ? "lab-engine is-on" : "lab-engine"}
            title={engineFullLabel(item.id)}
            onClick={() => {
              if (item.id === engine) return;
              haptic("select");
              selectEngine(item.id as RawEngine);
            }}
          >
            {engineChipLabel(item.id)}
          </button>
        );
      })}
    </div>
  );
}
