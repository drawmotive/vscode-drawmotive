import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { compareReleaseVersions } from './release-registry.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Marketplace confirmation downloads the advertised VSIX and compares the tested bytes. */
export async function marketplaceState(receipt, request = fetch) {
  assert.match(receipt.publisher, /^[A-Za-z0-9][A-Za-z0-9-]*$/);
  assert.match(receipt.name, /^[A-Za-z0-9][A-Za-z0-9-]*$/);
  assert.match(receipt.version, /^(0|[1-9][0-9]*)[.](0|[1-9][0-9]*)[.](0|[1-9][0-9]*)$/);
  assert.equal(typeof receipt.preRelease, 'boolean');
  assert.match(receipt.sha256, /^[a-f0-9]{64}$/);
  const response = await request('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json;api-version=7.2-preview.1' },
    body: JSON.stringify({ filters: [{ criteria: [{ filterType: 7, value: receipt.publisher + '.' + receipt.name }] }], flags: 179 }),
    signal: AbortSignal.timeout(30000), redirect: 'error',
  });
  assert.ok(response.ok, 'Marketplace lookup failed: HTTP ' + response.status);
  const result = await response.json();
  const extensions = (result.results ?? []).flatMap(item => item.extensions ?? []);
  if (!extensions.length) return { confirmed: false };
  assert.equal(extensions.length, 1, 'Ambiguous Marketplace identity');
  const extension = extensions[0];
  // Marketplace identity is case-insensitive and the API preserves the
  // publisher's registered casing, which can differ from a VSIX manifest.
  assert.equal(extension.extensionName?.toLowerCase(), receipt.name.toLowerCase());
  assert.equal(extension.publisher?.publisherName?.toLowerCase(), receipt.publisher.toLowerCase());
  for (const published of extension.versions ?? []) assert.ok(compareReleaseVersions(receipt.version, published.version) >= 0, 'Refusing Marketplace version rollback');
  const version = extension.versions?.find(item => item.version === receipt.version);
  if (!version) return { confirmed: false };
  const prerelease = version.properties?.find(item => item.key === 'Microsoft.VisualStudio.Code.PreRelease')?.value === 'true';
  assert.equal(prerelease, receipt.preRelease, 'Marketplace channel differs from the tested VSIX');
  const url = new URL(version.files?.find(item => item.assetType === 'Microsoft.VisualStudio.Services.VSIXPackage')?.source);
  assert.ok(url.protocol === 'https:' && !url.username && !url.password, 'Invalid Marketplace archive URL');
  const archive = await request(url, { signal: AbortSignal.timeout(60000) });
  assert.ok(archive.ok, 'Marketplace archive lookup failed: HTTP ' + archive.status);
  assert.equal(hash(Buffer.from(await archive.arrayBuffer())), receipt.sha256, 'Marketplace VSIX conflicts with the retained artifact');
  return { confirmed: true, sha256: receipt.sha256 };
}

/** Publish the frozen packagePath only; never ask vsce to rebuild at publication. */
export async function publishVsix(receipt, directory, { run, cli, request = fetch, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  assert.match(receipt.filename, /^[A-Za-z0-9_.-]+[.]vsix$/);
  const archive = path.join(directory, receipt.filename);
  assert.equal(hash(await readFile(archive)), receipt.sha256, 'Retained VSIX changed');
  if ((await marketplaceState(receipt, request)).confirmed) return { status: 'already-published', sha256: receipt.sha256 };
  // Accepted versions may remain absent from the public gallery while being
  // validated. vsce's authenticated version lookup skips that existing upload;
  // only the independent public byte/channel check below can confirm release.
  await run(process.execPath, [cli, 'publish', '--packagePath', archive, '--skip-duplicate', ...(receipt.preRelease ? ['--pre-release'] : [])], { cwd: directory });
  for (let attempt = 0; attempt < 10; attempt++) {
    if ((await marketplaceState(receipt, request)).confirmed) return { status: 'published', sha256: receipt.sha256 };
    if (attempt < 9) await delay(2000);
  }
  throw new Error('Marketplace publication is not visible; resume with the same retained VSIX');
}
