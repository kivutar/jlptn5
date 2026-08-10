# App improvement backlog

This document records learning and product problems observed while using the app. Each entry describes the problem before proposing an implementation. Proposed directions are not final decisions.

## Split broad SRS cards into demonstrable skills

**Status:** Observed, design needed

### Observation

The `common-counters` grammar point currently represents all of these counters:

- 人: people
- 枚: flat objects
- 本: long cylindrical objects
- 冊: bound volumes
- 台: machines and vehicles
- 匹: small animals
- 回: occurrences
- 階: floors
- 歳: age

A learner can correctly recognize or produce the person counter without knowing the others. The current SRS records that result as success for the single `common-counters` card, so it postpones practice for every counter in the group.

### Cause

The same grammar point ID is currently used for three different purposes:

1. Organizing related concepts in the curriculum.
2. Tagging which concepts an exercise uses.
3. Identifying the card scheduled and reviewed by the SRS.

Those purposes do not always need the same granularity. `common-counters` is a useful curriculum group, but it is too broad to be one schedulable skill.

### SRS principle

A successful review should advance only the knowledge that the answer demonstrated. If success with one form is not reasonable evidence of knowing every form in a grammar point, that grammar point is too broad to be an SRS card.

### Proposed direction

Give each counter its own grammar point ID and SRS card. Exercises should tag the exact counters they require. Keep a non-schedulable "Common counters" parent or category so the individual counters can still be presented together in the grammar list and statistics.

Individual cards are preferable to semantic bundles. Even related counters can have different readings and sound changes, such as 一人 and 二人 for 人 or 一本, 三本, and 六本 for 本. The UI can group related cards without making their mastery inseparable.

This distinction may apply to other broad grammar points too. Before splitting only counters, audit the inventory for entries that combine independently learnable forms.

### Migration considerations

- Do not copy the existing `common-counters` mastery level to every new counter card. A success on one counter is not evidence for all of them.
- Where exercise history identifies the counter that was actually reviewed, it may be possible to migrate that evidence to the corresponding new card.
- When the historical evidence is ambiguous, initialize the individual cards as unseen rather than granting unearned mastery.
- Preserve the old ID only as a curriculum grouping or retire it after existing stored data has been handled.
- Statistics should show separate mastery for each counter while allowing them to be viewed under a single Counters group.

### Open questions

- Should an encounter with a counter test only its choice, or also its number-specific reading and sound changes?
- Do irregular forms such as 一人 and 二人 need separate skills, or can exercises for the 人 card deliberately cover them over time?
- Can the same parent-and-child model cleanly separate other umbrella grammar points without complicating exercise authoring?
