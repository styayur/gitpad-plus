// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, cpSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { verifyPicomatchBackport, installedPicomatchRoots } from '../scripts/picomatch-backport.mjs';

test('all installed picomatch copies bind the backport and reject the exploit', () => {
  assert.equal(verifyPicomatchBackport().status, 'VERIFIED_LOCAL_BACKPORT');
});

test('changed executable bytes cannot borrow the backport verification', t => {
  const store = mkdtempSync(join(tmpdir(), 'gitpad-picomatch-tamper-'));
  t.after(() => rmSync(store, { recursive: true }));
  const root = join(store, 'picomatch@4.0.7_fixture', 'node_modules/picomatch');
  cpSync(installedPicomatchRoots()[0], root, { recursive: true });
  writeFileSync(join(root, 'lib/parse.js'), 'changed');
  assert.throws(() => verifyPicomatchBackport(store), /Unpatched or changed/);
});

test('the same exploit times out on the original upstream parser', t => {
  const root = mkdtempSync(join(tmpdir(), 'gitpad-picomatch-baseline-'));
  t.after(() => rmSync(root, { recursive: true }));
  cpSync(installedPicomatchRoots()[0], root, { recursive: true });
  const file = join(root, 'lib/parse.js');
  const patched = readFileSync(file, 'utf8');
  const start = patched.indexOf('  // GHSA-fc5q-39xc-vjpf:');
  const end = patched.indexOf('  if (branches.length > 1)', start);
  assert.ok(start > 0 && end > start);
  writeFileSync(file, patched.slice(0, start) + patched.slice(end));
  assert.throws(() => execFileSync(process.execPath, ['-e',
    "require(process.argv[1]).isMatch('a'.repeat(64)+'!', '+(*a)')", root],
    { timeout: 1500, stdio: 'pipe' }), error => error.code === 'ETIMEDOUT');
});
