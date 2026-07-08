// lib/paths.js — path/spec helpers. Dependency-free (foundation layer, imported by both
// extract.js and ast.js) to break the would-be circular import between them.

/** Top-level package name from a bare spec ("@scope/pkg/sub" -> "@scope/pkg", "express" -> "express"). */
export function bareTop(spec) {
  return spec.replace(/^(@[^/]+\/[^/]+).*/, '$1').replace(/^([^@][^/]*).*/, '$1');
}

/** Resolve a relative module spec to a project-relative path (best-effort, no FS). null for bare specs. */
export function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null; // bare/external — caller resolves via manifest
  const dir = fromFile.replace(/[^/]+$/, '');
  const parts = [];
  for (const part of (dir + spec).split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

const RESOLVE_EXTS = ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts', 'jsx', 'tsx'];

/**
 * Resolve an extension-less module path to an actual file id present in `fileSet`.
 * Tries the exact path, common extensions, and `/index.<ext>` (barrel) — no filesystem access.
 * Returns the matched id, or null if no file matches.
 */
export function resolveFile(base, fileSet) {
  if (fileSet.has(base)) return base;
  for (const ext of RESOLVE_EXTS) if (fileSet.has(`${base}.${ext}`)) return `${base}.${ext}`;
  for (const ext of RESOLVE_EXTS) if (fileSet.has(`${base}/index.${ext}`)) return `${base}/index.${ext}`;
  return null;
}
