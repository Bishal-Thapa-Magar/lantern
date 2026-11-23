// Learner data: saved resources (with collections and progress), community ratings, and preferences.
// Works fully offline for guests (localStorage). When signed in, changes are also sent to Supabase,
// where Row Level Security guarantees every learner can only ever read or change their own rows.

import { authEnabled, currentUser, onAuthChange, rest } from "./auth.js";
import { cleanText, safeStorage, safeUrl } from "./util.js";
import { STATUSES } from "./taxonomy.js";

const local = safeStorage("local");
const DEFAULT_COLLECTION = "Saved";
const MAX_COLLECTIONS = 30;
const MAX_ITEMS = 2000;
const STATUS_IDS = STATUSES.map((s) => s.id);

const bus = new EventTarget();
export const onChange = (fn) => bus.addEventListener("change", fn);
export const offChange = (fn) => bus.removeEventListener("change", fn);
const notify = () => bus.dispatchEvent(new Event("change"));

// ---------------- Preferences (device only) ----------------
const PREF_DEFAULTS = { sources: ["openlibrary", "gutenberg", "archive", "wikiversity", "wikibooks"], dataSaver: false };

export function getPrefs() {
  try {
    const p = JSON.parse(local.getItem("lantern.prefs") || "{}");
    return { ...PREF_DEFAULTS, ...p };
  } catch {
    return { ...PREF_DEFAULTS };
  }
}
export function setPrefs(patch) {
  const next = { ...getPrefs(), ...patch };
  local.setItem("lantern.prefs", JSON.stringify(next));
  if ("dataSaver" in patch) {
    local.setItem("lantern.datasaver", patch.dataSaver ? "on" : "off");
    if (patch.dataSaver) document.documentElement.setAttribute("data-datasaver", "on");
    else document.documentElement.removeAttribute("data-datasaver");
  }
  notify();
}

// ---------------- Library ----------------
let lib = { items: {}, collections: [DEFAULT_COLLECTION], dirty: [] };
let libOwner = "guest";

const keyFor = (owner) => `lantern.lib.${owner}`;

/** Whitelist and bound every field. Used on load, import and cloud reads, because all of them are untrusted. */
export function sanitizeSnapshot(s) {
  if (!s || typeof s !== "object") return null;
  const id = cleanText(String(s.id ?? ""), 80);
  const title = cleanText(String(s.title ?? ""), 200);
  const url = safeUrl(String(s.url ?? ""));
  if (!id || !title || !url) return null;
  const out = {
    id, title, url,
    provider: cleanText(String(s.provider ?? ""), 120),
    type: ["course", "video", "ebook", "pdf", "audio", "practice", "guide", "library"].includes(s.type) ? s.type : "guide",
    price: ["free", "audit", "freemium", "paid"].includes(s.price) ? s.price : "free",
    cert: ["free", "badge", "paid", "none"].includes(s.cert) ? s.cert : "none",
    cats: Array.isArray(s.cats) ? s.cats.slice(0, 4).map((c) => cleanText(String(c), 20)) : [],
    source: cleanText(String(s.source ?? "lantern"), 20),
  };
  if (s.download) out.download = safeUrl(String(s.download)) || undefined;
  if (s.dl && typeof s.dl === "object" && /^[A-Za-z0-9._-]{1,120}$/.test(String(s.dl.id)) && s.dl.kind === "archive") {
    out.dl = { kind: "archive", id: String(s.dl.id), media: ["texts", "audio", "movies"].includes(s.dl.media) ? s.dl.media : "texts" };
  }
  if (s.cover) out.cover = safeUrl(String(s.cover)) || undefined;
  return out;
}

function sanitizeRecord(r) {
  const snap = sanitizeSnapshot(r?.snapshot);
  if (!snap) return null;
  return {
    snapshot: snap,
    collection: cleanText(String(r.collection || DEFAULT_COLLECTION), 40) || DEFAULT_COLLECTION,
    status: STATUS_IDS.includes(r.status) ? r.status : "todo",
    savedAt: Number.isFinite(r.savedAt) ? r.savedAt : Date.now(),
  };
}

function loadLocal(owner) {
  libOwner = owner;
  try {
    const raw = JSON.parse(local.getItem(keyFor(owner)) || "null");
    const items = {};
    for (const [id, rec] of Object.entries(raw?.items || {})) {
      const clean = sanitizeRecord(rec);
      if (clean) items[clean.snapshot.id] = clean;
    }
    const collections = Array.isArray(raw?.collections) ? raw.collections.map((c) => cleanText(String(c), 40)).filter(Boolean) : [];
    if (!collections.includes(DEFAULT_COLLECTION)) collections.unshift(DEFAULT_COLLECTION);
    lib = { items, collections: [...new Set(collections)].slice(0, MAX_COLLECTIONS), dirty: Array.isArray(raw?.dirty) ? raw.dirty.slice(0, 500) : [] };
  } catch {
    lib = { items: {}, collections: [DEFAULT_COLLECTION], dirty: [] };
  }
}

