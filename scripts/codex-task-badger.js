// ==UserScript==
// @name         Codex “Update branch” + Error Badger
// @namespace    https://github.com/leynos
// @version      1.1
// @license      ISC
// @description  Adds a ✅️ to the page title on chatgpt.com/codex when an “Update branch” or “Create PR” button is present, and a 😵 when a token-error (“Failed in…”) banner appears.
// @author       Payton McIntosh
// @match        https://chatgpt.com/codex/tasks*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const BADGE_SUCCESS = "✅️ ";
  const BADGE_ERROR   = "😵 ";
  const BADGE_WORKING = "🏗️ ";

  /** Remove any existing badge(s) so we never stack duplicates. */
  function stripBadges(title) {
    let t = title;
    [BADGE_SUCCESS, BADGE_ERROR, BADGE_WORKING].forEach(badge => {
      if (t.startsWith(badge)) t = t.slice(badge.length);
    });
    return t;
  }

  /** True if we can see “Update branch” or “Create PR”. */
  function needsSuccessBadge() {
    return Array.from(document.querySelectorAll("span.truncate"))
      .some(el => {
        const txt = el.textContent.trim();
        return txt === "Update branch" || txt === "Create PR";
      });
  }

  /** True if there is an error banner that begins “Failed in…”. */
  function needsErrorBadge() {
    return Array.from(document.querySelectorAll("span.text-token-text-error"))
      .some(el => el.innerHTML.trim().startsWith("Failed in"));
  }

  /** True if we can see “Update branch” or “Create PR”. */
  function needsWorkingBadge() {
    return document.querySelectorAll("button.text-token-text-secondary .text-token-text-primary svg").length > 0;
  }

  /** Add or remove badges to keep the title in sync with the DOM. */
  function updateTitle() {
    const clean = stripBadges(document.title);
    let desired = clean;

    if (needsErrorBadge()) {
      desired = BADGE_ERROR + desired;        // error has priority
    } else if (needsSuccessBadge()) {
      desired = BADGE_SUCCESS + desired;
    } else if (needsWorkingBadge()) {
      desired = BADGE_WORKING + desired;
    }

    if (document.title !== desired) {
      document.title = desired;
    }
  }

  /** Init: handle SPA navigation and live DOM changes. */
  function init() {
    updateTitle();

    /* Codex is a single-page React/Next app, so listen for history events. */
    window.addEventListener("popstate", updateTitle, false);

    /* React re-renders banners after API calls—watch for any DOM mutation. */
    let scheduled = false;
    new MutationObserver(() => {
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          updateTitle();
        });
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  init();
})();
