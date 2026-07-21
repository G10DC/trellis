// lib/extract.js — tiered dependency extraction.
//
// tier 0: regex — import/require statements + symbol definitions (functions/classes/consts).
// tier 1: manifest — package.json externals + entry points.
// tier 2: acorn AST (lib/ast.js) — calls/references/inheritance, cross-file resolution. Shipped. see refs/extractors.md
// tier 3: processing engine — implicit deps (DI, events, reflection, dynamic dispatch). Shipped (lib/model-edges.js merge; run templates/tier3-extract.md).
//
// Honest by design: every edge carries its tier. tier-0 edges are SYNTACTIC and over-/under-approximate;
// the gate never claims a proven breakage set (see RISKS.md). MVP scope: JS/TS family, file-level blast
// radius via imports + symbol definitions. Symbol-level CALLS need tier 2.

import { readFile as fsReadFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { createGraph, addNode, addEdge } from './graph.js';
import { resolveSpec, bareTop } from './paths.js';
import { extractModule, buildSymbolGraph } from './ast.js';

const LANG_BY_EXT = {
  '.js': 'js', '.jsx': 'js', '.mjs': 'js', '.cjs': 'js',
  '.ts': 'js', '.tsx': 'js', '.mts': 'js', '.cts': 'js',
  '.py': 'py',
};

export function detectLang(filePath) {
  const m = filePath.match(/\.[a-z0-9]+$/i);
  return m ? (LANG_BY_EXT[m[0].toLowerCase()] || null) : null;
}

const RE = {
  // import X from 'p'; import {a, b as c} from 'p'; import * as N from 'p'; import 'p'; const x = require('p')
  import:
    /import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:,\s*\*\s*as\s+([\w$]+))?\s*from\s*['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // export? async? function|class|const|let|var NAME
  def: /(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g,
};

// Python tier-0 patterns (Phase 4). Module = file; `from .mod import X` -> relative; bare -> external.
const RE_PY = {
  importFrom: /^\s*from\s+([.\w]+)\s+import\s+.+$/gm,
  importBare: /^\s*import\s+([.\w]+(?:\s*,\s*[.\w]+)*)/gm,
  def: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/gm,
  cls: /^\s*class\s+([A-Za-z_]\w*)/gm,
};

function lineOf(source, idx) {
  let n = 1;
  for (let i = 0; i < idx; i++) if (source[i] === '\n') n++;
  return n;
}

function nodeId(file, name) {
  return `${file}::${name}`;
}

// path/spec helpers (bareTop, resolveSpec) live in lib/paths.js — imported above.


/**
 * Extract tier-0 nodes + edges from a single source file's text.
 * @param {string} file project-relative path (posix)
 * @param {string} source file contents
 * @param {{lang?:string}} [opts]
 * @returns {{nodes:object[], edges:object[], unresolved:object[]}}
 */
/** Convert a Python module spec to a JS-style relative path, or null if absolute (-> external). */
function pySpecToRel(spec) {
  let dots = 0;
  while (spec[dots] === '.') dots++;
  if (dots === 0) return null; // absolute import (pkg.mod) -> external
  const rest = spec.slice(dots).replace(/\./g, '/');
  return (dots === 1 ? './' : '../'.repeat(dots - 1)) + rest;
}

/** Run a global regex over `source`, calling visit(match, line) for each match. Shared by JS + Python scanners. */
function scan(regex, source, visit) {
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(source))) visit(m, lineOf(source, m.index));
}

function extractPython(file, source) {
  const nodes = [{ id: file, kind: 'file', file, line: 1, exported: false, labels: ['file'] }];
  const edges = [];
  const unresolved = [];
  const addDef = (name, line, exported = false) => {
    const id = nodeId(file, name);
    nodes.push({ id, kind: 'symbol', file, line, exported, labels: exported ? ['exported'] : [] });
    edges.push({ from: file, to: id, type: 'defines', tier: 0, inferred: false, evidence: `${file}:${line}` });
  };
  scan(RE_PY.def, source, (m, line) => addDef(m[1], line));
  scan(RE_PY.cls, source, (m, line) => addDef(m[1], line));
  scan(RE_PY.importFrom, source, (m, line) => {
    const spec = m[1];
    const rel = pySpecToRel(spec);
    const target = rel ? resolveSpec(file, rel) : null;
    if (target) edges.push({ from: file, to: `${target}.py`, type: 'imports', tier: 0, inferred: false, evidence: `${file}:${line}` });
    else unresolved.push({ file, spec, line });
  });
  scan(RE_PY.importBare, source, (m, line) => {
    for (const spec of m[1].split(',').map((s) => s.trim()).filter(Boolean)) unresolved.push({ file, spec, line });
  });
  return { nodes, edges, unresolved };
}

