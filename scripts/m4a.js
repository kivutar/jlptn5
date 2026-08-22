import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { validateLessonWav } from "./wav.js";

const execFileAsync = promisify(execFile);
const encodedBitRate = "48k";

async function runFfmpeg(arguments_) {
  try {
    await execFileAsync("ffmpeg", arguments_, { maxBuffer: 1024 * 1024 });
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("FFmpeg is required to prepare lesson audio.");
    }

    const detail = error.stderr?.trim();
    throw new Error(detail || `FFmpeg failed with exit code ${error.code}.`);
  }
}

function temporaryPath(extension) {
  return join(tmpdir(), `chakuchaku-audio-${process.pid}-${randomUUID()}${extension}`);
}

export async function validateLessonM4a(path, text, validationOptions) {
  const decodedPath = temporaryPath(".wav");

  try {
    await runFfmpeg([
      "-hide_banner",
      "-loglevel", "error",
      "-y",
      "-i", path,
      "-vn",
      "-ac", "1",
      "-c:a", "pcm_s16le",
      "-bitexact",
      "-map_metadata", "-1",
      decodedPath
    ]);
    return validateLessonWav(await readFile(decodedPath), text, validationOptions);
  } finally {
    await rm(decodedPath, { force: true });
  }
}

export async function validLessonM4aExists(path, text, validationOptions) {
  try {
    await access(path);
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }

  await validateLessonM4a(path, text, validationOptions);
  return true;
}

export async function encodeLessonM4a(wavAudio, destination, text, validationOptions) {
  validateLessonWav(wavAudio, text, validationOptions);

  const inputPath = temporaryPath(".wav");
  const encodedPath = join(
    dirname(destination),
    `.${basename(destination)}.${process.pid}.${randomUUID()}.m4a`
  );

  try {
    await writeFile(inputPath, wavAudio, { mode: 0o600 });
    await runFfmpeg([
      "-hide_banner",
      "-loglevel", "error",
      "-y",
      "-i", inputPath,
      "-vn",
      "-ac", "1",
      "-c:a", "aac",
      "-b:a", encodedBitRate,
      "-movflags", "+faststart",
      encodedPath
    ]);
    await validateLessonM4a(encodedPath, text, validationOptions);
    await rename(encodedPath, destination);
  } finally {
    await Promise.all([
      rm(inputPath, { force: true }),
      rm(encodedPath, { force: true })
    ]);
  }
}
