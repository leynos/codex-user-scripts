// ==UserScript==
// @name         Lody session sidebar filter
// @namespace    https://github.com/leynos
// @version      1.3.0
// @description  Adds a low-overhead repo / PR / branch filter to the Lody session sidebar, with cooperative DOM handling.
// @author       Payton McIntosh + GPT-5
// @license      ISC
// @match        https://lody.ai/*
// @match        https://www.lody.ai/*
// @match        https://*.lody.ai/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '1.3.0';
  const UI_ID = 'lody-session-sidebar-filter';
  const STYLE_ID = 'lody-session-sidebar-filter-style';
  const STORAGE_KEY = 'lody.sessionSidebarFilter.query.v1';
  const HIDDEN_ATTR = 'data-lody-session-filter-hidden';
  const OWNED_ATTR = 'data-lody-userscript-owned';

  const SESSION_ROW_SELECTOR = '[data-sidebar-session-id]';
  const REPO_GROUP_SELECTOR = '[data-repo-full-name]';
  const SHOW_MORE_SELECTOR = '[data-sidebar-show-more]';
  const PR_BUTTON_SELECTOR = 'button[aria-label*="PR #"], button[title^="Open #"], button[title^="Merged #"], button[title^="Closed #"]';
  const PR_METADATA_SELECTOR = '[data-lody-github-pr-number]';
  const BRANCH_SELECTOR = 'span[aria-label][data-state]';
  const FILTER_RELEVANT_SELECTOR = [
    REPO_GROUP_SELECTOR,
    SESSION_ROW_SELECTOR,
    PR_BUTTON_SELECTOR,
    BRANCH_SELECTOR,
  ].join(', ');

  // Nodes owned by the “proper links / top-bar context” companion script. The
  // filter may read their metadata, but it should not treat their insertion as
  // a reason to churn the sidebar index.
  const COMPANION_AFFORDANCE_SELECTOR = [
    'a[data-lody-session-anchor="true"]',
    'a[data-lody-github-pr-anchor="true"]',
    '[data-lody-top-bar-context="true"]',
    '[data-lody-top-bar-extra-context="true"]',
  ].join(', ');

  const state = {
    viewport: null,
    scrollArea: null,
    listObserver: null,
    shellObserver: null,
    bootObserver: null,
    input: null,
    clearButton: null,
    countLabel: null,
    indexedRows: [],
    indexedGroups: [],
    hiddenElements: new Set(),
    ensureScheduled: false,
    indexScheduled: false,
    filterScheduled: false,
    lifecycleHooksInstalled: false,
    topBarRepoClickHandlerInstalled: false,
    readyAnnounced: false,
    started: false,
    lastLocationHref: location.href,
  };

  const raf = window.requestAnimationFrame.bind(window);

  function cleanText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function attrEqualsSelector(attributeName, value) {
    const escapedValue = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `[${attributeName}="${escapedValue}"]`;
  }

  function readStoredQuery() {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) || '';
    } catch {
      return '';
    }
  }

  function writeStoredQuery(value) {
    try {
      if (value) {
        window.sessionStorage.setItem(STORAGE_KEY, value);
      } else {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Storage is a convenience only; filtering should work without it.
    }
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${UI_ID} {
        box-sizing: border-box;
        flex: 0 0 auto;
        padding: 0.5rem 0.75rem 0;
        color: hsl(var(--sidebar-foreground));
      }

      #${UI_ID} *,
      #${UI_ID} *::before,
      #${UI_ID} *::after {
        box-sizing: border-box;
      }

      #${UI_ID} .lody-session-filter-label {
        display: block;
        margin: 0 0 0.25rem;
        color: hsl(var(--sidebar-foreground-muted, var(--muted-foreground)) / 0.78);
        font-size: 10px;
        font-weight: 600;
        line-height: 1;
      }

      #${UI_ID} .lody-session-filter-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.25rem;
      }

      #${UI_ID} .lody-session-filter-input {
        width: 100%;
        min-width: 0;
        height: 1.85rem;
        border: 1px solid hsl(var(--input-border, var(--border)) / 0.95);
        border-radius: 0.5rem;
        background: hsl(var(--input, var(--sidebar-background)));
        color: hsl(var(--input-foreground, var(--sidebar-foreground)));
        font: inherit;
        font-size: 12px;
        line-height: 1.2;
        outline: none;
        padding: 0 0.55rem;
      }

      #${UI_ID} .lody-session-filter-input::placeholder {
        color: hsl(var(--input-placeholder, var(--muted-foreground)));
      }

      #${UI_ID} .lody-session-filter-input:focus {
        border-color: hsl(var(--sidebar-ring, var(--ring)) / 0.7);
        box-shadow: 0 0 0 1px hsl(var(--sidebar-ring, var(--ring)) / 0.35);
      }

      #${UI_ID} .lody-session-filter-clear {
        display: inline-flex;
        width: 1.85rem;
        height: 1.85rem;
        align-items: center;
        justify-content: center;
        border: 1px solid hsl(var(--input-border, var(--border)) / 0.75);
        border-radius: 0.5rem;
        background: transparent;
        color: hsl(var(--sidebar-foreground-muted, var(--muted-foreground)) / 0.86);
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        padding: 0;
      }

      #${UI_ID} .lody-session-filter-clear:hover,
      #${UI_ID} .lody-session-filter-clear:focus-visible {
        background: hsl(var(--sidebar-hover, var(--hover)));
        color: hsl(var(--sidebar-hover-foreground, var(--foreground)));
        outline: none;
      }

      #${UI_ID} .lody-session-filter-clear[hidden] {
        display: none !important;
      }

      #${UI_ID} .lody-session-filter-count {
        margin-top: 0.22rem;
        min-height: 0.75rem;
        color: hsl(var(--sidebar-foreground-muted, var(--muted-foreground)) / 0.72);
        font-size: 10px;
        line-height: 1.1;
      }

      ${SESSION_ROW_SELECTOR}[${HIDDEN_ATTR}="true"],
      ${REPO_GROUP_SELECTOR}[${HIDDEN_ATTR}="true"],
      ${SHOW_MORE_SELECTOR}[${HIDDEN_ATTR}="true"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function findSessionViewport() {
    const viewports = document.querySelectorAll('[data-radix-scroll-area-viewport]');

    for (const viewport of viewports) {
      if (!(viewport instanceof HTMLElement)) {
        continue;
      }

      if (!viewport.querySelector(`${REPO_GROUP_SELECTOR}, ${SESSION_ROW_SELECTOR}`)) {
        continue;
      }

      const scrollArea =
        viewport.closest('[dir="ltr"].relative.overflow-hidden') ||
        viewport.closest('.relative.overflow-hidden') ||
        viewport.parentElement;

      if (scrollArea instanceof HTMLElement && scrollArea.parentElement instanceof HTMLElement) {
        return { viewport, scrollArea };
      }
    }

    return null;
  }

  function createControls() {
    const panel = document.createElement('div');
    panel.id = UI_ID;
    panel.setAttribute(OWNED_ATTR, 'session-filter');
    panel.setAttribute('role', 'search');
    panel.setAttribute('aria-label', 'Filter Lody sessions');

    const label = document.createElement('label');
    label.className = 'lody-session-filter-label';
    label.htmlFor = `${UI_ID}-input`;
    label.textContent = 'Filter sessions';

    const row = document.createElement('div');
    row.className = 'lody-session-filter-row';

    const input = document.createElement('input');
    input.id = `${UI_ID}-input`;
    input.className = 'lody-session-filter-input';
    input.type = 'search';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = 'Repo, #PR, branch…';
    input.title = 'Examples: weaver, #132, repo:episodic branch:pylint, pr:87. Terms are ANDed.';
    input.value = readStoredQuery();

    const clearButton = document.createElement('button');
    clearButton.className = 'lody-session-filter-clear';
    clearButton.type = 'button';
    clearButton.setAttribute('aria-label', 'Clear session filter');
    clearButton.textContent = '×';
    clearButton.hidden = input.value.trim().length === 0;

    const count = document.createElement('div');
    count.className = 'lody-session-filter-count';
    count.setAttribute('aria-live', 'polite');
    count.title = 'Only sessions currently rendered by Lody are indexed. Use Show all in a repo to make collapsed rows filterable.';

    input.addEventListener('input', () => {
      writeStoredQuery(input.value.trim());
      clearButton.hidden = input.value.trim().length === 0;
      scheduleFilter();
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && input.value) {
        event.preventDefault();
        input.value = '';
        writeStoredQuery('');
        clearButton.hidden = true;
        scheduleFilter();
      }
    });

    clearButton.addEventListener('click', () => {
      input.value = '';
      writeStoredQuery('');
      clearButton.hidden = true;
      scheduleFilter();
      input.focus();
    });

    row.append(input, clearButton);
    panel.append(label, row, count);

    state.input = input;
    state.clearButton = clearButton;
    state.countLabel = count;

    return panel;
  }

  function ensureInstalled() {
    state.ensureScheduled = false;
    injectStyles();

    const target = findSessionViewport();
    if (!target) {
      startBootObserver();
      return false;
    }

    const existingPanel = document.getElementById(UI_ID);
    const panel = existingPanel instanceof HTMLElement ? existingPanel : createControls();
    const needsInsertion = !panel.isConnected || panel.nextElementSibling !== target.scrollArea;

    if (needsInsertion) {
      target.scrollArea.parentElement.insertBefore(panel, target.scrollArea);
    }

    if (!state.input || !state.input.isConnected) {
      state.input = panel.querySelector('.lody-session-filter-input');
      state.clearButton = panel.querySelector('.lody-session-filter-clear');
      state.countLabel = panel.querySelector('.lody-session-filter-count');
    }

    const viewportChanged = state.viewport !== target.viewport;
    state.viewport = target.viewport;
    state.scrollArea = target.scrollArea;

    if (viewportChanged) {
      connectListObserver();
    }

    if (state.bootObserver) {
      state.bootObserver.disconnect();
      state.bootObserver = null;
    }

    connectShellObserver();
    announceReady();
    scheduleIndex();
    return true;
  }

  function scheduleEnsure() {
    if (state.ensureScheduled) {
      return;
    }

    state.ensureScheduled = true;
    raf(ensureInstalled);
  }

  function startBootObserver() {
    if (state.bootObserver) {
      return;
    }

    const root = document.getElementById('root') || document.body || document.documentElement;
    state.bootObserver = new MutationObserver(() => {
      scheduleEnsure();
    });
    state.bootObserver.observe(root, { childList: true, subtree: true });
  }

  function connectShellObserver() {
    const root = document.getElementById('root') || document.body || document.documentElement;
    if (state.shellObserver || !root) {
      return;
    }

    state.shellObserver = new MutationObserver((mutations) => {
      if (state.lastLocationHref !== location.href) {
        state.lastLocationHref = location.href;
        scheduleEnsure();
        return;
      }

      if (!state.viewport?.isConnected || !document.getElementById(UI_ID)?.isConnected) {
        scheduleEnsure();
        return;
      }

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (isFilterRelevantNode(node)) {
            scheduleEnsure();
            return;
          }
        }
      }
    });

    state.shellObserver.observe(root, { childList: true, subtree: true });
  }

  function connectListObserver() {
    state.listObserver?.disconnect();

    if (!(state.viewport instanceof HTMLElement)) {
      return;
    }

    state.listObserver = new MutationObserver((mutations) => {
      if (mutationsContainFilterableChanges(mutations)) {
        scheduleIndex();
      }
    });

    state.listObserver.observe(state.viewport, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'data-repo-full-name', 'data-sidebar-session-id', 'title'],
    });
  }

  function mutationsContainFilterableChanges(mutations) {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        if (isFilterRelevantNode(mutation.target)) {
          return true;
        }
        continue;
      }

      for (const node of mutation.addedNodes) {
        if (isFilterRelevantNode(node)) {
          return true;
        }
      }

      for (const node of mutation.removedNodes) {
        if (isFilterRelevantNode(node)) {
          return true;
        }
      }
    }

    return false;
  }

  function isFilterRelevantNode(node) {
    if (!(node instanceof Element)) {
      return false;
    }

    if (isOwnNode(node) || isCompanionAffordanceNode(node)) {
      return false;
    }

    if (node.matches(FILTER_RELEVANT_SELECTOR)) {
      return true;
    }

    for (const candidate of node.querySelectorAll(FILTER_RELEVANT_SELECTOR)) {
      if (!isOwnNode(candidate) && !isCompanionAffordanceNode(candidate)) {
        return true;
      }
    }

    return false;
  }

  function isOwnNode(element) {
    return Boolean(element.closest(`#${UI_ID}, [${OWNED_ATTR}="session-filter"]`));
  }

  function isCompanionAffordanceNode(element) {
    return Boolean(element.closest(COMPANION_AFFORDANCE_SELECTOR));
  }

  function scheduleIndex() {
    if (state.indexScheduled) {
      return;
    }

    state.indexScheduled = true;
    raf(() => {
      state.indexScheduled = false;
      rebuildIndex();
    });
  }

  function scheduleFilter() {
    if (state.filterScheduled) {
      return;
    }

    state.filterScheduled = true;
    raf(() => {
      state.filterScheduled = false;
      applyFilter();
    });
  }

  function rebuildIndex() {
    if (!(state.viewport instanceof HTMLElement) || !state.viewport.isConnected) {
      scheduleEnsure();
      return;
    }

    const groups = [];
    const rows = [];
    const indexedElements = new Set();

    for (const groupElement of state.viewport.querySelectorAll(REPO_GROUP_SELECTOR)) {
      if (!(groupElement instanceof HTMLElement)) {
        continue;
      }

      const repo = extractRepoName(groupElement);
      const groupInfo = {
        element: groupElement,
        repo,
        repoLower: repo.toLocaleLowerCase(),
        showMore: groupElement.querySelector(SHOW_MORE_SELECTOR),
        visibleCount: 0,
      };

      groups.push(groupInfo);
      indexedElements.add(groupElement);

      if (groupInfo.showMore instanceof HTMLElement) {
        indexedElements.add(groupInfo.showMore);
      }

      for (const row of groupElement.querySelectorAll(SESSION_ROW_SELECTOR)) {
        if (row instanceof HTMLElement) {
          rows.push(indexSessionRow(row, groupInfo));
          indexedElements.add(row);
        }
      }
    }

    cleanupHiddenElementsNoLongerIndexed(indexedElements);

    state.indexedGroups = groups;
    state.indexedRows = rows;
    applyFilter();
  }

  function extractRepoName(groupElement) {
    const fromGroup = cleanText(groupElement.getAttribute('data-repo-full-name'));
    if (fromGroup) {
      return fromGroup;
    }

    const fromHeader = cleanText(groupElement.querySelector('[data-sidebar-group-key]')?.getAttribute('data-sidebar-group-key'));
    if (fromHeader) {
      return fromHeader;
    }

    const fromPrMetadata = cleanText(groupElement.querySelector('[data-lody-github-repo]')?.getAttribute('data-lody-github-repo'));
    return fromPrMetadata;
  }

  function indexSessionRow(row, groupInfo) {
    const prNumbers = extractPrNumbers(row);
    const branches = extractBranches(row);
    const prSearchText = Array.from(prNumbers, (number) => `${number} #${number} pr:${number}`).join(' ');
    const branchSearchText = Array.from(branches).join(' ');
    const searchLower = `${groupInfo.repo} ${prSearchText} ${branchSearchText}`.toLocaleLowerCase();

    return {
      row,
      group: groupInfo,
      repoLower: groupInfo.repoLower,
      branchLower: branchSearchText.toLocaleLowerCase(),
      prNumbers,
      searchLower,
    };
  }

  function extractPrNumbers(row) {
    const numbers = new Set();

    for (const element of row.querySelectorAll(PR_METADATA_SELECTOR)) {
      const normalized = normalizePrNumber(element.getAttribute('data-lody-github-pr-number') || '');
      if (normalized) {
        numbers.add(normalized);
      }
    }

    for (const element of row.querySelectorAll('[aria-label], [title]')) {
      const text = `${element.getAttribute('aria-label') || ''} ${element.getAttribute('title') || ''}`;
      const match = text.match(/\bPR\s*#\s*([0-9]+)/i) || text.match(/\b(?:Open|Merged|Closed)\s*#\s*([0-9]+)/i);
      if (match) {
        numbers.add(match[1]);
      }
    }

    return numbers;
  }

  function normalizePrNumber(raw) {
    const match = String(raw).trim().match(/^#?([0-9]+)$/);
    return match ? match[1] : '';
  }

  function extractBranches(row) {
    const branches = new Set();

    for (const element of row.querySelectorAll(BRANCH_SELECTOR)) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }

      if (element.closest('[data-lody-github-pr-anchor], [data-lody-github-pr-original-hidden="true"]')) {
        continue;
      }

      const label = cleanText(element.getAttribute('aria-label'));
      const visibleText = cleanText(element.textContent);

      if (!label) {
        continue;
      }

      if (/^(?:open|closed|merged)\s+pr\s+#/i.test(label) || /^(?:archive session|toggle)$/i.test(label)) {
        continue;
      }

      branches.add(label);

      if (visibleText && visibleText !== label) {
        branches.add(visibleText);
      }
    }

    return branches;
  }

  function parseQuery(value) {
    const trimmed = value.trim().toLocaleLowerCase();
    if (!trimmed) {
      return [];
    }

    return trimmed
      .split(/\s+/)
      .map((token) => {
        const colon = token.indexOf(':');
        if (colon > 0) {
          const prefix = token.slice(0, colon);
          const valueAfterPrefix = token.slice(colon + 1);

          if ((prefix === 'repo' || prefix === 'r') && valueAfterPrefix) {
            return { kind: 'repo', value: valueAfterPrefix };
          }

          if ((prefix === 'branch' || prefix === 'b') && valueAfterPrefix) {
            return { kind: 'branch', value: valueAfterPrefix };
          }

          if ((prefix === 'pr' || prefix === 'pull') && valueAfterPrefix) {
            const pr = normalizePrNumber(valueAfterPrefix);
            return pr ? { kind: 'pr', value: pr } : null;
          }
        }

        const rawPr = normalizePrNumber(token);
        if (rawPr) {
          return { kind: 'pr-or-text', value: rawPr, raw: token };
        }

        return { kind: 'any', value: token };
      })
      .filter(Boolean);
  }

  function itemMatchesTerms(item, terms) {
    for (const term of terms) {
      if (!itemMatchesTerm(item, term)) {
        return false;
      }
    }

    return true;
  }

  function itemMatchesTerm(item, term) {
    switch (term.kind) {
      case 'repo':
        return item.repoLower.includes(term.value);
      case 'branch':
        return item.branchLower.includes(term.value);
      case 'pr':
        return item.prNumbers.has(term.value);
      case 'pr-or-text':
        return item.prNumbers.has(term.value) || item.repoLower.includes(term.raw) || item.branchLower.includes(term.raw);
      default:
        return item.searchLower.includes(term.value);
    }
  }

  function applyFilter() {
    const input = state.input;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    const terms = parseQuery(input.value || '');
    const active = terms.length > 0;
    let visibleRows = 0;

    for (const group of state.indexedGroups) {
      group.visibleCount = 0;
    }

    for (const item of state.indexedRows) {
      const isVisible = !active || itemMatchesTerms(item, terms);
      setElementHidden(item.row, active && !isVisible);

      if (isVisible) {
        item.group.visibleCount += 1;
        visibleRows += 1;
      }
    }

    for (const group of state.indexedGroups) {
      const hideGroup = active && group.visibleCount === 0;
      setElementHidden(group.element, hideGroup);

      if (group.showMore instanceof HTMLElement && group.showMore.isConnected) {
        setElementHidden(group.showMore, active && hideGroup);
      }
    }

    if (state.clearButton instanceof HTMLButtonElement) {
      state.clearButton.hidden = !active;
    }

    const totalRows = state.indexedRows.length;
    if (state.countLabel instanceof HTMLElement) {
      state.countLabel.textContent = active ? `${visibleRows}/${totalRows} visible` : `${totalRows} indexed`;
    }

    dispatchFilterEvent('lody-session-filter:applied', {
      active,
      query: input.value || '',
      totalRows,
      visibleRows,
      version: VERSION,
    });
  }

  function cleanupHiddenElementsNoLongerIndexed(indexedElements) {
    for (const element of Array.from(state.hiddenElements)) {
      if (!element.isConnected || !indexedElements.has(element)) {
        setElementHidden(element, false);
      }
    }
  }

  function setElementHidden(element, hidden) {
    if (!(element instanceof HTMLElement)) {
      return;
    }

    const currentlyHiddenByFilter = element.getAttribute(HIDDEN_ATTR) === 'true';

    if (hidden) {
      if (!currentlyHiddenByFilter) {
        state.hiddenElements.add(element);
        element.setAttribute(HIDDEN_ATTR, 'true');
      }
      return;
    }

    if (currentlyHiddenByFilter) {
      element.removeAttribute(HIDDEN_ATTR);
      state.hiddenElements.delete(element);
    }
  }

  function installTopBarRepoClickHandler() {
    if (state.topBarRepoClickHandlerInstalled) {
      return;
    }

    state.topBarRepoClickHandlerInstalled = true;

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      // Do not intercept clicks from either userscript's own controls or links.
      // The filter simply reacts to eligible top-bar clicks and lets the page,
      // and companion scripts, continue handling the same click.
      if (
        target.closest(
          [
            `#${UI_ID}`,
            'input',
            'textarea',
            'select',
            '[contenteditable="true"]',
            COMPANION_AFFORDANCE_SELECTOR,
          ].join(', '),
        )
      ) {
        return;
      }

      const repo = getTopBarRepoFromClickTarget(target);
      if (repo) {
        populateFilterWithRepo(repo);
      }
    });
  }

  function getTopBarRepoFromClickTarget(target) {
    const clickedSpan = target.closest('span');
    if (!(clickedSpan instanceof Element)) {
      return '';
    }

    let repoSpan = null;

    if (isTopBarGithubIconSpan(clickedSpan)) {
      repoSpan = clickedSpan.nextElementSibling;
    } else if (isTopBarRepoTextSpan(clickedSpan) && isTopBarGithubIconSpan(clickedSpan.previousElementSibling)) {
      repoSpan = clickedSpan;
    }

    if (!(repoSpan instanceof Element)) {
      return '';
    }

    const repo = normalizeRepoFullName(repoSpan.textContent || '');
    if (!repo || !isTopBarRepoCluster(repoSpan)) {
      return '';
    }

    return repo;
  }

  function isTopBarGithubIconSpan(element) {
    if (!(element instanceof Element) || element.localName !== 'span') {
      return false;
    }

    if (element.closest(`${REPO_GROUP_SELECTOR}, [data-sidebar-project-key], ${SESSION_ROW_SELECTOR}`)) {
      return false;
    }

    return Boolean(element.querySelector('svg.lucide-github'));
  }

  function isTopBarRepoTextSpan(element) {
    if (!(element instanceof Element) || element.localName !== 'span') {
      return false;
    }

    return Boolean(normalizeRepoFullName(element.textContent || ''));
  }

  function isTopBarRepoCluster(repoSpan) {
    if (repoSpan.closest(`${REPO_GROUP_SELECTOR}, [data-sidebar-project-key], ${SESSION_ROW_SELECTOR}`)) {
      return false;
    }

    if (!isTopBarGithubIconSpan(repoSpan.previousElementSibling)) {
      return false;
    }

    const parent = repoSpan.parentElement;
    const next = repoSpan.nextElementSibling;
    const hasKnownTopBarContext =
      Boolean(next?.matches('[data-lody-top-bar-context="true"], [data-lody-top-bar-extra-context="true"]')) ||
      Boolean(parent?.querySelector('[data-lody-top-bar-context="true"], [data-lody-top-bar-extra-context="true"]'));

    if (hasKnownTopBarContext) {
      return true;
    }

    // Fallback for sessions whose top bar has a repo but no branch/PR context.
    const activeRepo = extractRepoFromDocumentTitle() || extractRepoFromActiveSidebarRow();
    return activeRepo ? activeRepo === normalizeRepoFullName(repoSpan.textContent || '') : Boolean(parent?.classList.contains('leading-tight'));
  }

  function normalizeRepoFullName(value) {
    const text = String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    const match = text.match(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/);
    return match ? match[1] : '';
  }

  function extractRepoFromDocumentTitle() {
    const head = (document.title || '').split('·', 1)[0].split(':', 1)[0].trim();
    return normalizeRepoFullName(head);
  }

  function extractRepoFromActiveSidebarRow() {
    const match = window.location.pathname.match(/\/sessions\/([^/?#]+)/);
    const sessionId = match?.[1] ? decodeURIComponent(match[1]) : '';
    if (!sessionId) {
      return '';
    }

    const selector = `${SESSION_ROW_SELECTOR}${attrEqualsSelector('data-sidebar-session-id', sessionId)}`;
    const activeRow = document.querySelector(selector);
    const group = activeRow?.closest(REPO_GROUP_SELECTOR);
    return normalizeRepoFullName(group?.getAttribute('data-repo-full-name') || '');
  }

  function populateFilterWithRepo(repo) {
    const normalizedRepo = normalizeRepoFullName(repo);
    if (!normalizedRepo) {
      return false;
    }

    if (!state.input || !state.input.isConnected) {
      ensureInstalled();
    }

    const input = state.input instanceof HTMLInputElement ? state.input : document.getElementById(`${UI_ID}-input`);
    if (!(input instanceof HTMLInputElement)) {
      return false;
    }

    const query = `repo:${normalizedRepo}`;
    input.value = query;
    writeStoredQuery(query);

    if (!(state.clearButton instanceof HTMLButtonElement) || !state.clearButton.isConnected) {
      state.clearButton = document.querySelector(`#${UI_ID} .lody-session-filter-clear`);
    }

    if (state.clearButton instanceof HTMLButtonElement) {
      state.clearButton.hidden = false;
    }

    scheduleFilter();

    try {
      input.focus({ preventScroll: true });
      input.setSelectionRange(query.length, query.length);
    } catch {
      // Some search inputs reject selection APIs; the filter has still been applied.
    }

    return true;
  }

  function installLifecycleHooks() {
    if (state.lifecycleHooksInstalled) {
      return;
    }

    state.lifecycleHooksInstalled = true;

    const refresh = () => {
      state.lastLocationHref = location.href;
      scheduleEnsure();
    };

    window.addEventListener('popstate', refresh);
    window.addEventListener('hashchange', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('lody-userscript-location-change', refresh);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    });
  }

  function announceReady() {
    const api = {
      version: VERSION,
      refresh() {
        scheduleEnsure();
        scheduleIndex();
      },
      getQuery() {
        return state.input instanceof HTMLInputElement ? state.input.value : '';
      },
      setQuery(value) {
        const input = state.input instanceof HTMLInputElement ? state.input : document.getElementById(`${UI_ID}-input`);
        if (!(input instanceof HTMLInputElement)) {
          return false;
        }

        input.value = String(value ?? '');
        writeStoredQuery(input.value.trim());
        if (state.clearButton instanceof HTMLButtonElement) {
          state.clearButton.hidden = input.value.trim().length === 0;
        }
        scheduleFilter();
        return true;
      },
      setRepo(repo) {
        return populateFilterWithRepo(repo);
      },
    };

    window.__lodySessionSidebarFilter = api;

    if (!state.readyAnnounced) {
      state.readyAnnounced = true;
      dispatchFilterEvent('lody-session-filter:ready', { version: VERSION, api });
    }
  }

  function dispatchFilterEvent(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail }));
      document.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
    } catch {
      // Cross-browser belt-and-braces; the visible filter remains functional.
    }
  }

  function start() {
    if (state.started) {
      return;
    }

    state.started = true;
    installLifecycleHooks();
    installTopBarRepoClickHandler();

    if (!ensureInstalled()) {
      startBootObserver();
    }
  }

  // Yield one turn so companion userscripts that also run at document-idle can
  // install their affordances against Lody's native DOM before this script adds
  // its sidebar control. This avoids startup-order foot races without polling.
  setTimeout(start, 0);
})();
