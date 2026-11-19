// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, cpSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
  let original = readFileSync(file, 'utf8');
  const hunks = readFileSync('patches/picomatch@4.0.7.patch', 'utf8').split(/^@@.*@@.*\n/m).slice(1);
  for (const hunk of hunks) {
    const lines = hunk.trimEnd().split('\n');
    const before = lines.filter(line => line.startsWith(' ') || line.startsWith('-')).map(line => line.slice(1)).join('\n');
    const after = lines.filter(line => line.startsWith(' ') || line.startsWith('+')).map(line => line.slice(1)).join('\n');
    assert.equal(original.split(after).length, 2, 'patch hunk matches exactly once');
    original = original.replace(after, before);
  }
  const binding = JSON.parse(readFileSync('patches/picomatch-provenance.json'));
  assert.equal(createHash('sha256').update(original).digest('hex'), binding.upstreamParserSha256);
  writeFileSync(file, original);
  for (const pattern of ['+(*a)', '+(@(*(a)))']) {
    assert.throws(() => execFileSync(process.execPath, ['-e',
      "require(process.argv[1]).isMatch('a'.repeat(96)+'!',process.argv[2])", root, pattern],
      { timeout: 1500, stdio: 'pipe' }), error => error.code === 'ETIMEDOUT');
  }
});
