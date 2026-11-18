# Picomatch 4.0.7 local security backport

GHSA-fc5q-39xc-vjpf / CVE-2026-112366 remains published against all npm
versions through 4.0.7, with no fixed release as inspected on 2026-11-18.
The raw `pnpm audit` report is retained in CI, including this high finding.
No advisory is ignored, dismissed or relabelled by changing the package version.

The installed dependency is still upstream MIT picomatch 4.0.7, pinned by the
registry tarball integrity and `pnpm patchedDependencies`. The tag resolves to
upstream commit `6bb40679c218cefba5d4e9662408c5fdf699a8bb`.
`patches/picomatch-provenance.json` binds the patch and every executable payload,
package manifest and original license. `scripts/picomatch-backport.mjs` checks
every installed copy and runs exploit/compatibility cases in a child with a
three-second process deadline. A missing patch, changed payload, additional
version, new advisory or audit error fails the security gate.

The upstream advisory links PR 194, but its own description explicitly leaves
`+(*a)` exponential. We therefore do not claim that PR fixes this vulnerability.
The local patch extends upstream's existing risky-pattern literalization to a
unescaped, unquoted star in **any** repeated extglob branch, including
a single branch or nested `@(...)` wrapper. Escapes, character classes, ordinary literal repetitions and
the existing safe nested character-class rewrite are preserved. This changes
risky repeated-wildcard matching to literal matching, following upstream's
existing security policy. The explicit upstream `maxExtglobRecursion:false`
opt-out still disables that policy; GitPad+ does not configure it.

Reachability is in developer tooling: Vite, Vitest, typescript-eslint and
tinyglobby/fdir. No application dependency directly imports picomatch; Vite's
Node build tooling is not shipped in the embedded editor. These tools consume
repository/configuration glob patterns, rather than journal text. This is a
build/test supply-chain exposure, not proof of a remotely exploitable native
application endpoint. Removing any one direct tool would leave the others;
replacing all their matcher APIs would carry broader compatibility risk.

The verified backport is an explicit gate result, not a clean-registry-audit
claim. Keep the raw finding visible until an upstream release is available;
then remove the patch only with fresh audit, glob compatibility, complete CI
and native packaging evidence.

Sources: [advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf),
[upstream PR 194](https://github.com/micromatch/picomatch/pull/194),
[pinned parser](https://github.com/micromatch/picomatch/blob/6bb40679c218cefba5d4e9662408c5fdf699a8bb/lib/parse.js).
