// VS Code client. Activates on the first .mu file and launches the
// language server as a Node subprocess. The server file lives next to
// this one (out/server.js); the client wires it to VS Code via the
// standard IPC transport.

import * as path from 'node:path';
import { ExtensionContext, workspace } from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind,
} from 'vscode-languageclient/node.js';

let client: LanguageClient | undefined;

export function activate(context: ExtensionContext): void
{
    const serverModule = context.asAbsolutePath(
        path.join('out', 'server.js'),
    );

    const serverOptions: ServerOptions = {
        run:   { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module:    serverModule,
            transport: TransportKind.ipc,
            options:   { execArgv: ['--nolazy', '--inspect=6009'] },
        },
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: '@pragmatic-lab/mural' }],
        synchronize: {
            configurationSection: '@pragmatic-lab/mural',
            fileEvents: workspace.createFileSystemWatcher('**/*.mu'),
        },
    };

    client = new LanguageClient(
        '@pragmatic-lab/mural',
        'µ-mural language server',
        serverOptions,
        clientOptions,
    );

    void client.start();
}

export function deactivate(): Thenable<void> | undefined
{
    if (client === undefined) return undefined;
    return client.stop();
}
