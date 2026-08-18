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

function getLongestSilenceSeconds(audio, wav) {
  const silenceThreshold = 328;
  const windowFrameCount = Math.max(1, Math.floor(wav.sampleRate * 0.05));
  const windowByteCount = windowFrameCount * wav.blockAlign;
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

    if (rootMeanSquare <= silenceThreshold) {
      consecutiveSilence += windowDuration;
      longestSilence = Math.max(longestSilence, consecutiveSilence);
    } else {
      consecutiveSilence = 0;
    }
  }

  return longestSilence;
}

export function getWavDurationSeconds(audio) {
  return inspectLessonWav(audio).duration;
}

export function validateLessonWav(audio, text) {
  const wav = inspectLessonWav(audio);
  const { dataOffset, duration } = wav;
  const maximumDuration = text ? Math.max(8, [...text].length * 0.5) : 30;

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

  const longestSilence = getLongestSilenceSeconds(audio, wav);

  if (longestSilence > 1.251) {
    throw new Error(
      `WAV contains an unreasonable silent section (${longestSilence.toFixed(1)} seconds).`
    );
  }

  return duration;
}
