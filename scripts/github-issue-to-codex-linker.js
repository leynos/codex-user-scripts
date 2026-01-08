// ==UserScript==
// @name         GitHub Issue to Codex
// @namespace    https://github.com/leynos
// @version      1.6.0
// @description  Converts a GitHub issue to Markdown and creates a new task in Codex.
// @author       Payton McIntosh + Gemini
// @license      ISC
// @match        https://github.com/*/*/issues/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_getResourceText
// @resource     gear_svg https://raw.githubusercontent.com/primer/octicons/main/icons/gear-16.svg
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'codexEnvironments';
    let settingsModalOverlay = null;
    let codexModalOverlay = null;
    let isInitializing = false; // Flag to prevent race conditions

    // --- Markdown Conversion Logic ---
    function convertToMarkdown(element) {
        if (!element) return '';
        let markdown = '';

        function processNode(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) {
                return '';
            }

            const tagName = node.tagName.toLowerCase();
            let content = '';

            for (const child of node.childNodes) {
                content += processNode(child);
            }

            switch (tagName) {
                case 'h1': return `# ${content.trim()}\n\n`;
                case 'h2': return `## ${content.trim()}\n\n`;
                case 'h3': return `### ${content.trim()}\n\n`;
                case 'h4': return `#### ${content.trim()}\n\n`;
                case 'p': return `${content.trim()}\n\n`;
                case 'strong': case 'b': return `**${content}**`;
                case 'em': case 'i': return `*${content}*`;
                case 'ul': return `${content}\n`;
                case 'ol': return `${content}\n`;
                case 'table': return `\n${content.trim()}\n\n`;
                case 'thead': return content;
                case 'tbody': return content;
                case 'tr': {
                    // Re-process children to build table row with pipes
                    const cells = [];
                    node.childNodes.forEach(child => {
                        if (child.nodeType === Node.ELEMENT_NODE && (child.tagName.toLowerCase() === 'td' || child.tagName.toLowerCase() === 'th')) {
                            cells.push(processNode(child).trim());
                        }
                    });

                    if (cells.length === 0) return '';

                    let rowMarkdown = `| ${cells.join(' | ')} |\n`;

                    // Add separator if parent is thead
                    if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'thead') {
                        const separators = cells.map(() => '---');
                        rowMarkdown += `| ${separators.join(' | ')} |\n`;
                    }

                    return rowMarkdown;
                }
                case 'div': {
                    // Handle React/CodeRabbit task list items
                    // These are divs that look like: <div class="TaskListItem-module__checkbox-items...">
                    if (node.className && typeof node.className === 'string' && node.className.includes('TaskListItem-module__checkbox-items')) {
                        const checkbox = node.querySelector('input[type="checkbox"]');
                        // Check standard checked property or aria-checked for React-managed lists
                        const isChecked = checkbox ? (checkbox.checked || checkbox.getAttribute('aria-checked') === 'true') : false;
                        return `- [${isChecked ? 'x' : ' '}] ${content.trim()}\n`;
                    }
                    return content;
                }
                case 'li': {
                    // Check for React task list container (wraps multiple items)
                    // If this LI contains the DragAndDropContainer, it's just a wrapper, not an item itself.
                    if (node.querySelector('div[class*="DragAndDropContainer"]')) {
                         return content;
                    }

                    const checkbox = node.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        // Check standard checked property or aria-checked for React-managed lists
                        const isChecked = checkbox.checked || checkbox.getAttribute('aria-checked') === 'true';
                        return `- [${isChecked ? 'x' : ' '}] ${content.trim()}\n`;
                    }
                    return `- ${content.trim()}\n`;
                }
                case 'blockquote': return `> ${content.trim().replace(/\n/g, '\n> ')}\n\n`;
                case 'code':
                    if (node.parentElement.tagName.toLowerCase() === 'pre') {
                        return content;
                    }
                    return `\`${content}\``;
                case 'pre': {
                    const lang = node.querySelector('code')?.dataset.lang || '';
                    return `\`\`\`${lang}\n${content.trim()}\n\`\`\`\n\n`;
                }
                case 'a': {
                    const href = node.getAttribute('href');
                    return `[${content}](${href})`;
                }
                case 'br': return '\n';
                case 'hr': return '---\n\n';
                case 'td': case 'th': return content; // Fallback if not inside tr loop
                default: return content;
            }
        }

        // Clone the element to avoid modifying the live page
        const elementClone = element.cloneNode(true);

        // Remove elements we don't want to export by selector
        elementClone.querySelectorAll(
            '.zeroclipboard-container, ' +
            'details, ' +
            '[class*="TaskListItem-module__drag-drop-container"], ' +
            '[class*="TaskListItem-module__TaskListItemActionsContainer"], ' +
            '[id^="DndDescribedBy"], ' +
            '[id^="DndLiveRegion"], ' +
            '.js-render-enrichment-loader, ' + // Traycer "Loading" text
            '.js-render-enrichment-target'      // Traycer rendered graph (keep fallback source)
        ).forEach(el => el.remove());

        // Remove specific "For best results..." alert boxes based on content
        elementClone.querySelectorAll('div.markdown-alert.markdown-alert-tip').forEach(tip => {
            if (tip.textContent.includes("For best results, initiate chat on the files or code changes.")) {
                tip.remove();
            }
        });

        // Remove Traycer "Import In IDE" section
        elementClone.querySelectorAll('h2').forEach(h2 => {
            if (h2.textContent.trim() === 'Import In IDE') {
                // Remove the h2 and the paragraph immediately following it (which contains the links)
                const next = h2.nextElementSibling;
                if (next && next.tagName.toLowerCase() === 'p') {
                    next.remove();
                }
                h2.remove();
            }
        });

        markdown = processNode(elementClone);

        // Final cleanup
        return markdown.replace(/\n{3,}/g, '\n\n').trim();
    }


    // --- Codex Integration Logic ---
    function getRepoName() {
        const repoNameElement = document.querySelector('meta[name="octolytics-dimension-repository_nwo"]');
        return repoNameElement ? repoNameElement.content : null;
    }

    function findEnvironmentId(repoName, storedData) {
        if (storedData && storedData.environments) {
            return storedData.environments.find(env => env.label === repoName)?.id || null;
        }
        return null;
    }

    // --- UI Creation & Injection ---

    async function createCodexModal(markdownContent) {
        if (document.getElementById('codex-issue-modal-overlay')) {
            document.getElementById('codex-issue-modal-overlay').remove();
        }

        // Pre-check environment
        const repoName = getRepoName();
        const storedData = await GM_getValue(STORAGE_KEY, null);
        const environmentId = repoName ? findEnvironmentId(repoName, storedData) : null;

        codexModalOverlay = document.createElement('div');
        codexModalOverlay.id = 'codex-issue-modal-overlay';
        codexModalOverlay.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 999999;`;

        const pane = document.createElement('div');
        pane.style.cssText = `width: 90vw; max-width: 800px; background: #24292f; color: #e5e5e5; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,.4); font-family: sans-serif; border: 1px solid #6e7781; display: flex; flex-direction: column; height: 80vh; max-height: 90vh;`;

        const statusEl = document.createElement('div');
        statusEl.style.cssText = 'padding: 0 1rem 0.5rem; height: 1.2em; font-size: 14px;';

        const textarea = document.createElement('textarea');
        textarea.value = markdownContent;
        textarea.style.cssText = `flex-grow: 1; width: calc(100% - 2rem); margin: 1rem; background: #1f2328; color: #e5e5e5; border: 1px solid #6e7781; border-radius: 6px; padding: 0.5rem; font-family: monospace; resize: vertical;`;

        pane.innerHTML = `<h2 style="font-size: 18px; font-weight: 600; padding: 1rem; margin: 0; border-bottom: 1px solid #424a53;">Create Codex Task</h2>`;
        pane.appendChild(textarea);
        pane.appendChild(statusEl);

        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 1rem; border-top: 1px solid #424a53; display: flex; justify-content: flex-end; gap: 8px;';

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.cssText = 'padding: 0.5rem 1rem; font-weight: bold; background-color: #32383f; color: white; border: 1px solid #6e7781; border-radius: 5px; cursor: pointer;';

        const createTaskButton = document.createElement('button');
        createTaskButton.textContent = 'Create Task';
        createTaskButton.style.cssText = 'padding: 0.5rem 1rem; font-weight: bold; background-color: #238636; color: white; border: 1px solid #369145; border-radius: 5px; cursor: pointer;';

        // Check environment state immediately for UI
        if (!environmentId) {
            createTaskButton.disabled = true;
            createTaskButton.style.opacity = '0.5';
            createTaskButton.style.cursor = 'not-allowed';
            createTaskButton.title = "Link repository to Codex environment first";

            // Show warning
            statusEl.innerHTML = `⚠️ Environment for "${repoName}" not found. Please <a href="#" id="codex-reconfigure-link" style="color: #58a6ff;">configure your environments</a>.`;
            statusEl.style.color = '#e3b341'; // Warning yellow

            // Defer listener attachment slightly to ensure element is in DOM
            setTimeout(() => {
                const link = document.getElementById('codex-reconfigure-link');
                if (link) {
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        closeModal();
                        if (settingsModalOverlay) settingsModalOverlay.style.visibility = 'visible';
                    });
                }
            }, 0);
        }

        footer.appendChild(cancelButton);
        footer.appendChild(createTaskButton);
        pane.appendChild(footer);

        codexModalOverlay.appendChild(pane);
        document.body.appendChild(codexModalOverlay);

        const closeModal = () => codexModalOverlay.remove();
        codexModalOverlay.addEventListener('click', e => { if (e.target === codexModalOverlay) closeModal(); });
        cancelButton.addEventListener('click', closeModal);

        createTaskButton.addEventListener('click', async () => {
            if (createTaskButton.disabled) return;

            statusEl.textContent = '';
            if (!repoName) {
                statusEl.textContent = '❌ Could not determine repository name.';
                statusEl.style.color = 'salmon';
                return;
            }

            // Re-check just in case, though button should be disabled
            if (!environmentId) {
                return;
            }

            const finalMarkdown = textarea.value;
            const encodedPrompt = encodeURIComponent(finalMarkdown);
            const codexUrl = `https://chatgpt.com/codex?environment=${environmentId}&branch=main&prompt=${encodedPrompt}`;

            window.open(codexUrl, '_blank');
            closeModal();
        });
    }

    async function createSettingsModal() {
        if (document.getElementById('codex-importer-overlay')) return;

        settingsModalOverlay = document.createElement('div');
        settingsModalOverlay.id = 'codex-importer-overlay';
        settingsModalOverlay.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; visibility: hidden; z-index: 999998;`;

        const pane = document.createElement('div');
        pane.style.cssText = `width: 90vw; max-width: 500px; background: #24292f; color: #e5e5e5; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,.4); font-family: sans-serif; border: 1px solid #6e7781;`;

        const statusEl = document.createElement('div');
        statusEl.style.cssText = 'padding: 0 1rem 0.5rem; height: 1.2em; font-size: 14px;';

        const textarea = document.createElement('textarea');
        textarea.placeholder = 'Paste your environments JSON here...';
        textarea.style.cssText = `width: calc(100% - 2rem); height: 150px; margin: 1rem; background: #1f2328; color: #e5e5e5; border: 1px solid #6e7781; border-radius: 6px; padding: 0.5rem; font-family: monospace;`;

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

        settingsModalOverlay.appendChild(pane);
        document.body.appendChild(settingsModalOverlay);

        settingsModalOverlay.addEventListener('click', e => { if (e.target === settingsModalOverlay) settingsModalOverlay.style.visibility = 'hidden'; });

        saveButton.addEventListener('click', async () => {
            statusEl.textContent = '';
            try {
                const dataToSave = JSON.parse(textarea.value);
                if (!dataToSave.environments || !Array.isArray(dataToSave.environments)) {
                    throw new Error("Invalid JSON. Expected format: { \"environments\": [...] }");
                }
                await GM_setValue(STORAGE_KEY, dataToSave);
                statusEl.textContent = '✅ Saved successfully! Reloading...';
                statusEl.style.color = 'lightgreen';
                setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
                statusEl.textContent = `❌ Error: ${err.message}`;
                statusEl.style.color = 'salmon';
            }
        });
    }

    async function handleCreateTaskClick() {
        // 1. Scrape content
        let markdownParts = [];
        const markdownBodies = document.querySelectorAll('[data-testid="markdown-body"]');
        markdownBodies.forEach(body => {
            markdownParts.push(convertToMarkdown(body));
        });
        let fullMarkdown = markdownParts.join('\n\n---\n\n');

        // 2. Remove first heading of any level.
        fullMarkdown = fullMarkdown.replace(/^#+ .+\r?\n(\r?\n)?/, '');

        // 3. Append issue URL.
        fullMarkdown += `\n\n---\n\nIssue: ${window.location.href}`;

        // 4. Show modal.
        createCodexModal(fullMarkdown.trim());
    }

    async function initialize() {
        if (isInitializing || document.getElementById('codex-sidebar-container')) return;

        isInitializing = true;

        const sidebar = document.querySelector('[class^="IssueSidebar-module__"]');
        if (!sidebar) {
            isInitializing = false;
            return;
        }

        await createSettingsModal();

        const repoName = getRepoName();

        const container = document.createElement('div');
        container.id = 'codex-sidebar-container';
        container.className = 'discussion-sidebar-item';

        const headingContainer = document.createElement('div');
        headingContainer.className = 'discussion-sidebar-heading discussion-sidebar-toggle text-bold';
        headingContainer.textContent = 'Codex';
        headingContainer.style.cursor = 'pointer';
        headingContainer.addEventListener('click', () => {
            if (settingsModalOverlay) settingsModalOverlay.style.visibility = 'visible';
        });

        const settingsButton = document.createElement('span');
        settingsButton.innerHTML = GM_getResourceText('gear_svg') || '⚙️';
        const svg = settingsButton.querySelector('svg');
        if (svg) {
            svg.setAttribute('class', 'octicon octicon-gear');
            svg.style.marginLeft = '8px';
        }
        headingContainer.appendChild(settingsButton);
        container.appendChild(headingContainer);

        if (repoName) {
            const button = document.createElement('button');
            button.className = 'btn btn-block';
            button.style.cssText = 'background-color: #10a37f; color: white; text-align: center; margin-top: 4px;';
            button.innerHTML = `<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" style="vertical-align: text-bottom; margin-right: 4px;" class="octicon octicon-rocket"><path d="M14.064 0h.186C15.216 0 16 .784 16 1.75v.186a8.752 8.752 0 0 1-2.564 6.186l-.458.459c-.314.314-.641.616-.979.904v3.207c0 .608-.315 1.172-.833 1.49l-2.774 1.707a.749.749 0 0 1-1.11-.418l-.954-3.102a1.214 1.214 0 0 1-.145-.125L3.754 9.816a1.218 1.218 0 0 1-.124-.145L.528 8.717a.749.749 0 0 1-.418-1.11l1.71-2.774A1.748 1.748 0 0 1 3.31 4h3.204c.288-.338.59-.665.904-.979l.459-.458A8.749 8.749 0 0 1 14.064 0ZM8.938 3.623h-.002l-.458.458c-.76.76-1.437 1.598-2.02 2.5l-1.5 2.317 2.143 2.143 2.317-1.5c.902-.583 1.74-1.26 2.499-2.02l.459-.458a7.25 7.25 0 0 0 2.123-5.127V1.75a.25.25 0 0 0-.25-.25h-.186a7.249 7.249 0 0 0-5.125 2.123ZM3.56 14.56c-.732.732-2.334 1.045-3.005 1.148a.234.234 0 0 1-.201-.064.234.234 0 0 1-.064-.201c.103-.671.416-2.273 1.15-3.003a1.502 1.502 0 1 1 2.12 2.12Zm6.94-3.935c-.088.06-.177.118-.266.175l-2.35 1.521.548 1.783 1.949-1.2a.25.25 0 0 0 .119-.213ZM3.678 8.116 5.2 5.766c.058-.09.117-.178.176-.266H3.309a.25.25 0 0 0-.213.119l-1.2 1.95ZM12 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg> Create Codex Task`;
            button.addEventListener('click', handleCreateTaskClick);
            container.appendChild(button);
        } else {
            const promptText = document.createElement('div');
            promptText.textContent = 'Could not determine repo name.';
            promptText.style.cssText = 'font-size: 12px; color: #9e9e9e; margin-top: 4px;';
            container.appendChild(promptText);
        }

        sidebar.prepend(container);
        isInitializing = false;
    }

    // --- Boot Sequence ---
    const observer = new MutationObserver(() => {
        // We don't disconnect the observer. This allows the script to re-add the
        // button if GitHub's React code re-renders the sidebar and removes it.
        // The initialize() function will handle checking if the sidebar and button exist.
        initialize();
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();
