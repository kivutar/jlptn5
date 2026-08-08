# JLPT N5 lesson app

A minimal browser app for working through JLPT N5 grammar exercises. It reveals
Japanese sentences character by character, displays furigana, highlights token
types on hover, plays Japanese narration, accepts an English translation, and
then shows the prepared solution with a collapsible list of every grammar point
used in the sentence. A user menu provides placeholders for settings,
statistics, and application information.

## Architecture

The deployed app is fully static. At runtime the browser only loads HTML, CSS,
JavaScript, JSON, and WAV files. It does not tokenize text, read an API key, run
Node.js, or call OpenAI.

Development-time generation is split from the browser runtime:

| Path | Purpose | Git status |
| --- | --- | --- |
| `data/source/introduction.json` | Authored introduction and optional ambiguity overrides | Committed |
| `data/source/exercises.json` | Authored exercises, solutions, grammar references, and optional ambiguity overrides | Committed |
| `data/jlpt-n5-grammar.json` | Canonical flat JLPT N5 grammar inventory | Committed |
| `data/grammar-coverage.md` | Generated checklist of grammar points covered by exercises | Committed |
| `data/jlpt-n5-vocabulary.json` | Synthetic N5 vocabulary core plus labeled learner favorites | Committed |
| `data/introduction.json` | Generated browser-ready introduction with tokens | Committed |
| `data/exercises.json` | Generated browser-ready exercises with tokens | Committed |
| `learning-stats.js` | Versioned local encounter history and aggregate counters | Committed |
| `assets/voices/*.wav` | Generated narration used directly by the browser | Ignored for now |

`scripts/prepare-content.js` runs Lindera with IPADIC during development. It
tokenizes each sentence, searches the complete vocabulary dictionary, narrows
homographs by part of speech, and generates the lesson and token vocabulary IDs.
Lindera is therefore a development dependency only.

The browser loads `jlpt-n5-vocabulary.json` and resolves tooltip meanings from
those token vocabulary IDs. Exercise files never duplicate readings or English
glosses, and they do not list vocabulary IDs manually. Vocabulary entries may
declare `variants` for alternate spelling and `inflections` for possible forms
the tokenizer cannot reliably derive.

If global lookup produces more than one compatible entry, generation fails with
the candidates. The source lesson can then add only the required disambiguation:

```json
"vocabularyOverrides": {
  "surface form": "vocab-id",
  "repeated form#2": "vocab-id"
}
```

Missing words, invalid overrides, redundant overrides, and unresolved
ambiguities are reported together during `npm run content`. The `#2` suffix
targets a specific occurrence only when the same written form appears more than
once with different meanings.

`scripts/generate-voices.js` creates stable WAV filenames. It keeps a valid
existing voice, restores a valid matching file from the legacy `.cache/speech/`
directory, or calls OpenAI when the file is missing, silent, or implausibly long.
The current speech configuration is kept in that script so a lesson produces a
consistent cache identity.

`scripts/serve.js` is an allowlisted local preview server. It is not an
application backend and accepts only `GET` and `HEAD`. In particular, it cannot
serve `.key`, source data, development scripts, or an `/api/*` endpoint.

## Setup

Install the development dependency:

```sh
npm install
```

Generate tokenized lesson data after changing the authored content:

```sh
npm run content
```

Generate or restore missing voices:

```sh
npm run voices
```

Voice generation reads `OPENAI_API_KEY` first and otherwise reads `.key` in the
repository root. Both `.key` and `*.key` are ignored. The file may contain either
the bare key or `OPENAI_API_KEY=...`. The key is read only by the development
script and must never be added to browser code or generated data.

Run both generators together:

```sh
npm run generate
```

Existing WAV files are deliberately kept. To regenerate one after changing its
text or voice settings, remove that lesson's WAV and run `npm run voices` again.

## Running

Start the static preview:

```sh
npm start
```

Open http://127.0.0.1:4173. Set `PORT` to use another port.

## Learning statistics

Displaying an exercise records one encounter for every unique grammar and
vocabulary ID referenced by that exercise. The introduction, character reveal,
solution reveal, and audio playback do not add encounters. Repeating an exercise
later adds another encounter.

The data is stored under `jlpt-n5.learning-stats.v1` in browser local storage:

