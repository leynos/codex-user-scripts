// ==UserScript==
// @name         GitHub Unresolved Threads Counter
// @namespace    http://tampermonkey.net/
// @version      1.0
// @license      ISC
// @description  Adds a badge with the count of unresolved review threads to the PR header and the global header.
// @author       Payton McIntosh + Gemini
// @match        https://github.com/*/*/pull/*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- Style the badge ---
    // We use GM_addStyle to inject CSS into the page. This is cleaner than inline styles.
    GM_addStyle(`
        .unresolved-threads-badge {
            display: inline-flex;
            align-items: center;
            padding: 2px 8px;
            font-size: 12px;
            font-weight: 500;
            line-height: 1;
            color: #c9d1d9;
            background-color: #30363d;
            border: 1px solid #444c56;
            border-radius: 2em;
            margin-left: 8px;
            transition: all 0.2s ease-in-out;
        }
        .unresolved-threads-badge.has-unresolved {
            color: #f0f6fc;
            background-color: #8957e5; /* A distinct purple */
            border-color: #c9d1d9;
        }
        .unresolved-threads-badge svg {
            margin-right: 4px;
            fill: currentColor;
        }
    `);

    // --- Core Logic ---

    // A debounce function to prevent the update function from running too frequently
    // during rapid DOM changes, which can be inefficient.
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Creates or updates the badge element.
     * @param {number} count - The number of unresolved threads.
     * @returns {HTMLElement} The styled badge element.
     */
    function createBadgeElement(count) {
        const badge = document.createElement('div');
        badge.className = 'unresolved-threads-badge';
        badge.innerHTML = `
            <svg viewBox="0 0 16 16" width="16" height="16" class="octicon octicon-comment-discussion">
                <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2.5v2.043l2.273-2.273A.25.25 0 0 1 9.06 10.5h4.19a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>
            </svg>
            <span>${count} Unresolved</span>
        `;
        if (count > 0) {
            badge.classList.add('has-unresolved');
        }
        return badge;
    }

    /**
     * Finds unresolved threads, creates badges, and places them in the DOM.
     */
    function updateUnresolvedCount() {
        // Selector for all unresolved review thread containers.
        const unresolvedThreads = document.querySelectorAll('details.review-thread-component[data-resolved="false"]');
        const count = unresolvedThreads.length;

        // Define the unique IDs for our badges.
        const stickyBadgeId = 'unresolved-badge-sticky';
        const globalBadgeId = 'unresolved-badge-global';

        // --- Target 1: Sticky Header ---
        const stickyHeaderTarget = document.querySelector('.gh-header-sticky .sticky-content > .d-flex');
        if (stickyHeaderTarget) {
            let existingBadge = document.getElementById(stickyBadgeId);
            if (!existingBadge) {
                existingBadge = createBadgeElement(count);
                existingBadge.id = stickyBadgeId;
                // We use a container to help with flexbox positioning.
                const badgeContainer = document.createElement('div');
                badgeContainer.style.marginLeft = 'auto'; // Push to the right
                badgeContainer.appendChild(existingBadge);
                stickyHeaderTarget.appendChild(badgeContainer);
            }
            // Update existing badge content and style.
            existingBadge.querySelector('span').textContent = `${count} Unresolved`;
            existingBadge.classList.toggle('has-unresolved', count > 0);
        }

        // --- Target 2: Global App Header ---
        const globalHeaderTarget = document.querySelector('.AppHeader-globalBar-end');
        if (globalHeaderTarget) {
            let existingBadge = document.getElementById(globalBadgeId);
            if (!existingBadge) {
                existingBadge = createBadgeElement(count);
                existingBadge.id = globalBadgeId;
                globalHeaderTarget.prepend(existingBadge); // Add as the first item.
            }
            // Update existing badge content and style.
            existingBadge.querySelector('span').textContent = `${count} Unresolved`;
            existingBadge.classList.toggle('has-unresolved', count > 0);
        }
    }

    // --- Observer to handle dynamic page changes ---

    // We create a debounced version of our update function to call from the observer.
    const debouncedUpdate = debounce(updateUnresolvedCount, 250);

    // The MutationObserver will watch for any changes in the PR timeline.
    const observer = new MutationObserver((mutations) => {
        // We don't need to inspect the mutations themselves; any change
        // is a trigger to re-run our count.
        debouncedUpdate();
    });

    // We need to wait for the main content area to be available before observing.
    // A simple interval check is a reliable way to do this.
    const observerInterval = setInterval(() => {
        const discussionContainer = document.getElementById('discussion_bucket');
        if (discussionContainer) {
            clearInterval(observerInterval);
            // Start observing the target node for configured mutations.
            observer.observe(discussionContainer, {
                childList: true, // observe direct children additions/removals
                subtree: true,   // observe all descendants
                attributes: true, // observe attribute changes (like data-resolved)
                attributeFilter: ['data-resolved'] // only care about this specific attribute
            });
            // Run once on initial load.
            updateUnresolvedCount();
        }
    }, 500);

})();
