# ChakuChaku

A minimal browser app for working through JLPT N5 grammar, Hiragana, Katakana,
Kanji, and vocabulary exercises. Grammar lessons reveal prompts character by character, display
furigana and token details, and accept translations in either direction.
Hiragana lessons use complete N5 vocabulary words in both Hiragana-to-rōmaji
and rōmaji-to-Hiragana directions, then grade every kana mechanically. Katakana
uses a curated beginner vocabulary pool, reversible IME spellings for long
vowels and foreign sounds, and a concealed meaning hint. Its recognition-heavy
seven-exercise cadence shows five Katakana-to-rōmaji prompts—four full words
and one standalone item—plus one
Hiragana-to-Katakana prompt, and one rōmaji-to-Katakana prompt. Paired prompts
review every valid Hiragana and Katakana unit in the word. Statistics retain
every graded position; SRS folds repeated units into one conservative update.
Vocabulary alternates Japanese-to-English and English-to-Japanese prompts,
grades curated answer forms locally, and schedules one shared card per word.
Kanji exercises use complete beginner words in alternating word-to-reading and
reading-to-missing-character directions. All 209 characters in the B6-B4
curriculum are active and have their own FSRS cards. Kanji-only example words
fill the few gaps in the N5 vocabulary inventory without entering its SRS.
A single top menu switches study sections and provides settings, SRS progress
statistics, exercise history, and a project link.

## Architecture

The deployed app is fully static. By default the browser only loads HTML, CSS,
JavaScript, JSON, and M4A files. It does not tokenize text, read a project API
key, run Node.js, or require a backend. Learners may optionally provide their
own OpenAI key in Settings to enable grammar autocorrection.

The web release is also an installable Progressive Web App. Its versioned
service worker caches the application shell and lesson data for offline study.
Voice files are cached only after playback, avoiding an unnecessary download of
the complete narration collection. Capacitor builds disable service-worker
registration because their reviewed `dist/` assets are bundled locally.
The native apps persist SRS, history, and settings through Capacitor Preferences
and expose versioned progress backup/import controls. On mobile, exports use the
system share sheet; the learner chooses the destination.

Development-time generation is split from the browser runtime:

| Path | Purpose | Git status |
| --- | --- | --- |
| `data/source/introduction.json` | Authored introduction and optional ambiguity overrides | Committed |
| `data/source/exercises.json` | Authored exercises, solutions, grammar references, and optional ambiguity overrides | Committed |
| `data/jlpt-n5-grammar.json` | Canonical flat JLPT N5 grammar inventory | Committed |
| `data/grammar-coverage.md` | Generated checklist of grammar points covered by exercises | Committed |
| `data/jlpt-n5-vocabulary.json` | Synthetic N5 vocabulary core plus labeled learner favorites | Committed |
| `data/source/rikkyo-n5-kanji.json` | Rikkyo's staged 209-character N5-equivalent curriculum | Committed |
| `data/jlpt-n5-kanji.json` | Generated kanji metadata used by lessons and Statistics | Committed |
| `data/kanji-contexts.json` | Kanji-only example words for curriculum coverage gaps | Committed |
| `data/introduction.json` | Generated browser-ready introduction with tokens | Committed |
| `data/exercises.json` | Generated browser-ready exercises with tokens | Committed |
| `srs.js` | Local FSRS card persistence and grammar-point scheduling | Committed |
| `learning-stats.js` | Versioned local encounter history and aggregate counters | Committed |
| `statistics.js` | Derived SRS progress, result history, streak, and exposure metrics | Committed |
| `autocorrect.js` | Optional browser-side OpenAI grammar assessment | Committed |
| `hiragana.js` | Hiragana word selection, mora segmentation, and deterministic grading | Committed |
| `katakana.js` | Katakana selection, IME-safe romanization, and deterministic grading | Committed |
| `kanji.js` | Contextual Kanji selection, reading normalization, and deterministic grading | Committed |
| `vocabulary.js` | Bidirectional vocabulary selection, normalization, and deterministic grading | Committed |
| `assets/voices/{grammar,vocab}/*.m4a` | Generated AAC narration used directly by the browser | Committed when available |