function persist() {
  try {
    local.setItem(keyFor(libOwner), JSON.stringify(lib));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
  notify();
}

export const isSaved = (id) => !!lib.items[id];
export const getRecord = (id) => lib.items[id] || null;
export const listSaved = () => Object.values(lib.items).sort((a, b) => b.savedAt - a.savedAt);
export const listCollections = () => [...lib.collections];
export const pendingSync = () => lib.dirty.length;

export function save(item, collection = DEFAULT_COLLECTION) {
  const snap = sanitizeSnapshot(item);
  if (!snap) throw new Error("This resource cannot be saved.");
  if (!lib.items[snap.id] && Object.keys(lib.items).length >= MAX_ITEMS) throw new Error("Your library is full. Remove something first.");
  const existing = lib.items[snap.id];
  lib.items[snap.id] = { snapshot: snap, collection: cleanText(collection, 40) || DEFAULT_COLLECTION, status: existing?.status || "todo", savedAt: existing?.savedAt || Date.now() };
  if (!lib.collections.includes(lib.items[snap.id].collection)) lib.collections.push(lib.items[snap.id].collection);
  queue(snap.id);
  persist();
  flush();
}

export function update(id, patch) {
  const rec = lib.items[id];
  if (!rec) return;
  if (patch.collection !== undefined) {
    const name = cleanText(String(patch.collection), 40) || DEFAULT_COLLECTION;
    rec.collection = name;
    if (!lib.collections.includes(name)) lib.collections.push(name);
  }
  if (patch.status !== undefined && STATUS_IDS.includes(patch.status)) rec.status = patch.status;
  queue(id);
  persist();
  flush();
}

export function unsave(id) {
  if (!lib.items[id]) return;
  delete lib.items[id];
  queue(id);
  persist();
  flush();
}

export function addCollection(name) {
  const n = cleanText(String(name), 40);
  if (!n) throw new Error("Give the collection a name.");
  if (lib.collections.includes(n)) throw new Error("You already have a collection with that name.");
  if (lib.collections.length >= MAX_COLLECTIONS) throw new Error(`You can have up to ${MAX_COLLECTIONS} collections.`);
  lib.collections.push(n);
  persist();
  pushCollections();
  return n;
}

export function removeCollection(name) {
  if (name === DEFAULT_COLLECTION) return;
  lib.collections = lib.collections.filter((c) => c !== name);
  for (const [id, rec] of Object.entries(lib.items)) {
    if (rec.collection === name) {
      rec.collection = DEFAULT_COLLECTION;
      queue(id);
    }
  }
  persist();
  pushCollections();
  flush();
}

export function exportLibrary() {
  return JSON.stringify({ app: "lantern", version: 1, exportedAt: new Date().toISOString(), collections: lib.collections, items: listSaved() }, null, 2);
}

export function importLibrary(text) {
  if (text.length > 3_000_000) throw new Error("That file is too large.");
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("That file is not valid JSON."); }
  if (data?.app !== "lantern" || !Array.isArray(data.items)) throw new Error("That is not a Lantern export.");
  let added = 0;
  for (const rec of data.items.slice(0, MAX_ITEMS)) {
    const clean = sanitizeRecord(rec);
    if (!clean || lib.items[clean.snapshot.id]) continue;
    lib.items[clean.snapshot.id] = clean;
    if (!lib.collections.includes(clean.collection) && lib.collections.length < MAX_COLLECTIONS) lib.collections.push(clean.collection);
    queue(clean.snapshot.id);
    added++;
  }
  persist();
  flush();
  return added;
}

// ---------------- Cloud sync ----------------
const queue = (id) => { if (currentUser() && !lib.dirty.includes(id)) lib.dirty.push(id); };
let flushing = false;

