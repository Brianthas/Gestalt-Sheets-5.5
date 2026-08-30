const MODULE_ID = "gestalt-sheets-55";

/**
 * dnd5e's "Special Traits" sheet tab renders one native, guaranteed-interactive form field per entry in
 * `CONFIG.DND5E.characterFlags`, and its own code hardcodes those fields to save under `flags.dnd5e.<key>`
 * (see dnd5e's `base-actor-sheet.mjs`: `name: \`flags.dnd5e.${key}\``) - not a module's own flag namespace.
 * Using this instead of a custom-injected panel means no guessing at render hook names or CSS selectors;
 * dnd5e's own template and form-submission handling does all of the work.
 */
const GESTALT_FLAG = {
  ENABLED: "gestaltEnabled",
  DOUBLE_SPELL_SLOTS: "gestaltDoubleSpellSlots"
};

/* -------------------------------------------- */
/*  Setup                                       */
/* -------------------------------------------- */

/**
 * Register a libWrapper patch defensively. This module leans on several fairly deep, undocumented
 * dnd5e internals (Advancement class prototypes, CONFIG.Actor.dataModels) that a future dnd5e update
 * could rename or restructure. Without this, a single broken target would throw inside the `init` hook
 * and silently prevent every *later* `libWrapper.register` call in the same callback from running too -
 * one dnd5e refactor could quietly take out the entire module instead of just the affected feature.
 * Failing loudly per-patch means the GM finds out exactly what broke instead of guessing why gestalt
 * stopped working after a system update.
 * @param {string} target
 * @param {Function} fn
 * @param {string} type
 */
function registerLibWrapper(target, fn, type) {
  try {
    libWrapper.register(MODULE_ID, target, fn, type);
  } catch (err) {
    console.error(
      `${MODULE_ID} | Failed to patch "${target}". The dnd5e system may have changed something this `
      + "module depends on - some gestalt features will not work until the module is updated.", err
    );
    ui.notifications?.error(
      `Gestalt Sheets 5.5 failed to patch dnd5e (${target}). Some gestalt features may not work `
      + "correctly - check the console (F12) and consider reporting this on the module's GitHub issues.",
      { permanent: true }
    );
  }
}

