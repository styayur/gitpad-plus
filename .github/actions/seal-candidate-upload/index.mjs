// SPDX-License-Identifier: AGPL-3.0-only
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {sealCapability} from '../../../scripts/candidate-capability.mjs';
const env=process.env;
if(env.GITHUB_REF!=='refs/heads/main'||env.INPUT_SOURCE_COMMIT!==env.GITHUB_SHA)throw Error('Only the exact main workflow revision can seal an upload');
if(!env.ACTIONS_RUNTIME_TOKEN||!env.ACTIONS_RESULTS_URL)throw Error('Artifact-service context is unavailable');
const payload={repository:env.GITHUB_REPOSITORY,sourceCommit:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,runAttempt:env.GITHUB_RUN_ATTEMPT,nonce:env.INPUT_NONCE,manifestSha256:env.INPUT_MANIFEST_SHA256,purpose:env.INPUT_PURPOSE,runtimeToken:env.ACTIONS_RUNTIME_TOKEN,resultsUrl:env.ACTIONS_RESULTS_URL,runtimeUrl:env.ACTIONS_RUNTIME_URL};
const sealed=sealCapability(env.INPUT_PUBLIC_KEY,payload),folder=join(env.RUNNER_TEMP,'gitpad-upload-'+sealed.nonce),path=join(folder,'capability.json');
mkdirSync(folder,{recursive:true});writeFileSync(path,JSON.stringify(sealed),{mode:0o600});appendFileSync(env.GITHUB_OUTPUT,`sealed_path=${path}\n`);
console.log('Encrypted the artifact upload context to the supplied ephemeral public key.');
