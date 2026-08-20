import assert from "node:assert/strict";
import test from "node:test";
import * as FSRS from "ts-fsrs";

globalThis.FSRS = FSRS;
await import("../srs.js");
await import("../learning-stats.js");
await import("../settings.js");
await import("../progress.js");

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

test("progress backups round-trip learning data without session secrets", () => {
  const sourceStorage = new MemoryStorage();
  const reviewedAt = "2026-08-19T10:00:00.000Z";

  globalThis.JlptN5Srs.recordReviews([
    { grammarPointId: "te-kara", outcome: "good" }
  ], { storage: sourceStorage, now: reviewedAt });
  globalThis.JlptN5Stats.recordExerciseAttempt({
    id: "coffee-before-work",
    text: "毎朝、コーヒーを飲んでから仕事に行きます。"
  }, "I drink coffee before work.", { storage: sourceStorage, now: reviewedAt });
  globalThis.JlptN5Settings.writeSettings({ furigana: false }, { storage: sourceStorage });

  const serialized = globalThis.JlptN5Progress.serializeBackup({
    storage: sourceStorage,
    now: reviewedAt
  });
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.format, "chakuchaku-progress");
  assert.equal(parsed.version, 1);
  assert.equal(parsed.exportedAt, reviewedAt);
  assert.equal(serialized.includes("openai"), false);

  const destinationStorage = new MemoryStorage();
  const result = globalThis.JlptN5Progress.importBackup(serialized, {
    storage: destinationStorage
  });

  assert.equal(result.cardCount, 1);
  assert.equal(result.historyCount, 1);
  assert.ok(globalThis.JlptN5Srs.readSrsData({ storage: destinationStorage }).cards["te-kara"]);
  assert.equal(
    globalThis.JlptN5Stats.readLearningStats({ storage: destinationStorage })
      .exerciseHistory[0].answer,
    "I drink coffee before work."
  );
  assert.equal(
    globalThis.JlptN5Settings.readSettings({ storage: destinationStorage }).furigana,
    false
  );
});
test("invalid progress is rejected before stored values change", () => {
  const storage = new MemoryStorage();

  storage.setItem(globalThis.JlptN5Srs.storageKey, "existing");

  assert.throws(
    () => globalThis.JlptN5Progress.importBackup('{"version":99}', { storage }),
    /supported ChakuChaku progress backup/
  );
  assert.equal(storage.getItem(globalThis.JlptN5Srs.storageKey), "existing");
});

test("backups containing version-one settings migrate during import", () => {
  const sourceStorage = new MemoryStorage();
  const backup = globalThis.JlptN5Progress.createBackup({
    storage: sourceStorage,
    now: "2026-08-19T10:00:00.000Z"
  });

  backup.data.settings = {
    ...backup.data.settings,
    version: 1,
    userLanguage: "en",
    furigana: false
  };

  const destinationStorage = new MemoryStorage();
  globalThis.JlptN5Progress.importBackup(JSON.stringify(backup), {
    storage: destinationStorage
  });
  const settings = globalThis.JlptN5Settings.readSettings({ storage: destinationStorage });

  assert.equal(settings.version, 2);
  assert.equal(settings.userLanguage, "en");
  assert.equal(settings.furigana, false);
});

test("reset removes study data while retaining preferences", () => {
  const storage = new MemoryStorage();

  storage.setItem(globalThis.JlptN5Srs.storageKey, "srs");
  storage.setItem(globalThis.JlptN5Stats.storageKey, "stats");
  storage.setItem(globalThis.JlptN5Settings.storageKey, "settings");
  globalThis.JlptN5Progress.clearProgress({ storage });

  assert.equal(storage.getItem(globalThis.JlptN5Srs.storageKey), null);
  assert.equal(storage.getItem(globalThis.JlptN5Stats.storageKey), null);
  assert.equal(storage.getItem(globalThis.JlptN5Settings.storageKey), "settings");
});
