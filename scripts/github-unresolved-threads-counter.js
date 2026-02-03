// ==UserScript==
// @name         GitHub PR Counters (Unresolved & Outdated)
// @namespace    http://github.com/leynos
// @version      1.4
// @license      ISC
// @description  Adds badges with the count of unresolved and outdated review threads to the PR header and the global header. Adds keyboard shortcuts 'n'/'N' to navigate them, and automatically loads hidden comments.
// @author       Payton McIntosh + Gemini
// @match        https://github.com/*/*/pull/*
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // --- Style the badges ---
    // We use GM_addStyle to inject CSS into the page.
    GM_addStyle(`
        .gm-badge {
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
        .gm-badge svg {
            margin-right: 4px;
            fill: currentColor;
        }
        .unresolved-threads-badge.has-unresolved {
            color: #f0f6fc;
            background-color: #8957e5; /* A distinct purple */
            border-color: #c9d1d9;
        }
        .outdated-threads-badge.has-outdated {
            color: #f0f6fc;
            background-color: #d29922; /* A warning yellow/orange */
            border-color: #c9d1d9;
        }
        #gm-badge-container-sticky { order: 10; }
    `);

    // --- Icon Definitions ---
    const UNRESOLVED_ICON_SVG = `
        <svg viewBox="0 0 16 16" width="16" height="16" class="octicon octicon-comment-discussion">
            <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2.5v2.043l2.273-2.273A.25.25 0 0 1 9.06 10.5h4.19a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>
        </svg>
    `;
    const OUTDATED_ICON_SVG = `
        <svg viewBox="0 0 16 16" width="16" height="16" class="octicon octicon-alert">
            <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path>
        </svg>
    `;


    // --- Core Logic ---

    /**
     * A debounce function to prevent the update function from running too frequently
     * during rapid DOM changes, which can be inefficient.
     */
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
    * Finds or creates a badge element within a target container and updates its content.
    * @param {HTMLElement} targetContainer - The parent element for the badge.
    * @param {string} id - The unique ID for the badge.
    * @param {number} count - The count to display.
    * @param {string} label - The text label for the badge (e.g., "Unresolved").
    * @param {string} iconSvg - The SVG string for the badge's icon.
    * @param {string} baseClass - The base CSS class for the badge.
    * @param {string} activeClass - The CSS class to add when count > 0.
    * @param {string|null} href - The anchor link for the badge.
    * @param {boolean} prepend - Whether to prepend the badge to the container.
    */
    function createOrUpdateBadge(targetContainer, id, count, label, iconSvg, baseClass, activeClass, href, prepend = false) {
        let badge = document.getElementById(id);
        if (!badge) {
            badge = document.createElement('a');
            badge.id = id;
            badge.className = `gm-badge ${baseClass}`;
            badge.style.textDecoration = 'none';
            if (prepend) {
                targetContainer.prepend(badge);
            } else {
                targetContainer.appendChild(badge);
            }
        }
        badge.href = count > 0 ? href : '#';
        badge.style.pointerEvents = count > 0 ? 'auto' : 'none';
        badge.innerHTML = `${iconSvg}<span>${count} ${label}</span>`;
        badge.classList.toggle(activeClass, count > 0);
    }


    /**
     * Finds unresolved and outdated threads, creates badges, and places them in the DOM.
     */
    function updateCounters() {
        // --- Find Threads ---
        const unresolvedThreads = document.querySelectorAll('details.review-thread-component[data-resolved="false"]');
        const outdatedLabels = Array.from(document.querySelectorAll('details.review-thread-component .Label--warning'))
                                   .filter(label => label.textContent.trim() === 'Outdated');
        const outdatedThreads = outdatedLabels.map(label => label.closest('details.review-thread-component'));

        // --- Calculate Counts ---
        const unresolvedCount = unresolvedThreads.length;
        const outdatedCount = outdatedThreads.length;

        // --- Get First Element Links ---
        const firstUnresolvedHref = unresolvedThreads.length > 0 ?
                                    unresolvedThreads[0].querySelector('a.js-timestamp')?.getAttribute('href') : '#';
        const firstOutdatedHref = outdatedThreads.length > 0 ?
                                  outdatedThreads[0].querySelector('a.js-timestamp')?.getAttribute('href') : '#';


        // --- Target 1: Sticky Header ---
        const stickyHeaderTarget = document.querySelector('header .color-shadow-small [data-component="TitleArea"]');
        console.log(stickyHeaderTarget);
        if (stickyHeaderTarget) {
            let badgeContainer = document.getElementById('gm-badge-container-sticky');
            if (!badgeContainer) {
                badgeContainer = document.createElement('div');
                badgeContainer.id = 'gm-badge-container-sticky';
                badgeContainer.style.marginLeft = 'auto'; // Push to the right
                badgeContainer.style.display = 'flex';
                stickyHeaderTarget.appendChild(badgeContainer);
            }
            createOrUpdateBadge(badgeContainer, 'unresolved-badge-sticky', unresolvedCount, 'Unresolved', UNRESOLVED_ICON_SVG, 'unresolved-threads-badge', 'has-unresolved', firstUnresolvedHref, false);
            createOrUpdateBadge(badgeContainer, 'outdated-badge-sticky', outdatedCount, 'Outdated', OUTDATED_ICON_SVG, 'outdated-threads-badge', 'has-outdated', firstOutdatedHref, false);
        }


        // --- Target 2: Global App Header ---
        const globalHeaderTarget = document.querySelector('.header-wrapper  header nav[aria-label="Repository"]');
        console.log(globalHeaderTarget);
        if (globalHeaderTarget) {
            createOrUpdateBadge(globalHeaderTarget, 'unresolved-badge-global', unresolvedCount, 'Unresolved', UNRESOLVED_ICON_SVG, 'unresolved-threads-badge', 'has-unresolved', firstUnresolvedHref, false);
            createOrUpdateBadge(globalHeaderTarget, 'outdated-badge-global', outdatedCount, 'Outdated', OUTDATED_ICON_SVG, 'outdated-threads-badge', 'has-outdated', firstOutdatedHref, false);
        }
    }

    // --- Auto-loader for hidden comments ---

    /**
     * Finds and clicks any "Load more..." buttons for hidden conversations.
     */
    function autoClickLoadMore() {
        const loadMoreForms = document.querySelectorAll('form.js-review-hidden-comment-ids');
        loadMoreForms.forEach(form => {
            const button = form.querySelector('button.ajax-pagination-btn:not([data-gm-clicked])');
            if (button) {
                console.log('GitHub PR Counters: Found and clicking "Load more..." button.');
                button.setAttribute('data-gm-clicked', 'true'); // Prevent re-clicking
                button.click();
            }
        });
    }

    // --- Keyboard Navigation ---

    /**
     * Scrolls to the next element in a list from the current viewport position.
     * Loops back to the beginning if the end is reached.
     * @param {NodeListOf<Element> | Element[]} elements - A list of elements to cycle through.
     */
    function scrollToNext(elements) {
        if (elements.length === 0) return;

        const elementsArray = Array.from(elements);
        let currentIndex = -1;

        // Find the index of the last element that is at or scrolled past the top of the viewport.
        // This is considered our "current" position. We use a small tolerance (1px).
        for (let i = 0; i < elementsArray.length; i++) {
            if (elementsArray[i].getBoundingClientRect().top <= 1) {
                currentIndex = i;
            } else {
                // The first element entirely below the top marks the end of our search.
                break;
            }
        }

        // The next element is the one after the current one.
        // We use the modulo operator to loop back to the start if we're at the end.
        const nextIndex = (currentIndex + 1) % elementsArray.length;
        const nextElement = elementsArray[nextIndex];

        if (nextElement) {
            nextElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    document.addEventListener('keydown', (event) => {
        // Ignore key presses if the user is focused on an input, textarea, etc.
        const target = event.target;
        if (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
            return;
        }

        if (event.key === 'n') {
            event.preventDefault(); // Prevent default browser action for the key press.

            if (event.shiftKey) { // 'N' - for next outdated
                const outdatedLabels = Array.from(document.querySelectorAll('details.review-thread-component .Label--warning'))
                                           .filter(label => label.textContent.trim() === 'Outdated');
                const outdatedThreads = outdatedLabels.map(label => label.closest('details.review-thread-component')).filter(Boolean);
                scrollToNext(outdatedThreads);
            } else { // 'n' - for next unresolved
                const unresolvedThreads = document.querySelectorAll('details.review-thread-component[data-resolved="false"]');
                scrollToNext(unresolvedThreads);
            }
        }
    });

    // --- Observer to handle dynamic page changes ---

    // Main handler for DOM changes, debounced for efficiency.
    const onDomChange = debounce(() => {
        autoClickLoadMore(); // Always check for hidden items first.
        updateCounters();    // Then, update the counts.
    }, 250);

    const observer = new MutationObserver(onDomChange);

    const observerInterval = setInterval(() => {
        const discussionContainer = document.getElementById('diff-comparison-viewer-container');
        if (discussionContainer) {
            clearInterval(observerInterval);
            observer.observe(discussionContainer, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-resolved', 'class'] // Watch for resolve changes and class changes (for the 'Outdated' label)
            });
            // Run once on initial load.
            onDomChange();
        }
    }, 500);

    console.log(observerInterval);

})();
