// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync} from 'node:fs';
import {verifyAndroidBadging} from './release-evidence.mjs';
const identity=JSON.parse(readFileSync('eng/android-signing.json'));
const certificate=readFileSync('artifacts/android/signature.log','utf8');
const fingerprint=/certificate SHA-256 digest:\s*([a-f0-9]{64})/i.exec(certificate)?.[1].toLowerCase();
if(fingerprint!==identity.certificateSha256||/CN=Android Debug/i.test(certificate))throw Error('Existing Android signing identity mismatch');
verifyAndroidBadging(readFileSync('artifacts/android/badging.log','utf8'));
const manifest=readFileSync('artifacts/android/manifest.log','utf8');
if(!new RegExp('gitpadplus\\.sourceCommit[\\s\\S]{0,600}'+process.env.GITHUB_SHA).test(manifest))throw Error('Exact APK source stamp mismatch');
