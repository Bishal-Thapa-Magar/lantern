// The four screens: Discover (home), Search, Library, How it works.

import { h, icon, clear } from "../util.js";
import { CATALOG, byId } from "../catalog/index.js";
import { CATEGORIES, PRICES, CERTS, SORTS, STATUSES, TYPES, LEVELS, categoryOf } from "../taxonomy.js";
import { applyFilters, dedupe, filtersToParams, parseFilters, relevance, sortEntries, tokens, withScores } from "../search.js";
import { searchLive } from "../sources.js";
import { communityRating, getPrefs, getRecord, listCollections, listSaved, loadCommunityRatings, onChange, offChange, addCollection, removeCollection, update } from "../store.js";
import { scoreResource } from "../score.js";
import { currentUser, authEnabled } from "../auth.js";
import { badge, resultRow, skeletons, toast } from "./components.js";
import { CONFIG } from "../../config.js";

const PAGE = 30;

const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange")); else location.hash = hash; };

function searchForm(value, { autofocus = false } = {}) {
  const input = h("input", { id: "q", name: "q", type: "search", placeholder: "Try “python”, “excel”, “first aid”, “spanish audio”…", autocomplete: "off", enterkeyhint: "search", maxlength: "100", "aria-label": "Search courses and resources", autofocus });
  input.value = value || "";
  const form = h("form", { class: "searchbar", role: "search", onsubmit: (e) => {
    e.preventDefault();
    const q = input.value.trim();
    const cur = parseFilters(new URLSearchParams((location.hash.split("?")[1]) || ""));
    go("#/search?" + filtersToParams({ ...cur, q }).toString());
  } },
    h("div", { class: "searchbar__field" }, icon("search", 22), input),
    h("button", { class: "btn", type: "submit" }, "Search"));
  return form;
}

// ---------------- Discover ----------------
export function renderHome(root, ctx) {
  const entries = withScores(CATALOG);
  const top = (pred, n = 4) => sortEntries(entries.filter(pred), "effective").slice(0, n);

  const quick = [
    ["Free with certificate", { prices: ["free"], certs: ["free"] }],
    ["Free audio", { types: ["audio"], prices: ["free"] }],
    ["Ebooks & PDFs", { types: ["ebook", "pdf"], prices: ["free"] }],
    ["Works offline", { offline: true, prices: ["free"] }],
    ["Beginner friendly", { level: "beginner", prices: ["free"] }],
  ];

  const rows = (list) => h("ul", { class: "rows" }, ...list.map((e) => resultRow(e, ctx)));
  const section = (title, sub, list, href) => h("section", { class: "section" },
    h("div", { class: "section__head" }, h("div", {}, h("h2", { text: title }), h("p", { class: "section__sub", text: sub })), h("a", { href }, "See all")),
    rows(list));

  root.append(h("div", { class: "wrap" },
    h("section", { class: "hero" },
      h("h1", { text: "Learn anything for free, or close to it." }),
      h("p", { class: "lede", text: `Search ${CATALOG.length} hand-picked courses, books and videos plus five open libraries. See what is free, what gives a certificate, and what actually works.` }),
      searchForm("", {}),
      h("div", { class: "quick" }, ...quick.map(([label, f]) => h("a", { class: "chip", href: "#/search?" + filtersToParams({ ...f, sort: "effective" }) }, label)))),
    h("section", { class: "section" },
      h("div", { class: "section__head" }, h("h2", { text: "Browse by topic" })),
      h("div", { class: "cats" }, ...CATEGORIES.map((c) => h("a", { class: "cat", href: "#/search?cat=" + c.id }, h("span", { class: "cat__icon" }, icon(c.icon, 20)), h("span", {}, h("strong", { text: c.label }), h("small", { text: c.hint })))))),
    section("Most effective and free", "Highest effectiveness scores where everything you need costs nothing.", top((e) => e.item.price === "free"), "#/search?" + filtersToParams({ prices: ["free"], sort: "effective" })),
    section("Free certificates", "Finish and get proof you can add to a CV or LinkedIn.", top((e) => e.item.cert === "free"), "#/search?" + filtersToParams({ certs: ["free"], sort: "effective" })),
    section("Download and learn offline", "Save data: get these once, then use them without internet.", top((e) => e.item.offline && e.item.price === "free"), "#/search?offline=1&sort=effective"),
  ));
}

// ---------------- Search ----------------
let live = { q: "", sources: "", items: [], errors: [], done: false, promise: null };