Hooks.once("init", () => {
  if (!CONFIG.DND5E) {
    console.error(`${MODULE_ID} | The dnd5e system is not active. This module requires it and will not function.`);
    return;
  }

  game.settings.register(MODULE_ID, "moduleEnabled", {
    name: "GESTALT.Settings.ModuleEnabled.Name",
    hint: "GESTALT.Settings.ModuleEnabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // World setting, not a per-actor flag: whether ASI overlap is checked at all is a table-wide house
  // rule call, not something that should vary character to character within the same game.
  game.settings.register(MODULE_ID, "combinedAsi", {
    name: "GESTALT.Settings.CombinedAsi.Name",
    hint: "GESTALT.Settings.CombinedAsi.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  const section = game.i18n.localize("GESTALT.ModuleName");
  CONFIG.DND5E.characterFlags[GESTALT_FLAG.ENABLED] = {
    name: game.i18n.localize("GESTALT.EnableGestalt"),
    hint: game.i18n.localize("GESTALT.EnableGestaltHint"),
    section,
    type: Boolean
  };
  CONFIG.DND5E.characterFlags[GESTALT_FLAG.DOUBLE_SPELL_SLOTS] = {
    name: game.i18n.localize("GESTALT.DoubleSpellSlots"),
    hint: game.i18n.localize("GESTALT.DoubleSpellSlotsHint"),
    section,
    type: Boolean
  };

  if (!game.modules.get("lib-wrapper")?.active) {
    console.error(`${MODULE_ID} | The "libWrapper" module is required but is not active.`);
    ui.notifications?.error(
      "Gestalt Sheets 5.5 requires the \"libWrapper\" module to be installed and active. "
      + "Gestalt features will not work until it is enabled.",
      { permanent: true }
    );
    return;
  }

  registerLibWrapper("CONFIG.Actor.dataModels.character.prototype.prepareBaseData", function(wrapped, ...args) {
    wrapped(...args);
    applyGestaltLevel(this);
    applyGestaltHitDice(this);
  }, "WRAPPER");

  registerLibWrapper("CONFIG.Actor.dataModels.character.prototype.prepareDerivedData", function(wrapped, ...args) {
    wrapped(...args);
    applyGestaltHitPoints(this);
  }, "WRAPPER");

  registerLibWrapper("dnd5e.documents.advancement.Advancement.prototype.appliesToClass", function(wrapped) {
    if (!isGestaltActor(this.actor)) return wrapped();
    return appliesToGestaltClass(this);
  }, "MIXED");

  // Leveled spell slots (system.spells.spell1-9) are computed inside Actor5e#prepareData, *after* the
  // character data model's own prepareDerivedData already ran - a different, later point in the prepare
  // cycle than the wraps above, so it needs its own wrap on the actor document class rather than the
  // data model.
  registerLibWrapper("CONFIG.Actor.documentClass.prototype.prepareData", function(wrapped, ...args) {
    wrapped(...args);
    applyGestaltSpellSlots(this);
  }, "WRAPPER");

  // Caster level. dnd5e fires one `dnd5e.prepare<Type>Slots` hook per slot-providing spellcasting
  // method, with the accumulated progression object, immediately before it turns that progression into
  // slots - the documented seam for changing how many slots a character gets, and the last point at
  // which the caster level can still be corrected. Registered per method (`spell`, `pact`, plus any a
  // module adds) rather than hardcoding "spell", since the same summing bug applies to every one of
  // them.
  //
  // Only the method *keys* are read here: at `init` the `CONFIG.DND5E.spellcasting` entries are still
  // the plain config objects, and dnd5e swaps in the SpellcastingModel instances that carry `slots` and
  // `computeProgression` later in its own startup. Checked live: at init `spellcasting.spell.slots` is
  // undefined, by the time the hook fires it is a MultiLevelSpellcasting. So the model is looked up
  // inside the handler, not captured here.
  //
  // dnd5e 4.x called this config `spellcastingTypes` and keyed leveled casting as "leveled" rather than
  // "spell"; reading the keys off whichever exists produces the right hook name on either. The handler
  // itself needs a SpellcastingModel to reuse dnd5e's own progression maths, which only 5.x has, so on
  // 4.x it finds none and leaves the caster level alone rather than throwing.
  const spellcastingConfig = CONFIG.DND5E.spellcasting ?? CONFIG.DND5E.spellcastingTypes ?? {};
  for (const type of Object.keys(spellcastingConfig)) {
    Hooks.on(`dnd5e.prepare${type.capitalize()}Slots`, (spells, actor, progression) => {
      applyGestaltCasterLevel(actor, type, progression);
    });
  }
});

Hooks.on("updateItem", onUpdateClassItem);

// Foundry fires a render hook for every class in the sheet's prototype chain. `ActorSheetV2` is the
// broadest one that still means "an actor sheet", so this catches dnd5e's own character sheet and
// any replacement sheet built on ApplicationV2 (Tidy5e and friends) rather than only dnd5e's
// `CharacterActorSheet`. Sheets that do not present a `[data-tab="spells"]` element get nothing
// injected; the handler feature-detects its anchor instead of assuming dnd5e's markup.
Hooks.on("renderActorSheetV2", renderSpellCountPanel);

/* -------------------------------------------- */
/*  Notifications                                */
/* -------------------------------------------- */

/**
 * Show a gestalt reminder/warning both as a UI toast (for the moment) and as a whispered chat message
 * (as a persistent, scrollable record) - toasts disappear after a few seconds, which made several of
 * this module's own bugs harder to diagnose than they needed to be, since the exact wording was already
 * gone by the time anyone went looking for it. Whispered to the acting user and to all GMs, so a GM can
 * see what happened even on another player's action without needing to be told about it after the fact.
 * @param {"info"|"warn"} level
 * @param {string} message
 */
function notifyGestalt(level, message) {
  ui.notifications[level](message);

  const whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
  if (!whisper.includes(game.user.id)) whisper.push(game.user.id);

  ChatMessage.create({
    content: message,
    whisper,
    flavor: game.i18n.localize("GESTALT.ModuleName")
  });
}

/* -------------------------------------------- */
/*  Level override                              */
/* -------------------------------------------- */

/**
 * Determine whether gestalt rules are currently active for this actor.
 * @param {Actor5e} actor
 * @returns {boolean}
 */
function isGestaltActor(actor) {
  if (!game.settings.get(MODULE_ID, "moduleEnabled")) return false;
  return actor?.getFlag("dnd5e", GESTALT_FLAG.ENABLED) === true;
}

/**
 * Get the actor's gestalt base class. Reuses dnd5e's own "Original Class" field
 * (`system.details.originalClass`) rather than a separate module flag, since dnd5e already renders a
 * native dropdown for it in the same Special Traits tab as the checkboxes above - one less custom
 * control to build, and it's auto-populated to the first class added, giving new gestalt characters a
 * sensible default with no setup required.
 * @param {Actor5e} actor
 * @returns {Item5e|null}
 */
function getBaseClass(actor) {
  const item = actor.items.get(actor.system.details.originalClass);
  return item?.type === "class" ? item : null;
}

/**
 * Whether an advancement applies to its class on a gestalt actor: every class is treated as the actor's
 * original class.
 *
 * dnd5e splits class-granted proficiencies in two with `classRestriction`. A `"primary"` entry is the
 * class's full single-class grant and applies only to `system.details.originalClass`; a `"secondary"`
 * entry is the reduced multiclass grant and applies only to classes that are *not* the original class.
 * An entry with no restriction always applies. Since gestalt replaces multiclassing rather than layering
 * on it, a second class should be offered exactly what it offers a single-classed character: its primary
 * entry, and not the multiclass one. That is what `Advancement#appliesToClass` already computes for the
 * original class, so this returns the same three answers for every class.
 *
 * This replaced an allowlist of trait keys (`skills`, `saves`, `weapon`, `armor`) that unlocked primary
 * entries but left the secondary ones applying on top. It missed `tool` outright, so a secondary Bard,
 * Druid or Monk lost its Tool Proficiencies entirely (Bard fell back to the one-instrument multiclass
 * entry; Druid and Monk have no secondary tool entry, so they got nothing), and the surviving secondary
 * entries added a spare skill choice no single-classed character gets.
 *
 * Two facts checked against the shipped compendia (classes, classes24, subclasses, classfeatures; 730
 * advancements) make treating every class as the original class safe rather than broad. `classRestriction`
 * is set on `Trait` advancements only - never on HitPoints, ItemGrant, ScaleValue, Subclass or ASI - so
 * nothing outside proficiencies changes. And all 18 `secondary` entries have a primary or unrestricted
 * entry for the same trait key on the same class, so suppressing them removes only a grant that is
 * already covered by a fuller one.
 *
 * dnd5e's own advancement-application logic skips re-granting anything the actor already has, so
 * proficiencies both classes grant need no dedup here. Skill choices stay uncapped across the two
 * classes, each class contributing its own full list (see the README for why an earlier capped version
 * was dropped).
 * @param {object} advancement
 * @returns {boolean}
 */
function appliesToGestaltClass(advancement) {
  return advancement.classRestriction !== "secondary";
}

/**
 * Overwrite the actor's derived character level (and everything computed from it) to match
 * the gestalt base class's own level, instead of dnd5e's default sum of every class's levels.
 * Runs after dnd5e's own `prepareBaseData`, so this is the only override point needed: everything
 * dnd5e derives later in the prepare cycle (proficiency bonus, tier, HP-per-level, cantrip scaling,
 * and any other item's fallback to `system.details.level`) reads the corrected value from here on.
 * @param {CharacterData} characterData
 */
function applyGestaltLevel(characterData) {
  const actor = characterData.parent;
  if (!isGestaltActor(actor)) return;

  const baseClass = getBaseClass(actor);
  if (!baseClass) return;

  characterData.details.level = baseClass.system.levels;
  characterData.attributes.prof = dnd5e.documents.Proficiency.calculateMod(characterData.details.level);
}

/**
 * dnd5e's `HitDice.max`/`.value` sum every class's own hit-die total (each class's own level, since a
 * class's `hd.max` is just its `levels`) - correct for real multiclassing, but for gestalt that's every
 * class's level added together even though every class levels in lockstep, so a two-class gestalt build
 * shows double its character level (e.g. two level-5 classes reporting 10 hit dice instead of 5). The
 * classic gestalt house rule this module follows: hit dice equal to character level, rolled using the
 * larger of the two classes' hit die - not a per-level mix, matching the same "pick one class" approach
 * already used for HP.
 *
 * Rather than reimplementing `HitDice`, this shrinks its `classes`/`sizes` sets down to just the
 * larger-die class and overrides `max`/`value` to match - `bySize`, `pct`, and every other `HitDice`
 * getter derive from those same fields, so they and dnd5e's own rest/roll code (which reads
 * `attributes.hd.classes` to decide which class item's `system.hd.spent` to increment) stay correct
 * without any further patching. Spent hit dice keep living on the larger-die class item itself - no new
 * storage needed, and it self-corrects every prepare cycle the same way the HP override does.
 * @param {CharacterData} characterData
 */
function applyGestaltHitDice(characterData) {
  const actor = characterData.parent;
  if (!isGestaltActor(actor)) return;

  const classes = actor.items.filter(i => i.type === "class");
  if (classes.length < 2) return;

  const denomination = cls => Number(cls.system.hd.denomination.slice(1));
  const largest = classes.reduce((best, cls) => denomination(cls) > denomination(best) ? cls : best);

  const hd = characterData.attributes.hd;
  hd.classes = new Set([largest]);
  hd.sizes = new Set([denomination(largest)]);

  const max = characterData.details.level;
  Object.defineProperty(hd, "max", { value: max, configurable: true });
  Object.defineProperty(hd, "value", { value: Math.max(max - largest.system.hd.spent, 0), configurable: true });
}

/**
 * dnd5e's default HP calculation sums every class's own HitPoints advancement (normal multiclass:
 * Fighter's d10 + Sorcerer's d6, stacked). Gestalt HP instead uses whichever single class currently
 * grants the most HP - not a fixed "base class", since HP should track the better hit die even when
 * it's on a secondary class, and not a per-level mix, since a lower-level secondary class has no HP
 * data for levels it hasn't reached yet.
 *
 * Rather than reimplementing dnd5e's HP formula (bonuses, half-health effects, etc.) from scratch,
 * this lets the original `prepareDerivedData` run normally, then swaps its summed-across-classes base
 * for the best single class's base and redoes the same short cascade (effective max/clamp/damage/pct)
 * dnd5e itself uses. Skipped entirely if the GM has manually overridden HP max, or if a "half health"
 * condition is active (that multiplies the summed total in a way that can't be cleanly un-summed).
 * @param {CharacterData} characterData
 */
function applyGestaltHitPoints(characterData) {
  const actor = characterData.parent;
  if (!isGestaltActor(actor)) return;
  if (actor.system._source.attributes.hp.max !== null) return;
  if (actor.hasConditionEffect("halfHealth")) return;

  const mod = characterData.abilities?.[CONFIG.DND5E.defaultAbilities?.hitPoints ?? "con"]?.mod ?? 0;
  const hpAdvancements = actor.items
    .filter(i => i.type === "class")
    .map(cls => cls.advancement?.byType?.HitPoints?.[0])
    .filter(a => a);
  if (hpAdvancements.length < 2) return;

  // dnd5e's own totals (used to back out `bonus` below, since that's what it actually used to compute
  // hp.max) vs the gestalt-corrected totals (used to pick the best class) - see getGestaltAdjustedHpTotal.
  const originalTotals = hpAdvancements.map(a => a.getAdjustedTotal(mod));
  const correctedTotals = hpAdvancements.map(a => getGestaltAdjustedHpTotal(a, mod));

  const hp = characterData.attributes.hp;
  const bonus = hp.max - originalTotals.reduce((a, b) => a + b, 0);
  hp.max = Math.floor(Math.max(...correctedTotals) + bonus);
  hp.effectiveMax = Math.max(hp.max + (hp.tempmax ?? 0), 0);
  hp.value = Math.min(hp.value, hp.effectiveMax);
  hp.damage = hp.effectiveMax - hp.value;
  hp.pct = Math.clamp(hp.effectiveMax ? (hp.value / hp.effectiveMax) * 100 : 0, 0, 100);
}

/**
 * dnd5e's HitPointsAdvancement only grants max hit die at level 1 for whichever class is the actor's
 * single "original class" (`system.details.originalClass`, auto-assigned to whichever class was added
 * first) - a second class's own level 1, even though it's just as much a starting class in a gestalt
 * build, only gets the average/rolled value like any other later multiclass level. `getAdjustedTotal()`
 * just reads whatever was already stored per level, so this recomputes the same total but substitutes
 * the hit die's max value for level 1 specifically, regardless of what's actually stored there - every
 * gestalt class is a starting class, so every one of them should get max HP at its own level 1. This
 * self-corrects characters that already went through the HP flow with "avg" stored at level 1, with no
 * manual backfill needed, since it's recomputed fresh every time rather than depending on what got
 * stored when the player originally rolled.
 * @param {object} hpAdvancement  A HitPointsAdvancement instance.
 * @param {number} mod            The CON (or configured hit-point ability) modifier to add per level.
 * @returns {number}
 */
function getGestaltAdjustedHpTotal(hpAdvancement, mod) {
  return Object.keys(hpAdvancement.value).reduce((total, levelKey) => {
    const level = Number(levelKey);
    const value = level === 1 ? hpAdvancement.hitDieValue : hpAdvancement.valueForLevel(level);
    return total + Math.max(value + mod, 1);
  }, 0);
}

/* -------------------------------------------- */
/*  Spell slots                                 */
/* -------------------------------------------- */

/**
 * Correct the caster level a spellcasting method's slots are sized off. dnd5e builds its progression by
 * *adding* every spellcasting class's contribution together (`SlotSpellcasting#computeProgression` does
 * `progression[key] += levels / divisor`), which is right for real multiclassing and wrong for gestalt
 * for exactly the reason character level is: the classes level in lockstep, so a Wizard 5 / Druid 5
 * gestalt is a level 5 caster, not a level 10 one. Left alone it hands a level 5 character 5th-level
 * spell slots.
 *
 * The replacement is the largest single class's contribution, computed with dnd5e's own
 * `computeProgression` so half- and third-caster divisors, `roundUp`, and any progression a module has
 * registered all stay the system's business rather than being reimplemented here. Each class is costed
 * as `count: 1` (single-classed), which is correct for gestalt: each side of the build is effectively
 * its own single-classed character. Checked against the live config, that only changes the answer for
 * the `third` progression (Eldritch Knight, Arcane Trickster), whose `roundUp` is false, so a lone third
 * caster rounds up as dnd5e's own single-class rule requires - an Eldritch Knight 4 is caster level 2,
 * not 1. `half` and `artificer` already carry `roundUp: true` and `full` has divisor 1, so for those the
 * count makes no difference either way.
 *
 * Runs before dnd5e turns the progression into slots, so every later consumer (the slot maxima, the
 * spellcasting tab's "spellcaster level", scaling cantrips that read it) sees the corrected number.
 * @param {Actor5e} actor       Actor the slots are being prepared for.
 * @param {string} type         Spellcasting method key, e.g. "spell" or "pact".
 * @param {object} progression  Spellcasting progression data. *Will be mutated.*
 */
function applyGestaltCasterLevel(actor, type, progression) {
  if (!isGestaltActor(actor)) return;
  if (!progression?.[type]) return;

  const model = CONFIG.DND5E.spellcasting?.[type];
  if (!model?.slots || (typeof model.computeProgression !== "function")) return;

  const classes = actor.itemTypes.class.filter(cls => cls.spellcasting?.type === type);
  if (classes.length < 2) return;

  let best = 0;
  for (const cls of classes) {
    const single = { [type]: 0 };
    model.computeProgression(single, actor, cls, cls.spellcasting, 1);
    best = Math.max(best, single[type] ?? 0);
  }

  progression[type] = best;
}

/**
 * Non-pact spell slots aren't split into separate per-class pools (see the README's Spellcasting
 * section for why - it would need registering whole new spellcasting types, not a small patch). As a
 * much simpler stand-in, this per-actor opt-in doubles the leveled slot count (`system.spells.spell1`
 * through `spell9`) at each level, on top of the gestalt-corrected caster level from
 * `applyGestaltCasterLevel` above - a rough approximation of "casting as two characters" rather than a
 * mechanically precise per-class pool.
 *
 * Only doubles leveled slots, not Pact Magic (`system.spells.pact`), which is already isolated to its
 * own casting class's level and doesn't need correction. Skips any spell level the GM has manually
 * overridden (dnd5e's own "Configure Spell Slots" dialog), respecting that as an intentional exact value
 * the same way the HP override respects a manually-set HP max.
 *
 * Only `max` is doubled, never `value`. dnd5e writes spent slots back as an *absolute* number read off
 * the derived data (`ActivityUsage`: `system.spells.spell1.value = slotData.value - 1`; long rest:
 * `= slot.max`), so anything added to the derived `value` here is banked into the stored value on the
 * next cast or rest and then added again on the next prepare, growing without limit. That is what
 * produced the "casting adds purple slots" report.
 *
 * The clamp afterwards is both a guard against that class of bug and the repair for characters already
 * carrying an inflated stored value from before it was fixed: dnd5e clamps single-level slots itself
 * (`SingleLevelSpellcasting#prepareSlots`) but not leveled ones, so a stored 15-of-6 stays 15 forever
 * otherwise. Clamping the derived value shows the right number immediately, and the next cast or long
 * rest writes the corrected number back to the stored data. It runs for any gestalt actor, flag on or
 * off, so turning Double Spell Slots back off still heals the character.
 * @param {Actor5e} actor
 */
function applyGestaltSpellSlots(actor) {
  if (!isGestaltActor(actor)) return;

  const spells = actor.system.spells;
  if (!spells) return;

  const double = actor.getFlag("dnd5e", GESTALT_FLAG.DOUBLE_SPELL_SLOTS) === true;

  for (let level = 1; level <= 9; level++) {
    const slot = spells[`spell${level}`];
    if (!slot?.max) continue;

    if (double && !Number.isNumeric(slot.override)) slot.max *= 2;
    slot.value = Math.clamp(slot.value ?? 0, 0, slot.max);
  }
}

/* -------------------------------------------- */
/*  Level-up reminders                          */
/* -------------------------------------------- */

/**
 * In-memory cache of each class item's last-known level, keyed by item ID. Needed because dnd5e's
 * Advancement Manager operates on a full cloned copy of the actor throughout its wizard, and commits
 * the result via a *bulk* `updateEmbeddedDocuments` call that can include an unrelated sibling class's
 * `system.levels` in the update payload even when that class's value never actually changed (confirmed
 * via diagnostic logging: leveling a newly-added Warlock produced an `updateItem` event whose actual
 * triggering item was the unrelated, unchanged Sorcerer). `changes.system.levels !== undefined` alone
 * can't distinguish "genuinely changed" from "included in a batch write but identical," so this compares
 * against the last level we actually observed for that specific item instead.
 * @type {Map<string, number>}
 */
const lastKnownClassLevels = new Map();

Hooks.once("ready", () => {
  for (const actor of game.actors) {
    if (!isGestaltActor(actor)) continue;
    for (const item of actor.items) {
      if (item.type === "class") lastKnownClassLevels.set(item.id, item.system.levels);
    }
  }
});

/**
 * When a class item's level changes on a gestalt actor, remind the acting user about the actor's
 * other classes so features don't get missed, and warn if a non-base class has drifted past the
 * base class's level. Notification-only: nothing here blocks or auto-triggers advancement.
 * @param {Item5e} item
 * @param {object} changes
 * @param {object} options
 * @param {string} userId
 */
function onUpdateClassItem(item, changes, options, userId) {
  if (game.user.id !== userId) return;
  if (item.type !== "class") return;

  const actor = item.actor;
  if (!isGestaltActor(actor)) return;

  const previousLevel = lastKnownClassLevels.get(item.id);
  lastKnownClassLevels.set(item.id, item.system.levels);
  const levelChanged = foundry.utils.getProperty(changes, "system.levels") !== undefined
    && previousLevel !== undefined && previousLevel !== item.system.levels;

  if (levelChanged) {
    // Only classes actually behind the one that just leveled - not every other class unconditionally,
    // which used to fire even when a class had just caught up to parity with the rest (nothing left to
    // "not forget" at that point).
    const behind = actor.items.filter(
      i => i.type === "class" && i.id !== item.id && i.system.levels < item.system.levels
    );
    if (behind.length) {
      const list = behind.map(c => `${c.name} (${c.system.levels})`).join(", ");
      notifyGestalt("info", game.i18n.format("GESTALT.LevelUpReminder", { classes: list }));
    }

    const baseClass = getBaseClass(actor);
    if (baseClass) {
      const overLeveled = actor.items.filter(
        i => i.type === "class" && i.id !== baseClass.id && i.system.levels > baseClass.system.levels
      );
      if (overLeveled.length) {
        const list = overLeveled.map(c => `${c.name} (${c.system.levels})`).join(", ");
        notifyGestalt("warn", game.i18n.format("GESTALT.LevelExceedsBase", {
          classes: list,
          base: `${baseClass.name} (${baseClass.system.levels})`
        }));
      }
    }

    checkSecondaryClassAsiOverlap(actor, item, baseClass);
  }
}

/* -------------------------------------------- */
/*  Ability Score Improvement overlap            */
/* -------------------------------------------- */

/**
 * Get the AbilityScoreImprovement advancement entries defined on a class item.
 * @param {Item5e} classItem
 * @returns {object[]}
 */
function getAsiEntries(classItem) {
  return classItem.advancement?.byType?.AbilityScoreImprovement ?? [];
}

/**
 * How many ASI/feat schedule slots a class has earned at its own current level.
 * @param {Item5e} classItem
 * @returns {number}
 */
function countAsiEarned(classItem) {
  return getAsiEntries(classItem).filter(a => a.level <= classItem.system.levels).length;
}

/**
 * When a secondary (non-base) class levels up on a gestalt actor, warn if that class's own ASI/feat
 * schedule hasn't actually moved past what the base class already provides - e.g. Sorcerer(base)/
 * Fighter(secondary) both reaching their level-4 ASI is redundant (Fighter's count of 1 doesn't exceed
 * Sorcerer's count of 1), but Fighter continuing on to level 6 isn't (Fighter's count of 2 exceeds
 * Sorcerer's 1 - a real bonus slot most classes don't get). This only compares the leveling class
 * against the base class specifically, not other secondary classes in a 3+ class gestalt build.
 *
 * This is a heads-up only, fired at the moment the level crosses a threshold, before the player even
 * opens the ASI/feat picker for it - not a block. Enabling "Use Combined Class ASIs" in the world
 * settings turns this off entirely, for every gestalt actor - a table-wide house rule choice for the GM
 * to make, not something that should vary character to character within the same game.
 * @param {Actor5e} actor
 * @param {Item5e} item        The class item that just changed level.
 * @param {Item5e|null} baseClass
 */
function checkSecondaryClassAsiOverlap(actor, item, baseClass) {
  if (game.settings.get(MODULE_ID, "combinedAsi") === true) return;
  if (!baseClass || item.id === baseClass.id) return;

  const secondaryEarned = countAsiEarned(item);
  const baseEarned = countAsiEarned(baseClass);
  if (secondaryEarned > baseEarned) return;

  notifyGestalt("warn", game.i18n.format("GESTALT.AsiRedundant", {
    name: actor.name,
    secondary: item.name,
    base: baseClass.name
  }));
}

/* -------------------------------------------- */
/*  Spell counts                                */
/* -------------------------------------------- */

const SPELL_PANEL_CLASS = "gestalt-spell-counts";

/**
 * Read a class item's spell-count targets. The 2024 classes publish both numbers as ScaleValue
 * advancements, so they are read from the class rather than kept as a table here: Wizard's prepared
 * count reaches 25 where every other full caster stops at 22, and Paladin and Ranger have no cantrip
 * entry at all, which a hardcoded table would get wrong.
 * @param {Item5e} cls
 * @returns {{prepared: number|null, cantrips: number|null}}
 */
function spellTargetsForClass(cls) {
  const read = identifier => {
    const value = cls.scaleValues?.[identifier]?.value;
    return Number.isFinite(value) ? value : null;
  };
  return { prepared: read("max-prepared"), cantrips: read("cantrips-known") };
}

/**
 * Which class a spell counts against, as a class identifier.
 *
 * dnd5e records this on the spell itself as `system.sourceItem`, an `"<type>:<identifier>"` string it
 * fills in when the spell is created (`SpellData#_preCreate`): from the only spellcasting class if
 * there is one, otherwise by intersecting the actor's casting classes with the classes whose spell
 * list contains the spell. On a gestalt character that intersection is what resolves it, so a Wizard
 * spell lands on the Wizard and a Druid spell on the Druid with no input from the player.
 *
 * A `subclass:` value is resolved through that subclass's `classIdentifier`, so a Draconic Sorcery
 * grant counts as Sorcerer. `SpellData#sourceClass` does the same job but is deprecated in dnd5e 5.3
 * and logs a compatibility warning on every read, so the resolution is done here instead.
 * @param {Actor5e} actor
 * @param {Item5e} spell
 * @returns {string|null}  Class identifier, or null when the spell is not attributed to one.
 */
function spellSourceClass(actor, spell) {
  const sourceItem = spell.system.sourceItem;
  if (!sourceItem) return null;

  const [type, identifier] = sourceItem.split(":");
  if (type === "class") return identifier;
  if (type !== "subclass") return null;

  const subclass = actor.itemTypes.subclass.find(s => s.system.identifier === identifier);
  return subclass?.system.classIdentifier ?? null;
}

/**
 * Whether a spell is granted rather than chosen, and so does not count against a limit.
 *
 * A grant stamps `system.prepared` to 2 ("always prepared") through
 * `SpellConfigurationData#applySpellChanges`. The level check is not redundant: cantrips ship from
 * the compendium already at 2, so testing `prepared === 2` alone would discard every cantrip and
 * report none known.
 * @param {Item5e} spell
 * @returns {boolean}
 */
function isGrantedSpell(spell) {
  return (spell.system.level > 0) && (spell.system.prepared === 2);
}

/**
 * Tally an actor's spells against what each spellcasting class should have.
 * @param {Actor5e} actor
 * @returns {{rows: object[], unassigned: Item5e[], uncastable: Item5e[], granted: number}}
 */
function tallySpells(actor) {
  const rows = [];
  const counts = {};
  for (const [identifier, cls] of Object.entries(actor.spellcastingClasses ?? {})) {
    const targets = spellTargetsForClass(cls);
    // A class that publishes neither count has nothing to report against, so it gets no row rather
    // than an empty one. This is also what keeps the panel quiet on content that does not carry
    // these progressions at all, such as dnd5e 4.x, where the fields this reads do not exist.
    if ((targets.prepared === null) && (targets.cantrips === null)) continue;
    counts[identifier] = { cantrips: 0, prepared: 0 };
    rows.push({ identifier, name: cls.name, level: cls.system.levels, ...targets });
  }
  if (!rows.length) return { rows, unassigned: [], uncastable: [], granted: 0 };

  // A spell none of the character's classes can cast is a different problem from one that needs a
  // choice between two of them, so the two are reported separately rather than both as "unassigned".
  const castable = spell => {
    const source = spell._stats?.compendiumSource;
    if (!source) return true;
    const lists = Array.from(dnd5e.registry?.spellLists?.forSpell(source) ?? [])
      .map(list => list?.metadata?.identifier ?? list?.identifier);
    if (!lists.length) return true;
    return rows.some(row => lists.includes(row.identifier));
  };

  const unassigned = [];
  const uncastable = [];
  let granted = 0;

  for (const spell of actor.itemTypes.spell) {
    if (!CONFIG.DND5E.spellcasting[spell.system.method]?.slots) continue;
    if (isGrantedSpell(spell)) { granted += 1; continue; }

    const identifier = spellSourceClass(actor, spell);
    if (!identifier || !counts[identifier]) {
      (castable(spell) ? unassigned : uncastable).push(spell);
      continue;
    }
    if (spell.system.level === 0) {
      counts[identifier].cantrips += 1;
    } else if (spell.system.prepared === 1) {
      // Against the prepared limit, only spells actually prepared count. A spell sitting on the
      // sheet unprepared is one the character knows, not one they have prepared, and counting those
      // overstates the number the column is named for.
      counts[identifier].prepared += 1;
    }
  }

  for (const row of rows) row.has = counts[row.identifier];
  return { rows, unassigned, uncastable, granted };
}

/**
 * Build the panel. Values go in as text nodes rather than interpolated into a markup string, so a
 * spell named with angle brackets cannot inject anything into the sheet.
 * @param {object} tally
 * @returns {HTMLElement}
 */
function buildSpellCountPanel(tally) {
  const panel = document.createElement("section");
  // `card` is dnd5e's own container class, the one its Spellcasting panel in this same tab uses.
  // Wearing it means the sheet styles the box and its heading, in whichever theme is active, instead
  // of this module re-deriving those colours and drifting from them. A sheet that does not define
  // `card` simply ignores it and the stylesheet's own values apply.
  panel.classList.add(SPELL_PANEL_CLASS, "card");

  // dnd5e's own card puts its title in `div.header > h3` and colours the wrapper, letting the heading
  // inherit. Matching that structure is what makes the title the same colour as the Spellcasting card
  // beside it, in either theme, without this module naming a colour at all.
  const header = document.createElement("div");
  header.classList.add("header");
  const title = document.createElement("h3");
  title.textContent = game.i18n.localize("GESTALT.SpellCounts.Title");
  header.append(title);
  panel.append(header);

  const body = document.createElement("div");
  body.classList.add("gestalt-spell-counts-body");
  panel.append(body);

  const cell = (parent, text, ...classes) => {
    const span = document.createElement("span");
    span.textContent = text;
    if (classes.length) span.classList.add(...classes);
    parent.append(span);
    return span;
  };

  for (const row of tally.rows) {
    const line = document.createElement("div");
    line.classList.add("gestalt-spell-row");

    cell(line, `${row.name} ${row.level}`, "gestalt-spell-class");

    for (const [key, labelKey] of [["cantrips", "Cantrips"], ["prepared", "Prepared"]]) {
      if (row[key] === null) continue;
      const group = document.createElement("span");
      group.classList.add("gestalt-spell-count");
      cell(group, game.i18n.localize(`GESTALT.SpellCounts.${labelKey}`), "gestalt-spell-label");
      const value = cell(group, `${row.has[key]} / ${row[key]}`, "gestalt-spell-value");
      if (row.has[key] !== row[key]) value.classList.add("gestalt-spell-mismatch");
      line.append(group);
    }

    const browse = document.createElement("button");
    browse.type = "button";
    browse.classList.add("gestalt-spell-browse");
    browse.dataset.spellList = `class:${row.identifier}`;
    browse.textContent = game.i18n.format("GESTALT.SpellCounts.Browse", { name: row.name });
    line.append(browse);

    body.append(line);
  }

  // An unassigned spell gets a class picker rather than only a warning. dnd5e leaves `sourceItem`
  // blank whenever a spell is on more than one of the character's class lists, which for an
  // overlapping pair like Sorcerer/Wizard is most of them, so this is the common path and not an
  // afterthought. The picker writes the same field the spell sheet's Details tab edits.
  if (tally.unassigned.length) {
    const line = document.createElement("div");
    line.classList.add("gestalt-spell-note");
    cell(line, game.i18n.format("GESTALT.SpellCounts.Unassigned", { count: tally.unassigned.length }));
    body.append(line);

    for (const spell of tally.unassigned) {
      const row = document.createElement("div");
      row.classList.add("gestalt-spell-assign");
      cell(row, spell.name, "gestalt-spell-assign-name");

      const select = document.createElement("select");
      select.classList.add("gestalt-spell-assign-select");
      select.dataset.spellId = spell.id;

      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = game.i18n.localize("GESTALT.SpellCounts.ChooseClass");
      select.append(blank);

      for (const row2 of tally.rows) {
        const option = document.createElement("option");
        option.value = `class:${row2.identifier}`;
        option.textContent = row2.name;
        select.append(option);
      }

      row.append(select);
      body.append(row);
    }
  }

  if (tally.uncastable.length) {
    const line = document.createElement("div");
    line.classList.add("gestalt-spell-note");
    cell(line, game.i18n.format("GESTALT.SpellCounts.Uncastable", {
      count: tally.uncastable.length,
      names: tally.uncastable.map(s => s.name).join(", ")
    }));
    body.append(line);
  }

  if (tally.granted) {
    const line = document.createElement("div");
    line.classList.add("gestalt-spell-note");
    cell(line, game.i18n.format("GESTALT.SpellCounts.Granted", { count: tally.granted }));
    body.append(line);
  }

  return panel;
}

/**
 * Open dnd5e's own compendium browser filtered to one class's spell list, and add what is chosen.
 *
 * The browser is the system's, not a copy of it. The only thing added is the spell list filter, which
 * is otherwise something the player has to know to set by hand out of every spell in the world. What
 * comes back are compendium documents, so dnd5e stamps `system.sourceItem` itself on creation and the
 * new spells land in the right class row without further input.
 * @param {Actor5e} actor
 * @param {string} spellList  Spell list key, e.g. "class:wizard".
 */
async function browseClassSpells(actor, spellList) {
  const browser = dnd5e.applications?.CompendiumBrowser;
  const list = dnd5e.registry?.spellLists?.forType(spellList);
  if (!list?.identifiers?.size || (typeof browser?.select !== "function")) {
    ui.notifications.warn(game.i18n.localize("GESTALT.SpellCounts.NoList"));
    return;
  }

  // `locked.additional` is keyed by filter name, not a list of raw filter descriptors - the browser
  // reads `filters.locked.additional[key]` per registered filter. `spelllist` is dnd5e's own filter
  // for this, so its own `createFilter` turns the value into the identifier match.
  // `selection` is what puts the browser in selection mode at all: dnd5e gates that on
  // `!!options.selection.min || !!options.selection.max`, and both default to null. Without it the
  // browser opens read-only, nothing can be picked, and the call resolves null every time.
  // `max: null` leaves it unlimited, so several spells can be added in one visit.
  const results = await browser.select({
    selection: { min: 1, max: null },
    filters: {
      locked: {
        documentClass: "Item",
        types: new Set(["spell"]),
        additional: { spelllist: { [spellList]: 1 } }
      }
    }
  });
  // `CompendiumBrowser.select` resolves with a Set of UUIDs, or null when cancelled. A Set has no
  // `length` and no `map`, so testing `results?.length` here silently discards every selection.
  const uuids = Array.from(results ?? []);
  if (!uuids.length) return;

  const docs = await Promise.all(uuids.map(uuid => fromUuid(uuid)));
  const data = docs.filter(doc => doc?.type === "spell").map(doc => {
    const obj = doc.toObject();

    // The class is known: the player pressed "Browse <class> spells". Setting it directly beats
    // leaving dnd5e to infer it, and `_preCreate` honours an already-set value. Inference would fail
    // here anyway on a world with both spell compendia enabled: the filter matches on identifier, so
    // every spell appears once per pack, and only the 2024 copy is in the registered spell lists -
    // picking the 2014 copy of Aid gives dnd5e nothing to look up, and the spell lands unattributed.
    obj.system = Object.assign({}, obj.system, { sourceItem: spellList });

    // `toObject()` also drops `_stats.compendiumSource`, which a drag-drop stamps. Restoring it keeps
    // the spell linked to where it came from, the same as adding it by hand.
    obj._stats = Object.assign({}, obj._stats, { compendiumSource: doc.uuid });
    return obj;
  });
  if (data.length) await actor.createEmbeddedDocuments("Item", data);
}

/**
 * Inject the spell count panel into a gestalt character sheet's Spells tab.
 *
 * ApplicationV2 re-renders in place and leaves whatever a module added behind, so the previous panel
 * is removed before a new one is appended. Without that it accumulates one copy per render.
 *
 * Written to survive an unfamiliar sheet rather than to assume dnd5e's own markup, since a
 * replacement sheet module can change any of it. The whole body is wrapped: a module that adds a
 * panel to someone else's sheet must never be the reason that sheet fails to render, so anything
 * unexpected is logged and skipped, leaving the sheet exactly as the other module drew it. Everything
 * needed is feature-detected - the element may arrive as jQuery from a legacy sheet, the actor may
 * not be a character, and the Spells tab may be absent or named differently, and each of those is a
 * reason to do nothing rather than to guess.
 * @param {ActorSheet} sheet
 * @param {HTMLElement|jQuery} element
 */
function renderSpellCountPanel(sheet, element) {
  try {
    const root = element?.jquery ? element[0] : element;
    if (!root?.querySelectorAll) return;

    // Remove our own previous panel before anything else, so a later bail-out cannot strand a stale
    // one on the sheet.
    for (const stale of root.querySelectorAll(`.${SPELL_PANEL_CLASS}`)) stale.remove();

    const actor = sheet?.document ?? sheet?.actor;
    if (actor?.type !== "character") return;
    if (!isGestaltActor(actor)) return;

    // dnd5e's own sheet names the tab "spells"; Tidy 5e's modern sheet calls it "spellbook" and marks
    // its container `.tidy-tab.spellbook`. Both are present in the DOM from the first render - an
    // inactive tab is merely zero-height, not absent - so one selector list covers both without
    // waiting on a tab-change hook.
    const tab = root.querySelector('[data-tab="spells"], .tidy-tab.spellbook');
    if (!tab?.prepend) return;

    const tally = tallySpells(actor);
    if (!tally.rows.length) return;

    const panel = buildSpellCountPanel(tally);
    panel.addEventListener("click", event => {
      const button = event.target.closest(".gestalt-spell-browse");
      if (!button) return;
      event.preventDefault();
      browseClassSpells(actor, button.dataset.spellList);
    });
    panel.addEventListener("change", event => {
      const select = event.target.closest(".gestalt-spell-assign-select");
      if (!select?.value) return;
      actor.items.get(select.dataset.spellId)?.update({ "system.sourceItem": select.value });
    });

    tab.prepend(panel);
  } catch (err) {
    console.error(`${MODULE_ID} | Could not add the spell count panel to this sheet. The rest of the `
      + "sheet is unaffected; this is usually a sheet module laying out the Spells tab differently.", err);
  }
}
