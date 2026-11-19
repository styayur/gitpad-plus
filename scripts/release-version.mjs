// SPDX-License-Identifier: AGPL-3.0-only
import {readFileSync} from 'node:fs';
export const releaseVersion=JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version;
const props=readFileSync(new URL('../Directory.Build.props',import.meta.url),'utf8');
export const androidVersionCode=Number(/<GitPadAndroidVersionCode>(\d+)<\/GitPadAndroidVersionCode>/.exec(props)?.[1]);
if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(releaseVersion)||!Number.isSafeInteger(androidVersionCode)||androidVersionCode<1||!props.includes(`<Version>${releaseVersion}</Version>`))throw Error('Release version/package identities disagree');
