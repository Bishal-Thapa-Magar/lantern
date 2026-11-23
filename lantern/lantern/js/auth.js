// Sign-in with Supabase Auth, using its public REST API directly (no third-party script is loaded,
// so the page can run with a strict Content-Security-Policy of script-src 'self').
//
// Social logins use the OAuth "PKCE" flow: the browser makes a random secret (verifier), sends only its
// SHA-256 hash (challenge) to start the login, and proves it holds the secret when swapping the one-time
// ?code for a session. A stolen redirect URL is therefore useless on its own.

import { CONFIG } from "../config.js";
import { randomString, sha256Base64Url, safeStorage } from "./util.js";

const local = safeStorage("local");
const session_ = safeStorage("session");
const SESSION_KEY = "lantern.session";
const PKCE_KEY = "lantern.pkce";

export const authEnabled = () => /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(CONFIG.supabaseUrl) && CONFIG.supabaseAnonKey.length > 40;

const listeners = new Set();
let current = readSession();
let refreshing = null;

export const onAuthChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const currentUser = () => current?.user || null;

function emit() {
  for (const fn of listeners) {
    try { fn(currentUser()); } catch { /* a bad listener must not break sign-in */ }
  }
}

function readSession() {
  try {
    const raw = JSON.parse(local.getItem(SESSION_KEY) || "null");
    if (raw && typeof raw.access_token === "string" && typeof raw.refresh_token === "string") return raw;
  } catch { /* corrupted: treat as signed out */ }
  return null;
}

function saveSession(s) {
  if (!s) {
    current = null;
    local.removeItem(SESSION_KEY);
  } else {
    // Only keep what we need.
    current = {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
      user: s.user ? { id: s.user.id, email: s.user.email, name: s.user.user_metadata?.full_name || s.user.user_metadata?.name || "", provider: s.user.app_metadata?.provider || "email" } : current?.user || null,
    };
    local.setItem(SESSION_KEY, JSON.stringify(current));
  }
  emit();
}

