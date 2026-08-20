import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const settingsCode = await readFile(join(rootDirectory, "settings.js"), "utf8");

function createStorage(initialValue, initialKey = "jlpt-n5.settings.v1") {
  const values = new Map(initialValue ? [[initialKey, initialValue]] : []);

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function loadSettingsApi(storage, sessionStorage = createStorage()) {
  const context = { localStorage: storage, sessionStorage };

  context.globalThis = context;
  vm.runInNewContext(settingsCode, context);
  return context.JlptN5Settings;
}

test("settings use learner-friendly defaults", () => {
  const settings = loadSettingsApi(createStorage()).readSettings();

  assert.deepEqual({ ...settings }, {
    version: 2,
    userLanguage: "auto",
    furigana: true,
    autoPlayAudio: false,
    tokenColoring: true,
    translationTooltips: true,
    aiAutoCorrect: false,
    reviewReminder: false,
    reviewReminderTime: "19:00"
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

test("OpenAI keys remain in session storage and can be cleared", () => {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  const api = loadSettingsApi(localStorage, sessionStorage);

  assert.equal(api.readOpenAiApiKey(), "");
  assert.equal(api.writeOpenAiApiKey("  sk-project-test  "), "sk-project-test");
  assert.equal(api.readOpenAiApiKey(), "sk-project-test");
  assert.equal(localStorage.getItem(api.openAiApiKeyStorageKey), null);
  assert.equal(sessionStorage.getItem(api.openAiApiKeyStorageKey), "sk-project-test");
  assert.equal(
    loadSettingsApi(localStorage, sessionStorage).readOpenAiApiKey(),
    "sk-project-test"
  );

  api.writeOpenAiApiKey("");
  assert.equal(api.readOpenAiApiKey(), "");
  assert.equal(sessionStorage.getItem(api.openAiApiKeyStorageKey), null);
});

test("daily reminder preferences are normalized without prompting", () => {
  const storage = createStorage();
  const api = loadSettingsApi(storage);
  const settings = api.writeSettings({
    reviewReminder: true,
    reviewReminderTime: "07:30"
  });

  assert.equal(settings.reviewReminder, true);
  assert.equal(settings.reviewReminderTime, "07:30");
  assert.equal(api.writeSettings({ reviewReminderTime: "later" }).reviewReminderTime, "19:00");
});

test("version one settings migrate without losing preferences", () => {
  const storage = createStorage(JSON.stringify({
    version: 1,
    userLanguage: "en",
    furigana: false,
    autoPlayAudio: true,
    tokenColoring: false,
    translationTooltips: false,
    aiAutoCorrect: false,
    reviewReminder: true,
    reviewReminderTime: "07:30"
  }));
  const settings = loadSettingsApi(storage).readSettings();

  assert.equal(settings.version, 2);
  assert.equal(settings.userLanguage, "en");
  assert.equal(settings.furigana, false);
  assert.equal(settings.autoPlayAudio, true);
  assert.equal(settings.reviewReminder, true);
  assert.equal(settings.reviewReminderTime, "07:30");
});

test("invalid or future settings fall back to defaults", () => {
  const storage = createStorage(JSON.stringify({
    version: 3,
    furigana: false
  }));
  const settings = loadSettingsApi(storage).readSettings();

  assert.equal(settings.version, 2);
  assert.equal(settings.furigana, true);
});
