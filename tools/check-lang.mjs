/**
 * Check that every localisation key the code asks for exists in lang/en.json.
 *
 * A missing key does not throw. Foundry returns the key string itself, so the sheet renders
 * "GESTALT.SpellCounts.NoTargetCantrips" where a sentence should be. A syntax check cannot see it and
 * neither can a test that reads values rather than labels.
 *
 * Two shapes are understood:
 *
 *   1. Written out in full - `localize("GESTALT.X.Y")`. Checked directly.
 *   2. Built from a template literal whose only gaps are filled from a list in the same file, such as
 *      `GESTALT.SpellCounts.NoTarget${labelKey}`. The possible values are declared in EXPANSIONS
 *      below, every combination is generated, and each is checked. If a template is found that has no
 *      entry there the run fails, because the fix is to declare the values rather than to let an
 *      unknown key through.
 *
 * Missing keys fail. Unused keys are reported only - a string may be kept deliberately.
 *
 * Run: node tools/check-lang.mjs
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LANG = path.join(ROOT, "lang", "en.json");
const SOURCES = [path.join(ROOT, "scripts", "gestalt.mjs")];

/**
 * The values each interpolated fragment can take, keyed by the expression as it appears in the
 * source. Adding a new interpolated key means adding its values here.
 */
const EXPANSIONS = {
  "${labelKey}": ["Cantrips", "Prepared"],
  "${state.label}": ["Expertise", "Proficient", "Half"]
};

const source = SOURCES.map(file => fs.readFileSync(file, "utf8")).join("\n");
const strings = JSON.parse(fs.readFileSync(LANG, "utf8"));

const asked = new Set();
const problems = [];

// 1. Fully written keys.
for (const [, key] of source.matchAll(/(?:localize|format)\("(GESTALT\.[^"]+)"/g)) asked.add(key);

// 2. Template literals.
for (const [, template] of source.matchAll(/(?:localize|format)\(`(GESTALT\.[^`]+)`/g)) {
  const gaps = [...template.matchAll(/\$\{[^}]+\}/g)].map(m => m[0]);
  const unknown = gaps.filter(gap => !EXPANSIONS[gap]);
  if (unknown.length) {
    problems.push(`${template} interpolates ${unknown.join(", ")}, which has no entry in EXPANSIONS`);
    continue;
  }
  let variants = [template];
  for (const gap of gaps) {
    variants = variants.flatMap(v => EXPANSIONS[gap].map(value => v.replace(gap, value)));
  }
  for (const variant of variants) asked.add(variant);
}

// The "unused" report needs a wider net than the "missing" one. A key reached through an expression
// - a ternary inside localize(), or a settings registration that takes the string as a field - is
// still referenced, and reporting it as unused would invite deleting a string that is in use. Any
// GESTALT string literal anywhere in the source counts as a reference.
const referenced = new Set(asked);
for (const [, key] of source.matchAll(/"(GESTALT\.[^"]+)"/g)) referenced.add(key);

const missing = [...asked].filter(key => !(key in strings)).sort();
const defined = Object.keys(strings).filter(key => key.startsWith("GESTALT."));
const unused = defined.filter(key => !referenced.has(key)).sort();

console.log(`keys asked for: ${asked.size}`);
console.log(`keys defined:   ${defined.length}`);

if (unused.length) {
  console.log(`\nDefined but never asked for (${unused.length}), reported only:`);
  for (const key of unused) console.log(`  ${key}`);
}

if (problems.length) {
  console.error(`\nTemplates this tool cannot expand (${problems.length}):`);
  for (const problem of problems) console.error(`  ${problem}`);
}

if (missing.length) {
  console.error(`\nAsked for but missing from lang/en.json (${missing.length}):`);
  for (const key of missing) console.error(`  ${key}`);
}

if (missing.length || problems.length) process.exit(1);
console.log("\nEvery key the code asks for exists.");
