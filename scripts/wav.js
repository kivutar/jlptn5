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

  if (!byteRate) {
    throw new Error("WAV has an invalid byte rate.");
  }

  return {
    dataOffset: 44,
    duration: (audio.length - 44) / byteRate
  };
}

export function getWavDurationSeconds(audio) {
  return inspectLessonWav(audio).duration;
}

export function validateLessonWav(audio, text) {
  const { dataOffset, duration } = inspectLessonWav(audio);
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

  return duration;
}
