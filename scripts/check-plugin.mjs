#!/usr/bin/env node
/**
 * Community-plugin review gates, run in CI and before every release.
 * Each one has bitten a real submission, so they are checked mechanically
 * rather than remembered.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const failures = [];
const fail = (message) => failures.push(message);

const sources = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith(".ts")) sources.push(path);
  }
};
walk("src");
sources.push("main.ts");

const read = (path) => readFileSync(path, "utf8");

// 1. innerHTML / outerHTML are review blockers and an injection route.
for (const path of sources) {
  const match = /\.(inner|outer)HTML\s*=/.exec(read(path));
  if (match !== null) fail(`${path}: assigns ${match[1]}HTML`);
}

// 2. Node built-ins break the mobile build.
const NODE_BUILTINS = /(?:from|require\()\s*['"](?:node:)?(fs|path|os|child_process|crypto|http|https|net|zlib|util|stream)['"]/;
for (const path of sources) {
  const match = NODE_BUILTINS.exec(read(path));
  if (match !== null) fail(`${path}: imports the Node built-in "${match[1]}"`);
}

// 3. The global `app` is deprecated; plugins must use `this.app`.
for (const path of sources) {
  if (/(?:^|[^.\w])window\.app\b/.test(read(path))) fail(`${path}: uses the global app instance`);
}

// 4. manifest.json rules from the community-plugin guidelines.
const manifest = JSON.parse(read("manifest.json"));
if (manifest.id.startsWith("obsidian-")) fail('manifest id must not start with "obsidian-"');
if (/obsidian/i.test(manifest.name)) fail('manifest name must not contain "Obsidian"');
if (/obsidian/i.test(manifest.description)) fail('manifest description must not contain "Obsidian"');
if (manifest.description.length > 250) fail("manifest description exceeds 250 characters");
if (!/[.!?]$/.test(manifest.description)) fail("manifest description should end with a full stop");

// 5. versions.json must know the current version.
const versions = JSON.parse(read("versions.json"));
if (versions[manifest.version] === undefined) fail(`versions.json is missing ${manifest.version}`);
if (versions[manifest.version] !== manifest.minAppVersion) {
  fail(`versions.json maps ${manifest.version} to ${versions[manifest.version]}, manifest says ${manifest.minAppVersion}`);
}
if (JSON.parse(read("package.json")).version !== manifest.version) {
  fail("package.json and manifest.json disagree on the version");
}

// 6. Apache-2.0 dependencies need attribution in a NOTICE file.
if (!read("NOTICE").includes("Apache License")) fail("NOTICE is missing the ECharts Apache-2.0 attribution");

// 7. Every ECharts instance must have a disposal path.
const view = read("src/render/ChartView.ts");
if (!view.includes("dispose()")) fail("ChartView never disposes its chart instance");

if (failures.length > 0) {
  console.error("plugin checks failed:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
console.log(`plugin checks passed (${sources.length} source files)`);
