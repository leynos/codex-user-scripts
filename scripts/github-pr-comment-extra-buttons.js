// ==UserScript==
// @name         GitHub PR Comment Extra Buttons (Hide/Delete)
// @namespace    https://github.com/leynos
// @version      0.4.0
// @license      ISC
// @description  Adds a hide button to top-level review banners and a delete button to inline review comments
// @author       Payton + o3
// @match        https://github.com/*/*/pull/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const SEL_COMMENT_ROOT = '.timeline-comment, .review-comment';
  const MARK_INSTALLED = 'data-vm-extra-btn';
  const MARK_ACTIONS = 'data-vm-extra-installed';

  const ACTIONS_SELECTORS = [
    '.timeline-comment-actions',
    '.js-comment-header-actions',
    '.comment-actions',
  ];

  const SEL_KEBAB_DETAILS = 'details.details-overlay';

  // Octicons
  const TRASH_PATH_D = [
    "M16 1.75V3h5.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H8V1.75C8 .784 8.784 0 9.75 0h4.5C15.216 0 16 .784 16 1.75Zm-6.5 0V3h5V1.75a.25.25 0 0 0-.25-.25h-4.5a.25.25 0 0 0-.25.25ZM4.997 6.178a.75.75 0 1 0-1.493.144L4.916 20.92a1.75 1.75 0 0 0 1.742 1.58h10.684a1.75 1.75 0 0 0 1.742-1.581l1.413-14.597a.75.75 0 0 0-1.494-.144l-1.412 14.596a.25.25 0 0 1-.249.226H6.658a.25.25 0 0 1-.249-.226L4.997 6.178Z",
    "M9.206 7.501a.75.75 0 0 1 .793.705l.5 8.5A.75.75 0 1 1 9 16.794l-.5-8.5a.75.75 0 0 1 .705-.793Zm6.293.793A.75.75 0 1 0 14 8.206l-.5 8.5a.75.75 0 0 0 1.498.088l.5-8.5Z"
  ];
  const FOLD_PATH_D = [
    "M12 15c.199 0 .389.079.53.22l3.25 3.25a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L12 16.81l-2.72 2.72a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.25-3.25A.749.749 0 0 1 12 15Z",
    "M12.53 8.78a.75.75 0 0 1-1.06 0L8.22 5.53a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L12 7.19l2.72-2.72a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734ZM12 15.75a.75.75 0 0 1 .75.75v5.75a.75.75 0 0 1-1.5 0V16.5a.75.75 0 0 1 .75-.75Z",
    "M12 8.5a.75.75 0 0 1-.75-.75v-6a.75.75 0 0 1 1.5 0v6a.75.75 0 0 1-.75.75ZM2.75 12a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1a.75.75 0 0 1-.75-.75Zm4 0a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1a.75.75 0 0 1-.75-.75Zm4 0a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1a.75.75 0 0 1-.75-.75Zm4 0a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1a.75.75 0 0 1-.75-.75Zm4 0a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1a.75.75 0 0 1-.75-.75Z"
  ];

  function makeSVG(pathD, { viewBox = '0 0 24 24', classes = 'octicon' } = {}) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('height', '16');
    svg.setAttribute('width', '16');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('class', classes);
    svg.setAttribute(
      'style',
      'display:block;margin-left:auto;margin-right:auto;'
    );

    const paths = Array.isArray(pathD) ? pathD : [pathD];
    for (const d of paths) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    }
    return svg;
  }


  function makeHeaderButton(label, iconPath, svgOpts) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = [
      'timeline-comment-action',
      'Link--secondary',
      'Button',
      'Button--invisible',
      'Button--iconOnly',
      'Button--medium',
      'tooltipped',
      'tooltipped-n',
      'ml-1',
    ].join(' ');
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.appendChild(makeSVG(iconPath, { classes: 'octicon', ...(svgOpts || {}) }));
    return btn;
  }

  function $(root, selList) {
    for (const sel of selList) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // finders
  function findDeleteButton(root) {
    return (
      root.querySelector('details-menu form.js-comment-delete button[type="submit"]') ||
      root.querySelector('form.js-comment-delete button[type="submit"]')
    );
  }
  function findHideButton(root) {
    return root.querySelector('button.js-comment-hide-button');
  }

  async function ensureMenuLoadedAndGet(root, kebab, finder) {
    let btn = finder(root);
    if (btn) return btn;

    if (kebab && !kebab.open) {
      kebab.open = true;
      await new Promise(r => setTimeout(r, 60));
    }
    btn = finder(root);
    if (btn) return btn;

    await new Promise(r => setTimeout(r, 200));
    btn = finder(root);
    if (kebab && kebab.open) kebab.open = false;
    return btn || null;
  }

  function installOn(root) {
    if (!(root instanceof HTMLElement)) return;
    if (root.hasAttribute(MARK_INSTALLED)) return;

    const actions = $(root, ACTIONS_SELECTORS);
    if (!actions) return;
    if (actions.hasAttribute(MARK_ACTIONS)) return;

    const kebab = actions.querySelector(SEL_KEBAB_DETAILS);
    let headerBtn, finder;

    if (root.classList.contains('review-comment')) {
      // Inline review comment → Delete
      headerBtn = makeHeaderButton('Delete comment', TRASH_PATH_D);
      finder = findDeleteButton;
    } else {
      // Top-level review banner → Hide
      headerBtn = makeHeaderButton('Hide comment', FOLD_PATH_D);
      finder = findHideButton;
    }

    headerBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const targetBtn = await ensureMenuLoadedAndGet(root, kebab, finder);
      if (targetBtn) {
        targetBtn.click();
      } else {
        headerBtn.classList.add('color-fg-danger');
        headerBtn.setAttribute('title', `${headerBtn.getAttribute('aria-label')} control not found`);
      }
    });

    if (kebab) kebab.insertAdjacentElement('beforebegin', headerBtn);
    else actions.prepend(headerBtn);

    root.setAttribute(MARK_INSTALLED, '1');
    actions.setAttribute(MARK_ACTIONS, '1');
  }

  function scan(container = document) {
    container.querySelectorAll(SEL_COMMENT_ROOT).forEach(installOn);
  }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n instanceof HTMLElement) {
          if (n.matches?.(SEL_COMMENT_ROOT)) installOn(n);
          else scan(n);
        }
      }
    }
  });

  function boot() {
    scan(document);
    mo.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('turbo:load', () => scan(document));
  document.addEventListener('turbo:render', () => scan(document));
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
