# Codex User Scripts

This repository contains a collection of user scripts designed to enhance and streamline the user experience on Codex and GitHub. They add helpful UI elements, automate repetitive tasks, and provide at-a-glance information to make your workflow more efficient.

---

## Scripts

### `codex-ctrl-enter-code.js`

- **Functionality**: This script provides a quality-of-life improvement by allowing you to submit prompts in the Codex interface using the `Ctrl+Enter` keyboard shortcut.

- **Target Pages**: It runs on the main Codex page and any task-specific pages (`https://chatgpt.com/codex*`).

### `codex-environment-viewer.js`

- **Functionality**: This script captures and displays your Codex environment configurations. It adds a "🚀 View Environments" button to the page. Clicking this button opens a modal that lists all your environments and allows you to copy their IDs individually or copy the entire configuration as a JSON blob, which is useful for the `github-to-codex-linker.js` script. The script automatically activates only on the environment settings page and unloads on other pages.

- **Target Page**: `https://chatgpt.com/codex/settings/environments`

### `codex-task-badger.js`

- **Functionality**: This script adds a status emoji to the browser tab's title on a Codex task page, providing an immediate visual indicator of the task's state:

  - `✅️` (Success): Appears when an "Update branch" or "Create PR" button is available.

  - `😵` (Error): Appears if a "Failed in..." error banner is displayed.

  - `🏗️` (Working): Appears when a task is actively being processed.

- **Target Page**: `https://chatgpt.com/codex/tasks*`

### `codex-task-environment-titler.js`

- **Functionality**: To make it easier to distinguish between different browser tabs, this script appends the name of the active Codex environment to the page title, formatted as `[Environment Name]`.

- **Target Page**: `https://chatgpt.com/codex/tasks*`

### `github-actions-failed-step-log-copier.js`

- **Functionality**: When a GitHub Actions workflow fails, this script adds a "View/Copy Log" button to the failed step. Because logs are often virtualized and load dynamically as you scroll, this script uses a `MutationObserver` to capture and cache all log lines. Clicking the button opens a modal where you can view the complete, aggregated log and copy it to your clipboard.

- **Target Page**: `https://github.com/*/*/actions/runs/*`

### `github-pull-request-badger.js`

- **Functionality**: This script adds emoji badges to the title of GitHub pull request pages to provide a quick visual summary of the PR's status. Badges include:

  - `🐇`: CodeRabbit is processing changes.

  - `‼️`: Checks are failing.

  - `🚧`: The branch has merge conflicts.

  - `💬`: There are unresolved review comments.

  - `💎`: The pull request has been merged.

  - `⏱️`: A CodeRabbit rate limit is active.

  - `🚫`: The pull request is closed without being merged.

- **Target Page**: `https://github.com/*/*/pull/*`

### `github-to-codex-linker.js`

- **Functionality**: This script bridges the gap between GitHub and Codex. It adds a "Work in Codex" button to the sidebar of a pull request page. To use it, you must first import your environment data using the settings icon (⚙️) which opens a modal to paste the JSON data from the `codex-environment-viewer.js` script. Once configured, the script automatically finds the correct Codex environment corresponding to the PR's repository and creates a direct link to start a new task in the PR's branch in Codex using that environment.

- **Target Page**: `https://github.com/*/*/pull/*`

### `lody-proper-links-active-context-activity.js`

- **Functionality**: This script adds real anchors to Lody session rows and GitHub PR badges, enriches the top bar with active repository and branch context, prefixes the browser tab title with that context, and marks active agent work in the title. It also cooperates with the Lody sidebar filter script.

- **Target Pages**: `https://lody.ai/*` and `https://*.lody.ai/*`

### `lody-session-sidebar-filter.js`

- **Functionality**: This script adds a low-overhead filter control to the Lody session sidebar. It filters currently rendered sessions by repository, PR number, and branch, supports query prefixes such as `repo:`, `branch:`, and `pr:`, and cooperates with the Lody proper-links script.

- **Target Pages**: `https://lody.ai/*`, `https://www.lody.ai/*`, and `https://*.lody.ai/*`
