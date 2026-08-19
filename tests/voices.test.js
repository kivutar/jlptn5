import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateLessonM4a } from "../scripts/m4a.js";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(path) {
  return JSON.parse(await readFile(join(rootDirectory, path), "utf8"));
}

test("every available AAC/M4A voice is referenced and valid", async () => {
  const [introduction, exercises] = await Promise.all([
    readJson("data/introduction.json"),
    readJson("data/exercises.json")
  ]);

  const lessons = [introduction, ...exercises];
  const availableVoicePaths = [];

  for (const lesson of lessons) {
    const path = join(rootDirectory, lesson.audio);
    const japaneseText = lesson.type === "production" ? lesson.solution : lesson.text;

    try {
      await access(path);
    } catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }

      throw error;
    }

    await assert.doesNotReject(() => validateLessonM4a(path, japaneseText), lesson.audio);
    availableVoicePaths.push(lesson.audio);
  }

  const voiceFiles = (await readdir(join(rootDirectory, "assets", "voices")))
    .filter((file) => file.endsWith(".m4a"))
    .map((file) => `assets/voices/${file}`)
    .sort();

  assert.ok(voiceFiles.length > 0);
  assert.deepEqual(availableVoicePaths.sort(), voiceFiles);
});
