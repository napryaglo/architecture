// Tooling barrel — wraps the compiler for build-time and command-line
// integration. The compiler itself is host-agnostic (just produces JS
// text); these wrappers adapt it to specific runtimes (Vite plugin host,
// Node CLI).

export {
    vitePluginMural,
    type MuralPluginOptions,
    type VitePlugin,
} from './vite-plugin.js';
export {
    runCLI,
    type CliIo,
} from './cli.js';
