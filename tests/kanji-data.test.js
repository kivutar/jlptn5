import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");

test("kanji inventory exactly follows the Rikkyo 209-character curriculum", async () => {
  const [kanji, curriculum] = await Promise.all([
    readFile(join(rootDirectory, "data", "jlpt-n5-kanji.json"), "utf8").then(JSON.parse),
    readFile(
      join(rootDirectory, "data", "source", "rikkyo-n5-kanji.json"),
      "utf8"
    ).then(JSON.parse)
  ]);
  const ids = new Set();
  const characters = new Set();
  const expected = curriculum.flatMap(({ stage, characters: stageCharacters }) => {
    return [...stageCharacters].map((character) => ({ character, stage }));
  });

  assert.equal(kanji.length, 209);
  assert.equal(kanji.filter(({ stage }) => stage === "B6").length, 73);
  assert.equal(kanji.filter(({ stage }) => stage === "B5").length, 68);
  assert.equal(kanji.filter(({ stage }) => stage === "B4").length, 68);
  assert.deepEqual(
    kanji.map(({ character, stage }) => ({ character, stage })),
    expected
  );

  for (const entry of kanji) {
    const codePoint = entry.character.codePointAt(0).toString(16).padStart(4, "0");
    const readings = [...entry.onReadings, ...entry.kunReadings];

    assert.match(entry.character, /^\p{Script=Han}$/u);
    assert.equal(entry.id, `kanji-${codePoint}`);
    assert.ok(entry.meaning.length > 0);
    assert.ok(["B6", "B5", "B4"].includes(entry.stage));
    assert.ok(Array.isArray(entry.onReadings));
    assert.ok(Array.isArray(entry.kunReadings));
    assert.ok(readings.length > 0, `${entry.character} needs at least one N5 reading`);
    assert.equal(
      new Set(entry.onReadings).size,
      entry.onReadings.length,
      `${entry.character} repeats an on-reading`
    );
    assert.equal(
      new Set(entry.kunReadings).size,
      entry.kunReadings.length,
      `${entry.character} repeats a kun-reading`
    );
    assert.ok(readings.every((reading) => /^[ぁ-ゖ]+$/.test(reading)));
    assert.ok(!ids.has(entry.id), `Duplicate kanji id ${entry.id}`);
    assert.ok(!characters.has(entry.character), `Duplicate kanji ${entry.character}`);
    ids.add(entry.id);
    characters.add(entry.character);
  }

  assert.equal(kanji.find(({ character }) => character === "私").stage, "B6");

  for (const character of ["兄", "姉", "弟", "妹"]) {
    assert.equal(kanji.find((entry) => entry.character === character).stage, "B5");
  }
});
