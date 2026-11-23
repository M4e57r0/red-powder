# FOUNDRY_NOTES.md — разведка (этап 0)

Версии: Foundry VTT **v13.351**, система **dnd5e 5.2.5**.
Все ссылки на файлы и строки проверены по исходникам в рабочем пространстве.

---

## 0. Доступ к исходникам (важно для следующих этапов)

- Папка `_reference/` указана в `.gitignore`, поэтому инструменты поиска (`grep`,
  `find_path`) её **не видят**.
- Исходники dnd5e в `_reference/dnd5e/` **присутствуют полностью** (`dnd5e.mjs`,
  `module/`, `templates/`, `en.json`, `system.json`). Но `list_directory` для подпапок
  `module/*` и `templates/*` (junction-ссылки Windows) возвращает «пусто» — это
  ложь инструмента, файлы на месте.
  - Проверено: `read_file("red-powder/_reference/dnd5e/module/documents/actor/actor.mjs")`,
    `.../module/data/actor/character.mjs`, `.../templates/actors/character-sidebar.hbs`
    читаются нормально.
- **Читать** исходники dnd5e можно напрямую через `read_file` по полному пути.
- Чтобы **искать** по ним (`grep`), нужно временно скопировать папку в
  неигнорируемое место (`copy_path`), грепать там и затем удалить копию.
- Ядро Foundry (`G:\dnd\Foundry Virtual Tabletop\resources\app\client`) — обычный
  проект: `grep` и `read_file` работают напрямую.

---

## 1. (а) Как в dnd5e 5.2.5 хранится и меняется истощение

### 1.1 Где хранится

Источник истины — **ActiveEffect**, а не поле актёра.

- `module/documents/active-effect.mjs` L22-26:
  ```js
  static ID = {
    BLOODIED: staticID("dnd5ebloodied"),
    ENCUMBERED: staticID("dnd5eencumbered"),
    EXHAUSTION: staticID("dnd5eexhaustion")
  };
  ```
  `staticID` (`module/utils.mjs` L422-425) дополняет строку до 16 символов →
  id эффекта истощения = `"dnd5eexhaustion"`.
- Уровень хранится во флаге эффекта: **`flags.dnd5e.exhaustionLevel`**.
- `actor.system.attributes.exhaustion` — **производное** поле:
  - `module/data/actor/templates/attributes.mjs` L332-340:
    ```js
    static prepareExhaustionLevel() {
      const exhaustion = this.parent.effects.get(ActiveEffect5e.ID.EXHAUSTION);
      const level = exhaustion?.getFlag("dnd5e", "exhaustionLevel");
      this.attributes.exhaustion = Number.isFinite(level) ? level : 0;
    }
    ```
  - вызывается в `CharacterData.prepareDerivedData` (`module/data/actor/character.mjs`
    L204-214) и `NPCData.prepareDerivedData` (`module/data/actor/npc.mjs` L399-409).
- Схема поля: `module/data/actor/templates/attributes.mjs` L73-83 —
  `exhaustion: new NumberField({ min: 0, initial: 0, label: "DND5E.Exhaustion" })`
  (в шаблоне `creature`, общий для character/npc).
- Максимум уровней: `CONFIG.DND5E.conditionTypes.exhaustion.levels = 6`
  (`module/config.mjs` L3641-3647).

### 1.2 Как меняется (штатный механизм)

- `Actor5e._onUpdateExhaustion(data, options)` — `module/documents/actor/actor.mjs`
  L3469-3482:
  ```js
  const level = foundry.utils.getProperty(data, "system.attributes.exhaustion");
  if ( !Number.isFinite(level) ) return;
  let effect = this.effects.get(ActiveEffect5e.ID.EXHAUSTION);
  if ( level < 1 ) return effect?.delete();
  else if ( effect ) {
    return effect.update({ "flags.dnd5e.exhaustionLevel": level }, { dnd5e: { originalExhaustion } });
  } else {
    effect = await ActiveEffect.implementation.fromStatusEffect("exhaustion", { parent: this });
    effect.updateSource({ "flags.dnd5e.exhaustionLevel": level });
    return ActiveEffect.implementation.create(effect, { parent: this, keepId: true });
  }
  ```
- Вызывается из `Actor5e._onUpdate` — `module/documents/actor/actor.mjs` L3304-3308,
  **только на клиенте-инициаторе**: `if ( userId === game.userId ) { ... this._onUpdateExhaustion(data, options); }`.
