(function () {
  "use strict";

  // Footer copyright year — keeps the page from going stale next Jan 1.
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  // In-page anchor links: keep smooth scroll behavior even when the
  // browser ignores `scroll-behavior: smooth` (older Safari).
  var anchors = document.querySelectorAll('a[href^="#"]');
  anchors.forEach(function (a) {
    a.addEventListener("click", function (e) {
      var href = a.getAttribute("href");
      if (!href || href === "#") return;
      var target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", href);
    });
  });
})();
