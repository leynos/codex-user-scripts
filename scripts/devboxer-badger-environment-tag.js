// ==UserScript==
// @name         DevBoxer Environment Title Tag + Status Badge
// @namespace    https://github.com/leynos
// @version      1.1
// @author       Payton McIntosh + o3 + GPT-5.2
// @license      ISC
// @description  Adds an env suffix and a status badge prefix to the page title
// @match        https://www.devboxer.com/task*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const BADGE_SUCCESS = "✅️ ";
  const BADGE_ERROR   = "😵 ";
  const BADGE_WORKING = "🏗️ ";
  const BADGES = [BADGE_SUCCESS, BADGE_ERROR, BADGE_WORKING];

  // Make our env decoration unambiguous and easy to strip.
  const ENV_RE = /\s+\[env:[^\]]+\]$/;

  function stripBadges(title) {
    let t = title;
    let changed = true;
    while (changed) {
      changed = false;
      for (const badge of BADGES) {
        if (t.startsWith(badge)) {
          t = t.slice(badge.length);
          changed = true;
        }
      }
    }
    return t;
  }

  function stripEnvTag(title) {
    return title.replace(ENV_RE, "");
  }

  function getCoreTitle() {
    // Recover the site's “real” title by removing OUR decorations only.
    const raw = document.title;
    const core = stripEnvTag(stripBadges(raw)).trim();

    // Optional: if you really want to remove branding reliably, do it here
    // in a way that survives repeated runs.
    // Example patterns: "Thing | DevBoxer", "Thing - DevBoxer"
    // return core.replace(/\s*(?:\||-)\s*DevBoxer\b.*$/, "").trim();

    return core;
  }

  function getEnvName() {
    const envSpan = document.querySelector(
      "div.flex-col.min-w-0.w-full div.text-muted-foreground.font-mono span.flex-shrink-0.whitespace-nowrap"
    );
    const env = envSpan?.textContent?.trim();
    return env || null;
  }

  function needsSuccessBadge() {
    // Find all message containers that have data-message-index.
    const nodes = Array.from(document.querySelectorAll("div[data-message-index]"));
    if (nodes.length === 0) return false;

    // Pick the one with the highest numeric index.
    let latest = null;
    let maxIdx = -Infinity;

    for (const n of nodes) {
      const raw = n.getAttribute("data-message-index");
      const idx = Number(raw);
      if (Number.isFinite(idx) && idx > maxIdx) {
        maxIdx = idx;
        latest = n;
      }
    }

    if (!latest) return false;

    // Check whether it contains an <h2> whose text is exactly "Files Changed".
    return Array.from(latest.querySelectorAll("h2"))
      .some(h2 => h2.textContent.trim() === "Files Changed");
  }

  function needsErrorBadge() {
    return document.querySelectorAll(".p-2.border.border-destructive .flex-col.gap-2.font-mono .text-muted-foreground").length > 0;
  }

  function needsWorkingBadge() {
    // NOTE: your original selector was "pt-1 img.block" (a custom element tag),
    // which is almost certainly meant to be ".pt-1 img.block".
    return document.querySelectorAll(".pt-1 img.block").length > 0;
  }

  function getDesiredBadge() {
    if (needsErrorBadge())   return BADGE_ERROR;   // priority: error > success > working
    if (needsSuccessBadge()) return BADGE_SUCCESS;
    if (needsWorkingBadge()) return BADGE_WORKING;
    return "";
  }

  function composeTitle() {
    const core = getCoreTitle();
    const env = getEnvName();
    const badge = getDesiredBadge();

    const withEnv = env ? `${core} [env:${env}]` : core;
    return badge ? (badge + withEnv) : withEnv;
  }

  let scheduled = false;
  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const desired = composeTitle();
      if (document.title !== desired) document.title = desired;
    });
  }

  function hookHistory(fnName) {
    const orig = history[fnName];
    history[fnName] = function (...args) {
      const ret = orig.apply(this, args);
      scheduleUpdate();
      return ret;
    };
  }

  function init() {
    scheduleUpdate();

    // SPA navigation hooks (popstate only catches back/forward)
    window.addEventListener("popstate", scheduleUpdate, false);
    hookHistory("pushState");
    hookHistory("replaceState");

    // React-ish re-render / async content
    new MutationObserver(scheduleUpdate).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  init();
})();
