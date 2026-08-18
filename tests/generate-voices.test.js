import assert from "node:assert/strict";
import test from "node:test";
import {
  parseVoiceGenerationArguments,
  processVoiceGenerationBatch
} from "../scripts/generate-voices.js";

test("voice generation is unlimited by default", () => {
  assert.deepEqual(parseVoiceGenerationArguments([]), {
    generationLimit: Number.POSITIVE_INFINITY,
    showHelp: false
  });
});

test("voice generation accepts small request limits", () => {
  assert.equal(parseVoiceGenerationArguments(["--limit", "1"]).generationLimit, 1);
  assert.equal(parseVoiceGenerationArguments(["--limit=2"]).generationLimit, 2);
  assert.equal(parseVoiceGenerationArguments(["--limit", "3"]).generationLimit, 3);
});

test("voice generation rejects unsafe limits and unknown options", () => {
  for (const arguments_ of [
    ["--limit"],
    ["--limit", "0"],
    ["--limit", "-1"],
    ["--limit", "1.5"],
    ["--limit", "nope"],
    ["--limit", "1", "--limit", "2"],
    ["--unknown"]
  ]) {
    assert.throws(() => parseVoiceGenerationArguments(arguments_));
  }
});

test("voice generation exposes command help", () => {
  assert.equal(parseVoiceGenerationArguments(["--help"]).showHelp, true);
  assert.equal(parseVoiceGenerationArguments(["-h"]).showHelp, true);
});

test("the batch limit counts only newly generated voices", async () => {
  const prepared = [];
  const outcomes = new Map([
    ["existing", false],
    ["cached", false],
    ["missing-a", true],
    ["missing-b", true],
    ["missing-c", true]
  ]);
  const generatedVoiceCount = await processVoiceGenerationBatch(
    [...outcomes.keys()],
    2,
    async (lesson) => {
      prepared.push(lesson);
      return outcomes.get(lesson);
    }
  );

  assert.equal(generatedVoiceCount, 2);
  assert.deepEqual(prepared, ["existing", "cached", "missing-a", "missing-b"]);
});
