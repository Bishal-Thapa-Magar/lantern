// Live search across free, open libraries. Every call:
//  - goes straight from the learner's browser to the provider (no Lantern server in between),
//  - sends no cookies and no referrer,
//  - times out, is size-checked, and is validated before use,
//  - fails on its own without breaking the other sources.
// All fields from the network are treated as untrusted text.

import { cleanText, hash, safeUrl } from "./util.js";
import { inferCats } from "./infer.js";

const TIMEOUT_MS = 9000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

async function getJson(url, signal) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > 2_000_000) throw new Error("Response too large");
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Remove characters that have meaning in Lucene/Solr so user text is always a plain phrase. */
export function plainQuery(q) {
  return q.replace(/[+\-!(){}[\]^"~*?:\\/&|<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const first = (v) => (Array.isArray(v) ? v[0] : v);
const IA_ID = /^[A-Za-z0-9._-]{1,120}$/;

function stripTags(html) {
  // Wikipedia snippets contain <span class="searchmatch">. We only ever want text.
  return cleanText(String(html || "").replace(/<[^>]*>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'"), 220);
}

// ---------------- Providers ----------------

const openLibrary = {
  id: "openlibrary",
  label: "Open Library",
  async search(q, signal) {
    const p = new URLSearchParams({
      q: plainQuery(q),
      limit: "12",
      has_fulltext: "true",
      fields: "key,title,author_name,cover_i,first_publish_year,ia,ratings_average,ratings_count,subject,language",
    });
    const data = await getJson(`https://openlibrary.org/search.json?${p}`, signal);
    if (!Array.isArray(data?.docs)) throw new Error("Unexpected response");
    return data.docs.map((d) => {
      const title = cleanText(d.title, 160);
      const iaId = (Array.isArray(d.ia) ? d.ia : []).find((x) => IA_ID.test(x));
      if (!title || typeof d.key !== "string" || !d.key.startsWith("/works/")) return null;
      const author = cleanText(first(d.author_name) || "", 80);
      const subjects = (Array.isArray(d.subject) ? d.subject : []).slice(0, 6).map((s) => cleanText(s, 40));
      return {
        id: "ol:" + d.key.slice(7),
        source: "openlibrary",
        title,
        provider: author ? `${author} · Open Library` : "Open Library",
        url: `https://openlibrary.org${d.key.replace(/[^A-Za-z0-9/]/g, "")}`,
        type: "ebook",
        price: "free",
        cert: "none",
        cats: inferCats(title, subjects.join(" ")).length ? inferCats(title, subjects.join(" ")) : ["reading"],
        level: "all",
        lang: Array.isArray(d.language) && d.language.includes("eng") ? "en" : "",
        desc: subjects.length ? `Topics: ${subjects.join(", ")}.` : "Free to read or borrow on Open Library.",
        cover: Number.isInteger(d.cover_i) ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : "",
        year: Number.isInteger(d.first_publish_year) ? d.first_publish_year : undefined,
        ext: num(d.ratings_count) > 0 ? { avg: num(d.ratings_average), count: num(d.ratings_count), source: "Open Library readers" } : undefined,
        dl: iaId ? { kind: "archive", id: iaId, media: "texts" } : undefined,
        offline: !!iaId,
        tags: subjects,
      };
    }).filter(Boolean);
  },
};

const gutenberg = {
  id: "gutenberg",
  label: "Project Gutenberg",
  async search(q, signal) {
    const p = new URLSearchParams({ search: plainQuery(q) });
    const data = await getJson(`https://gutendex.com/books/?${p}`, signal);
    if (!Array.isArray(data?.results)) throw new Error("Unexpected response");
    return data.results.slice(0, 12).map((b) => {
      const title = cleanText(b.title, 160);
      if (!title || !Number.isInteger(b.id)) return null;
      const fmts = b.formats && typeof b.formats === "object" ? b.formats : {};
      const pick = ["application/epub+zip", "application/pdf", "text/html", "text/plain; charset=utf-8"].map((k) => fmts[k]).find(Boolean);
      const dl = pick && /^https:\/\/([a-z0-9-]+\.)?gutenberg\.org\//.test(pick) ? safeUrl(pick) : "";
      const subjects = (Array.isArray(b.subjects) ? b.subjects : []).slice(0, 5).map((s) => cleanText(s, 60));
      const author = cleanText(b.authors?.[0]?.name || "", 80);
      return {
        id: "pg:" + b.id,
        source: "gutenberg",
        title,
        provider: author ? `${author} · Project Gutenberg` : "Project Gutenberg",
        url: `https://www.gutenberg.org/ebooks/${b.id}`,
        type: "ebook",
        price: "free",
        cert: "none",
        cats: ["reading", ...inferCats(title, subjects.join(" ")).filter((c) => c !== "reading")].slice(0, 3),
        level: "all",
        lang: Array.isArray(b.languages) ? cleanText(b.languages[0] || "", 5) : "",
        desc: subjects.length ? `Public-domain ebook. Subjects: ${subjects.join("; ")}.` : "Public-domain ebook you can read online or download.",
        cover: /^https:\/\/www\.gutenberg\.org\//.test(fmts["image/jpeg"] || "") ? fmts["image/jpeg"] : "",
        reach: num(b.download_count),
        download: dl || undefined,
        offline: true,
        tags: subjects,
      };
    }).filter(Boolean);
  },
};

const archiveOrg = {
  id: "archive",
  label: "Internet Archive",
  async search(q, signal) {
    const p = new URLSearchParams();
    p.set("q", `(${plainQuery(q)}) AND mediatype:(texts OR audio OR movies) AND NOT access-restricted-item:true`);
    for (const f of ["identifier", "title", "creator", "mediatype", "downloads", "avg_rating", "num_reviews", "year", "language"]) p.append("fl[]", f);
    p.append("sort[]", "downloads desc");
    p.set("rows", "12");
    p.set("page", "1");
    p.set("output", "json");
    const data = await getJson(`https://archive.org/advancedsearch.php?${p}`, signal);
    const docs = data?.response?.docs;
    if (!Array.isArray(docs)) throw new Error("Unexpected response");
    return docs.map((d) => {
      const id = typeof d.identifier === "string" && IA_ID.test(d.identifier) ? d.identifier : "";
      const title = cleanText(first(d.title) || "", 160);
      if (!id || !title) return null;
      const media = d.mediatype;
      const type = media === "audio" ? "audio" : media === "movies" ? "video" : "ebook";
      const creator = cleanText(String(first(d.creator) || ""), 80);
      const reviews = num(Number(d.num_reviews));
      return {
        id: "ia:" + id,
        source: "archive",
        title,
        provider: creator ? `${creator} · Internet Archive` : "Internet Archive",
        url: `https://archive.org/details/${id}`,
        type,
        price: "free",
        cert: "none",
        cats: inferCats(title),
        level: "all",
        lang: "",
        desc: type === "audio" ? "Free audio you can stream or download." : type === "video" ? "Free video you can stream or download." : "Free text you can read online or download.",
        cover: `https://archive.org/services/img/${id}`,
        reach: num(Number(d.downloads)),
        year: Number.isInteger(Number(d.year)) ? Number(d.year) : undefined,
        ext: reviews > 0 && num(Number(d.avg_rating)) > 0 ? { avg: num(Number(d.avg_rating)), count: reviews, source: "Internet Archive reviewers" } : undefined,
        dl: { kind: "archive", id, media },
        offline: true,
        tags: [],
      };
    }).filter(Boolean);
  },
};

function wiki(site, label, type) {
  return {
    id: site,
    label,
    async search(q, signal) {
      const p = new URLSearchParams({
        action: "query", list: "search", srsearch: plainQuery(q), srlimit: "8",
        srprop: "snippet", format: "json", origin: "*",
      });
      const data = await getJson(`https://en.${site}.org/w/api.php?${p}`, signal);
      const rows = data?.query?.search;
      if (!Array.isArray(rows)) throw new Error("Unexpected response");
      return rows.map((r) => {
        const title = cleanText(r.title, 140);
        if (!title) return null;
        const path = encodeURIComponent(title.replace(/ /g, "_"));
        return {
          id: `${site}:${hash(title)}`,
          source: site,
          title,
          provider: label,
          url: `https://en.${site}.org/wiki/${path}`,
          type,
          price: "free",
          cert: "none",
          cats: inferCats(title, stripTags(r.snippet)),
          level: "all",
          lang: "en",
          desc: stripTags(r.snippet) || `Open ${type === "ebook" ? "textbook" : "lesson"} on ${label}.`,
          tags: [],
        };
      }).filter(Boolean);
    },
  };
}

export const PROVIDERS = [
  openLibrary,
  gutenberg,
  archiveOrg,
  wiki("wikiversity", "Wikiversity", "course"),
  wiki("wikibooks", "Wikibooks", "ebook"),
];

/** Search all enabled providers in parallel. Returns {items, errors}. */
export async function searchLive(query, enabledIds, signal) {
  const q = query.trim();
  const active = PROVIDERS.filter((p) => enabledIds.includes(p.id));
  const errors = [];
  const key = q.toLowerCase() + "|" + active.map((p) => p.id).join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const settled = await Promise.allSettled(active.map((p) => p.search(q, signal)));
  const items = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      // pos = how early the provider ranked it (0 = first), used to interleave sources fairly.
      r.value.forEach((it, idx) => { it.pos = idx / Math.max(1, r.value.length); });
      items.push(...r.value);
    }
    else if (r.reason?.name !== "AbortError") errors.push(active[i].label);
  });
  const value = { items, errors };
  if (!signal?.aborted && items.length) cache.set(key, { at: Date.now(), value });
  return value;
}

// ---------------- One-tap downloads ----------------

/** For archive.org items, find the best actual file so the learner gets a download, not a web page. */
export async function resolveDownload(item, signal) {
  if (item.download) return safeUrl(item.download);
  if (item.dl?.kind !== "archive" || !IA_ID.test(item.dl.id)) return safeUrl(item.url);
  const id = item.dl.id;
  try {
    const meta = await getJson(`https://archive.org/metadata/${encodeURIComponent(id)}`, signal);
    const files = Array.isArray(meta?.files) ? meta.files.filter((f) => typeof f?.name === "string" && f.source !== "metadata") : [];
    const order = item.dl.media === "audio" ? [/\.mp3$/i, /\.ogg$/i]
      : item.dl.media === "movies" ? [/\.mp4$/i, /\.ogv$/i, /\.webm$/i]
      : [/\.pdf$/i, /\.epub$/i, /\.txt$/i];
    for (const re of order) {
      const f = files.find((x) => re.test(x.name) && !/_(text|abbyy|hocr|chocr)\./i.test(x.name));
      if (f) {
        if (item.dl.media === "audio" && files.filter((x) => /\.mp3$/i.test(x.name)).length > 3) {
          return `https://archive.org/compress/${encodeURIComponent(id)}/formats=VBR%20MP3`;
        }
        return `https://archive.org/download/${encodeURIComponent(id)}/${f.name.split("/").map(encodeURIComponent).join("/")}`;
      }
    }
  } catch {
    /* fall through to the details page */
  }
  return `https://archive.org/details/${encodeURIComponent(id)}`;
}
