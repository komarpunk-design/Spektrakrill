import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseSpectralProfile, parseSpektraImport } from "./profile-json.ts";

const PAPER = JSON.parse(
  readFileSync(
    new URL(
      "../../../android/engine/spektra-core/src/main/assets/spektra/profiles/kodak_portra_endura.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as unknown;

const FILM = JSON.parse(
  readFileSync(
    new URL(
      "../../../android/engine/spektra-core/src/main/assets/spektra/profiles/kodak_portra_400.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as unknown;

describe("Volpato spectral JSON", () => {
  it("parses paper as paper, not film", () => {
    const parsed = parseSpectralProfile(PAPER, "kodak_portra_endura.json");
    assert.equal(parsed.meta.support, "paper");
    assert.equal(parsed.meta.stage, "printing");
    assert.equal(parsed.id, "kodak_portra_endura");
    assert.equal(parsed.jsProfile.support, "paper");
  });

  it("parses film as film", () => {
    const parsed = parseSpectralProfile(FILM, "kodak_portra_400.json");
    assert.equal(parsed.meta.support, "film");
    assert.equal(parsed.id, "kodak_portra_400");
  });

  it("pack import lists paper separately from film", () => {
    const pack = parseSpektraImport([PAPER, FILM], "pack.json");
    assert.equal(pack.profiles.length, 2);
    assert.equal(pack.profiles.filter((p) => p.meta.support === "paper").length, 1);
    assert.equal(pack.profiles.filter((p) => p.meta.support === "film").length, 1);
  });
});