export async function flush() {
  const user = currentUser();
  if (!user || !authEnabled() || flushing || !lib.dirty.length) return;
  flushing = true;
  try {
    const ids = [...lib.dirty];
    const upserts = [];
    const deletes = [];
    for (const id of ids) {
      const rec = lib.items[id];
      if (rec) upserts.push({ user_id: user.id, resource_id: id, collection: rec.collection, status: rec.status, snapshot: rec.snapshot });
      else deletes.push(id);
    }
    if (upserts.length) await rest("saved_items?on_conflict=user_id,resource_id", { method: "POST", body: upserts, headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
    for (const id of deletes) await rest(`saved_items?resource_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    lib.dirty = lib.dirty.filter((id) => !ids.includes(id));
    persist();
  } catch {
    /* offline or signed out: items stay queued and are retried later */
  } finally {
    flushing = false;
  }
}

async function pushCollections() {
  const user = currentUser();
  if (!user || !authEnabled()) return;
  try {
    await rest("collections?on_conflict=user_id,name", { method: "POST", body: lib.collections.map((name) => ({ user_id: user.id, name })), headers: { Prefer: "resolution=ignore-duplicates,return=minimal" } });
  } catch { /* retried on next sign-in */ }
}

async function pullAndMerge(user) {
  const guest = (() => {
    try { return JSON.parse(local.getItem(keyFor("guest")) || "null"); } catch { return null; }
  })();
  loadLocal(user.id);
  // Bring in anything saved as a guest on this device.
  for (const rec of Object.values(guest?.items || {})) {
    const clean = sanitizeRecord(rec);
    if (clean && !lib.items[clean.snapshot.id]) {
      lib.items[clean.snapshot.id] = clean;
      queue(clean.snapshot.id);
    }
  }
  for (const c of guest?.collections || []) if (!lib.collections.includes(c) && lib.collections.length < MAX_COLLECTIONS) lib.collections.push(cleanText(String(c), 40));
  if (guest) local.removeItem(keyFor("guest"));
  persist();
  try {
    const [rows, cols] = await Promise.all([
      rest("saved_items?select=resource_id,collection,status,snapshot,created_at&order=created_at.desc&limit=2000"),
      rest("collections?select=name&limit=100"),
    ]);
    for (const row of rows || []) {
      const clean = sanitizeRecord({ snapshot: row.snapshot, collection: row.collection, status: row.status, savedAt: Date.parse(row.created_at) });
      if (clean && !lib.dirty.includes(clean.snapshot.id)) lib.items[clean.snapshot.id] = clean;
    }
    for (const c of cols || []) {
      const name = cleanText(String(c.name), 40);
      if (name && !lib.collections.includes(name) && lib.collections.length < MAX_COLLECTIONS) lib.collections.push(name);
    }
    persist();
    pushCollections();
    flush();
  } catch {
    /* keep working from the local copy */
  }
}

/** Delete every saved row for the signed-in learner (the account itself is deleted from the Supabase dashboard). */
export async function deleteCloudData() {
  await rest("saved_items?resource_id=neq.", { method: "DELETE" });
  await rest("collections?name=neq.", { method: "DELETE" });
  await rest("reviews?resource_id=neq.", { method: "DELETE" });
}

// ---------------- Community ratings ----------------
const ratingCache = new Map(); // resource id -> {avg, count}
export const communityRating = (id) => ratingCache.get(id) || null;

export async function loadCommunityRatings(ids) {
  if (!authEnabled() || !ids.length) return;
  const wanted = [...new Set(ids)].filter((id) => !ratingCache.has(id) && /^[A-Za-z0-9:._-]{1,80}$/.test(id)).slice(0, 100);
  if (!wanted.length) return;
  try {
    const list = wanted.map((id) => `"${id}"`).join(",");
    const rows = await rest(`resource_ratings?select=resource_id,avg_rating,rating_count&resource_id=in.(${encodeURIComponent(list)})`, { anon: true });
    for (const id of wanted) ratingCache.set(id, null);
    for (const r of rows || []) ratingCache.set(r.resource_id, { avg: Number(r.avg_rating), count: Number(r.rating_count) });
    notify();
  } catch { /* ratings are a bonus; ignore failures */ }
}

export async function loadReviews(id) {
  const rows = await rest(`resource_reviews?select=rating,comment,created_at&resource_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=20`, { anon: true });
  return (rows || []).map((r) => ({ rating: Number(r.rating), comment: cleanText(String(r.comment || ""), 500), at: r.created_at }));
}

export async function loadMyReview(id) {
  const user = currentUser();
  if (!user) return null;
  const rows = await rest(`reviews?select=rating,comment&resource_id=eq.${encodeURIComponent(id)}&user_id=eq.${user.id}`);
  return rows?.[0] || null;
}

export async function submitReview(id, rating, comment) {
  const user = currentUser();
  if (!user) throw new Error("Sign in to rate this.");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("Pick 1 to 5 stars.");
  const text = cleanText(comment || "", 500);
  await rest("reviews?on_conflict=user_id,resource_id", { method: "POST", body: [{ user_id: user.id, resource_id: id, rating, comment: text || null }], headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
  ratingCache.delete(id);
  await loadCommunityRatings([id]);
}

// ---------------- Boot ----------------
export function initStore() {
  const u = currentUser();
  loadLocal(u ? u.id : "guest");
  if (u) pullAndMerge(u);
  onAuthChange((user) => {
    if (user) pullAndMerge(user);
    else {
      loadLocal("guest");
      notify();
    }
  });
  window.addEventListener("online", flush);
}
