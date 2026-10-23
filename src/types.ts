/**
 * dsh-chart — Host-only shared types.
 *
 * Wire payloads are inferred from schema.ts (the single authority); this file
 * only carries the host's resolved configuration.
 */

/** Resolved host configuration (the validated Config from index.ts). */
export interface ResolvedConfig {
  /** Rewrite secret-shaped spans before anything crosses to the browser. */
  redactSecrets: boolean
  /** Successful commands kept as reusable steps before the list is capped. */
  maxSteps: number
}
