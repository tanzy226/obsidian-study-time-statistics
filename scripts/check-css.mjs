import {readFileSync} from "node:fs";

const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const forbidden = [
	[/url\(\s*['"]?\s*(?:https?:|file:)/i, "External CSS URLs are not allowed in an Obsidian plugin."],
	[/!important\b/i, "Avoid !important; use selector specificity or theme variables."],
	[/:has\s*\(/i, "Avoid :has() because it can make broad selectors expensive."],
];

for (const [pattern, message] of forbidden) {
	if (pattern.test(css)) {
		console.error(message);
		process.exitCode = 1;
	}
}