export function renderSearch(root, params, ctx) {
  const f = parseFilters(params);
  const prefs = getPrefs();
  let shown = PAGE;
  let alive = true;
  root.__cleanup = () => { alive = false; };

  const toks = tokens(f.q);
  const curated = CATALOG.map((item) => ({ item, rel: relevance(item, toks) })).filter((x) => x.rel > 0);
  const hasFilters = !!(f.types.length || f.prices.length || f.certs.length || f.cat || f.level || f.offline);
  const wantLive = f.q.trim().length >= 2 && prefs.sources.length > 0;

  const resultsHost = h("div", { "aria-live": "polite" });
  const countEl = h("p", { class: "section__sub" });
  const noticeHost = h("div");

  const update_ = (patch) => go("#/search?" + filtersToParams({ ...f, ...patch }).toString());

  // ---- filter panel ----
  const toggleList = (key, val) => (f[key].includes(val) ? f[key].filter((x) => x !== val) : [...f[key], val]);
  const checks = (legend, key, options) => h("fieldset", {}, h("legend", { text: legend }),
    ...options.map(([val, label]) => {
      const cb = h("input", { type: "checkbox", checked: f[key].includes(val), onchange: () => update_({ [key]: toggleList(key, val) }) });
      return h("label", { class: "check" }, cb, label);
    }));
  const filterPanel = h("div", { class: "filters", id: "filters", hidden: true },
    checks("Format", "types", TYPES.map((t) => [t.id, t.label])),
    checks("Price", "prices", Object.entries(PRICES).map(([id, p]) => [id, p.label])),
    checks("Certificate", "certs", Object.entries(CERTS).map(([id, c]) => [id, c.label])),
    h("fieldset", {}, h("legend", { text: "Topic" }),
      h("select", { class: "input", "aria-label": "Topic", onchange: (e) => update_({ cat: e.target.value }) },
        h("option", { value: "", text: "Any topic" }), ...CATEGORIES.map((c) => h("option", { value: c.id, selected: c.id === f.cat, text: c.label })))),
    h("fieldset", {}, h("legend", { text: "Level" }),
      h("select", { class: "input", "aria-label": "Level", onchange: (e) => update_({ level: e.target.value }) },
        h("option", { value: "", text: "Any level" }), ...["beginner", "intermediate", "advanced"].map((l) => h("option", { value: l, selected: l === f.level, text: LEVELS[l] })))),
    h("label", { class: "check" }, h("input", { type: "checkbox", checked: f.offline, onchange: (e) => update_({ offline: e.target.checked }) }), "Works offline / downloadable"),
    hasFilters && h("button", { class: "btn btn--ghost btn--small", type: "button", onclick: () => update_({ types: [], prices: [], certs: [], cat: "", level: "", offline: false }) }, "Clear filters"));

  const filterBtn = h("button", { class: "btn btn--ghost btn--small filterbtn", type: "button", "aria-expanded": "false", "aria-controls": "filters", onclick: (e) => {
    const open = filterPanel.hidden;
    filterPanel.hidden = !open;
    e.currentTarget.setAttribute("aria-expanded", String(open));
  } }, icon("filter", 18), hasFilters ? "Filters (on)" : "Filters");

  const sortSel = h("select", { class: "input", "aria-label": "Sort results", onchange: (e) => update_({ sort: e.target.value }) },
    ...SORTS.map((s) => h("option", { value: s.id, selected: s.id === f.sort, text: s.label })));

  // ---- results ----
  const paintResults = () => {
    if (!alive) return;
    const curatedEntries = withScores(curated.map((x) => x.item)).map((e, i) => ({ ...e, rank: curated[i].rel * 0.7 + (e.eff.score / 100) * 0.3 + 0.1 }));
    let liveEntries = [];
    if (wantLive && live.q === f.q) {
      liveEntries = withScores(live.items).map((e) => ({ ...e, rank: (0.75 - 0.5 * (e.item.pos || 0)) * 0.7 + (e.eff.score / 100) * 0.3 }));
    }
    // flatten {item, eff, rank}: withScores returns {item, eff}
    const all = dedupe([...curatedEntries, ...liveEntries]);
    const filtered = sortEntries(applyFilters(all, f), f.sort);

    clear(resultsHost);
    countEl.textContent = `${filtered.length} result${filtered.length === 1 ? "" : "s"}${f.q ? ` for “${f.q}”` : ""}${wantLive && !live.done ? " so far" : ""}`;

    if (!filtered.length && (!wantLive || live.done)) {
      resultsHost.append(h("div", { class: "empty" }, icon("search", 36), h("h2", { text: "Nothing matches yet" }),
        h("p", { text: hasFilters ? "Try removing a filter, or search with fewer words." : "Check the spelling or try a broader word like “python” or “excel”." }),
        hasFilters && h("button", { class: "btn", type: "button", onclick: () => update_({ types: [], prices: [], certs: [], cat: "", level: "", offline: false }) }, "Clear filters")));
    } else {
      resultsHost.append(h("ul", { class: "rows" }, ...filtered.slice(0, shown).map((e) => resultRow(e, ctx))));
      if (filtered.length > shown) resultsHost.append(h("p", {}, h("button", { class: "btn btn--ghost", type: "button", onclick: () => { shown += PAGE; paintResults(); } }, `Show more (${filtered.length - shown} left)`)));
    }
    if (wantLive && !live.done) resultsHost.append(h("div", {}, h("p", { class: "divider-label", text: "Searching open libraries…" }), skeletons(2)));

    clear(noticeHost);
    if (live.done && live.errors.length && wantLive) noticeHost.append(h("p", { class: "notice", text: `Could not reach ${live.errors.join(", ")} just now. Showing everything else.` }));
  };

  // ---- fetch live results once per query ----
  const sourcesKey = prefs.sources.join(",");
  if (wantLive && (live.q !== f.q || live.sources !== sourcesKey)) {
    live = { q: f.q, sources: sourcesKey, items: [], errors: [], done: false, promise: null };
    const mine = live;
    mine.promise = searchLive(f.q, prefs.sources).then((r) => { mine.items = r.items; mine.errors = r.errors; }).catch(() => { mine.errors = ["the open libraries"]; }).finally(() => {
      mine.done = true;
      if (live === mine) { paintResults(); loadCommunityRatings(mine.items.map((i) => i.id)).then(() => alive && !root.contains(document.activeElement) && paintResults()); }
    });
  } else if (wantLive && !live.done) {
    live.promise?.finally(() => alive && paintResults());
  }

  root.append(h("div", { class: "wrap searchpage" },
    searchForm(f.q),
    h("div", { class: "layout" },
      h("aside", {}, filterBtn, filterPanel),
      h("section", {}, h("div", { class: "resultsbar" }, countEl, h("div", { class: "field" }, h("label", { class: "sr-only", for: "sortSel", text: "Sort by" }), sortSel)), noticeHost, resultsHost))));
  sortSel.id = "sortSel";
  paintResults();
  loadCommunityRatings(curated.map((x) => x.item.id)).then(() => alive && !root.contains(document.activeElement) && paintResults());
  if (window.matchMedia("(min-width: 900px)").matches) filterPanel.hidden = false;
}

