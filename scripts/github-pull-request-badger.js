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
   * Rules to apply badges to the tab title. The first matching rule wins.
   * The order is prioritised from most to least critical state.
   * Rules can use `selector` (for fast DOM checks) or `pattern` (for slower text checks).
   */
  const RULES = [
    {
      badge: "🐇",
      pattern:
        /Currently processing new changes in this PR\. This may take a few minutes, please wait(?:\.\.\.)?/i, // CodeRabbit working
    },
    {
      badge: "‼️",
      selector: '[aria-label="failing checks"] .octicon-x-circle-fill', // Failed checks
    },
    {
      badge: "🚧",
      pattern: /This branch has conflicts that must be resolved/, // Merge conflicts
    },
    {
      badge: "💬",
      selector: 'details.review-thread-component[data-resolved="false"]', // Unresolved comments
    },
    {
      badge: "💎",
      selector: "span.State--merged", // Merged PR
    },
    {
      badge: "⏱️",
      pattern: /Please wait \d+ minutes? and \d+ seconds? before requesting another review\./i, // CodeRabbit rate limit
    },
    {
      badge: "🚫",
      selector: '.merge-pr.Details svg.octicon-git-merge[aria-label="Closed"]'
    }
  ];

  /** Concatenate all badges for quick stripping. */
  const BADGES = RULES.map((r) => r.badge);

  /** Remove any known badge from the start of a title. */
  function stripBadges(title) {
    for (const b of BADGES) {
      if (title.startsWith(b)) {
        title = title.slice(b.length);
      }
    }
    return title.trimStart();
  }

  /** Evaluate the page and set the correct badge (or none). */
  function updateTitle() {
    let badges = [];

    // Find the first matching rule
    for (const rule of RULES) {
      if (rule.selector && document.querySelector(rule.selector)) {
        badges.push(rule.badge);
      }
      if (rule.pattern && rule.pattern.test(document.body.textContent)) {
        badges.push(rule.badge);
      }
    }

    const clean = stripBadges(document.title);
    const desired = badges ? badges.join("") + " " + clean : clean;

    if (document.title !== desired) {
      document.title = desired;
    }
  }

  /** React to full loads, Turbo/PJAX navigations, and DOM mutations. */
  function init() {
    updateTitle();

    document.addEventListener("turbo:load", updateTitle, false);
    document.addEventListener("pjax:end", updateTitle, false);

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
      characterData: true,
    });
  }

  init();
})();