// lib/pr.js — PR-level impact (Phase 5): "what to test / what could break" from a git diff.
// Local, privacy-preserving (no third-party LLM egress — unlike blast-radius-analyzer's anti-pattern).

import { blastRadius } from './graph.js';

/** Parse a unified git diff into changed files + hunk line-ranges. */
export function parseDiff(diffText) {
  const files = [];
  let cur = null;
  for (const line of diffText.split('\n')) {
    const m = line.match(/^\+\+\+\s+b\/(.+)$/);
    if (m) { cur = { file: m[1], hunks: [] }; files.push(cur); continue; }
    const h = line.match(/^@@\s+-\d+(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (h && cur) cur.hunks.push({ start: +h[2], len: +(h[3] || 1) });
  }
  return files;
}

/** Symbols defined in `file` whose declaration line falls inside a hunk range. */
export function changedSymbols(graph, file, hunks) {
  const syms = [];
  for (const n of graph.nodes.values()) {
    if (n.file !== file || n.kind !== 'symbol') continue;
    if (hunks.some((h) => n.line >= h.start && n.line <= h.start + h.len)) syms.push(n.id);
  }
  return syms;
}

/**
 * @param {object} graph
 * @param {string} diffText unified git diff
 * @returns {{files, changedSymbols:string[], couldBreak:string[], toTest:string[]}}
 */
export function prImpact(graph, diffText) {
  const files = parseDiff(diffText);
  const couldBreak = new Set();
  const toTest = new Set();
  const changed = [];
  for (const f of files) {
    const syms = changedSymbols(graph, f.file, f.hunks);
    changed.push(...syms);
    for (const s of syms) {
      for (const id of blastRadius(graph, s, { depth: 5 }).keys()) {
        couldBreak.add(id);
        toTest.add(id);
      }
    }
    if (!syms.length) toTest.add(f.file); // changed file, no symbol hit -> test the file itself
  }
  return {
    files: files.map((f) => f.file),
    changedSymbols: changed,
    couldBreak: [...couldBreak],
    toTest: [...toTest],
  };
}
