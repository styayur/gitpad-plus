// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
const npm=JSON.parse(readFileSync('artifacts/npm-audit.json'));
if(!npm.metadata?.vulnerabilities||Object.values(npm.metadata.vulnerabilities).some(n=>n!==0))throw new Error('Security gate: npm audit is missing or has unresolved advisories');
const nuget=JSON.parse(readFileSync('artifacts/nuget-audit.json'));
if(nuget.version!==1||!nuget.projects?.length)throw new Error('Security gate: missing NuGet audit');
for(const project of nuget.projects)for(const framework of project.frameworks??[])for(const pkg of [...framework.topLevelPackages??[],...framework.transitivePackages??[]])if(pkg.vulnerabilities?.length)throw new Error('Security gate: NuGet advisory for '+pkg.id);
if(nuget.logs?.some(log=>log.level==='error'))throw new Error('Security gate: NuGet audit query failed');
console.log('Installed portable npm/NuGet dependency vulnerability queries passed. Native artifacts require separate qualification.');
