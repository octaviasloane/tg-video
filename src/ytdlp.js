const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const logger = require("./logger");

const COOKIE_HINTS = [
  "cookies",
  "sign in",
  "log in",
  "login required",
  "private video",
  "members-only",
  "age-restricted",
  "confirm you're not a bot",
  "not a bot",
  "http error 403",
  "http error 401",
  "http error 410",
  "this video is unavailable",
  "subscribers only",
  "premium",
];

function looksLikeCookieIssue(stderr) {
  const lower = (stderr || "").toLowerCase();
  return COOKIE_HINTS.some((h) => lower.includes(h));
}

function runYtDlp(args, { onStdout, onStderr, timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    logger.debug("yt-dlp args:", args.join(" "));
    const child = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const to = timeoutMs
      ? setTimeout(() => {
          killed = true;
          child.kill("SIGKILL");
        }, timeoutMs)
      : null;

    child.stdout.on("data", (chunk) => {
      const s = chunk.toString();
      stdout += s;
      if (onStdout) onStdout(s);
    });
    child.stderr.on("data", (chunk) => {
      const s = chunk.toString();
      stderr += s;
      if (onStderr) onStderr(s);
    });
    child.on("error", (err) => {
      if (to) clearTimeout(to);
      reject(err);
    });
    child.on("close", (code) => {
      if (to) clearTimeout(to);
      if (killed) {
        return reject(new Error("yt-dlp timed out"));
      }
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        const err = new Error(
          `yt-dlp exited with code ${code}: ${stderr.trim().slice(-500)}`,
        );
        err.stderr = stderr;
        err.code = code;
        err.cookieIssue = looksLikeCookieIssue(stderr);
        reject(err);
      }
    });
  });
}

const YT_EXTRACTOR_ARGS = "youtube:player_client=tv,default,mweb";

async function probe(url, cookiesPath) {
  const args = [
    "-J",
    "--no-playlist",
    "--no-warnings",
    "--extractor-args",
    YT_EXTRACTOR_ARGS,
  ];
  if (cookiesPath) args.push("--cookies", cookiesPath);
  args.push(url);

  const { stdout } = await runYtDlp(args, { timeoutMs: 60_000 });
  let data;
  try {
    data = JSON.parse(stdout);
  } catch (e) {
    throw new Error("Failed to parse yt-dlp metadata output");
  }

  const formats = Array.isArray(data.formats) ? data.formats : [];

  const isAudioOnly = (f) =>
    f.vcodec === "none" && f.acodec && f.acodec !== "none";
  const isVideoCandidate = (f) => !isAudioOnly(f);

  const heights = formats
    .filter(isVideoCandidate)
    .map((f) => f.height)
    .filter((h) => typeof h === "number" && h > 0);
  const maxHeight = heights.length ? Math.max(...heights) : 0;

  const hasVideo = formats.some(isVideoCandidate) || formats.length > 0;
  const hasAudio = true;

  return {
    title: data.title || "video",
    duration: data.duration || 0,
    extractor: data.extractor || data.extractor_key || "",
    maxHeight,
    hasVideo,
    hasAudio,
    isLive: !!data.is_live,
  };
}

function buildVideoFormat(maxHeight) {
  if (!maxHeight || maxHeight <= 0) {
    return "bv*+ba/b/best";
  }
  return `bv*[height<=${maxHeight}]+ba/b[height<=${maxHeight}]/best`;
}

async function downloadVideo({
  url,
  jobDir,
  maxHeight,
  cookiesPath,
  onProgress,
}) {
  fs.mkdirSync(jobDir, { recursive: true });
  const args = [
    "-f",
    buildVideoFormat(maxHeight),
    "--merge-output-format",
    "mp4",
    "--restrict-filenames",
    "--no-playlist",
    "--newline",
    "--no-warnings",
    "--extractor-args",
    YT_EXTRACTOR_ARGS,
    "-o",
    path.join(jobDir, "%(title).100B.%(ext)s"),
  ];
  if (cookiesPath) args.unshift("--cookies", cookiesPath);
  args.push(url);

  await runYtDlp(args, {
    timeoutMs: 60 * 60 * 1000,
    onStdout: (s) => parseProgress(s, onProgress),
  });
  return findOutputFile(jobDir);
}

async function downloadAudio({ url, jobDir, cookiesPath, onProgress }) {
  fs.mkdirSync(jobDir, { recursive: true });
  const args = [
    "-f",
    "bestaudio/best",
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "--restrict-filenames",
    "--no-playlist",
    "--newline",
    "--no-warnings",
    "--extractor-args",
    YT_EXTRACTOR_ARGS,
    "-o",
    path.join(jobDir, "%(title).100B.%(ext)s"),
  ];
  if (cookiesPath) args.unshift("--cookies", cookiesPath);
  args.push(url);

  await runYtDlp(args, {
    timeoutMs: 60 * 60 * 1000,
    onStdout: (s) => parseProgress(s, onProgress),
  });
  return findOutputFile(jobDir);
}

function parseProgress(chunk, onProgress) {
  if (!onProgress) return;
  const lines = chunk.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
    if (m) {
      onProgress(parseFloat(m[1]));
    }
  }
}

function findOutputFile(jobDir) {
  const entries = fs
    .readdirSync(jobDir)
    .filter((n) => !n.endsWith(".part") && !n.endsWith(".ytdl"));
  if (entries.length === 0) {
    throw new Error("No output file produced by yt-dlp");
  }
  const stats = entries.map((n) => {
    const p = path.join(jobDir, n);
    return { p, size: fs.statSync(p).size };
  });
  stats.sort((a, b) => b.size - a.size);
  return stats[0].p;
}

module.exports = {
  probe,
  downloadVideo,
  downloadAudio,
  looksLikeCookieIssue,
};
