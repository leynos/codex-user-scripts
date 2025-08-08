// ==UserScript==
// @name        GitHub Actions Failed Step Log Copier (hoovering)
// @namespace   https://github.com/leynos
// @match       https://github.com/*/*/actions/runs/*
// @grant       GM_addStyle
// @version     2.0
// @author      Payton McIntosh + Gemini
// @license     ISC
// @description Adds a button to failed GitHub Actions steps that hoovers/accumulates virtualised log lines and lets you view/copy the most complete log slice.
// ==/UserScript==

(function () {
  'use strict';

  // -------- Styles --------
  GM_addStyle(`
    #gm-log-overlay {
      position: fixed; inset: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,.6); z-index: 9999;
      display: flex; align-items: center; justify-content: center;
    }
    #gm-log-modal {
      background: var(--color-canvas-default, #fff);
      color: var(--color-fg-default, #24292e);
      border: 1px solid var(--color-border-default, #d1d5da);
      border-radius: 6px; width: 80%; max-width: 900px;
      height: 70%; max-height: 800px; display: flex; flex-direction: column;
      box-shadow: 0 10px 30px rgba(0,0,0,.2);
    }
    #gm-log-modal-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 16px; border-bottom: 1px solid var(--color-border-muted, #e1e4e8);
    }
    #gm-log-modal-header h3 { margin: 0; font-size: 16px; }
    #gm-log-modal-meta { font-size: 12px; opacity: .75; }
    #gm-log-modal-textarea {
      flex-grow: 1; margin: 12px 16px 8px; padding: 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 12px; line-height: 1.5;
      border: 1px solid var(--color-border-default, #d1d5da); border-radius: 4px;
      resize: none; color: inherit; background: var(--color-canvas-inset, #f6f8fa);
      white-space: pre; overflow-wrap: normal; overflow-x: auto;
    }
    #gm-log-modal-footer {
      padding: 8px 16px 12px; border-top: 1px solid var(--color-border-muted, #e1e4e8);
      display: flex; gap: 8px; align-items: center; justify-content: flex-end;
    }
    #gm-log-modal-footer .gm-left {
      margin-right: auto; display: flex; gap: 12px; align-items: center; font-size: 12px;
    }
  `);

  // -------- Cache & utilities --------
  /**
   * Cache per step:
   *   key: stepId (details#id or data-external-id)
   *   value: {
   *     lines: Map<number, { text: string, ts?: string }>,
   *     lastCount: number,
   *   }
   */
  const stepCaches = new Map();

  function getStepId(stepEl) {
    return (
      stepEl.getAttribute('id') ||
      stepEl.getAttribute('data-external-id') ||
      stepEl.getAttribute('data-log-url') ||
      Math.random().toString(36).slice(2)
    );
  }

  function ensureCache(stepEl) {
    const id = getStepId(stepEl);
    if (!stepCaches.has(id)) {
      stepCaches.set(id, { lines: new Map(), lastCount: 0 });
    }
    return { id, cache: stepCaches.get(id) };
  }

  function textOf(el) {
    return (el?.textContent ?? '').replace(/\r?\n/g, '\n');
  }

  /**
   * Ingest one .js-check-step-line element into cache.
   */
  function ingestLineEl(stepEl, lineEl) {
    const { cache } = ensureCache(stepEl);
    try {
      const nEl = lineEl.querySelector('.CheckStep-line-number');
      // number may be inside <a> with text "150"
      const nRaw = textOf(nEl).trim();
      const n = nRaw ? parseInt(nRaw, 10) : NaN;

      const tsEl = lineEl.querySelector('.CheckStep-line-timestamp');
      const ts = textOf(tsEl).trim();

      const contentEl = lineEl.querySelector('.CheckStep-line-content');
      // Keep exact textual content (including indentation and ">" markers)
      const content = textOf(contentEl);

      if (!Number.isNaN(n)) {
        // Only replace if new text is non-empty or previous is undefined/empty
        const prev = cache.lines.get(n);
        if (!prev || (content && content !== prev.text)) {
          cache.lines.set(n, { text: content, ts });
        }
      }
    } catch {
      // swallow; DOM churn is noisy
    }
  }

  /**
   * Build log text from cache (sorted by line number).
   */
  function buildLogText(stepEl, opts = {}) {
    const { cache } = ensureCache(stepEl);
    const includeLineNumbers = !!opts.includeLineNumbers;
    const includeTimestamps = !!opts.includeTimestamps;

    const entries = [...cache.lines.entries()].sort((a, b) => a[0] - b[0]);
    return entries
      .map(([n, { text, ts }]) => {
        const ln = includeLineNumbers ? `${n}\t` : '';
        const tsPart = includeTimestamps && ts ? `[${ts}] ` : '';
        return `${ln}${tsPart}${text}`;
      })
      .join('');
  }

  /**
   * Count cached lines.
   */
  function cachedLineCount(stepEl) {
    const { cache } = ensureCache(stepEl);
    return cache.lines.size;
  }

  // -------- Hoovering (MutationObserver) --------
  /**
   * Attach a MutationObserver to a step to capture any lines added to its log container.
   */
  function startHoovering(stepEl) {
    if (stepEl.__gmHoovering) return;
    stepEl.__gmHoovering = true;

    // Initial sweep (in case some are already present)
    stepEl.querySelectorAll('.js-check-step-line').forEach((lineEl) => {
      ingestLineEl(stepEl, lineEl);
    });

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          // Process any newly added lines or trees containing them
          m.addedNodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) return;
            if (node.classList.contains('js-check-step-line')) {
              ingestLineEl(stepEl, node);
            } else {
              node
                .querySelectorAll?.('.js-check-step-line')
                ?.forEach((el) => ingestLineEl(stepEl, el));
            }
          });
        }
      }
    });

    // Observe the specific log display container if present; otherwise the whole step
    const container =
      stepEl.querySelector('.js-checks-log-display-container') || stepEl;
    observer.observe(container, { childList: true, subtree: true });
    stepEl.__gmHooverObserver = observer;
  }

  // -------- Modal --------
  function showLogModal(stepEl) {
    const existing = document.getElementById('gm-log-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'gm-log-overlay';

    const modal = document.createElement('div');
    modal.id = 'gm-log-modal';

    const header = document.createElement('div');
    header.id = 'gm-log-modal-header';

    const h3 = document.createElement('h3');
    h3.textContent = 'Failed Step Log Output';
    const meta = document.createElement('div');
    meta.id = 'gm-log-modal-meta';
    meta.textContent = `Lines captured: ${cachedLineCount(stepEl)}`;

    const headerLeft = document.createElement('div');
    headerLeft.style.display = 'flex';
    headerLeft.style.flexDirection = 'column';
    headerLeft.appendChild(h3);
    headerLeft.appendChild(meta);

    const closeIcon = document.createElement('button');
    closeIcon.className = 'btn-octicon';
    closeIcon.setAttribute('aria-label', 'Close');
    closeIcon.innerHTML = `<svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16" class="octicon octicon-x"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path></svg>`;
    closeIcon.onclick = () => overlay.remove();

    header.append(headerLeft, closeIcon);

    const textarea = document.createElement('textarea');
    textarea.id = 'gm-log-modal-textarea';
    textarea.readOnly = true;

    // Options: include line numbers / timestamps
    const footer = document.createElement('div');
    footer.id = 'gm-log-modal-footer';

    const left = document.createElement('div');
    left.className = 'gm-left';

    const lnLabel = document.createElement('label');
    const lnCheckbox = document.createElement('input');
    lnCheckbox.type = 'checkbox';
    lnCheckbox.style.marginRight = '6px';
    lnLabel.append(lnCheckbox, document.createTextNode('Line numbers'));

    const tsLabel = document.createElement('label');
    const tsCheckbox = document.createElement('input');
    tsCheckbox.type = 'checkbox';
    tsCheckbox.style.marginRight = '6px';
    tsLabel.append(tsCheckbox, document.createTextNode('Timestamps'));

    left.append(lnLabel, tsLabel);

    const copyButton = document.createElement('button');
    copyButton.textContent = 'Copy to Clipboard';
    copyButton.className = 'btn btn-primary';

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.className = 'btn';
    closeButton.onclick = () => overlay.remove();

    footer.append(left, copyButton, closeButton);

    modal.append(header, textarea, footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Build & refresh text from cache
    function refresh() {
      textarea.value = buildLogText(stepEl, {
        includeLineNumbers: lnCheckbox.checked,
        includeTimestamps: tsCheckbox.checked,
      });
      meta.textContent = `Lines captured: ${cachedLineCount(stepEl)}`;
    }
    refresh();

    // Live updates while the modal is open (cache grows as you scroll)
    const interval = setInterval(() => {
      if (!document.body.contains(overlay)) {
        clearInterval(interval);
        return;
      }
      refresh();
    }, 500);

    lnCheckbox.addEventListener('change', refresh);
    tsCheckbox.addEventListener('change', refresh);

    copyButton.onclick = async () => {
      try {
        await navigator.clipboard.writeText(textarea.value);
        copyButton.textContent = 'Copied!';
        setTimeout(() => (copyButton.textContent = 'Copy to Clipboard'), 1500);
      } catch (err) {
        console.error('Violentmonkey Script: Failed to copy logs.', err);
        copyButton.textContent = 'Error Copying';
        setTimeout(() => (copyButton.textContent = 'Copy to Clipboard'), 1500);
      }
    };

    // Close on Escape
    const keydownHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', keydownHandler);
      }
    };
    document.addEventListener('keydown', keydownHandler);
  }

  // -------- Buttons & step detection --------
  function addCopyButtonsAndStartHoover() {
    const failedSteps = document.querySelectorAll(
      'details.CheckStep[data-conclusion="failure"]'
    );

    failedSteps.forEach((step) => {
      startHoovering(step);

      const header = step.querySelector('.CheckStep-header');
      if (!header || header.querySelector('.gm-copy-log-btn')) return;

      const button = document.createElement('button');
      button.textContent = 'View/Copy Log';
      button.className = 'btn btn-sm btn-danger gm-copy-log-btn pt-0 pb-0 ml-1 mr-1';
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation(); // don't toggle <details>
        showLogModal(step);  // uses hoovered cache
      });

      // --- Positioning to match the original script ---
      const headerContent = header.querySelector('div.float-right');
      if (headerContent && headerContent.insertAdjacentElement) {
        headerContent.insertAdjacentElement('beforebegin', button);
      } else {
        // Fallback if GitHub changes the DOM
        (header.querySelector('.d-flex') || header).appendChild(button);
      }
    });
  }

  // Observe the whole page for dynamic loads (GitHub uses Turbo/pjax)
  const pageObserver = new MutationObserver(() => {
    addCopyButtonsAndStartHoover();
  });
  pageObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Initial kick
  addCopyButtonsAndStartHoover();
})();
