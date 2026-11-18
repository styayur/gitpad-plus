// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
export function installedPicomatchRoots() {
  const output = process.platform === 'win32'
    ? execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'pnpm list picomatch --depth Infinity --json'], { encoding: 'utf8', timeout: 30_000, maxBuffer: 10_000_000 })
    : execFileSync('pnpm', ['list', 'picomatch', '--depth', 'Infinity', '--json'], { encoding: 'utf8', timeout: 30_000, maxBuffer: 10_000_000 });
  const roots = new Set();
  function visit(item) {
    for (const key of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name, entry] of Object.entries(item[key] ?? {})) {
        if (name === 'picomatch') {
          if (!entry.path || entry.version !== '4.0.7') throw Error('Unreviewed installed picomatch inventory');
          roots.add(resolve(entry.path));
        }
        visit(entry);
      }
    }
  }
  for (const project of JSON.parse(output)) visit(project);
  if (!roots.size) throw Error('Missing reachable picomatch inventory');
  return [...roots];
}
export function verifyPicomatchBackport(store) {
  const binding = JSON.parse(readFileSync('patches/picomatch-provenance.json'));
  if (binding.advisory !== 'GHSA-fc5q-39xc-vjpf' ||
      digest('patches/picomatch@4.0.7.patch') !== binding.patchSha256) throw Error('Picomatch patch identity mismatch');
  const roots = store ? readdirSync(store).filter(name => /^picomatch@/.test(name)).map(folder => join(store, folder, 'node_modules/picomatch')) : installedPicomatchRoots();
  if (!roots.length) throw Error('Missing installed picomatch inventory');
  const checked = [];
  for (const root of roots) {
    const meta = JSON.parse(readFileSync(join(root, 'package.json')));
    if (meta.version !== '4.0.7') throw Error('Unreviewed picomatch version: ' + meta.version);
    for (const [file, expected] of Object.entries(binding.installedSha256)) {
      if (digest(join(root, file)) !== expected) throw Error('Unpatched or changed picomatch payload: ' + file);
    }
    // Bound the entire child process: a regression must fail, never hang CI.
    execFileSync(process.execPath, ['--input-type=commonjs', '-e', `
      const assert = require('node:assert/strict');
      const pm = require(process.argv[1]);
      for (const pattern of ['+(*)', '*(*a)', '+(*a)', '*(a*)', '+(*?)', '+(*a|b)', '+(@(*a))', '*(a@(*a))', '+(@(*))']) {
        assert.equal(pm.isMatch('a'.repeat(64) + '!', pattern), false, pattern);
        assert.equal(pm.isMatch(pattern, pattern), true, 'risky pattern remains literal');
      }
      for (const [value, pattern, expected] of [
        ['web/editor.ts', '**/*.ts', true], ['web/editor.js', '**/*.ts', false],
        ['abcabc', '+(abc)', true], ['foobar', '*(foo|bar)', true],
        ['abab', '+([ab])', true], ['aab', '+(*(a)|*(b))', true],
        ['abc', 'a?c', true], ['test.ts', '*.{ts,tsx}', true]
      ]) assert.equal(pm.isMatch(value, pattern), expected, pattern);
    `, root], { timeout: 3000, stdio: 'pipe' });
    checked.push(root);
  }
  return { advisory: binding.advisory, status: 'VERIFIED_LOCAL_BACKPORT', checked };
}
