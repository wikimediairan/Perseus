/**
 * constants.ts
 *
 * Small set of fixed network endpoints used across the core engine.
 * Centralized here (rather than inlined per-module) purely so they're
 * easy to find/change in one place — this is NOT a general configuration
 * system, just named constants for values the architecture treats as
 * fixed (Perseus always translates FROM English Wikipedia, so the source
 * domain is not user-configurable).
 *
 * The TARGET wiki is, deliberately, NOT a constant here anymore — see
 * config/targetWikis.ts. Unlike the source domain, the target is
 * user-selectable (Persian Wikipedia, Tajik Wikipedia, ...), so it lives
 * in PerseusConfig instead of being hardcoded.
 */

/** Source wiki. Fixed per the project's scope (English -> any supported target wiki only). */
export const WIKIPEDIA_DOMAIN = 'en.wikipedia.org';

/** Wikidata's own API, used for Link Resolution (Software Specification, Link Resolution). */
export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