- **Вывод:** чтобы наложить/снять истощение, достаточно
  `actor.update({ "system.attributes.exhaustion": N })`. Система сама создаст,
  обновит или удалит ActiveEffect (включая статус-эффект, картинку и имя).
  Создавать эффект вручную **не нужно**.
- Эффект истощения:
  - `module/documents/active-effect.mjs` L378-382 (`prepareDerivedData` → `_prepareExhaustionLevel`).
  - `_prepareExhaustionLevel()` L388-400: img через `_getExhaustionImage(level)`,
    name `"Exhaustion N"`, при `level >= 6` добавляет статус `"dead"`.
  - `_getExhaustionImage(level)` L758-762.
  - `_onUpdate` L586-596 — scrolling status в чате.
- Длинный отдых снижает истощение на 1:
  `CONFIG.DND5E.restTypes.long.exhaustionDelta = -1` (`module/config.mjs` L2888-2904).
- Влияние уровней: `CONFIG.DND5E.conditionEffects` (`module/config.mjs` L3752-3762) —
  `exhaustion-1..5` (помехи, скорость, HP). Проверка: `Actor5e.hasConditionEffect`
  (`module/documents/actor/actor.mjs` L478-488).

### 1.3 Что делать модулю

`applyExhaustion(actor, delta)`:
1. `const cur = actor.system.attributes.exhaustion ?? 0;`
2. `const next = Math.clamp(cur + delta, 0, max);` (max по умолчанию 5 — настройка модуля).
3. `await actor.update({ "system.attributes.exhaustion": next });`

Замечания:
- Не создавать ActiveEffect вручную — система синхронизирует его сама.
- `system.attributes.exhaustion` — derived, но запись через `update` работает:
  `_onUpdateExhaustion` читает значение из **дельты** обновления, а не из derived.
- Система допускает 6 уровней (`levels: 6`); модуль по умолчанию клампит до 5.

---

## 2. (б) Лист персонажа: классы, шаблоны, хуки, селекторы

### 2.1 Классы

- `CharacterActorSheet` — `module/applications/actor/character-sheet.mjs` L20,
  `extends BaseActorSheet`.
- `BaseActorSheet` — `module/applications/actor/api/base-actor-sheet.mjs` L45-47:
  ```js
  export default class BaseActorSheet extends PrimarySheetMixin(
    ApplicationV2Mixin(foundry.applications.sheets.ActorSheetV2)
  ) {}
  ```
- Цепочка наследования:
  `CharacterActorSheet` → `BaseActorSheet` → `ActorSheetV2`
  (`client/applications/sheets/actor-sheet.mjs` L17) → `DocumentSheetV2`
  (`client/applications/api/document-sheet.mjs` L19) → `ApplicationV2`.
- Экспорт: `module/applications/actor/_module.mjs` L1.
- Регистрация: `dnd5e.mjs` L136-222 (при инициализации системы), через
  `foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, "dnd5e",
  applications.actor.CharacterActorSheet, { types: ["character"], makeDefault: true,
  label: "DND5E.SheetClass.Character" })`.

### 2.2 PARTS (шаблоны)

`character-sheet.mjs` L43-110. Ключевые части:

| part | template |
|---|---|
| header | `systems/dnd5e/templates/actors/character-header.hbs` |
| sidebar | `systems/dnd5e/templates/actors/character-sidebar.hbs` |
| details | `systems/dnd5e/templates/actors/tabs/character-details.hbs` |
| inventory | `systems/dnd5e/templates/actors/tabs/character-inventory.hbs` |
| features | `systems/dnd5e/templates/actors/tabs/character-features.hbs` |
| spells | `systems/dnd5e/templates/actors/tabs/creature-spells.hbs` |
| effects | `systems/dnd5e/templates/actors/tabs/actor-effects.hbs` |
| biography | `systems/dnd5e/templates/actors/tabs/character-biography.hbs` |
| bastion | `systems/dnd5e/templates/actors/tabs/character-bastion.hbs` |
| specialTraits | `systems/dnd5e/templates/actors/tabs/creature-special-traits.hbs` |
| abilityScores | `systems/dnd5e/templates/actors/character-ability-scores.hbs` |
| tabs | `systems/dnd5e/templates/shared/sidebar-tabs.hbs` |

TABS: `character-sheet.mjs` L128-137.

### 2.3 Хуки рендера

- `renderApplicationV2` — `client/hooks.mjs` L304-317. Документация: хук срабатывает
  для **каждого класса в цепочке наследования**. Для листа персонажа сработают:
  `renderCharacterActorSheet`, `renderBaseActorSheet`, `renderActorSheetV2`,
  `renderDocumentSheetV2`, `renderApplicationV2`.
