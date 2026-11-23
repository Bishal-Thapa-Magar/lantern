// Lantern entry point: boots storage and sign-in, then routes between screens using the URL hash.

import { icon, clear } from "./util.js";
import { CONFIG } from "../config.js";
import { completeRedirect, currentUser, onAuthChange } from "./auth.js";
import { getPrefs, initStore } from "./store.js";
import { initDialog, toast } from "./ui/components.js";
import { openDetail } from "./ui/detail.js";
import { getTheme, nextTheme, openAccount, openAuth, openNewPassword, openSettings, setTheme, themeInfo } from "./ui/account.js";
import { renderAbout, renderHome, renderLibrary, renderSearch } from "./ui/views.js";

const main = document.getElementById("main");
const ctx = {
  openDetail: (entry) => openDetail(entry, { onSignIn: () => openAuth("signin") }),
  signIn: () => openAuth("signin"),
};

// ---------------- Header ----------------
function paintHeader() {
  const t = themeInfo(getTheme());
  const next = nextTheme();
  const themeBtn = document.getElementById("themeBtn");
  clear(themeBtn).append(icon(t.icon, 22));
  themeBtn.setAttribute("aria-label", `Theme: ${t.label}. Switch to ${next.label}`);
  themeBtn.title = `Theme: ${t.label}. Tap to switch to ${next.label}`;

  const user = currentUser();
  const account = document.getElementById("accountBtn");
  account.textContent = user ? (user.name?.split(" ")[0] || user.email?.split("@")[0] || "Account") : "Sign in";
  account.classList.toggle("btn--ghost", !!user);
}

function wireHeader() {
  for (const el of document.querySelectorAll("[data-icon]")) el.replaceWith(icon(el.dataset.icon, 22));
  clear(document.getElementById("settingsBtn")).append(icon("sliders", 22));
  document.getElementById("themeBtn").addEventListener("click", () => { setTheme(nextTheme().id); paintHeader(); });
  document.getElementById("settingsBtn").addEventListener("click", openSettings);
  document.getElementById("accountBtn").addEventListener("click", () => (currentUser() ? openAccount() : openAuth("signin")));
  document.addEventListener("themechange", paintHeader);
  const fb = document.getElementById("feedbackLink");
  if (fb) fb.href = CONFIG.feedbackUrl;
  paintHeader();
}

// ---------------- Router ----------------
function route() {
  main.__cleanup?.();
  main.__cleanup = null;
  clear(main);
  const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  let name = "home";
  let title = "Lantern: free and low-cost learning";

  if (path.startsWith("/search")) { name = "search"; renderSearch(main, params, ctx); title = params.get("q") ? `${params.get("q").slice(0, 40)}: Lantern` : "Search: Lantern"; }
  else if (path.startsWith("/library")) { name = "library"; renderLibrary(main, ctx); title = "My library: Lantern"; }
  else if (path.startsWith("/about")) { name = "about"; renderAbout(main); title = "How it works: Lantern"; }
  else renderHome(main, ctx);

  document.title = title;
  for (const a of document.querySelectorAll("[data-nav]")) {
    if (a.dataset.nav === name) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  window.scrollTo(0, 0);
}

// ---------------- Boot ----------------
async function boot() {
  // Frame-busting: this site has sign-in, so refuse to run inside someone else's page.
  if (window.top !== window.self) {
    document.documentElement.hidden = true;
    try { window.top.location = window.location.href; } catch { /* cross-origin: stay hidden */ }
    return;
  }

  const prefs = getPrefs();
  if (prefs.dataSaver) document.documentElement.setAttribute("data-datasaver", "on");

  initDialog();
  wireHeader();

  let redirect = null;
  try { redirect = await completeRedirect(); } catch (err) { toast(err.message); }
  initStore();
  onAuthChange(() => paintHeader());

  window.addEventListener("hashchange", route);
  route();
  paintHeader();

  if (redirect) {
    if (redirect.recovery) openNewPassword();
    else toast("You are signed in");
  }

  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline support is optional */ });
  }
}

boot();