```json
{
  "version": 1,
  "updatedAt": "2026-08-08T10:00:00.000Z",
  "grammarPoints": {
    "wa-topic": {
      "encounterCount": 2,
      "firstEncounteredAt": "2026-08-08T10:00:00.000Z",
      "lastEncounteredAt": "2026-08-09T11:30:00.000Z",
      "encounteredAt": [
        "2026-08-08T10:00:00.000Z",
        "2026-08-09T11:30:00.000Z"
      ]
    }
  },
  "vocabulary": {}
}
```

Counts represent exercise presentations containing an item, not repeated token
occurrences inside one sentence. Every encounter timestamp is retained for
future scheduling work, while the count and first/last fields keep later summary
queries simple. The data is local to the browser profile and origin, is not
synced to a server, and is removed if site data is cleared. Correctness scoring,
mastery, and SRS scheduling are not implemented yet. A larger history may
eventually warrant migration from local storage to IndexedDB.

## Testing

Run the offline static contract tests:

```sh
npm test
```

These run a check-only content build and validate source/generated-data
consistency, token reconstruction, grammar references, audio paths, public
static responses, blocked private paths, and the absence of runtime API/OpenAI
calls in `app.js`.

After generating voices, validate every local WAV referenced by the lessons:

```sh
npm run test:voices
```

This command does not generate audio or contact OpenAI. It checks that each file
is a non-silent PCM WAV with a plausible duration for its lesson text.

For a browser check, run `npm start` and verify:

1. The introduction draws character by character; furigana follows its kanji.
2. The speaker button appears after the sentence and plays the same recording on repeated clicks.
3. `次へ` fades to an exercise, then the translation field and `送信` appear and the field receives focus.
4. Hover colors appear only after their tokens are revealed. Nouns, verbs, and adjectives show English tooltips; particles and auxiliaries do not.
5. `送信` reveals the prepared solution and a collapsed complete grammar list, then changes to `次へ` and advances without repeating the immediately previous exercise.
6. The browser network panel contains only static `GET` requests and no `/api/` or OpenAI request.
7. Displaying an exercise adds one entry to `jlpt-n5.learning-stats.v1`; submitting it does not increment the counts again.
8. The avatar button opens the user menu; arrow keys move through its entries, and Escape or an outside click closes it.

## Editing lessons

1. Edit lesson files under `data/source/`; do not hand-edit generated token arrays.
2. List every valid grammar ID actually used in each sentence, including
   foundations, conjugation systems, and secondary constructions.
3. Run `npm run content` and review the generated JSON diff.
4. Add missing dictionary words or the specific override requested by the generator.
5. Run `npm run voices` for missing narration.
6. Run `npm test`, `npm run test:voices`, and the browser checklist.

Use [`data/grammar-coverage.md`](data/grammar-coverage.md) to choose an unchecked
grammar point for the next exercise. `npm run content` regenerates the checklist
from the exercise `grammarPointIds`, and `npm run content:check` fails if it is
stale. A checked point means learners encounter it in at least one exercise; it
does not claim mastery. One exercise may cover several points, and a point remains
checked when it is reinforced by more than one exercise.

The vocabulary inventory is curated directly in `data/jlpt-n5-vocabulary.json`.
Keep exam-oriented additions as `core` and motivating beginner additions as
`supplemental`; do not imply that either is an official JLPT item list.

Word tooltips are intentionally limited to nouns, verbs, and adjectives. Grammar
elements such as particles and auxiliary endings receive hover colors but no
translation tooltip. Tooltip meanings always come from the shared vocabulary
inventory.

## Static deployment

A deployment needs only `index.html`, `app.js`, `learning-stats.js`, `styles.css`,
the generated JSON under `data/`, `data/jlpt-n5-grammar.json`, and the referenced
files under `assets/voices/`. No Node process or API key is required.

Build that allowlisted artifact locally with:

```sh
npm run build:static
```

The result is written to ignored `dist/`. The GitHub Pages workflow runs the
offline tests, builds the same artifact, and deploys it after each push to
`main`. It can also be started manually from the Actions tab. The available WAV
files are committed and included; exercises whose narration has not been
generated yet retain their normal retry state when playback returns 404.

## Future personalized generation

User-supplied API tokens and personalized exercises are not implemented yet.
The planned feature should remain optional: prepared static lessons stay the
default, while generated lessons should conform to the same lesson/token/audio
shape. A user token must never be committed or sent through this preview server;
storage and consent behavior should be chosen explicitly when that feature is
built.

More detail about the curriculum inventory and its sources is in
[`data/README.md`](data/README.md).
