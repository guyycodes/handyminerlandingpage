/* ==========================================================================
 * HandyMiner — landing-page client script.
 *
 * Responsibilities:
 *   1) Footer copyright year.
 *   2) Smooth-scroll polyfill for in-page anchors.
 *   3) Capture + persist UTM / referrer attribution from the URL so we
 *      can attach it to a signup later (and to outbound CTA links once
 *      the app goes live).
 *   4) Sticky early-access bar:
 *      - render unless dismissed within the last 7 days
 *      - on submit, POST email + attribution to the HandyMiner backend
 *        at `<host>/api/public/early-access`, which appends a row to
 *        the operator-owned "HandyMiner Pre-launch" Google Sheet.
 *        The host is auto-selected: localhost:3000 in dev, the
 *        production handyminer.ai webapp in prod (see CONFIG below).
 *      - update visual state (loading / success / error)
 *      - never re-show after a successful submission
 *
 * The endpoint MUST be CORS-enabled for the page's Origin (handyminer.ai
 * in prod; whatever local-dev port you serve this static page from).
 * Auth is intentionally absent — this is a public form. Defenses live
 * on the backend (CORS lock, IP rate limit, honeypot field re-check).
 * Anything baked into client JS is public, so we don't pretend to send
 * a "secret".
 * ========================================================================== */

