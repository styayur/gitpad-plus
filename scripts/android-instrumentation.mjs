// SPDX-License-Identifier: AGPL-3.0-only
// Hosted Linux builder, signed with the same existing release identity as the app.
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const out = resolve('artifacts/android/instrumentation');
const sdk = process.env.ANDROID_HOME;
const java = join(process.env.JAVA_HOME, 'bin');
const tools = join(sdk, 'build-tools/36.0.0');
const android = join(sdk, 'platforms/android-36/android.jar');
const run = (program, args) => execFileSync(program, args, { stdio: 'inherit' });
for (const name of ['', 'classes', 'dex', 'assets']) mkdirSync(join(out, name), { recursive: true });
copyFileSync('tests/android/scenario.js', join(out, 'assets/scenario.js'));
run(join(java, 'javac'), ['--release', '17', '-classpath', android, '-d', join(out, 'classes'), 'tests/android/AcceptanceInstrumentation.java']);
run(join(java, 'jar'), ['cf', join(out, 'classes.jar'), '-C', join(out, 'classes'), '.']);
run(join(tools, 'd8'), ['--lib', android, '--min-api', '26', '--output', join(out, 'dex'), join(out, 'classes.jar')]);
run(join(tools, 'aapt2'), ['link', '-I', android, '--manifest', 'tests/android/AndroidManifest.xml', '-o', join(out, 'unsigned.apk')]);
run(join(java, 'jar'), ['uf', join(out, 'unsigned.apk'), '-C', out, 'assets', '-C', join(out, 'dex'), 'classes.dex']);
run(join(tools, 'zipalign'), ['-f', '4', join(out, 'unsigned.apk'), join(out, 'aligned.apk')]);
const apk = join(out, 'GitPadPlus-Acceptance-Tests.apk');
const signer = ['-jar', join(tools, 'lib/apksigner.jar')];
run(join(java, 'java'), [...signer, 'sign', '--ks', process.env.GITPAD_ANDROID_KEY_PATH, '--ks-key-alias', 'gitpadplus-release', '--ks-pass', 'env:GITPAD_ANDROID_PASSWORD', '--key-pass', 'env:GITPAD_ANDROID_PASSWORD', '--out', apk, join(out, 'aligned.apk')]);
const signature = execFileSync(join(java, 'java'), [...signer, 'verify', '--verbose', '--print-certs', apk], { encoding: 'utf8' });
writeFileSync(join(out, 'signature.log'), signature);
const certificate = /certificate SHA-256 digest:\s*([a-f0-9]{64})/i.exec(signature)?.[1].toLowerCase();
if (certificate !== process.env.GITPAD_ANDROID_CERTIFICATE_SHA256) throw Error('Instrumentation signing identity changed');
