// lib/ast.js — tier-2 extraction via acorn (pure-JS ESTree AST, zero native build).
// Symbol-level edges: calls, references, inherits, instantiates — with cross-file resolution
// of callees through named/default imports. This is what makes blast radius symbol-level.
//
// tree-sitter is the multi-language path (Phase 4); acorn is the pure-JS implementation for the
// JS/TS family, chosen to keep zero native deps (see refs/extractors.md).

import { parse } from 'acorn';
import { createGraph, addNode, addEdge } from './graph.js';
import { resolveSpec, bareTop } from './paths.js';

/** Generic recursive ESTree walker. */
function walk(node, visit, parents = []) {
  if (!node || typeof node !== 'object' || !node.type) return;
  visit(node, parents);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) {
      for (const c of v) if (c && typeof c === 'object' && c.type) walk(c, visit, [...parents, node]);
    } else if (v && typeof v === 'object' && v.type) {
      walk(v, visit, [...parents, node]);
    }
  }
}

function nameOf(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') {
    const o = nameOf(node.object);
    return o ? `${o}.${node.property?.name ?? ''}` : null;
  }
  if (node.type === 'ThisExpression') return 'this';
  return null;
}

const FN_INIT = new Set(['FunctionExpression', 'ArrowFunctionExpression', 'ClassExpression']);

/**
 * Extract a module's tier-2 facts from source.
 * @returns {{file, defines, imports, calls, news, inherits, parseError}}
 */
export function extractModule(file, source, opts = {}) {
  let ast;
  try {
    ast = parse(source, { ecmaVersion: opts.ecmaVersion || 2023, sourceType: opts.sourceType || 'module', locations: true });
  } catch {
    return { file, defines: [], imports: [], calls: [], news: [], inherits: [], parseError: true };
  }

  const defines = [];
  const defRanges = []; // {name, start, end} for enclosing resolution
  walk(ast, (n, parents) => {
    const exported = parents.some((p) => p.type === 'ExportNamedDeclaration' || p.type === 'ExportDefaultDeclaration');
    if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) {
      defines.push({ name: n.id.name, line: n.loc.start.line, exported });
      defRanges.push({ name: n.id.name, start: n.start, end: n.end });
    } else if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && (exported || (n.init && FN_INIT.has(n.init.type)))) {
      defines.push({ name: n.id.name, line: n.loc.start.line, exported });
      defRanges.push({ name: n.id.name, start: n.start, end: n.end });
    }
  });

  const enclosingDef = (pos) => {
    let best = null;
    for (const d of defRanges) if (pos >= d.start && pos <= d.end && (!best || d.start > best.start)) best = d;
    return best ? best.name : null;
  };

  const imports = [];
  const calls = [];
  const news = [];
  const inherits = [];

  walk(ast, (n) => {
    if (n.type === 'ImportDeclaration') {
      const spec = n.source.value;
      let defaultName = null; let namespace = null; const names = [];
      for (const s of n.specifiers) {
        if (s.type === 'ImportDefaultSpecifier') defaultName = s.local.name;
        else if (s.type === 'ImportNamespaceSpecifier') namespace = s.local.name;
        else if (s.type === 'ImportSpecifier') names.push(s.imported.name);
      }
      imports.push({ spec, defaultName, names, namespace, line: n.loc.start.line });
    } else if (n.type === 'CallExpression') {
      const callee = nameOf(n.callee);
      if (callee) calls.push({ enclosing: enclosingDef(n.start), callee, line: n.loc.start.line });
    } else if (n.type === 'NewExpression') {
      const callee = nameOf(n.callee);
      if (callee) news.push({ enclosing: enclosingDef(n.start), callee, line: n.loc.start.line });
    } else if (n.type === 'ClassDeclaration' && n.superClass && n.id) {
      inherits.push({ child: n.id.name, parent: nameOf(n.superClass), line: n.loc.start.line });
    }
  });

  return { file, defines, imports, calls, news, inherits, parseError: false };
}

