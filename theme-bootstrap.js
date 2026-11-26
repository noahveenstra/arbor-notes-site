(function () {
  "use strict";

  var theme = "system";
  try {
    var stored = JSON.parse(localStorage.getItem("arbor.web.appearance.v1") || "null");
    if (stored && (stored.theme === "light" || stored.theme === "dark" || stored.theme === "system")) theme = stored.theme;
  } catch (error) {}

  var root = document.documentElement;
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
  if (theme === "system") return;

  var dark = theme === "dark" || window.matchMedia("(prefers-color-scheme: dark)").matches;
  var color = dark ? "#141414" : "#ececec";
  ["theme-color-light", "theme-color-dark"].forEach(function (id) {
    var meta = document.getElementById(id);
    if (!meta) return;
    meta.setAttribute("content", color);
    meta.removeAttribute("media");
  });
})();

// The bootstrap itself cannot report a failed download.
document.addEventListener("DOMContentLoaded", function () {
  if (typeof startApp === "function") return;
  document.getElementById("shell-boot-error").hidden = false;
  document.getElementById("shell-boot-retry").addEventListener("click", function () { window.location.reload(); });
});
