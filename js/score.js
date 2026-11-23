// The effectiveness score. It is deliberately simple and fully explained in the app ("How we score").
//
// Four signals, each 0-100. Only the signals we actually have are used, and the weights are
// re-balanced across them, so a missing signal never counts as a bad one.
//   community  Bayesian average of star ratings (external source + Lantern members), so 1 rating of 5.0
//              cannot beat 800 ratings of 4.6.
//   design     Editorial review of structure, hands-on practice and depth (curated items only).
//   reach      How many people used it (log scale).
//   access     Costs less, gives proof, works offline.
//
// Confidence says how much evidence is behind the number: more signals and more ratings = higher.

import { clamp } from "./util.js";

const PRIOR_MEAN = 3.8; // typical star rating on the open web
const PRIOR_WEIGHT = 12; // how many "virtual" ratings the prior is worth

const WEIGHTS = { community: 0.4, design: 0.35, reach: 0.1, access: 0.15 };

export function bayesianStars(sum, count) {
  return (PRIOR_WEIGHT * PRIOR_MEAN + sum) / (PRIOR_WEIGHT + count);
}

/** Combine rating sources into one {avg, count}. Each source: {avg, count}. */
export function mergeRatings(...sources) {
  let sum = 0;
  let count = 0;
  for (const s of sources) {
    if (!s || !Number.isFinite(s.avg) || !Number.isFinite(s.count) || s.count <= 0) continue;
    sum += s.avg * s.count;
    count += s.count;
  }
  return count ? { avg: sum / count, count } : null;
}

export function scoreResource(item, community) {
  const parts = {};

  const merged = mergeRatings(item.ext, community);
  if (merged) {
    const stars = bayesianStars(merged.avg * merged.count, merged.count);
    parts.community = clamp(((stars - 1) / 4) * 100, 0, 100);
  }

  if (Array.isArray(item.design) && item.design.length === 3) {
    const avg = item.design.reduce((a, b) => a + b, 0) / 3;
    parts.design = clamp(((avg - 1) / 4) * 100, 0, 100);
  }

  const reach = item.reach || item.downloads || 0;
  if (reach > 0) parts.reach = clamp((Math.log10(reach + 1) / 6) * 100, 0, 100);

  parts.access = accessScore(item);

  let total = 0;
  let weightSum = 0;
  for (const [key, value] of Object.entries(parts)) {
    total += value * WEIGHTS[key];
    weightSum += WEIGHTS[key];
  }
  const score = weightSum ? Math.round(total / weightSum) : 0;

  const signals = Object.keys(parts).filter((k) => k !== "access").length;
  const ratingCount = merged ? merged.count : 0;
  let confidence = "low";
  if (signals >= 2 && (ratingCount >= 25 || parts.design !== undefined)) confidence = "medium";
  if (signals >= 3 && ratingCount >= 25) confidence = "high";
  if (item.design && !merged) confidence = "medium";

  return { score, parts, confidence, rating: merged };
}

function accessScore(item) {
  let s = 40;
  if (item.price === "free") s += 30;
  else if (item.price === "audit") s += 22;
  else if (item.price === "freemium") s += 10;
  if (item.cert === "free") s += 20;
  else if (item.cert === "badge") s += 12;
  else if (item.cert === "paid") s += 6;
  if (item.offline) s += 10;
  return clamp(s, 0, 100);
}

export const SCORE_BANDS = [
  { min: 85, label: "Excellent" },
  { min: 70, label: "Strong" },
  { min: 55, label: "Good" },
  { min: 0, label: "Unproven" },
];

export const bandFor = (score) => SCORE_BANDS.find((b) => score >= b.min).label;

export const SCORE_PARTS_HELP = {
  community: "What learners say: star ratings from the source and from Lantern members, adjusted so a few ratings count for less.",
  design: "Our editorial review of how well it is structured, how much you practise, and how deep it goes.",
  reach: "How many people have used it. Popular does not mean best, so this counts for little.",
  access: "Price, whether you get a certificate or badge, and whether you can use it offline.",
};
