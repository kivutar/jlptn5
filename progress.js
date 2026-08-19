(function initializeProgress(global) {
  "use strict";

  const format = "chakuchaku-progress";
  const schemaVersion = 1;
  const maximumImportBytes = 10 * 1024 * 1024;

  function getStorage(storage) {
    if (storage !== undefined) {
      return storage;
    }

    return global.JlptN5Storage?.storage || global.localStorage;
  }

  function createTemporaryStorage(key, value) {
    const serializedValue = JSON.stringify(value);

    return {
      getItem(requestedKey) {
        return requestedKey === key ? serializedValue : null;
      }
    };
  }

  function normalizeBackupData(backup) {
    if (
      !backup ||
      backup.format !== format ||
      backup.version !== schemaVersion ||
      typeof backup.exportedAt !== "string" ||
      Number.isNaN(Date.parse(backup.exportedAt)) ||
      !backup.data ||
      backup.data.srs?.version !== global.JlptN5Srs.schemaVersion ||
      backup.data.learningStats?.version !== global.JlptN5Stats.schemaVersion ||
      backup.data.settings?.version !== global.JlptN5Settings.schemaVersion
    ) {
      throw new Error("This is not a supported ChakuChaku progress backup.");
    }

    return {
      srs: global.JlptN5Srs.readSrsData({
        storage: createTemporaryStorage(global.JlptN5Srs.storageKey, backup.data.srs)
      }),
      learningStats: global.JlptN5Stats.readLearningStats({
        storage: createTemporaryStorage(
          global.JlptN5Stats.storageKey,
          backup.data.learningStats
        )
      }),
      settings: global.JlptN5Settings.readSettings({
        storage: createTemporaryStorage(
          global.JlptN5Settings.storageKey,
          backup.data.settings
        )
      })
    };
  }

  function createBackup({ storage, now = new Date() } = {}) {
    const exportedAt = new Date(now);

    if (Number.isNaN(exportedAt.getTime())) {
      throw new Error("The backup time is invalid.");
    }

    const resolvedStorage = getStorage(storage);

    return {
      format,
      version: schemaVersion,
      exportedAt: exportedAt.toISOString(),
      data: {
        srs: global.JlptN5Srs.readSrsData({ storage: resolvedStorage }),
        learningStats: global.JlptN5Stats.readLearningStats({ storage: resolvedStorage }),
        settings: global.JlptN5Settings.readSettings({ storage: resolvedStorage })
      }
    };
  }

  function serializeBackup(options) {
    return `${JSON.stringify(createBackup(options), null, 2)}\n`;
  }

  function parseBackup(source) {
    if (typeof source !== "string") {
      throw new TypeError("Progress backup contents must be text.");
    }

    if (new TextEncoder().encode(source).length > maximumImportBytes) {
      throw new Error("This progress backup is too large to import.");
    }

    let backup;

    try {
      backup = JSON.parse(source);
    } catch {
      throw new Error("The selected file does not contain valid JSON.");
    }

    return {
      backup,
      data: normalizeBackupData(backup)
    };
  }

  function replaceValues(storage, entries) {
    const previousValues = entries.map(([key]) => [key, storage.getItem(key)]);

    try {
      for (const [key, value] of entries) {
        storage.setItem(key, JSON.stringify(value));
      }
    } catch (error) {
      for (const [key, value] of previousValues) {
        if (value === null) {
          storage.removeItem(key);
        } else {
          storage.setItem(key, value);
        }
      }

      throw new Error("The imported progress could not be saved.", { cause: error });
    }
  }

  function importBackup(source, { storage } = {}) {
    const resolvedStorage = getStorage(storage);
    const { backup, data } = parseBackup(source);

    replaceValues(resolvedStorage, [
      [global.JlptN5Srs.storageKey, data.srs],
      [global.JlptN5Stats.storageKey, data.learningStats],
      [global.JlptN5Settings.storageKey, data.settings]
    ]);

    return {
      exportedAt: backup.exportedAt,
      cardCount:
        Object.keys(data.srs.cards).length +
        Object.keys(data.srs.kanaCards).length +
        Object.keys(data.srs.vocabularyCards).length,
      historyCount: data.learningStats.exerciseHistory.length
    };
  }

  function clearProgress({ storage } = {}) {
    const resolvedStorage = getStorage(storage);

    resolvedStorage.removeItem(global.JlptN5Srs.storageKey);
    resolvedStorage.removeItem(global.JlptN5Stats.storageKey);
  }

  global.JlptN5Progress = Object.freeze({
    format,
    schemaVersion,
    maximumImportBytes,
    createBackup,
    serializeBackup,
    parseBackup,
    importBackup,
    clearProgress
  });
})(globalThis);