// ---------------- Library ----------------
const hydrate = (rec) => {
  const base = byId.get(rec.snapshot.id);
  return base || { level: "all", desc: "", cats: [], tags: [], offline: !!(rec.snapshot.download || rec.snapshot.dl), ...rec.snapshot };
};

export function renderLibrary(root, ctx) {
  let collection = "";
  let status = "";
  let alive = true;
  const signature = () => listSaved().map((r) => r.snapshot.id).join("|") + "#" + listCollections().join("|");
  let lastSig = signature();

  const host = h("div");
  const paint = () => {
    if (!alive) return;
    clear(host);
    const cols = listCollections();
    const saved = listSaved().filter((r) => (!collection || r.collection === collection) && (!status || r.status === status));

    host.append(h("div", { class: "libhead" },
      h("h1", { text: "My library" }),
      !currentUser() && h("div", { class: "nudge" }, h("span", { text: authEnabled() ? "Saved on this device only. Sign in to keep your library on every phone and laptop." : "Saved on this device only. You can export a backup from Settings." }), authEnabled() && h("button", { class: "btn btn--small", type: "button", onclick: () => ctx.signIn() }, "Sign in")),
      h("div", { class: "collections", role: "group", "aria-label": "Lists" },
        h("button", { class: "chip", type: "button", "aria-pressed": String(!collection), onclick: () => { collection = ""; paint(); } }, `All (${listSaved().length})`),
        ...cols.map((c) => h("button", { class: "chip", type: "button", "aria-pressed": String(collection === c), onclick: () => { collection = c; paint(); } }, `${c} (${listSaved().filter((r) => r.collection === c).length})`)),
        h("button", { class: "chip", type: "button", onclick: () => { const el = document.getElementById("newColWrap"); el.hidden = !el.hidden; el.querySelector("input")?.focus(); } }, icon("plus", 16), "New list")),
      newListForm(() => paint()),
      h("div", { class: "collections", role: "group", "aria-label": "Progress" },
        h("button", { class: "chip", type: "button", "aria-pressed": String(!status), onclick: () => { status = ""; paint(); } }, "Any progress"),
        ...STATUSES.map((s) => h("button", { class: "chip", type: "button", "aria-pressed": String(status === s.id), onclick: () => { status = s.id; paint(); } }, s.label))),
      collection && collection !== "Saved" && h("div", {}, h("button", { class: "btn btn--danger btn--small", type: "button", onclick: () => { if (confirm(`Delete the list “${collection}”? Items move back to “Saved”.`)) { removeCollection(collection); collection = ""; paint(); } } }, icon("trash", 16), "Delete this list"))));

    if (!saved.length) {
      host.append(h("div", { class: "empty" }, icon("bookmark", 40), h("h2", { text: listSaved().length ? "Nothing here with those filters" : "Your library is empty" }),
        h("p", { text: listSaved().length ? "Try a different list or progress." : "Tap Save on anything you find. It lands here, ready to download or finish later." }),
        h("a", { class: "btn", href: "#/" }, "Find something to learn")));
      return;
    }
    const statusSel = (rec) => h("select", { class: "input status-select", "aria-label": `Progress for ${rec.snapshot.title}`, onchange: (e) => update(rec.snapshot.id, { status: e.target.value }) },
      ...STATUSES.map((s) => h("option", { value: s.id, selected: s.id === rec.status, text: s.label })));
    host.append(h("ul", { class: "rows" }, ...saved.map((rec) => {
      const item = hydrate(rec);
      return resultRow({ item, eff: scoreResource(item, communityRating(item.id)) }, { ...ctx, extra: () => statusSel(rec) });
    })));
  };

  // Re-draw only when items or lists were added/removed (e.g. a cloud sync finished), not on every progress change.
  const onStore = () => { const s = signature(); if (s !== lastSig) { lastSig = s; paint(); } };
  onChange(onStore);
  root.__cleanup = () => { alive = false; offChange(onStore); };
  root.append(h("div", { class: "wrap" }, host));
  paint();
}

