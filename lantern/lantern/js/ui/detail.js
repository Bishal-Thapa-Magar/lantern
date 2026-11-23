// The resource detail dialog: score breakdown, certificate info, save-to-list, progress, and community reviews.

import { h, icon, clear, formatCount } from "../util.js";
import { CONFIG } from "../../config.js";
import { CERTS, PRICES, LEVELS, STATUSES, typeOf, categoryOf } from "../taxonomy.js";
import { bandFor, SCORE_PARTS_HELP } from "../score.js";
import { authEnabled, currentUser } from "../auth.js";
import { addCollection, communityRating, getRecord, isSaved, listCollections, loadMyReview, loadReviews, loadCommunityRatings, save, submitReview, unsave, update } from "../store.js";
import { badge, certBadge, downloadControl, openDialog, priceBadge, ring, stars, toast } from "./components.js";
import { scoreResource } from "../score.js";

const PART_LABELS = { community: "What learners say", design: "How well it teaches", reach: "How many use it", access: "Cost, proof and access" };

export function openDetail(entry, { onSignIn } = {}) {
  const { item } = entry;
  const eff = () => scoreResource(item, communityRating(item.id));
  const e = eff();
  const t = typeOf(item.type);

  const body = [
    h("div", { class: "block" },
      h("div", { class: "row__meta" }, h("span", { text: item.provider }), h("span", { text: t.label }), item.level !== "all" && h("span", { text: LEVELS[item.level] }), item.hours && h("span", { text: `about ${item.hours} hours` })),
      h("div", { class: "row__badges" }, priceBadge(item.price), certBadge(item.cert), item.offline && badge("Offline-friendly", "muted", "wifi"), ...item.cats.map((c) => categoryOf(c) && badge(categoryOf(c).label))),
      h("p", { text: item.desc })),
    costBlock(item),
    scoreBlock(item, e),
    saveBlock(item),
    reviewsBlock(item, onSignIn),
  ];

  const foot = [
    h("a", { class: "btn btn--ghost", href: `${CONFIG.feedbackUrl}?title=${encodeURIComponent("Problem with: " + item.title)}`, target: "_blank", rel: "noopener noreferrer" }, "Report a problem"),
    downloadControl(item, { small: false }),
    h("a", { class: "btn", href: item.url, target: "_blank", rel: "noopener noreferrer" }, `Open on ${item.provider.split(" · ").pop()}`, icon("external", 18)),
  ];
  openDialog(item.title, body, foot);
  loadCommunityRatings([item.id]);
}

function costBlock(item) {
  const p = PRICES[item.price];
  const c = CERTS[item.cert];
  return h("div", { class: "block" },
    h("h3", { text: "Cost and certificate" }),
    h("p", { text: `${p.label}: ${p.help}` }),
    h("p", { text: `${c.label}: ${item.certNote || c.help}` }),
    item.source !== "lantern" && h("p", { text: "This result came from a live search of an open library. Check the page for exact terms." }));
}

function scoreBlock(item, e) {
  const parts = Object.entries(e.parts).map(([key, value]) =>
    h("div", { class: "part" },
      h("div", { class: "part__top" }, h("span", { text: PART_LABELS[key] }), h("span", { text: `${Math.round(value)}/100` })),
      barEl(value),
      h("small", { text: SCORE_PARTS_HELP[key] })));
  const ratingLine = item.ext
    ? `${item.ext.avg.toFixed(1)} out of 5 from ${formatCount(item.ext.count)} ratings (${item.ext.source}).`
    : "No ratings from other websites are included for this resource.";
  return h("div", { class: "block" },
    h("h3", { text: "Effectiveness" }),
    h("div", { class: "score" }, ring(e.score, true),
      h("div", { class: "score__text" }, h("strong", { text: `${bandFor(e.score)}, ${e.confidence} confidence` }), stars(e.rating), h("span", { text: ratingLine }))),
    h("div", { class: "parts" }, ...parts));
}

function barEl(value) {
  const i = h("i");
  i.style.setProperty("--w", String(Math.round(value)));
  return h("div", { class: "bar", "aria-hidden": "true" }, i);
}

