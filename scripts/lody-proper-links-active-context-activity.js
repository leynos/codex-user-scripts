// ==UserScript==
// @name         Lody proper links, active context title, and activity indicator
// @namespace    https://github.com/leynos
// @version      0.4.1
// @description  Adds real anchors to Lody sessions and GitHub PR badges, prefixes the tab title with active context, marks active agent work, enriches the top bar, and cooperates with the sidebar filter.
// @author       Payton McIntosh + GPT-5
// @license      ISC
// @match        https://lody.ai/*
// @match        https://*.lody.ai/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  const FEATURES = {
    sessionAnchors: true,
    githubPrAnchors: true,
    topBarPrAnchors: true,
    topBarContext: true,
    activeContextTitle: true,
    transcriptActivityTitleIndicator: true,
  };

  const GITHUB_ORIGIN = 'https://github.com';
  const DEFAULT_TITLE = 'Lody';
  const TITLE_SEPARATOR = ' · ';
  const TITLE_REPO_BRANCH_SEPARATOR = ':';
  const ACTIVITY_TITLE_INDICATOR = '🏗️';
  const ACTIVITY_TITLE_PREFIX = `${ACTIVITY_TITLE_INDICATOR} `;

  // Set to false if you prefer "mxd:branch · Lody" rather than
  // "leynos/mxd:branch · Lody".
  const TITLE_USE_FULL_REPO_NAME = true;

  const SESSION_ROW_SELECTOR = '[data-sidebar-session-id]';
  const REPO_SELECTOR = '[data-repo-full-name]';
  const PR_BUTTON_SELECTOR = 'button[aria-label*="PR #"], button[title^="Open #"], button[title^="Merged #"], button[title^="Closed #"]';
  const PR_BUTTON_ICON_SELECTOR = 'svg.lucide-git-pull-request, svg.lucide-git-merge, svg.lucide-git-branch, path.stroke-status-success, circle[fill="#DBAB09"], path.stroke-status-danger';

  const SESSION_ANCHOR_SELECTOR = 'a[data-lody-session-anchor="true"]';
  const PR_ANCHOR_SELECTOR = 'a[data-lody-github-pr-anchor="true"]';
  const TRANSCRIPT_ACTIVITY_CANVAS_SELECTOR = 'canvas[aria-hidden="true"][width="72"][height="72"]';
  const TOP_BAR_CONTEXT_ATTR = 'data-lody-top-bar-context';
  const TOP_BAR_BRANCH_TEXT_ATTR = 'data-lody-top-bar-branch-text';
  const TOP_BAR_EXTRA_CONTEXT_ATTR = 'data-lody-top-bar-extra-context';

  const SESSION_TITLE_HOST_ATTR = 'data-lody-session-title-host';
  const PR_ORIGINAL_HIDDEN_ATTR = 'data-lody-github-pr-original-hidden';

  const SESSION_ID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const REPO_FULL_NAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
  const PR_NUMBER_RE = /\bPR\s+#(\d+)\b/i;
  const PR_TEXT_RE = /#(\d+)\b/;
  const ACTIVITY_LABEL_RE = /^[A-Za-z][A-Za-z -]{1,39}$/;

  const RESERVED_FIRST_PATH_SEGMENTS = new Set([
    'api',
    'assets',
    'auth',
    'callback',
    'favicon-light.svg',
    'favicon-dark.svg',
    'login',
    'logout',
    'manifest.webmanifest',
    'oauth',
    'signin',
    'signout',
  ]);

  const pendingSessionRows = new Set();
  const pendingPrButtons = new Set();
  const prAnchorFingerprints = new WeakMap();

  let scheduledDomFrame = 0;
  let scheduledTitleFrame = 0;
  let scheduledActivityScanFrame = 0;
  let scheduledTopBarFrame = 0;
  let scheduledCooperativeRefreshFrame = 0;

  let sidebarObserver = null;
  let bootstrapObserver = null;
  let titleElementObserver = null;
  let composerContextObserver = null;
  let transcriptActivityObserver = null;
  let topBarObserver = null;

  let observedSidebarRoot = null;
  let observedComposerContextRoot = null;
  let observedTranscriptActivityRoot = null;
  let observedTopBarRoot = null;

  let lastAppliedTitle = null;
  let lastNativeTitle = '';
  let cachedHasTranscriptActivity = false;
  const activeContextBySessionId = new Map();

  function cleanText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function attrEqualsSelector(attributeName, value) {
    const escapedValue = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `[${attributeName}="${escapedValue}"]`;
  }

  function installStyle() {
    if (document.getElementById('lody-userscript-proper-links-style')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'lody-userscript-proper-links-style';
    style.textContent = `
      [${SESSION_TITLE_HOST_ATTR}="true"] {
        position: relative !important;
      }

      ${SESSION_ANCHOR_SELECTOR} {
        position: absolute;
        inset: 0;
        z-index: 1;
        display: block;
        cursor: pointer;
        color: inherit;
        text-decoration: none;
        border-radius: inherit;
      }

      [${PR_ORIGINAL_HIDDEN_ATTR}="true"] {
        display: none !important;
      }

      ${PR_ANCHOR_SELECTOR} {
        text-decoration: none;
        cursor: pointer;
      }

      ${PR_ANCHOR_SELECTOR}:hover,
      ${PR_ANCHOR_SELECTOR}:focus {
        text-decoration: none;
      }

      [${TOP_BAR_CONTEXT_ATTR}="true"],
      [${TOP_BAR_EXTRA_CONTEXT_ATTR}="true"] {
        min-width: 0;
      }
    `;

    document.head.appendChild(style);
  }

  function getWorkspaceSegmentFromPath() {
    const firstSegment = location.pathname.split('/').filter(Boolean)[0];

    if (!firstSegment) {
      return null;
    }

    const lower = firstSegment.toLowerCase();

    if (
      RESERVED_FIRST_PATH_SEGMENTS.has(lower) ||
      lower.endsWith('.svg') ||
      lower.endsWith('.png') ||
      lower.endsWith('.ico') ||
      lower.endsWith('.webmanifest')
    ) {
      return null;
    }

    return firstSegment;
  }

  function getWorkspaceSegmentFromRepoOwner() {
    const repoNode = document.querySelector(REPO_SELECTOR);
    const repoFullName = repoNode?.getAttribute('data-repo-full-name') ?? '';
    const owner = repoFullName.split('/')[0]?.trim();

    return owner ? encodeURIComponent(owner) : null;
  }

  function getWorkspaceSegmentFromWorkspaceLabel() {
    const labels = document.querySelectorAll('button span.truncate');

    for (const label of labels) {
      const text = cleanText(label.textContent);
      const match = text.match(/^(.+)'s workspace$/);

      if (match?.[1]) {
        return encodeURIComponent(match[1].trim());
      }
    }

    return null;
  }

  function getWorkspaceSegment() {
    return (
      getWorkspaceSegmentFromPath() ??
      getWorkspaceSegmentFromRepoOwner() ??
      getWorkspaceSegmentFromWorkspaceLabel()
    );
  }

  function buildSessionHref(sessionId) {
    const workspaceSegment = getWorkspaceSegment();

    if (!workspaceSegment) {
      return null;
    }

    return new URL(
      `/${workspaceSegment}/sessions/${encodeURIComponent(sessionId)}`,
      location.origin,
    ).href;
  }

  function findSessionTitleHost(row) {
    const content = row.firstElementChild;
    const firstLine = content?.firstElementChild;

    if (!(firstLine instanceof HTMLElement)) {
      return null;
    }

    const directTitleHost = firstLine.querySelector(':scope > .min-w-0.flex-1.truncate');

    if (directTitleHost instanceof HTMLElement) {
      return directTitleHost;
    }

    const titleSpan = firstLine.querySelector('span.truncate');

    return titleSpan?.parentElement instanceof HTMLElement ? titleSpan.parentElement : null;
  }

  function getSessionTitle(row, titleHost) {
    return (
      cleanText(titleHost.querySelector('span.truncate')?.textContent) ||
      cleanText(row.getAttribute('aria-label')) ||
      'session'
    );
  }

  function dispatchOriginalRowClick(row, sourceEvent) {
    row.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0,
        buttons: 0,
        clientX: sourceEvent.clientX,
        clientY: sourceEvent.clientY,
        screenX: sourceEvent.screenX,
        screenY: sourceEvent.screenY,
      }),
    );
  }

  function onSessionAnchorMouseDown(event) {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      event.stopPropagation();
    }
  }

  function onSessionAnchorAuxClick(event) {
    event.stopPropagation();
  }

  function onSessionAnchorContextMenu(event) {
    event.stopPropagation();
  }

  function onSessionAnchorClick(event) {
    if (event.button !== 0) {
      return;
    }

    if (
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      event.stopPropagation();
      return;
    }

    const anchor = event.currentTarget;
    const row = anchor.closest(SESSION_ROW_SELECTOR);

    if (!(row instanceof HTMLElement)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    dispatchOriginalRowClick(row, event);
  }

  function createSessionAnchor() {
    const anchor = document.createElement('a');

    anchor.dataset.lodySessionAnchor = 'true';
    anchor.tabIndex = -1;
    anchor.rel = 'noopener';

    anchor.addEventListener('mousedown', onSessionAnchorMouseDown);
    anchor.addEventListener('auxclick', onSessionAnchorAuxClick);
    anchor.addEventListener('contextmenu', onSessionAnchorContextMenu);
    anchor.addEventListener('click', onSessionAnchorClick);

    return anchor;
  }

  function linkifySessionRow(row) {
    if (!FEATURES.sessionAnchors || !(row instanceof HTMLElement)) {
      return;
    }

    if (row.getAttribute('aria-disabled') === 'true') {
      return;
    }

    const sessionId = row.dataset.sidebarSessionId;

    if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
      return;
    }

    const href = buildSessionHref(sessionId);

    if (!href) {
      return;
    }

    const titleHost = findSessionTitleHost(row);

    if (!titleHost) {
      return;
    }

    titleHost.setAttribute(SESSION_TITLE_HOST_ATTR, 'true');

    let anchor = titleHost.querySelector(`:scope > ${SESSION_ANCHOR_SELECTOR}`);

    if (!(anchor instanceof HTMLAnchorElement)) {
      anchor = createSessionAnchor();
      titleHost.appendChild(anchor);
    }

    const title = getSessionTitle(row, titleHost);

    anchor.href = href;
    anchor.title = title;
    anchor.setAttribute('aria-label', `Open session: ${title}`);
    anchor.dataset.lodySessionId = sessionId;
  }

  function buttonLooksLikeGitHubPrBadge(button) {
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }

    if (!getPrNumber(button)) {
      return false;
    }

    const ariaLabel = cleanText(button.getAttribute('aria-label'));
    const title = cleanText(button.getAttribute('title'));

    if (/\b(?:open|merged|closed)\s+PR\s+#\d+\b/i.test(ariaLabel)) {
      return true;
    }

    if (/^(?:Open|Merged|Closed)\s+#\d+$/i.test(title)) {
      return Boolean(
        button.querySelector(PR_BUTTON_ICON_SELECTOR),
      );
    }

    return Boolean(
      button.querySelector(PR_BUTTON_ICON_SELECTOR),
    );
  }

  function getPrNumber(button) {
    const ariaLabel = button.getAttribute('aria-label') ?? '';
    const ariaMatch = ariaLabel.match(PR_NUMBER_RE);

    if (ariaMatch?.[1]) {
      return ariaMatch[1];
    }

    const textMatch = button.textContent?.match(PR_TEXT_RE);

    return textMatch?.[1] ?? null;
  }

  function getRepoFullNameFromElement(element) {
    const repoNode = element.closest(REPO_SELECTOR);

    if (!(repoNode instanceof HTMLElement)) {
      return null;
    }

    const repoFullName = cleanText(repoNode.dataset.repoFullName);

    return REPO_FULL_NAME_RE.test(repoFullName) ? repoFullName : null;
  }

  function getRepoFullNameForPrButton(button) {
    return (
      getRepoFullNameFromElement(button) ??
      getTopBarRepoFullNameForElement(button) ??
      getActiveTitleContext()?.repoFullName ??
      getMainComposerRepoFullName()
    );
  }

  function buildGitHubPrHref(repoFullName, prNumber) {
    const [owner, repo] = repoFullName.split('/');

    return `${GITHUB_ORIGIN}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pull/${encodeURIComponent(prNumber)}`;
  }

  function stopRowHandlingWithoutCancellingLink(event) {
    event.stopPropagation();
  }

  function installPrAnchorEventHandlers(anchor) {
    if (anchor.dataset.lodyGithubPrEventsInstalled === 'true') {
      return;
    }

    for (const eventName of [
      'pointerdown',
      'pointerup',
      'mousedown',
      'mouseup',
      'click',
      'auxclick',
      'contextmenu',
      'keydown',
    ]) {
      anchor.addEventListener(eventName, stopRowHandlingWithoutCancellingLink);
    }

    anchor.dataset.lodyGithubPrEventsInstalled = 'true';
  }

  function ensurePrAnchorAfterButton(button) {
    const next = button.nextElementSibling;

    if (next instanceof HTMLAnchorElement && next.matches(PR_ANCHOR_SELECTOR)) {
      installPrAnchorEventHandlers(next);
      return next;
    }

    const anchor = document.createElement('a');
    anchor.dataset.lodyGithubPrAnchor = 'true';

    installPrAnchorEventHandlers(anchor);
    button.after(anchor);

    return anchor;
  }

  function syncPrAnchorVisuals(anchor, button) {
    const ariaLabel = button.getAttribute('aria-label') ?? '';
    const fingerprint = `${button.className}\n${ariaLabel}\n${button.innerHTML}`;

    if (prAnchorFingerprints.get(anchor) === fingerprint) {
      return;
    }

    anchor.className = button.className;
    anchor.replaceChildren(
      ...Array.from(button.childNodes, (child) => child.cloneNode(true)),
    );

    prAnchorFingerprints.set(anchor, fingerprint);
  }

  function unlinkPrButton(button) {
    const next = button.nextElementSibling;

    if (next instanceof HTMLAnchorElement && next.matches(PR_ANCHOR_SELECTOR)) {
      next.remove();
    }

    button.removeAttribute(PR_ORIGINAL_HIDDEN_ATTR);
  }

  function linkifyPrButton(button) {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    if (!FEATURES.githubPrAnchors) {
      return;
    }

    const isSidebarPrButton = Boolean(button.closest(REPO_SELECTOR));
    const isTopBarPrButton = !isSidebarPrButton && buttonLooksLikeGitHubPrBadge(button);

    if (!isSidebarPrButton && (!FEATURES.topBarPrAnchors || !isTopBarPrButton)) {
      return;
    }

    if (!buttonLooksLikeGitHubPrBadge(button)) {
      return;
    }

    const prNumber = getPrNumber(button);
    const repoFullName = getRepoFullNameForPrButton(button);

    if (!prNumber || !repoFullName) {
      unlinkPrButton(button);
      return;
    }

    const href = buildGitHubPrHref(repoFullName, prNumber);
    const sourceLabel = cleanText(button.getAttribute('aria-label')) || cleanText(button.getAttribute('title')) || `PR #${prNumber}`;

    const anchor = ensurePrAnchorAfterButton(button);

    syncPrAnchorVisuals(anchor, button);

    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.title = `Open ${repoFullName} PR #${prNumber} on GitHub`;
    anchor.setAttribute('aria-label', `${sourceLabel} on GitHub`);
    anchor.dataset.lodyGithubRepo = repoFullName;
    anchor.dataset.lodyGithubPrNumber = prNumber;

    button.setAttribute(PR_ORIGINAL_HIDDEN_ATTR, 'true');
  }

  function queueSessionRow(row) {
    if (!(row instanceof HTMLElement)) {
      return;
    }

    pendingSessionRows.add(row);
    scheduleDomWork();
  }

  function queuePrButton(button) {
    if (!(button instanceof HTMLButtonElement) || !buttonLooksLikeGitHubPrBadge(button)) {
      return;
    }

    pendingPrButtons.add(button);
    scheduleDomWork();
  }

  function scheduleDomWork() {
    if (!scheduledDomFrame) {
      scheduledDomFrame = requestAnimationFrame(flushDomWork);
    }
  }

  function flushDomWork() {
    scheduledDomFrame = 0;

    for (const row of pendingSessionRows) {
      if (row.isConnected) {
        linkifySessionRow(row);
      }
    }

    for (const button of pendingPrButtons) {
      if (button.isConnected) {
        linkifyPrButton(button);
      }
    }

    pendingSessionRows.clear();
    pendingPrButtons.clear();

    scheduleTitleUpdate();
  }

  function queueNodeForLinkification(node) {
    if (!(node instanceof Element)) {
      return;
    }

    if (node.matches(SESSION_ROW_SELECTOR)) {
      queueSessionRow(node);
    }

    if (node.matches(PR_BUTTON_SELECTOR)) {
      queuePrButton(node);
    }

    for (const row of node.querySelectorAll(SESSION_ROW_SELECTOR)) {
      queueSessionRow(row);
    }

    for (const button of node.querySelectorAll(PR_BUTTON_SELECTOR)) {
      queuePrButton(button);
    }
  }

  function getActiveSessionIdFromLocation() {
    const segments = location.pathname.split('/').filter(Boolean);
    const sessionsIndex = segments.findIndex((segment) => segment === 'sessions');
    const candidate = sessionsIndex >= 0 ? segments[sessionsIndex + 1] : null;

    return candidate && SESSION_ID_RE.test(candidate) ? candidate : null;
  }

  function getSessionRowById(sessionId) {
    const selector = `${SESSION_ROW_SELECTOR}${attrEqualsSelector('data-sidebar-session-id', sessionId)}`;
    const row = document.querySelector(selector);

    return row instanceof HTMLElement ? row : null;
  }

  function getSelectedSessionRowFallback() {
    const rows = document.querySelectorAll(SESSION_ROW_SELECTOR);

    for (const row of rows) {
      if (!(row instanceof HTMLElement)) {
        continue;
      }

      const className = row.getAttribute('class') ?? '';

      if (
        row.getAttribute('aria-current') === 'page' ||
        row.dataset.state === 'active' ||
        /\bbg-sidebar-selection\b/.test(className)
      ) {
        return row;
      }
    }

    return null;
  }

  function getBranchNameFromSessionRow(row) {
    const searchRoot = row.querySelector('.pl-7') ?? row;
    const candidates = searchRoot.querySelectorAll('[aria-label]');

    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement)) {
        continue;
      }

      if (candidate.matches('button') || candidate.closest('button')) {
        continue;
      }

      const label = cleanText(candidate.getAttribute('aria-label'));

      if (!label) {
        continue;
      }

      if (
        /\b(?:open|merged|closed)\s+PR\s+#\d+\b/i.test(label) ||
        /^archive session$/i.test(label) ||
        /^toggle$/i.test(label)
      ) {
        continue;
      }

      return label;
    }

    return null;
  }

  function findComposerButtonByIconClass(iconClass) {
    const buttons = document.querySelectorAll('button[aria-haspopup="dialog"]');

    for (const button of buttons) {
      if (!(button instanceof HTMLButtonElement)) {
        continue;
      }

      if (button.querySelector(`svg.${iconClass}`)) {
        return button;
      }
    }

    return null;
  }

  function getMainComposerRepoFullName() {
    const button = findComposerButtonByIconClass('lucide-github');
    const text = cleanText(
      button?.querySelector('span.truncate.font-medium')?.textContent ??
      button?.textContent,
    );

    return REPO_FULL_NAME_RE.test(text) ? text : null;
  }

  function getMainComposerBranchName() {
    const button = findComposerButtonByIconClass('lucide-git-branch');
    const text = cleanText(
      button?.querySelector('span.truncate.font-medium')?.textContent ??
      button?.textContent,
    );

    return text || null;
  }

  function getCommonElementAncestor(first, second) {
    if (!(first instanceof Element) || !(second instanceof Element)) {
      return null;
    }

    const ancestors = new Set();

    for (let node = first; node; node = node.parentElement) {
      ancestors.add(node);
    }

    for (let node = second; node; node = node.parentElement) {
      if (ancestors.has(node)) {
        return node;
      }
    }

    return null;
  }

  function findTopBarRootForElement(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    const root = element.closest('.relative.flex.flex-col.shrink-0');

    if (!(root instanceof HTMLElement)) {
      return null;
    }

    if (root.contains(document.getElementById('chat-prompt'))) {
      return null;
    }

    return root;
  }

  function findTopBarRepoParts(root) {
    if (!(root instanceof Element)) {
      return null;
    }

    const githubIcons = root.querySelectorAll('svg.lucide-github');

    for (const icon of githubIcons) {
      let node = icon.parentElement;

      for (let depth = 0; node && root.contains(node) && depth < 8; depth += 1, node = node.parentElement) {
        const spans = node.querySelectorAll('span.truncate, span.font-medium');

        for (const span of spans) {
          if (!(span instanceof HTMLElement)) {
            continue;
          }

          if (span.closest(`[${TOP_BAR_CONTEXT_ATTR}=\"true\"], [${TOP_BAR_EXTRA_CONTEXT_ATTR}=\"true\"]`)) {
            continue;
          }

          const repoFullName = cleanText(span.textContent);

          if (REPO_FULL_NAME_RE.test(repoFullName)) {
            return {
              root,
              line: node,
              repoSpan: span,
              repoFullName,
            };
          }
        }
      }
    }

    return null;
  }

  function findTopBarRoot() {
    const mainPane = findMainPaneRoot();

    if (!(mainPane instanceof Element)) {
      return null;
    }

    const candidates = mainPane.querySelectorAll('.relative.flex.flex-col.shrink-0');

    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement)) {
        continue;
      }

      if (candidate.contains(document.getElementById('chat-prompt'))) {
        continue;
      }

      if (findTopBarRepoParts(candidate) || candidate.querySelector(PR_BUTTON_SELECTOR)) {
        return candidate;
      }
    }

    return null;
  }

  function getTopBarRepoFullName(root) {
    return findTopBarRepoParts(root)?.repoFullName ?? null;
  }

  function getTopBarRepoFullNameForElement(element) {
    const root = findTopBarRootForElement(element);
    return root ? getTopBarRepoFullName(root) : null;
  }

  function createGitBranchIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('class', 'lucide lucide-git-branch h-3.5 w-3.5 shrink-0 opacity-70');
    svg.setAttribute('aria-hidden', 'true');

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '6');
    line.setAttribute('x2', '6');
    line.setAttribute('y1', '3');
    line.setAttribute('y2', '15');

    const circleA = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circleA.setAttribute('cx', '18');
    circleA.setAttribute('cy', '6');
    circleA.setAttribute('r', '3');

    const circleB = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circleB.setAttribute('cx', '6');
    circleB.setAttribute('cy', '18');
    circleB.setAttribute('r', '3');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M18 9a9 9 0 0 1-9 9');

    svg.append(line, circleA, circleB, path);
    return svg;
  }

  function createTopBarBranchNode() {
    const wrapper = document.createElement('span');
    wrapper.setAttribute(TOP_BAR_CONTEXT_ATTR, 'true');
    wrapper.className = 'inline-flex min-w-0 shrink items-center gap-1 text-muted-foreground';

    const separator = document.createElement('span');
    separator.className = 'shrink-0 text-muted-foreground/60';
    separator.textContent = '·';

    const text = document.createElement('span');
    text.setAttribute(TOP_BAR_BRANCH_TEXT_ATTR, 'true');
    text.className = 'truncate font-medium';

    wrapper.append(separator, createGitBranchIcon(), text);
    return wrapper;
  }

  function syncTopBarContext(root) {
    if (!FEATURES.topBarContext || !(root instanceof HTMLElement)) {
      return;
    }

    const activeContext = getActiveTitleContext();
    const repoParts = findTopBarRepoParts(root);
    const repoFullName = activeContext?.repoFullName ?? repoParts?.repoFullName ?? null;
    const branchName = activeContext?.branchName ? cleanText(activeContext.branchName) : null;

    if (!repoFullName && !branchName) {
      return;
    }

    if (repoParts?.repoSpan && repoFullName && cleanText(repoParts.repoSpan.textContent) !== repoFullName) {
      repoParts.repoSpan.textContent = repoFullName;
    }

    if (repoParts?.line && repoParts.repoSpan) {
      let branchNode = repoParts.line.querySelector(`[${TOP_BAR_CONTEXT_ATTR}=\"true\"]`);

      if (!branchName) {
        branchNode?.remove();
        return;
      }

      if (!(branchNode instanceof HTMLElement)) {
        branchNode = createTopBarBranchNode();
        repoParts.repoSpan.after(branchNode);
      }

      const branchText = branchNode.querySelector(`[${TOP_BAR_BRANCH_TEXT_ATTR}=\"true\"]`);

      if (branchText instanceof HTMLElement && cleanText(branchText.textContent) !== branchName) {
        branchText.textContent = branchName;
        branchNode.title = branchName;
        branchNode.setAttribute('aria-label', `Branch ${branchName}`);
      }

      return;
    }

    const host = root.querySelector('.flex.flex-1.min-w-0.items-center.gap-2') ?? root.firstElementChild ?? root;

    if (!(host instanceof HTMLElement)) {
      return;
    }

    let extra = host.querySelector(`[${TOP_BAR_EXTRA_CONTEXT_ATTR}=\"true\"]`);

    if (!(extra instanceof HTMLElement)) {
      extra = document.createElement('div');
      extra.setAttribute(TOP_BAR_EXTRA_CONTEXT_ATTR, 'true');
      extra.className = 'flex min-w-0 items-center gap-1.5 text-sm leading-tight text-muted-foreground';
      host.appendChild(extra);
    }

    const text = branchName && repoFullName ? `${repoFullName}${TITLE_REPO_BRANCH_SEPARATOR}${branchName}` : repoFullName ?? branchName ?? '';

    if (cleanText(extra.textContent) !== text) {
      extra.textContent = text;
      extra.title = text;
    }
  }

  function scheduleTopBarUpdate() {
    if ((!FEATURES.topBarContext && !FEATURES.topBarPrAnchors) || scheduledTopBarFrame) {
      return;
    }

    scheduledTopBarFrame = requestAnimationFrame(applyTopBarUpdate);
  }

  function applyTopBarUpdate() {
    scheduledTopBarFrame = 0;

    observeTopBarRoot();

    const root = observedTopBarRoot?.isConnected ? observedTopBarRoot : findTopBarRoot();

    if (!(root instanceof HTMLElement)) {
      return;
    }

    if (FEATURES.topBarPrAnchors) {
      queueNodeForLinkification(root);
    }

    syncTopBarContext(root);
  }

  function observeTopBarRoot() {
    if (!FEATURES.topBarContext && !FEATURES.topBarPrAnchors) {
      return;
    }

    const root = findTopBarRoot();

    if (!(root instanceof HTMLElement)) {
      return;
    }

    if (root === observedTopBarRoot) {
      return;
    }

    topBarObserver?.disconnect();

    observedTopBarRoot = root;
    topBarObserver = new MutationObserver((mutations) => {
      let shouldUpdate = false;

      for (const mutation of mutations) {
        if (mutation.type === 'attributes' || mutation.type === 'characterData') {
          shouldUpdate = true;
          continue;
        }

        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            queueNodeForLinkification(node);
          }

          shouldUpdate = true;
        }

        for (const node of mutation.removedNodes) {
          if (node instanceof Element) {
            shouldUpdate = true;
          }
        }
      }

      if (shouldUpdate) {
        scheduleTopBarUpdate();
        scheduleTitleUpdate();
      }
    });

    topBarObserver.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'class', 'data-state', 'title'],
    });
  }

  function findComposerContextRoot() {
    const repoButton = findComposerButtonByIconClass('lucide-github');
    const branchButton = findComposerButtonByIconClass('lucide-git-branch');

    return (
      getCommonElementAncestor(repoButton, branchButton) ??
      repoButton?.parentElement ??
      branchButton?.parentElement ??
      null
    );
  }

  function observeComposerContextRoot() {
    if (!FEATURES.activeContextTitle) {
      return;
    }

    const root = findComposerContextRoot();

    if (!(root instanceof Element) || root === observedComposerContextRoot) {
      return;
    }

    composerContextObserver?.disconnect();

    observedComposerContextRoot = root;
    composerContextObserver = new MutationObserver(scheduleTitleUpdate);
    composerContextObserver.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'class', 'data-state', 'title'],
    });
  }

  function getActiveSidebarSessionContext() {
    const activeSessionId = getActiveSessionIdFromLocation();
    const row = activeSessionId ? getSessionRowById(activeSessionId) : getSelectedSessionRowFallback();

    if (!(row instanceof HTMLElement)) {
      return null;
    }

    const repoFullName = getRepoFullNameFromElement(row);
    const branchName = getBranchNameFromSessionRow(row);

    if (!repoFullName && !branchName) {
      return null;
    }

    return { repoFullName, branchName };
  }

  function getMainComposerContext() {
    const repoFullName = getMainComposerRepoFullName();
    const branchName = getMainComposerBranchName();

    if (!repoFullName && !branchName) {
      return null;
    }

    return { repoFullName, branchName };
  }

  function mergeContext(...contexts) {
    const merged = { repoFullName: null, branchName: null };

    for (const context of contexts) {
      if (!context) {
        continue;
      }

      merged.repoFullName ??= context.repoFullName ?? null;
      merged.branchName ??= context.branchName ?? null;
    }

    return merged.repoFullName || merged.branchName ? merged : null;
  }

  function rememberActiveTitleContext(sessionId, context) {
    if (!sessionId || !context) {
      return context;
    }

    const previous = activeContextBySessionId.get(sessionId) ?? {};
    const next = {
      repoFullName: context.repoFullName ?? previous.repoFullName ?? null,
      branchName: context.branchName ?? previous.branchName ?? null,
    };

    if (next.repoFullName || next.branchName) {
      activeContextBySessionId.set(sessionId, next);
      return next;
    }

    return context;
  }

  function getActiveTitleContext() {
    const activeSessionId = getActiveSessionIdFromLocation();

    // Only use the main composer as a fallback when the URL identifies a real
    // session. On the new-chat route, selected repo and branch are draft
    // context, not the context of an active session.
    if (activeSessionId) {
      const sidebarContext = getActiveSidebarSessionContext();
      const composerContext = getMainComposerContext();
      const cachedContext = activeContextBySessionId.get(activeSessionId) ?? null;
      const context = mergeContext(sidebarContext, composerContext, cachedContext);

      return rememberActiveTitleContext(activeSessionId, context);
    }

    return getSelectedSessionRowFallback() ? getActiveSidebarSessionContext() : null;
  }

  function formatRepoForTitle(repoFullName) {
    if (!repoFullName) {
      return null;
    }

    if (TITLE_USE_FULL_REPO_NAME) {
      return repoFullName;
    }

    return repoFullName.split('/').at(-1) ?? repoFullName;
  }

  function stripOwnActivityIndicator(title) {
    let result = cleanText(title);

    while (result.startsWith(ACTIVITY_TITLE_INDICATOR)) {
      result = result.slice(ACTIVITY_TITLE_INDICATOR.length).trimStart();
    }

    return result;
  }

  function stripLikelyOwnTitlePrefix(title) {
    const titleWithoutActivity = stripOwnActivityIndicator(title);
    const separatorIndex = titleWithoutActivity.lastIndexOf(TITLE_SEPARATOR);

    if (separatorIndex < 1) {
      return titleWithoutActivity;
    }

    const prefix = titleWithoutActivity.slice(0, separatorIndex);
    const suffix = titleWithoutActivity.slice(separatorIndex + TITLE_SEPARATOR.length);

    if (prefix.includes(TITLE_REPO_BRANCH_SEPARATOR) && suffix) {
      return suffix;
    }

    return titleWithoutActivity;
  }

  function getNativeTitleSnapshot() {
    const currentTitle = cleanText(document.title);

    if (currentTitle && currentTitle !== lastAppliedTitle) {
      lastNativeTitle = stripLikelyOwnTitlePrefix(currentTitle);
    }

    return lastNativeTitle || DEFAULT_TITLE;
  }

  function shouldShowTranscriptActivityIndicator() {
    return (
      FEATURES.transcriptActivityTitleIndicator &&
      Boolean(getActiveSessionIdFromLocation()) &&
      cachedHasTranscriptActivity
    );
  }

  function buildEnhancedTitle(context, baseTitle) {
    const repo = formatRepoForTitle(context?.repoFullName);
    const branch = context?.branchName ? cleanText(context.branchName) : null;
    let title;

    if (repo && branch) {
      title = `${repo}${TITLE_REPO_BRANCH_SEPARATOR}${branch}${TITLE_SEPARATOR}${baseTitle}`;
    } else if (repo) {
      title = `${repo}${TITLE_SEPARATOR}${baseTitle}`;
    } else if (branch) {
      title = `${branch}${TITLE_SEPARATOR}${baseTitle}`;
    } else {
      title = baseTitle;
    }

    return shouldShowTranscriptActivityIndicator() ? `${ACTIVITY_TITLE_PREFIX}${title}` : title;
  }

  function scheduleTitleUpdate() {
    if (!FEATURES.activeContextTitle || scheduledTitleFrame) {
      return;
    }

    scheduledTitleFrame = requestAnimationFrame(applyEnhancedTitle);
  }

  function applyEnhancedTitle() {
    scheduledTitleFrame = 0;

    if (!observedComposerContextRoot?.isConnected) {
      observeComposerContextRoot();
    }

    if (!observedTranscriptActivityRoot?.isConnected) {
      observeTranscriptActivityRoot();
    }

    const baseTitle = getNativeTitleSnapshot();
    const context = getActiveTitleContext();
    const nextTitle = buildEnhancedTitle(context, baseTitle);

    if (document.title !== nextTitle) {
      lastAppliedTitle = nextTitle;
      document.title = nextTitle;
      return;
    }

    lastAppliedTitle = nextTitle;
  }

  function observeTitleElement() {
    if (!FEATURES.activeContextTitle || titleElementObserver) {
      return;
    }

    const titleElement = document.querySelector('title');

    if (!titleElement) {
      return;
    }

    titleElementObserver = new MutationObserver(() => {
      if (cleanText(document.title) !== lastAppliedTitle) {
        scheduleTitleUpdate();
      }
    });

    titleElementObserver.observe(titleElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function findMainPaneRoot() {
    const root = document.getElementById('root');

    if (!(root instanceof HTMLElement)) {
      return document.body;
    }

    const appShell = Array.from(root.children).find((child) => {
      if (!(child instanceof HTMLElement)) {
        return false;
      }

      return (
        child.classList.contains('flex') &&
        child.classList.contains('w-full') &&
        child.classList.contains('overflow-hidden')
      );
    });

    if (appShell instanceof HTMLElement) {
      const mainPane = Array.from(appShell.children).find((child) => {
        if (!(child instanceof HTMLElement)) {
          return false;
        }

        return (
          child.classList.contains('flex-1') &&
          child.classList.contains('flex') &&
          child.classList.contains('overflow-hidden')
        );
      });

      if (mainPane instanceof HTMLElement) {
        return mainPane;
      }

      const lastChild = appShell.lastElementChild;

      if (lastChild instanceof HTMLElement) {
        return lastChild;
      }
    }

    const composer = document.getElementById('chat-prompt');
    const composerPane = composer?.closest('.flex-1.flex.flex-col.overflow-hidden');

    if (composerPane instanceof HTMLElement) {
      return composerPane;
    }

    return root;
  }

  function isPlausibleActivityLabel(label) {
    return ACTIVITY_LABEL_RE.test(label) && label.length >= 3;
  }

  function hasAnimatedLetterChildren(textSpan) {
    const children = Array.from(textSpan.children).filter(
      (child) => child instanceof HTMLElement,
    );

    if (children.length < 3) {
      return false;
    }

    return children.every((child) => {
      const className = String(child.getAttribute('class') ?? '');
      return className.includes('transition-[color,text-shadow]');
    });
  }

  function isTranscriptActivityCanvas(canvas) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      return false;
    }

    const wrapper = canvas.parentElement;

    if (!(wrapper instanceof HTMLElement)) {
      return false;
    }

    const textSpan = wrapper.querySelector(':scope > span.text-sm') ?? wrapper.querySelector('span.text-sm');

    if (!(textSpan instanceof HTMLElement)) {
      return false;
    }

    const label = cleanText(textSpan.textContent);

    if (!isPlausibleActivityLabel(label)) {
      return false;
    }

    if (!hasAnimatedLetterChildren(textSpan)) {
      return false;
    }

    const activityRow = wrapper.closest('.flex.items-center, .flex.items-start');
    return activityRow instanceof HTMLElement;
  }

  function nodeMayContainTranscriptActivity(node) {
    if (!(node instanceof Element)) {
      return false;
    }

    return (
      node.matches(TRANSCRIPT_ACTIVITY_CANVAS_SELECTOR) ||
      Boolean(node.querySelector(TRANSCRIPT_ACTIVITY_CANVAS_SELECTOR))
    );
  }

  function scanTranscriptActivityNow() {
    const root = findMainPaneRoot();
    let hasActivity = false;

    if (root instanceof Element) {
      const canvases = root.querySelectorAll(TRANSCRIPT_ACTIVITY_CANVAS_SELECTOR);

      for (const canvas of canvases) {
        if (isTranscriptActivityCanvas(canvas)) {
          hasActivity = true;
          break;
        }
      }
    }

    if (cachedHasTranscriptActivity !== hasActivity) {
      cachedHasTranscriptActivity = hasActivity;
      scheduleTitleUpdate();
    }
  }

  function scheduleTranscriptActivityScan() {
    if (!FEATURES.transcriptActivityTitleIndicator || scheduledActivityScanFrame) {
      return;
    }

    scheduledActivityScanFrame = requestAnimationFrame(() => {
      scheduledActivityScanFrame = 0;
      scanTranscriptActivityNow();
    });
  }

  function observeTranscriptActivityRoot() {
    if (!FEATURES.transcriptActivityTitleIndicator) {
      return;
    }

    const root = findMainPaneRoot();

    if (!(root instanceof Element)) {
      return;
    }

    if (root === observedTranscriptActivityRoot) {
      scheduleTranscriptActivityScan();
      return;
    }

    transcriptActivityObserver?.disconnect();

    observedTranscriptActivityRoot = root;
    transcriptActivityObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (nodeMayContainTranscriptActivity(node)) {
            scheduleTranscriptActivityScan();
            return;
          }
        }

        for (const node of mutation.removedNodes) {
          if (nodeMayContainTranscriptActivity(node)) {
            scheduleTranscriptActivityScan();
            return;
          }
        }
      }
    });

    // Deliberately childList only. The animated activity label mutates style
    // attributes constantly, and observing attributes would turn the title
    // updater into a tiny CPU tambourine.
    transcriptActivityObserver.observe(root, {
      childList: true,
      subtree: true,
    });

    scheduleTranscriptActivityScan();
  }

  function findSidebarRoot() {
    const firstSessionRow = document.querySelector(SESSION_ROW_SELECTOR);
    const firstPrButton = document.querySelector(PR_BUTTON_SELECTOR);
    const firstRepo = document.querySelector(REPO_SELECTOR);
    const candidate = firstSessionRow ?? firstPrButton ?? firstRepo;

    if (!(candidate instanceof Element)) {
      return null;
    }

    return (
      candidate.closest('[data-radix-scroll-area-viewport]') ||
      candidate.closest(REPO_SELECTOR)?.parentElement ||
      candidate.parentElement
    );
  }

  function onSidebarMutations(mutations) {
    let shouldUpdateTitle = false;

    for (const mutation of mutations) {
      if (mutation.type === 'attributes' || mutation.type === 'characterData') {
        queueNodeForLinkification(mutation.target);
        shouldUpdateTitle = true;
        continue;
      }

      for (const node of mutation.addedNodes) {
        queueNodeForLinkification(node);
        shouldUpdateTitle = true;
      }
    }

    if (shouldUpdateTitle) {
      scheduleTopBarUpdate();
      scheduleTitleUpdate();
    }
  }

  function observeSidebarRoot(root) {
    if (root === observedSidebarRoot) {
      return;
    }

    sidebarObserver?.disconnect();

    observedSidebarRoot = root;
    sidebarObserver = new MutationObserver(onSidebarMutations);
    sidebarObserver.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'aria-disabled',
        'aria-label',
        'class',
        'data-repo-full-name',
        'data-sidebar-session-id',
      ],
    });
  }

  function startBootstrapObserver() {
    if (bootstrapObserver || !document.body) {
      return;
    }

    bootstrapObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (
            node instanceof Element &&
            (
              node.matches(SESSION_ROW_SELECTOR) ||
              node.matches(PR_BUTTON_SELECTOR) ||
              node.matches(REPO_SELECTOR) ||
              node.querySelector(SESSION_ROW_SELECTOR) ||
              node.querySelector(PR_BUTTON_SELECTOR) ||
              node.querySelector(REPO_SELECTOR)
            )
          ) {
            initialise();
            return;
          }
        }
      }
    });

    bootstrapObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function scanCurrentSidebar() {
    const root = findSidebarRoot();

    if (!root) {
      startBootstrapObserver();
      return;
    }

    bootstrapObserver?.disconnect();
    bootstrapObserver = null;

    observeSidebarRoot(root);
    queueNodeForLinkification(root);
  }

  function initialise() {
    installStyle();
    observeTitleElement();
    scanCurrentSidebar();
    observeComposerContextRoot();
    observeTranscriptActivityRoot();
    observeTopBarRoot();
    scheduleTopBarUpdate();
    scheduleTitleUpdate();
  }

  function refreshAfterUrlChange() {
    requestAnimationFrame(() => {
      if (!observedSidebarRoot?.isConnected) {
        observedSidebarRoot = null;
      }

      if (!observedComposerContextRoot?.isConnected) {
        observedComposerContextRoot = null;
        composerContextObserver?.disconnect();
        composerContextObserver = null;
      }

      if (!observedTranscriptActivityRoot?.isConnected) {
        observedTranscriptActivityRoot = null;
        transcriptActivityObserver?.disconnect();
        transcriptActivityObserver = null;
      }

      if (!observedTopBarRoot?.isConnected) {
        observedTopBarRoot = null;
        topBarObserver?.disconnect();
        topBarObserver = null;
      }

      scanCurrentSidebar();
      observeComposerContextRoot();
      observeTranscriptActivityRoot();
      observeTopBarRoot();
      scheduleTranscriptActivityScan();
      scheduleTopBarUpdate();
      scheduleTitleUpdate();
    });
  }

  function scheduleCooperativeUserscriptRefresh() {
    if (scheduledCooperativeRefreshFrame) {
      return;
    }

    scheduledCooperativeRefreshFrame = requestAnimationFrame(() => {
      scheduledCooperativeRefreshFrame = 0;

      if (!observedSidebarRoot?.isConnected) {
        observedSidebarRoot = null;
      }

      if (!observedComposerContextRoot?.isConnected) {
        observedComposerContextRoot = null;
        composerContextObserver?.disconnect();
        composerContextObserver = null;
      }

      if (!observedTranscriptActivityRoot?.isConnected) {
        observedTranscriptActivityRoot = null;
        transcriptActivityObserver?.disconnect();
        transcriptActivityObserver = null;
      }

      if (!observedTopBarRoot?.isConnected) {
        observedTopBarRoot = null;
        topBarObserver?.disconnect();
        topBarObserver = null;
      }

      scanCurrentSidebar();
      observeComposerContextRoot();
      observeTranscriptActivityRoot();
      observeTopBarRoot();
      scheduleTranscriptActivityScan();
      scheduleTopBarUpdate();
      scheduleTitleUpdate();

      try {
        window.dispatchEvent(new CustomEvent('lody-proper-links:refreshed'));
      } catch {
        // Event dispatch is only for cooperation with other userscripts.
      }
    });
  }

  function installCooperatingUserscriptHooks() {
    for (const eventName of [
      'lody-session-filter:ready',
      'lody-proper-links:refresh-request',
    ]) {
      window.addEventListener(eventName, scheduleCooperativeUserscriptRefresh);
      document.addEventListener(eventName, scheduleCooperativeUserscriptRefresh);
    }

    if (window.__lodySessionSidebarFilter) {
      scheduleCooperativeUserscriptRefresh();
    }
  }

  function installUrlChangeHooks() {
    if (window.__lodyUxUserscriptHistoryHookInstalled) {
      return;
    }

    window.__lodyUxUserscriptHistoryHookInstalled = true;

    for (const methodName of ['pushState', 'replaceState']) {
      const original = history[methodName];

      history[methodName] = function patchedHistoryMethod(...args) {
        const result = original.apply(this, args);
        refreshAfterUrlChange();
        return result;
      };
    }

    window.addEventListener('popstate', refreshAfterUrlChange);
    window.addEventListener('hashchange', refreshAfterUrlChange);
  }

  installCooperatingUserscriptHooks();
  installUrlChangeHooks();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise, { once: true });
  } else {
    initialise();
  }
})();