/**
 * Assemble a symbol-level graph from parsed modules + manifest.
 * Resolves calls cross-file through imports: F::enclosing -calls-> target::callee.
 */
export function buildSymbolGraph(modules, manifest = {}) {
  const g = createGraph();
  const definesByFile = new Map();

  for (const mod of modules) {
    addNode(g, { id: mod.file, kind: 'file', file: mod.file, line: 1, exported: false, labels: ['file'] });
    const m = new Map();
    for (const d of mod.defines) {
      const id = `${mod.file}::${d.name}`;
      addNode(g, { id, kind: 'symbol', file: mod.file, line: d.line, exported: d.exported, labels: d.exported ? ['exported'] : [] });
      addEdge(g, { from: mod.file, to: id, type: 'defines', tier: 2, inferred: false, evidence: `${mod.file}:${d.line}` });
      m.set(d.name, id);
    }
    definesByFile.set(mod.file, m);
  }

  for (const ext of new Set(manifest.externals || [])) {
    addNode(g, { id: `external:${ext}`, kind: 'external', file: ext, line: 0, exported: false, labels: ['external'] });
  }

  // imports: file->file (or ->external) + imported-name index per file
  const importedByFile = new Map();
  for (const mod of modules) {
    const im = new Map();
    for (const i of mod.imports) {
      const target = resolveSpec(mod.file, i.spec);
      if (target) addEdge(g, { from: mod.file, to: target, type: 'imports', tier: 2, inferred: false, evidence: `${mod.file}:${i.line}` });
      else addEdge(g, { from: mod.file, to: `external:${bareTop(i.spec)}`, type: 'imports', tier: 1, inferred: false, evidence: `${mod.file}:${i.line}` });
      if (i.defaultName) im.set(i.defaultName, { target, importedName: 'default' });
      for (const nm of i.names) im.set(nm, { target, importedName: nm });
      if (i.namespace) im.set(i.namespace, { target, importedName: '*' });
    }
    importedByFile.set(mod.file, im);
  }

  // resolve calls + news + inherits
  for (const mod of modules) {
    const locals = definesByFile.get(mod.file);
    const imp = importedByFile.get(mod.file);
    const encId = (enc) => (enc ? `${mod.file}::${enc}` : mod.file);

    for (const c of mod.calls) {
      const base = (c.callee || '').split('.')[0];
      const localDef = locals.get(base);
      if (localDef) {
        addEdge(g, { from: encId(c.enclosing), to: localDef, type: 'calls', tier: 2, inferred: false, evidence: `${mod.file}:${c.line}` });
        continue;
      }
      const info = imp?.get(base);
      if (info && info.target) {
        const tgtDefines = definesByFile.get(info.target);
        const tgtId = info.importedName === 'default' ? tgtDefines?.get(base) : tgtDefines?.get(info.importedName);
        if (tgtId) addEdge(g, { from: encId(c.enclosing), to: tgtId, type: 'calls', tier: 2, inferred: false, evidence: `${mod.file}:${c.line} -> ${tgtId}` });
        else addEdge(g, { from: encId(c.enclosing), to: info.target, type: 'calls', tier: 2, inferred: true, evidence: `${mod.file}:${c.line} (unresolved ${c.callee})` });
      }
    }
    for (const n of mod.news) {
      const base = (n.callee || '').split('.')[0];
      const localDef = locals.get(base);
      if (localDef) addEdge(g, { from: encId(n.enclosing), to: localDef, type: 'instantiates', tier: 2, inferred: false, evidence: `${mod.file}:${n.line}` });
    }
    for (const h of mod.inherits) {
      if (!h.child || !h.parent) continue;
      const parentId = locals.get(h.parent.split('.')[0]);
      if (parentId) addEdge(g, { from: `${mod.file}::${h.child}`, to: parentId, type: 'inherits', tier: 2, inferred: false, evidence: `${mod.file}:${h.line}` });
    }
  }

  return g;
}
