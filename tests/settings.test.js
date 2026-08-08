import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const settingsCode = await readFile(join(rootDirectory, "settings.js"), "utf8");

function createStorage(initialValue) {
  const values = new Map(initialValue ? [["jlpt-n5.settings.v1", initialValue]] : []);

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

function loadSettingsApi(storage) {
  const context = { localStorage: storage };

  context.globalThis = context;
  vm.runInNewContext(settingsCode, context);
  return context.JlptN5Settings;
}

test("settings use learner-friendly defaults", () => {
  const settings = loadSettingsApi(createStorage()).readSettings();

  assert.deepEqual({ ...settings }, {
    version: 1,
    userLanguage: "en",
    furigana: true,
    autoPlayAudio: false,
    tokenColoring: true,
    translationTooltips: true
  });
});

test("settings persist and retain valid existing values", () => {
  const storage = createStorage();
  const api = loadSettingsApi(storage);

  api.writeSettings({ furigana: false, tokenColoring: false });
  const settings = api.writeSettings({ autoPlayAudio: true });

  assert.equal(settings.furigana, false);
  assert.equal(settings.tokenColoring, false);
  assert.equal(settings.autoPlayAudio, true);
  assert.deepEqual({ ...api.readSettings() }, { ...settings });
});

test("invalid or outdated settings fall back to defaults", () => {
  const storage = createStorage(JSON.stringify({
    version: 2,
    furigana: false
  }));
  const settings = loadSettingsApi(storage).readSettings();

  assert.equal(settings.version, 1);
  assert.equal(settings.furigana, true);
});
