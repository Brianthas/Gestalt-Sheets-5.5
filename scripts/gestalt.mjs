const MODULE_ID = "gestalt-sheets-55";

const FLAGS = {
  ENABLED: "enabled",
  BASE_CLASS: "baseClass",
  COMBINED_ASI: "combinedAsi"
};

/* -------------------------------------------- */
/*  Setup                                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "moduleEnabled", {
    name: "GESTALT.Settings.ModuleEnabled.Name",
    hint: "GESTALT.Settings.ModuleEnabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "limitSkillChoices", {
    name: "GESTALT.Settings.LimitSkills.Name",
    hint: "GESTALT.Settings.LimitSkills.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  if (!game.modules.get("lib-wrapper")?.active) {
    console.error(`${MODULE_ID} | The "libWrapper" module is required but is not active.`);
    return;
  }

  libWrapper.register(MODULE_ID, "CONFIG.Actor.dataModels.character.prototype.prepareBaseData", function(wrapped, ...args) {
    wrapped(...args);
    applyGestaltLevel(this);
  }, "WRAPPER");

  libWrapper.register(MODULE_ID, "CONFIG.Actor.dataModels.character.prototype.prepareDerivedData", function(wrapped, ...args) {
    wrapped(...args);
    applyGestaltHitPoints(this);
  }, "WRAPPER");

  libWrapper.register(MODULE_ID, "dnd5e.documents.advancement.Advancement.prototype.appliesToClass", function(wrapped) {
    if (isProficiencyUnlockAdvancement(this) && isGestaltActor(this.actor)) return true;
    return wrapped();
  }, "MIXED");
});

for (const hook of ["renderCharacterActorSheet", "renderActorSheet5eCharacter2", "renderActorSheet5eCharacter"]) {
  Hooks.on(hook, onRenderCharacterSheet);
}

Hooks.on("updateItem", onUpdateClassItem);

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
  return actor?.getFlag(MODULE_ID, FLAGS.ENABLED) === true;
}

/**
 * Get the class item designated as this actor's gestalt base class, if any.
 * @param {Actor5e} actor
 * @returns {Item5e|null}
 */
function getBaseClass(actor) {
  const baseClassId = actor.getFlag(MODULE_ID, FLAGS.BASE_CLASS);
  if (!baseClassId) return null;
  const item = actor.items.get(baseClassId);
  return item?.type === "class" ? item : null;
}

/**
 * dnd5e restricts certain class-granted proficiencies (saving throws, most classes' skill choices, and
 * the *full* weapon/armor proficiency list) to only the actor's "original class"
 * (`system.details.originalClass`, auto-assigned to whichever class was added to the sheet first) via
 * `classRestriction: "primary"` on the relevant advancement. A second/"secondary" class instead only
 * gets whatever separate `classRestriction: "secondary"` entry that class defines (nothing, for saves;
 * usually nothing, for skills; a reduced list, for weapon/armor) - matching normal 5e multiclassing.
 *
 * Gestalt wants every class's full proficiencies available, not just the accidental first-added one's:
 * unlocking every "primary"-restricted entry for skills/saves/weapon/armor means each class applies its
 * full list regardless of original-class status. Where a class also has its own separate "secondary"
 * entry (weapon/armor), that one keeps applying too, but it's just a subset of the now-also-applying
 * full grant, so the practical result is the full list either way. dnd5e's own advancement-application
 * logic already skips re-granting anything the actor already has, so overlapping proficiencies between
 * classes don't need separate dedup code. For skills specifically, both classes' full choice lists
 * become available side by side, so the separate skill cap check (see below) is what keeps a player
 * from taking skills from both instead of just the more generous one.
 * @param {object} advancement
 * @returns {boolean}
 */
