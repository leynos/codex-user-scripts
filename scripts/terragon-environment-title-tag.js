// ==UserScript==
// @name         Terragon Environment Title Tag
// @namespace    https://github.com/leynos
// @version      1.0
// @author       Payton McIntosh + o3
// @license      ISC
// @description  Appends the Terragon Labs name to the page title
// @match        https://www.terragonlabs.com/task*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  function updateTitle() {
    const envSpan = document.querySelector(
      'div.flex-col.w-full div.text-muted-foreground span.flex-shrink-0'
    );

    if (envSpan && envSpan.textContent) {
      const envName = envSpan.textContent.trim();
      if (!document.title.includes(envName)) {
        document.title += ` [${envName}]`;
      }
    }
  }

  // Wait for page load & dynamic content
  const observer = new MutationObserver(() => updateTitle());
  observer.observe(document.body, { childList: true, subtree: true });

  // Run once in case already loaded
  updateTitle();
})();
