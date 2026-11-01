#!/usr/bin/env node
// 词频阅读室的本地伴生服务：
// 1. 把本目录通过 http://127.0.0.1 提供出去（浏览器需要同源才能保存偏好与词表）；
// 2. 读取 GoldenDict 已经在用的 MDX 词典，提供完全离线的查词接口。

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MDX } from "./vendor/jsdict/node_modules/js-mdict/dist/esm/index.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(ROOT, "dictionaries.json");
const PORT_FILE = path.join(ROOT, ".local-server.json");
const GOLDENDICT_CONFIG = path.join(process.env.HOME || "/root", ".config/goldendict/config");
const MAX_OPEN_DICTIONARIES = 5;
const MAX_ARTICLE_CHARS = 60000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

const dictionaryIndex = new Map();
const openDictionaries = new Map();
let dictionaryList = [];
let configRoots = [];

function log(...args) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);
}

function readGoldendictRoots() {
  try {
    const raw = fs.readFileSync(GOLDENDICT_CONFIG, "utf8");
    return [...raw.matchAll(/<path[^>]*>([^<]+)<\/path>/g)]
      .map((match) => match[1].trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function loadConfig() {
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    saved = {};
  }

  configRoots = [...new Set([...(saved.roots || []), ...readGoldendictRoots()].filter(Boolean))];

  if (saved.roots === undefined) {
    try {
      fs.writeFileSync(CONFIG_PATH, `${JSON.stringify({ roots: configRoots, exclude: [] }, null, 2)}\n`);
      log("已生成默认词典配置", CONFIG_PATH);
    } catch {
      // 目录只读时也能用内存里的 roots 继续工作。
    }
  }
}

function directionLabel(fileName) {
  if (/日|国語|国语|動詞|明鏡|明镜|大修館/.test(fileName)) return "ja";
  if (/医学|药学|中医药|medical/i.test(fileName)) return "medical";
  if (/搭配|collocation/i.test(fileName)) return "collocation";
  if (/英汉|汉英|英中|双解|英-汉|汉-英/.test(fileName)) return "bilingual";
  if (/英-英|english|longman|oxford|webster|ldoce|oald/i.test(fileName)) return "en-en";
  if (/词源|词根|词缀|rootsaffixes/i.test(fileName)) return "roots";
  return "other";
}

function scanDictionaries() {
  dictionaryIndex.clear();

  for (const root of configRoots) {
    if (!fs.existsSync(root)) continue;

    let entries = [];
    try {
      entries = fs.readdirSync(root, { recursive: true, withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".mdx")) continue;

      const file = path.join(entry.parentPath || entry.path, entry.name);
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        continue;
      }

      const rel = path.relative(root, file);
      // 直接用路径做 id：放进查询串时由 URLSearchParams 负责编码。
      const id = file;
      dictionaryIndex.set(id, {
        id,
        name: path.basename(entry.name, ".mdx"),
        detail: rel === entry.name ? "" : path.dirname(rel),
        direction: directionLabel(entry.name),
        size: stat.size,
        file,
      });
    }
  }

  const order = ["bilingual", "en-en", "collocation", "roots", "medical", "other", "ja"];
  dictionaryList = [...dictionaryIndex.values()].sort((a, b) => {
    const rank = order.indexOf(a.direction) - order.indexOf(b.direction);
    if (rank !== 0) return rank;
    return a.name.localeCompare(b.name, "zh-CN");
  });
  return dictionaryList;
}

function openDictionary(id) {
  const cached = openDictionaries.get(id);
  if (cached) {
    openDictionaries.delete(id);
    openDictionaries.set(id, cached);
    return cached;
  }

  const entry = dictionaryIndex.get(id);
  if (!entry) return null;

  while (openDictionaries.size >= MAX_OPEN_DICTIONARIES) {
    openDictionaries.delete(openDictionaries.keys().next().value);
  }

  const started = Date.now();
  const mdx = new MDX(entry.file);
  log(`载入词典 ${entry.name}（${Date.now() - started}ms）`);
  openDictionaries.set(id, mdx);
  return mdx;
}

function wordVariants(word) {
  const base = word.toLowerCase().replace(/[’]/g, "'").replace(/'s$/, "");
  const variants = [base];
  const add = (value) => {
    if (value && value.length > 2 && !variants.includes(value)) variants.push(value);
  };

  add(base.replace(/ies$/, "y"));
  add(base.replace(/es$/, ""));
  add(base.replace(/s$/, ""));
  add(base.replace(/ed$/, ""));
  add(base.replace(/ed$/, "e"));
  add(base.replace(/ing$/, ""));
  add(base.replace(/ing$/, "e"));
  add(base.replace(/ly$/, ""));
  add(base.replace(/ier$/, "y"));
  add(base.replace(/iest$/, "y"));
  add(base.replace(/er$/, ""));
  add(base.replace(/est$/, ""));
  add(`${base}e`);

  return variants;
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function toTextLines(html) {
  return decodeEntities(
    html
      .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(script|style|link|img|source|audio|video|iframe|object|embed)\b[^>]*>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6]|dd|dt|td|span|section)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .split("\n")
    .map((line) => line.replace(/[ \t　]+/g, " ").trim())
    .filter(Boolean);
}

function sanitizeArticle(html) {
  return html
    .replace(/<(script|style|iframe|object|embed|audio|video|link|meta|base)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|audio|video|link|meta|base|img|source)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "#")
    .slice(0, MAX_ARTICLE_CHARS);
}

// 有些 MDX 的词条只是 @@@LINK=目标词，需要跟随到真正的词条。
function followRedirect(mdx, definition, depth = 0) {
  const trimmed = definition.trim();
  if (!trimmed.startsWith("@@@LINK=") || depth > 3) return null;

  const target = trimmed
    .slice("@@@LINK=".length)
    .split(/[\r\n]/)[0]
    .replace(/〖.*?〗/g, "")
    .replace(/\s.*$/, "")
    .trim();

  if (!target) return null;

  const redirected = mdx.lookup(target);
  if (!redirected || !redirected.definition) return null;
  return { definition: redirected.definition, key: redirected.keyText || target };
}

const SENSE_NOISE = [
  /^[\s\d★☆●○◆▪•·.、，,;:：!?'"“”()[\]{}<>《》\-—–_/\\|]*$/, // 纯序号、星级与符号
  /^[A-Za-z]{1,2}$/,
  /^[A-Z]{1,6}$/, // 词性代码：VERB / ADJ / NOUN
  /^from\s+longman/i,
  /^related topics?:/i,
  /^(derived words?|phrases?|collocations?|examples?|compounds?)\s*:?$/i,
];

function isNoisySense(line) {
  return SENSE_NOISE.some((pattern) => pattern.test(line));
}

// 词典行常常中英混排（“英文释义 中文释义”），拆成可分别选取的两段。
const CJK_CHAR = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/;
// 中文/全角标点不切段，跟着所属语言一起保留。
const CJK_PUNCT = /[\u3000-\u303f\uff00-\uffef]/;

function splitSenseParts(line) {
  const raw = [];
  let buffer = "";
  let currentLang = "";

  const trimEdges = (value) =>
    value.replace(/^[\s:：·・\-—–.,，。;；、]+|[\s:：·・\-—–.,，。;；、]+$/g, "");

  const flush = () => {
    const text = trimEdges(buffer);
    if (text && currentLang) raw.push({ lang: currentLang, text });
    buffer = "";
  };

  for (const char of line) {
    if (CJK_CHAR.test(char)) {
      if (currentLang !== "zh") flush();
      currentLang = "zh";
    } else if (!CJK_PUNCT.test(char)) {
      if (currentLang !== "en") flush();
      currentLang = "en";
    }
    buffer += char;
  }
  flush();

  // 合并相邻的同语言片段，并丢掉夹在中间的零星英文（如 “n.”）。
  const merged = [];
  for (const part of raw) {
    const last = merged[merged.length - 1];
    if (last && last.lang === part.lang) last.text += part.text;
    else merged.push({ lang: part.lang, text: part.text });
  }

  return merged
    .map((part) => ({ lang: part.lang, text: trimEdges(part.text) }))
    .filter((part) => part.text.length > 1)
    .filter((part, index, all) => !(part.lang === "en" && part.text.length <= 3 && all.length > 1));
}

function senseFromLine(line) {
  const parts = splitSenseParts(line);
  return { text: line, parts: parts.length ? parts : [{ lang: "en", text: line }] };
}

function extractSenses(definition, headword) {
  const lines = toTextLines(definition);
  const flatHeadword = (headword || "").replace(/[^a-z]/gi, "").toLowerCase();
  const senses = [];
  const seen = new Set();

  for (let line of lines) {
    if (/^[/|].*[/|]$/.test(line)) continue; // 纯音标行
    if (isNoisySense(line)) continue;
    if (line.length < 3) continue;
    if (line.length > 400) line = `${line.slice(0, 400)}…`;

    const dedupeKey = line.toLowerCase();
    if (seen.has(dedupeKey)) continue;

    const isHeadword = flatHeadword && line.replace(/[^a-z]/gi, "").toLowerCase() === flatHeadword;
    if (isHeadword) continue;

    seen.add(dedupeKey);
    senses.push(senseFromLine(line));
    if (senses.length >= 16) break;
  }

  return senses;
}

function lookupInDictionary(id, rawWord) {
  const entry = dictionaryIndex.get(id);
  if (!entry) return null;

  let mdx;
  try {
    mdx = openDictionary(id);
  } catch (error) {
    return { id, name: entry.name, error: `无法读取词典：${error.message}` };
  }
  if (!mdx) return null;

  let definition = "";
  let matchedKey = "";

  for (const candidate of wordVariants(rawWord)) {
    try {
      const found = mdx.lookup(candidate);
      if (found && found.definition) {
        definition = found.definition;
        matchedKey = found.keyText || candidate;
        break;
      }
    } catch {
      // 个别词条损坏时继续尝试其他候选形式。
    }
  }

  if (!definition) return { id, name: entry.name, direction: entry.direction, found: false };

  const redirected = followRedirect(mdx, definition);
  if (redirected) {
    definition = redirected.definition;
    matchedKey = redirected.key || matchedKey;
  }

  const senses = extractSenses(definition, matchedKey || rawWord);
  const list = senses.length ? senses : toTextLines(definition).slice(0, 8).map(senseFromLine);

  return {
    id,
    name: entry.name,
    direction: entry.direction,
    found: true,
    key: matchedKey,
    // senses 保持为纯字符串，旧版前端也能正常显示；语言分段放在并行的 senseParts 里。
    senses: list.map((sense) => sense.text),
    senseParts: list.map((sense) => sense.parts),
    article: sanitizeArticle(definition),
  };
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    // 允许 file:// 打开的页面直接调用本服务。
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function serveStatic(response, pathname) {
  const relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const target = path.join(ROOT, relative);

  if (!target.startsWith(ROOT)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.stat(target, (error, stat) => {
    if (error || !stat.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "Content-Length": stat.size,
    });
    fs.createReadStream(target).pipe(response);
  });
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
  const { pathname } = url;

  try {
    if (pathname === "/api/health") {
      sendJson(response, 200, { ok: true, dictionaries: dictionaryIndex.size, roots: configRoots });
      return;
    }

    if (pathname === "/api/dictionaries") {
      sendJson(response, 200, {
        ok: true,
        roots: configRoots,
        dictionaries: dictionaryList.map((entry) => ({
          id: entry.id,
          name: entry.name,
          detail: entry.detail,
          direction: entry.direction,
          size: entry.size,
        })),
      });
      return;
    }

    if (pathname === "/api/lookup") {
      const word = (url.searchParams.get("word") || "").trim().slice(0, 120);
      const ids = url.searchParams.getAll("dict");
      if (!word) {
        sendJson(response, 400, { ok: false, error: "缺少单词" });
        return;
      }

      const started = Date.now();
      const results = [];
      for (const id of ids) {
        const result = lookupInDictionary(id, word);
        if (result) results.push(result);
      }

      sendJson(response, 200, { ok: true, word, elapsed: Date.now() - started, results });
      return;
    }

    if (pathname === "/api/open-goldendict" && request.method === "POST") {
      let word = "";
      try {
        word = JSON.parse((await readBody(request)) || "{}").word;
      } catch {
        word = "";
      }

      if (!word) {
        sendJson(response, 400, { ok: false, error: "缺少单词" });
        return;
      }

      const child = spawn("goldendict", [String(word).slice(0, 120)], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      sendJson(response, 200, { ok: true });
      return;
    }

    if (pathname.startsWith("/api/")) {
      sendJson(response, 404, { ok: false, error: "未知接口" });
      return;
    }

    serveStatic(response, pathname);
  } catch (error) {
    log("请求出错", error);
    if (!response.headersSent) sendJson(response, 500, { ok: false, error: error.message });
  }
});

function writePortFile(port) {
  try {
    fs.writeFileSync(PORT_FILE, `${JSON.stringify({ port, pid: process.pid }, null, 2)}\n`);
  } catch {
    // 写不进去时，启动脚本退回到逐个端口探测。
  }
}

function listen(port, attemptsLeft) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    log("启动失败", error.message);
    process.exit(1);
  });

  server.listen(port, "127.0.0.1", () => {
    writePortFile(port);
    log(`阅读室词典服务已启动 http://127.0.0.1:${port}/`);
  });
}

loadConfig();
scanDictionaries();
log(`发现 ${dictionaryIndex.size} 部 MDX 词典，根目录 ${configRoots.length} 个`);

listen(Number(process.argv[2] || process.env.PORT || 8765), 20);

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
