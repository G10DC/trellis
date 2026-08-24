// Regressione: un controllo di integrita' su un database inesistente non e' "ok".
//
// integrityCheck restituiva { ok: true, dangling: [] } per qualunque percorso,
// perche' DatabaseSync crea il file e ensureSchema riempie tabelle vuote. Un
// chiamante puntato sul file sbagliato riceveva un certificato di salute per un
// database che non aveva mai letto.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { integrityCheck } from '../lib/persist.js';

test('a database that did not exist is reported as unmeasured', () => {
  const p = path.join(os.tmpdir(), `trellis-mai-${Date.now()}.db`);
  const r = integrityCheck(p);

  assert.equal(r.measured, false, 'nothing was checked');
  assert.equal(r.checked, 0);
  assert.equal(r.existed, false);
  assert.match(r.honest, /describes nothing/);
  fs.rmSync(p, { force: true });
});

test('an existing but empty database is unmeasured too', () => {
  const p = path.join(os.tmpdir(), `trellis-vuoto-${Date.now()}.db`);
  integrityCheck(p);           // lo crea
  const r = integrityCheck(p); // ora esiste, ma resta senza archi

  assert.equal(r.existed, true);
  assert.equal(r.measured, false);
  assert.equal(r.checked, 0);
  fs.rmSync(p, { force: true });
});
