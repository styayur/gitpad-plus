# Picomatch 4.0.7 local security backport

GHSA-fc5q-39xc-vjpf / CVE-2026-112366 was withdrawn upstream at
2026-11-18T15:38:56Z. No fixed npm release was published. The linked maintainer
discussion disputes its classification and advises against untrusted glob input.
The raw `pnpm audit` report is retained in CI with its actual registry result.
The gate requires zero raw findings; no advisory exception remains.
No advisory is ignored, dismissed or relabelled by changing the package version.

The installed dependency is still upstream MIT picomatch 4.0.7, pinned by the
registry tarball integrity and `pnpm patchedDependencies`. The tag resolves to
upstream commit `6bb40679c218cefba5d4e9662408c5fdf699a8bb`.
`patches/picomatch-provenance.json` binds the patch and every executable payload,
package manifest and original license. `scripts/picomatch-backport.mjs` checks
every installed copy and runs exploit/compatibility cases in a child with a
three-second process deadline. A missing patch, changed payload, additional
version, new advisory or audit error fails the security gate. Installed hardening
verification runs even when the withdrawn advisory is absent from the raw audit.

The upstream advisory links PR 194, but its own description explicitly leaves
`+(*a)` exponential. We therefore do not claim that PR fixes this vulnerability.
The local patch preserves the existing proven character-star flattening, then
literalizes other nested groups/braces or unbounded syntax in repeated bodies.
It also rejects ambiguous literal-prefix alternatives and complex alternatives
whose disjointness has not been established. This deliberately makes some
otherwise valid nested patterns literal; ordinary non-repeating extglobs,
character classes and simple non-overlapping repetitions retain their behavior.
The explicit upstream `maxExtglobRecursion:false` opt-out remains unchanged;
GitPad+ does not configure it.

The earlier patch SHA256 `25932adf...` was withdrawn after independent testing
found `+(@(*(a)))` and `+(@(+(a)))` still hang. Retained evidence records those
failures. The replacement corpus varies wrapper depth, repeat operators,
subjects and parser options; it also preserves `+(*(a)|*(b))`. This is bounded
corpus evidence for the current backport, not a proof about all regular expressions.

Reachability is in developer tooling: Vite, Vitest, typescript-eslint and
tinyglobby/fdir. No application dependency directly imports picomatch; Vite's
Node build tooling is not shipped in the embedded editor. These tools consume
repository/configuration glob patterns, rather than journal text. This is a
build/test supply-chain exposure, not proof of a remotely exploitable native
application endpoint. Removing any one direct tool would leave the others;
replacing all their matcher APIs would carry broader compatibility risk.

This is deliberate hardening of trusted repository-controlled tooling. No
attack-controlled glob endpoint has been identified in the shipped application.
The bounded corpus is not a universal matcher-safety guarantee. Keep raw audits
unchanged and fail on any finding; the installed hardening check is independent.
Review a future upstream replacement with fresh audit and compatibility evidence.

Sources: [advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf),
[upstream PR 194](https://github.com/micromatch/picomatch/pull/194),
[pinned parser](https://github.com/micromatch/picomatch/blob/6bb40679c218cefba5d4e9662408c5fdf699a8bb/lib/parse.js).
