const silenceThreshold = 328;

function inspectLessonWav(audio) {
  if (
    audio.length <= 44 ||
    audio.subarray(0, 4).toString("ascii") !== "RIFF" ||
    audio.subarray(8, 12).toString("ascii") !== "WAVE" ||
    audio.subarray(12, 16).toString("ascii") !== "fmt " ||
    audio.subarray(36, 40).toString("ascii") !== "data"
  ) {
    throw new Error("Audio is not a non-empty PCM WAV file.");
  }

  const byteRate = audio.readUInt32LE(28);
  const sampleRate = audio.readUInt32LE(24);
  const channelCount = audio.readUInt16LE(22);
  const blockAlign = audio.readUInt16LE(32);
  const bitsPerSample = audio.readUInt16LE(34);

  if (
    !byteRate ||
    !sampleRate ||
    !channelCount ||
    !blockAlign ||
    bitsPerSample !== 16
  ) {
    throw new Error("WAV must contain valid 16-bit PCM audio.");
  }

  return {
    blockAlign,
    channelCount,
    dataOffset: 44,
    duration: (audio.length - 44) / byteRate,
    sampleRate
  };
}

function getSilenceDurations(audio, wav) {
  const windowFrameCount = Math.max(1, Math.floor(wav.sampleRate * 0.05));
  const windowByteCount = windowFrameCount * wav.blockAlign;
  const windows = [];
  let consecutiveSilence = 0;
  let longestSilence = 0;

  for (
    let windowOffset = wav.dataOffset;
    windowOffset < audio.length;
    windowOffset += windowByteCount
  ) {
    const windowEnd = Math.min(audio.length, windowOffset + windowByteCount);
    let sampleSquareTotal = 0;
    let sampleCount = 0;

    for (let frameOffset = windowOffset; frameOffset + wav.blockAlign <= windowEnd; frameOffset += wav.blockAlign) {
      for (let channel = 0; channel < wav.channelCount; channel += 1) {
        const sample = audio.readInt16LE(frameOffset + channel * 2);
        sampleSquareTotal += sample * sample;
        sampleCount += 1;
      }
    }

    const rootMeanSquare = Math.sqrt(sampleSquareTotal / sampleCount);
    const windowDuration = sampleCount / wav.channelCount / wav.sampleRate;
    const silent = rootMeanSquare <= silenceThreshold;

    windows.push({ duration: windowDuration, silent });

    if (silent) {
      consecutiveSilence += windowDuration;
      longestSilence = Math.max(longestSilence, consecutiveSilence);
    } else {
      consecutiveSilence = 0;
    }
  }

  let leadingSilence = 0;
  let trailingSilence = 0;

  for (const window of windows) {
    if (!window.silent) {
      break;
    }

    leadingSilence += window.duration;
  }

  for (const window of windows.toReversed()) {
    if (!window.silent) {
      break;
    }

    trailingSilence += window.duration;
  }

  return { leadingSilence, longestSilence, trailingSilence };
}

export function getWavDurationSeconds(audio) {
  return inspectLessonWav(audio).duration;
}

export function trimWavEdgeSilence(audio, { paddingSeconds = 0.1 } = {}) {
  const wav = inspectLessonWav(audio);
  const frameCount = Math.floor((audio.length - wav.dataOffset) / wav.blockAlign);
  let firstAudibleFrame;
  let lastAudibleFrame;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const frameOffset = wav.dataOffset + frame * wav.blockAlign;
    let framePeak = 0;

    for (let channel = 0; channel < wav.channelCount; channel += 1) {
      framePeak = Math.max(
        framePeak,
        Math.abs(audio.readInt16LE(frameOffset + channel * 2))
      );
    }

    if (framePeak > silenceThreshold) {
      firstAudibleFrame ??= frame;
      lastAudibleFrame = frame;
    }
  }

  if (firstAudibleFrame === undefined) {
    return audio;
  }

  const paddingFrameCount = Math.max(0, Math.floor(paddingSeconds * wav.sampleRate));
  const firstFrame = Math.max(0, firstAudibleFrame - paddingFrameCount);
  const finalFrame = Math.min(frameCount, lastAudibleFrame + 1 + paddingFrameCount);

  if (firstFrame === 0 && finalFrame === frameCount) {
    return audio;
  }

  const firstByte = wav.dataOffset + firstFrame * wav.blockAlign;
  const finalByte = wav.dataOffset + finalFrame * wav.blockAlign;
  const dataSize = finalByte - firstByte;
  const trimmedAudio = Buffer.alloc(wav.dataOffset + dataSize);

  audio.copy(trimmedAudio, 0, 0, wav.dataOffset);
  audio.copy(trimmedAudio, wav.dataOffset, firstByte, finalByte);
  trimmedAudio.writeUInt32LE(trimmedAudio.length - 8, 4);
  trimmedAudio.writeUInt32LE(dataSize, 40);

  return trimmedAudio;
}

function getVocabularyMoraCount(reading) {
  const combiningKana = new Set([
    "ぁ", "ぃ", "ぅ", "ぇ", "ぉ", "ゃ", "ゅ", "ょ", "ゎ",
    "ァ", "ィ", "ゥ", "ェ", "ォ", "ャ", "ュ", "ョ", "ヮ"
  ]);

  return Math.max(1, [...reading].filter((character) => {
    return character !== "～" && !/\s/u.test(character) && !combiningKana.has(character);
  }).length);
}

export function createVocabularyWavValidation(reading) {
  const moraCount = getVocabularyMoraCount(reading);

  return {
    minimumDuration: 0.2,
    maximumDuration: Math.max(1.6, moraCount * 0.45 + 0.8),
    maximumLeadingSilence: 0.451,
    maximumSilence: 0.651,
    maximumTrailingSilence: 0.451
  };
}

export function validateLessonWav(audio, text, options = {}) {
  const wav = inspectLessonWav(audio);
  const { dataOffset, duration } = wav;
  const {
    minimumDuration = 0,
    maximumDuration = text ? Math.max(8, [...text].length * 0.5) : 30,
    maximumLeadingSilence = Number.POSITIVE_INFINITY,
    maximumSilence = 1.251,
    maximumTrailingSilence = Number.POSITIVE_INFINITY
  } = options;

  if (duration < minimumDuration) {
    throw new Error(`WAV duration is too short (${duration.toFixed(1)} seconds).`);
  }

  if (duration > maximumDuration) {
    throw new Error(`WAV duration is unreasonable (${duration.toFixed(1)} seconds).`);
  }

  let peakAmplitude = 0;

  for (let offset = dataOffset; offset + 1 < audio.length; offset += 2) {
    peakAmplitude = Math.max(peakAmplitude, Math.abs(audio.readInt16LE(offset)));
  }

  if (peakAmplitude < 100) {
    throw new Error("WAV contains no audible speech.");
  }

  const {
    leadingSilence,
    longestSilence,
    trailingSilence
  } = getSilenceDurations(audio, wav);

  if (leadingSilence > maximumLeadingSilence) {
    throw new Error(
      `WAV begins with unreasonable silence (${leadingSilence.toFixed(1)} seconds).`
    );
  }

  if (trailingSilence > maximumTrailingSilence) {
    throw new Error(
      `WAV ends with unreasonable silence (${trailingSilence.toFixed(1)} seconds).`
    );
  }

  if (longestSilence > maximumSilence) {
    throw new Error(
      `WAV contains an unreasonable silent section (${longestSilence.toFixed(1)} seconds).`
    );
  }

  return duration;
}