function newListForm(onDone) {
  const input = h("input", { class: "input", maxlength: "40", placeholder: "Name your list, for example: Learn Python", "aria-label": "New list name" });
  return h("form", { id: "newColWrap", class: "searchbar", hidden: true, onsubmit: (e) => {
    e.preventDefault();
    try { addCollection(input.value); onDone(); } catch (err) { toast(err.message); }
  } }, input, h("button", { class: "btn", type: "submit" }, "Create"));
}

// ---------------- How it works ----------------
export function renderAbout(root) {
  const li = (title, text) => h("li", {}, h("strong", { text: title + " " }), text);
  root.append(h("div", { class: "wrap" }, h("article", { class: "prose" },
    h("h1", { text: "How Lantern works" }),
    h("p", { text: "Lantern is for people who want to learn with little or no money, using a phone or laptop. It searches free libraries and a hand-picked list, then tells you plainly what each thing costs, whether it gives a certificate, and how well it seems to work." }),
    h("h2", { text: "The effectiveness score" }),
    h("p", { text: "Each resource gets a number from 0 to 100. It is built from signals we can show you, and a missing signal is never counted as a bad one:" }),
    h("ul", {},
      li("What learners say (40%).", "Star ratings from the source and from Lantern members. A few ratings count for less than many, so one 5-star vote cannot beat hundreds of 4.6s."),
      li("How well it teaches (35%).", "Our own editorial review of structure, hands-on practice and depth. Only hand-picked items have this."),
      li("How many people use it (10%).", "Popular is not the same as good, so this counts for little."),
      li("Cost, proof and access (15%).", "Free is better than paid, a certificate or badge helps, and offline use helps people with limited data.")),
    h("p", { text: "Confidence tells you how much evidence is behind the number. “Limited evidence” means treat the score as a hint and read the reviews." }),
    h("h2", { text: "Where results come from" }),
    h("ul", {},
      li("Hand-picked list.", "Courses, books and videos we reviewed. Prices and certificates change, so we link straight to the provider for exact terms."),
      li("Open libraries, live.", "Open Library, Project Gutenberg, Internet Archive, Wikiversity and Wikibooks are searched when you search. They are free and open, so everything from them is free to read or download."),
      li("Paid platforms.", "We list well-known paid sites so you can compare, and mark them clearly. Many offer financial aid or free trials.")),
    h("h2", { text: "Certificates" }),
    h("p", { text: "“Free certificate” means a certificate of completion at no cost. “Free badge” means a completion badge that is not a formal certificate. “Paid certificate” means learning may be free but the certificate costs money. A certificate shows you finished; employers usually care more about what you can do, so build something too." }),
    h("h2", { text: "Your privacy and security" }),
    h("ul", {},
      li("No ads, no trackers.", "Lantern loads no analytics, fonts or scripts from other websites."),
      li("Searches go straight to the libraries.", "Your search words are sent from your device to the libraries you leave switched on in Settings. They do not pass through a Lantern server. Turn any off in Settings."),
      li("Your library is private.", "Saved items are stored on your device and, if you sign in, in a database where only you can read or change your rows."),
      li("Safer sign-in.", "Social logins use PKCE, and passwords are never stored by Lantern."),
      li("You own your data.", "Export it any time, or delete it from your account menu.")),
    h("h2", { text: "Something wrong or missing?" }),
    h("p", {}, "Prices, certificates and links change. Please ", h("a", { href: CONFIG.feedbackUrl, target: "_blank", rel: "noopener noreferrer", text: "tell us" }), " and we will fix it."))));
}
