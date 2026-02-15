import * as vscode from 'vscode';

let autoAcceptEnabled = true;
let statusBarItem: vscode.StatusBarItem;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Antigravity Auto Accept (Custom) is now active');

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'antigravity-auto-accept.toggle';
    updateStatusBarItem();
    statusBarItem.show();

    // Register toggle command
    let toggleCommand = vscode.commands.registerCommand('antigravity-auto-accept.toggle', () => {
        autoAcceptEnabled = !autoAcceptEnabled;
        updateStatusBarItem();
        vscode.window.showInformationMessage(`Auto-Accept is now ${autoAcceptEnabled ? 'ENABLED' : 'DISABLED'}`);
    });

    context.subscriptions.push(statusBarItem, toggleCommand);

    const interval = setInterval(() => {
        if (autoAcceptEnabled) {
            checkAndAcceptSteps();
        }
    }, 1000);

    context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

function updateStatusBarItem() {
    if (autoAcceptEnabled) {
        statusBarItem.text = `$(check) Auto-Accept: ON`;
        statusBarItem.color = '#4CAF50'; // Green
    } else {
        statusBarItem.text = `$(x) Auto-Accept: OFF`;
        statusBarItem.color = '#F44336'; // Red
    }
}

async function checkAndAcceptSteps() {
    // These are the actual command IDs found in discovery.log
    const commandsToAccept = [
        'antigravity.agent.acceptAgentStep',
        'chatEditing.acceptAllFiles',
        'chatEditing.acceptFile'
    ];

    for (const cmd of commandsToAccept) {
        try {
            await vscode.commands.executeCommand(cmd);
        } catch (err) {
            // Command might not be available at this moment.
        }
    }
}

export function deactivate() { }
