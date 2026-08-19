import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const storageCode = await readFile(join(rootDirectory, "storage.js"), "utf8");

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
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

function loadStorageApi(localStorage) {
  const context = { localStorage };

  context.globalThis = context;
  vm.runInNewContext(storageCode, context);
  return context.JlptN5Storage;
}

test("storage facade preserves existing browser values", () => {
  const browserStorage = new MemoryStorage([["progress", "browser-value"]]);
  const api = loadStorageApi(browserStorage);

  assert.equal(api.storage.getItem("progress"), "browser-value");
  api.storage.setItem("progress", "updated");
  assert.equal(browserStorage.getItem("progress"), "updated");
  api.storage.removeItem("progress");
  assert.equal(browserStorage.getItem("progress"), null);
});
test("persistent drivers hydrate native values and migrate browser values", async () => {
  const browserStorage = new MemoryStorage([
    ["native-wins", "browser"],
    ["browser-migrates", "legacy"]
  ]);
  const nativeStorage = new MemoryStorage([["native-wins", "native"]]);
  const driver = {
    async getItem(key) {
      return nativeStorage.getItem(key);
    },
    async setItem(key, value) {
      nativeStorage.setItem(key, value);
    },
    async removeItem(key) {
      nativeStorage.removeItem(key);
    }
  };
  const api = loadStorageApi(browserStorage);

  await api.configurePersistentDriver(driver, ["native-wins", "browser-migrates"]);

  assert.equal(api.storage.getItem("native-wins"), "native");
  assert.equal(browserStorage.getItem("native-wins"), "native");
  assert.equal(nativeStorage.getItem("browser-migrates"), "legacy");

  api.storage.setItem("native-wins", "after-write");
  api.storage.removeItem("browser-migrates");
  await api.flush();

  assert.equal(nativeStorage.getItem("native-wins"), "after-write");
  assert.equal(nativeStorage.getItem("browser-migrates"), null);
});
