import { defineLexiconConfig } from "@atcute/lex-cli";

export default defineLexiconConfig({
	files: ["lexicons/**/*.json"],
	outdir: "src/lexicon-types/",
	imports: ["@atcute/atproto"],
	pull: {
		outdir: "lexicons/",
		sources: [
			{
				type: "git",
				remote: "https://github.com/flo-bit/contrail.git",
				pattern: ["lexicons-generated/**/*.json", "lexicons-pulled/**/*.json"],
			},
		],
	},
});
