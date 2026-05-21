/**
 * Schema for the project documentation site (both the in-app React view
 * and the standalone HTML build). Content is data; renderers consume it.
 *
 * Three layers per topic, mirroring the user's request:
 *   1. abstract   — what it does and why, in plain prose
 *   2. iface      — Java-style interface declaring how methods/types
 *                   cooperate (signatures, no bodies)
 *   3. pseudocode — step-by-step logic of the actual behavior
 */

export type DocStatus = 'shipped' | 'partial' | 'wireframe' | 'generated';

export interface DocLayers {
  abstract: string;
  iface: string;
  pseudocode: string;
}

export interface DocTopic {
  id: string;
  title: string;
  /** Short one-line summary for the sidebar / search. */
  summary: string;
  /** Implementation status — shown as a badge. */
  status: DocStatus;
  /** Source files this topic documents (repo-relative paths). */
  files: string[];
  layers: DocLayers;
}

export interface DocCategory {
  id: string;
  title: string;
  /** One paragraph: what this category is and why it exists. */
  intro: string;
  topics: DocTopic[];
}
