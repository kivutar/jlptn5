import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as wanakana from "wanakana";
import { createVocabularySpeechRequest } from "../scripts/generate-voices.js";
import { validateLessonM4a } from "../scripts/m4a.js";

const { getVocabularyVoicePath } = globalThis.JlptN5VoicePaths;

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(path) {
  return JSON.parse(await readFile(join(rootDirectory, path), "utf8"));
}

async function listM4aFiles(directory, relativeDirectory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    const relativePath = join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      paths.push(...await listM4aFiles(path, relativePath));
    } else if (entry.isFile() && entry.name.endsWith(".m4a")) {
      paths.push(relativePath);
    }
  }

  return paths;
}

test("every available AAC/M4A voice is referenced and valid", async () => {
  const [introduction, exercises, vocabulary] = await Promise.all([
    readJson("data/introduction.json"),
    readJson("data/exercises.json"),
    readJson("data/jlpt-n5-vocabulary.json")
  ]);

  const lessons = [introduction, ...exercises];
  const availableVoicePaths = [];

  for (const lesson of lessons) {
    const path = join(rootDirectory, lesson.audio);
    const japaneseText = lesson.type === "production" ? lesson.solution : lesson.text;
    const spokenText = lesson.speechText || japaneseText;

    try {
      await access(path);
    } catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }

      throw error;
    }

    await assert.doesNotReject(() => validateLessonM4a(path, spokenText), lesson.audio);
    availableVoicePaths.push(lesson.audio);
  }

  for (const entry of vocabulary) {
    const relativePath = getVocabularyVoicePath(entry, wanakana);
    const path = join(rootDirectory, relativePath);
    const speechRequest = createVocabularySpeechRequest(entry);

    try {
      await access(path);
    } catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }

      throw error;
    }

    await assert.doesNotReject(
      () => validateLessonM4a(
        path,
        speechRequest.spokenText,
        speechRequest.validationOptions
      ),
      relativePath
    );
    availableVoicePaths.push(relativePath);
  }

  const voiceFiles = (await listM4aFiles(
    join(rootDirectory, "assets", "voices"),
    join("assets", "voices")
  )).sort();

  assert.ok(voiceFiles.length > 0);
  assert.deepEqual(availableVoicePaths.sort(), voiceFiles);
});
