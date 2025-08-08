// ==UserScript==
// @name         GitHub to Codex Linker
// @namespace    https://github.com/leynos
// @version      1.3.0
// @description  Adds a "Work in Codex" link to GitHub PRs after importing data from a popup.
// @author       Payton McIntosh + Gemini
// @license      ISC
// @match        https://github.com/*/*/pull/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_getResourceText
// @resource     gear_svg https://raw.githubusercontent.com/primer/octicons/main/icons/gear-16.svg
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'codexEnvironments';
    let modalOverlay = null; // We will create the modal once and reuse it.

    // --- Core Logic ---
    function getPrDetails() {
        const branchInfoElement = document.querySelector('span.commit-ref.head-ref');
        const repoNameElement = document.querySelector('meta[name="octolytics-dimension-repository_nwo"]');
        if (branchInfoElement && repoNameElement && branchInfoElement.title) {
            const repoName = repoNameElement.content;
            const branchName = branchInfoElement.title.split(':')[1]?.trim();
            if (repoName && branchName) return { repoName, branchName };
        }
        return null;
    }

    function findEnvironmentId(repoName, storedData) {
        if (storedData && storedData.environments) {
            const foundEnv = storedData.environments.find(env => env.label === repoName);
            return foundEnv ? foundEnv.id : null;
        }
        return null;
    }

    // --- UI Creation & Injection ---

    /**
     * Creates the modal popup for pasting JSON data. It's created once and hidden.
     */
    async function createImporterModal() {
        if (document.getElementById('codex-importer-overlay')) return;

        modalOverlay = document.createElement('div');
        modalOverlay.id = 'codex-importer-overlay';
        modalOverlay.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; visibility: hidden; z-index: 999998;`;

        const pane = document.createElement('div');
        pane.style.cssText = `width: 90vw; max-width: 500px; background: #24292f; color: #e5e5e5; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,.4); font-family: sans-serif; border: 1px solid #6e7781;`;

        const statusEl = document.createElement('div');
        statusEl.style.cssText = 'padding: 0 1rem 0.5rem; height: 1.2em; font-size: 14px;';

        const textarea = document.createElement('textarea');
        textarea.placeholder = 'Paste your environments JSON here...';
        textarea.style.cssText = `width: calc(100% - 2rem); height: 150px; margin: 0 1rem; background: #1f2328; color: #e5e5e5; border: 1px solid #6e7781; border-radius: 6px; padding: 0.5rem; font-family: monospace;`;

        const data = await GM_getValue(STORAGE_KEY, null)
        if (data) {
            textarea.value = JSON.stringify(data, null, '  ');
        }

        pane.innerHTML = `
            <h2 style="font-size: 18px; font-weight: 600; padding: 1rem; margin: 0; border-bottom: 1px solid #424a53;">Link to Codex Environment</h2>
            <p style="font-size: 14px; color: #9e9e9e; padding: 1rem 1rem 0.5rem;">
                First, <a href="https://chatgpt.com/codex/settings/environments" target="_blank" style="color: #58a6ff; text-decoration: underline;">open your environments page</a>, use the "Viewer" script to copy the data, then paste it here.
            </p>
        `;
        pane.appendChild(textarea);
        pane.appendChild(statusEl);

        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 1rem; border-top: 1px solid #424a53; display: flex; justify-content: flex-end;';
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save';
        saveButton.style.cssText = 'padding: 0.5rem 1rem; font-weight: bold; background-color: #238636; color: white; border: 1px solid #369145; border-radius: 5px; cursor: pointer;';
        footer.appendChild(saveButton);
        pane.appendChild(footer);

        modalOverlay.appendChild(pane);
        document.body.appendChild(modalOverlay);

        modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) modalOverlay.style.visibility = 'hidden'; });

        saveButton.addEventListener('click', async () => {
            statusEl.textContent = '';
            try {
                const data = JSON.parse(textarea.value);
                if (!data.environments || !Array.isArray(data.environments)) {
                    throw new Error("Invalid JSON. Expected format: { \"environments\": [...] }");
                }
                await GM_setValue(STORAGE_KEY, data);
                statusEl.textContent = '✅ Saved successfully! Reloading...';
                statusEl.style.color = 'lightgreen';
                setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
                statusEl.textContent = `❌ Error: ${err.message}`;
                statusEl.style.color = 'salmon';
            }
        });
    }

    /**
     * Creates and returns the small gear icon button.
     */
    function createSettingsButton() {
        const span = document.createElement('span');
        span.innerHTML = GM_getResourceText('gear_svg') || '⚙️';
        // span.style.cssText = `background: transparent; border: none; cursor: pointer; padding: 0 0 0 8px; vertical-align: middle;`;
        const svg = span.querySelector('svg')
        svg?.setAttribute('class', 'octicon octicon-gear'); // Ensure GitHub styles apply
        return svg;
    }

    /**
     * Checks storage and injects the appropriate UI into the sidebar.
     */
    async function initialize() {
        if (document.getElementById('codex-sidebar-container')) return; // Already initialized

        const sidebar = document.getElementById('partial-discussion-sidebar');
        if (!sidebar) return;

        await createImporterModal(); // Ensure the modal exists

        const prDetails = getPrDetails();
        const storedData = await GM_getValue(STORAGE_KEY, null);
        const environmentId = prDetails ? findEnvironmentId(prDetails.repoName, storedData) : null;

        const container = document.createElement('div');
        container.id = 'codex-sidebar-container';
        container.className = 'discussion-sidebar-item';

        const headingContainer = document.createElement('div');
        headingContainer.className = 'discussion-sidebar-heading discussion-sidebar-toggle text-bold';
        headingContainer.textContent = 'Codex';
        headingContainer.addEventListener('click', () => {
            if (modalOverlay) modalOverlay.style.visibility = 'visible';
        });

        const settingsButton = createSettingsButton();
        headingContainer.appendChild(settingsButton);
        container.appendChild(headingContainer);

        if (prDetails && environmentId) {
            const encodedPrompt = encodeURIComponent(`I'm working on the pull request titled "${document.querySelector('.js-issue-title').textContent.trim()}". Can you please summarise the changes for me?`);
            const codexUrl = `https://chatgpt.com/codex?environment=${environmentId}&branch=${prDetails.branchName}&prompt=${encodedPrompt}`;
            const link = document.createElement('a');
            link.href = codexUrl;
            link.target = '_blank';
            link.className = 'btn btn-block';
            link.style.cssText = 'background-color: #10a37f; color: white; text-align: center; margin-top: 4px;';
            link.innerHTML = `<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" style="vertical-align: text-bottom; margin-right: 4px;" class="octicon octicon-rocket"><path d="M14.064 0h.186C15.216 0 16 .784 16 1.75v.186a8.752 8.752 0 0 1-2.564 6.186l-.458.459c-.314.314-.641.616-.979.904v3.207c0 .608-.315 1.172-.833 1.49l-2.774 1.707a.749.749 0 0 1-1.11-.418l-.954-3.102a1.214 1.214 0 0 1-.145-.125L3.754 9.816a1.218 1.218 0 0 1-.124-.145L.528 8.717a.749.749 0 0 1-.418-1.11l1.71-2.774A1.748 1.748 0 0 1 3.31 4h3.204c.288-.338.59-.665.904-.979l.459-.458A8.749 8.749 0 0 1 14.064 0ZM8.938 3.623h-.002l-.458.458c-.76.76-1.437 1.598-2.02 2.5l-1.5 2.317 2.143 2.143 2.317-1.5c.902-.583 1.74-1.26 2.499-2.02l.459-.458a7.25 7.25 0 0 0 2.123-5.127V1.75a.25.25 0 0 0-.25-.25h-.186a7.249 7.249 0 0 0-5.125 2.123ZM3.56 14.56c-.732.732-2.334 1.045-3.005 1.148a.234.234 0 0 1-.201-.064.234.234 0 0 1-.064-.201c.103-.671.416-2.273 1.15-3.003a1.502 1.502 0 1 1 2.12 2.12Zm6.94-3.935c-.088.06-.177.118-.266.175l-2.35 1.521.548 1.783 1.949-1.2a.25.25 0 0 0 .119-.213ZM3.678 8.116 5.2 5.766c.058-.09.117-.178.176-.266H3.309a.25.25 0 0 0-.213.119l-1.2 1.95ZM12 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg> Work in Codex`;
            container.appendChild(link);
        } else {
            const promptText = document.createElement('div');
            promptText.textContent = 'Link this PR to a Codex environment by importing your data.';
            promptText.style.cssText = 'font-size: 12px; color: #9e9e9e; margin-top: 4px;';
            container.appendChild(promptText);
        }

        sidebar.prepend(container);
    }

    // --- Boot Sequence ---
    const observer = new MutationObserver(() => {
        if (document.getElementById('partial-discussion-sidebar')) {
            observer.disconnect();
            initialize();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();
