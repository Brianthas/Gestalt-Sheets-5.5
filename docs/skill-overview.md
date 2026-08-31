# Skill overview in advancement

Engineering record for the skill list added to Trait advancement steps. Checked against dnd5e 5.3.3
and Foundry 14.365.

## What dnd5e already does

`TraitAdvancement#unfulfilledChoices` (`dnd5e.mjs:10022`) ends with

```
allChoices.exclude(new Set([...(selected.actor ?? []), ...selected.item]));
```

so anything the character already has is removed from the picker before it renders. Measured on a
Bard/Sorcerer with `acr:2 dec:2`, eight skills at `1` and eight at `0.5`: the default-mode step
offered exactly the eight at `0`, and the expertise-mode step offered exactly the eight at `1`.

That is a complete gate and this module does not add a second one. What it does not do is show the
character's current state, which is the thing worth seeing when two classes are handing out skills.

## Where the panel attaches

`Hooks.on("renderTraitFlow", ...)`. The hook fires with the `TraitFlow` and its form element, before
`renderAdvancementManager`, and an element appended during it survives into the manager's DOM -
confirmed by injecting a marker and re-reading after the manager render.

The step's markup is

```
form.advancement.flow[data-type="Trait"]
  div[data-application-part="header"] > h3
  div.standard-form[data-application-part="content"]
    fieldset > legend + select[name="added"]
```

The panel is appended to the content part. The flow re-renders in place after every pick, so the
handler removes its own previous panel first.

## Reading the character's state

`flow.advancement.actor` is the **manager's clone**, not the world actor. Verified: picking
Acrobatics moved `acr` from 0 to 1 on `flow.advancement.actor` while the real actor stayed at 0 until
the manager completed. That is what makes picks made earlier in the same level-up visible in the list.

Proficiency comes from `actor.system.skills[key].value`: 0, 0.5, 1 or 2. Half proficiency is not a
proficiency entry - it is Jack of All Trades raising the derived value to 0.5 - so it can only be read
from the derived value, never from `_source`.

## Making a pick

Clicking a row sets `select[name="added"]` and dispatches a bubbling `change`. That reaches
`TraitFlow#_handleForm`, which calls `advancement.apply(this.level, { key })`. The module never writes
a proficiency itself. Driving the select from script was confirmed to produce the same result as
using it by hand: `value.chosen` gained the key, the option disappeared, and a trait slot rendered.

## Why a row is greyed

An absent option means the system will not accept the pick, but a select cannot say why. The reason is
reconstructed for the tooltip only:

| Condition | Tooltip |
| --- | --- |
| expertise mode, value 0 | Expertise needs proficiency in the skill first |
| already at or above what the mode would set | Already expertise, or already proficient |
| not among the step's skill options | Not one of this step's options |

The wording avoids naming a class: the same step shape belongs to backgrounds and species too, and
saying "this class cannot grant it" on the Acolyte background was simply wrong.

Once every pick in the step is spent dnd5e drops the picker entirely, so the offer set is empty and
every row is greyed. Those rows get no tooltip: saying each remaining skill is "unavailable" would read
as a restriction rather than as the step being finished. 1.3.0 shipped with that condition wrong for a
few minutes of testing and it produced "Not available in this step" against fifteen skills that were
merely not needed.

The pool comes from `configuration.choices[].pool`, where `skills:*` means all eighteen. Rogue's is a
ten-skill list, which is what makes "not one of this step's options" a distinct and common case on a
gestalt character.

`configuration.type` does not exist on this advancement in 5.3.3; the trait family lives in the key
prefixes, so `isSkillTraitAdvancement` tests whether **any** grant or pool key starts with `skills:`.

## Which shapes exist

Surveying all 191 Trait advancements across `classes24`, `classes`, `subclasses`, `origins24`,
`backgrounds`, `races` and `feats24`:

| Shape | Count |
| --- | --- |
| `default` mode, wildcard pool | 8 |
| `default` mode, explicit pool (3 to 11 keys) | 30 |
| `default` mode, grants only | 3 |
| `expertise` mode, wildcard pool | 8 |
| `expertise` mode, explicit pool | 1 |
| mixed with a non-skill key | 7 |

Only `default` and `expertise` appear on skills. `skillGrantValue` still covers `forcedExpertise`,
`upgrade` and `mastery` because a homebrew class can use them, and their semantics differ: expertise
refuses a skill at 0, forcedExpertise does not, and upgrade sets 1 from 0 and 2 otherwise.

The seven mixed ones are the reason the check is `some` and not `every`: the 2014 Rogue's Expertise
(`tool:thief` with `skills:*`), the Skilled feat (`skills:*` with `tool:*`), and the Background
Proficiencies step of Acolyte, Criminal, Sage and Soldier. Requiring every key to be a skill hid the
panel on every background a character will ever take. Non-skill options are ignored by the panel and
remain in dnd5e's picker, which still lists them.

Grants-only steps keep the panel. High Elf's Keen Senses grants Perception with nothing to choose, and
seeing that it duplicates a proficiency the other class already gave is the kind of overlap this is
for.

## Testing notes

The Hit Points step of a **second** class blocks Next until a value exists. Take Average is a
`<dnd5e-checkbox name="useAverage">`, not a button, which is what a first scripted pass failed to find.

Closing a manager mid-run raises a "Stop Advancement" `DialogV2`; an `await app.close()` hangs until
its `button[data-action="yes"]` is clicked.

A full Bard 1 then Rogue 1 gestalt run ends with `acr:2 dec:1 prc:1 prf:1 per:1 slt:1 ste:2`, and the
four states to look for are: no mark, `fa-circle-half-stroke`, `fa-check`, `fa-check-double`.

`item.toObject()` on an **owned** class carries that item's applied advancement values, so a probe
built from a character's existing class arrives with its choices already made and offers nothing.
Clear each `advancement[].value` when copying one, or the step under test is a no-op.

The list is capped at `19rem`. The eighteen-skill list measures 242px in the 460px window, so it does
not scroll; forcing the cap to `6rem` in the page makes `scrollHeight` 242 against a 96px client and
the element scrolls, which is what proves the cap is a bound rather than a clip.

What a full pass covers: every class in both packs (57 and 52 Trait steps, 13 and 13 with skill keys,
one panel each and none on the rest); the four mixed backgrounds; the two grants-only species; the
Skilled feat; a Plutonium-imported class with a six-key explicit pool; picking and removing through
the panel; `forLevelChange` reaching Rogue's level 6 Expertise; the non-gestalt and module-off gates;
and two extra renders producing one panel rather than three.
