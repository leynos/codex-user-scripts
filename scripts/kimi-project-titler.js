// ==UserScript==
// @name         Kimi Code - show project and branch in title/header
// @namespace    https://violentmonkey.github.io/
// @version      0.1.0
// @description  Append active worktree project and branch to the page title and chat header
// @author       Payton's friendly neighbourhood gremlin (GPT-5.4)
// @match        http://127.0.0.1:5494/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const TITLE_SEPARATOR = ' — ';
  const META_SEPARATOR = ' · ';
  const HEADER_MARKER_ATTR = 'data-vm-project-branch-meta';
  const DEBOUNCE_MS = 100;

  let observer = null;
  let scheduled = false;
  let baseDocumentTitle = null;

  function debounceRefresh() {
    if (scheduled) {
      return;
    }
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      refresh();
    }, DEBOUNCE_MS);
  }

  function isElement(node) {
    return node && node.nodeType === Node.ELEMENT_NODE;
  }

  function textOf(el) {
    return (el?.textContent || '').trim();
  }

  function parseWorktreePath(pathText) {
    // Accepts things like:
    //   .../velocetty.worktrees/1-4-16-styled-jsx-to-css-modules-migration-approach-and-inventory
    // and returns:
    //   { project: 'velocetty', branch: '1-4-16-styled-jsx-to-css-modules-migration-approach-and-inventory' }
    const match = pathText.match(/(?:^|\/)([^/\s]+)\.worktrees\/([^/\s]+)$/);
    if (!match) {
      return null;
    }
    return {
      project: match[1],
      branch: match[2],
    };
  }

  function getSelectedSessionButton() {
    // In the attached DOM, the active session button has bg-secondary and contains /yolo.
    const candidates = Array.from(document.querySelectorAll('button.bg-secondary, button[class*="bg-secondary"]'));

    for (const button of candidates) {
      const sessionLabel = button.querySelector('p');
      if (!sessionLabel) {
        continue;
      }
      const sessionName = textOf(sessionLabel);
      if (!sessionName) {
        continue;
      }

      // This should be the selected session entry in the sidebar.
      if (button.closest('#sessions')) {
        return button;
      }
    }

    return null;
  }

  function getWorktreeMetaFromSidebar() {
    const selectedSessionButton = getSelectedSessionButton();
    if (!selectedSessionButton) {
      return null;
    }

    const collapsible = selectedSessionButton.closest('[data-slot="collapsible"]');
    if (!collapsible) {
      return null;
    }

    const trigger = collapsible.querySelector('[data-slot="collapsible-trigger"]');
    if (!trigger) {
      return null;
    }

    // The path label lives in the trigger span with the truncated path text.
    const pathSpan = Array.from(trigger.querySelectorAll('span'))
      .find((span) => /\.worktrees\//.test(textOf(span)));

    if (!pathSpan) {
      return null;
    }

    const parsed = parseWorktreePath(textOf(pathSpan));
    if (!parsed) {
      return null;
    }

    const sessionName = textOf(selectedSessionButton.querySelector('p')) || '/yolo';

    return {
      sessionName,
      project: parsed.project,
      branch: parsed.branch,
      pathText: textOf(pathSpan),
    };
  }

  function getHeaderTitleButton() {
    // This matches the top chat header title button in the attached DOM.
    return Array.from(document.querySelectorAll('div.min-w-0.flex-1 > button'))
      .find((button) => {
        const text = textOf(button);
        return text.length > 0 && button.closest('#chat');
      }) || null;
  }

  function ensureHeaderMetaSpan(headerButton) {
    let metaSpan = headerButton.querySelector(`span[${HEADER_MARKER_ATTR}="true"]`);
    if (metaSpan) {
      return metaSpan;
    }

    metaSpan = document.createElement('span');
    metaSpan.setAttribute(HEADER_MARKER_ATTR, 'true');
    metaSpan.style.opacity = '0.8';
    metaSpan.style.marginInlineStart = '0.35em';

    headerButton.appendChild(metaSpan);
    return metaSpan;
  }

  function updateHeader(meta) {
    const headerButton = getHeaderTitleButton();
    if (!headerButton) {
      return;
    }

    // Preserve the original session title as rendered by the app.
    // Remove our prior suffix if present, then re-append a clean one.
    const existingMeta = headerButton.querySelector(`span[${HEADER_MARKER_ATTR}="true"]`);
    if (existingMeta) {
      existingMeta.remove();
    }

    const currentLabel = textOf(headerButton);
    if (!currentLabel) {
      return;
    }

    const metaSpan = ensureHeaderMetaSpan(headerButton);
    metaSpan.textContent = `${TITLE_SEPARATOR}${meta.project}${META_SEPARATOR}${meta.branch}`;
  }

  function updateDocumentTitle(meta) {
    const currentTitle = document.title || 'Kimi Code Web UI';

    if (baseDocumentTitle === null) {
      baseDocumentTitle = currentTitle.split(TITLE_SEPARATOR)[0].trim();
    }

    document.title = `${baseDocumentTitle}${TITLE_SEPARATOR}${meta.project}${META_SEPARATOR}${meta.branch}`;
  }

  function refresh() {
    const meta = getWorktreeMetaFromSidebar();
    if (!meta) {
      return;
    }

    updateHeader(meta);
    updateDocumentTitle(meta);
  }

  function shouldActivate() {
    // Conservative guard so this does not stomp unrelated sites.
    return (
      document.title.includes('Kimi') ||
      document.querySelector('#sessions') ||
      document.querySelector('#chat')
    );
  }

  function installObserver() {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          if ([...mutation.addedNodes, ...mutation.removedNodes].some(isElement)) {
            debounceRefresh();
            return;
          }
        }

        if (mutation.type === 'attributes') {
          debounceRefresh();
          return;
        }

        if (mutation.type === 'characterData') {
          debounceRefresh();
          return;
        }
      }
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
      attributeFilter: ['class', 'data-state', 'aria-expanded', 'title'],
    });
  }

  function init() {
    if (!shouldActivate()) {
      return;
    }

    refresh();
    installObserver();

    // React-y UIs love repainting after load.
    window.setTimeout(refresh, 250);
    window.setTimeout(refresh, 1000);
    window.setTimeout(refresh, 2500);
  }

  init();
})();
