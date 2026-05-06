import { defineLexiconConfig } from "@atcute/lex-cli";

export default defineLexiconConfig({
  files: ["lexicons/custom/**/*.json", "lexicons/pulled/**/*.json", "lexicons/generated/**/*.json"],
  outdir: "src/lexicon-types/",
  imports: ["@atcute/atproto"],
  pull: {
    outdir: "lexicons/pulled/",
    sources: [
      {
        type: "atproto",
        mode: "nsids",
        nsids: [
                  "app.bsky.actor.profile",
                  "community.lexicon.calendar.event",
                  "community.lexicon.calendar.rsvp",
                  "community.lexicon.location.address",
                  "community.lexicon.location.fsq",
                  "community.lexicon.location.geo",
                  "community.lexicon.location.hthree"
        ],
      },
    ],
  },
});
