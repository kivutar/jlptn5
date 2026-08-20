import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const [code, english, french] = await Promise.all([
  readFile(join(rootDirectory, "i18n.js"), "utf8"),
  readFile(join(rootDirectory, "locales", "en.json"), "utf8").then(JSON.parse),
  readFile(join(rootDirectory, "locales", "fr.json"), "utf8").then(JSON.parse)
]);

function loadApi(languages = ["en-US"]) {
  const context = {
    navigator: { languages },
    Intl,
    URL,
    console
  };

  context.globalThis = context;
  vm.runInNewContext(code, context);
  return context.JlptN5I18n;
}

function catalogFetch(url) {
  const value = url.endsWith("fr.json") ? french : english;

  return Promise.resolve({ ok: true, json: async () => value });
}

test("locale resolution honors explicit choices and French system preferences", () => {
  const api = loadApi(["fr-FR", "en-US"]);

  assert.equal(api.resolveLocale("en"), "en");
  assert.equal(api.resolveLocale("fr"), "fr");
  assert.equal(api.resolveLocale("auto"), "fr");
  assert.equal(api.resolveLocale("auto", ["en-US", "fr-FR"]), "en");
  assert.equal(api.resolveLocale("auto", ["de-DE"]), "en");
});

test("French messages interpolate and pluralize with English fallback", async () => {
  const api = loadApi(["fr-FR"]);

  await api.initialize("auto", { fetchImpl: catalogFetch });

  assert.equal(api.getLocale(), "fr");
  assert.equal(api.t("common.next"), "Suivant");
  assert.equal(api.t("statistics.days", { count: 1 }), "1 jour");
  assert.equal(api.t("statistics.days", { count: 3 }), "3 jours");
  assert.equal(api.t("missing.key"), "missing.key");
});
