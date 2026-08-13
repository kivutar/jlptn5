import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "4173", 10);
const publicFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/srs.js", ["srs.js", "text/javascript; charset=utf-8"]],
  ["/learning-stats.js", ["learning-stats.js", "text/javascript; charset=utf-8"]],
  ["/exercise-selection.js", ["exercise-selection.js", "text/javascript; charset=utf-8"]],
  ["/statistics.js", ["statistics.js", "text/javascript; charset=utf-8"]],
  ["/settings.js", ["settings.js", "text/javascript; charset=utf-8"]],
  ["/autocorrect.js", ["autocorrect.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  [
    "/vendor/ts-fsrs.js",
    ["node_modules/ts-fsrs/dist/index.umd.js", "text/javascript; charset=utf-8"]
  ],
  [
    "/vendor/wanakana.js",
    ["node_modules/wanakana/wanakana.min.js", "text/javascript; charset=utf-8"]
  ],
  ["/data/introduction.json", ["data/introduction.json", "application/json; charset=utf-8"]],
  ["/data/exercises.json", ["data/exercises.json", "application/json; charset=utf-8"]],
  [
    "/data/jlpt-n5-kanji.json",
    ["data/jlpt-n5-kanji.json", "application/json; charset=utf-8"]
  ],
  [
    "/data/jlpt-n5-vocabulary.json",
    ["data/jlpt-n5-vocabulary.json", "application/json; charset=utf-8"]
  ],
  [
    "/data/jlpt-n5-grammar.json",
    ["data/jlpt-n5-grammar.json", "application/json; charset=utf-8"]
  ]
]);

export function getPublicFile(pathname) {
  const knownFile = publicFiles.get(pathname);

  if (knownFile) {
    return knownFile;
  }

  const voiceMatch = pathname.match(/^\/assets\/voices\/([a-z0-9-]+\.wav)$/);

  if (voiceMatch) {
    return [join("assets", "voices", voiceMatch[1]), "audio/wav"];
  }
}

export async function handleStaticRequest(request, response) {
  const pathname = new URL(request.url, `http://${request.headers.host || host}`).pathname;

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  const publicFile = getPublicFile(pathname);

  if (!publicFile) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const [fileName, contentType] = publicFile;
    const contents = await readFile(join(rootDirectory, fileName));

    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": contents.length
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    console.error(`[${request.method} ${pathname}] ${error.message}`);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Internal server error");
  }
}

export function createStaticServer() {
  return createServer(handleStaticRequest);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createStaticServer().listen(port, host, () => {
    console.log(`JLPT N5 static preview is running at http://${host}:${port}`);
  });
}
