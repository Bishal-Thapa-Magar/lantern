#!/usr/bin/env node
// Checks that every curated link still opens.  Usage: node tools/check-links.mjs
// Runs weekly in GitHub Actions (.github/workflows/links.yml). Needs internet access.
//
//   OK       2xx/3xx
//   WARN     403/429/999 or timeouts: many sites block robots, so check these by hand
//   BROKEN   404/410/5xx or DNS failure: fix or remove the entry (exit code 1)

import { pathToFileURL } from "node:url";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const { CATALOG } = await import(pathToFileURL(join(root, "js/catalog/index.js")).href);

const targets = [...new Set(CATALOG.flatMap((i) => [i.url, i.download].filter(Boolean)))];
const UA = "Mozilla/5.0 (compatible; LanternLinkCheck/1.0; +https://github.com/)";
const results = { ok: 0, warn: [], broken: [] };

async function probe(url) {
  for (const method of ["HEAD", "GET"]) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const res = await fetch(url, { method, redirect: "follow", signal: ctl.signal, headers: { "User-Agent": UA, Accept: "text/html,*/*" } });
      clearTimeout(timer);
      if (res.status === 405 && method === "HEAD") continue; // some servers refuse HEAD
      return res.status;
    } catch (err) {
      clearTimeout(timer);
      if (method === "GET") return err.name === "AbortError" ? "timeout" : `error: ${err.cause?.code || err.message}`;
    }
  }
  return "error";
}

async function worker(queue) {
  while (queue.length) {
    const url = queue.pop();
    const status = await probe(url);
    if (typeof status === "number" && status < 400) results.ok++;
    else if ([403, 429, 999].includes(status) || status === "timeout") results.warn.push(`${status}  ${url}`);
    else results.broken.push(`${status}  ${url}`);
  }
}

const queue = [...targets];
await Promise.all(Array.from({ length: 6 }, () => worker(queue)));

console.log(`${targets.length} links checked: ${results.ok} ok, ${results.warn.length} warnings, ${results.broken.length} broken`);
for (const w of results.warn) console.log("WARN    " + w);
for (const b of results.broken) console.log("BROKEN  " + b);
process.exit(results.broken.length ? 1 : 0);
