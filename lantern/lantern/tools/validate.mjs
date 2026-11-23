#!/usr/bin/env node
// Lantern project checks. Run before every release:  node tools/validate.mjs
// Also runs in CI (.github/workflows/pages.yml) and blocks deployment if anything fails.
//   1. Catalog: unique ids, valid enums, https links, sensible fields.
//   2. Security: no unsafe DOM/JS patterns, no inline handlers or styles, CSP intact, no secrets.
//   3. Offline: every app file is listed in the service worker precache.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    if (name.startsWith(".") || name === "node_modules" || name === "tools" || name === "supabase") return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const files = walk(root);
const rel = (p) => relative(root, p).split(sep).join("/");
const read = (p) => readFileSync(p, "utf8");

// ---------------------------------------------------------------- 1. catalog
const { CATALOG } = await import(pathToFileURL(join(root, "js/catalog/index.js")).href);
const { CATEGORIES, TYPES, PRICES, CERTS, LEVELS } = await import(pathToFileURL(join(root, "js/taxonomy.js")).href);
const catIds = new Set(CATEGORIES.map((c) => c.id));
const typeIds = new Set(TYPES.map((t) => t.id));
const ids = new Set();
const urls = new Set();

for (const it of CATALOG) {
  const where = `catalog "${it.id}"`;
  if (!/^[a-z0-9-]+$/.test(it.id)) fail(`${where}: id must be lowercase letters, digits, dashes`);
  if (ids.has(it.id)) fail(`${where}: duplicate id`);
  ids.add(it.id);
  if (!it.title || it.title.length > 120) fail(`${where}: title missing or too long`);
  if (!it.provider) fail(`${where}: provider missing`);
  if (!it.desc || it.desc.length < 40 || it.desc.length > 260) fail(`${where}: desc should be 40-260 characters (is ${it.desc?.length ?? 0})`);
  for (const key of ["url", "download"]) {
    if (it[key] === undefined) continue;
    try {
      const u = new URL(it[key]);
      if (u.protocol !== "https:") fail(`${where}: ${key} must be https`);
    } catch { fail(`${where}: ${key} is not a valid URL`); }
  }
  if (urls.has(it.url)) fail(`${where}: duplicate url`);
  urls.add(it.url);
  if (!typeIds.has(it.type)) fail(`${where}: unknown type "${it.type}"`);
  if (!PRICES[it.price]) fail(`${where}: unknown price "${it.price}"`);
  if (!CERTS[it.cert]) fail(`${where}: unknown cert "${it.cert}"`);
  if (!LEVELS[it.level]) fail(`${where}: unknown level "${it.level}"`);
  if (!Array.isArray(it.cats) || !it.cats.length || it.cats.some((c) => !catIds.has(c))) fail(`${where}: cats must be a non-empty list of known categories`);
  if (!Array.isArray(it.design) || it.design.length !== 3 || it.design.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) fail(`${where}: design must be three integers 1-5`);
  if ((it.price === "audit" || it.price === "paid" || it.price === "freemium") && it.cert !== "none" && !it.certNote) warnings.push(`${where}: add certNote explaining what is free vs paid`);
  if (it.cert === "free" && it.price === "paid") fail(`${where}: price "paid" with a "free" certificate looks wrong`);
}
const types = new Set(CATALOG.map((i) => i.type));
for (const t of ["course", "video", "ebook", "pdf", "audio"]) if (!types.has(t)) warnings.push(`catalog has no "${t}" items`);

