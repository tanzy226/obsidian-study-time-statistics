import test from "node:test";
import * as assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const en = JSON.parse(readFileSync(new URL("../src/language/locale/en.json", import.meta.url), "utf8"));
const zh = JSON.parse(readFileSync(new URL("../src/language/locale/zh.json", import.meta.url), "utf8"));

test("English and Chinese locales contain the same keys", () => {
	assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
});

test("all translations are non-empty strings", () => {
	for (const [language, values] of [["en", en], ["zh", zh]] as const) {
		for (const [key, value] of Object.entries(values)) {
			assert.equal(typeof value, "string", `${language}.${key} must be a string`);
			assert.ok((value as string).trim(), `${language}.${key} must not be empty`);
		}
	}
});
