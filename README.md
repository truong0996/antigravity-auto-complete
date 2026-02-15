# Antigravity Auto Accept (Custom)

A VS Code extension for Antigravity IDE that automatically accepts agent steps (terminal commands, file writes, and code edits) for hands-free automation.

## Features
- **Status Bar Toggle**: Easily enable or disable auto-acceptance from the status bar.
- **Visual Feedback**: 
  - `$(check) Auto-Accept: ON` (Green)
  - `$(x) Auto-Accept: OFF` (Red)
- **Keyboard Shortcut**: Toggle with `Ctrl+Alt+Shift+U`.
- **Intelligent Acceptance**: Automatically triggers `antigravity.agent.acceptAgentStep` and `chatEditing.acceptAllFiles`.

## Local Build and Installation

To build and install the extension locally, follow these steps:

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Compile and Package**:
   ```bash
   npm run compile
   npx @vscode/vsce package --no-git-tag-version --allow-missing-repository --allow-star-activation
   ```

3. **Install to Antigravity IDE**:
   ```bash
   antigravity --install-extension antigravity-auto-accept-custom-0.0.1.vsix
   ```

4. **Reload Window**:
   Open the Command Palette (`Ctrl+Shift+P`) and run `Developer: Reload Window`, or restart the IDE.

## Development
- `F5` to start debugging in an Extension Development Host.

## License
MIT
