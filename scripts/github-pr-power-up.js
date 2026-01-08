// ==UserScript==
// @name         GitHub PR Power-Up
// @namespace    https://github.com/leynos
// @version      1.5.8
// @license      ISC
// @description  Combines extra comment buttons, adds helpers for Codex and CodeScene, and links PRs to Codex environments.
// @author       Payton McIntosh + Gemini 3 Pro + Opus 4.5
// @match        https://github.com/*/*/pull/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
    'use strict';

    // --- START: Configuration & Constants ---

    const SEL_COMMENT_ROOT = '.timeline-comment, .review-comment';
    const MARK_INSTALLED = 'data-vm-extra-btn';
    const MARK_ACTIONS = 'data-vm-extra-installed';
    const STORAGE_KEY = 'codexEnvironments';

    const ACTIONS_SELECTORS = [
        '.timeline-comment-actions',
        '.js-comment-header-actions',
        '.comment-actions',
    ];

    const SEL_KEBAB_DETAILS = 'details.details-overlay';

    // --- Octicon SVG Paths ---
    const TRASH_PATH_D = [
        "M16 1.75V3h5.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H8V1.75C8 .784 8.784 0 9.75 0h4.5C15.216 0 16 .784 16 1.75Zm-6.5 0V3h5V1.75a.25.25 0 0 0-.25-.25h-4.5a.25.25 0 0 0-.25.25ZM4.997 6.178a.75.75 0 1 0-1.493.144L4.916 20.92a1.75 1.75 0 0 0 1.742 1.58h10.684a1.75 1.75 0 0 0 1.742-1.581l1.413-14.597a.75.75 0 0 0-1.494-.144l-1.412 14.596a.25.25 0 0 1-.249.226H6.658a.25.25 0 0 1-.249-.226L4.997 6.178Z",
        "M9.206 7.501a.75.75 0 0 1 .793.705l.5 8.5A.75.75 0 1 1 9 16.794l-.5-8.5a.75.75 0 0 1 .705-.793Zm6.293.793A.75.75 0 1 0 14 8.206l-.5 8.5a.75.75 0 0 0 1.498.088l.5-8.5Z"
    ];
    const FOLD_PATH_D = [
        "M12 15c.199 0 .389.079.53.22l3.25 3.25a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L12 16.81l-2.72 2.72a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.25-3.25A.749.749 0 0 1 12 15Z",
        "M12.53 8.78a.75.75 0 0 1-1.06 0L8.22 5.53a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L12 7.19l2.72-2.72a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734ZM12 15.75a.75.75 0 0 1 .75.75v5.75a.75.75 0 0 1-1.5 0V16.5a.75.75 0 0 1 .75-.75Z",
        "M12 8.5a.75.75 0 0 1-.75-.75v-6a.75.75 0 0 1 1.5 0v6a.75.75 0 0 1-.75-.75ZM2.75 12a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1a.75.75 0 0 1-.75-.75Zm4 0a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1a.75.75 0 0 1-.75-.75Zm4 0a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1a.75.75 0 0 1-.75-.75Zm4 0a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1a.75.75 0 0 1-.75-.75Zm4 0a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1a.75.75 0 0 1-.75-.75Z"
    ];
    const VALIDATE_PATH_D = [
        "M13 16.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-2.517-7.665c.112-.223.268-.424.488-.57C11.186 8.12 11.506 8 12 8c.384 0 .766.118 1.034.319a.953.953 0 0 1 .403.806c0 .48-.218.81-.62 1.186a9.293 9.293 0 0 1-.409.354 19.8 19.8 0 0 0-.294.249c-.246.213-.524.474-.738.795l-.126.19V13.5a.75.75 0 0 0 1.5 0v-1.12c.09-.1.203-.208.347-.333.063-.055.14-.119.222-.187.166-.14.358-.3.52-.452.536-.5 1.098-1.2 1.098-2.283a2.45 2.45 0 0 0-1.003-2.006C13.37 6.695 12.658 6.5 12 6.5c-.756 0-1.373.191-1.861.517a2.944 2.944 0 0 0-.997 1.148.75.75 0 0 0 1.341.67Z",
        "M9.864 1.2a3.61 3.61 0 0 1 4.272 0l1.375 1.01c.274.2.593.333.929.384l1.686.259a3.61 3.61 0 0 1 3.021 3.02l.259 1.687c.051.336.183.655.384.929l1.01 1.375a3.61 3.61 0 0 1 0 4.272l-1.01 1.375a2.106 2.106 0 0 0-.384.929l-.259 1.686a3.61 3.61 0 0 1-3.02 3.021l-1.687.259a2.106 2.106 0 0 0-.929.384l-1.375 1.01a3.61 3.61 0 0 1-4.272 0l-1.375-1.01a2.106 2.106 0 0 0-.929-.384l-1.686-.259a3.61 3.61 0 0 1-3.021-3.02l-.259-1.687a2.106 2.106 0 0 0-.384-.929L1.2 14.136a3.61 3.61 0 0 1 0-4.272l1.01-1.375c.201-.274.333-.593.384-.929l.259-1.686a3.61 3.61 0 0 1 3.02-3.021l1.687-.259c.336-.051.655-.183.929-.384Zm3.384 1.209a2.11 2.11 0 0 0-2.496 0l-1.376 1.01a3.61 3.61 0 0 1-1.589.658l-1.686.258a2.111 2.111 0 0 0-1.766 1.766l-.258 1.686a3.614 3.614 0 0 1-.658 1.59l-1.01 1.375a2.11 2.11 0 0 0 0 2.496l1.01 1.376a3.61 3.61 0 0 1 .658 1.589l.258 1.686a2.11 2.11 0 0 0 1.766 1.765l1.686.26a3.613 3.613 0 0 1 1.59.657l1.375 1.01a2.11 2.11 0 0 0 2.496 0l1.376-1.01a3.61 3.61 0 0 1 1.589-.658l1.686-.258a2.11 2.11 0 0 0 1.765-1.766l.26-1.686a3.613 3.613 0 0 1 .657-1.59l1.01-1.375a2.11 2.11 0 0 0 0-2.496l-1.01-1.376a3.61 3.61 0 0 1-.658-1.589l-.258-1.686a2.111 2.111 0 0 0-1.766-1.766l-1.686-.258a3.614 3.614 0 0 1-1.59-.658Z"
    ];
    const GEAR_PATH_D = "M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315-.675-.111-1.422.364 1.891l-.814.806c-.049.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.038.246.088.294l.814.806c.475.469.679 1.216.364 1.891a7.977 7.977 0 0 1-.704 1.217c-.428.61-1.176.807-1.82.63l-1.102-.302c-.067-.019-.177-.011-.3.071a5.909 5.909 0 0 1-.668.386c-.133.066-.194.158-.211.224l-.29 1.106c-.168.646-.715 1.196-1.458 1.26a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.458-1.26l-.289-1.106c-.018-.066-.079-.158-.212-.224a5.738 5.738 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644-.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.05-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.038-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.217c.428-.61 1.176-.807 1.82-.63l1.102.302c.067.019.177.011.3-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.106C6.009.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183-.5-.29.417-.278.97-.423-1.529.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z";
    const COSTRUCTOR_PATH_D = "M12.551 4.385c.618 0 1.121.503 1.121 1.121v5.157c0 .618-.503 1.121-1.121 1.121h-1.07v1.171c0 .225-.252.34-.43.204l-1.996-1.52c-.1-.076-.24-.12-.387-.12h-4.232c-.618 0-1.121-.503-1.121-1.121V5.506c0-.618.503-1.121 1.121-1.121h9.004Zm-4.66 1.17a.75.75 0 1 0-1.5 0v3.5a.75.75 0 1 0 1.5 0v-3.5ZM6.25 7.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm4.25-1.5a.75.75 0 1 0-1.5 0v3.5a.75.75 0 1 0 1.5 0v-3.5Z M14.25 1.75A1.75 1.75 0 0 0 12.5 0H3.5A1.75 1.75 0 0 0 1.75 1.75v9.5c0 .966.784 1.75 1.75 1.75h4.232c.38 0 .742.174 1 .465l1.996 1.52a1.75 1.75 0 0 0 2.772-1.22v-.77h1.07c.966 0 1.75-.784 1.75-1.75V3.5A1.75 1.75 0 0 0 14.25 1.75Z";
    const COPY_ICON_PATH_D = "M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25ZM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z";

    // --- END: Configuration & Constants ---

    // --- START: Codex Integration Logic ---

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

    // --- END: Codex Integration Logic ---

    // --- START: UI Generation & Manipulation ---

    function makeSVG(pathD, { viewBox = '0 0 16 16', classes = 'octicon' } = {}) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('height', '16');
        svg.setAttribute('width', '16');
        svg.setAttribute('viewBox', viewBox);
        svg.setAttribute('class', classes);
        svg.setAttribute('style', 'display:block;margin-left:auto;margin-right:auto;');

        const paths = Array.isArray(pathD) ? pathD : [pathD];
        for (const d of paths) {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            svg.appendChild(path);
        }
        return svg;
    }

    function makeHeaderButton(label, iconPath, svgOpts) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = [
            'timeline-comment-action', 'Link--secondary', 'Button', 'Button--invisible',
            'Button--iconOnly', 'Button--medium', 'tooltipped', 'tooltipped-n', 'ml-1',
        ].join(' ');
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
        btn.appendChild(makeSVG(iconPath, { classes: 'octicon', ...(svgOpts || {}) }));
        return btn;
    }

    function $(root, selList) {
        for (const sel of selList) {
            const el = root.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    // Finders for original "delete" and "hide" buttons
    function findDeleteButton(root) {
        return (
            root.querySelector('details-menu form.js-comment-delete button[type="submit"]') ||
            root.querySelector('form.js-comment-delete button[type="submit"]')
        );
    }

    function findHideButton(root) {
        return root.querySelector('button.js-comment-hide-button');
    }

    async function ensureMenuLoadedAndGet(root, kebab, finder) {
        let btn = finder(root);
        if (btn) return btn;

        if (kebab && !kebab.open) {
            kebab.open = true;
            await new Promise(r => setTimeout(r, 60));
        }
        btn = finder(root);
        if (btn) return btn;

        await new Promise(r => setTimeout(r, 200));
        btn = finder(root);
        if (kebab && kebab.open) kebab.open = false;
        return btn || null;
    }

    async function createImporterModal() {
        if (document.getElementById('codex-importer-overlay')) return;

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'codex-importer-overlay';
        modalOverlay.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; visibility: hidden; z-index: 999998;`;

        const pane = document.createElement('div');
        pane.style.cssText = `width: 90vw; max-width: 500px; background: #24292f; color: #e5e5e5; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,.4); font-family: sans-serif; border: 1px solid #6e7781;`;

        const statusEl = document.createElement('div');
        statusEl.style.cssText = 'padding: 0 1rem 0.5rem; height: 1.2em; font-size: 14px;';

        const textarea = document.createElement('textarea');
        textarea.placeholder = 'Paste your environments JSON here...';
        textarea.style.cssText = `width: calc(100% - 2rem); height: 150px; margin: 0 1rem; background: #1f2328; color: #e5e5e5; border: 1px solid #6e7781; border-radius: 6px; padding: 0.5rem; font-family: monospace;`;

        const data = await GM_getValue(STORAGE_KEY, null);
        if (data) {
            textarea.value = JSON.stringify(data, null, '  ');
        }

        pane.innerHTML = `
        <h2 style="font-size: 18px; font-weight: 600; padding: 1rem; margin: 0; border-bottom: 1px solid #424a53;">Link to Codex Environment</h2>
        <p style="font-size: 14px; color: #9e9e9e; padding: 1rem 1rem 0.5rem;">
            First, <a href="https://chatgpt.com/codex/settings/environments" target="_blank" style="color: #58a6ff; text-decoration: underline;">open your environments page</a>, use the "Viewer" script to copy the data, then paste it here.
        </p>`;
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

    function createDisplayModal(title, content) {
        const existingModal = document.getElementById('userscript-display-modal-overlay');
        if (existingModal) existingModal.remove();

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'userscript-display-modal-overlay';
        modalOverlay.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 10000;`;

        const pane = document.createElement('div');
        pane.style.cssText = `width: 90vw; max-width: 700px; background: #24292f; color: #e5e5e5; border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,.4); font-family: sans-serif; border: 1px solid #6e7781; display: flex; flex-direction: column; max-height: 90vh;`;

        const header = document.createElement('div');
        header.style.cssText = 'font-size: 18px; font-weight: 600; padding: 1rem; margin: 0; border-bottom: 1px solid #424a53; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;';
        const headerTitle = document.createElement('h2');
        headerTitle.textContent = title;
        headerTitle.style.cssText = 'margin: 0; font-size: 18px;';
        header.appendChild(headerTitle);

        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.cssText = 'background: none; border: none; font-size: 24px; color: #e5e5e5; cursor: pointer; line-height: 1; padding: 0;';
        header.appendChild(closeButton);
        pane.appendChild(header);

        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.readOnly = true;
        textarea.style.cssText = `width: calc(100% - 2rem); min-height: 250px; margin: 1rem; background: #1f2328; color: #e5e5e5; border: 1px solid #6e7781; border-radius: 6px; padding: 0.5rem; font-family: monospace; resize: vertical; flex-grow: 1;`;
        pane.appendChild(textarea);

        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 1rem; border-top: 1px solid #424a53; display: flex; justify-content: flex-end; align-items: center; flex-shrink: 0;';
        const copyStatus = document.createElement('span');
        copyStatus.style.cssText = 'font-size: 14px; margin-right: 1rem; color: lightgreen;';
        footer.appendChild(copyStatus);
        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy to Clipboard';
        copyButton.style.cssText = 'padding: 0.5rem 1rem; font-weight: bold; background-color: #238636; color: white; border: 1px solid #369145; border-radius: 5px; cursor: pointer;';
        footer.appendChild(copyButton);
        pane.appendChild(footer);

        modalOverlay.appendChild(pane);
        document.body.appendChild(modalOverlay);

        const closeModal = () => modalOverlay.remove();
        modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
        closeButton.addEventListener('click', closeModal);

        copyButton.addEventListener('click', () => {
            navigator.clipboard.writeText(content).then(() => {
                copyStatus.textContent = 'Copied!';
                copyButton.disabled = true;
                setTimeout(() => {
                    copyStatus.textContent = '';
                    copyButton.disabled = false;
                }, 2000);
            });
        });
        textarea.focus();
        textarea.select();
    }

    function getLanguageFromFilename(filename) {
        const extension = filename.split('.').pop();
        const map = {
            rs: 'rust', py: 'python', js: 'javascript', ts: 'typescript', java: 'java',
            kt: 'kotlin', go: 'go', cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
            cs: 'csharp', html: 'html', css: 'css', scss: 'scss', rb: 'ruby',
            php: 'php', swift: 'swift', md: 'markdown', sh: 'bash', zsh: 'bash',
            json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml'
        };
        return map[extension] || '';
    }

    function handleMinimizeComment(container) {
        const select = container.querySelector('select[name="classifier"]');
        if (select && select.value === "") {
            select.value = "RESOLVED";
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    // --- START: CodeRabbit Markdown Extraction ---

    /**
     * Convert inline HTML elements to markdown text.
     * Handles <code>, <strong>, <em>, and plain text nodes.
     */
    function inlineToMarkdown(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return '';
        }

        const tag = node.tagName;

        if (tag === 'CODE') {
            return '`' + node.textContent + '`';
        }
        if (tag === 'STRONG' || tag === 'B') {
            return '**' + Array.from(node.childNodes).map(inlineToMarkdown).join('') + '**';
        }
        if (tag === 'EM' || tag === 'I') {
            return '_' + Array.from(node.childNodes).map(inlineToMarkdown).join('') + '_';
        }
        if (tag === 'A') {
            const href = node.getAttribute('href') || '';
            const text = Array.from(node.childNodes).map(inlineToMarkdown).join('');
            return `[${text}](${href})`;
        }
        if (tag === 'BR') {
            return '\n';
        }
        // For G-EMOJI and other inline elements, just recurse
        return Array.from(node.childNodes).map(inlineToMarkdown).join('');
    }

    /**
     * Convert a <p> element to markdown, preserving inline formatting.
     */
    function paragraphToMarkdown(pNode) {
        return Array.from(pNode.childNodes).map(inlineToMarkdown).join('').trim();
    }

    /**
     * Convert a <ul> or <ol> element to markdown list.
     */
    function listToMarkdown(listNode) {
        const items = Array.from(listNode.querySelectorAll(':scope > li'));
        return items.map(li => {
            const content = Array.from(li.childNodes).map(inlineToMarkdown).join('').trim();
            return `- ${content}`;
        }).join('\n');
    }

    /**
     * Extract language from highlight class (e.g., "highlight-source-diff" -> "diff")
     */
    function extractLangFromHighlight(el) {
        const classes = Array.from(el.classList || []);
        const langClass = classes.find(c => c.startsWith('highlight-source-'));
        return langClass ? langClass.replace('highlight-source-', '') : '';
    }

    /**
     * Convert a code block (div.highlight or pre) to markdown fenced block.
     */
    function codeBlockToMarkdown(blockNode) {
        const lang = extractLangFromHighlight(blockNode);
        const pre = blockNode.querySelector('pre') || blockNode;
        const code = pre.textContent.trim();
        return '```' + lang + '\n' + code + '\n```';
    }

    /**
     * Process content within a blockquote, converting to markdown.
     * This handles the nested structure of CodeRabbit comments.
     */
    function processBlockquoteContent(blockquote) {
        const lines = [];

        for (const child of Array.from(blockquote.children)) {
            const tag = child.tagName;

            // Nested <details> - file-level grouping
            if (tag === 'DETAILS') {
                const summary = child.querySelector(':scope > summary');
                const nestedBlockquote = child.querySelector(':scope > blockquote');

                if (summary) {
                    // Extract summary text as a sub-header
                    const summaryText = Array.from(summary.childNodes).map(inlineToMarkdown).join('').trim();
                    lines.push(`\n#### ${summaryText}\n`);
                }

                if (nestedBlockquote) {
                    lines.push(processBlockquoteContent(nestedBlockquote));
                }
                continue;
            }

            // Paragraph
            if (tag === 'P') {
                lines.push(paragraphToMarkdown(child));
                continue;
            }

            // Unordered/ordered list
            if (tag === 'UL' || tag === 'OL') {
                lines.push(listToMarkdown(child));
                continue;
            }

            // Code block (div.highlight)
            if (tag === 'DIV' && child.classList.contains('highlight')) {
                lines.push('\n' + codeBlockToMarkdown(child) + '\n');
                continue;
            }

            // Standalone <pre>
            if (tag === 'PRE') {
                lines.push('\n```\n' + child.textContent.trim() + '\n```\n');
                continue;
            }

            // Headers
            if (tag === 'H3' || tag === 'H4' || tag === 'H5') {
                lines.push(`#### ${child.textContent.trim()}`);
                continue;
            }
        }

        return lines.join('\n');
    }

    /**
     * Extract markdown from a CodeRabbit target section <details> element.
     */
    function extractSectionMarkdown(detailsEl) {
        const summary = detailsEl.querySelector(':scope > summary');
        const blockquote = detailsEl.querySelector(':scope > blockquote');

        if (!summary) return null;

        // Ensure details are open for DOM access
        detailsEl.open = true;
        if (blockquote) {
            blockquote.querySelectorAll('details').forEach(d => d.open = true);
        }

        const summaryText = Array.from(summary.childNodes).map(inlineToMarkdown).join('').trim();
        const contentMarkdown = blockquote ? processBlockquoteContent(blockquote) : '';

        // Clean up excessive newlines
        const cleanContent = contentMarkdown
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        return {
            title: summaryText,
            content: cleanContent
        };
    }

    // --- END: CodeRabbit Markdown Extraction ---

    // --- END: UI Generation & Manipulation ---

    // --- START: Main Installation Logic ---

    function installOnComment(root) {
        if (!(root instanceof HTMLElement) || root.hasAttribute(MARK_INSTALLED)) return;

        const actions = $(root, ACTIONS_SELECTORS);
        if (!actions || actions.hasAttribute(MARK_ACTIONS)) return;

        const kebab = actions.querySelector(SEL_KEBAB_DETAILS);
        if (!kebab && actions.children.length === 0) return;

        // 1. Context Analysis
        const isTimelineComment = root.classList.contains('timeline-comment');
        const isReviewComment = root.classList.contains('review-comment');

        // 2. Identity Check (CodeRabbit Banner specific)
        const coderabbitAuthor = root.querySelector('h3.f5 a.author[href="/apps/coderabbitai"]');
        const isCodeRabbitBanner = isTimelineComment && !!coderabbitAuthor;

        const isCodeScene = root.querySelector('a.author[href="/apps/codescene-delta-analysis"]');

        // 3. App-specific logic
        if (isCodeScene) {
            const aiPromptBtn = makeHeaderButton('Generate AI Prompt', COSTRUCTOR_PATH_D, { viewBox: '0 0 16 16' });
            aiPromptBtn.addEventListener('click', e => {
                e.preventDefault(); e.stopPropagation();
                const threadRoot = root.closest('details.review-thread-component');
                if (!threadRoot) return;

                try {
                    const fileLinkEl = threadRoot.querySelector('summary a.Link--primary');
                    const filename = fileLinkEl.textContent.trim();
                    const fileMarkdown = `[${filename}](${fileLinkEl.href})`;

                    let lineRangeText = 'Comment on file';
                    const lineInfoContainer = threadRoot.querySelector('.f6.py-2.px-3');
                    if (lineInfoContainer) {
                        const startLineEl = lineInfoContainer.querySelector('.js-multi-line-preview-start');
                        const endLineEl = lineInfoContainer.querySelector('.js-multi-line-preview-end');
                        const singleLineEl = lineInfoContainer.querySelector('.js-single-line-preview');
                        if (startLineEl && endLineEl) lineRangeText = `Comment on lines ${startLineEl.textContent.trim()} to ${endLineEl.textContent.trim()}`;
                        else if (singleLineEl) lineRangeText = `Comment on line ${singleLineEl.textContent.trim()}`;
                    }

                    const codeRows = threadRoot.querySelectorAll('table.diff-table td.blob-code:not(.blob-code-hunk)');
                    const codeSnippet = Array.from(codeRows).map(td => td.innerText.trimEnd()).join('\n');
                    const lang = getLanguageFromFilename(filename);
                    const codeBlock = codeSnippet ? `~~~${lang}\n${codeSnippet}\n~~~` : "";

                    const commentBody = root.querySelector('.comment-body.markdown-body');
                    const issueP = commentBody.querySelector('p:first-of-type');
                    const issueLink = issueP.querySelector('a');
                    let issueText = issueP.innerText;
                    if (issueLink) {
                        const linkText = issueLink.textContent.trim();
                        issueText = issueP.innerText.replace(linkText, `[${linkText}](${issueLink.href})`);
                    }

                    const output = [
                        "@coderabbitai Please suggest a fix for this issue and supply a prompt for an AI coding agent to enable it to apply the fix:",
                        fileMarkdown, lineRangeText, codeBlock, issueText
                    ].filter(Boolean).join("\n\n");

                    createDisplayModal('AI Prompt for CodeScene', output);
                } catch (err) {
                    console.error("Error generating AI prompt:", err);
                    aiPromptBtn.classList.add('color-fg-danger');
                }
            });
            if (kebab) kebab.insertAdjacentElement('beforebegin', aiPromptBtn);
            else actions.prepend(aiPromptBtn);
        }

        if (isCodeRabbitBanner) {
            const body = root.querySelector('.comment-body.markdown-body');
            const targetSections = ["Outside diff range comments", "Duplicate comments", "Nitpicks"];

            // Verification check: Only show the button if at least one target <details> block exists
            const hasTargetDetails = body && Array.from(body.querySelectorAll('details > summary')).some(summary => {
                const text = summary.textContent || "";
                return targetSections.some(s => text.includes(s));
            });

            if (hasTargetDetails) {
                const copyBtn = makeHeaderButton('Detailed instructions', COPY_ICON_PATH_D, { viewBox: '0 0 16 16' });
                copyBtn.addEventListener('click', e => {
                    e.preventDefault(); e.stopPropagation();
                    const sections = [];

                    // Find all top-level <details> that match target sections
                    const detailTags = Array.from(body.querySelectorAll(':scope > details, :scope > div > details'));
                    detailTags.forEach(details => {
                        const summary = details.querySelector(':scope > summary');
                        const summaryText = summary?.textContent || "";

                        if (targetSections.some(s => summaryText.includes(s))) {
                            const extracted = extractSectionMarkdown(details);
                            if (extracted) {
                                const sectionOutput = `### ${extracted.title}\n\n${extracted.content}`
                                    .replace(/Prompt for AI agents?/g, "Detailed instructions");
                                sections.push(sectionOutput);
                            }
                        }
                    });

                    if (sections.length > 0) {
                        const finalOutput = [
                            "Please address the following concerns and ensure all commit gates succeed:",
                            ...sections
                        ].join("\n\n");
                        createDisplayModal('CodeRabbit Summary', finalOutput);
                    } else {
                        copyBtn.classList.add('color-fg-danger');
                        copyBtn.setAttribute('title', 'Target sections not found in this banner.');
                    }
                });
                if (kebab) kebab.insertAdjacentElement('beforebegin', copyBtn);
                else actions.prepend(copyBtn);
            }
        }

        // 4. Standard Generic Buttons
        if (isReviewComment) {
            const validateBtn = makeHeaderButton('Validate Resolution in Codex', VALIDATE_PATH_D, { viewBox: '0 0 24 24' });
            validateBtn.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                const prDetails = getPrDetails();
                const storedData = await GM_getValue(STORAGE_KEY, null);
                if (!prDetails || !storedData) {
                    validateBtn.classList.add('color-fg-danger');
                    return;
                }
                const environmentId = findEnvironmentId(prDetails.repoName, storedData);
                if (!environmentId) {
                    validateBtn.classList.add('color-fg-danger');
                    return;
                }
                const permalinkEl = root.querySelector('a.js-timestamp');
                if (!permalinkEl) return;
                const prompt = `Please run \`vk pr --show-outdated ${permalinkEl.href}\` to see details of this review comment. If this command fails, stop immediately.\n\nHas the issue identified in the comment thread returned by this command been resolved? Please provide evidence for your assessment.\n\nIf work remains in relation to the specific identified issue, please provide clear self-contained instructions (including rationale and location) enclosed in a **single** triple-tilde code-fenced block.`;
                const codexUrl = `https://chatgpt.com/codex?environment=${environmentId}&branch=${prDetails.branchName}&prompt=${encodeURIComponent(prompt)}`;
                window.open(codexUrl, '_blank');
            });

            const deleteBtn = makeHeaderButton('Delete comment', TRASH_PATH_D, { viewBox: '0 0 24 24' });
            deleteBtn.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                const targetBtn = await ensureMenuLoadedAndGet(root, kebab, findDeleteButton);
                if (targetBtn) targetBtn.click();
                else deleteBtn.classList.add('color-fg-danger');
            });

            if (kebab) {
                kebab.insertAdjacentElement('beforebegin', deleteBtn);
                kebab.insertAdjacentElement('beforebegin', validateBtn);
            } else {
                actions.prepend(deleteBtn);
                actions.prepend(validateBtn);
            }
        } else if (isTimelineComment) {
            const hideBtn = makeHeaderButton('Hide comment', FOLD_PATH_D, { viewBox: '0 0 24 24' });
            hideBtn.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                const targetBtn = await ensureMenuLoadedAndGet(root, kebab, findHideButton);
                if (targetBtn) targetBtn.click();
                else hideBtn.classList.add('color-fg-danger');
            });

            if (kebab) kebab.insertAdjacentElement('beforebegin', hideBtn);
            else actions.prepend(hideBtn);

            const minimizeContainer = root.querySelector('.js-minimize-comment');
            if (minimizeContainer) {
                const hideObserver = new MutationObserver(() => {
                    if (!minimizeContainer.classList.contains('d-none')) handleMinimizeComment(minimizeContainer);
                });
                hideObserver.observe(minimizeContainer, { attributes: true, attributeFilter: ['class'] });
            }
        }

        root.setAttribute(MARK_INSTALLED, '1');
        actions.setAttribute(MARK_ACTIONS, '1');
    }

    async function initializeSidebar() {
        if (document.getElementById('codex-sidebar-container')) return;
        const sidebar = document.getElementById('partial-discussion-sidebar');
        if (!sidebar) return;

        await createImporterModal();
        const prDetails = getPrDetails();
        const storedData = await GM_getValue(STORAGE_KEY, null);
        const environmentId = prDetails ? findEnvironmentId(prDetails.repoName, storedData) : null;

        const container = document.createElement('div');
        container.id = 'codex-sidebar-container';
        container.className = 'discussion-sidebar-item';

        const headingContainer = document.createElement('div');
        headingContainer.className = 'discussion-sidebar-heading discussion-sidebar-toggle text-bold';
        headingContainer.textContent = 'Codex';
        headingContainer.style.cursor = 'pointer';
        headingContainer.addEventListener('click', () => {
            const modal = document.getElementById('codex-importer-overlay');
            if (modal) modal.style.visibility = 'visible';
        });

        const settingsButton = makeSVG(GEAR_PATH_D, { classes: 'octicon octicon-gear', viewBox: '0 0 16 16' });
        settingsButton.style.marginLeft = '8px';
        headingContainer.appendChild(settingsButton);
        container.appendChild(headingContainer);

        if (prDetails && environmentId) {
            const promptTitle = document.querySelector('.js-issue-title')?.textContent.trim() || 'this pull request';
            const encodedPrompt = encodeURIComponent(`I'm working on the pull request titled "${promptTitle}". Can you please summarise the changes for me?`);
            const codexUrl = `https://chatgpt.com/codex?environment=${environmentId}&branch=${prDetails.branchName}&prompt=${encodedPrompt}`;
            const link = document.createElement('a');
            link.href = codexUrl;
            link.target = '_blank';
            link.className = 'btn btn-block';
            link.style.cssText = 'background-color: #10a37f; color: white; text-align: center; margin-top: 4px;';
            link.innerHTML = `<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" style="vertical-align: text-bottom; margin-right: 4px;" class="octicon octicon-rocket"><path d="M14.064 0h.186C15.216 0 16 .784 16 1.75v.186a8.752 8.752 0 0 1-2.564 6.186l-.458.459c-.314.314-.641.616-.979.904v3.207c0 .608-.315 1.172-.833 1.49l-2.774 1.707a.749.749 0 0 1-1.11-.418l-.954-3.102a1.214-.145-.125L3.754 9.816a1.218 1.218 0 0 1-.124-.145L.528 8.717a.749.749 0 0 1-.418-1.11l1.71-2.774A1.748 1.748 0 0 1 3.31 4h3.204c.288-.338.59-.665.904-.979l.459-.458A8.749 8.749 0 0 1 14.064 0ZM8.938 3.623h-.002l-.458.458c-.76.76-1.437 1.598-2.02 2.5l-1.5 2.317 2.143 2.143 2.317-1.5c.902-.583 1.74-1.26 2.499-2.02l.459-.458a7.25 7.25 0 0 0 2.123-5.127V1.75a.25.25 0 0 0-.25-.25h-.186a7.249 7.249 0 0 0-5.125 2.123ZM3.56 14.56c-.732.732-2.334 1.045-3.005 1.148a.234.234 0 0 1-.201-.064.234.234 0 0 1-.064-.201c.103-.671.416-2.273 1.15-3.003a1.502 1.502 0 1 1 2.12 2.12Zm6.94-3.935c-.088.06-.177.118-.266.175l-2.35 1.521.548 1.783 1.949-1.2a.25.25 0 0 0 .119-.213ZM3.678 8.116 5.2 5.766c.058-.09.117-.178.176-.266H3.309a.25.25 0 0 0-.213.119l-1.2 1.95ZM12 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg> Work in Codex`;
            container.appendChild(link);
        } else {
            const promptText = document.createElement('div');
            promptText.textContent = 'Link this PR to a Codex environment by importing your data.';
            promptText.style.cssText = 'font-size: 12px; color: #9e9e9e; margin-top: 4px;';
            container.appendChild(promptText);
        }
        sidebar.prepend(container);
    }

    // --- END: Main Installation Logic ---

    // --- START: Bootstrapping & DOM Observation ---

    function scanAndInit(container = document) {
        container.querySelectorAll(SEL_COMMENT_ROOT).forEach(installOnComment);
        if (container === document) initializeSidebar();
    }

    const mo = new MutationObserver((muts) => {
        for (const m of muts) {
            for (const n of m.addedNodes) {
                if (!(n instanceof HTMLElement)) continue;
                if (n.matches?.(SEL_COMMENT_ROOT)) installOnComment(n);
                n.querySelectorAll?.(SEL_COMMENT_ROOT).forEach(installOnComment);
                if (!document.getElementById('codex-sidebar-container') && (n.id === 'partial-discussion-sidebar' || n.querySelector('#partial-discussion-sidebar'))) initializeSidebar();
            }
        }
    });

    function boot() {
        scanAndInit(document);
        mo.observe(document.body, { childList: true, subtree: true });
    }

    document.addEventListener('turbo:load', boot);
    document.addEventListener('turbo:render', () => scanAndInit(document));
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

})();
