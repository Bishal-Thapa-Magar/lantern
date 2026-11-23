import tech from "./tech.js";
import general from "./general.js";

export const CATALOG = [...tech, ...general].map((item) => ({
  ...item,
  source: "lantern",
  cert: item.cert || "none",
  lang: item.lang || "en",
}));

export const byId = new Map(CATALOG.map((i) => [i.id, i]));
