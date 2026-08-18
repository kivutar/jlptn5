import assert from "node:assert/strict";
import test from "node:test";
import { validateLessonWav } from "../scripts/wav.js";

function createWav({ audibleSeconds, durationSeconds }) {
  const sampleRate = 24_000;
  const channelCount = 1;
  const bitsPerSample = 16;
  const blockAlign = channelCount * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const frameCount = Math.floor(durationSeconds * sampleRate);
  const dataSize = frameCount * blockAlign;
  const audio = Buffer.alloc(44 + dataSize);

  audio.write("RIFF", 0, "ascii");
  audio.writeUInt32LE(audio.length - 8, 4);
  audio.write("WAVE", 8, "ascii");
  audio.write("fmt ", 12, "ascii");
  audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20);
  audio.writeUInt16LE(channelCount, 22);
  audio.writeUInt32LE(sampleRate, 24);
  audio.writeUInt32LE(byteRate, 28);
  audio.writeUInt16LE(blockAlign, 32);
  audio.writeUInt16LE(bitsPerSample, 34);
  audio.write("data", 36, "ascii");
  audio.writeUInt32LE(dataSize, 40);

  for (let frame = 0; frame < audibleSeconds * sampleRate; frame += 1) {
    audio.writeInt16LE(frame % 2 === 0 ? 2_000 : -2_000, 44 + frame * blockAlign);
  }

  return audio;
}

test("lesson WAV validation permits a natural trailing pause", () => {
  const audio = createWav({ audibleSeconds: 2, durationSeconds: 3.5 });

  assert.equal(validateLessonWav(audio, "日本語です。"), 3.5);
});

test("lesson WAV validation rejects a long silent section", () => {
  const audio = createWav({ audibleSeconds: 1, durationSeconds: 9.75 });

  assert.throws(
    () => validateLessonWav(audio, "春になりました。そして、段々暖かくなりました。"),
    /unreasonable silent section/
  );
});
