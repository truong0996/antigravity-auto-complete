# Antigravity Auto Accept (Custom)

Automatically accepts Antigravity agent steps — file edits, terminal run commands, and confirmations — without requiring manual clicks.

## How It Works

This extension connects to Antigravity's built-in remote debugger via the [Chrome DevTools Protocol (CDP)](https://chromedevtools.github.io/devtools-protocol/) on port **9000**. It traverses all browser frames (including cross-origin iframes where the agent UI lives), finds **Run / Accept / Accept All** buttons by their visible text, and clicks them automatically.

> **Why CDP instead of VS Code commands?**
> The "Run command?" dialog is rendered inside a cross-origin `vscode-webview://` iframe. VS Code's command API cannot reach it — only CDP DOM access can.

## ⚡ Performance

| Feature | Detail |
|---|---|
| Startup delay | 2-second warmup before first scan |
| Fast polling | 500ms when agent is active |
| Idle polling | 2000ms after 10s of no clicks |
| Connection | WebSocket connections are cached and reused |

## 🔒 Security

- The scan script reads **only button text** to find click targets
- **No editor content, chat messages, tokens, or credentials are ever read**
- The CDP connection is strictly **localhost (127.0.0.1)** — not exposed to any network

## Setup (One-Time)

### Step 1: Enable the CDP Debug Port

Open `C:\Users\<YourUser>\.antigravity\argv.json` (create if it doesn't exist) and add:

```jsonc
{
    "enable-crash-reporter": true,
    "crash-reporter-id": "your-existing-id",

    // Required for auto-accept CDP connection
    "remote-debugging-port": "9000"
}
```

> **Note:** You must **fully restart Antigravity** (not just reload window) after editing this file.

### Step 2: Install the Extension

```bash
antigravity --install-extension antigravity-auto-accept-custom-0.0.1.vsix
```

### Step 3: Reload Window

Press `Ctrl+Shift+P` → `Developer: Reload Window`

The status bar will show **✅ Auto-Accept: ON**.

## Toggle

- **Keyboard**: `Ctrl+Alt+Shift+U` (Mac: `Cmd+Alt+Shift+U`)
- **Status Bar**: Click the status bar item

## Output Channel

Open **"Antigravity Auto Accept"** in the Output panel to see real-time logs:
```
[2026-02-20T09:19:36Z] Clicked: run on "My Project - Antigravity"
```

## Local Build

```bash
npm install
npm run compile
npx @vscode/vsce package --allow-missing-repository --allow-star-activation
antigravity --install-extension antigravity-auto-accept-custom-0.0.1.vsix
```

## Requirements

- Antigravity IDE with `remote-debugging-port: "9000"` in `argv.json`
- The extension uses the [`ws`](https://github.com/websockets/ws) WebSocket library (bundled)
