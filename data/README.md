# JLPT N5 grammar inventory

`jlpt-n5-grammar.json` is the canonical preliminary curriculum for the app. It
is deliberately a flat array: categories are labels on entries, not nested
sections. Stable `id` values can later key lessons, exercises, and user progress.

`grammar-coverage.md` is the generated flat checklist for exercise planning. A
checked bullet means at least one authored exercise uses that point and records
its ID; the bullet also lists every matching exercise. Coverage measures learner
exposure, not mastery. Run `npm run content` after editing exercises to update it
rather than editing the checklist directly.

Each exercise must list every grammar point its sentence actually uses, including
foundation concepts, conjugation systems, and secondary constructions rather
than only its teaching target. This semantic audit remains an editorial step:
tokenization can identify word forms, but cannot reliably infer every grammar
relationship.

Each entry contains only scalar fields:

- `category`: a filterable curriculum area.
- `kind`: concept, form, particle, pattern, expression, structure, or system.
- `pattern`: the Japanese form or an abstract formation.
- `name`: a concise English label.
- `meaning`: the learning objective.
- `scope`: `foundation`, `core`, or `boundary`.

There is no official itemized JLPT grammar syllabus. This inventory synthesizes
the shared conversation with the official JLPT N5 test-item descriptions and
the N5 curricula published by Bunpro, JLPT Sensei, and Yatta. `boundary` keeps
useful points that sources variously place at N5 or N4 without presenting them
as undisputed N5 requirements.

Writing systems, vocabulary, and kanji are excluded because this file is the
grammar curriculum. Grammar-dependent counting, time, and question systems are
included.

## JLPT N5 vocabulary inventory

`jlpt-n5-vocabulary.json` is a flat synthetic vocabulary inventory. There is no
official current word list: the JLPT organizers explain that they stopped
publishing vocabulary, kanji, and grammar specifications after the 2010 revision
because the test is intended to measure communicative use rather than memorized
lists.

The inventory currently contains 772 entries:

- 718 `core` entries adapted from the MIT-licensed Open Anki JLPT N5 deck at
  commit `1ad66734417aca9dbcca6b2d5ee440cb13ab3ba0`.
- 54 `supplemental` entries: 38 recognizable and motivating beginner words plus
  16 words needed by the current lessons. These include `ラーメン`, `寿司`,
  `アニメ`, `漫画`, food, travel, culture, and modern technology terms.

The `core` label means "exam-oriented consensus candidate," not "officially
required." The `supplemental` label keeps useful lesson vocabulary without
inflating claims about the exam. This is why a familiar word can be retained
even when older exam-preparation lists omit it.

Each entry contains:

- `id`: a stable content-derived identifier.
- `term`: the preferred Japanese written form.
- `reading`: the kana reading, normalized to hiragana where applicable.
- `meaning`: a concise English gloss.
- `partOfSpeech`: a broad app-friendly grammatical category.
- `scope`: `core` or `supplemental`.
- `source`: the origin of the entry.
- `variants`: optional alternative written forms.
- `inflections`: optional surface/reading pairs for tokenizer ambiguity.
- `topic`: an optional topic on curated supplemental entries.

The upstream MIT notice is retained in
`licenses/open-anki-jlpt-decks-MIT.txt`. Sources used to establish the size and
scope of the synthetic list:

- https://www.jlpt.jp/e/faq/ (no official post-2010 vocabulary specification)
- https://github.com/jamsinclair/open-anki-jlpt-decks (open N5 dataset)
- https://www.mlcjapanese.co.jp/n5_04_01.html (about 800 words; 802-item study list)
- https://www.tanos.co.uk/jlpt/jlpt5/ (689-word N5 study list)

## JLPT N5 kanji inventory

`jlpt-n5-kanji.json` is a flat inventory of the exact 209-character curriculum
that Rikkyo University describes as equivalent to JLPT N5. The source ordering
and stages are retained: 73 `B6`, 68 `B5`, and 68 `B4` characters. This is a
coherent beginner curriculum, not an official JLPT specification; the JLPT has
not published an itemized kanji list since its 2010 revision.

Each entry has a stable Unicode-based `id`, one `character`, a concise English
`meaning`, its Rikkyo `stage`, and `onReadings` / `kunReadings` arrays. The exact
stage membership is stored in `source/rikkyo-n5-kanji.json`. Meanings and
Japanese readings are generated from current KANJIDIC2 data. When a standalone
core vocabulary entry exists, its learner-oriented meaning takes precedence.
Readings are limited to forms evidenced by the app's core vocabulary; a single
dictionary reading is retained as a fallback when the vocabulary has no usable
evidence. Readings use hiragana stems and are intentionally not exhaustive.
Irregular whole-word readings such as 今日（きょう）remain vocabulary data.

Run `npm run kanji:update` to download current KANJIDIC2 data and regenerate the
flat inventory. For an already downloaded XML or XML.GZ file, run
`npm run kanji:update -- --source /path/to/kanjidic2.xml.gz`.

Sources and licences:

- https://www.jlpt.jp/e/faq/ (no official post-2010 kanji specification)
- https://cjle.rikkyo.ac.jp/SitePages/pdf/kanji1.pdf (B6-B4 curriculum)
- https://www.edrdg.org/wiki/KANJIDIC_Project.html (meanings and readings)
- `../licenses/KANJIDIC2-NOTICE.txt` and
  `../licenses/KANJIDIC2-CC-BY-SA-4.0.txt`

## Static lesson assets

Authored introduction and exercise data lives in `source/`. Lessons do not
contain local vocabulary lists, readings, or gloss maps. Run `npm run content`
after editing them. This tokenizes every sentence, searches the full dictionary,
narrows candidates by part of speech, and writes the discovered vocabulary IDs
into the browser-ready lesson and tokens. It also derives the unique curriculum
kanji IDs found in each sentence. At runtime, `app.js` obtains tooltip meanings
directly from `jlpt-n5-vocabulary.json` and Statistics metadata from
`jlpt-n5-kanji.json`.

Curated `inflections` are also authoritative POS corrections for their exact
surface forms. This lets the dictionary correct occasional Lindera analyses,
such as an adjective stem being classified as a verb, without adding
lesson-specific tokenizer exceptions.

If a surface form still has multiple compatible dictionary entries, the build
fails with all candidates. Add a `vocabularyOverrides` surface-to-ID mapping to
that source lesson only. Append an occurrence such as `#2` when repeated forms
need different meanings. Invalid, unused, and redundant overrides also fail so
temporary disambiguation does not accumulate unnoticed.

Run `npm run voices` to restore cached voices or generate any missing WAV files
through OpenAI. Voice files are written to `assets/voices/` and ignored by Git.
Silent or implausibly long responses are rejected and regenerated.
The API key is read only by this development command, from `OPENAI_API_KEY` or
`.key`; the browser app and static preview server do not read it or call OpenAI.

`npm run generate` prepares both the content and voices. `npm start` serves a
static local preview.

Sources consulted on 2026-08-08:

- https://www.jlpt.jp/e/faq/
- https://www.jlpt.jp/e/guideline/pdf/n5_e.pdf
- https://bunpro.jp/decks/nn10ai/Bunpro-N5-Grammar
- https://jlptsensei.com/jlpt-n5-grammar-list/
- https://www.yattajlpt.com/grammar/n5
