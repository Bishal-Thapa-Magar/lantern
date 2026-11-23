// Searching the curated catalog, filtering, and sorting mixed (curated + live) results.

import { CATEGORIES, PRICES } from "./taxonomy.js";
import { scoreResource } from "./score.js";
import { communityRating } from "./store.js";

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

export const tokens = (q) => norm(q).split(/[^a-z0-9+#.]+/).filter((t) => t.length > 0).slice(0, 8);

/** 0..1 relevance of a curated item for a query; 0 means "does not match". Empty query matches everything. */
export function relevance(item, toks) {
  if (!toks.length) return 0.5;
  const title = norm(item.title);
  const tags = norm((item.tags || []).join(" "));
  const prov = norm(item.provider);
  const desc = norm(item.desc);
  const cats = norm(item.cats.map((c) => CATEGORIES.find((x) => x.id === c)?.label || "").join(" "));
  let total = 0;
  for (const t of toks) {
    let s = 0;
    if (title.includes(t)) s = 3;
    else if (tags.includes(t)) s = 2.4;
    else if (prov.includes(t)) s = 1.4;
    else if (cats.includes(t)) s = 1.2;
    else if (desc.includes(t)) s = 1;
    if (!s) return 0; // every word must match something
    total += s;
  }
  return Math.min(1, total / (toks.length * 3));
}

export function withScores(items) {
  return items.map((item) => ({ item, eff: scoreResource(item, communityRating(item.id)) }));
}

export function applyFilters(entries, f) {
  return entries.filter(({ item }) => {
    if (f.types?.length && !f.types.includes(item.type)) return false;
    if (f.prices?.length && !f.prices.includes(item.price)) return false;
    if (f.certs?.length && !f.certs.includes(item.cert)) return false;
    if (f.cat && !item.cats.includes(f.cat)) return false;
    if (f.level && item.level !== "all" && item.level !== f.level) return false;
    if (f.offline && !item.offline) return false;
    return true;
  });
}

export function sortEntries(entries, sort) {
  const by = {
    effective: (a, b) => b.eff.score - a.eff.score,
    rated: (a, b) => (b.eff.rating?.avg ?? 0) - (a.eff.rating?.avg ?? 0) || (b.eff.rating?.count ?? 0) - (a.eff.rating?.count ?? 0),
    price: (a, b) => PRICES[a.item.price].rank - PRICES[b.item.price].rank || b.eff.score - a.eff.score,
    best: (a, b) => b.rank - a.rank,
  }[sort] || ((a, b) => b.rank - a.rank);
  return [...entries].sort(by);
}

/** Read filters from a URLSearchParams. Unknown values are ignored. */
export function parseFilters(params) {
  const list = (k, allowed) => (params.get(k) || "").split(",").filter((v) => allowed.includes(v));
  return {
    q: (params.get("q") || "").slice(0, 100),
    types: list("type", ["course", "video", "ebook", "pdf", "audio", "practice", "guide", "library"]),
    prices: list("price", Object.keys(PRICES)),
    certs: list("cert", ["free", "badge", "paid", "none"]),
    cat: CATEGORIES.some((c) => c.id === params.get("cat")) ? params.get("cat") : "",
    level: ["beginner", "intermediate", "advanced"].includes(params.get("lvl")) ? params.get("lvl") : "",
    offline: params.get("offline") === "1",
    sort: ["best", "effective", "rated", "price"].includes(params.get("sort")) ? params.get("sort") : "best",
  };
}

export function filtersToParams(f) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.types?.length) p.set("type", f.types.join(","));
  if (f.prices?.length) p.set("price", f.prices.join(","));
  if (f.certs?.length) p.set("cert", f.certs.join(","));
  if (f.cat) p.set("cat", f.cat);
  if (f.level) p.set("lvl", f.level);
  if (f.offline) p.set("offline", "1");
  if (f.sort && f.sort !== "best") p.set("sort", f.sort);
  return p;
}

/** Remove duplicates (same link) while keeping the first, curated copy. */
export function dedupe(entries) {
  const seen = new Set();
  return entries.filter(({ item }) => {
    const key = item.url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
