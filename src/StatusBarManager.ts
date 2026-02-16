import * as vscode from 'vscode';

export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'antigravity-auto-accept.toggle';
        this.statusBarItem.show();
    }

    public update(enabled: boolean): void {
        if (enabled) {
            this.statusBarItem.text = `$(check) Auto-Accept: ON`;
            this.statusBarItem.color = '#4CAF50'; // Green
            this.statusBarItem.tooltip = 'Click to Disable Auto-Accept';
        } else {
            this.statusBarItem.text = `$(x) Auto-Accept: OFF`;
            this.statusBarItem.color = '#F44336'; // Red
            this.statusBarItem.tooltip = 'Click to Enable Auto-Accept';
        }
    }

    public dispose(): void {
        this.statusBarItem.dispose();
    }
}
