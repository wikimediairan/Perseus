/**
 * LinkNode
 *
 * Represents an internal wiki link inside the IR (Software Specification,
 * Section 8, and the fixed architecture's Link Resolution rules). This is
 * the one IR node shape the specification mandates explicitly; all other
 * node shapes are intentionally left open for a later design pass
 * (Software Specification, Section 8.4 — illustrative, not exhaustive).
 */
export interface LinkNode {
  /** Stable identifier for addressing this node from intermediate artifacts (see Pipeline data ownership). */
  id: string;
  /** The original English article title/target, as parsed from the source. */
  originalTarget: string;
  /**
   * The resolved Persian title, or `null` if no Persian equivalent exists.
   * Populated only by the Link Resolution stage — the LLM must never set this.
   */
  resolvedTarget: null | string;
  /** The display text of the link as it appears in the article. */
  label: string;
}
