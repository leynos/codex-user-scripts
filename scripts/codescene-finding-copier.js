// ==UserScript==
// @name         CodeScene Finding Copier
// @namespace    https://github.com/leynos
// @version      1.5
// @description  Adds a button to CodeScene findings to copy a formatted message for AI review.
// @author       Payton McIntosh + Gemini
// @license      ISC
// @match        https://codescene.io/projects/*/delta/results/*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
    'use strict';

    // --- 1. Styles for the Modal and Copy Button ---
    GM_addStyle(`
        .cs-copy-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 8px;
            margin-left: 8px;
            cursor: pointer;
            border-radius: 4px;
            transition: background-color 0.2s;
        }
        .cs-copy-button:hover {
            background-color: #f0f0f0;
        }
        .cs-copy-button svg {
            width: 20px;
            height: 20px;
            stroke: #3A445A;
        }
        #cs-copy-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: rgba(0, 0, 0, 0.6);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        #cs-copy-modal {
            background-color: #ffffff;
            border-radius: 8px;
            padding: 24px;
            width: 80%;
            max-width: 900px;
            height: 85vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        }
        #cs-copy-modal h3 {
            margin-top: 0;
            margin-bottom: 16px;
            font-size: 1.2em;
            color: #333;
        }
        #cs-copy-modal-textarea {
            width: 100%;
            flex-grow: 1;
            margin-bottom: 16px;
            font-family: monospace;
            font-size: 14px;
            border: 1px solid #ccc;
            border-radius: 4px;
            padding: 8px;
            resize: none;
        }
        #cs-copy-modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        }
        .cs-modal-button {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 1em;
            transition: background-color 0.2s;
        }
        .cs-modal-button-primary {
            background-color: #007bff;
            color: white;
        }
        .cs-modal-button-primary:hover {
            background-color: #0056b3;
        }
        .cs-modal-button-secondary {
            background-color: #6c757d;
            color: white;
        }
         .cs-modal-button-secondary:hover {
            background-color: #5a6268;
        }
    `);

    const copyIconSVG = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>`;

    /**
     * Extracts all relevant data from a finding's DOM element.
     * @param {HTMLElement} copyButton The copy button element that was clicked.
     * @returns {object|null} An object with the finding data or null if not found.
     */
    function extractFindingData(copyButton) {
        // Find the main container for the finding, regardless of whether it is open or closed.
        const findingBlock = copyButton.closest('.Collapsible');
        if (!findingBlock) {
            console.error("Could not find parent '.Collapsible' container for the finding.");
            return null;
        }

        const header = findingBlock.querySelector('.finding-header');
        const name = header.querySelector('.name')?.innerText.trim();
        const methodParts = header.querySelector('.method')?.innerText.trim().split(':');
        const path = methodParts.shift().trim();
        const method = methodParts.join(':').trim();

        const data = {
            name,
            path,
            method,
            explanations: [],
            examples: null,
        };

        // Extract explanations like "What lead to degradation?", "Why does this problem occur?" etc.
        const explanationSections = findingBlock.querySelectorAll('.explanations > .Collapsible');
        explanationSections.forEach(section => {
            const title = section.querySelector('.finding-details-trigger span')?.innerText.trim();
            const contentEl = section.querySelector('.markdown-text');
            if (title && contentEl) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = contentEl.innerHTML;
                tempDiv.querySelectorAll('a').forEach(a => {
                    a.replaceWith(`[${a.innerText}](${a.href})`);
                });
                data.explanations.push({
                    title,
                    content: tempDiv.innerText.trim()
                });
            }
        });

        // Extract "Helpful refactoring examples" if it exists using a more robust selector
        let examplesSection = null;
        const detailTriggers = findingBlock.querySelectorAll('.finding-details .finding-details-trigger');
        detailTriggers.forEach(trigger => {
            const triggerSpan = trigger.querySelector('span');
            if (triggerSpan && triggerSpan.innerText.trim() === 'Helpful refactoring examples') {
                examplesSection = trigger.closest('.Collapsible');
            }
        });


        if (examplesSection) {
            const intro = examplesSection.querySelector('.Collapsible__contentInner > p')?.innerText.trim();
            const diffs = [];
            const diffViewers = examplesSection.querySelectorAll('.compartment-item__diff-viewer');
            diffViewers.forEach(viewer => {
                const type = viewer.querySelector('.corner-ribbon span')?.innerText.trim();
                const filename = viewer.querySelector('.diff-viewer__file-info span')?.innerText.trim();
                const lines = Array.from(viewer.querySelectorAll('table.diff td.diff-code'))
                    .map(td => {
                        let prefix = ' ';
                        if (td.classList.contains('diff-code-insert')) {
                            prefix = '+';
                        } else if (td.classList.contains('diff-code-delete')) {
                            prefix = '-';
                        }
                        return prefix + td.innerText;
                    })
                    .join('\n');
                diffs.push({ type, filename, content: lines });
            });
            data.examples = { intro, diffs };
        }

        return data;
    }

    /**
     * Generates a Markdown string from the extracted finding data.
     * @param {object} data The data object from extractFindingData.
     * @returns {string} The formatted Markdown string.
     */
    function generateMarkdown(data) {
        if (!data) return "Error: Could not generate report.";

        let output = `@coderabbitai Please suggest a fix for this issue and supply a prompt for an AI coding agent to enable it to apply the fix:\n\n`;
        output += `## ${data.name}\n${data.path}: ${data.method}\n\n`;

        data.explanations.forEach(exp => {
            output += `### ${exp.title}\n${exp.content}\n\n`;
        });

        if (data.examples && data.examples.intro) {
            output += `### Helpful refactoring examples\n${data.examples.intro}\n\n`;
            data.examples.diffs.forEach(diff => {
                output += `#### ${diff.type}\n\n`;
                output += '~~~diff\n';
                output += `# ${diff.filename}\n`;
                output += `${diff.content}\n`;
                output += '~~~\n\n';
            });
        }

        return output.trim();
    }

    /**
     * Displays a modal window with the generated text.
     * @param {string} text The text to display in the modal's textarea.
     */
    function showModal(text) {
        // Remove existing modal if any
        const existingModal = document.getElementById('cs-copy-modal-overlay');
        if (existingModal) existingModal.remove();

        const overlay = document.createElement('div');
        overlay.id = 'cs-copy-modal-overlay';

        const modal = document.createElement('div');
        modal.id = 'cs-copy-modal';

        modal.innerHTML = `
            <h3>Copy Finding Details</h3>
            <textarea id="cs-copy-modal-textarea" spellcheck="false"></textarea>
            <div id="cs-copy-modal-footer">
                <button id="cs-modal-close-btn" class="cs-modal-button cs-modal-button-secondary">Close</button>
                <button id="cs-modal-copy-btn" class="cs-modal-button cs-modal-button-primary">Copy to Clipboard</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const textarea = document.getElementById('cs-copy-modal-textarea');
        textarea.value = text;
        textarea.scrollTop = 0; // Ensure it's scrolled to the top

        const copyBtn = document.getElementById('cs-modal-copy-btn');
        copyBtn.addEventListener('click', () => {
            GM_setClipboard(textarea.value);
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy to Clipboard'; }, 2000);
        });

        const close = () => overlay.remove();
        document.getElementById('cs-modal-close-btn').addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                close();
            }
        });
    }

    /**
     * Main click handler for the copy button.
     * @param {MouseEvent} event The click event.
     */
    function handleCopyClick(event) {
        event.stopPropagation();
        event.preventDefault();

        const findingData = extractFindingData(event.currentTarget);
        if (findingData) {
            const markdown = generateMarkdown(findingData);
            showModal(markdown);
        } else {
            alert("Failed to extract finding data. Please check the browser console for more details.");
        }
    }

    /**
     * Scans the document for finding headers and adds a copy button if one doesn't exist.
     */
    function addButtonsToFindings() {
        const suppressButtons = document.querySelectorAll('.suppress-select-findings');
        suppressButtons.forEach(suppressBtn => {
            const parent = suppressBtn.parentElement;
            if (parent && !parent.querySelector('.cs-copy-button')) {
                const copyButton = document.createElement('div');
                copyButton.className = 'cs-copy-button';
                copyButton.title = 'Prepare message for AI agent';
                copyButton.innerHTML = copyIconSVG;
                copyButton.addEventListener('click', handleCopyClick);
                parent.appendChild(copyButton);
            }
        });
    }

    // Use a MutationObserver to handle dynamically loaded content
    const observer = new MutationObserver((mutationsList, observer) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                // A bit of a debounce/delay to let the UI settle
                setTimeout(addButtonsToFindings, 500);
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial run in case the content is already present on script injection
    addButtonsToFindings();

})();
