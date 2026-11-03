// SPDX-License-Identifier: AGPL-3.0-only
import {execFileSync,spawnSync} from 'node:child_process';
import {generateKeyPairSync,randomBytes,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,realpathSync} from 'node:fs';
import {resolve,join,dirname,basename,relative,isAbsolute,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {readZip} from './release-evidence.mjs';
import {openCapability,redactUploadOutput} from './candidate-capability.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),repository='styayur/gitpad-plus';
const args=process.argv.slice(2);if(args.length!==3)throw Error('Pass <candidate-directory|--probe> <reviewed-upload-action.js> <report-outside-candidate.json>');
const probe=args[0]==='--probe',purpose=probe?'transport-probe':'candidate',artifactName=probe?'candidate-transport-probe':'release-candidate';
const tool=JSON.parse(readFileSync(join(root,'scripts/candidate-upload-tool.json'),'utf8')),uploader=realpathSync(args[1]),report=join(realpathSync(dirname(resolve(args[2]))),basename(args[2]));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
if(sha(readFileSync(uploader))!==tool.sha256)throw Error('Uploader differs from the reviewed pinned official action');
const git=(...parameters)=>execFileSync('git',parameters,{cwd:root,encoding:'utf8'}).trim();
const gh=(parameters,input,bytes=false)=>{try{return execFileSync('gh',parameters,{cwd:root,input,encoding:bytes?undefined:'utf8',maxBuffer:10_000_000,env:{...process.env,GH_HOST:'github.com',GH_DEBUG:''}});}catch(error){throw Error('GitHub CLI failed: '+redactUploadOutput(String(error.stderr??error.message)).slice(-1600));}};
const api=path=>JSON.parse(gh(['api',path]));
const wait=()=>new Promise(done=>setTimeout(done,5000));
async function poll(read,label,attempts=120){for(let i=0;i<attempts;i++){const result=read();if(result)return result;await wait();}throw Error('Timed out: '+label);}
function serviceUrl(value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!url.hostname.endsWith('.actions.githubusercontent.com'))throw Error('Unexpected GitHub artifact service URL');return value;}
const sourceCommit=git('rev-parse','HEAD');
if(!/^[a-f0-9]{40}$/.test(sourceCommit)||git('status','--porcelain'))throw Error('Use exact clean committed source');
if(api(`repos/${repository}/commits/main`).sha!==sourceCommit)throw Error('Checkout must equal current remote main');
const checks=JSON.parse(gh(['run','list','--repo',repository,'--workflow','ci.yml','--commit',sourceCommit,'--branch','main','--limit','5','--json','headSha,conclusion']));
if(!checks.some(run=>run.headSha===sourceCommit&&run.conclusion==='success'))throw Error('Successful exact-main CI is required');
const temporaryRoot=realpathSync(tmpdir()),temporary=mkdtempSync(join(temporaryRoot,'gitpad-candidate-upload-'));
if(!temporary.startsWith(temporaryRoot+sep))throw Error('Temporary directory is outside the intended root');
let runId,completed=false,gateVerified=false;
const nonce=randomBytes(32).toString('hex');
let directory;
try{
  if(probe){directory=join(temporary,'probe');mkdirSync(directory);const body=Buffer.from(`GitPad+ artifact transport check\n${sourceCommit}\n${nonce}\n`);writeFileSync(join(directory,'transport-probe.txt'),body);writeFileSync(join(directory,'SHA256SUMS.txt'),`${sha(body)}  transport-probe.txt\n`);}
  else directory=realpathSync(args[0]);
  const reportRelative=relative(directory,report);if(!isAbsolute(reportRelative)&&reportRelative!=='..'&&!reportRelative.startsWith('..'+sep))throw Error('Keep the staging report outside the immutable upload directory');
  const gate=()=>{const result=spawnSync(process.execPath,[join(root,'scripts/release-gate.mjs'),directory],{cwd:root,env:{...process.env,SOURCE_COMMIT:sourceCommit},encoding:'utf8'});if(result.status!==0)throw Error('Local release gate rejected the upload: '+redactUploadOutput(result.stderr??'').slice(-1600));gateVerified=true;};
  if(!probe)gate();
  const manifestSha256=sha(readFileSync(join(directory,'SHA256SUMS.txt'))),keys=generateKeyPairSync('rsa',{modulusLength:3072});
  gh(['workflow','run','candidate-upload.yml','--repo',repository,'--ref','main','--json'],JSON.stringify({source_commit:sourceCommit,public_key:keys.publicKey.export({type:'spki',format:'pem'}),nonce,manifest_sha256:manifestSha256,purpose}));
  const run=await poll(()=>{const runs=JSON.parse(gh(['run','list','--repo',repository,'--workflow','candidate-upload.yml','--event','workflow_dispatch','--limit','30','--json','databaseId,displayTitle,headSha,status,conclusion']));const matches=runs.filter(item=>item.displayTitle===`GitPad local upload ${nonce}`);if(matches.length>1)throw Error('Ambiguous upload session');if(matches[0]&&matches[0].headSha!==sourceCommit)throw Error('Main moved before the upload workflow started');return matches[0];},'upload workflow registration');
  runId=String(run.databaseId);console.log(`Hosted ${purpose} upload session: https://github.com/${repository}/actions/runs/${runId}`);
  const artifacts=()=>api(`repos/${repository}/actions/runs/${runId}/artifacts`).artifacts;
  const sealedArtifact=await poll(()=>{const state=api(`repos/${repository}/actions/runs/${runId}`);if(state.status==='completed')throw Error('Upload job ended before providing its encrypted context: '+state.conclusion);return artifacts().find(item=>item.name==='candidate-upload-capability'&&item.size_in_bytes>0&&!item.expired);},'encrypted upload context');
  const envelopeZip=gh(['api',`repos/${repository}/actions/artifacts/${sealedArtifact.id}/zip`],undefined,true),entries=readZip(envelopeZip);
  if(entries.size!==1||!entries.has('capability.json'))throw Error('Unexpected encrypted context archive');
  const expected={repository,sourceCommit,runId,nonce,manifestSha256,purpose};
  const capability=openCapability(keys.privateKey,JSON.parse(entries.get('capability.json').toString('utf8')),expected);
  if(typeof capability.runtimeToken!=='string'||capability.runtimeToken.length<32||capability.runtimeToken.split('.').length!==3||!/^\d+$/.test(capability.runAttempt))throw Error('Invalid one-job artifact context');
  const output=join(temporary,'uploader-outputs.txt');
  const workerEnv=Object.fromEntries(['SystemRoot','SYSTEMROOT','PATH','TEMP','TMP','HOME','USERPROFILE'].filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]));
  Object.assign(workerEnv,{ACTIONS_RUNTIME_TOKEN:capability.runtimeToken,ACTIONS_RESULTS_URL:serviceUrl(capability.resultsUrl),GITHUB_SERVER_URL:'https://github.com',GITHUB_API_URL:'https://api.github.com',GITHUB_REPOSITORY:repository,GITHUB_RUN_ID:runId,GITHUB_RUN_ATTEMPT:capability.runAttempt,GITHUB_WORKSPACE:root,GITHUB_OUTPUT:output,RUNNER_TEMP:temporary,RUNNER_OS:process.platform==='win32'?'Windows':'Linux',RUNNER_DEBUG:'0',INPUT_NAME:artifactName,INPUT_PATH:directory,'INPUT_IF-NO-FILES-FOUND':'error','INPUT_COMPRESSION-LEVEL':'0','INPUT_RETENTION-DAYS':'7',INPUT_OVERWRITE:'false','INPUT_INCLUDE-HIDDEN-FILES':'false'});
  if(capability.runtimeUrl)workerEnv.ACTIONS_RUNTIME_URL=serviceUrl(capability.runtimeUrl);
  // The official uploader emits add-mask commands for SAS signatures. Capture
  // all of its output in memory; never stream those commands to a local log.
  const uploaded=spawnSync(process.execPath,[uploader],{cwd:root,env:workerEnv,encoding:'utf8',maxBuffer:20_000_000,timeout:15*60_000});
  if(uploaded.status!==0){const safe=redactUploadOutput(String(uploaded.stdout??'')+'\n'+String(uploaded.stderr??''),[capability.runtimeToken]);throw Error('Official artifact uploader failed: '+safe.slice(-2400));}
  capability.runtimeToken='';workerEnv.ACTIONS_RUNTIME_TOKEN='';
  if(sha(readFileSync(join(directory,'SHA256SUMS.txt')))!==manifestSha256)throw Error('Upload manifest changed during transfer');
  if(!probe)gate();
  const state=await poll(()=>{const value=api(`repos/${repository}/actions/runs/${runId}`);return value.status==='completed'?value:null;},'hosted artifact completion');
  if(state.conclusion!=='success')throw Error('Hosted upload workflow failed: '+state.conclusion);
  const artifact=artifacts().find(item=>item.name===artifactName&&!item.expired);if(!artifact)throw Error('Uploaded artifact missing');
  if(probe){const downloaded=readZip(gh(['api',`repos/${repository}/actions/artifacts/${artifact.id}/zip`],undefined,true));if(downloaded.size!==2||sha(downloaded.get('SHA256SUMS.txt')??Buffer.alloc(0))!==manifestSha256||!downloaded.get('transport-probe.txt')?.equals(readFileSync(join(directory,'transport-probe.txt'))))throw Error('Transport probe download differs');}
  const result={schemaVersion:1,purpose,sourceCommit,runId,runUrl:`https://github.com/${repository}/actions/runs/${runId}`,artifactName,artifactId:artifact.id,artifactBytes:artifact.size_in_bytes,manifestSha256,localReleaseGateVerified:gateVerified,scope:probe?'Byte-verified transport check only; no application candidate or release acceptance':'Uploaded locally gated candidate; run release.yml for independent hosted verification'};
  writeFileSync(report,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));completed=true;
}finally{
  if(runId&&!completed){try{gh(['run','cancel',runId,'--repo',repository]);}catch{/* The job may already have completed. */}}
  const cleanup=realpathSync(temporary);if(dirname(cleanup)!==temporaryRoot||!basename(cleanup).startsWith('gitpad-candidate-upload-'))throw Error('Temporary cleanup target changed');rmSync(cleanup,{recursive:true,force:true});
}
