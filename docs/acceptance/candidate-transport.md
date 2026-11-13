# Local signed candidate to hosted verification

The permanent Android identity stays in the local DPAPI workflow. Final Windows/Android files are built and qualified locally; `.github/workflows/release.yml` then independently downloads their Actions artifact and executes the actual release verifier. This transport adds no tag, draft or public release.

## Flow

1. After merge, use exact clean main with successful corresponding CI. Download the official `actions/upload-artifact` compiled uploader at the commit/path in `scripts/candidate-upload-tool.json` into a separate tool directory. Retain its MIT license. Verify the recorded SHA-256 before execution; the helper checks it again. This is the same pinned action already used by repository CI, not a global software installation or a new application dependency.
2. Run a transport-only check before final candidate builds:

   ```powershell
   node scripts/stage-local-candidate.mjs --probe <verified-upload-action.js> <existing-report-directory>/transport-probe.json
   ```

   It generates two disposable text files and uploads **candidate-transport-probe**. The downloaded bytes must match. It creates no application acceptance record and cannot satisfy `release.yml`, which requires **release-candidate**.
3. Prepare the immutable final candidate directory, its real `acceptance.json`, all 17 gates and `SHA256SUMS.txt`. Then run:

   ```powershell
   node scripts/stage-local-candidate.mjs <candidate-directory> <verified-upload-action.js> <report-outside-candidate.json>
   ```

   The actual local release gate must succeed before and after upload. The helper requires clean source equal to current remote main and successful exact-main CI. It binds the upload to the manifest hash and records the hosted run/artifact IDs. Keep its report outside the candidate, whose file inventory is frozen.
4. Dispatch the existing verifier using the successful candidate upload run:

   ```powershell
   gh workflow run release.yml --repo styayur/gitpad-plus --ref main -f source_commit=<exact-main-SHA> -f candidate_run_id=<successful-upload-run-ID>
   ```

   That workflow's own gate result, source SHA and downloaded artifact checks remain mandatory. A transport success is not a release-ready claim.

## Credential handling and boundaries

The receive workflow runs on a GitHub-hosted runner with read-only repository/Actions API permissions. Its small local JavaScript action uses only Node built-ins to encrypt its job-scoped artifact-service context to a freshly generated RSA public key. The local helper retains the private key in process memory, downloads only ciphertext and validates repository, source SHA, run ID, nonce, purpose and manifest hash before opening it. AES-256-GCM authenticates that context; RSA-OAEP-SHA256 wraps the random data key. The runtime credential is supplied to the pinned uploader through its child environment, never command arguments or repository files.

The official uploader prints `add-mask` commands containing temporary blob signatures when run outside Actions. Its entire output is therefore captured in memory, never streamed into local logs. Failure diagnostics remove registered mask values, tokens and signed URLs before displaying a bounded error. Success reports contain public run/artifact metadata only. The helper creates the `GITHUB_OUTPUT` command file before launching the action, matching the hosted runner contract; that file contains artifact outputs only. Cleanup verifies the resolved temporary target before removing it. The helper cancels its own unsuccessful receive run when possible.

No self-hosted runner is registered. No Android signing material is uploaded. The ephemeral RSA transport key is unrelated to the permanent Android signing identity. The receive workflow has a bounded lifetime and waits for a finalized artifact with the appropriate fixed name. Independent remote verification and the two explicit user approvals for tag/draft and public prerelease remain separate steps.

Primary implementation references: GitHub's [Node action metadata](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax), [runner artifact-context environment](https://github.com/actions/runner/blob/main/src/Runner.Worker/Handlers/NodeScriptActionHandler.cs), and the [exact official uploader revision](https://github.com/actions/upload-artifact/tree/ea165f8d65b6e75b540449e92b4886f43607fa02). The pinned compiled uploader Git blob is `89238fa3eb49937ea82c5d82006ee1fc6c6abaae`; SHA-256 is `0165b8a75330f3228f2c7a234b4ff8a107b9139c2b519147f4c8e9fe99b262d8`.
