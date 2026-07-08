// lib/langs.js — per-language capability metadata (Phase 4).
// The trust gradient: never present all languages as equally trustworthy (RISKS.md #4).
// `tiers` = extraction tiers available; `trust` = nominal confidence of those edges.

export const LANGS = {
  js: { name: 'JavaScript / TypeScript', tiers: [0, 1, 2], trust: 'high' },
  py: { name: 'Python', tiers: [0, 1], trust: 'medium' },
};

export function capability(lang) {
  return LANGS[lang] || null;
}

export function supportedLangs() {
  return Object.entries(LANGS).map(([id, v]) => ({ id, ...v }));
}
