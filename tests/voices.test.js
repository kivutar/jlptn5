import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(path) {
  return JSON.parse(await readFile(join(rootDirectory, path), "utf8"));
}

test("every prepared lesson has a local WAV voice", async () => {
  const [introduction, exercises] = await Promise.all([
    readJson("data/introduction.json"),
    readJson("data/exercises.json")
  ]);

  for (const lesson of [introduction, ...exercises]) {
    const path = join(rootDirectory, lesson.audio);
    const audio = await readFile(path);

    assert.ok(audio.length > 44, `${lesson.audio} is empty`);
    assert.equal(audio.subarray(0, 4).toString("ascii"), "RIFF", lesson.audio);
    assert.equal(audio.subarray(8, 12).toString("ascii"), "WAVE", lesson.audio);
  }
});
