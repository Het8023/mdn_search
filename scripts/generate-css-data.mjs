import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mdnData = require('mdn-data');
const bcd = require('@mdn/browser-compat-data');

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(projectRoot, 'resources', 'css-properties.json');
const browsers = [
  ['chrome', 'Chrome'],
  ['edge', 'Edge'],
  ['firefox', 'Firefox'],
  ['safari', 'Safari']
];

function firstUnflaggedStatement(support) {
  const statements = Array.isArray(support) ? support : [support];
  return statements.find((item) => item && !item.flags && !item.prefix && !item.alternative_name) ?? statements[0];
}

function compactSupport(compat) {
  return browsers.flatMap(([key, label]) => {
    const statement = firstUnflaggedStatement(compat?.support?.[key]);
    if (!statement || statement.version_added === false || statement.version_added == null) {
      return [];
    }
    return [{ browser: label, version: statement.version_added === true ? true : String(statement.version_added) }];
  });
}

const properties = Object.entries(mdnData.css.properties)
  .map(([name, data]) => {
    const compat = bcd.css.properties[name]?.__compat;
    return {
      name,
      syntax: data.syntax,
      initialValue: data.initial,
      inherited: data.inherited,
      appliesTo: data.appliesto,
      computedValue: data.computed,
      animationType: data.animationType,
      status: compat?.status ?? {
        deprecated: data.status === 'obsolete',
        experimental: data.status === 'experimental',
        standard_track: data.status === 'standard'
      },
      compatibility: compactSupport(compat),
      mdnUrl: compat?.mdn_url ?? data.mdn_url,
      specUrl: Array.isArray(compat?.spec_url) ? compat.spec_url[0] : compat?.spec_url
    };
  })
  .filter((property) => property.mdnUrl)
  .sort((a, b) => a.name.localeCompare(b.name));

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ version: 1, properties }, null, 2)}\n`, 'utf8');
console.log(`Generated ${properties.length} CSS properties at ${outputPath}`);
