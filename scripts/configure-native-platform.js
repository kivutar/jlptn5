import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = process.env.CAPACITOR_ROOT_DIR ||
  join(dirname(fileURLToPath(import.meta.url)), "..");

export function configureNativeConfig(config, platform) {
  const configured = structuredClone(config);

  if (platform === "ios") {
    configured.plugins ||= {};
    configured.plugins.StatusBar ||= {};

    // Capacitor replays LaunchScreen inside the bridge view while the web app
    // loads. Keeping that view edge-to-edge prevents the replayed splash from
    // moving below the status bar after the real iOS launch screen disappears.
    configured.plugins.StatusBar.overlaysWebView = true;
  }

  return configured;
}

export async function configureNativePlatform({
  platform = process.env.CAPACITOR_PLATFORM_NAME,
  root = rootDirectory
} = {}) {
  if (platform !== "ios") {
    return;
  }

  const configPath = join(root, "ios", "App", "App", "capacitor.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const configured = configureNativeConfig(config, platform);

  await writeFile(configPath, `${JSON.stringify(configured, null, "\t")}\n`);
  console.log("Configured the iOS bridge to remain edge-to-edge during launch.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await configureNativePlatform();
}
