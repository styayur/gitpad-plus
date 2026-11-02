// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync } from 'node:fs';
const npm=JSON.parse(readFileSync('artifacts/npm-audit.json'));
if(!npm.metadata?.vulnerabilities||Object.values(npm.metadata.vulnerabilities).some(n=>n!==0))throw new Error('Security gate: npm audit is missing or has unresolved advisories');
for(const path of process.argv.slice(2).length?process.argv.slice(2):['artifacts/nuget-audit.json']){
  const nuget=JSON.parse(readFileSync(path));
  const inventory=JSON.parse(readFileSync(path.replace(/\.json$/,'.inventory.json')));
  if(nuget.version!==1||!nuget.projects?.length||inventory.version!==1||!inventory.projects?.length)throw new Error('Security gate: missing NuGet audit/inventory: '+path);
  for(const project of nuget.projects){
    const installed=inventory.projects.find(item=>item.path===project.path);
    if(!installed?.frameworks?.length||installed.frameworks.some(item=>![...item.topLevelPackages??[],...item.transitivePackages??[]].length))throw new Error('Security gate: empty framework inventory');
    const selected=/--framework\s+(\S+)/.exec(nuget.parameters??'')?.[1];
    if(selected&&!installed.frameworks.some(item=>item.framework===selected))throw new Error('Security gate: audit framework not in inventory');
    // NuGet intentionally omits frameworks when no vulnerable packages exist.
    for(const framework of project.frameworks??[])for(const pkg of [...framework.topLevelPackages??[],...framework.transitivePackages??[]])if(pkg.vulnerabilities?.length)throw new Error('Security gate: NuGet advisory for '+pkg.id);
  }
  if([...nuget.logs??[],...inventory.logs??[]].some(log=>log.level==='error'))throw new Error('Security gate: NuGet audit query failed');
}
console.log('Installed npm and requested NuGet framework vulnerability queries passed. Binary/native acceptance is a separate gate.');
