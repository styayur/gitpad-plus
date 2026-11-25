// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function reviewedSqliteLicense(name, version, nuspec, folder) {
  if (name.toLowerCase() !== 'sqlite' || version !== '3.53.4'
      || !nuspec.includes('<license type="file">LICENSE.txt</license>')) return;
  const bytes = readFileSync(join(folder, 'LICENSE.txt'));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== '99464c3a88df7b708ce59e462cdcb85f72dfc9b1335b4fcc68be56131b634b95') {
    throw Error('SQLite package public-domain notice differs from the reviewed bytes');
  }
  return {
    licenseId: 'LicenseRef-SQLite-Public-Domain',
    name: 'SQLite public-domain dedication',
    extractedText: bytes.toString('utf8'),
    seeAlsos: ['https://www.sqlite.org/copyright.html'],
  };
}