// ---------------- Save to list + progress ----------------
function saveBlock(item) {
  const host = h("div", { class: "block" });
  let adding = false;
  const paint = () => {
    clear(host);
    host.append(h("h3", { text: "Your library" }));
    if (!isSaved(item.id)) {
      host.append(h("button", { class: "btn btn--block", type: "button", onclick: () => { try { save(item); paint(); toast("Saved to your library"); } catch (err) { toast(err.message); } } }, icon("bookmark", 18), "Save to my library"));
      return;
    }
    const rec = getRecord(item.id);
    const collection = h("select", { class: "input", id: "colSel", onchange: (ev) => {
      if (ev.target.value === "__new") { adding = true; paint(); }
      else update(item.id, { collection: ev.target.value });
    } },
      ...listCollections().map((c) => h("option", { value: c, selected: c === rec.collection, text: c })),
      h("option", { value: "__new", text: "New list…" }));
    const status = h("select", { class: "input", id: "statSel", onchange: (ev) => update(item.id, { status: ev.target.value }) },
      ...STATUSES.map((s) => h("option", { value: s.id, selected: s.id === rec.status, text: s.label })));
    const newList = h("input", { class: "input", id: "newList", maxlength: "40", placeholder: "For example: Learn Python", "aria-label": "New list name" });
    const addRow = h("div", { class: "field" }, h("label", { for: "newList", text: "New list name" }), newList,
      h("div", { class: "row__actions" },
        h("button", { class: "btn btn--small", type: "button", onclick: () => {
          try { const n = addCollection(newList.value); update(item.id, { collection: n }); adding = false; paint(); } catch (err) { toast(err.message); }
        } }, "Create list"),
        h("button", { class: "btn btn--ghost btn--small", type: "button", onclick: () => { adding = false; paint(); } }, "Cancel")));
    host.append(
      h("div", { class: "stack" },
        adding ? addRow : h("div", { class: "field" }, h("label", { for: "colSel", text: "List" }), collection),
        h("div", { class: "field" }, h("label", { for: "statSel", text: "Progress" }), status),
        h("button", { class: "btn btn--ghost", type: "button", onclick: () => { unsave(item.id); paint(); toast("Removed from your library"); } }, icon("trash", 18), "Remove from library")));
  };
  paint();
  return host;
}

// ---------------- Reviews ----------------
function reviewsBlock(item, onSignIn) {
  const host = h("div", { class: "block" }, h("h3", { text: "Learner reviews" }));
  if (!authEnabled()) {
    host.append(h("p", { text: "Reviews from Lantern members will appear here once accounts are switched on." }));
    return host;
  }
  const list = h("div");
  const form = h("div", { class: "stack" });
  host.append(list, form);

  const paintList = async () => {
    clear(list);
    try {
      const reviews = await loadReviews(item.id);
      if (!reviews.length) list.append(h("p", { text: "No reviews yet. Be the first to share how it went." }));
      for (const r of reviews) list.append(h("div", { class: "review" }, stars({ avg: r.rating, count: 1 }), r.comment && h("p", { text: r.comment }), h("small", { text: new Date(r.at).toLocaleDateString() })));
    } catch {
      list.append(h("p", { text: "Reviews could not be loaded right now." }));
    }
  };

  const paintForm = async () => {
    clear(form);
    if (!currentUser()) {
      form.append(h("button", { class: "btn btn--ghost", type: "button", onclick: () => onSignIn?.() }, "Sign in to rate this"));
      return;
    }
    let mine = null;
    try { mine = await loadMyReview(item.id); } catch { /* ignore */ }
    let rating = mine?.rating || 0;
    const row = h("div", { class: "rate", role: "radiogroup", "aria-label": "Your rating" });
    const paintStars = () => [...row.children].forEach((b, i) => { b.classList.toggle("on", i < rating); b.setAttribute("aria-checked", String(i + 1 === rating)); });
    for (let i = 1; i <= 5; i++) row.append(h("button", { type: "button", role: "radio", "aria-label": `${i} star${i > 1 ? "s" : ""}`, onclick: () => { rating = i; paintStars(); } }, icon("star")));
    paintStars();
    const text = h("textarea", { class: "input", maxlength: "500", placeholder: "What worked, what did not? (optional, shown publicly)", "aria-label": "Your review" });
    text.value = mine?.comment || "";
    const msg = h("p", { class: "form-error", role: "alert" });
    form.append(h("div", { class: "label", text: mine ? "Your review" : "Rate this resource" }), row, text, msg,
      h("button", { class: "btn", type: "button", onclick: async (ev) => {
        ev.target.disabled = true;
        try { await submitReview(item.id, rating, text.value); toast("Thanks, your review is saved"); await paintList(); } catch (err) { msg.textContent = err.message; }
        ev.target.disabled = false;
      } }, mine ? "Update review" : "Post review"));
  };
  paintList();
  paintForm();
  return host;
}
