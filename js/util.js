// Small, dependency-free helpers. Nothing here ever uses innerHTML:
// all text goes through textContent so remote data can never inject markup.

const SVG_NS = "http://www.w3.org/2000/svg";

/** Create an element. attrs: class, text, dataset, on{click}, aria-*, any attribute. Children: nodes or strings. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "href") el.setAttribute("href", safeUrl(value) || "#");
    else if (key === "src") {
      const s = safeUrl(value);
      if (s) el.setAttribute("src", s);
    } else el.setAttribute(key, value === true ? "" : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** Only https URLs are ever used for links or images (http is upgraded). Anything else is dropped. */
export function safeUrl(input) {
  if (typeof input !== "string") return "";
  const raw = input.trim();
  if (raw.startsWith("#") || raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const u = new URL(raw);
    if (u.protocol === "http:") u.protocol = "https:";
    if (u.protocol !== "https:") return "";
    return u.href;
  } catch {
    return "";
  }
}

// ---- Icons (inline SVG paths, drawn on a 24x24 grid, stroke-based) ----
const ICONS = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.2-4.2",
  bookmark: "M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z",
  download: "M12 4v11m0 0-4-4m4 4 4-4M5 20h14",
  external: "M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  night: "M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9zM17 3v3m-1.5-1.5h3",
  star: "m12 3.5 2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.8 6.75 19.6l1-5.8L3.5 9.7l5.9-.9z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0",
  check: "m5 12.5 4.5 4.5L19 7.5",
  close: "M6 6l12 12M18 6 6 18",
  filter: "M4 6h16M7 12h10M10 18h4",
  book: "M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM5 16a4 4 0 0 1 4-4h9",
  video: "M4 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm13 4 4-2v8l-4-2z",
  audio: "M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H5a1 1 0 0 1-1-1zm16 0h-3v5h2a1 1 0 0 0 1-1z",
  pdf: "M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm7 0v5h5M9 14h6M9 17h4",
  course: "m3 9 9-5 9 5-9 5zm4 2.5V16c0 1.4 2.2 3 5 3s5-1.6 5-3v-4.5",
  cert: "M12 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM8.5 12.5 7 21l5-3 5 3-1.5-8.5",
  code: "m8 8-4 4 4 4m8-8 4 4-4 4M14 5l-4 14",
  tool: "M14.5 6.5a4 4 0 0 0 5 5L11 20a2.1 2.1 0 0 1-3-3z",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  folder: "M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z",
  home: "m4 11 8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z",
  plus: "M12 5v14M5 12h14",
  trash: "M5 7h14M10 7V4h4v3m-7 0 1 13h8l1-13",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 8v5m0-8v.01",
  shield: "M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z",
  sliders: "M5 5v14M12 5v14M19 5v14M3 9h4M10 14h4M17 8h4",
  logout: "M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5m5-4 4-4-4-4m4 4H9",
  mail: "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm0 1 8 6 8-6",
  wifi: "M3 9a14 14 0 0 1 18 0M6 12.5a10 10 0 0 1 12 0M9 16a5.5 5.5 0 0 1 6 0M12 19.5v.01",
  arrowRight: "M5 12h14m-5-5 5 5-5 5",
  sort: "M7 5v14m0 0-3-3m3 3 3-3M17 19V5m0 0-3 3m3-3 3 3",
};

export function icon(name, size = 20, label = "") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", "icon");
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICONS[name] || ICONS.info);
  svg.append(path);
  return svg;
}

// ---- Misc ----
export const debounce = (fn, ms = 300) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

export function formatCount(n) {
  if (!Number.isFinite(n)) return "";
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "k";
  return String(Math.round(n));
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/** Stable short id for a string (used to key live results). */
export function hash(str) {
  let x = 5381;
  for (let i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) | 0;
  return (x >>> 0).toString(36);
}

/** Collapse whitespace and cap length; used on every string that comes from outside. */
export function cleanText(value, max = 300) {
  if (typeof value !== "string") return "";
  const s = value.replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

export function randomString(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return base64url(arr);
}

export function base64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Base64Url(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return base64url(new Uint8Array(digest));
}

export function safeStorage(kind = "local") {
  try {
    const s = kind === "local" ? window.localStorage : window.sessionStorage;
    const k = "__t";
    s.setItem(k, "1");
    s.removeItem(k);
    return s;
  } catch {
    const mem = new Map();
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => void mem.set(k, String(v)),
      removeItem: (k) => void mem.delete(k),
    };
  }
}