(function () {
  "use strict";

  // -----------------------------------------------------------------------
  // CONFIG
  // -----------------------------------------------------------------------

  // HandyMiner backend endpoint that records pre-launch signups into the
  // operator-owned Google Sheet. The webapp lives on Fly.io; the
  // /api/public/early-access route is added to the public-route
  // allowlist in middleware.ts so Clerk doesn't intercept it.
  //
  // The webapp's CORS allowlist (EARLY_ACCESS_ALLOWED_ORIGINS env +
  // route.ts DEFAULT_ALLOWED_ORIGINS) MUST include this page's Origin:
  // - https://handyminer.ai          (production GH Pages)
  // - http://127.0.0.1:5500          (VSCode Live Server local testing)
  // - http://localhost:5500          (alternate localhost variant)
  // …or CORS preflight silently rejects every POST.
  //
  // Set to null to skip the network call entirely — the form will buffer
  // submissions to localStorage and show the success state. Useful for
  // designer previews without a backend running; DO NOT ship that way
  // (visitors think they signed up, you get nothing).
  //
  // For local-webapp testing, swap to:
  //   "http://localhost:3000/api/public/early-access"
  var SIGNUP_ENDPOINT = "https://handyminer-webapp.fly.dev/api/public/early-access";

  // Non-secret site identifier sent as an HTTP header so the backend can
  // distinguish landing-page submissions from any future capture surfaces
  // (in-app referral form, partner microsites, etc.) and route them to
  // the right tab / rate-limit bucket. Public by design — there's no
  // such thing as a "secret" in static-page JS.
  var SITE_ID = "handyminer-landing-v1";

  var ATTRIBUTION_KEY = "hm_attribution_v1";
  var DISMISS_KEY     = "hm_early_access_dismissed_at";
  var SUBMITTED_KEY   = "hm_early_access_submitted_at";
  var BUFFER_KEY      = "hm_early_access_buffer_v1";
  var DISMISS_TTL_MS  = 7 * 24 * 60 * 60 * 1000;

  // -----------------------------------------------------------------------
  // 1) Footer year
  // -----------------------------------------------------------------------

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // -----------------------------------------------------------------------
  // 2) Smooth scroll for in-page anchors (older Safari fallback)
  // -----------------------------------------------------------------------

  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
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

  // -----------------------------------------------------------------------
  // 3) UTM / referrer capture
  //
  // Attribution is captured ONCE per visitor (first-touch). If the visitor
  // returns with new UTM params later we keep the original — that matches
  // how most analytics tools attribute pre-signup conversions.
  // -----------------------------------------------------------------------

  function readAttribution() {
    try {
      var raw = localStorage.getItem(ATTRIBUTION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function captureAttribution() {
    var existing = readAttribution();
    if (existing) return existing;

    var params = new URLSearchParams(window.location.search);
    var utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "gclid", "fbclid"];
    var hasAny = utmKeys.some(function (k) { return params.has(k); });

    var attribution = {
      first_seen_at: new Date().toISOString(),
      landing_path: window.location.pathname + window.location.search,
      referrer: document.referrer || "",
      utm_source:   params.get("utm_source")   || "",
      utm_medium:   params.get("utm_medium")   || "",
      utm_campaign: params.get("utm_campaign") || "",
      utm_term:     params.get("utm_term")     || "",
      utm_content:  params.get("utm_content")  || "",
      ref:          params.get("ref")          || "",
      gclid:        params.get("gclid")        || "",
      fbclid:       params.get("fbclid")       || ""
    };

    // Only persist if we either have UTM-ish params OR a non-empty referrer
    // — no point burning storage on direct/unattributed visits.
    if (hasAny || attribution.referrer) {
      try { localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution)); } catch (_) {}
    }
    return attribution;
  }

  var attribution = captureAttribution();

  // Decorate any outbound links to the future app (`app.handyminer.com/...`)
  // with the captured UTM params, so attribution flows from landing -> app.
  function decorateOutboundLinks() {
    var passthrough = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
    var carryover = passthrough
      .filter(function (k) { return attribution && attribution[k]; })
      .map(function (k) { return k + "=" + encodeURIComponent(attribution[k]); })
      .join("&");
    if (!carryover) return;

    document.querySelectorAll('a[href*="app.handyminer.com"]').forEach(function (a) {
      try {
        var u = new URL(a.href);
        passthrough.forEach(function (k) {
          if (attribution[k] && !u.searchParams.has(k)) u.searchParams.set(k, attribution[k]);
        });
        a.href = u.toString();
      } catch (_) { /* malformed href, skip */ }
    });
  }
  decorateOutboundLinks();

  // -----------------------------------------------------------------------
  // 4) Sticky early-access bar
  // -----------------------------------------------------------------------

  var bar = document.getElementById("early-access");
  if (!bar) return;

  var form        = bar.querySelector("#early-access-form");
  var input       = bar.querySelector("#early-access-email");
  var honeypot    = bar.querySelector(".early-access-hp");
  var status      = bar.querySelector("#early-access-status");
  var dismissBtn  = bar.querySelector(".early-access-dismiss");

  // 15 seconds. Long enough to cover slow backends + retries, short
  // enough that a hung connection doesn't leave the bar stuck in the
  // loading state forever.
  var FETCH_TIMEOUT_MS = 15000;

  // Once the user dismisses the bar (explicitly or via the late-fetch
  // race below), this flips to true. Late-arriving fetch resolutions
  // check it before mutating the UI so a slow network response can't
  // pop the bar back into view after the user has moved on.
  var dismissed = false;

  function setState(state, message) {
    bar.setAttribute("data-state", state);
    // aria-busy lets assistive tech know the form is mid-submit.
    bar.setAttribute("aria-busy", state === "loading" ? "true" : "false");
    if (typeof message === "string") status.textContent = message;
    // Lock the input while the request is in flight so the visitor
    // can't edit the email mid-submit and end up confused about which
    // address actually got recorded.
    if (input) input.disabled = (state === "loading");
  }

  function recentTimestamp(key, ttlMs) {
    var raw = null;
    try { raw = localStorage.getItem(key); } catch (_) {}
    if (!raw) return false;
    var t = parseInt(raw, 10);
    if (!Number.isFinite(t)) return false;
    return Date.now() - t < ttlMs;
  }

  // Don't show the bar if the visitor already signed up OR dismissed it
  // within the last 7 days.
  if (recentTimestamp(SUBMITTED_KEY, 365 * 24 * 60 * 60 * 1000)) return;
  if (recentTimestamp(DISMISS_KEY,   DISMISS_TTL_MS))            return;

  // Reveal the bar after a brief delay so the visitor sees the hero
  // first. The display-none -> commit -> add-class three-step is
  // required because CSS transitions don't fire on a property that
  // changes in the same tick as `display: none -> block`. Adding the
  // `.ea-show` class inside requestAnimationFrame guarantees a separate
  // paint frame between the display change and the transform change.
  setTimeout(function () {
    if (dismissed) return; // user (or auto-flow) already opted out
    bar.hidden = false;
    document.body.classList.add("has-early-access");
    // Force a synchronous layout so the just-toggled display state
    // commits BEFORE we add the .ea-show class on the next paint.
    void bar.offsetHeight;
    requestAnimationFrame(function () {
      bar.classList.add("ea-show");
    });
  }, 700);

  dismissBtn.addEventListener("click", function () {
    dismissed = true;
    setState("hidden");
    bar.classList.remove("ea-show");
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (_) {}
    document.body.classList.remove("has-early-access");
  });

  function isValidEmail(value) {
    if (!value) return false;
    // Loose, permissive — server must do the real validation.
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  function bufferLocally(payload) {
    // While the backend isn't live (and as a recovery buffer when it
    // returns errors), stash submissions in localStorage so the operator
    // can recover them later via devtools.
    try {
      var raw = localStorage.getItem(BUFFER_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      arr.push(payload);
      localStorage.setItem(BUFFER_KEY, JSON.stringify(arr));
    } catch (_) {}
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    // Re-entry guard: silently ignore additional submits while a
    // request is already in flight. CSS handles the button-click side
    // (pointer-events: none on .early-access-cta), but Enter inside
    // the input bypasses pointer-events.
    if (bar.getAttribute("data-state") === "loading") return;

    if (honeypot && honeypot.value) {
      // Bot caught — pretend success and bail.
      setState("success", "You're on the list — your 500,000 tokens are reserved for launch day.");
      try { localStorage.setItem(SUBMITTED_KEY, String(Date.now())); } catch (_) {}
      return;
    }

    var email = (input.value || "").trim();
    if (!isValidEmail(email)) {
      setState("error", "That email doesn't look right — mind double-checking?");
      input.focus();
      return;
    }

    var payload = {
      site: SITE_ID,
      email: email,
      submitted_at: new Date().toISOString(),
      page: window.location.pathname,
      // Honeypot field is suppressed client-side above, but we ALSO send
      // its value (always empty for real humans) so the backend can do
      // an independent check — defense in depth against bots that bypass
      // our JS handler.
      hp: (honeypot && honeypot.value) || "",
      attribution: attribution || null
    };

    setState("loading", "");

    // Single funnel for every terminal outcome. Always persists
    // SUBMITTED_KEY on success (so we don't re-pester the visitor next
    // visit even if they dismissed mid-flight), but skips UI mutation
    // when the user has already dismissed — keeps a slow backend
    // response from popping the bar back into view.
    var done = function (ok, message) {
      if (ok) {
        try { localStorage.setItem(SUBMITTED_KEY, String(Date.now())); } catch (_) {}
      }
      if (dismissed) return;
      if (ok) {
        setState("success", message || "You're on the list — your 500,000 tokens are reserved for launch day.");
        // Move keyboard focus to the only remaining interactive element
        // so users not on a mouse don't have to tab through the whole
        // page to dismiss the success card.
        try { dismissBtn.focus(); } catch (_) {}
      } else {
        setState("error", message || "Something hiccuped on our end. Try again in a moment?");
      }
    };

    if (!SIGNUP_ENDPOINT) {
      // No backend yet — buffer locally and pretend success so the UX
      // is intact. The operator should wire SIGNUP_ENDPOINT before
      // launch (see CONFIG block at the top of this file).
      bufferLocally(payload);
      done(true);
      return;
    }

    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);

    fetch(SIGNUP_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Site": SITE_ID
      },
      body: JSON.stringify(payload),
      // keepalive lets the request survive a tab close (e.g. visitor
      // hits Notify and immediately closes the tab). 64KB body limit;
      // our payload is well under that. Don't add big fields without
      // re-checking that ceiling.
      keepalive: true,
      signal: controller.signal
    })
      .then(function (r) {
        if (r.ok) return r.json().catch(function () { return {}; });
        return r.json().catch(function () { return {}; }).then(function (j) {
          // Only honor an explicit user-facing message from the backend
          // (`user_message` field). Never display raw error strings —
          // they may leak internal infrastructure (DB hosts, library
          // names, stack frames) and are usually unhelpful to visitors.
          var userMsg = j && typeof j.user_message === "string" && j.user_message
            ? j.user_message
            : null;
          var err = new Error(userMsg || "request failed");
          err.userMessage = userMsg;
          err.httpStatus = r.status;
          throw err;
        });
      })
      .then(function (j) {
        // Honor the backend's user_message on success too. The agent
        // returns it on duplicate ("You're already on the list.") and
        // could return it for other repeat-visitor signals later;
        // dropping it would render the wrong copy to a returning user.
        // Falls back to done()'s default success message when absent
        // (the launch-day reassurance copy).
        var userMsg = j && typeof j.user_message === "string" && j.user_message
          ? j.user_message
          : null;
        done(true, userMsg);
      })
      .catch(function (err) {
        // Buffer failed submissions so they aren't lost — operator can
        // recover from localStorage if a customer reports a bug.
        bufferLocally(payload);
        var msg;
        if (err && err.name === "AbortError") {
          msg = "Network timed out — please try again.";
        } else if (err && err.userMessage) {
          msg = err.userMessage;
        } else {
          msg = null; // falls back to the generic "Something hiccuped..."
        }
        done(false, msg);
      })
      .finally(function () {
        clearTimeout(timeoutId);
      });
  });
})();
