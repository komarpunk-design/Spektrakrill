import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultParams } from "./defaults.ts";
import {
  STOCK_CAP,
  addStockItem,
  clearDoneStock,
  loadStock,
  makeStockId,
  patchStock,
  queuedStock,
  reviveStockExports,
  removeStock,
  stockLookLabel,
  type StockItem,
} from "./stock.ts";

const mem = new Map<string, string>();
const ls = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => {
    mem.set(k, v);
  },
  removeItem: (k: string) => {
    mem.delete(k);
  },
};
(globalThis as { localStorage?: typeof ls }).localStorage = ls;

function item(partial: Partial<StockItem> = {}): StockItem {
  return {
    id: partial.id ?? makeStockId(),
    name: partial.name ?? "shot.dng",
    at: partial.at ?? Date.now(),
    w: partial.w ?? 4000,
    h: partial.h ?? 3000,
    thumb: partial.thumb ?? "",
    params: partial.params ?? { ...defaultParams(), filmStock: "kodak_portra_400" },
    native: partial.native ?? false,
    raw: partial.raw ?? true,
    status: partial.status ?? "queued",
    error: partial.error,
    exportedUri: partial.exportedUri,
  };
}

describe("stock", () => {
  it("labels portra vs digital engine", () => {
    assert.equal(stockLookLabel({ ...defaultParams(), filmStock: "kodak_portra_400" }), "Portra 400");
    assert.equal(stockLookLabel({ ...defaultParams(), filmStock: "none" }), "Исходник");
    assert.equal(
      stockLookLabel({ ...defaultParams(), filmStock: "none", rawEngine: "hasselblad" }),
      "HNCS",
    );
  });

  it("caps the tray and keeps queued items for batch", () => {
    mem.clear();
    for (let i = 0; i < STOCK_CAP; i++) {
      const r = addStockItem(item({ id: `s${i}`, name: `f${i}.jpg` }));
      assert.equal(r.ok, true);
    }
    const full = addStockItem(item({ id: "overflow" }));
    assert.equal(full.ok, false);
    if (full.ok) throw new Error("expected full");
    assert.equal(full.reason, "full");
    assert.equal(loadStock().length, STOCK_CAP);
  });

  it("revives a crashed export as queued and batches only unfinished", () => {
    mem.clear();
    addStockItem(item({ id: "a", status: "exporting" }));
    addStockItem(item({ id: "b", status: "done" }));
    addStockItem(item({ id: "c", status: "error" }));
    const items = loadStock();
    const a = items.find((s) => s.id === "a");
    assert.equal(a?.status, "queued");
    const pending = queuedStock(items);
    assert.deepEqual(
      pending.map((s) => s.id).sort(),
      ["a", "c"],
    );
    patchStock("c", { status: "done" });
    const left = clearDoneStock();
    assert.equal(left.length, 1);
    assert.equal(left[0].id, "a");
    const empty = removeStock("a");
    assert.equal(empty.length, 0);
  });

  it("persists a crashed exporting row back to queued", () => {
    mem.clear();
    addStockItem(item({ id: "x", status: "exporting" }));
    const raw = JSON.parse(mem.get("spektrafilm-stock") || "[]") as { status: string }[];
    raw[0]!.status = "exporting";
    mem.set("spektrafilm-stock", JSON.stringify(raw));
    const revived = reviveStockExports();
    assert.equal(revived[0]?.status, "queued");
    const stored = JSON.parse(mem.get("spektrafilm-stock") || "[]") as { status: string }[];
    assert.equal(stored[0]?.status, "queued");
  });

  it("ids are filesystem-safe", () => {
    for (let i = 0; i < 8; i++) {
      assert.match(makeStockId(), /^s[a-z0-9]+$/);
    }
  });
});
