import test from "node:test";
import * as assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const packageJson = JSON.parse(read("package.json"));
const versions = JSON.parse(read("versions.json"));

test("release metadata is internally consistent", () => {
	assert.equal(manifest.id, "study-time-statistics");
	assert.equal(manifest.name, "Study Time Statistics");
	assert.equal(manifest.version, packageJson.version);
	assert.equal(versions[manifest.version], manifest.minAppVersion);
	assert.equal(manifest.isDesktopOnly, false);
});

test("public copy uses the new product name and includes privacy disclosure", () => {
	const publicText = [read("README.md"), read("README_zh.md"), read("manifest.json")].join("\n");
	assert.doesNotMatch(publicText, /Focus Time Plus|Study Ledger/i);
	assert.match(publicText, /local|本地/i);
	assert.match(publicText, /synthetic|虚构/i);
});

test("required release files and license are present", () => {
	for (const path of ["main.js", "manifest.json", "styles.css", "LICENSE", "NOTICE"]) {
		assert.ok(read(path).length > 0, `${path} must not be empty`);
	}
});
