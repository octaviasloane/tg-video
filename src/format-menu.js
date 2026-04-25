const STANDARD_HEIGHTS = [144, 240, 360, 480, 720, 1080, 1440, 2160];

function buildMenu(probeInfo) {
  const rows = [];

  if (probeInfo.hasAudio) {
    rows.push([{ label: "🎵 Audio (MP3)", data: "a:mp3" }]);
  }

  if (probeInfo.hasVideo) {
    const max = probeInfo.maxHeight;
    if (max && max > 0) {
      const heights = STANDARD_HEIGHTS.filter((h) => h <= max);
      if (!heights.includes(max)) heights.push(max);

      const videoButtons = heights.map((h) => ({
        label: `🎬 ${h}p`,
        data: `v:${h}`,
      }));

      while (videoButtons.length) {
        rows.push(videoButtons.splice(0, 2));
      }
    } else {
      rows.push([{ label: "🎬 Best video", data: "v:0" }]);
    }
  }

  rows.push([{ label: "❌ Cancel", data: "cancel" }]);
  return rows;
}

module.exports = { buildMenu };