`scripts/prepare-content.js` runs Lindera with IPADIC during development. It
tokenizes each sentence, searches the complete vocabulary dictionary, narrows
homographs by part of speech, and generates the lesson and token vocabulary IDs.
It also derives conservative token ranges for grammar patterns that have one
unambiguous location in the Japanese sentence. Lindera is therefore a
development dependency only.

The browser loads `jlpt-n5-vocabulary.json` and resolves tooltip meanings from
those token vocabulary IDs. Exercise files never duplicate readings or English
glosses, and they do not list vocabulary IDs manually. Vocabulary entries may
declare `variants` for alternate spelling and `inflections` for possible forms
the tokenizer cannot reliably derive. An inflection may opt into
`allowPartOfSpeechMismatch` when Lindera assigns that exact form the wrong part
of speech; other forms remain strictly matched.

If global lookup produces more than one compatible entry, generation fails with
the candidates. The source lesson can then add only the required disambiguation:

```json
"vocabularyOverrides": {
  "surface form": "vocab-id",
  "repeated form#2": "vocab-id"
}
```

Sentence-specific Lindera analysis corrections belong beside the authored
lesson instead of in tokenizer code:

```json
"tokenOverrides": {
  "surface form": { "category": "verb" },
  "repeated form#2": { "category": "auxiliary" }
}
```

Token overrides accept only `category` and `reading`. Missing words, invalid
overrides, redundant overrides, and unresolved ambiguities are reported during
`npm run content`. The `#2` suffix targets one occurrence when a written form
appears more than once.

`scripts/generate-voices.js` creates stable M4A filenames for lessons and
vocabulary. It keeps a valid existing voice, restores a valid matching WAV from
the legacy `.cache/speech/` directory, or calls OpenAI when the file is missing,
silent, or implausibly long. Every generated WAV is validated before being
compressed to mono AAC-LC. Vocabulary requests explicitly provide the intended
reading plus the spelling, English meaning, and part of speech, so homographs
use the requested pronunciation with enough lexical context. Word clips use a
stricter duration profile and reject excessive leading, internal, or trailing
silence. Harmless silence at the outer edges is trimmed to a 100 ms margin
before those strict checks, preventing a clean pronunciation from wasting an
API request. The current speech configurations are kept in that script so each
item produces a consistent cache identity.

`scripts/serve.js` is an allowlisted local preview server. It is not an
application backend and accepts only `GET` and `HEAD`. In particular, it cannot
serve `.key`, source data, development scripts, or an `/api/*` endpoint.

## Setup

Install the dependencies:

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

For a cautious test run, cap the number of new OpenAI generations. Valid local
voices and files restored from the local cache do not consume this limit:

```sh
npm run voices -- --limit 1
npm run voices -- --limit 3
```

To replace one known-bad recording without reusing its existing file or legacy
cache entry, select its exact source ID explicitly:

```sh
npm run voices -- --id left-home-without-key --force
```

Vocabulary generation is a separate, explicitly bounded command. It processes
the 721 core entries before the 105 supplemental entries and uses the stable
path `assets/voices/vocab/<romaji>.m4a`. Homophones use curated semantic names
such as `ame-rain.m4a` and `ame-candy.m4a`. Unsafe names, unresolved collisions,
duplicate paths, and unnecessary overrides fail validation. Unlike lesson
generation, it refuses an implicit unlimited run:

```sh
npm run voices:vocabulary -- --limit 1
npm run voices:vocabulary -- --limit 3
npm run voices:vocabulary -- --all
```

Use the zero-cost coverage mode to inspect validated, missing, invalid, skipped,
and core/supplemental totals without contacting OpenAI. Every existing word M4A
is decoded and checked with the same strict profile used during generation, so
the command can take longer as coverage grows:

```sh
npm run voices:vocabulary -- --coverage
```

Voice generation reads `OPENAI_API_KEY` first and otherwise reads `.key` in the
repository root. Both `.key` and `*.key` are ignored. The file may contain either
the bare key or `OPENAI_API_KEY=...`. The key is read only by the development
script and must never be added to browser code or generated data.

Run both generators together:

```sh
npm run generate
```

