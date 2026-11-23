// Reusable UI pieces: toast, dialog shell, badges, score ring, stars, and the result row.

import { h, icon, clear, formatCount, safeUrl } from "../util.js";
import { PRICES, CERTS, LEVELS, typeOf, categoryOf } from "../taxonomy.js";
import { bandFor } from "../score.js";
import { isSaved, save, unsave } from "../store.js";
import { resolveDownload } from "../sources.js";

// ---------------- Toast ----------------
export function toast(message, action) {
  const host = document.getElementById("toasts");
  const el = h("div", { class: action ? "toast toast--action" : "toast" }, h("span", { text: message }), action && h("button", { class: "btn btn--small", type: "button", onclick: () => { action.fn(); el.remove(); } }, action.label));
  host.append(el);
  setTimeout(() => el.remove(), action ? 6000 : 3500);
}

// ---------------- Dialog ----------------
const dlg = () => document.getElementById("dialog");

/** Open the shared <dialog>. `build(close)` returns {title, body, foot?}. */
export function openDialog(title, bodyNodes, footNodes) {
  const d = dlg();
  clear(d);
  d.append(
    h("div", { class: "dialog__head" },
      h("h2", { id: "dialogTitle", text: title }),
      h("button", { class: "iconbtn", type: "button", "aria-label": "Close", onclick: closeDialog }, icon("close"))),
    h("div", { class: "dialog__body" }, bodyNodes),
    footNodes ? h("div", { class: "dialog__foot" }, footNodes) : null,
  );
  if (!d.open) d.showModal();
  d.querySelector(".dialog__body")?.scrollTo(0, 0);
  return d;
}

export function closeDialog() {
  const d = dlg();
  if (d.open) d.close();
}

export function initDialog() {
  const d = dlg();
  // Click on the dark backdrop closes the dialog.
  d.addEventListener("click", (e) => {
    if (e.target === d) closeDialog();
  });
}

// ---------------- Badges ----------------
export const badge = (text, tone = "muted", iconName) => h("span", { class: `badge badge--${tone}` }, iconName && icon(iconName, 14), text);

export function priceBadge(price) {
  const p = PRICES[price] || PRICES.free;
  return badge(p.label, p.tone);
}
export function certBadge(cert) {
  const c = CERTS[cert] || CERTS.none;
  return badge(c.label, c.tone, cert === "none" ? undefined : "cert");
}

// ---------------- Score ring & stars ----------------
export function ring(score, big = false) {
  const el = h("div", { class: big ? "ring ring--big" : "ring", role: "img", "aria-label": `Effectiveness ${score} out of 100, ${bandFor(score)}` }, h("b", { text: String(score) }));
  el.style.setProperty("--p", String(score));
  return el;
}

export function stars(rating) {
  if (!rating) return h("span", { class: "stars", text: "No ratings yet" });
  return h("span", { class: "stars", "aria-label": `${rating.avg.toFixed(1)} out of 5 from ${rating.count} ratings` }, icon("star", 16), `${rating.avg.toFixed(1)}`, h("span", { text: `(${formatCount(rating.count)})` }));
}

// ---------------- Download button ----------------
export function downloadControl(item, { small = true } = {}) {
  if (!item.download && !item.dl) return null;
  const cls = small ? "btn btn--ghost btn--small" : "btn btn--ghost";
  if (item.download) {
    return h("a", { class: cls, href: item.download, target: "_blank", rel: "noopener noreferrer" }, icon("download", 18), "Download");
  }
  const btn = h("button", { class: cls, type: "button" }, icon("download", 18), "Download");
  btn.addEventListener("click", async () => {
    // Open the tab immediately (inside the tap) so phones do not block it, then point it at the real file.
    const w = window.open("", "_blank");
    if (w) w.opener = null;
    btn.setAttribute("aria-busy", "true");
    btn.disabled = true;
    const url = await resolveDownload(item);
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    const safe = safeUrl(url);
    if (!safe) { w?.close(); toast("Could not find a file to download."); return; }
    if (w) w.location.replace(safe);
    else location.assign(safe);
  });
  return btn;
}

// ---------------- The result row ----------------
/** entry: {item, eff}. ctx: {openDetail(entry)} */
export function resultRow(entry, ctx) {
  const { item, eff } = entry;
  const t = typeOf(item.type);

  const cover = h("div", { class: "cover" }, icon(t.icon, 26));
  if (item.cover) {
    const img = h("img", { src: item.cover, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
    img.addEventListener("error", () => img.remove());
    cover.append(img);
  }

  const saveBtn = h("button", { class: "btn btn--ghost btn--small savebtn", type: "button", "aria-pressed": String(isSaved(item.id)) });
  const paintSave = () => {
    const on = isSaved(item.id);
    saveBtn.setAttribute("aria-pressed", String(on));
    clear(saveBtn).append(icon("bookmark", 18), on ? "Saved" : "Save");
    saveBtn.setAttribute("aria-label", `${on ? "Remove" : "Save"}: ${item.title}`);
  };
  paintSave();
  saveBtn.addEventListener("click", () => {
    try {
      if (isSaved(item.id)) { unsave(item.id); toast("Removed from your library"); }
      else {
        save(item);
        toast("Saved to your library", { label: "Choose list", fn: () => ctx.openDetail(entry) });
      }
      paintSave();
    } catch (e) { toast(e.message); }
  });

  const meta = [t.label, item.level && item.level !== "all" ? LEVELS[item.level] : null, item.hours ? `about ${item.hours} h` : null, item.year ? String(item.year) : null]
    .filter(Boolean)
    .map((m) => h("span", { text: m }));

  return h("li", { class: "row" },
    cover,
    h("div", { class: "row__main" },
      h("h3", { class: "row__title" }, h("button", { type: "button", onclick: () => ctx.openDetail(entry) }, item.title)),
      h("div", { class: "row__meta" }, h("span", { text: item.provider }), ...meta),
      h("div", { class: "row__badges" },
        priceBadge(item.price), certBadge(item.cert),
        item.offline && badge("Offline-friendly", "muted", "wifi"),
        ...(item.cats || []).slice(0, 1).map((c) => categoryOf(c) && badge(categoryOf(c).label))),
      h("p", { class: "row__desc", text: item.desc })),
    h("div", { class: "row__side" },
      h("div", { class: "score" }, ring(eff.score),
        h("div", { class: "score__text" }, h("strong", { text: `${bandFor(eff.score)}` }), stars(eff.rating),
          eff.confidence === "low" && h("span", { text: "Limited evidence" }))),
      h("div", { class: "row__actions" }, saveBtn, ctx.extra?.(entry), downloadControl(item),
        h("a", { class: "btn btn--small", href: item.url, target: "_blank", rel: "noopener noreferrer", "aria-label": `Open ${item.title} on ${item.provider}` }, "Open", icon("external", 16)))));
}

export function skeletons(n = 3) {
  return h("div", { "aria-hidden": "true" }, ...Array.from({ length: n }, () => h("div", { class: "skeleton" })));
}