- Значит `Hooks.on("renderActorSheetV2", (app, element, context, options) => {...})`
  валиден и покрывает все листы актёров. Проверять `app.document.type === "character"`.
- `preRenderApplicationV2` — `client/hooks.mjs` L291-300.
- На листе доступны `app.document` (Actor) и `app.actor` (ActorSheetV2,
  `client/applications/sheets/actor-sheet.mjs`).

### 2.4 Селекторы блока навыков

Шаблон `templates/actors/tabs/character-details.hbs`:
- L7-18 — блок навыков:
  ```html
  <filigree-box class="skills">
    <h3><i class="fas fa-briefcase"></i><span class="roboto-upper">Skills</span></h3>
    <ul>
      {{#each skills}} {{> ".skill-prof" ...}} {{/each}}
    </ul>
  </filigree-box>
  ```
- L183-207 — inline `.skill-prof`; каждый навык: `<li data-key="{{ key }}">` с
  `proficiency-cycle`, `select.ability`, `a.name.skill-name[data-action="roll"]`,
  `div.bonus`, `div.passive`.
- Селекторы:
  - блок: `filigree-box.skills` (внутри `section.tab[data-tab="details"] .left`)
  - заголовок: `filigree-box.skills > h3`
  - список: `filigree-box.skills > ul`
  - элемент навыка: `filigree-box.skills > ul > li[data-key]`
- `filigree-box` — кастомный элемент (`module/applications/components/filigree-box.mjs`),
  но `<h3>`/`<ul>` передаются как light-DOM children, поэтому обычный
  `querySelector` их находит.

### 2.5 Сортировка навыков (этап 7)

`BaseActorSheet._prepareSkillsTools` (`module/applications/actor/api/base-actor-sheet.mjs`
L528-543) **уже сортирует** навыки по локализованному названию:
```js
.sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
```
То есть «стандартный порядок dnd5e» в 5.2.5 — это **алфавитный** порядок.

Решение (согласовано): режим «По алфавиту» из ТЗ **удалён** как дублирующий
«Стандартный». Остаются два режима:
- **Стандартный** — порядок как отдаёт dnd5e (алфавитный по локализованному названию);
- **По характеристике** — STR, DEX, CON, INT, WIS, CHA; внутри группы по алфавиту.

### 2.6 Место для индикатора сигарет

- Сайдбар: `templates/actors/character-sidebar.hbs` L42-79 — блок `.stats > .top`
  с `.pips[data-prop="system.attributes.exhaustion"]` (пипсы истощения) и
  `.ac-badge`. Ниже `.lozenges` (инициатива/скорость/бонус мастерства), затем
  `.meter-group` (HP).
- Кандидаты для вставки (через хук рендера, без правки шаблонов системы):
  1. После `.sidebar .stats` — всегда видно, не зависит от активной вкладки.
  2. Внутри `.sidebar .card` рядом с портретом.
  3. В блоке навыков (details) — рядом с заголовком `filigree-box.skills > h3`.
- Рекомендация: вариант 1. Селектор вставки:
  `app.element.querySelector(".sidebar .stats")` → `insertAdjacentElement("afterend", node)`.
- Кнопка «Выкурить» — рядом с индикатором в том же блоке.

### 2.7 Истощение на листе (для справки)

- `character-sheet.mjs` L553-568 `_prepareSidebarContext` строит
  `context.exhaustion = { left: [...], right: [...] }` (пипсы).
- `character-sidebar.hbs` L48-78 рендерит `.pips[data-prop="system.attributes.exhaustion"]`.
- Клик по пипсу: `BaseActorSheet.#togglePip` (`base-actor-sheet.mjs` L1590-1599) →
  `actor.update({ [prop]: value })`. Т.е. штатный способ менять истощение с листа —
  тот же `system.attributes.exhaustion`.

---

## 3. (в) Формат getSceneControlButtons в v13

- Хук: `client/hooks.mjs` L388-410. Пример (L393-408):
  ```js
  Hooks.on("getSceneControlButtons", controls => {
    controls.tokens.tools.myTool = {
      name: "myTool",
      title: "MyTool.Title",
      icon: "fa-solid fa-wrench",
      order: Object.keys(controls.tokens.tools).length,
      button: true,
      visible: game.user.isGM,
      onChange: () => {
        const existing = foundry.applications.instances.get("my-tool");
        if ( existing ) existing.close();
        else new MyTool().render({ force: true });
      }
    };
  });
  ```