Existing M4A files are deliberately kept. To regenerate one after changing its
text or voice settings, remove that lesson's M4A and run `npm run voices` again.
Set `"skipVoiceGeneration": true` on a source exercise when a known model
failure should be skipped by future batches. Apply it to recognition and
production variants that speak the same Japanese text.

## Running

Start the static preview:

```sh
npm start
```

Open http://127.0.0.1:4173. Set `PORT` to use another port. The study sections
also have direct URLs:

```text
http://127.0.0.1:4173/grammar
http://127.0.0.1:4173/hiragana
http://127.0.0.1:4173/katakana
http://127.0.0.1:4173/vocabulary
```

Build the shared PWA output and synchronize it into both native projects:

```sh
npm run native:sync
npm run android:open
npm run ios:open # requires macOS and Xcode
```

The complete architecture and current store checklist live in
[`docs/mobile-plan.md`](docs/mobile-plan.md) and
[`docs/store-release.md`](docs/store-release.md).

To test only production exercises (English prompt, Japanese answer), open:

```text
http://127.0.0.1:4173/?type=production
```

The query parameter only filters the exercise pool; it is not a saved learner
setting. Remove it to restore normal SRS selection across both exercise types.

Production inputs use the pinned WanaKana browser bundle to convert IME-style
romaji to kana as the learner types. Native kana and kanji input remains valid.
As with a Japanese IME, particles must be typed by spelling: `ha` produces `は`
and `wo` produces `を`. The converter is unbound for English recognition input.

## Hiragana exercises

The Hiragana section builds its exercise pool at runtime from complete `core`
entries in `jlpt-n5-vocabulary.json`. Katakana spellings, affixes, and readings
with prolonged sound marks are excluded so this section does not teach a
Katakana word as though its normal spelling were Hiragana. The preferred
written form and English meaning are shown with every prompt. Generated
vocabulary narration is shared with its Hiragana exercise when the packaged M4A
is available.

Exercise directions alternate after each completed attempt. WanaKana provides
the displayed rōmaji and IME-style input conversion, but answer assessment is
local and deterministic. The grader normalizes case and common punctuation,
aligns the learner's answer to the expected word, and returns `Good` or `Again`
for every Hiragana part. Contracted sounds such as `みゅ` are one part, as are
standalone `ん` and small `っ`. If the same part occurs more than once, any
failed occurrence makes that part's single SRS review a failure.

## Vocabulary exercises

The Vocabulary section uses every `core` and `supplemental` entry in the shared
inventory. It alternates Japanese-to-English recognition with
English-to-Japanese recall. Japanese prompts show a reading when it differs
from the written form; English prompts hide the reading and show only the part
of speech to disambiguate meanings such as noun and adjective senses.

Assessment is local and deterministic. English answers accept the curated
gloss and its explicit comma-, semicolon-, or slash-separated alternatives,
with harmless case, article, punctuation, and spacing differences normalized.
Japanese answers accept the canonical written form, reading, declared variants,
and exact same-meaning synonyms with the same part of speech. Both directions
update the same vocabulary FSRS card and appear in History, the global result
chart, completed-exercise totals, and Vocabulary statistics.
Japanese-to-translation prompts offer generated word narration when its M4A is
included in the build. The same recording is reused by matching Kana word
exercises. Translation-to-Japanese prompts keep audio hidden until submission,
then show a compact speaker beside the revealed Japanese answer.

## Kanji exercises

The Kanji section covers Rikkyo's complete 209-character B6-B4 curriculum. Each
character is practised inside a complete word instead of as an isolated list of
dictionary readings. The app prefers the N5 core vocabulary and uses a small,
separate Kanji-only context catalogue for characters without a suitable core
word. Those examples do not become vocabulary SRS cards. Directions alternate:
a Kanji word asks for its complete reading, then a word reading and a `□` context
ask for the missing target character. The optional meaning hint remains
concealed until requested.

Assessment is local and deterministic. Reading answers accept kana or rōmaji
after normalization; missing-character answers must match the one target Kanji.
The result starts as `Got it` or `Not yet` and remains manually overridable. Only
the target Kanji updates its FSRS card, while every Kanji present in the context
is counted as encountered. Packaged vocabulary audio stays hidden until the
solution is revealed, where it can play automatically according to Settings.

