// SPDX-License-Identifier: AGPL-3.0-only
import {randomBytes,createPublicKey,publicEncrypt,privateDecrypt,createCipheriv,createDecipheriv,constants,KeyObject} from 'node:crypto';
const algorithm='RSA-OAEP-SHA256/AES-256-GCM';
const contextFields=['repository','sourceCommit','runId','nonce','manifestSha256','purpose'];
function context(value){const result=Object.fromEntries(contextFields.map(key=>[key,value[key]]));if(result.repository!=='styayur/gitpad-plus'||!/^[a-f0-9]{40}$/.test(result.sourceCommit)||!/^\d+$/.test(result.runId)||!/^[a-f0-9]{64}$/.test(result.nonce)||!/^[a-f0-9]{64}$/.test(result.manifestSha256)||!['candidate','transport-probe'].includes(result.purpose))throw Error('Invalid upload capability context');return result;}
const aad=value=>Buffer.from(JSON.stringify(context(value)));
export function sealCapability(publicKey,payload){
  const key=publicKey instanceof KeyObject&&publicKey.type==='public'?publicKey:createPublicKey(publicKey);if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<2048)throw Error('A suitable RSA public key is required');
  const identity=context(payload),symmetric=randomBytes(32),iv=randomBytes(12),plain=Buffer.from(JSON.stringify(payload));
  try{const cipher=createCipheriv('aes-256-gcm',symmetric,iv);cipher.setAAD(aad(identity));const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);return {schemaVersion:1,algorithm,...identity,key:publicEncrypt({key,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},symmetric).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};}
  finally{symmetric.fill(0);plain.fill(0);}
}
export function openCapability(privateKey,envelope,expected){
  if(envelope.schemaVersion!==1||envelope.algorithm!==algorithm||JSON.stringify(context(envelope))!==JSON.stringify(context(expected)))throw Error('Upload capability context differs');
  const key=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(envelope.key,'base64'));
  let plain;
  try{const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));decipher.setAAD(aad(envelope));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));plain=Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]);const payload=JSON.parse(plain.toString('utf8'));if(JSON.stringify(context(payload))!==JSON.stringify(context(expected)))throw Error('Encrypted upload context differs');return payload;}
  finally{key.fill(0);plain?.fill(0);}
}
export function redactUploadOutput(value,secrets=[]){
  const masks=[...secrets];for(const line of value.split(/\r?\n/)){const match=/^::add-mask::(.*)$/.exec(line);if(match)masks.push(match[1].replaceAll('%0D','\r').replaceAll('%0A','\n').replaceAll('%25','%'));}
  let safe=value.split(/\r?\n/).filter(line=>!line.startsWith('::add-mask::')).join('\n');
  for(const secret of masks.filter(Boolean).sort((a,b)=>b.length-a.length))safe=safe.replaceAll(secret,'[redacted]');
  return safe.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[redacted token]').replace(/https?:\/\/[^\s<>"']+/g,'[redacted URL]').replace(/\bsig=[^&\s]+/gi,'sig=[redacted]');
}
