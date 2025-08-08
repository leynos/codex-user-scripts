// ==UserScript==
// @name         Codex Ctrl-Enter Code
// @namespace    https://github.com/leynos
// @version      1.0
// @author       Payton McIntosh
// @license      ISC
// @description  Ctrl-Enter on home or tasks page submits "Code"
// @match        https://chatgpt.com/codex
// @match        https://chatgpt.com/codex/
// @match        https://chatgpt.com/codex/tasks*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function findPromptBox() {
        // Use id, fallback to contenteditable ProseMirror
        let box = document.querySelector('div#prompt-textarea[contenteditable="true"]');
        if (!box) {
            // Fallback in case id is dynamic in future
            box = Array.from(document.querySelectorAll('div[contenteditable="true"]'))
                .find(div => div.className.includes('ProseMirror'));
        }
        return box;
    }

    function findCodeButton() {
        // Looks for visible button labelled "Code"
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.find(b =>
            b.textContent?.trim() === 'Code' &&
            b.offsetParent !== null // visible
        );
    }

    // Listen for Ctrl-Enter on the prompt box
    function attachCtrlEnterListener() {
        const box = findPromptBox();
        if (!box) return;
        // Remove duplicate listeners
        if (box._codexListenerAttached) return;
        box._codexListenerAttached = true;

        box.addEventListener('keydown', function (e) {
            if (e.ctrlKey && e.key === 'Enter') {
                const btn = findCodeButton();
                if (btn) {
                    e.preventDefault();
                    btn.click();
                }
            }
        });
    }

    // Keep everything up to date on DOM change (Codex is Reacty)
    function observeDOM() {
        const observer = new MutationObserver(() => {
            // Repeat until found
            attachCtrlEnterListener();
            pinButtons();
        });
        observer.observe(document.body, {childList: true, subtree: true});
        // Initial run
        setTimeout(() => {
            attachCtrlEnterListener();
        }, 800);
    }

    // Re-run if page navigation is dynamic (single page app)
    let lastHref = '';
    setInterval(() => {
        if (window.location.href !== lastHref) {
            lastHref = window.location.href;
            setTimeout(() => {
                attachCtrlEnterListener();
            }, 1000);
        }
    }, 1000);

    // Start script
    observeDOM();

})();
