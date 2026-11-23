// Sign-in / create-account dialog, new-password dialog, and the settings dialog.

import { h, icon, clear, safeStorage } from "../util.js";
import { CONFIG } from "../../config.js";
import { authEnabled, currentUser, requestPasswordReset, setNewPassword, signInWithEmail, signInWithOAuth, signOut, signUpWithEmail } from "../auth.js";
import { deleteCloudData, exportLibrary, getPrefs, importLibrary, pendingSync, setPrefs } from "../store.js";
import { PROVIDERS } from "../sources.js";
import { closeDialog, openDialog, toast } from "./components.js";

const THEMES = [
  { id: "light", label: "Light", icon: "sun" },
  { id: "dark", label: "Dark", icon: "moon" },
  { id: "night", label: "Night", icon: "night" },
];
const local = safeStorage("local");

export const getTheme = () => document.documentElement.getAttribute("data-theme") || "light";
export function setTheme(id) {
  if (!THEMES.some((t) => t.id === id)) return;
  document.documentElement.setAttribute("data-theme", id);
  local.setItem("lantern.theme", id);
  const color = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color || "#f5f6fa");
}
export const nextTheme = () => THEMES[(THEMES.findIndex((t) => t.id === getTheme()) + 1) % THEMES.length];
export const themeInfo = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

