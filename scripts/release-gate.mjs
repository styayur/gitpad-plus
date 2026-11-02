// SPDX-License-Identifier: AGPL-3.0-only
import { verifyEvidence } from './release-evidence.mjs';
try {
  const evidence=verifyEvidence(process.argv[2]??'release-candidate',process.env.SOURCE_COMMIT);
  console.log('Release evidence, signatures and asset integrity passed for '+evidence.sourceCommit);
} catch(error) { console.error(error.message);process.exitCode=1; }
