# JLPT N5 lesson app

A minimal browser app for working through JLPT N5 grammar exercises. It reveals
Japanese sentences character by character, displays furigana, highlights token
types on hover, plays Japanese narration, accepts an English translation, and
then shows the prepared solution.

## Architecture

The deployed app is fully static. At runtime the browser only loads HTML, CSS,
JavaScript, JSON, and WAV files. It does not tokenize text, read an API key, run
Node.js, or call OpenAI.

Development-time generation is split from the browser runtime:

| Path | Purpose | Git status |
| --- | --- | --- |
| `data/source/introduction.json` | Authored introduction, readings, and glosses | Committed |
| `data/source/exercises.json` | Authored exercises, solutions, readings, glosses, and grammar references | Committed |
| `data/jlpt-n5-grammar.json` | Canonical flat JLPT N5 grammar inventory | Committed |
| `data/jlpt-n5-vocabulary.json` | Synthetic N5 vocabulary core plus labeled learner favorites | Committed |
| `data/introduction.json` | Generated browser-ready introduction with tokens | Committed |
| `data/exercises.json` | Generated browser-ready exercises with tokens | Committed |
| `assets/voices/*.wav` | Generated narration used directly by the browser | Ignored for now |

`scripts/prepare-content.js` runs Lindera with IPADIC during development. It
validates grammar references, tokenizes each sentence, applies authored readings
and word glosses, and writes the browser-ready JSON. Lindera is therefore a
development dependency only.

`scripts/generate-voices.js` creates stable WAV filenames. It keeps an existing
voice, restores a matching file from the legacy `.cache/speech/` directory, or
calls OpenAI only when the file is missing. The current speech configuration is
kept in that script so a lesson produces a consistent cache identity.

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

## Testing

Run the offline static contract tests:

```sh
npm test
```

These validate source/generated-data consistency, token reconstruction, grammar
references, audio paths, public static responses, blocked private paths, and the
absence of runtime API/OpenAI calls in `app.js`.

After generating voices, validate every local WAV referenced by the lessons:

```sh
npm run test:voices
```

This command does not generate audio or contact OpenAI. It checks that each file
exists, is non-empty, and has a WAV header.

For a browser check, run `npm start` and verify:

1. The introduction draws character by character; furigana follows its kanji.
2. The speaker button appears after the sentence and plays the same recording on repeated clicks.
3. `次へ` fades to an exercise, then the translation field and `送信` appear and the field receives focus.
4. Hover colors appear only after their tokens are revealed. Nouns, verbs, and adjectives show English tooltips; particles and auxiliaries do not.
5. `送信` reveals the prepared solution, changes to `次へ`, and advances without repeating the immediately previous exercise.
6. The browser network panel contains only static `GET` requests and no `/api/` or OpenAI request.

## Editing lessons

1. Edit lesson files under `data/source/`; do not hand-edit generated token arrays.
2. Reference at least two valid IDs from `data/jlpt-n5-grammar.json` in each exercise.
3. Run `npm run content` and review the generated JSON diff.
4. Run `npm run voices` for missing narration.
5. Run `npm test`, `npm run test:voices`, and the browser checklist.

The vocabulary inventory is curated directly in `data/jlpt-n5-vocabulary.json`.
Keep exam-oriented additions as `core` and motivating beginner additions as
`supplemental`; do not imply that either is an official JLPT item list.

Word tooltips are intentionally limited to nouns, verbs, and adjectives. Grammar
elements such as particles and auxiliary endings receive hover colors but no
translation tooltip.

## Static deployment

A deployment needs only `index.html`, `app.js`, `styles.css`, the generated JSON
under `data/`, `data/jlpt-n5-grammar.json`, and the referenced files under
`assets/voices/`. No Node process or API key is required.

The WAV files are ignored while their size and eventual compression format are
being evaluated. A deployment process must therefore copy the local WAV files
into its artifact explicitly; a fresh clone will not contain them.

## Future personalized generation

User-supplied API tokens and personalized exercises are not implemented yet.
The planned feature should remain optional: prepared static lessons stay the
default, while generated lessons should conform to the same lesson/token/audio
shape. A user token must never be committed or sent through this preview server;
storage and consent behavior should be chosen explicitly when that feature is
built.

More detail about the curriculum inventory and its sources is in
[`data/README.md`](data/README.md).