// ---------------- Sign in / create account ----------------
export function openAuth(startMode = "signin") {
  if (!authEnabled()) {
    openDialog("Accounts are not on yet", [
      h("p", { text: "You can still search, save and download. Saved items stay on this device." }),
      h("p", { text: "Site owner: add your Supabase project details in config.js and run supabase/schema.sql. The README has the 10-minute checklist." }),
    ]);
    return;
  }
  let mode = startMode; // signin | signup | reset

  const render = () => {
    const msg = h("p", { class: "form-error", role: "alert" });
    const ok = h("p", { class: "form-ok", role: "status" });
    const email = h("input", { class: "input", id: "authEmail", type: "email", autocomplete: "email", required: true, inputmode: "email", maxlength: "254" });
    const pass = h("input", { class: "input", id: "authPass", type: "password", autocomplete: mode === "signup" ? "new-password" : "current-password", required: true, minlength: "10", maxlength: "72" });
    const submit = h("button", { class: "btn btn--block", type: "submit" }, mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link");

    const form = h("form", { class: "stack", novalidate: true, onsubmit: async (ev) => {
      ev.preventDefault();
      msg.textContent = ""; ok.textContent = "";
      const em = email.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { msg.textContent = "Enter a valid email address."; email.focus(); return; }
      submit.disabled = true;
      try {
        if (mode === "reset") { await requestPasswordReset(em); ok.textContent = "If that email has an account, a reset link is on its way."; }
        else if (mode === "signup") {
          const r = await signUpWithEmail(em, pass.value);
          if (r.needsConfirm) ok.textContent = "Almost done. Open the email we sent and tap the link to confirm.";
          else { closeDialog(); toast("Welcome to Lantern"); }
        } else { await signInWithEmail(em, pass.value); closeDialog(); toast("Signed in"); }
      } catch (err) { msg.textContent = err.message; }
      submit.disabled = false;
    } },
      h("div", { class: "field" }, h("label", { for: "authEmail", text: "Email" }), email),
      mode !== "reset" && h("div", { class: "field" }, h("label", { for: "authPass", text: "Password" }), pass,
        mode === "signup" && h("span", { class: "hint", text: "At least 10 characters. A few random words works well." })),
      msg, ok, submit,
      mode === "signin" && h("button", { class: "btn btn--ghost btn--small", type: "button", onclick: () => { mode = "reset"; render(); } }, "Forgot password?"));

    const social = h("div", { class: "social" }, ...CONFIG.oauthProviders.map((p) =>
      h("button", { class: "btn btn--ghost btn--block", type: "button", onclick: async () => { try { await signInWithOAuth(p.id); } catch (err) { toast(err.message); } } }, `Continue with ${p.label}`)));

    const tabs = h("div", { class: "tabs", role: "tablist" },
      ...[["signin", "Sign in"], ["signup", "Create account"]].map(([id, label]) =>
        h("button", { type: "button", role: "tab", "aria-selected": String(mode === id), onclick: () => { mode = id; render(); } }, label)));

    openDialog(mode === "reset" ? "Reset your password" : mode === "signup" ? "Create your free account" : "Welcome back", [
      h("p", { text: "Keep your saved courses and lists on every phone and laptop. Free, with no ads." }),
      mode !== "reset" && tabs,
      mode !== "reset" && CONFIG.oauthProviders.length > 0 && social,
      mode !== "reset" && CONFIG.oauthProviders.length > 0 && CONFIG.emailLogin && h("div", { class: "divider", text: "or use email" }),
      (CONFIG.emailLogin || mode === "reset") && form,
      mode === "reset" && h("button", { class: "btn btn--ghost btn--small", type: "button", onclick: () => { mode = "signin"; render(); } }, "Back to sign in"),
      h("p", { class: "hint", text: "We only store your email, your saved items and your ratings. See How it works for details." }),
    ]);
    document.getElementById("authEmail")?.focus();
  };
  render();
}

export function openNewPassword() {
  const msg = h("p", { class: "form-error", role: "alert" });
  const pass = h("input", { class: "input", id: "newPass", type: "password", autocomplete: "new-password", minlength: "10", maxlength: "72", required: true });
  openDialog("Choose a new password", [
    h("form", { class: "stack", onsubmit: async (ev) => {
      ev.preventDefault();
      try { await setNewPassword(pass.value); closeDialog(); toast("Password updated"); } catch (err) { msg.textContent = err.message; }
    } },
      h("div", { class: "field" }, h("label", { for: "newPass", text: "New password" }), pass, h("span", { class: "hint", text: "At least 10 characters." })),
      msg, h("button", { class: "btn btn--block", type: "submit" }, "Save password")),
  ]);
}

// ---------------- Account menu (when signed in) ----------------
export function openAccount() {
  const u = currentUser();
  openDialog("Your account", [
    h("div", { class: "block" }, h("p", { text: `Signed in as ${u.email || "your account"}${u.provider && u.provider !== "email" ? ` with ${u.provider}` : ""}.` }),
      pendingSync() > 0 && h("p", { text: `${pendingSync()} change(s) are waiting to sync and will upload when you are online.` })),
    h("button", { class: "btn btn--block", type: "button", onclick: async () => { await signOut(); closeDialog(); toast("Signed out"); } }, icon("logout", 18), "Sign out"),
    h("div", { class: "block" }, h("h3", { text: "Delete my data" }),
      h("p", { text: "Removes your saved items, lists and reviews from our database. To also delete the login itself, email the site owner or use the Supabase dashboard." }),
      h("button", { class: "btn btn--danger", type: "button", onclick: async () => {
        if (!confirm("Delete all saved items, lists and reviews from your account? This cannot be undone.")) return;
        try { await deleteCloudData(); toast("Your cloud data was deleted"); } catch (err) { toast(err.message); }
      } }, icon("trash", 18), "Delete my cloud data")),
  ]);
}

// ---------------- Settings ----------------
export function openSettings() {
  const prefs = getPrefs();

  const themeSeg = h("div", { class: "seg", role: "group", "aria-label": "Theme" }, ...THEMES.map((t) =>
    h("button", { type: "button", "aria-pressed": String(getTheme() === t.id), onclick: () => { setTheme(t.id); [...themeSeg.children].forEach((b, i) => b.setAttribute("aria-pressed", String(THEMES[i].id === t.id))); document.dispatchEvent(new Event("themechange")); } }, icon(t.icon), t.label)));

  const saver = h("input", { type: "checkbox", checked: prefs.dataSaver, onchange: (e) => setPrefs({ dataSaver: e.target.checked }) });

  const sources = PROVIDERS.map((p) => {
    const cb = h("input", { type: "checkbox", checked: prefs.sources.includes(p.id), onchange: () => {
      const on = [...document.querySelectorAll("[data-source]")].filter((x) => x.checked).map((x) => x.dataset.source);
      setPrefs({ sources: on });
    } });
    cb.dataset.source = p.id;
    return h("label", { class: "check" }, cb, p.label);
  });

  const fileInput = h("input", { type: "file", accept: "application/json,.json", class: "sr-only", id: "importFile", onchange: async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try { const n = importLibrary(await f.text()); toast(`Imported ${n} item${n === 1 ? "" : "s"}`); } catch (err) { toast(err.message); }
    e.target.value = "";
  } });

  openDialog("Settings", [
    h("div", { class: "block" }, h("h3", { text: "Theme" }), themeSeg,
      h("p", { class: "hint", text: "Night is true black with warm amber text: gentle on the eyes and saves battery on OLED phones." })),
    h("div", { class: "block" }, h("h3", { text: "Save mobile data" }),
      h("label", { class: "check" }, saver, "Don't load cover pictures")),
    h("div", { class: "block" }, h("h3", { text: "Where to search" }),
      h("p", { text: "Your search words are sent directly from your device to each selected library. Turn off any you don't want to use. The hand-picked list always works offline." }),
      h("div", { class: "stack" }, ...sources)),
    h("div", { class: "block" }, h("h3", { text: "Your data" }),
      h("div", { class: "row__actions" },
        h("button", { class: "btn btn--ghost", type: "button", onclick: () => {
          const url = URL.createObjectURL(new Blob([exportLibrary()], { type: "application/json" }));
          const a = document.createElement("a"); // blob: links are deliberately rejected by h(), so build this one by hand
          a.href = url;
          a.download = "lantern-library.json";
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } }, icon("download", 18), "Export library"),
        h("label", { class: "btn btn--ghost", for: "importFile" }, icon("plus", 18), "Import library"), fileInput)),
  ]);
}