async function api(path, { method = "GET", body, token, query } = {}) {
  if (!authEnabled()) throw new Error("Accounts are not switched on for this site yet.");
  const url = new URL(`${CONFIG.supabaseUrl}${path}`);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: {
      apikey: CONFIG.supabaseAnonKey,
      Authorization: `Bearer ${token || CONFIG.supabaseAnonKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON error */ }
  if (!res.ok) {
    const msg = data?.msg || data?.error_description || data?.message || data?.error || `Request failed (${res.status})`;
    const err = new Error(friendly(String(msg)));
    err.status = res.status;
    throw err;
  }
  return data;
}

function friendly(msg) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Email or password is not right.";
  if (m.includes("email not confirmed")) return "Confirm your email first: check your inbox for the link.";
  if (m.includes("already registered") || m.includes("already been registered")) return "That email already has an account. Try signing in.";
  if (m.includes("password") && m.includes("characters")) return "Choose a longer password.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many tries. Please wait a minute and try again.";
  return msg.length > 160 ? "Something went wrong. Please try again." : msg;
}

const redirectUrl = () => location.origin + location.pathname;

async function startPkce(recovery = false) {
  const verifier = randomString(64); // 86 chars, within the 43-128 allowed
  session_.setItem(PKCE_KEY, JSON.stringify({ verifier, recovery, at: Date.now() }));
  return { challenge: await sha256Base64Url(verifier), method: "s256" };
}

export async function signInWithOAuth(provider) {
  if (!CONFIG.oauthProviders.some((p) => p.id === provider)) throw new Error("Unknown provider");
  if (!authEnabled()) throw new Error("Accounts are not switched on for this site yet.");
  const { challenge, method } = await startPkce();
  const url = new URL(`${CONFIG.supabaseUrl}/auth/v1/authorize`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("redirect_to", redirectUrl());
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", method);
  location.assign(url.href);
}

/** Call once at startup. Finishes a login if we were just redirected back with ?code=. Returns {recovery} or null. */
export async function completeRedirect() {
  const params = new URLSearchParams(location.search);
  const errorDesc = params.get("error_description");
  const code = params.get("code");
  if (!code && !errorDesc) return null;
  history.replaceState(null, "", location.pathname + location.hash);
  if (errorDesc) throw new Error(friendly(errorDesc.replace(/\+/g, " ")));
  if (!/^[A-Za-z0-9-]{8,200}$/.test(code)) throw new Error("That sign-in link is not valid.");
  let stored = null;
  try { stored = JSON.parse(session_.getItem(PKCE_KEY) || "null"); } catch { /* ignore */ }
  session_.removeItem(PKCE_KEY);
  if (!stored?.verifier || Date.now() - stored.at > 30 * 60 * 1000) {
    throw new Error("That sign-in link has expired or was opened in a different browser. Please start again.");
  }
  const data = await api("/auth/v1/token", { method: "POST", query: { grant_type: "pkce" }, body: { auth_code: code, code_verifier: stored.verifier } });
  saveSession(data);
  return { recovery: !!stored.recovery };
}

export async function signUpWithEmail(email, password) {
  checkPassword(password);
  const { challenge, method } = await startPkce();
  const data = await api("/auth/v1/signup", {
    method: "POST",
    query: { redirect_to: redirectUrl() },
    body: { email, password, code_challenge: challenge, code_challenge_method: method },
  });
  if (data?.access_token) {
    saveSession(data);
    return { needsConfirm: false };
  }
  return { needsConfirm: true };
}

export async function signInWithEmail(email, password) {
  const data = await api("/auth/v1/token", { method: "POST", query: { grant_type: "password" }, body: { email, password } });
  saveSession(data);
}

export async function requestPasswordReset(email) {
  const { challenge, method } = await startPkce(true);
  await api("/auth/v1/recover", {
    method: "POST",
    query: { redirect_to: redirectUrl() },
    body: { email, code_challenge: challenge, code_challenge_method: method },
  });
}

export async function setNewPassword(password) {
  checkPassword(password);
  const token = await accessToken();
  if (!token) throw new Error("Please sign in again.");
  await api("/auth/v1/user", { method: "PUT", token, body: { password } });
}

export function checkPassword(pw) {
  if (typeof pw !== "string" || pw.length < 10) throw new Error("Use at least 10 characters.");
  if (pw.length > 72) throw new Error("Use 72 characters or fewer.");
  if (/^(.)\1+$/.test(pw) || /^(password|12345|qwerty)/i.test(pw)) throw new Error("Choose something harder to guess.");
}

export async function signOut() {
  const token = current?.access_token;
  saveSession(null);
  if (token && authEnabled()) {
    try { await api("/auth/v1/logout", { method: "POST", token }); } catch { /* already signed out locally */ }
  }
}

/** A valid access token, refreshed if it is about to expire. Null when signed out. */
export async function accessToken() {
  if (!current) return null;
  const now = Math.floor(Date.now() / 1000);
  if (current.expires_at - now > 60) return current.access_token;
  if (!refreshing) {
    refreshing = api("/auth/v1/token", { method: "POST", query: { grant_type: "refresh_token" }, body: { refresh_token: current.refresh_token } })
      .then((d) => { saveSession(d); })
      .catch((e) => {
        if (e.status === 400 || e.status === 401) saveSession(null); // refresh token is no longer valid
      })
      .finally(() => { refreshing = null; });
  }
  await refreshing;
  return current?.access_token || null;
}

/** PostgREST call as the signed-in user (or anonymously when token is optional). */
export async function rest(path, { method = "GET", body, headers = {}, anon = false } = {}) {
  const token = anon ? null : await accessToken();
  if (!anon && !token) throw new Error("Sign in to do that.");
  if (!authEnabled()) throw new Error("Accounts are not switched on for this site yet.");
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${path}`, {
    method,
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: {
      apikey: CONFIG.supabaseAnonKey,
      Authorization: `Bearer ${token || CONFIG.supabaseAnonKey}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = "";
    try { msg = JSON.parse(text)?.message || ""; } catch { /* ignore */ }
    const err = new Error(msg ? friendly(msg) : `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}