function isProficiencyUnlockAdvancement(advancement) {
  if (advancement.type !== "Trait") return false;
  const traits = advancement.representedTraits();
  return ["skills", "saves", "weapon", "armor"].some(t => traits.has(t));
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
  const totals = actor.items
    .filter(i => i.type === "class")
    .map(cls => cls.advancement?.byType?.HitPoints?.[0])
    .filter(a => a)
    .map(a => a.getAdjustedTotal(mod));
  if (totals.length < 2) return;

  const hp = characterData.attributes.hp;
  const bonus = hp.max - totals.reduce((a, b) => a + b, 0);
  hp.max = Math.floor(Math.max(...totals) + bonus);
  hp.effectiveMax = Math.max(hp.max + (hp.tempmax ?? 0), 0);
  hp.value = Math.min(hp.value, hp.effectiveMax);
  hp.damage = hp.effectiveMax - hp.value;
  hp.pct = Math.clamp(hp.effectiveMax ? (hp.value / hp.effectiveMax) * 100 : 0, 0, 100);
}

/* -------------------------------------------- */
/*  Level-up reminders                          */
/* -------------------------------------------- */

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

  const levelChanged = foundry.utils.getProperty(changes, "system.levels") !== undefined;
  const advancementChanged = foundry.utils.getProperty(changes, "system.advancement") !== undefined;

  if (levelChanged) {
    const others = actor.items.filter(i => i.type === "class" && i.id !== item.id);
    if (others.length) {
      const list = others.map(c => `${c.name} (${c.system.levels})`).join(", ");
      ui.notifications.info(game.i18n.format("GESTALT.LevelUpReminder", { classes: list }));
    }

    const baseClass = getBaseClass(actor);
    if (baseClass) {
      const overLeveled = actor.items.filter(
        i => i.type === "class" && i.id !== baseClass.id && i.system.levels > baseClass.system.levels
      );
      if (overLeveled.length) {
        const list = overLeveled.map(c => `${c.name} (${c.system.levels})`).join(", ");
        ui.notifications.warn(game.i18n.format("GESTALT.LevelExceedsBase", {
          classes: list,
          base: `${baseClass.name} (${baseClass.system.levels})`
        }));
      }
    }

    checkSecondaryClassAsiOverlap(actor, item, baseClass);
  }

  if (levelChanged || advancementChanged) checkSkillChoiceCap(actor);
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
 * opens the ASI/feat picker for it - not a block. A GM/player who wants full combined ASIs for a
 * character can check "Use Combined Class ASIs" on the sheet to skip this warning entirely.
 * @param {Actor5e} actor
 * @param {Item5e} item        The class item that just changed level.
 * @param {Item5e|null} baseClass
 */
function checkSecondaryClassAsiOverlap(actor, item, baseClass) {
  if (actor.getFlag(MODULE_ID, FLAGS.COMBINED_ASI) === true) return;
  if (!baseClass || item.id === baseClass.id) return;

  const secondaryEarned = countAsiEarned(item);
  const baseEarned = countAsiEarned(baseClass);
  if (secondaryEarned > baseEarned) return;

  ui.notifications.warn(game.i18n.format("GESTALT.AsiRedundant", {
    name: actor.name,
    secondary: item.name,
    base: baseClass.name
  }));
}

/* -------------------------------------------- */
/*  Skill choice cap                            */
/* -------------------------------------------- */

/**
 * Get the class item's Trait advancement entries that grant skill proficiencies specifically (dnd5e
 * uses the same TraitAdvancement type for skills, tools, languages, weapon/armor proficiencies, etc.,
 * so this filters down to the ones whose grants/choices pools are drawn from the "skills" trait).
 * @param {Item5e} classItem
 * @returns {object[]}
 */
function getSkillTraitEntries(classItem) {
  return (classItem.advancement?.byType?.Trait ?? []).filter(a => a.representedTraits().has("skills"));
}

/**
 * The number of skill proficiencies this character should have from classes, under gestalt rules: the
 * most generous single class's own total (e.g. Rogue's 4 beats Bard's 3), evaluated at that class's own
 * current level - never the sum of every class's grants. Background-granted skills are untouched, since
 * a gestalt character only has one background regardless of how many classes it has.
 * @param {Actor5e} actor
 * @returns {number}
 */
function getSkillChoiceCap(actor) {
  return actor.items.filter(i => i.type === "class").reduce((max, cls) => {
    const earned = getSkillTraitEntries(cls)
      .filter(a => a.level <= cls.system.levels)
      .reduce((sum, a) => sum + a.maxTraits, 0);
    return Math.max(max, earned);
  }, 0);
}

