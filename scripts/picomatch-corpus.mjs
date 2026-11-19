// SPDX-License-Identifier: AGPL-3.0-only
const patterns = new Set(['+(*)', '*(*a)', '+(*a)', '*(a*)', '+(*?)', '+(*a|b)', '+(a|aa)', '+(ab|abab)']);
for (const body of ['*a', '*(a)', '+(a)', '!(b)', '(a+)', 'a{1,}', '{a,aa}']) {
  let nested = body;
  for (let depth = 0; depth <= 5; depth++) {
    for (const repeat of ['+', '*']) patterns.add(`${repeat}(${nested})`);
    nested = `@(${nested})`;
  }
}
export const exploitCorpus = [...patterns].flatMap(pattern =>
  ['a'.repeat(96) + '!', 'ab'.repeat(48) + '!'].map(subject => ({ pattern, subject })));
export const compatibilityCorpus = [
  ['web/editor.ts', '**/*.ts', true], ['web/editor.js', '**/*.ts', false],
  ['abcabc', '+(abc)', true], ['foobar', '*(foo|bar)', true],
  ['abab', '+([ab])', true], ['aab', '+(*(a)|*(b))', true],
  ['abc', 'a?c', true], ['test.ts', '*.{ts,tsx}', true],
  ['foo', '@(foo|bar)', true], ['aaa', '+(*(a))', true],
  ['aa', '+(a|aa)', false], ['abab', '+(ab|abab)', false],
  ['+*()', '+([*+()])', true], ['a+a+', '+(a\\+)', true]
];
