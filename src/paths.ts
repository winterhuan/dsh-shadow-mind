import { homedir } from "node:os";
import { join } from "node:path";

export const DSH_HOME_ENV = "DSH_HOME";
const DSH_HOME_DIR = ".dsh";

/**
 * Resolve the DeepSeek Harness home directory: `$DSH_HOME` when set and
 * non-blank, otherwise `~/.dsh` (matching `@deepseek-ai/dsh-home-paths`).
 */
export function resolveDshHome(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[DSH_HOME_ENV]?.trim();
  return fromEnv || join(homedir(), DSH_HOME_DIR);
}

/**
 * Root directory holding user-owned Shadow Mind data
 * (`$DSH_HOME/agent/shadow-minds/`).
 */
export function resolveShadowMindRoot(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveDshHome(env), "agent");
}