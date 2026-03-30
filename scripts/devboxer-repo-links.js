// ==UserScript==
// @name         DevBoxer task links: local project paths to GitHub branch blobs
// @namespace    https://github.com/leynos/
// @version      0.1.0
// @description  Rewrite DevBoxer task-page links from /home/user/project/... to the corresponding file in the task branch on GitHub.
// @author       Payton's friendly neighbourhood gremlin (GPT-5.4)
// @license      ISC
// @match        https://www.devboxer.com/task/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const LOCAL_PREFIX = '/home/user/project/';
  const GITHUB_HOST = 'github.com';
  const SEEN_ATTR = 'data-df12-devboxer-link-rewritten';

  function normaliseUrl(input, base = window.location.href) {
    try {
      return new URL(input, base);
    } catch {
      return null;
    }
  }

  function trimTrailingSlash(value) {
    return value.replace(/\/+$/, '');
  }

  function extractBranchAndRepoFromGithubUrl(urlLike) {
    const url = normaliseUrl(urlLike);
    if (!url || url.hostname !== GITHUB_HOST) {
      return null;
    }

    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 4) {
      return null;
    }

    const [owner, repo, mode, ...rest] = parts;
    if (!owner || !repo) {
      return null;
    }

    if (mode !== 'tree' && mode !== 'blob') {
      return null;
    }

    const branch = rest.shift();
    if (!branch) {
      return null;
    }

    return {
      owner,
      repo,
      branch,
      mode,
      pathRemainder: rest,
      href: url.href,
    };
  }

  function scoreGithubCandidate(candidate) {
    let score = 0;

    if (candidate.mode === 'tree') {
      score += 5;
    }

    if (candidate.branch && candidate.branch !== 'main' && candidate.branch !== 'master') {
      score += 10;
    }

    if (candidate.pathRemainder.length > 0) {
      score += 2;
    }

    return score;
  }

  function findGithubContext() {
    const githubAnchors = Array.from(document.querySelectorAll('a[href*="github.com/"]'));
    const candidates = githubAnchors
      .map((anchor) => extractBranchAndRepoFromGithubUrl(anchor.href))
      .filter(Boolean);

    if (candidates.length === 0) {
      return null;
    }

    candidates.sort((left, right) => scoreGithubCandidate(right) - scoreGithubCandidate(left));
    const best = candidates[0];

    return {
      owner: best.owner,
      repo: best.repo,
      branch: best.branch,
    };
  }

  function extractProjectRelativePath(urlLike) {
    const url = normaliseUrl(urlLike);
    if (!url) {
      return null;
    }

    if (!url.pathname.startsWith(LOCAL_PREFIX)) {
      return null;
    }

    const relativePath = url.pathname.slice(LOCAL_PREFIX.length);
    return relativePath.length > 0 ? relativePath : null;
  }

  function buildGithubBlobUrl(context, relativePath) {
    const encodedSegments = relativePath
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment));

    return `https://${GITHUB_HOST}/${context.owner}/${context.repo}/blob/${encodeURIComponent(context.branch)}/${encodedSegments.join('/')}`;
  }

  function rewriteAnchor(anchor, context) {
    if (!(anchor instanceof HTMLAnchorElement)) {
      return false;
    }

    if (anchor.getAttribute(SEEN_ATTR) === 'true') {
      return false;
    }

    const relativePath = extractProjectRelativePath(anchor.href);
    if (!relativePath) {
      return false;
    }

    const githubUrl = buildGithubBlobUrl(context, relativePath);

    anchor.href = githubUrl;
    anchor.title = `Open ${relativePath} on GitHub (${context.owner}/${context.repo}@${context.branch})`;
    anchor.setAttribute(SEEN_ATTR, 'true');

    if (!anchor.target) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }

    return true;
  }

  function rewriteAllLinks(root = document) {
    const context = findGithubContext();
    if (!context) {
      return 0;
    }

    const anchors = Array.from(root.querySelectorAll('a[href]'));
    let rewritten = 0;

    for (const anchor of anchors) {
      if (rewriteAnchor(anchor, context)) {
        rewritten += 1;
      }
    }

    return rewritten;
  }

  let observer = null;
  let scheduled = false;

  function scheduleRewrite() {
    if (scheduled) {
      return;
    }

    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      rewriteAllLinks(document);
    });
  }

  function installObserver() {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          scheduleRewrite();
          return;
        }

        if (mutation.type === 'attributes' && mutation.target instanceof HTMLAnchorElement) {
          scheduleRewrite();
          return;
        }
      }
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['href'],
    });
  }

  function patchHistoryMethod(methodName) {
    const original = history[methodName];
    if (typeof original !== 'function') {
      return;
    }

    history[methodName] = function patchedHistoryMethod(...args) {
      const result = original.apply(this, args);
      scheduleRewrite();
      return result;
    };
  }

  function main() {
    rewriteAllLinks(document);
    installObserver();
    patchHistoryMethod('pushState');
    patchHistoryMethod('replaceState');
    window.addEventListener('popstate', scheduleRewrite, { passive: true });
  }

  main();
})();