- Формат: `controls` — **объект**, ключ = id контрола (`tokens`, `notes`, `measure`,
  `tiles`, …). У контрола `tools` — **объект**, ключ = id инструмента.
  (В v13 массивы заменены на объекты.)
- Вызов: `SceneControls.#prepareControls` — `client/applications/ui/scene-controls.mjs`
  L380-417, `Hooks.callAll("getSceneControlButtons", controls)` на L392.
- Постобработка (L395-409): контролы/инструменты с `visible === false` удаляются;
  `toggle` и `button` взаимоисключающи (L404-407).
- Поля инструмента: `name`, `title`, `icon`, `order`, `button`, `toggle`, `visible`,
  `onChange`, `active`, `createData` (палитра).
- Для кнопки-переключателя окна: `button: true`, `visible: game.user.isGM`,
  `onChange` открывает/закрывает окно через `foundry.applications.instances.get(id)`.
- `foundry.applications.instances` — Map `id → app`
  (`client/applications/api/application.mjs` L574-583, L2186-2190).
- Рекомендация: добавить инструмент в существующий контрол (например
  `controls.tokens.tools` или `controls.notes.tools`) как `button: true`.
  Создавать новый контрол не требуется.

---

## 4. (г) Drag&drop в ApplicationV2

- Получение данных: `foundry.applications.ux.TextEditor.implementation.getDragEventData(event)`
  — `client/applications/ux/text-editor.mjs` L876+.
- В листах ApplicationV2: `_onDrop(event)` — `client/applications/sheets/actor-sheet.mjs`
  L257-267:
  ```js
  async _onDrop(event) {
    const data = TextEditor.implementation.getDragEventData(event);
    const documentClass = foundry.utils.getDocumentClass(data.type);
    if ( documentClass ) {
      const document = await documentClass.fromDropData(data);
      await this._onDropDocument(event, document);
    }
  }
  ```
- Для произвольного ApplicationV2 (наша панель): навесить `dragover`/`drop` в
  `_onRender`, либо использовать `foundry.applications.ux.DragDrop`
  (`client/applications/ux/drag-drop.mjs` L28).
- Получение документа: `data.uuid` → `await fromUuid(data.uuid)`; либо
  `foundry.utils.getDocumentClass(data.type).fromDropData(data)`.
- `fromDropData` есть у всех Document-классов (примеры: `client/applications/sheets/actor-sheet.mjs`
  L265-268 и др.).
- dnd5e расширяет DragDrop: `module/drag-drop.mjs` (DragDrop5e) — добавляет
  `static getPayload(event)`.
- Для drop zone панели:
  1. `dragover` → `event.preventDefault()` (иначе `drop` не сработает).
  2. `drop` → `getDragEventData(event)` → проверить `data.type === "Actor"` →
     `await fromUuid(data.uuid)` → проверить `actor.type === "character"`.
  3. Отклонить остальное с `ui.notifications.warn`.
- Проверка типа: `data.type` (например `"Actor"`), `data.uuid`.

---

## 5. ApplicationV2 — минимум для этапа 2

- `static DEFAULT_OPTIONS` (`client/applications/api/application.mjs` L58-62):
  `id`, `classes`, `window`, `position`, `actions`, `form`.
- `static PARTS` — части шаблонов (HandlebarsApplicationMixin,
  `client/applications/api/handlebars-application.mjs` L34-44).
- Жизненный цикл: `_prepareContext(options)` (L689-693),
  `_onFirstRender(context, options)` (L1766-1770), `_onRender(context, options)`
  (L1789-1793), `_postRender` (L1800-1804).
- `actions` в DEFAULT_OPTIONS — обработчики `data-action`
  (пример: `character-sheet.mjs` L23-32).
- `render({ force: true })` (L498-502).
- Шаблоны: `foundry.applications.handlebars.loadTemplates` / `renderTemplate`.
- Пример регистрации настроек системы (шаблон для этапа 1):
  `module/settings.mjs` L52-621 (`registerSystemSettings`), отложенные настройки
  L628-659.

---

## 6. Открытые вопросы / расхождения с ТЗ

1. **Сортировка навыков.** Решено: режим «По алфавиту» удалён (dnd5e и так
   сортирует по алфавиту). Остаются «Стандартный» и «По характеристике».
   SPEC.md обновлён.
2. **Максимум истощения.** Система допускает 6 уровней (`levels: 6`), ТЗ по
   умолчанию ограничивает 5 — согласуется с настройкой модуля.
3. **Индикатор сигарет.** Точное место вставки — предложено после `.sidebar .stats`;
   требуется подтверждение.
