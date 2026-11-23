// Runs before first paint (loaded synchronously in <head>) so there is no flash of the wrong theme.
(function () {
  var theme = null;
  var saver = null;
  try {
    theme = localStorage.getItem("lantern.theme");
    saver = localStorage.getItem("lantern.datasaver");
  } catch (e) { /* storage can be blocked; fall back to system preference */ }
  if (theme !== "light" && theme !== "dark" && theme !== "night") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", theme);
  if (saver === "on") document.documentElement.setAttribute("data-datasaver", "on");
})();
