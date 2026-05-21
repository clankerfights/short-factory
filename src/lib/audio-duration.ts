export function mp3DurationSeconds(buffer: Buffer): number | null {
  let offset = id3v2Size(buffer);
  let duration = 0;
  let frames = 0;

  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }

    const header = parseMp3Header(buffer, offset);
    if (!header) {
      offset += 1;
      continue;
    }

    duration += header.samplesPerFrame / header.sampleRate;
    frames += 1;
    offset += header.frameLength;
  }

  return frames > 0 ? duration : null;
}

function id3v2Size(buffer: Buffer): number {
  if (buffer.length < 10 || buffer.toString("utf8", 0, 3) !== "ID3") return 0;
  const size =
    ((buffer[6] & 0x7f) << 21) |
    ((buffer[7] & 0x7f) << 14) |
    ((buffer[8] & 0x7f) << 7) |
    (buffer[9] & 0x7f);
  return 10 + size;
}

function parseMp3Header(buffer: Buffer, offset: number) {
  const byte1 = buffer[offset + 1];
  const byte2 = buffer[offset + 2];
  const versionBits = (byte1 >> 3) & 0x03;
  const layerBits = (byte1 >> 1) & 0x03;
  const bitrateIndex = (byte2 >> 4) & 0x0f;
  const sampleRateIndex = (byte2 >> 2) & 0x03;
  const padding = (byte2 >> 1) & 0x01;
  if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
    return null;
  }

  const version = versionBits === 3 ? "mpeg1" : "mpeg2";
  const bitrate = (version === "mpeg1" ? BITRATES_MPEG1_LAYER3 : BITRATES_MPEG2_LAYER3)[bitrateIndex] * 1000;
  const sampleRate = SAMPLE_RATES[versionBits][sampleRateIndex];
  const samplesPerFrame = version === "mpeg1" ? 1152 : 576;
  const frameLength = Math.floor((samplesPerFrame / 8 * bitrate) / sampleRate) + padding;
  if (!Number.isFinite(frameLength) || frameLength <= 4) return null;
  return { frameLength, sampleRate, samplesPerFrame };
}

const BITRATES_MPEG1_LAYER3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
] as const;
const BITRATES_MPEG2_LAYER3 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
] as const;
const SAMPLE_RATES: Record<number, readonly number[]> = {
  0: [11025, 12000, 8000],
  2: [22050, 24000, 16000],
  3: [44100, 48000, 32000],
};