/**
 * The number of class-granted skill proficiencies this character has actually chosen, across every
 * gestalt class.
 * @param {Actor5e} actor
 * @returns {number}
 */
function countSkillChoicesTaken(actor) {
  return actor.items.filter(i => i.type === "class").reduce(
    (sum, cls) => sum + getSkillTraitEntries(cls).reduce((s, a) => s + (a.value.chosen?.size ?? 0), 0), 0
  );
}

/**
 * Warn (never block) if a gestalt actor has chosen more class-granted skill proficiencies than their
 * most generous single class allows.
 * @param {Actor5e} actor
 */
function checkSkillChoiceCap(actor) {
  if (!game.settings.get(MODULE_ID, "limitSkillChoices")) return;

  const cap = getSkillChoiceCap(actor);
  const taken = countSkillChoicesTaken(actor);
  if (taken > cap) {
    ui.notifications.warn(game.i18n.format("GESTALT.SkillsOverCap", { taken, cap, name: actor.name }));
  }
}

/* -------------------------------------------- */
/*  Sheet UI                                    */
/* -------------------------------------------- */

/**
 * Inject the gestalt toggle and base-class picker into the character sheet.
 * @param {ActorSheet} app
 * @param {HTMLElement|JQuery} element
 */
function onRenderCharacterSheet(app, element) {
  const actor = app.actor;
  if (actor?.type !== "character" || !actor.isOwner) return;
  if (!game.settings.get(MODULE_ID, "moduleEnabled")) return;

  const root = element instanceof HTMLElement ? element : element[0];
  if (root.querySelector(".gestalt-controls")) return;

  const enabled = actor.getFlag(MODULE_ID, FLAGS.ENABLED) === true;
  const baseClassId = actor.getFlag(MODULE_ID, FLAGS.BASE_CLASS) ?? "";
  const combinedAsi = actor.getFlag(MODULE_ID, FLAGS.COMBINED_ASI) === true;
  const classItems = actor.items.filter(i => i.type === "class");

  const panel = document.createElement("fieldset");
  panel.classList.add("gestalt-controls");

  const legend = document.createElement("legend");
  legend.textContent = game.i18n.localize("GESTALT.ModuleName");
  panel.appendChild(legend);

  const toggleLabel = document.createElement("label");
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = enabled;
  toggle.addEventListener("change", () => actor.setFlag(MODULE_ID, FLAGS.ENABLED, toggle.checked));
  toggleLabel.appendChild(toggle);
  toggleLabel.append(` ${game.i18n.localize("GESTALT.EnableGestalt")}`);
  panel.appendChild(toggleLabel);

  const select = document.createElement("select");
  select.disabled = !enabled;
  const blankOption = document.createElement("option");
  blankOption.value = "";
  blankOption.textContent = game.i18n.localize("GESTALT.SelectBaseClass");
  select.appendChild(blankOption);
  for (const cls of classItems) {
    const option = document.createElement("option");
    option.value = cls.id;
    option.textContent = `${cls.name} (${cls.system.levels})`;
    if (cls.id === baseClassId) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener("change", () => actor.setFlag(MODULE_ID, FLAGS.BASE_CLASS, select.value || null));
  panel.appendChild(select);

  const combinedAsiLabel = document.createElement("label");
  const combinedAsiToggle = document.createElement("input");
  combinedAsiToggle.type = "checkbox";
  combinedAsiToggle.checked = combinedAsi;
  combinedAsiToggle.disabled = !enabled;
  combinedAsiToggle.addEventListener(
    "change", () => actor.setFlag(MODULE_ID, FLAGS.COMBINED_ASI, combinedAsiToggle.checked)
  );
  combinedAsiLabel.appendChild(combinedAsiToggle);
  combinedAsiLabel.append(` ${game.i18n.localize("GESTALT.CombinedAsi")}`);
  panel.appendChild(combinedAsiLabel);

  toggle.addEventListener("change", () => {
    select.disabled = !toggle.checked;
    combinedAsiToggle.disabled = !toggle.checked;
  });

  root.querySelector(".window-content")?.prepend(panel);
}
