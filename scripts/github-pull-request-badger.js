// ==UserScript==
// @name         GitHub Pull Request Badger
// @description  Adds helpful emoji badges to GitHub pull request titles
// @namespace    https://github.com/leynos
// @version      1.0
// @author       Payton McIntosh + o3 + Gemini
// @license      ISC
// @match        https://github.com/*/*/pull/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  /**
   * Define rules for badges.
   * The order in this array determines the order they appear in the tab title.
   */
  const RULES = [
    {
      id: "failed",
      badge: "‼️",
      selector: ".merge-status-item .octicon-x-circle-fill, .status-heading.color-fg-danger",
    },
    {
      id: "conflict",
      badge: "🚧",
      selector: ".merge-pr svg.octicon-alert-fill",
    },
    {
      id: "draft",
      badge: "📝",
      selector: '.sticky-content span.State[reviewable_state="draft"]',
    },
    {
      id: "unresolved",
      badge: "💬",
      selector: 'details.review-thread-component[data-resolved="false"]',
    },
    {
      id: "merged",
      badge: "💎",
      selector: ".sticky-content span.State--merged",
    },
    {
      id: "cr-limit",
      badge: "⏱️",
      pattern: /Please wait \d+ minutes? and \d+ seconds? before requesting another review\./i,
    },
    {
      id: "cr-working",
      badge: "🐇",
      pattern: /Currently processing new changes in this PR\. This may take a few minutes, please wait(?:\.\.\.)?/i,
    },
  ];

  const ALL_BADGES = RULES.map((r) => r.badge);

  /**
   * Cleans the title of all possible badges defined in RULES.
   * This handles cases where multiple badges were previously applied.
   */
  function stripBadges(title) {
    let cleanTitle = title;
    let changed;
    do {
      changed = false;
      for (const badge of ALL_BADGES) {
        const prefix = badge + " ";
        if (cleanTitle.startsWith(prefix)) {
          cleanTitle = cleanTitle.slice(prefix.length);
          changed = true;
        }
      }
    } while (changed);
    return cleanTitle.trim();
  }

  /** Checks if a specific rule matches the current document state. */
  function isMatch(rule, bodyText) {
    if (rule.selector && document.querySelector(rule.selector)) {
      return true;
    }
    if (rule.pattern && rule.pattern.test(bodyText)) {
      return true;
    }
    return false;
  }

  /** Evaluates all rules and updates the tab title with all applicable badges. */
  function updateTitle() {
    const bodyText = document.body.textContent;

    // Collect all badges that match their respective conditions
    const activeBadges = RULES
      .filter((rule) => isMatch(rule, bodyText))
      .map((rule) => rule.badge);

    const cleanBaseTitle = stripBadges(document.title);
    const badgePrefix = activeBadges.length > 0 ? activeBadges.join(" ") + " " : "";
    const desiredTitle = badgePrefix + cleanBaseTitle;

    if (document.title !== desiredTitle) {
      document.title = desiredTitle;
    }
  }

  /** Initialize listeners for Turbo, PJAX, and DOM mutations. */
  function init() {
    updateTitle();

    document.addEventListener("turbo:load", updateTitle, false);
    document.addEventListener("pjax:end", updateTitle, false);

    let timeout;
    const observer = new MutationObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(updateTitle, 100);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  init();
})();
