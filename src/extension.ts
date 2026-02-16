import * as vscode from 'vscode';
import { AutoAcceptManager } from './AutoAcceptManager';
import { StatusBarManager } from './StatusBarManager';

let autoAcceptManager: AutoAcceptManager;
let statusBarManager: StatusBarManager;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Antigravity Auto Accept (Custom) is now active');

    // Load persisted state
    const previousState = context.globalState.get<boolean>('antigravity-auto-accept.enabled', false);

    // Initialize Managers
    autoAcceptManager = new AutoAcceptManager(previousState);
    statusBarManager = new StatusBarManager();

    // Initial Status Update
    statusBarManager.update(autoAcceptManager.isEnabled());

    // Register toggle command
    let toggleCommand = vscode.commands.registerCommand('antigravity-auto-accept.toggle', () => {
        const newState = !autoAcceptManager.isEnabled();
        autoAcceptManager.setEnabled(newState);
        statusBarManager.update(newState);

        // Persist state
        context.globalState.update('antigravity-auto-accept.enabled', newState);

        const statusMsg = newState ? 'ENABLED' : 'DISABLED';
        vscode.window.showInformationMessage(`Auto-Accept is now ${statusMsg}`);
    });

    // Listen for configuration changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('antigravity-auto-accept')) {
            autoAcceptManager.reloadConfiguration();
        }
    }));

    context.subscriptions.push(toggleCommand);
    context.subscriptions.push({ dispose: () => autoAcceptManager.dispose() });
    context.subscriptions.push({ dispose: () => statusBarManager.dispose() });
}

export function deactivate() { }

