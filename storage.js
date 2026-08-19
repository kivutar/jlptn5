(function initializeStorage(global) {
  "use strict";

  const cache = new Map();
  let browserStorage;
  let persistentDriver;
  let readyPromise = Promise.resolve();
  let pendingWrite = Promise.resolve();

  try {
    browserStorage = global.localStorage;
  } catch {
    browserStorage = undefined;
  }

  function readBrowserValue(key) {
    try {
      return browserStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  function mirrorBrowserValue(key, value) {
    try {
      if (value === null) {
        browserStorage?.removeItem(key);
      } else {
        browserStorage?.setItem(key, value);
      }
    } catch {
      // The in-memory value and native driver can still keep the app operational.
    }
  }

  function queuePersistentWrite(operation) {
    if (!persistentDriver) {
      return;
    }

    pendingWrite = pendingWrite
      .then(operation)
      .catch((error) => console.error("Could not persist learner data.", error));
  }

  const storage = Object.freeze({
    getItem(key) {
      const normalizedKey = String(key);

      if (cache.has(normalizedKey)) {
        return cache.get(normalizedKey);
      }

      const value = readBrowserValue(normalizedKey);
      cache.set(normalizedKey, value);
      return value;
    },

    setItem(key, value) {
      const normalizedKey = String(key);
      const normalizedValue = String(value);

      cache.set(normalizedKey, normalizedValue);
      mirrorBrowserValue(normalizedKey, normalizedValue);
      queuePersistentWrite(() => persistentDriver.setItem(normalizedKey, normalizedValue));
    },

    removeItem(key) {
      const normalizedKey = String(key);

      cache.set(normalizedKey, null);
      mirrorBrowserValue(normalizedKey, null);
      queuePersistentWrite(() => persistentDriver.removeItem(normalizedKey));
    }
  });

  function validateDriver(driver) {
    if (
      !driver ||
      typeof driver.getItem !== "function" ||
      typeof driver.setItem !== "function" ||
      typeof driver.removeItem !== "function"
    ) {
      throw new TypeError("Persistent storage drivers need getItem, setItem, and removeItem.");
    }
  }

  function configurePersistentDriver(driver, keys) {
    validateDriver(driver);
    persistentDriver = driver;
    const uniqueKeys = [...new Set(keys)]
      .filter((key) => typeof key === "string" && key);

    readyPromise = (async () => {
      for (const key of uniqueKeys) {
        const persistentValue = await driver.getItem(key);
        const browserValue = readBrowserValue(key);

        if (typeof persistentValue === "string") {
          cache.set(key, persistentValue);
          mirrorBrowserValue(key, persistentValue);
        } else if (typeof browserValue === "string") {
          cache.set(key, browserValue);
          await driver.setItem(key, browserValue);
        } else {
          cache.set(key, null);
        }
      }
    })();

    return readyPromise;
  }

  async function ready() {
    await readyPromise;
  }

  async function flush() {
    await readyPromise;
    await pendingWrite;
  }

  global.JlptN5Storage = Object.freeze({
    storage,
    configurePersistentDriver,
    ready,
    flush
  });
})(globalThis);
