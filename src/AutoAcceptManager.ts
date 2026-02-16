import * as vscode from 'vscode';

export class AutoAcceptManager {
    private intervalId: NodeJS.Timeout | undefined;
    private enabled: boolean = false;
    private outputChannel: vscode.OutputChannel;

    constructor(initialEnabledState: boolean) {
        this.enabled = initialEnabledState;
        this.outputChannel = vscode.window.createOutputChannel("Antigravity Auto Accept");
        this.startLoop();
    }

    public setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (enabled) {
            this.log('Auto-Accept Enabled');
        } else {
            this.log('Auto-Accept Disabled');
        }
    }

    public isEnabled(): boolean {
        return this.enabled;
    }

    private startLoop(): void {
        const config = vscode.workspace.getConfiguration('antigravity-auto-accept');
        const intervalMs = config.get<number>('interval', 1000);

        this.log(`Starting loop with interval: ${intervalMs}ms`);

        if (this.intervalId) {
            clearInterval(this.intervalId);
        }

        this.intervalId = setInterval(() => {
            if (this.enabled) {
                this.checkAndAcceptSteps();
            }
        }, intervalMs);
    }

    public reloadConfiguration(): void {
        this.startLoop();
    }

    private async checkAndAcceptSteps(): Promise<void> {
        const config = vscode.workspace.getConfiguration('antigravity-auto-accept');
        const commandsToAccept = config.get<string[]>('commands', [
            'antigravity.agent.acceptAgentStep',
            'chatEditing.acceptAllFiles',
            'chatEditing.acceptFile'
        ]);

        for (const cmd of commandsToAccept) {
            try {
                // We don't want to log every single attempt as it would be too noisy
                // potentially only log on success or distinct failure?
                // For now, let's keep it silent unless verbose logging is needed.
                await vscode.commands.executeCommand(cmd);
            } catch (err) {
                // Command might not be available, which is expected.
            }
        }
    }

    private log(message: string): void {
        const config = vscode.workspace.getConfiguration('antigravity-auto-accept');
        const showNotifications = config.get<boolean>('showNotifications', false);

        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);

        if (showNotifications) {
            vscode.window.showInformationMessage(message);
        }
    }

    public dispose(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.outputChannel.dispose();
    }
}
