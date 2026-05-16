#!/usr/bin/env node

/**
 * Console application entry point.
 */

interface CliArgs {
  args: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): CliArgs {
  const args: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      args.push(token);
    }
  }

  return { args, flags };
}

function main(): void {
  const { args, flags } = parseArgs(process.argv.slice(2));

  if (flags.help || flags.h) {
    console.log("Usage: mural [options] [args]");
    console.log("\nOptions:");
    console.log("  --help, -h    Show this help message");
    return;
  }

  console.log("Hello from mural!");

  if (args.length > 0) {
    console.log("Args:", args);
  }
  if (Object.keys(flags).length > 0) {
    console.log("Flags:", flags);
  }
}

try {
  main();
} catch (error) {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
