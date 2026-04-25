const fs = require("fs");
const path = require("path");
const config = require("./config");

function cookiesPathFor(userId) {
  return path.join(config.cookiesDir, `${userId}.txt`);
}

function getCookiesPath(userId) {
  const p = cookiesPathFor(userId);
  return fs.existsSync(p) ? p : null;
}

function isValidCookiesText(text) {
  if (!text || typeof text !== "string") return false;
  if (text.length < 50) return false;
  const lines = text.split(/\r?\n/);
  const dataLines = lines.filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (dataLines.length === 0) return false;
  return dataLines.some((l) => {
    const fields = l.split(/\t|\s{2,}/).filter((f) => f.length > 0);
    if (fields.length < 6) return false;
    const hasDomain = fields.some((f) => /^\.?[a-z0-9.-]+\.[a-z]{2,}$/i.test(f));
    const hasBool = fields.some((f) => f === "TRUE" || f === "FALSE");
    return hasDomain && hasBool;
  });
}

function normalizeCookiesText(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push("");
      continue;
    }
    if (trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    if (line.includes("\t")) {
      out.push(line);
      continue;
    }
    const fields = line.split(/\s{2,}|\s+/).filter((f) => f.length > 0);
    if (fields.length >= 7) {
      out.push(fields.slice(0, 7).join("\t"));
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

function saveCookies(userId, text) {
  const p = cookiesPathFor(userId);
  const normalized = normalizeCookiesText(text);
  fs.writeFileSync(p, normalized, { mode: 0o600 });
  return p;
}

function deleteCookies(userId) {
  const p = cookiesPathFor(userId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

module.exports = {
  getCookiesPath,
  saveCookies,
  deleteCookies,
  isValidCookiesText,
};