## Learning statistics

Displaying an exercise records one encounter for every assessed grammar point
and every unique vocabulary and curriculum kanji ID referenced by that
exercise. Submitting records the exercise, answer, and submission timestamp in
history; advancing after self-assessment adds the grammar outcomes to that same
attempt. The introduction, character reveal, solution rendering, and audio
playback do not add encounters. Repeating an exercise later adds another
encounter.

Before that first encounter is recorded, a recognition prompt highlights any
new grammar pattern whose token range could be derived unambiguously. Hovering
it shows the canonical pattern and short English meaning. The aid is shown only
for that grammar point's first presentation; later visits use the normal token
behavior. Abstract structures and ambiguous matches are deliberately left
unmarked instead of guessing at a sentence span.
The introduction is the exception: its `の`, `へ`, and `ましょう` grammar aids
remain highlighted every time it is displayed and never count as encounters.

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
  "kana": {},
  "vocabulary": {},
  "kanji": {},
  "exerciseHistory": [
    {
      "exerciseId": "coffee-before-work",
      "text": "毎朝、コーヒーを飲んでから仕事に行きます。",
      "answer": "Every morning I go to work after drinking coffee.",
      "submittedAt": "2026-08-09T11:31:00.000Z",
      "grammarRatings": [
        { "grammarPointId": "te-kara", "outcome": "good" },
        { "grammarPointId": "verb-masu", "outcome": "again" }
      ]
    }
  ]
}
```

Counts represent exercise presentations containing an item, not repeated token
occurrences inside one sentence. Every encounter timestamp is retained for
future scheduling work, while the count and first/last fields keep later summary
queries simple. Exercise attempts are displayed newest-first and grouped using
the browser's local calendar day. The data is local to the browser profile and
origin, is not synced to a server, and is removed if site data is cleared.
These encounter counts remain separate from SRS scheduling. A larger history
may eventually warrant migration from local storage to IndexedDB.

Statistics derives its Overview and section views from both local stores. The
Overview shows mastered knowledge units, all due SRS cards, reviewed curriculum
coverage, the last 30 results across grammar, kana, Kanji, and vocabulary, the current
study streak, a 14-day success/failure chart, and the most urgent due or
recently failed grammar points. A card is Mature when it is in FSRS Review with
at least 30 days of stability. It is Mastered at 90 days of stability while its
current FSRS retrievability remains at least 80%. Shared kana cards count once
in the global total even when they appear in both script views.

Grammar, kana, and Vocabulary rows expose FSRS state, stability, result counts,
next review, and last review, with filters for mastered, mature, due, learning,
and new items. Their progress bars separate Mastered, Mature, learning/due,
encountered-only, and new items instead of treating every graduated Review card
as durable knowledge.
Kanji remains exposure-only and shows coverage, total encounters, last
encounter, and sorting by recency or frequency.

## Spaced repetition

Each assessed grammar point has its own card, scheduled by the MIT-licensed
[`ts-fsrs`](https://open-spaced-repetition.github.io/ts-fsrs/) package. After
viewing a solution, the learner marks every listed point as `できなかった` or
`できた`. These map to FSRS `Again` and `Good`; choices remain editable until
the learner presses `次へ`.

Cards are stored separately under `jlpt-n5.srs.v1` in browser local storage.
Grammar, kana, and vocabulary use distinct card buckets, so their schedules
never collide. Hiragana selection targets the most urgent kana and then chooses
a complete N5 word containing it. Vocabulary selection targets the most urgent
word and alternates the requested translation direction after each completed
Vocabulary attempt.
Exercise selection first targets the oldest due item, then an unseen item. Once
all available items are scheduled and none are due, it switches to uniformly
random practice instead of repeatedly pulling the nearest future review forward.
It randomly chooses an exercise that assesses the target while avoiding an
immediate exercise repeat.
Recognition selection prefers exercises containing no more than one grammar
point that has never been rated. If none are available, it uses the smallest
new-point count present so fresh learners and curriculum gaps cannot deadlock.
Ordinary exercise positions use recognition prompts. Every fifth completed
exercise attempts to use a production prompt, but only when every grammar point
it assesses has been completed in at least two distinct recognition exercises;
otherwise selection falls back to recognition. The `?type=production` testing
override bypasses these gates. This keeps the scheduler at grammar-point level
while preventing production from introducing unseen grammar.

### Optional AI autocorrect

Settings can enable automatic `Again`/`Good` selection for the assessed grammar
points. One request evaluates every point together using
[`gpt-4.1-mini`](https://developers.openai.com/api/docs/models/gpt-4.1-mini),
a non-reasoning 100-token output cap, standard service tier, no retry, and a
strict [Structured Output](https://developers.openai.com/api/docs/guides/structured-outputs).
Blank answers and answers matching the prepared solution are rated locally and
cost no API request. AI selections remain editable before the learner advances.

The learner's key is kept in `sessionStorage`, never in persistent settings or
the repository, and is cleared when the tab session ends. The Settings UI warns
learners to use a restricted project key. This is still browser-side key use,
which is less secure than a backend secret store; it is an explicit tradeoff to
preserve static hosting. See OpenAI's
[API key guidance](https://developers.openai.com/api/docs/guides/production-best-practices#api-keys).
The request sends only the displayed prompt, prepared translation, learner
answer, and the assessed grammar patterns and meanings. `store: false` is set.
Authentication, quota, billing, network, refusal, incomplete, and malformed
output failures leave the existing manual controls available.

## Testing

Run the offline static contract tests:

```sh
npm test
```

These run a check-only content build and validate source/generated-data
consistency, token reconstruction, grammar references, FSRS persistence and
priority, derived statistics, bounded autocorrect requests and responses,
audio paths, public static responses, blocked private paths, and the absence of
an application backend or embedded API key.

After generating voices, validate every available local M4A referenced by the
lessons or vocabulary inventory:

```sh
npm run test:voices
```

This command does not generate audio or contact OpenAI. It decodes every
available AAC file and checks that it contains audible speech with a plausible
duration and no unreasonable silent section for its Japanese content. Word
recordings additionally receive the strict leading/trailing-silence and
word-length checks used during generation.

For a browser check, run `npm start` and verify:

1. The introduction draws character by character; furigana follows its kanji.
2. The speaker button appears after the sentence and plays the same recording on repeated clicks; it is disabled and grey when that lesson has no local narration.
3. `次へ` fades to an exercise, then the translation field and `送信` appear and the field receives focus.
4. Hovering, clicking, or tapping colors a revealed token; only one selected token remains active, and selecting elsewhere dismisses it. Nouns, verbs, adjectives, adverbs, and interjections show English tooltips. On a grammar point's first encounter, its unambiguous sentence span stays highlighted and shows a grammar tooltip even when translation tooltips are disabled; reload the page to confirm that it does not appear twice.
5. `送信` reveals the prepared solution and an always-visible assessed-grammar list. `次へ` remains disabled until every point is marked `できなかった` or `できた`.
6. With `?type=production`, every exercise shows an English prompt, accepts a Japanese answer, and reveals the Japanese reference solution with furigana and a compact speaker button. The furigana setting applies to the answer, and the speaker is disabled when its local recording is missing.
7. With AI autocorrect disabled, the browser makes no OpenAI request. With a session key and autocorrect enabled, one request selects the grammar ratings; they remain editable, and any request failure falls back to manual rating.
8. Displaying an exercise adds one entry to `jlpt-n5.learning-stats.v1`; submitting it does not increment the counts again.
9. The top menu switches between `/grammar`, `/hiragana`, `/katakana`, `/kanji`, and `/vocabulary`; Statistics and History open their corresponding views, arrow keys move through the entries, and Escape or an outside click closes it.
10. Settings opens a modal. Display and audio toggles survive reloads; the OpenAI key survives only reloads in the same tab and autocorrect cannot be enabled without it.
11. Statistics opens on the current section, counts completed Grammar, Hiragana, Katakana, Kanji, and Vocabulary exercises in the global overview, and includes every grammar-point, kana, Kanji, and vocabulary rating in its recent results and 14-day chart. Every scheduled section has status filters. History groups attempts by local calendar day, shows seven days at a time, and lazily expands one day with at most 50 attempts per page. Each attempt shows its answer plus green successful and red failed item tags.
12. In Katakana, the seven-prompt cadence includes one Hiragana-to-Katakana exercise; its result grades each aligned pair and updates both scripts in SRS and Statistics.
13. One Katakana recognition slot shows a single learning item and asks for rōmaji. Contracted and foreign-sound units stay together, while context-only `ッ` and `ー` remain word-only.
14. In Vocabulary, consecutive completed prompts alternate Japanese-to-English and English-to-Japanese. Correct and incorrect answers each update one word card, and pressing Enter submits then advances from the result.
15. In Kanji, consecutive completed prompts alternate complete-word reading and missing-character recall. The hidden meaning hint never reveals the answer, audio appears only with the solution, and changing the self-assessment changes the one Kanji card saved on advance.

## Editing lessons

1. Edit lesson files under `data/source/`; do not hand-edit generated token arrays, vocabulary IDs, or kanji IDs.
2. List at least two valid grammar IDs for a recognition exercise. A short
   production exercise may deliberately isolate one point; otherwise aim for
   two to four. Keep additional points when each one materially affects the
   translation, and omit incidental foundations and routine machinery.
3. Run `npm run content` and review the generated JSON diff.
4. Add missing dictionary words or the specific override requested by the generator.
5. Run `npm run voices` for missing narration.
6. Run `npm test`, `npm run test:voices`, and the browser checklist.

Use [`data/grammar-coverage.md`](data/grammar-coverage.md) to choose an unchecked
grammar point for the next exercise. `npm run content` regenerates the checklist
from the exercise `grammarPointIds`, and `npm run content:check` fails if it is
stale. A checked point means at least one exercise meaningfully assesses it; it
does not claim mastery. One exercise may assess several points, and a point
remains checked when it is reinforced by more than one exercise.

The vocabulary inventory is curated directly in `data/jlpt-n5-vocabulary.json`.
Keep exam-oriented additions as `core` and motivating beginner additions as
`supplemental`; do not imply that either is an official JLPT item list.

Kanji curriculum membership comes from Rikkyo's B6-B4 list rather than lesson
authors. Run `npm run kanji:update` to refresh meanings and readings from
KANJIDIC2, then run `npm run content` to regenerate lesson `kanjiIds`. KANJIDIC2
attribution and licence copies are under `licenses/`.

Word tooltips are intentionally limited to nouns, verbs, adjectives, adverbs,
and interjections. Grammar elements such as particles and auxiliary endings
receive hover colors but no ordinary translation tooltip. The one exception is
an unambiguous grammar span on its first encounter, which shows the grammar
inventory's pattern and meaning as a temporary learning aid. Vocabulary tooltip
meanings always come from the shared vocabulary inventory.

## Static deployment

A deployment needs only `index.html`, the browser JavaScript and CSS, the
generated JSON under `data/`, and the referenced files under `assets/voices/`.
Lesson recordings live under `assets/voices/grammar/`; reusable word
recordings live under `assets/voices/vocab/`.
The build copies the pinned `ts-fsrs` and WanaKana browser bundles and MIT
licenses into the artifact. No Node process, CDN, or API key is required for
the default manual workflow.

Build that allowlisted artifact locally with:

```sh
npm run build:static
```

The result is written to ignored `dist/`. The GitHub Pages workflow runs the
offline tests, builds the same artifact, and deploys it after each push to
`main`. It can also be started manually from the Actions tab. The available M4A
files are committed and included; exercises whose narration has not been
generated yet show the normal unavailable speaker state. Vocabulary filenames
are derived from their stable IDs, and only files present locally are copied and
listed as available in the artifact.

## Future personalized generation

Personalized exercise generation is not implemented yet. The optional learner
key currently supports only grammar autocorrection; prepared static lessons stay
the default. Future generated lessons should conform to the same lesson,
token, and audio shape and reuse the explicit session-only credential policy.

More detail about the curriculum inventory and its sources is in
[`data/README.md`](data/README.md).
