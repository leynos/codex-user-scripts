# Integrating GitHub and Codex with Userscripts

This guide explains how to install and use two userscripts from the **codex-user-scripts** repository to streamline your workflow between GitHub and Codex.

- `codex-environment-viewer.js`: This script adds a **View Environments** button to your Codex settings page. It allows you to export your Codex environments as a JSON object, which is then used by the linker script.

- `github-to-codex-linker.js`: On a GitHub pull request (PR) page, this script adds a **Work in Codex** button. Using the JSON data from the first script, it automatically selects the correct Codex environment for the repository and links directly to creation of a new task on that branch in Codex.

## 1. Getting Started: Install Violentmonkey

Because these are userscripts, you first need a browser extension to manage them. This guide uses **Violentmonkey**, a popular open-source userscript manager.

1. **Install Violentmonkey**: Go to [violentmonkey.github.io](https://violentmonkey.github.io/) and select the version for your browser (Chrome, Firefox, Edge, etc.). Install it from your browser's extension store.

2. **Pin the Extension**: For easy access, it's a good idea to pin the Violentmonkey icon to your browser's toolbar.

## 2. Installing the Scripts

You'll install both scripts directly from their raw source files on GitHub. Violentmonkey will automatically detect them and prompt you for installation.

### Install `codex-environment-viewer.js`

This script runs on the Codex environments page (`/codex/settings/environments`). It captures your list of environments and saves them to the userscript storage.

1. Open the Script URL: Navigate to the raw file at:

   https://raw.githubusercontent.com/leynos/codex-user-scripts/main/scripts/codex-environment-viewer.js

2. **Confirm Installation**: Violentmonkey will open a new tab showing the script's details. It will ask you to confirm the installation. Ensure the script has access to `chatgpt.com` and click **Confirm installation**.

### Install `github-to-codex-linker.js`

This script runs on GitHub PR pages, adding the **Work in Codex** button to the sidebar.

1. Open the Script URL: Navigate to the raw file at:

   https://raw.githubusercontent.com/leynos/codex-user-scripts/main/scripts/github-to-codex-linker.js

2. **Confirm Installation**: As before, Violentmonkey will prompt you. Confirm that the script has access to `github.com` and click **Confirm installation**.

**A Note on Updates**: By default, Violentmonkey will check for updates to these scripts periodically. You can manage this behaviour in the extension's settings.

## 3. How to Use the Scripts

The process involves two main steps: first, exporting your environment data from Codex, and second, importing it into the script on GitHub.

### Step 1: Capture Your Codex Environments

1. **Go to Codex Settings**: Log in to ChatGPT and navigate to **Settings → Environments** (or go directly to `https://chatgpt.com/codex/settings/environments`).

2. **Ensure Environment Labels Match**: For the linker to work, your Codex environment labels **must exactly match** your GitHub repository names in the format `owner/repo` (e.g., `leynos/codex-user-scripts`). This is case-sensitive. Take a moment to rename your environments if needed.

3. **Export the Data**: A new **View Environments** button will be visible on the page. Click it to open a modal window. Click the **Copy All for GitHub** button to copy the entire list of your environments as a JSON object to your clipboard.

The copied JSON will look like this:

```
{
  "environments": [
    { "id": "env_abc123", "label": "my-org/my-repo" },
    { "id": "env_def456", "label": "my-org/another-repo" }
  ]
}

```

### Step 2: Configure the GitHub Linker

1. **Open a GitHub PR**: Navigate to any pull request page on GitHub. In the right-hand sidebar, you'll see a new **Codex** section with a settings gear icon (`⚙️`).

2. **Import Your Data**: Click the gear icon. A modal window will appear with a text area. Paste the JSON you copied from Codex into this box and click **Save**. The script will validate the JSON, store it, and reload the page.

3. **Work in Codex**: After the page reloads, the script will find the repository and branch for the current PR. If it finds a matching environment label in your saved data, a green **Work in Codex** button will appear. Clicking this button will take you directly to the Codex interface with the correct environment and branch pre-selected.

If no matching environment is found, the script will display a reminder to configure your environments.

### Updating Your Environments

Whenever you add, remove, or rename an environment in Codex, you'll need to repeat this process. Simply go back to the Codex settings page, copy the new JSON data, and paste it into the GitHub linker's configuration modal on any PR page.

## 4. Troubleshooting

- **"View Environments" button is missing**: Make sure you are on the correct URL: `https://chatgpt.com/codex/settings/environments`. The script only activates on this specific page. Try reloading the page if it doesn't appear.

- **The environment list in the modal is empty**: The script populates the list after the page has finished loading your environments from the server. If you open the modal too quickly, the data may not be ready. Reload the page and wait for your environments to appear before clicking the button.

- **"Work in Codex" button doesn't appear on a PR**: This is usually for one of two reasons:

  1. You haven't imported your environment JSON yet. Click the gear icon (`⚙️`) to paste and save your data.

  2. The environment label does not exactly match the repository's full name (`owner/repo`). Check for typos, and remember that the match is case-sensitive.

- **"Invalid JSON" error**: The data you pasted into the linker's configuration modal is not valid JSON or is missing the top-level `"environments"` array. Go back to Codex, copy the data again, and be careful not to modify it before pasting.

By connecting your GitHub and Codex workflows, these scripts eliminate manual steps, reduce context switching, and create a seamless bridge between code review and development.