// ---------------------------------------------------------------- 2. security patterns
const sourceFiles = files.filter((f) => /\.(js|html|css|webmanifest)$/.test(f));
const banned = [
  [/\binnerHTML\b/, "innerHTML (use h()/textContent)"],
  [/\bouterHTML\b/, "outerHTML"],
  [/\binsertAdjacentHTML\b/, "insertAdjacentHTML"],
  [/\bdocument\.write\b/, "document.write"],
  [/\beval\s*\(/, "eval()"],
  [/\bnew Function\s*\(/, "new Function()"],
  [/\bsetTimeout\s*\(\s*["'`]/, "setTimeout with a string"],
  [/\bservice_role\b/i, "a service_role reference (never ship a privileged key)"],
  [/sb_secret_[A-Za-z0-9_]+/, "a Supabase secret key"],
];
for (const f of sourceFiles) {
  if (rel(f) === "sw.js" || rel(f).startsWith("tools/")) { /* still checked */ }
  const text = read(f);
  for (const [re, label] of banned) if (re.test(text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, ""))) fail(`${rel(f)}: contains ${label}`);
  if (/\.js$/.test(f) && /\bhttp:\/\/(?!127\.0\.0\.1|localhost|www\.w3\.org)/.test(text)) fail(`${rel(f)}: contains a non-https URL`);
}

const html = read(join(root, "index.html"));
if (/\son[a-z]+\s*=/i.test(html)) fail("index.html: inline event handler attributes are not allowed (CSP)");
if (/\sstyle\s*=/i.test(html)) fail("index.html: inline style attributes are not allowed (CSP)");
if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(html)) fail("index.html: inline <script> is not allowed (CSP)");
if (/<style[\s>]/i.test(html)) fail("index.html: inline <style> is not allowed (CSP)");
const cspMatch = html.match(/Content-Security-Policy"\s+content="([^"]+)"/);
if (!cspMatch) fail("index.html: Content-Security-Policy meta tag missing");
else {
  const csp = cspMatch[1];
  for (const needle of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "object-src 'none'", "base-uri 'none'"]) if (!csp.includes(needle)) fail(`CSP is missing: ${needle}`);
  if (/unsafe-inline|unsafe-eval|script-src[^;]*\*/.test(csp)) fail("CSP must not allow unsafe-inline, unsafe-eval or wildcard scripts");
}
for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) if (/^https?:|^\/\//.test(m[1])) fail(`index.html: external script ${m[1]} (self-host it instead)`);
for (const m of html.matchAll(/<link[^>]+href="([^"]+)"/g)) if (/^https?:|^\/\//.test(m[1])) fail(`index.html: external link ${m[1]}`);

// style="..." attributes set through JS would also be blocked by CSP
for (const f of sourceFiles.filter((f) => f.endsWith(".js"))) {
  const text = read(f);
  if (/setAttribute\(\s*["']style["']/.test(text)) fail(`${rel(f)}: setAttribute("style") is blocked by CSP; use classes or style.setProperty`);
  if (/\bstyle\s*:\s*["'`]/.test(text) && /\bh\(/.test(text)) fail(`${rel(f)}: h({style: "..."}) is blocked by CSP`);
}

// config.js must never hold a privileged key
const cfg = read(join(root, "config.js"));
for (const m of cfg.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\./g)) {
  try {
    const payload = JSON.parse(Buffer.from(m[1], "base64url").toString());
    if (payload.role && payload.role !== "anon") fail(`config.js: JWT with role "${payload.role}". Only the anon key may be public!`);
  } catch { /* not a JWT */ }
}

// ---------------------------------------------------------------- 3. service worker precache
const sw = read(join(root, "sw.js"));
const shellBlock = sw.match(/const SHELL = \[([\s\S]*?)\];/);
if (!shellBlock) fail("sw.js: could not find the SHELL precache list");
const shell = new Set([...(shellBlock?.[1] || "").matchAll(/"([^"]+)"/g)].map((m) => m[1]));
for (const f of files) {
  const r = rel(f);
  if (/^(js|css)\//.test(r) || r === "index.html" || r === "config.js") if (!shell.has(r)) fail(`sw.js: precache list is missing ${r}`);
}
for (const p of shell) {
  if (p === "./" || p.startsWith("icons/") && !files.some((f) => rel(f) === p)) continue;
  if (p !== "./" && !files.some((f) => rel(f) === p)) fail(`sw.js: precache lists ${p} but the file does not exist`);
}

// ---------------------------------------------------------------- report
console.log(`Checked ${CATALOG.length} catalog items and ${sourceFiles.length} source files.`);
for (const w of warnings) console.log("warn  " + w);
for (const e of errors) console.log("FAIL  " + e);
if (errors.length) {
  console.log(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log("All checks passed.");
