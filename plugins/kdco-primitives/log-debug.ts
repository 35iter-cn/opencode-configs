/**
 * Debug logger for kdco registry plugins.
 *
 * Provides a unified interface for logging debug-level messages that works with
 * both the OpenCode client (when available) and console fallback.
 *
 * @module kdco-primitives/log-debug
 */

import type { OpencodeClient } from "./types";

/**
 * Log a debug message via OpenCode client or console fallback.
 *
 * Uses the OpenCode logging API when a client is available, which integrates
 * with the OpenCode UI log panel. Falls back to console.debug for CLI contexts
 * or when no client is provided.
 *
 * @param client - Optional OpenCode client for proper logging integration
 * @param service - Service name for log categorization (e.g., "worktree", "delegation")
 * @param message - Debug message to log
 *
 * @example
 * ```ts
 * // With client - logs to OpenCode UI
 * logDebug(client, "project-id", "No .git found, using path hash")
 *
 * // Without client - logs to console
 * logDebug(undefined, "project-id", "No .git found, using path hash")
 * ```
 */
export function logDebug(
  client: OpencodeClient | undefined,
  service: string,
  message: string,
): void {
  // Guard: No client available, use console fallback (Law 1: Early Exit)
  if (!client) {
    console.debug(`[${service}] ${message}`);
    return;
  }

  // Happy path: Use OpenCode logging API
  client.app
    .log({
      body: { service, level: "debug", message },
    })
    .catch(() => {
      // Silently ignore logging failures - don't disrupt caller
    });
}