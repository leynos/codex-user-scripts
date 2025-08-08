// ==UserScript==
// @name         Codex Environment Viewer (with auto-unload)
// @namespace    https://github.com/leynos
// @version      1.9.0
// @author       Payton McIntosh + Gemini + o3 + GPT-5
// @license      ISC
// @description  Capture, save, and view your Codex environments. Auto-loads/unloads with SPA navigation.
// @match        https://chatgpt.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    const TARGET_PATH = '/codex/settings/environments';
    const URL_REGEX = /wham\/environments\/with-creators/;
    const STORAGE_KEY = 'codexEnvironments';

    let lastPayload = null;
    let uiElements = {};
    let originalFetch = null;
    let cleanupFn = null;

    // --- Payload Processing ---
    function processPayload(responseText) {
        try {
            const data = JSON.parse(responseText);
            if (data && Array.isArray(data.items)) {
                if (data.items.length === 0) return { message: "API returned an empty list of environments." };
                const environments = data.items.map(({ id, label }) => ({ id, label }));
                return { environments };
            }
            return { error: "Unexpected JSON structure", data: JSON.stringify(data, null, 2) };
        } catch (err) {
            console.error('[Viewer] Failed to process payload:', err);
            return { error: `Failed to parse JSON: ${err.message}`, originalText: responseText };
        }
    }

    async function saveAndRefresh(payload) {
        if (!payload) return;
        lastPayload = payload;
        if (payload.environments) {
            await GM_setValue(STORAGE_KEY, payload);
            console.log('[Viewer] Attempted to save environments to storage.');
        }
        renderPopupContent();
    }

    // --- UI Rendering ---
    function renderPopupContent() {
        const { tileContainer, copyAllButton } = uiElements;
        if (!tileContainer) return;
        tileContainer.innerHTML = '';

        copyAllButton.disabled = !(lastPayload && lastPayload.environments);

        if (lastPayload && lastPayload.environments) {
            lastPayload.environments.forEach(env => {
                const tile = document.createElement('div');
                tile.className = 'vm-env-tile';
                tile.textContent = env.label;
                tile.title = `ID: ${env.id}\n(Click to copy)`;

                tile.addEventListener('click', () => {
                    navigator.clipboard.writeText(env.id).then(() => {
                        tile.textContent = 'Copied ID!';
                        setTimeout(() => { tile.textContent = env.label; }, 1000);
                    });
                });
                tileContainer.appendChild(tile);
            });
        } else {
            const messageEl = document.createElement('p');
            let messageText = 'No environments captured yet. They should appear here automatically.';
            if (lastPayload && lastPayload.error) {
                console.error('[Viewer] Error during processing:', lastPayload);
                messageText = "An error occurred. Check the console for details.";
            } else if (lastPayload && lastPayload.message) {
                messageText = lastPayload.message;
            }
            messageEl.textContent = messageText;
            messageEl.style.cssText = 'color: #9e9e9e; text-align: center; padding: 1rem;';
            tileContainer.appendChild(messageEl);
        }
    }

    function createUI() {
        const styles = `
            .vm-env-tile {
                background: #2a2a2e; color: #e5e5e5; padding: 0.75rem 1rem;
                border-radius: 6px; font-size: 14px; cursor: pointer;
                transition: background-color 0.2s;
            }
            .vm-env-tile:hover { background-color: #3c3c41; }
        `;
        const styleSheet = document.createElement("style");
        styleSheet.innerText = styles;

        const btn = document.createElement('button');
        const overlay = document.createElement('div');
        const pane = document.createElement('div');
        const title = document.createElement('h2');
        const tileContainer = document.createElement('div');
        const footer = document.createElement('div');
        const copyAllButton = document.createElement('button');

        btn.textContent = '🚀 View Environments';
        btn.style.cssText = `position: fixed; right: 1rem; bottom: 1rem; padding: .5rem .75rem; font: bold 14px/1.2 sans-serif; background: #10a37f; color: #fff; border: none; border-radius: 6px; cursor: pointer; z-index: 999999; box-shadow: 0 2px 8px rgba(0,0,0,.3);`;

        overlay.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,.45); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; visibility: hidden; z-index: 999998;`;

        pane.style.cssText = `width: 90vw; max-width: 400px; max-height: 75vh; display: flex; flex-direction: column; background: #1e1e1e; color: #dcdcdc; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,.4); font-family: sans-serif;`;

        title.textContent = 'Your Codex Environments';
        title.style.cssText = 'font-size: 18px; font-weight: 600; padding: 1rem; margin: 0; border-bottom: 1px solid #333;';

        tileContainer.style.cssText = `flex-grow: 1; overflow-y: auto; padding: 1rem; display: grid; grid-template-columns: 1fr; gap: 0.5rem;`;

        footer.style.cssText = 'padding: 0.75rem 1rem; border-top: 1px solid #333;';

        copyAllButton.textContent = 'Copy All for GitHub';
        copyAllButton.style.cssText = 'width: 100%; padding: 0.5rem; font-weight: bold; background-color: #0052cc; color: white; border: none; border-radius: 5px; cursor: pointer;';
        copyAllButton.disabled = true;

        copyAllButton.addEventListener('click', () => {
            if (lastPayload && lastPayload.environments) {
                const jsonBlob = JSON.stringify(lastPayload, null, 2);
                navigator.clipboard.writeText(jsonBlob).then(() => {
                    copyAllButton.textContent = 'Copied!';
                    setTimeout(() => { copyAllButton.textContent = 'Copy All for GitHub'; }, 2000);
                });
            }
        });

        footer.appendChild(copyAllButton);
        pane.append(title, tileContainer, footer);
        overlay.appendChild(pane);

        document.body.append(btn, overlay);
        document.head.appendChild(styleSheet);

        btn.addEventListener('click', () => {
            renderPopupContent();
            overlay.style.visibility = 'visible';
        });
        overlay.addEventListener('click', e => {
            if (e.target === overlay) overlay.style.visibility = 'hidden';
        });

        uiElements = { btn, overlay, pane, tileContainer, copyAllButton, styleSheet };
    }

    // --- Fetch Patching ---
    function patchFetch() {
        originalFetch = unsafeWindow.fetch;
        unsafeWindow.fetch = async function (input, init = {}) {
            const url = typeof input === 'string' ? input : input.url;
            const resp = await originalFetch.call(this, input, init);
            if (URL_REGEX.test(url)) {
                console.log(`[Viewer] Matched URL: ${url}`);
                const responseText = await resp.clone().text();
                saveAndRefresh(processPayload(responseText));
            }
            return resp;
        };
    }

    function unpatchFetch() {
        if (originalFetch) {
            unsafeWindow.fetch = originalFetch;
            originalFetch = null;
        }
    }

    // --- Load/Unload ---
    async function loadViewer() {
        console.log('[Viewer] Loading…');
        lastPayload = await GM_getValue(STORAGE_KEY, null);
        if (lastPayload) console.log('[Viewer] Loaded initial environments from storage.');
        createUI();
        patchFetch();

        cleanupFn = () => {
            console.log('[Viewer] Unloading…');
            unpatchFetch();
            Object.values(uiElements).forEach(el => el?.remove?.());
            uiElements = {};
        };
    }

    function unloadViewer() {
        if (cleanupFn) {
            cleanupFn();
            cleanupFn = null;
        }
    }

    // --- Navigation Watcher ---
    function watchNavigation(onChange) {
        const wrapped = (fn) => function () {
            const result = fn.apply(this, arguments);
            onChange();
            return result;
        };
        history.pushState = wrapped(history.pushState);
        history.replaceState = wrapped(history.replaceState);
        window.addEventListener('popstate', onChange);
    }

    function handleNavigation() {
        if (location.pathname.startsWith(TARGET_PATH)) {
            if (!cleanupFn) loadViewer();
        } else {
            unloadViewer();
        }
    }

    // Init
    watchNavigation(handleNavigation);
    handleNavigation();

})();
