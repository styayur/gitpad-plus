// SPDX-License-Identifier: AGPL-3.0-only
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const adb = args => execFileSync('adb', args, { encoding: 'utf8', timeout: 360_000, maxBuffer: 10_000_000 });
function runPhase(phase, label=phase) {
  adb(['shell', 'am', 'force-stop', 'io.github.styayur.gitpadplus']);
  const log = adb(['shell', 'am', 'instrument', '-w', '-e', 'phase', phase, '-e', 'disposable', 'true', 'io.github.styayur.gitpadplus.acceptance/io.github.styayur.gitpadplus.acceptance.AcceptanceInstrumentation']);
  writeFileSync(`artifacts/android/${label}.log`, log);
  const raw = /^INSTRUMENTATION_RESULT: report=(.+)$/m.exec(log)?.[1];
  if (!raw) throw Error('Native report missing: ' + phase + '\n' + log);
  const report = JSON.parse(raw);
  report.testHarnessSourceCommit=process.env.GITHUB_SHA;
  report.sourceCommit=label==='upgrade-baseline'?process.env.GITPAD_BASELINE_SOURCE_COMMIT:process.env.GITHUB_SHA;
  if(!/^[a-f0-9]{40}$/.test(report.sourceCommit??''))throw Error('Installed APK source identity missing');
  report.installedApkSha256=createHash('sha256').update(readFileSync(label==='upgrade-baseline'?process.env.GITPAD_BASELINE_APK:process.env.GITPAD_ANDROID_APK)).digest('hex');
  report.phase=label;
  writeFileSync(`artifacts/android/${label}.json`, JSON.stringify(report, null, 2) + '\n');
  if (!report.passed || !log.includes('INSTRUMENTATION_CODE: -1')) throw Error('Native regression failed: ' + phase);
  console.log('PASS actual Android instrumentation: ' + label);
}
try{
if(process.env.GITPAD_BASELINE_APK){
  console.log(adb(['install','-r',process.env.GITPAD_BASELINE_APK]));
  console.log(adb(['install','-r','artifacts/android/instrumentation/GitPadPlus-Acceptance-Tests.apk']));
  runPhase('smoke','upgrade-baseline');
  console.log(adb(['install','-r',process.env.GITPAD_ANDROID_APK]));
  runPhase('smoke-restart','upgrade-retained');
}else{
  console.log(adb(['install','-r',process.env.GITPAD_ANDROID_APK]));
  console.log(adb(['install','-r','artifacts/android/instrumentation/GitPadPlus-Acceptance-Tests.apk']));
}
// All data are disposable emulator fixtures. Never run clear on a user's device.
for(const phase of ['smoke','smoke-restart','smoke-recreate','smoke-resume','features-default'])runPhase(phase);
for(const [width,height]of [[320,716],[393,708]]){
  adb(['shell','wm','size',`${width*3}x${height*3}`]);adb(['shell','wm','density','480']);
  for(const phase of ['ui-design','ui-two-pane','writing-end','writing-end-two-pane'])runPhase(phase,`${width}-${phase}`);
}
for(const phase of ['trash','performance','performance-restart','clear'])runPhase(phase);
}finally{
  // Capture while the emulator action still owns its running guest.
  try{writeFileSync('artifacts/android/logcat.log',adb(['logcat','-d','-t','5000']));}catch(error){writeFileSync('artifacts/android/logcat-error.txt',String(error));}
  try{adb(['pull','/sdcard/Android/data/io.github.styayur.gitpadplus/files/acceptance/','artifacts/android/screenshots']);}catch(error){writeFileSync('artifacts/android/screenshots-error.txt',String(error));}
}
