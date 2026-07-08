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
