import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { stockDetail, stockSpec, stockCategory } from "./stock-details.ts";

describe("Russian stock details", () => {
  it("includes translated detail for legacy and Negs entries", () => {
    const text = readFileSync(new URL("./stock-details.json", import.meta.url), "utf8");
    const entries = JSON.parse(text);
    const catalog=JSON.parse(readFileSync(new URL("../../../public/profiles/catalog.json",import.meta.url),"utf8"));
    assert.ok(Object.keys(entries).length>=28);
    for(const p of [...catalog.films,...catalog.papers])if(p.negs)assert.ok(entries[p.id],p.id);
    assert.equal(/\p{Script=Han}/u.test(text), false);
    for (const value of Object.values(entries) as {summary: string}[]) assert.match(value.summary, /[А-Яа-я]/);
  });
  it("distinguishes tungsten from daylight and avoids inventing ISO for paper", () => {
    assert.equal(stockSpec({id: "kodak_vision3_500t", iso: 500}), "ISO 500 · Лампы накаливания");
    assert.equal(stockSpec({id: "kodak_portra_400", iso: 400}), "ISO 400 · Дневной свет");
    assert.equal(stockSpec({id: "kodak_portra_endura", iso: null}), "");
  });
  it("keeps custom profiles usable without upstream metadata", () => {
    assert.equal(stockDetail("custom"), undefined);
    assert.equal(stockCategory("custom"), "Пользовательский профиль");
    assert.equal(stockSpec({id: "custom"}), "");
  });
});