export function extractFile(file, source, { lang } = {}) {
  lang = lang || detectLang(file) || 'js';
  if (lang === 'py') return extractPython(file, source);
  const nodes = [{ id: file, kind: 'file', file, line: 1, exported: false, labels: ['file'] }];
  const edges = [];
  const unresolved = [];

  scan(RE.def, source, (m, line) => {
    const name = m[1];
    const exported = /^export\b/.test(source.slice(m.index, m.index + 8));
    nodes.push({ id: nodeId(file, name), kind: 'symbol', file, line, exported, labels: exported ? ['exported'] : [] });
    edges.push({ from: file, to: nodeId(file, name), type: 'defines', tier: 0, inferred: false, evidence: `${file}:${line}` });
  });

  scan(RE.import, source, (m, line) => {
    const spec = m[4] || m[5];
    const target = resolveSpec(file, spec);
    if (!target) { unresolved.push({ file, spec, line }); return; }
    edges.push({ from: file, to: target, type: 'imports', tier: 0, inferred: false, evidence: `${file}:${line}` });
  });

  return { nodes, edges, unresolved };
}

/** tier 1: parse package.json into externals + entrypoints. */
export function extractManifest(pkgText) {
  const pkg = typeof pkgText === 'string' ? JSON.parse(pkgText) : pkgText;
  const externals = Object.keys({
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
    ...pkg.optionalDependencies,
  });
  const entrypoints = [];
  const pushStr = (v) => {
    if (typeof v === 'string') entrypoints.push(v);
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) pushStr(v[k]);
  };
  pushStr(pkg.main);
  pushStr(pkg.module);
  pushStr(pkg.types);
  pushStr(pkg.bin);
  pushStr(pkg.exports);
  return { externals, entrypoints, name: pkg.name, version: pkg.version };
}

async function defaultReadFile(rel, root) {
  return fsReadFile(join(root, ...rel.split('/')), 'utf8');
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.trellis', 'out', 'coverage']);

async function defaultListFiles(root) {
  const out = [];
  async function walk(dir) {
    let ents;
    try { ents = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await walk(join(dir, e.name)); }
      else out.push(relative(root, join(dir, e.name)).split(sep).join('/'));
    }
  }
  await walk(root);
  return out;
}

/**
 * Build a graph from a project root. deps injectable for offline tests.
 * @param {string} root absolute project path
 * @param {{readFile?:Function, listFiles?:Function, langs?:string[]}} [deps]
 */
export async function buildGraph(root, deps = {}) {
  const readFile = deps.readFile || defaultReadFile;
  const listFiles = deps.listFiles || defaultListFiles;
  const wantTier2 = deps.tiers == null ? true : deps.tiers.includes(2);
  const manifest = { externals: [], entrypoints: [] };
  const files = await listFiles(root);

  const modules = [];       // tier-2 (acorn) path
  const g = createGraph();  // tier-0 fallback path
  const unresolved = [];

  for (const f of files) {
    if (/(^|\/)package\.json$/.test(f) && !/node_modules/.test(f)) {
      try {
        const m = extractManifest(await readFile(f, root));
        manifest.externals.push(...m.externals);
        manifest.entrypoints.push(...m.entrypoints);
      } catch { /* malformed manifest — skip, non-fatal */ }
      continue;
    }
    const lang = detectLang(f);
    if (!lang) continue;
    let src;
    try { src = await readFile(f, root); } catch { continue; }

    if (wantTier2 && lang === 'js') {
      modules.push(extractModule(f, src));
    } else {
      const r = extractFile(f, src, { lang });
      for (const n of r.nodes) addNode(g, n);
      for (const e of r.edges) addEdge(g, e);
      unresolved.push(...r.unresolved);
    }
  }

  if (wantTier2 && modules.length) {
    const graph = buildSymbolGraph(modules, manifest);
    return { graph, manifest, unresolved: [], tier: 2 };
  }

  // tier 0/1 fallback
  for (const ext of new Set([...manifest.externals, ...unresolved.map((u) => bareTop(u.spec))])) {
    addNode(g, { id: `external:${ext}`, kind: 'external', file: ext, line: 0, exported: false, labels: ['external'] });
  }
  for (const u of unresolved) {
    addEdge(g, { from: u.file, to: `external:${bareTop(u.spec)}`, type: 'imports', tier: 1, inferred: false, evidence: `${u.file}:${u.line}` });
  }
  return { graph: g, manifest, unresolved, tier: 0 };
}
