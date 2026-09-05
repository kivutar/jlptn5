import assert from "node:assert/strict";
import test from "node:test";
import {
  createVocabularyWavValidation,
  getWavDurationSeconds,
  trimWavEdgeSilence,
  validateLessonWav
} from "../scripts/wav.js";

function createWav({ audibleSeconds, durationSeconds, leadingSilenceSeconds = 0 }) {
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

  const firstAudibleFrame = Math.floor(leadingSilenceSeconds * sampleRate);
  const lastAudibleFrame = Math.min(
    frameCount,
    firstAudibleFrame + Math.floor(audibleSeconds * sampleRate)
  );

  for (let frame = firstAudibleFrame; frame < lastAudibleFrame; frame += 1) {
    audio.writeInt16LE(frame % 2 === 0 ? 2_000 : -2_000, 44 + frame * blockAlign);
  }

  return audio;
}

function writeSignal(audio, { amplitude, endSeconds, startSeconds }) {
  const sampleRate = audio.readUInt32LE(24);
  const blockAlign = audio.readUInt16LE(32);
  const firstFrame = Math.floor(startSeconds * sampleRate);
  const finalFrame = Math.floor(endSeconds * sampleRate);

  for (let frame = firstFrame; frame < finalFrame; frame += 1) {
    audio.writeInt16LE(
      frame % 2 === 0 ? amplitude : -amplitude,
      44 + frame * blockAlign
    );
  }
}

function readSignalAmplitude(audio, seconds) {
  const sampleRate = audio.readUInt32LE(24);
  const blockAlign = audio.readUInt16LE(32);
  const frame = Math.floor(seconds * sampleRate);

  return Math.abs(audio.readInt16LE(44 + frame * blockAlign));
}

test("lesson WAV validation permits a natural trailing pause", () => {
  const audio = createWav({ audibleSeconds: 2, durationSeconds: 3 });

  assert.equal(validateLessonWav(audio, "日本語です。"), 3);
});

test("lesson WAV validation rejects a 1.5 second silent section", () => {
  const audio = createWav({ audibleSeconds: 2, durationSeconds: 3.5 });

  assert.throws(
    () => validateLessonWav(audio, "日本語です。"),
    /unreasonable silent section/
  );
});

test("lesson WAV validation rejects a long silent section", () => {
  const audio = createWav({ audibleSeconds: 1, durationSeconds: 9.75 });

  assert.throws(
    () => validateLessonWav(audio, "春になりました。そして、段々暖かくなりました。"),
    /unreasonable silent section/
  );
});

test("vocabulary WAV validation accepts a compact word recording", () => {
  const audio = createWav({
    audibleSeconds: 0.8,
    durationSeconds: 1.1,
    leadingSilenceSeconds: 0.1
  });

  assert.equal(
    validateLessonWav(audio, "あめ", createVocabularyWavValidation("あめ")),
    1.1
  );
});

test("vocabulary WAV validation rejects excessive duration and edge silence", () => {
  assert.throws(
    () => validateLessonWav(
      createWav({ audibleSeconds: 0.6, durationSeconds: 3 }),
      "え",
      createVocabularyWavValidation("え")
    ),
    /duration is unreasonable/u
  );
  assert.throws(
    () => validateLessonWav(
      createWav({
        audibleSeconds: 0.5,
        durationSeconds: 1.2,
        leadingSilenceSeconds: 0.5
      }),
      "あめ",
      createVocabularyWavValidation("あめ")
    ),
    /begins with unreasonable silence/u
  );
  assert.throws(
    () => validateLessonWav(
      createWav({ audibleSeconds: 0.5, durationSeconds: 1.1 }),
      "あめ",
      createVocabularyWavValidation("あめ")
    ),
    /ends with unreasonable silence/u
  );
});

test("vocabulary WAV edge trimming preserves speech with a short natural margin", () => {
  const audio = createWav({
    audibleSeconds: 0.5,
    durationSeconds: 1.7,
    leadingSilenceSeconds: 0.5
  });
  const trimmedAudio = trimWavEdgeSilence(audio);

  assert.ok(Math.abs(getWavDurationSeconds(trimmedAudio) - 0.85) < 0.001);
  assert.equal(
    validateLessonWav(trimmedAudio, "あに", createVocabularyWavValidation("あに")),
    getWavDurationSeconds(trimmedAudio)
  );
});

test("vocabulary WAV trimming guarantees enough lead-in when speech starts immediately", () => {
  const audio = createWav({ audibleSeconds: 0.5, durationSeconds: 0.5 });
  const trimmedAudio = trimWavEdgeSilence(audio);

  assert.ok(Math.abs(getWavDurationSeconds(trimmedAudio) - 0.85) < 0.001);
  assert.equal(readSignalAmplitude(trimmedAudio, 0.2), 0);
  assert.equal(readSignalAmplitude(trimmedAudio, 0.26), 2_000);
});

test("vocabulary WAV trimming retains a quiet initial consonant before the strong onset", () => {
  const audio = createWav({
    audibleSeconds: 0.4,
    durationSeconds: 1.2,
    leadingSilenceSeconds: 0.4
  });

  writeSignal(audio, {
    amplitude: 200,
    startSeconds: 0.25,
    endSeconds: 0.4
  });

  const trimmedAudio = trimWavEdgeSilence(audio);

  assert.equal(readSignalAmplitude(trimmedAudio, 0.09), 0);
  assert.equal(readSignalAmplitude(trimmedAudio, 0.11), 200);
  assert.equal(readSignalAmplitude(trimmedAudio, 0.26), 2_000);
});

test("WAV edge trimming leaves silent audio available for rejection", () => {
  const audio = createWav({ audibleSeconds: 0, durationSeconds: 1 });

  assert.equal(trimWavEdgeSilence(audio), audio);
  assert.throws(
    () => validateLessonWav(trimWavEdgeSilence(audio), "あに"),
    /no audible speech/u
  );
});
