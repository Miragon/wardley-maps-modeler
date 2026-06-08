# Technisches Konzept: Wardley-Mapping-Tool als TypeScript-Bibliothek auf Basis von diagram-js

Stand: 2026-06-04 · Projekt: `wardley-mapping` · Verfasser: Senior-Software-Architektur · Status: FINAL (umsetzungsreif)

---

## 1. Zielbild, Scope & Nicht-Ziele

### 1.1 Zielbild

Eine **framework-agnostische TypeScript-Bibliothek** zum Anzeigen und Editieren von Wardley Maps, gebaut als Satz von `additionalModules` auf [diagram-js](https://github.com/bpmn-io/diagram-js) (MIT). Die Bibliothek ist die geteilte Kerntechnologie für zwei Auslieferungsziele:

1. **Webapp** (Vanilla/einbettbar, optional React-Binding).
2. **VS Code Extension** (Custom Editor im Webview), nachgelagert.

Architektonisch orientieren wir uns am Schichtenmodell von bpmn-js (`BaseViewer → Viewer → NavigatedViewer → Modeler`), **schreiben aber eigenen Code** und ziehen `bpmn-js` als Dependency niemals herein (Lizenzgründe, siehe §3). Methoden, die in bpmn-js (nicht in diagram-js) leben — insbesondere `attachTo`/`detach` der `BaseViewer` —, müssen wir folglich selbst implementieren (siehe §6.1).

### 1.2 Leitprinzipien (Design Tenets)

| #   | Prinzip                                                 | Konsequenz                                                                                                                                                                                                  |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | DOM-Freiheit des Domänenkerns                           | Schema, DSL-Parser/Serializer, reine Transform-Funktionen importieren **nie** `diagram-js`, `tiny-svg`, `min-dom`, `window` oder `document`. Lauffähig in Node (Extension-Host), Browser und Vitest.        |
| P2  | Kontinuum als Quelle der Wahrheit                       | Position als `{ visibility: 0..1, evolution: 0..1 }`. Evolution-Stage wird **abgeleitet**, nie persistiert.                                                                                                 |
| P3  | Genau eine Undo-Quelle pro Editor-Variante              | In beiden Targets (Webapp **und** VS Code) ist der diagram-js `commandStack` die **alleinige** Undo-Quelle. `@miragon/wardley-transforms` enthält bewusst **keinen** eigenen Stack (Rollenklärung in §4.3). |
| P4  | Editier-Mutationen nur über `modeling` → `commandStack` | Nie direkt `canvas.addShape` im Editor-Flow; sonst kein Undo/Redo und kein `elements.changed`. Einzige bewusste Ausnahme: der Import-Pfad (§5.6), der den Stack danach leert.                               |
| P5  | Fixe, frisch aufgelöste Versionen überall               | Third-Party-Deps in jeder `package.json` exakt gepinnt, ohne `^ ~ >=` (`.npmrc`: `save-exact=true`); aufgelöst am **echten Implementierungsdatum** (siehe §10.1).                                           |
| P6  | Round-Trip zur OWM-DSL als Designziel                   | Verlustfreie Interop mit Online-Wardley-Maps-Text (mit Raw-Passthrough für Unbekanntes), validiert gegen den **offiziellen** OWM-Parser, nicht nur den eigenen.                                             |
| P7  | Eine einzige Koordinaten-Mathematik                     | Pixel↔normiert lebt ausschließlich in `EvolutionGrid` (`toCanvas`/`fromCanvas`). Importer und Constraint-Behavior rufen nur diese eine Quelle (siehe §5.6, R-Liste).                                        |

### 1.3 Scope (V1)

- Vollständiges Wardley-Metamodell (Komponenten, Anchor, Pipeline, Market/Ecosystem, Note, Annotation, Accelerator, Attitude-Regionen).
- Dependency- und Flow-Links, Movement (evolve), Inertia, Build/Buy/Outsource.
- Editierbarer Modeler mit Evolution-Achsen-Hintergrund, Drag mit Stage-Snapping, Palette, ContextPad, Rules.
- Read-only Viewer + NavigatedViewer.
- Kanonisches versioniertes JSON-Format + OWM-DSL-Parser/Serializer.
- `saveSVG`.
- VS Code Custom Editor (V1-Inkrement).

### 1.4 Nicht-Ziele

- **Kein** `bpmn-js`, `dmn-js`, `form-js`, `cmmn-js` (bpmn.io-Lizenz mit Watermark-Pflicht, siehe §3). Architektur darf sich am bpmn-js-Schichtenmodell _orientieren_, aber **kein Code aus bpmn-js wird kopiert** (Kontaminationsrisiko, §3.5).
- **Kein** vollständiges moddle-Metamodell (Overkill für Wardley, siehe §7.5).
- Kein Auto-Layout-Solver in V1 (manuelles Platzieren; einfaches deterministisches Default-Placement für koordinatenlose DSL-Knoten genügt).
- Keine Echtzeit-Kollaboration/CRDT in V1.
- Keine eigene Cloud-Persistenz; nur File/LocalStorage/FS-API bzw. VS-Code-Dokument.
- Kein Submap-Drill-down-Rendering in V1 (Submap als Einzelknoten mit URL-Referenz; Navigation = Backlog).

> **Hinweis zu `diagram-js-direct-editing`:** Dieses Paket ist **MIT-lizenziert** (verifiziert: `"license": "MIT"`, aktuell 3.4.0), **kein** bpmn.io-Lizenzrisiko, **kein** Watermark. Es ist also lizenzrechtlich unbedenklich verwendbar. Wir bauen den Label-Editor dennoch selbst — **nicht** aus Lizenzgründen, sondern aus technischen Gründen (siehe §8.5 für die Begründung).

---

## 2. Wardley-Mapping-Domäne: Glossar + Metamodell

### 2.1 Glossar (kompakt)

| Begriff                      | Bedeutung                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Value Chain**              | Gerichteter, am Anchor verankerter Abhängigkeitsgraph.                                                                        |
| **Visibility (Y)**           | Sichtbarkeit beim Nutzer/Anchor, `1` = sichtbar (oben), `0` = infrastrukturell (unten).                                       |
| **Evolution / Maturity (X)** | Reifegrad, `0` = Genesis (links), `1` = Commodity/Utility (rechts). In der OWM-DSL „maturity" genannt; im Modell `evolution`. |
| **Evolution-Stage**          | Quantisierung der X-Achse in 4 Bereiche; **abgeleitet**, Grenzen konfigurierbar (Default ~0.17/0.40/0.70).                    |
| **Anchor**                   | Verankerungspunkt (User Need/Group), oben.                                                                                    |
| **Component**                | Grundbaustein der Value Chain.                                                                                                |
| **Market / Ecosystem**       | Spezialisierte Komponenten; seit OWM Juni-2025-Release als Decorator auf `component` (`(market)`, `(ecosystem)`).             |
| **Pipeline**                 | Container über eine Evolution-/Maturity-RANGE; gruppiert Kind-Komponenten, die ihre `visibility` von der Pipeline erben.      |
| **Dependency-Link (`->`)**   | „A benötigt B".                                                                                                               |
| **Flow-Link (`+>` / `+<>`)** | Wert-/Geldfluss, gerichtet oder bidirektional.                                                                                |
| **Movement / evolve**        | Geplante Verschiebung nach rechts (Ziel-Evolution).                                                                           |
| **Inertia**                  | Widerstand gegen Bewegung (Balken an aktueller Evolution).                                                                    |
| **Attitude-Region**          | Rechteck-Zone Pioneers/Settlers/TownPlanners (PST).                                                                           |
| **Build/Buy/Outsource**      | Beschaffungsmethode pro Komponente (Decorator).                                                                               |

> **Achsen-Falle (kritisch, keyword-differenziert):** Die OWM-DSL schreibt Klammer-Koordinaten **keyword-abhängig**:
>
> - `component`, `anchor`, `note`, `market`, `ecosystem`, … → `[visibility, maturity]` (Y zuerst, dann X). Verifiziert gegen die OWM-DSL-Reference.
> - **`pipeline` → `[maturityStart, maturityEnd]`** — **zwei X-Werte, KEINE visibility.** Die `visibility` der Pipeline wird separat geführt bzw. aus den Kindern abgeleitet. Eine universelle `[visibility, evolution]`-Regel würde Pipelines spiegeln/zerstören (siehe R2 und §7.4).
> - `size`, `annotation`/`annotations` haben jeweils eigene Tupel-Semantik (§7.4).
>
> Im Code speichern wir **immer** explizit benannte Felder (`{ visibility, evolution }`, bzw. `evolutionStart`/`evolutionEnd` für Pipelines), **nie** ein `[x, y]`-Tupel, um Spiegelung zu vermeiden.

### 2.2 Metamodell – TS-Interface-Skizzen (Paket `@miragon/wardley-schema-model`, DOM-frei)

> **Designregel (Live-Modell vs. Serialisierungsformat):** Alle folgenden `WardleyMap`-Interfaces sind `readonly` und ausschließlich **Serialisierungs-/Schnittstellenformat**. Die **Laufzeit-Wahrheit** während des Editierens lebt in den **mutablen** diagram-js-DI-Properties (`shape.evolution`, `shape.visibility`, …). `exportMap()` baut das `WardleyMap` aus diesen DI-Properties — nicht umgekehrt. Das `businessObject` am diagram-js-Element ist reines Identitäts-/Metadaten-Backref und **nicht** die Positions-Wahrheit (sonst zwei konkurrierende Quellen). Diese Trennung ist bewusst (siehe §5.6, §8 und R-Liste).

```typescript
/** Normierte Position auf den zwei kontinuierlichen Achsen. Invariante: 0 <= v <= 1. */
export interface Coordinate {
  readonly visibility: number; // Y: 1 = sichtbar (oben), 0 = infrastrukturell
  readonly evolution: number; // X: 0 = Genesis (links), 1 = Commodity (rechts)
}

export type ElementType =
  | 'anchor'
  | 'component'
  | 'pipeline'
  | 'note'
  | 'annotation'
  | 'accelerator'
  | 'attitude'
  | 'submap';

export type Method = 'build' | 'buy' | 'outsource';

/** Decorator-Flags; market/ecosystem als Flags statt eigener Typen (modernisierte OWM-Syntax). */
export interface ComponentDecorators {
  readonly market?: boolean;
  readonly ecosystem?: boolean;
  readonly inertia?: boolean;
  readonly method?: Method;
}

/** Geplante Evolution (evolve). Am Knoten verankert. */
export interface Movement {
  readonly targetEvolution: number; // 0..1
  readonly newLabel?: string; // evolve Old->New 0.8
  readonly method?: Method; // evolve Foo 0.9 (buy)
  readonly labelOffset?: LabelOffset;
}

export interface LabelOffset {
  readonly dx: number;
  readonly dy: number;
}

/** Gemeinsame Basis aller Knoten. */
interface MapElementBase {
  readonly id: string;
  readonly elementType: ElementType;
  readonly label: string;
  readonly position: Coordinate;
  readonly labelOffset?: LabelOffset;
}

export interface AnchorElement extends MapElementBase {
  readonly elementType: 'anchor';
}

export interface ComponentElement extends MapElementBase {
  readonly elementType: 'component';
  readonly decorators?: ComponentDecorators;
  readonly movement?: Movement;
  readonly pipelineId?: string; // Zugehörigkeit zu einer Pipeline
}

export interface PipelineElement extends MapElementBase {
  /** Pipeline: visibility aus position.visibility (separat geführt / aus Kindern);
   *  X-Achse als RANGE. DSL-Klammern = [evolutionStart, evolutionEnd] (siehe §7.4). */
  readonly elementType: 'pipeline';
  readonly evolutionStart: number; // 0..1
  readonly evolutionEnd: number; // 0..1, > evolutionStart
  readonly childIds: readonly string[]; // ComponentElement.id, teilen die visibility
}

export interface NoteElement extends MapElementBase {
  readonly elementType: 'note';
  readonly patternType?: ClimaticPattern; // optionales semantisches Tag
}

export interface AnnotationElement extends MapElementBase {
  readonly elementType: 'annotation';
  readonly number: number;
  readonly positions: readonly Coordinate[]; // ein oder mehrere Marker
  readonly text: string;
}

export type AcceleratorDirection = 'accelerate' | 'deaccelerate';
export interface AcceleratorElement extends MapElementBase {
  readonly elementType: 'accelerator';
  readonly direction: AcceleratorDirection;
}

export type AttitudeKind = 'pioneers' | 'settlers' | 'townplanners';
export interface AttitudeElement extends MapElementBase {
  /** Rechteck-Region; position = Ankerpunkt (z.B. top-left); rect getrennt. */
  readonly elementType: 'attitude';
  readonly kind: AttitudeKind;
  readonly rect: {
    readonly visStart: number;
    readonly visEnd: number;
    readonly evoStart: number;
    readonly evoEnd: number;
  };
}

export interface SubmapElement extends MapElementBase {
  readonly elementType: 'submap';
  readonly urlRef?: string; // Verweis auf detaillierte Map
}

/** Diskriminierte Union über elementType. */
export type MapElement =
  | AnchorElement
  | ComponentElement
  | PipelineElement
  | NoteElement
  | AnnotationElement
  | AcceleratorElement
  | AttitudeElement
  | SubmapElement;

/** Kanten als getrennte Typen. */
export type EdgeType = 'dependency' | 'flow';

export interface DependencyLink {
  readonly id: string;
  readonly edgeType: 'dependency';
  readonly from: string; // MapElement.id (höher/sichtbarer)
  readonly to: string; // MapElement.id (Abhängigkeit)
  readonly label?: string;
}

export interface FlowLink {
  readonly id: string;
  readonly edgeType: 'flow';
  readonly from: string;
  readonly to: string;
  readonly flowValue?: string;
  readonly bidirectional?: boolean; // +<>
}

export type MapEdge = DependencyLink | FlowLink;

export type ClimaticPattern =
  | 'everythingEvolves'
  | 'characteristicsChange'
  | 'noOneSizeFitsAll'
  | 'efficiencyEnablesInnovation'
  | 'pastSuccessBreedsInertia'
  | 'capitalFlowsToNewValue';

export type MapStyle = 'wardley' | 'handwritten' | 'colour' | 'dark';

/** Map-Level-Konfiguration (Achsenlabels, Stil, Größe). */
export interface MapConfig {
  readonly title: string;
  readonly size?: { readonly width: number; readonly height: number };
  readonly style?: MapStyle;
  /** Custom X-Achsen-Stage-Labels, sonst Default Genesis/Custom/Product/Commodity. */
  readonly evolutionLabels?: readonly [string, string, string, string];
  /** Konfigurierbare Stage-Grenzen (Default [0.17, 0.40, 0.70]). */
  readonly stageBoundaries?: readonly [number, number, number];
  readonly yAxisLabel?: string;
  readonly annotationsBoxPosition?: Coordinate;
}

/** Wurzelobjekt. Domäne und Layout logisch getrennt (nicht physisch), Layout = ableitbare
 *  Felder (position/labelOffset). Round-Trip-Treue zur DSL gewahrt. */
export interface WardleyMap {
  readonly schemaVersion: number; // siehe §7.1
  readonly config: MapConfig;
  readonly elements: readonly MapElement[];
  readonly edges: readonly MapEdge[];
  /** Unbekannte/zukünftige DSL-Zeilen verlustfrei erhalten. */
  readonly rawPassthrough?: readonly string[];
}
```

**Stage-Ableitung (reine Funktion, keine Persistenz):**

```typescript
export function evolutionStage(
  evolution: number,
  boundaries: readonly [number, number, number] = [0.17, 0.4, 0.7],
): 0 | 1 | 2 | 3 {
  const [g, c, p] = boundaries;
  if (evolution < g) return 0; // Genesis
  if (evolution < c) return 1; // Custom-Built
  if (evolution < p) return 2; // Product/Rental
  return 3; // Commodity/Utility
}
```

**Validierung:** Zod-Schemas spiegeln die Interfaces (`@miragon/wardley-schema-model` exportiert `WardleyMapSchema`). Invarianten: `0 ≤ v,e ≤ 1`; `evolutionEnd > evolutionStart`; Edge-`from`/`to` referenzieren existierende `id`; eindeutige IDs; `attitude.rect`-Grenzen normiert und aufsteigend.

---

## 3. Lizenz-Analyse & Begründung diagram-js (MIT) vs. bpmn-js

### 3.1 Befund (verifiziert über npm-Registry am Erstell-/Reviewdatum)

| Paket                                 | Lizenz                                             | SPDX-tauglich?                               | Watermark-Pflicht?                                                            |
| ------------------------------------- | -------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| **diagram-js** (15.16.0)              | MIT (Copyright 2014-present Camunda Services GmbH) | Ja (`"license": "MIT"`)                      | **Nein** (in der bpmn.io-Lizenz nicht erwähnt)                                |
| **diagram-js-direct-editing** (3.4.0) | **MIT**                                            | Ja (`"license": "MIT"`)                      | **Nein**                                                                      |
| **bpmn-js**                           | „bpmn.io License"                                  | Nein (`"license": "SEE LICENSE IN LICENSE"`) | **Ja** (sichtbares, auf https://bpmn.io verlinkendes Wasserzeichen erzwungen) |

Verifiziert: Die bpmn.io-Watermark-Pflicht gilt laut bpmn.io/license **ausschließlich** für `bpmn-js`, `dmn-js`, `form-js`, `cmmn-js`. Das Wasserzeichen verlinkt auf `https://bpmn.io` und darf nicht entfernt werden; es wird in der bpmn-js-Schicht gerendert, **nicht** in diagram-js. **diagram-js und diagram-js-direct-editing sind in der bpmn.io-Lizenz nicht erwähnt** und tragen die normale MIT-Lizenz.

> **Korrektur ggü. Vorfassung:** Die frühere Behauptung, `diagram-js-direct-editing` werde wegen „Lizenz-/Kontaminationsrisiko" gemieden, war **sachlich falsch** — es ist MIT. Der Eigenbau des Label-Editors wird in §8.5 rein **technisch** begründet.

### 3.2 Abhängigkeitsbaum von diagram-js – alle permissiv

`didi` (MIT), `min-dash` (MIT), `min-dom` (MIT) → `domify` (MIT), `tiny-svg` (MIT), `object-refs` (MIT), `path-intersection` (MIT), `clsx` (MIT), `inherits-browser` (**ISC**), `@bpmn-io/diagram-js-ui` (MIT) → `preact` (MIT) + `htm` (**Apache-2.0**).

Einzige Nicht-MIT-Komponenten: `inherits-browser` (ISC) und `htm` (Apache-2.0, transitiv über die Preact-UI). Beide permissiv, kein Copyleft.

### 3.3 Entscheidung & Begründung

**Wir bauen ausschließlich auf diagram-js (MIT) + dessen Abhängigkeitsbaum.** Damit entsteht eine kommerziell auslieferbare, watermark-freie Bibliothek. `bpmn-js`, `dmn-js`, `form-js`, `cmmn-js` werden **nie** als Dependency aufgenommen, und es wird **kein Code aus bpmn-js(-Beispielen) kopiert** (Kontaminationsrisiko). Wo wir bpmn-js-Konzepte nachbauen (Viewer-Schichtung, `attachTo`/`detach`, eigener Label-Editor), nutzen wir die bpmn-js-Quellen **nur als Konzeptvorlage**, niemals als Code-Copy.

`diagram-js-direct-editing` (MIT) wäre lizenzkonform nutzbar; wir verzichten dennoch (Begründung §8.5).

### 3.4 Verbleibende Pflichten (Compliance)

1. **MIT/ISC:** Copyright-Notice + Lizenztext in allen substanziellen Kopien beibehalten.
2. **Apache-2.0 (htm):** Lizenztext beilegen, etwaige NOTICE-Inhalte übernehmen, Änderungen kennzeichnen, Patent-Klausel beachten.
3. **THIRD-PARTY-NOTICES** generieren und mit jedem Build ausliefern (diagram-js inkl. „Copyright 2014-present Camunda Services GmbH", didi, min-dash, min-dom, object-refs, tiny-svg, path-intersection, clsx, inherits-browser/ISC, preact, htm/Apache-2.0, domify).

### 3.5 Compliance-Automatisierung

- **`license-checker-rseidelsohn`** (5.0.1) im CI mit Allowlist `{MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD}`.
- **Harter Fail-Trigger:** Jeder String `SEE LICENSE IN LICENSE` oder das Auftauchen von `bpmn-js`/`dmn-js`/`form-js`/`cmmn-js` im Produktionsbaum bricht den Build.
- **Provenienz-/Kontaminations-Maßnahme (neu):** `license-checker` prüft **nur installierte node_modules-Lizenzfelder**, **nicht** copy-gepasteten Fremdcode. Das eigentliche Kontaminationsrisiko (kopierte bpmn-js-Snippets) deckt es nicht ab. Ergänzend daher: (a) PR-Template mit Herkunftsbestätigung des Codes, (b) CI-grep auf charakteristische bpmn-js-Bezeichner als Heuristik, (c) Code-Review-Pflicht für renderer-nahe Module. Diese Pflicht wird explizit als „nur installierte Pakete abgedeckt" benannt.
- Lizenz bei jedem diagram-js-Upgrade re-verifizieren (Major-Versionen können theoretisch Lizenz/Watermark ändern).

> Hinweis: Dies ist technische Lizenzanalyse, keine Rechtsberatung. Vor kommerzieller Auslieferung juristische Freigabe der Trennlinie diagram-js (MIT) ↔ bpmn-js (bpmn.io License) einholen.

---

## 4. Architekturüberblick: Schichten

### 4.1 Schichtenmodell

```
┌──────────────────────────────────────────────────────────────────────┐
│  TARGETS (Host-Adapter: File-IO, Lifecycle, Messaging)                 │
│  ┌───────────────────────┐        ┌──────────────────────────────┐    │
│  │ @miragon/wardley-webapp (Vite)│        │ @miragon/wardley-vscode (Extension)   │    │
│  │  Vanilla / React-Wrap │        │  CustomEditorProvider + Webview│   │
│  └───────────┬───────────┘        └───────────────┬──────────────┘    │
└──────────────┼────────────────────────────────────┼───────────────────┘
               │            (gleicher Core)          │
┌──────────────▼────────────────────────────────────▼───────────────────┐
│  UI-ADAPTER (optional, dünn)                                            │
│  @miragon/wardley-react  (useEffect → new Modeler(ref), cleanup → destroy)      │
│  hängt vom Core ab, NICHT umgekehrt                                     │
└────────────────────────────────────┬───────────────────────────────────┘
                                      │
┌─────────────────────────────────────▼──────────────────────────────────┐
│  CORE / diagram-js-Schicht  (DOM-abhängig)                              │
│  @miragon/wardley-renderer                                                       │
│   ┌──────────────────────────────────────────────────────────────────┐ │
│   │ WardleyBaseViewer ─ Viewer ─ NavigatedViewer ─ Modeler            │ │
│   │ additionalModules: model · draw · modeling · rules · palette ·    │ │
│   │   contextPad · evolutionGrid · evolutionConstraint · stageSnapping│ │
│   │   · overlays · keyboard · copyPaste · alignment · labelEditing ·  │ │
│   │   io                                                              │ │
│   │ basiert auf diagram-js CoreModule (canvas, eventBus, …)           │ │
│   └──────────────────────────────────────────────────────────────────┘ │
│   importMap(map) → diagram-js-Modell  ·  exportMap() → WardleyMap        │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │  (importiert NIE diagram-js/DOM)
┌─────────────────────────────────────▼──────────────────────────────────┐
│  SCHEMA / DOMÄNE  (DOM-frei, läuft in Node + Browser + Vitest)          │
│  @miragon/wardley-schema-model   Typen + Zod-Schema + Stage-Ableitung + Migration│
│  @miragon/wardley-dsl            OWM-Text ↔ Modell  /  JSON ↔ Modell  (determin.) │
│  @miragon/wardley-transforms     reine WardleyMap→WardleyMap-Funktionen (KEIN Stack)│
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Datenfluss-Beispiel (Komponente verschieben)

```
User-Drag ──► diagram-js Move ──► rules.allowed('shape.move')  (RuleProvider)
          ──► modeling.moveShape ──► commandStack.execute('shape.move')
          ──► MoveShapeHandler.execute (diagram-js core)
          ──► EvolutionConstraintBehavior (CommandInterceptor, postExecute)
                 mappt shape.x/y → {evolution, visibility} via EvolutionGrid.fromCanvas,
                 clampt 0..1, snappt an Stage
          ──► elements.changed ──► WardleyRenderer re-render
          ──► eventBus 'commandStack.changed' ──► Host markiert dirty
```

Die **Brücke Geometrie ↔ Semantik** (Pixel-`x/y` ↔ normiertes `{evolution, visibility}`) ist die zentrale Wardley-spezifische Schicht: die Mathematik liegt **ausschließlich** in `EvolutionGrid` (Koordinaten-Transformer); das `EvolutionConstraintBehavior` (CommandInterceptor) ist der einzige _Aufrufer_ im Editier-Flow und gleicht das frei positionierende `x/y`-Modell von diagram-js mit der Achsen-Semantik ab.

### 4.3 Rollenklärung: diagram-js `commandStack` vs. `@miragon/wardley-transforms` (P3)

Damit kein zweites, konkurrierendes Undo-System entsteht (Widerspruch zu P3), gilt verbindlich:

- **Undo/Redo gehört ausschließlich dem diagram-js `commandStack`** — in **beiden** Targets.
- **`@miragon/wardley-transforms`** enthält **rein DOM-freie, seiteneffektfreie Funktionen** `WardleyMap → WardleyMap` (z.B. `evolveComponent`, `setMethod`, `toggleInertia`, `setPipelineRange`) **ohne eigenen Stack und ohne inverse Commands**. Zweck: Headless-Nutzung, DSL-Tooling, deterministische Tests, ggf. Server-/Batch-Verarbeitung.
- Im Editor wrappen die diagram-js-`CommandHandler` (in `@miragon/wardley-renderer`, Modul `wardleyModeling`) diese reinen Funktionen, sodass die _eine_ Undo-Quelle (`commandStack`) erhalten bleibt. „Inverse Commands" leben damit als diagram-js-`revert()`-Implementierungen in den Handlern, **nicht** als zweiter Stack in `@miragon/wardley-transforms`.

> Konsequenz für die Paket-Umbenennung: Das frühere `@miragon/wardley-commands` heißt jetzt `@miragon/wardley-transforms`, und die Beschreibung „inverse Commands / Undo-Basis" entfällt dort.

---

## 5. Kernbibliothek-Design: konkrete diagram-js-Module

Jedes Wardley-Modul ist ein didi-`ModuleDeclaration` (POJO). **Alle eigenen Services werden mit `$inject` annotiert** (Minification-sicher, da diagram-js sonst Parameternamen parst). Editierlogik läuft ausschließlich über `modeling` → `commandStack`.

### 5.1 Modul-Übersicht

| Modul (DI-Name)                 | Verantwortung                                                                        | Zentrale API / Services                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **`wardleyModelModule`**        | Eigene `ElementFactory` mit Wardley-Defaults & IDs                                   | `wardleyElementFactory.createComponent/createPipeline/createDependency/createFlow/createAnchor` |
| **`wardleyDrawModule`**         | SVG-Rendering aller Wardley-Typen                                                    | `wardleyRenderer` (BaseRenderer-Subklasse, `renderPriority` 1500)                               |
| **`wardleyModelingModule`**     | High-Level-Mutationen + eigene CommandHandler (wrappt `@miragon/wardley-transforms`) | `wardleyModeling.evolveComponent/setMethod/toggleInertia/setPipelineRange/…`                    |
| **`evolutionGridModule`**       | Achsen-Hintergrund, Grid, **einzige** Pixel↔normiert-Transformation                  | `evolutionGrid.toCanvas(coord)/fromCanvas(point)/stageOf(x)`; rendert Achsen-Layer              |
| **`evolutionConstraintModule`** | Behavior: hält x/y synchron zu evolution/visibility, clampt, snappt                  | CommandInterceptor auf `shape.move`/`shape.create`/`elements.move` postExecute                  |
| **`stageSnappingModule`**       | Snapping an Stage-Grenzen & Grid während Drag                                        | erweitert diagram-js `Snapping`                                                                 |
| **`wardleyRulesModule`**        | Erlaubte Operationen (was darf verbunden/bewegt werden)                              | `wardleyRules` (RuleProvider-Subklasse)                                                         |
| **`wardleyPaletteModule`**      | Werkzeug-Palette (Komponente, Pipeline, Note, Anchor, …)                             | `wardleyPaletteProvider.getPaletteEntries()`                                                    |
| **`wardleyContextPadModule`**   | Kontext-Aktionen je Element (verbinden, evolve, löschen, inertia)                    | `wardleyContextPadProvider.getContextPadEntries(el)`                                            |
| **`labelEditingModule`**        | Eigener Inline-Label-Editor (HTML-Overlay; nicht `diagram-js-direct-editing`)        | `wardleyLabelEditing.activate(element)`                                                         |
| **`overlaysWardleyModule`**     | HTML-Overlays (Evolve-Pfeil-Tooltip, Annotation-Legende)                             | nutzt diagram-js `Overlays`                                                                     |
| **`copyPasteWardleyModule`**    | Kopieren/Einfügen mit Wardley-Semantik-Erhalt                                        | erweitert diagram-js `CopyPaste`                                                                |
| **`ioModule`**                  | Brücke Modell ↔ diagram-js, `importMap`/`exportMap`/`saveSVG`                        | `wardleyImporter.import(map)`, `wardleyExporter.export()`                                       |

Wiederverwendete diagram-js-Stock-Module (transitive über `__depends__` weitgehend automatisch) mit **verifizierten** Importpfaden:

| Stock-Modul               | Importpfad (diagram-js 15.16.0)                       |
| ------------------------- | ----------------------------------------------------- |
| Selection                 | `diagram-js/lib/features/selection`                   |
| Move                      | `diagram-js/lib/features/move`                        |
| Create                    | `diagram-js/lib/features/create`                      |
| Connect                   | `diagram-js/lib/features/connect`                     |
| Bendpoints                | `diagram-js/lib/features/bendpoints`                  |
| Keyboard                  | `diagram-js/lib/features/keyboard`                    |
| **KeyboardMoveSelection** | **`diagram-js/lib/features/keyboard-move-selection`** |
| AlignElements             | `diagram-js/lib/features/align-elements`              |
| Overlays                  | `diagram-js/lib/features/overlays`                    |
| Outline                   | `diagram-js/lib/features/outline`                     |
| Snapping                  | `diagram-js/lib/features/snapping`                    |
| CopyPaste                 | `diagram-js/lib/features/copy-paste`                  |
| **ZoomScroll**            | **`diagram-js/lib/navigation/zoomscroll`**            |
| **MoveCanvas**            | **`diagram-js/lib/navigation/movecanvas`**            |
| KeyboardMove (Pan)        | `diagram-js/lib/navigation/keyboard-move`             |

> **Korrektur ggü. Vorfassung (verifiziert gegen v15.16.0):** `ZoomScroll`/`MoveCanvas` liegen unter `lib/navigation/*`, **nicht** unter `lib/features/*`. Das Keyboard-Bewegungs-Modul für die Selektion heißt real **`keyboard-move-selection`** (Service `keyboardMoveSelection`), nicht „KeyboardMove(Module)" — `lib/navigation/keyboard-move` ist davon getrennt und bewegt das Canvas (Pan).
>
> **M0-Spike (Pflicht):** Da diagram-js 15.x **kein `exports`-Feld** hat, müssen **alle** Subpfad-Imports früh (in M0) gegen die echte Version verifiziert werden — sowohl die `tsc`-Typauflösung als auch das Vite/tsup-Bundling. Ein einzelner falscher Pfad bricht den Build erst spät.

### 5.2 Eigener Renderer (Skizze)

```typescript
import BaseRenderer from 'diagram-js/lib/draw/BaseRenderer';
import { append as svgAppend, create as svgCreate, attr as svgAttr } from 'tiny-svg';
import type EventBus from 'diagram-js/lib/core/EventBus';
import type { Styles } from 'diagram-js/lib/draw/Styles';
import type { EvolutionGrid } from '../evolution-grid/EvolutionGrid';

// BaseRenderer-Default-Priorität ist 1000; 1500 gewinnt das render.shape/render.connection-Event
const WARDLEY_RENDER_PRIORITY = 1500;

export class WardleyRenderer extends BaseRenderer {
  static $inject = ['eventBus', 'evolutionGrid', 'styles'];

  constructor(
    eventBus: EventBus,
    private grid: EvolutionGrid,
    private styles: Styles,
  ) {
    super(eventBus, WARDLEY_RENDER_PRIORITY);
  }

  canRender(element: WardleyDi): boolean {
    return element.wardleyType !== undefined; // eigenes Marker-Property
  }

  drawShape(parent: SVGElement, element: WardleyShapeDi): SVGElement {
    switch (element.wardleyType) {
      case 'component':
        return this.drawComponent(parent, element);
      case 'pipeline':
        return this.drawPipeline(parent, element);
      case 'anchor':
        return this.drawAnchor(parent, element);
      case 'annotation':
        return this.drawAnnotation(parent, element);
      case 'attitude':
        return this.drawAttitudeRegion(parent, element);
      // ...
    }
  }

  drawConnection(parent: SVGElement, element: WardleyEdgeDi): SVGElement {
    return element.wardleyType === 'flow'
      ? this.drawFlowLink(parent, element) // hervorgehoben/dick
      : this.drawDependencyLink(parent, element); // dünn durchgezogen
  }

  getShapePath(shape: WardleyShapeDi): string {
    /* ... */
  }
  getConnectionPath(c: WardleyEdgeDi): string {
    /* ... */
  }

  private drawComponent(parent: SVGElement, el: WardleyShapeDi): SVGElement {
    const circle = svgCreate('circle');
    svgAttr(circle, {
      cx: el.width / 2,
      cy: el.height / 2,
      r: 6,
      fill: el.evolving ? 'none' : '#fff',
      stroke: '#000',
      strokeWidth: 1.5,
    });
    svgAppend(parent, circle);
    if (el.inertia) svgAppend(parent, this.drawInertiaBar(el));
    if (el.movement) svgAppend(parent, this.drawEvolveArrow(el)); // roter Pfeil
    return circle;
  }
}

export const wardleyDrawModule = {
  __init__: ['wardleyRenderer'],
  wardleyRenderer: ['type', WardleyRenderer],
} satisfies ModuleDeclaration;
```

### 5.3 Evolution-Constraint-Behavior (Geometrie↔Semantik, Skizze)

> Hinweis: Die `WardleyMap`-Schema-Interfaces sind `readonly` (Serialisierungsformat). Die hier mutierten Properties (`shape.evolution`, `shape.visibility`, `shape.x/y`) sind das **mutable diagram-js-Laufzeitmodell** — die Laufzeit-Wahrheit (siehe Designregel in §2.2).

```typescript
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor';

export class EvolutionConstraintBehavior extends CommandInterceptor {
  static $inject = ['eventBus', 'evolutionGrid'];

  constructor(
    eventBus: EventBus,
    private grid: EvolutionGrid,
  ) {
    super(eventBus);
    // Nach Move/Create: x/y in normierte Achsen rückprojizieren, clampen, snappen.
    this.postExecute(
      ['shape.move', 'shape.create', 'elements.move'],
      (e) => {
        for (const shape of collectShapes(e.context)) {
          if (!isWardleyComponent(shape)) continue;
          const coord = this.grid.fromCanvas({ x: shape.x, y: shape.y }); // EINZIGE Mathematik-Quelle
          shape.evolution = clamp01(coord.evolution);
          shape.visibility = clamp01(coord.visibility);
        }
      },
      /* unwrap */ false,
    );
  }
}
```

> `EvolutionGrid.fromCanvas`/`toCanvas` sind die **einzige** Stelle, die Pixel↔normiert übersetzt (P7). Beim Import (§5.6) ruft der Importer `toCanvas` — dieselbe Quelle, umgekehrte Richtung. Invariante `toCanvas(fromCanvas(p)) ≈ p` (innerhalb Rundungstoleranz) wird als Test fixiert (siehe §11).

### 5.4 RuleProvider (Skizze)

```typescript
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';

export class WardleyRules extends RuleProvider {
  static $inject = ['eventBus'];

  init(): void {
    this.addRule('connection.create', (ctx) => {
      const { source, target } = ctx;
      if (isNote(source) || isNote(target)) return false; // Notizen nicht verbindbar
      if (source === target) return false;
      return canBeDependency(source, target) || canBeFlow(source, target);
    });
    this.addRule('shape.resize', (ctx) => isPipeline(ctx.shape) || isAttitude(ctx.shape));
    // Komponenten frei beweglich (Constraint via Behavior, nicht via Rule-Block)
    this.addRule('shape.move', () => true);
  }
}
```

### 5.5 Palette & ContextPad

`wardleyPaletteProvider` liefert Einträge mit `action.dragstart` (Drag-to-Create via diagram-js `Create`) und `action.click`: `component`, `pipeline`, `anchor`, `market`, `note`, `annotation`, `attitude-region`. `wardleyContextPadProvider.getContextPadEntries(element)` liefert kontextabhängig: `connect`, `evolve`, `toggle-inertia`, `set-method`, `edit-label`, `delete`. Beide werden über `palette.registerProvider(prio, provider)` bzw. `contextPad.registerProvider(prio, provider)` registriert (additiv).

### 5.6 IO-Bridge (`importMap` / `exportMap`) — eine Mathematik, ein bewusster Stack-Bypass

`wardleyImporter.import(map: WardleyMap)`:

1. erzeugt via `wardleyElementFactory` diagram-js-Shapes/Connections,
2. projiziert `{visibility, evolution}` → `x/y` **ausschließlich** über `evolutionGrid.toCanvas` (P7 — keine duplizierte Mathematik im Importer),
3. ruft `canvas.addShape`/`canvas.addConnection` (**Import-Pfad, außerhalb des Editor-Flows**, bewusster P4-Ausnahmefall: kein Undo gewünscht).

> **Wichtig (Dirty-Korrektheit):** Da Import-Shapes das `EvolutionConstraintBehavior` (das an `shape.create`/`shape.move` des `commandStack` hängt) **nicht** durchlaufen, muss der Importer die Projektion selbst über `EvolutionGrid` setzen. Direkt nach dem Import wird **`commandStack.clear()` VOR dem ersten potentiellen Dirty-Event** ausgeführt, damit Webapp/VS Code den frisch geladenen Stand **nicht** fälschlich als „dirty" markieren.

`wardleyExporter.export()`: liest die `elementRegistry`, rekonstruiert `WardleyMap` aus den **DI-Properties** (`evolution`/`visibility` sind die Wahrheit, **nicht** `x/y` und **nicht** das `businessObject`).

---

## 6. Public API

### 6.1 Schichtung (analog bpmn-js, eigener Code)

```typescript
// @miragon/wardley-renderer

export interface WardleyViewerOptions {
  container?: HTMLElement;
  width?: number | string;
  height?: number | string;
  additionalModules?: ModuleDeclaration[];
  moddleExtensions?: never; // bewusst nicht vorhanden (kein moddle)
  stageBoundaries?: [number, number, number];
}

abstract class WardleyBaseViewer {
  protected _modules: ModuleDeclaration[] = [];
  protected _diagram?: Diagram;

  constructor(options?: WardleyViewerOptions);

  /** Modell in den Canvas laden. */
  importMap(map: WardleyMap): Promise<{ warnings: ImportWarning[] }>;
  /** OWM-DSL-Text laden (intern parse → importMap). */
  importDSL(text: string): Promise<{ warnings: ImportWarning[] }>;

  /** Aktuellen Zustand als kanonisches Modell zurückgeben (aus DI-Properties). */
  exportMap(): WardleyMap;
  /** Als OWM-DSL serialisieren. */
  exportDSL(): string;
  /** Statisches SVG (für Snapshot/Export). */
  saveSVG(): Promise<{ svg: string }>;

  get<T = unknown>(name: string, strict?: boolean): T; // didi-Injector-Delegation
  on<E>(event: string, prio: number | EventCallback<E>, cb?: EventCallback<E>): void;
  off(event: string, cb: EventCallback): void;

  /** EIGENIMPLEMENTIERUNG — kein diagram-js-Primitiv (siehe Hinweis unten). */
  attachTo(container: HTMLElement): void;
  detach(): void;

  destroy(): void; // delegiert an diagram-js Diagram#destroy / _destroy
  clear(): void; // delegiert an canvas/eventBus
}

/** Read-only, minimale Modulliste. */
export class Viewer extends WardleyBaseViewer {
  protected _modules = [
    /* CoreModule implizit über Diagram-Bootstrap */
    wardleyModelModule,
    wardleyDrawModule,
    evolutionGridModule,
    ioModule,
    SelectionModule,
    OverlaysModule,
  ];
}

/** Lesen + Navigieren (Zoom/Scroll/Pan/Keyboard-Move). */
export class NavigatedViewer extends Viewer {
  protected _modules = [
    ...super._modules,
    ZoomScrollModule,
    MoveCanvasModule,
    KeyboardModule,
    KeyboardMoveSelectionModule,
  ];
}

/** Voller Editor. */
export class Modeler extends NavigatedViewer {
  protected _modules = [
    ...super._modules,
    wardleyModelingModule,
    wardleyRulesModule,
    evolutionConstraintModule,
    stageSnappingModule,
    wardleyPaletteModule,
    wardleyContextPadModule,
    labelEditingModule,
    copyPasteWardleyModule,
    AlignElementsModule,
    MoveModule,
    CreateModule,
    ConnectModule,
    BendpointsModule,
  ];
}
```

> **`attachTo`/`detach` — Korrektur ggü. Vorfassung:** Diese Methoden sind **keine diagram-js-Primitive.** Verifiziert: Weder `Diagram` noch `Canvas` besitzen `attachTo`/`detach` (nur `canvas.getContainer()` sowie interne `_init`/`_destroy`). `attachTo`/`detach` sind **bpmn-js-`BaseViewer`-Methoden** und müssen — da bpmn-js bewusst nicht genutzt wird — **selbst implementiert** werden (Konzeptvorlage erlaubt, Code-Copy verboten, §3.3):
>
> - **`detach()`:** `canvas.getContainer()` merken, SVG-Container per `container.remove()` aus dem DOM lösen, **State erhalten** (kein `destroy`), aktuelle Viewbox sichern.
> - **`attachTo(target)`:** Container an `target` re-appenden, Viewbox/Zoom wiederherstellen, `canvas.resized()` triggern.
>
> Der **Implementierungsaufwand ist eingeplant** (M2 für Grundgerüst, M6 für Robustheit). Alternative bei Zeitdruck: `attachTo`/`detach` aus V1 streichen und nur `destroy()`/`clear()` anbieten (Entscheidung dokumentiert, kein stilles Weglassen).

Subklassen überschreiben **nur** `_modules` (concat-Muster wie bpmn-js); der Lifecycle/DI-Bootstrap liegt komplett in `WardleyBaseViewer`. `additionalModules` werden ans Ende der Liste konkateniert → Dritte erweitern/überschreiben ohne Fork (§12).

### 6.2 additionalModules-Muster (Konsument)

```typescript
import { Modeler } from '@miragon/wardley-renderer';
import { myThemeModule } from './my-theme'; // eigener Renderer mit höherer Priorität

const modeler = new Modeler({
  container: document.querySelector('#canvas')!,
  additionalModules: [myThemeModule],
});
await modeler.importDSL(
  `title Tea Shop\ncomponent Kettle [0.43, 0.35]\nanchor User [0.95, 0.63]\nUser->Kettle`,
);
```

### 6.3 Lifecycle-Events (eigene, plus diagram-js-Core)

| Event                                   | Wann                                 |
| --------------------------------------- | ------------------------------------ |
| `import.parse.start` / `.done`          | DSL-Parsing (nur `importDSL`)        |
| `import.render.start` / `.done`         | diagram-js-Aufbau                    |
| `import.done`                           | `{ warnings }` final                 |
| `export.start` / `.done`                | `exportMap`/`exportDSL`              |
| `saveSVG.start` / `.done`               | SVG-Export                           |
| `commandStack.changed`                  | jede Modell-Mutation (Dirty-Trigger) |
| `elements.changed`                      | gerenderte Elemente verändert        |
| `selection.changed`, `element.click`, … | diagram-js-Core                      |

---

## 7. Datenmodell & Serialisierung

### 7.1 Kanonisches JSON (versioniert)

Primärformat ist das `WardleyMap`-JSON aus §2.2 mit `schemaVersion` (Start: `1`). Serialisierung ist **deterministisch**: stabile Key-Reihenfolge, Elemente sortiert nach `id`, Koordinaten auf **3 Nachkommastellen** gerundet (vermeidet Float-Rauschen → saubere Git-Diffs und korrekte externe-Änderung-Erkennung im Webview).

```jsonc
{
  "schemaVersion": 1,
  "config": { "title": "Tea Shop", "style": "wardley" },
  "elements": [
    {
      "id": "anchor_1",
      "elementType": "anchor",
      "label": "User",
      "position": { "visibility": 0.95, "evolution": 0.63 },
    },
    {
      "id": "cmp_kettle",
      "elementType": "component",
      "label": "Kettle",
      "position": { "visibility": 0.43, "evolution": 0.35 },
    },
  ],
  "edges": [{ "id": "dep_1", "edgeType": "dependency", "from": "anchor_1", "to": "cmp_kettle" }],
}
```

### 7.2 Migrations

Migrations als geordnete Kette reiner Funktionen `migrate_N_to_Nplus1(json): json` in `@miragon/wardley-schema-model`. `loadMap(unknownJson)` liest `schemaVersion`, wendet alle nötigen Migrationen an und validiert am Ende gegen das aktuelle Zod-Schema. Unbekannte höhere Versionen → harter Fehler.

### 7.3 Trennung Domäne vs. Layout

Wir trennen **logisch**, nicht physisch in zwei Dateien: Domäne = `label`, `decorators`, `movement`, `edges`; Layout = `position`, `labelOffset`, `config.size/style`. Begründung: Round-Trip-Treue zur OWM-DSL (die Koordinaten inline führt) ist Designziel; eine separate Layout-Datei würde die DSL-Interop verkomplizieren. Auto-Layout (Backlog) berechnet `position` für koordinatenlose Knoten zur Laufzeit, ohne das Format zu spalten.

### 7.4 OWM-Text-DSL-Interop (`@miragon/wardley-dsl`)

**Parser** (Tokenizer + recursive descent, kein Generator-Tool nötig — die DSL ist zeilenorientiert):

- **Keyword-differenzierte Koordinatensemantik (kritisch, korrigiert):**

| Keyword                                                           | Klammer-Tupel         | Bedeutung                                                                   |
| ----------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------- |
| `component`, `anchor`, `note`, `market`, `ecosystem`, `submap`, … | `[a, b]`              | `a = visibility`, `b = maturity` (Y zuerst!)                                |
| **`pipeline`**                                                    | `[a, b]`              | **`a = maturityStart`, `b = maturityEnd`** — zwei X-Werte, keine visibility |
| `size`                                                            | `[w, h]`              | Canvas-Breite/-Höhe                                                         |
| `annotation` / `annotations`                                      | `[v, m]` bzw. mehrere | Markerposition(en) bzw. Legendenbox-Position                                |
| `evolve`                                                          | `… <maturity>`        | Zielreife (ein X-Wert)                                                      |

Eine universelle `[visibility, evolution]`-Regel ist **falsch** und würde Pipelines spiegeln (R2). Das Schema (`PipelineElement.evolutionStart/evolutionEnd`) ist bereits korrekt; der Parser bildet exakt darauf ab.

- **Pipeline-Block-Syntax:** Moderne OWM-Form mit Block `pipeline Name [s, e] { component Child [maturity] … }`, wobei Kinder **nur** ihre Maturity tragen und `visibility` von der Pipeline erben. Legacy-Form ohne Block ebenfalls akzeptieren.
- Unbekannte/zukünftige Zeilen → `rawPassthrough` (verlustfrei).
- Akzeptiert **beide Syntaxen**: legacy (`market X [..]`, `component X [..] inertia`) **und** modern (`component X [..] (market)`, `(market, outsource)` ab Juni-2025-Release).
- Keyword-Abdeckung: `title, anchor, component, market, ecosystem, submap, pipeline, evolve, evolution, note, annotation, annotations, url, style, size, y-axis, build, buy, outsource, accelerator, deaccelerator, pioneers, settlers, townplanners`; Operatoren `->`, `+>`, `+<>`; Inline-Decorators `(market) (ecosystem) (build) (buy) (outsource)` und ggf. `(inertia)` (siehe Verifikations-Hinweis).

**Decorator-Syntax — Verifikations-Hinweis (M1-Gate):**

- Verifiziert (OWM Juni-2025-Release): `component X [..] (market)`, `component X [..] (ecosystem)`, kombinierbar mit `build`/`buy`/`outsource`, z.B. `component X [..] (market, outsource)`. Die Legacy-Keywords `market`/`ecosystem` wurden durch diese unified Form ersetzt.
- **Nicht abschließend belegt:** ob `(inertia)` als geklammerter Inline-Decorator offiziell ist. Die DSL-Reference dokumentiert Inertia primär als trailing keyword (`component X [..] inertia`) und `evolve X 0.8 (buy)`. **Vor M1** ist die tatsächliche Syntax gegen reale OWM-Beispielmaps **und** den offiziellen OWM-Parser-Quellcode (`damonsk/onlinewardleymaps`) zu verifizieren.

**Serializer:** deterministisch, stabile Zeilenreihenfolge (config → elements → edges → annotations → passthrough), schreibt **nur Syntax, die der offizielle OWM-Parser wieder einliest** (defensiv), hängt `rawPassthrough` unverändert an.

**Testbasis / CI-Gate (verschärft):** Echte OWM-Beispiel-Maps (Tea Shop u.a.) als Round-Trip-Golden-Files; **zusätzlich** ein CI-Gate, das den Serializer-Output **gegen die echte OWM-Implementierung** (nicht nur den eigenen Parser) round-trippt. Dedizierte Golden-Tests mit **Pipeline + asymmetrischen Koordinaten** (z.B. `[0.05, 0.95]`) und mit Flow-Richtungssemantik (`+>`/`+<>`), da letztere schlechter dokumentiert ist (R9).

### 7.5 Pro/Contra moddle-ähnliches Metamodell

|                             | moddle-Ansatz                               | Gewählt: plain TS + Zod                                       |
| --------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| Trennung Business/Geometrie | eingebaut (DI ↔ Business via `bpmnElement`) | manuell, aber für Wardley trivial (Position direkt am Knoten) |
| XML-Serialisierung          | stark                                       | irrelevant (wir nutzen JSON + OWM-Text)                       |
| Laufzeitkosten/Komplexität  | hoch (Schema-Descriptors, Refs)             | niedrig, voll typisiert, baumschüttelbar                      |
| Round-Trip OWM              | zusätzliche Brücke nötig                    | direkt am Modell                                              |

**Entscheidung:** **Plain TypeScript + Zod**, kein moddle. moddle ist für die kleine, geschlossene Wardley-Domäne Overkill; die DI↔Business-Brücke von diagram-js setzen wir minimal um, indem das diagram-js-Element ein `businessObject`-Property auf das `MapElement` referenziert (optionales writable property, exakt wie diagram-js es vorsieht) — als **Identitäts-/Metadaten-Backref**, nicht als Positions-Wahrheit (§2.2). _Alternative_ (verworfen): volles moddle wie bpmn-js — nur sinnvoll bei XML-Zwang oder generischem Extension-Modell.

---

## 8. Rendering- & Interaktionskonzept

### 8.1 SVG-Struktur & CSS

diagram-js erzeugt pro Element `<g class="djs-group"><g class="djs-element djs-shape"><g class="djs-visual">…</g></g><g class="djs-children"/></g>`. Unser `WardleyRenderer` zeichnet in `djs-visual`. Wir liefern `wardley.css` (basierend auf `diagram-js/assets/diagram-js.css`, überschrieben): Marker-Klassen `djs-hover`, `djs-selected`, plus Wardley-Klassen `wardley-component`, `wardley-pipeline`, `wardley-evolving`, `wardley-inertia`, `wardley-flow`. Style-Varianten (`wardley | handwritten | colour | dark`) als CSS-Klasse am Root-Container.

### 8.2 Evolution-Achsen-Hintergrund/Grid

Eigener, nicht-interaktiver diagram-js-Layer (`canvas.getLayer('wardley-axes', -1)` — verifiziert: `getLayer(name, index)` existiert mit optionalem `index` für z-Ordering; `-1` platziert unterhalb der Elemente):

- X-Achse mit 4 Stage-Bändern (vertikale Trennlinien an `stageBoundaries`), Labels Genesis/Custom-Built/Product/Commodity (oder `config.evolutionLabels`).
- Y-Achse mit Visibility-Label (`config.yAxisLabel`) und Pfeil „value chain".
- Optional Grid-Linien.
- Attitude-Regionen als halbtransparente Rechtecke (eigener Layer über Achsen, unter Komponenten).

`EvolutionGrid` hält die Transformations-Mathematik (`toCanvas`/`fromCanvas`/`stageOf`) — die **einzige** Quelle dieser Mathematik (P7) — und re-rendert die Achsen auf `canvas.viewbox.changed` / `canvas.resized`.

### 8.3 Komponenten-Nodes, Links, Pipeline

- **Komponente:** kleiner Kreis (gefüllt = bestehend, hohl/gestrichelt = `evolving`) + Textlabel mit `labelOffset`. Market/Ecosystem-Decorator als Zusatzsymbol; Build/Buy/Outsource als Form-Variante (eckig vs. rund) oder Badge.
- **Dependency-Link:** dünne durchgezogene Linie.
- **Flow-Link:** hervorgehobene (dicke/farbige) Linie; bidirektional mit Doppelpfeil.
- **Pipeline:** gestrichelte horizontale Box über die Evolution-Range (`evolutionStart`..`evolutionEnd`); Kind-Komponenten teilen die `visibility` der Pipeline und variieren nur in `evolution`.
- **Movement (evolve):** roter Pfeil von aktueller `evolution` zur `targetEvolution`.
- **Inertia:** schwarzer vertikaler Balken an der aktuellen Evolution.
- **Annotation:** nummerierter Marker + Legendenbox (HTML-Overlay via diagram-js `Overlays` an `config.annotationsBoxPosition`).

### 8.4 Drag entlang Achsen mit Snapping

- Drag nutzt diagram-js `Move` → `modeling.moveShape`. Nach Ausführung projiziert `EvolutionConstraintBehavior` `x/y` in `{evolution, visibility}` (via `EvolutionGrid.fromCanvas`) und clampt auf `[0,1]`.
- `stageSnappingModule` erweitert diagram-js `Snapping`: optionales Einrasten auf Stage-Grenzen (Default-Boundaries) und auf andere Komponenten (gleiche `visibility`/`evolution`). Snapping deaktivierbar per Modifier (z.B. `Alt`).
- **Constraint:** Außerhalb `[0,1]` wird hart geklemmt (Komponente verlässt die Map nicht).

### 8.5 Erstellen via Palette, Verbinden & Label-Editing

- **Erstellen:** Palette-Eintrag `dragstart` → diagram-js `Create` → Preview folgt Cursor → Drop → `modeling.createShape` → `EvolutionConstraintBehavior` setzt initiale `evolution/visibility` aus der Drop-Position.
- **Verbinden:** ContextPad-`connect` → diagram-js `Connect` → `wardleyRules` entscheidet Dependency vs. Flow vs. verboten → `modeling.createConnection` mit passendem `wardleyType`. Standard ist Dependency; Flow über Modifier oder eigenen ContextPad-Eintrag.
- **Label-Editing (eigener `labelEditingModule`, nicht `diagram-js-direct-editing`):**
  Doppelklick → `<input>`-/`contenteditable`-Overlay (positioniert über dem Label an `labelOffset`) → bei Commit `modeling.updateLabel` (eigener CommandHandler) → läuft über `commandStack` (P4).

  > **Technische Begründung des Eigenbaus (nicht Lizenz!):** `diagram-js-direct-editing` ist MIT und wäre nutzbar; wir bauen dennoch selbst, weil (1) wir das Inline-Edit als HTML-Overlay **exakt an `labelOffset`** positionieren wollen (Wardley-Labels sind frei verschoben, nicht zentriert auf der Shape), (2) wir **volle Kontrolle über den Commit-Pfad** (`→ modeling.updateLabel → commandStack`) wollen, ohne die `DirectEditing`-Eigenheiten zu adaptieren, und (3) wir **eine transitive Dependency einsparen**. Konsistenz mit P4 bleibt gewahrt.

---

## 9. Multi-Target-Strategie

### 9.1 npm-Monorepo-Paketaufteilung

| Paket                           | Zweck                                                            | DOM-abhängig? | Build                           |
| ------------------------------- | ---------------------------------------------------------------- | ------------- | ------------------------------- |
| `@miragon/wardley-schema-model` | TS-Typen + Zod-Schema + Stage-Ableitung + Migrationen            | **Nein**      | tsup (ESM+CJS, dts)             |
| `@miragon/wardley-dsl`          | OWM-Text ↔ Modell, JSON ↔ Modell (deterministisch)               | **Nein**      | tsup                            |
| `@miragon/wardley-transforms`   | reine `WardleyMap→WardleyMap`-Funktionen (KEIN Undo-Stack, §4.3) | **Nein**      | tsup                            |
| `@miragon/wardley-renderer`     | diagram-js-Bootstrap, eigene Module, Viewer/Modeler, CSS         | **Ja**        | Vite lib mode + vite-plugin-dts |
| `@miragon/wardley-react`        | dünnes React-Binding (optional)                                  | **Ja**        | tsup                            |
| `@miragon/wardley-webapp`       | Vite-App (Vanilla, optional React)                               | **Ja**        | Vite app                        |
| `@miragon/wardley-vscode`       | VS Code Extension (Host CJS + Webview ESM)                       | gemischt      | esbuild (Host) + Vite (Webview) |

**Boundary-Enforcement:** ESLint `no-restricted-imports` verbietet `diagram-js`, `tiny-svg`, `min-dom`, `window`, `document` in den DOM-freien Paketen; zusätzlich `dependency-cruiser` im CI.

Interne Verlinkung: `"*"` (npm-Workspaces verlinken das lokale Paket). Externe Deps: exakt inline gepinnt (siehe §10).

### 9.2 Webapp-Wrapper

`@miragon/wardley-webapp`: Vite-App, instanziiert `new Modeler({ container })`, importiert `wardley.css` aus `@miragon/wardley-renderer`. Persistenz-Adapter: File System Access API (Speichern/Öffnen `.wardley.json` oder `.wmap` DSL), Fallback Download/LocalStorage-Autosave. Undo-Quelle = diagram-js `commandStack` (P3).

### 9.3 VS Code: Custom Editor + Webview

**Entscheidung (vorläufig, formatabhängig — siehe §15.2 OF1):** Das Konzept favorisiert **`CustomEditorProvider`** für das DSL-Primärformat (`.wmap`), behandelt aber die JSON-Variante differenziert (unten).

_Begründung CustomEditorProvider:_ Der diagram-js `commandStack` soll die **alleinige** Undo-Quelle sein (P3, Konsistenz mit Webapp, keine Desync zwischen `WorkspaceEdit` und `commandStack`). Verifiziert ist die zugrunde liegende Mechanik (`CustomDocument`, `onDidChangeCustomDocument` mit `CustomDocumentEditEvent {undo, redo}`, `registerCustomEditorProvider`, `save/backup/revert/openCustomDocument`).

_Format-Konfliktwarnung (neu):_ Liegt ein `CustomEditorProvider` auf einer `*.json`-Datei, konkurriert er mit VS Codes eingebautem JSON-Texteditor um den Default-`viewType`; Nutzer können die Datei dann nicht mehr trivial als Text öffnen/diffen. **Mitigation:** Registrierung auf `.json` mit `"priority": "option"` (nicht `"default"`), damit der Texteditor erreichbar bleibt; **oder** für ein JSON-kanonisches Format bewusst `CustomTextEditorProvider` wählen (textbasiert, Git-Diff/Hot-Exit „gratis"), wobei der zweite Undo-Stack durch die Regel „`WorkspaceEdit` nur beim Save, `commandStack` während des Edits" entschärft wird. Endentscheidung in §15.2 OF1, **vor M5**.

**Aufbau:**

- `contributes.customEditors` mit `viewType: wardley.mapEditor`, `filenamePattern: "*.wardley.json"` und `"*.wmap"`; für `.json` `priority: "option"`.
- `registerCustomEditorProvider` mit `{ webviewOptions: { retainContextWhenHidden: true } }`. Zu `supportsMultipleEditorsPerDocument` siehe unten.
- Eigenes `WardleyDocument implements vscode.CustomDocument` hält `_content` + `_edits` + einen **eigenen, öffentlichen monotonen Edit-Counter** (siehe Undo-Integration).
- `resolveCustomEditor`: `webview.options = { enableScripts: true }`, HTML mit **CSP + nonce** (`script-src 'nonce-…'`, `img-src ${cspSource} blob:`, `style-src 'unsafe-inline' ${cspSource}`), `asWebviewUri` für Webview-Bundle/CSS.

**`supportsMultipleEditorsPerDocument` (explizite Entscheidung, neu):**

- **V1: `false`** — bewusst, weil die Synchronisation eines einzigen `commandStack` über mehrere Webviews den Aufwand nicht rechtfertigt. **Konsequenz dokumentieren:** „In neuer Gruppe öffnen" / Side-by-Side desselben Dokuments ist deaktiviert.
- **Backlog: `true`** — dann muss der `commandStack`-Zustand per Broadcast an alle Webviews synchronisiert werden (Split-View). Erst bei Bedarf.

**postMessage-Protokoll:**

| Richtung      | Nachricht             | Inhalt                                                |
| ------------- | --------------------- | ----------------------------------------------------- |
| Webview → Ext | `ready`               | –                                                     |
| Ext → Webview | `init`                | `{ content, editable, untitled }`                     |
| Webview → Ext | `change`              | `{ seq }` (eigener Counter, NICHT `_stackIdx`)        |
| Ext → Webview | `update`              | `{ content }` \| `{ undo: true }` \| `{ redo: true }` |
| Ext → Webview | `getText`             | `{ requestId }`                                       |
| Webview → Ext | `response`            | `{ requestId, body }`                                 |
| Webview → Ext | `canvas-focus-change` | `{ focused }` (für `when`-Clauses)                    |

**Dirty/Undo-Integration (korrigiert — keine privaten Internals):**

- Die Webview führt einen **eigenen, öffentlichen monotonen `seq`-Zähler**, der bei jedem `commandStack.changed`-Event inkrementiert wird, **statt** das **private** diagram-js-Feld `commandStack._stackIdx` zu lesen (private Internals sind nicht SemVer-geschützt, R1). Für Verfügbarkeitsabfragen nutzen wir die **öffentlichen** Methoden `commandStack.canUndo()`/`canRedo()`.
- Webview feuert `change{seq}`; `WardleyDocument.makeEdit` vergleicht `seq` mit `lastEdit.seq` und **dedupliziert** Echo-Edits aus Undo/Redo sowie aus dem Import. Jeder echte Edit feuert `onDidChangeCustomDocument` → VS Code markiert dirty.
- Cmd+Z/Cmd+Y → VS Code ruft die `undo()`/`redo()`-Callbacks des Edits → Extension sendet `update{undo|redo}` → Webview ruft `commandStack.undo()`/`redo()`.
- **Speichern:** `saveCustomDocument` sendet `getText{requestId}`, Webview antwortet `response{requestId, body: exportDSL()/JSON}` (Promise via `_callbacks`-Map), Extension schreibt mit `vscode.workspace.fs`.
- **Hot-Exit:** `backupCustomDocument` → `saveCustomDocument` in Temp-Verzeichnis.
- **Externe Änderung** (Git/Editor): `update{content}` → Webview `importMap`, danach `commandStack.clear()` (siehe §5.6, verhindert falsches Dirty).

**Build zweigleisig:** Extension-Host als **CJS** via esbuild (`platform: node`, `external: ['vscode']`); Webview als **ESM** via Vite (hostet denselben `@miragon/wardley-renderer`-Modeler wie die Webapp).

---

## 10. Tech-Stack & Tooling

### 10.1 Versionen (fix gepinnt, frisch aufgelöst, Stand 2026-06)

Third-Party-Versionen werden **exakt inline** in jeder `package.json` gepinnt (kein zentraler Catalog mehr; `.npmrc` setzt `save-exact=true`). **Keine** `^ ~ >=` — das einzige erlaubte `*` ist die interne `@miragon/wardley-*`-Workspace-Verlinkung. Die folgende Liste ist die Referenz der gepinnten Versionen, gegen die npm-Registry **am Erstelldatum verifiziert** (Korrekturen ggü. Vorfassung sind markiert). **Verbindliche Regel:** Versionen werden am **tatsächlichen Implementierungsdatum** erneut frisch aufgelöst und anschließend per Dependabot gepflegt — eine veraltete „Stand"-Angabe darf nicht stehen bleiben (P5).

Die `workspaces` werden im Root-`package.json` deklariert (in topologischer Build-Reihenfolge, da npm `-w`-Ziele seriell in Listenreihenfolge baut):

```jsonc
// package.json (root)
"workspaces": [
  "packages/schema-model",
  "packages/dsl",
  "packages/transforms",
  "packages/renderer",
  "apps/webapp",
  "apps/vscode"
]
```

```yaml
# Gepinnte Versionen (Referenz; inline in den jeweiligen package.json gepflegt)
# --- Runtime (renderer) ---
diagram-js: 15.16.0 # verifiziert
didi: 11.0.0 # verifiziert
tiny-svg: 4.1.4 # verifiziert
min-dom: 5.3.0 # verifiziert
min-dash: 5.0.0 # verifiziert
object-refs: 0.4.0
inherits-browser: 0.1.0
path-intersection: 4.1.0
clsx: 2.1.1
# --- Domäne ---
zod: 4.4.3 # verifiziert
# --- Build/Tooling ---
typescript: 6.0.3 # verifiziert
vite: 8.0.16 # verifiziert
vite-plugin-dts: 5.0.2
tsup: 8.5.1
esbuild: 0.28.0 # KORRIGIERT (war fälschlich 0.27.0)
# --- Test ---
vitest: 4.1.8 # verifiziert
'@vitest/browser': 4.1.8 # NEU: Browser-Mode (Playwright-Provider), siehe §11
'@playwright/test': 1.60.0 # verifiziert
jsdom: 29.1.1 # KORRIGIERT (war fälschlich 25.0.1)
# --- Lint/Format ---
eslint: 10.4.1 # verifiziert
prettier: 3.8.3 # verifiziert
husky: 9.1.7 # verifiziert
lint-staged: 17.0.7 # verifiziert
license-checker-rseidelsohn: 5.0.1 # KORRIGIERT (war fälschlich 4.3.0)
dependency-cruiser: 16.10.0
# --- Types ---
'@types/node': 25.9.1 # verifiziert
'@types/vscode': 1.120.0 # KORRIGIERT (war fälschlich 1.99.0)
```

> **diagram-js 15.16.0** bringt eigene `.d.ts` mit (`types: lib/Diagram.d.ts`) — **kein** `@types/diagram-js` installieren. Verifiziert: 15.x hat **kein** `exports`-Feld und ist **nicht** `type: module` (sondern `"module": "lib/Diagram.js"`) → Subpath-Imports (`diagram-js/lib/...`, inkl. `lib/navigation/*`) müssen vom Bundler/`tsc` aufgelöst werden und sind im M0-Spike (§5.1) zu verifizieren. **Backlog:** Migration auf diagram-js 16 (`type: module`, vollständige `exports`-Map) — ändert Importpfade, daher bewusst auf 15.16.0 gepinnt.
>
> **jsdom 29.1.1** dient ausschließlich den DOM-freien Paketen und reinen DI-Verdrahtungstests — **nicht** den SVG-Renderer-Integrationstests (siehe §11, dort Browser-Mode).

### 10.2 TypeScript / Project References

- Root-`tsconfig.json` mit `references` auf alle Pakete; pro Paket `composite: true` → `tsc -b` am Root für inkrementelle, paketübergreifende Typprüfung.
- `strict: true`, `moduleResolution: "bundler"`, `target: "ES2022"`, `module: "ESNext"`, `verbatimModuleSyntax: true`.
- In jedem `package.json` `exports`-Block: **`types` als ERSTE Condition** (sonst zieht TS fälschlich `.js` zur Typauflösung).

### 10.3 Build

- **DOM-freie Pakete** (`schema-model`, `dsl`, `transforms`): **tsup** (esbuild-basiert, `dts: true`, dual ESM/CJS, externalisiert Deps automatisch).
- **`@miragon/wardley-renderer`** (mit CSS): **Vite lib mode** + `vite-plugin-dts`, `build.rollupOptions.external: ['diagram-js', /^diagram-js\//, 'tiny-svg', 'min-dom', 'min-dash', 'didi', 'object-refs', 'inherits-browser', 'path-intersection', 'clsx']` → diagram-js & Co. landen **nicht** doppelt im Bundle (peer/external). Bundle-Size-Check im CI (R5).
- **Webapp:** Vite app.
- **Extension:** esbuild (Host, CJS) + Vite (Webview, ESM).
- ESM-first überall.

### 10.4 ESLint / Prettier / Husky / lint-staged

- **ESLint 10** Flat Config (`eslint.config.js`), `typescript-eslint`, `import`-Plugin, `no-restricted-imports` für Boundaries (§9.1).
- **Prettier 3** als Formatter (über `eslint-config-prettier` entkoppelt).
- **Husky 9** (bereits vorhanden): `pre-commit` ruft `npx lint-staged` + `npm run lint`. Bestehende `.husky`-Hooks bleiben unverändert.
- **lint-staged**:

```jsonc
// package.json (root)
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yaml,yml,css}": ["prettier --write"],
  },
  "scripts": {
    "lint": "eslint . && tsc -b --noEmit",
    "build": "npm run build --workspaces --if-present",
    "test": "vitest run",
  },
}
```

```sh
# .husky/pre-commit  (bestehend, unverändert)
npx lint-staged
npm run lint
```

> `npm run lint` (vom pre-commit aufgerufen) führt ESLint **und** `tsc -b` Typecheck aus.

---

## 11. Teststrategie

> **Kernkorrektur (hoch):** SVG-Renderer-/Move-/Snapping-/Label-Editing-Integrationstests laufen **nicht in jsdom**. jsdom implementiert `SVGElement.getBBox()`, `getComputedTextLength()` und Layout-Messungen **nicht** — genau die APIs, die ein SVG-Renderer und der Label-Editor brauchen; Tests würden mit Stubs verfälscht oder schein-bestehen. Diese Tests laufen im **Vitest Browser Mode (Playwright/Chromium-Provider, in Vitest 4 stabil)** mit echtem Browser-Layout.

| Ebene                     | Werkzeug                                                                 | Umfang                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit (Domäne)**         | Vitest, Node-Env (ggf. jsdom für reine DOM-Hilfen)                       | Zod-Validierung, Stage-Ableitung, Migrationen; `@miragon/wardley-transforms` (reine Funktionen, idempotent/deterministisch); **DSL Round-Trip** Golden-Files (Parse→Serialize→Parse-Idempotenz, beide Syntaxen, **Pipeline `[maturityStart, maturityEnd]` + asymmetrische Koordinaten**, `rawPassthrough`-Erhalt) **plus** Round-Trip gegen die echte OWM-Implementierung als CI-Gate.                                 |
| **Mathematik-Invariante** | Vitest, Node-Env                                                         | `EvolutionGrid`: `toCanvas(fromCanvas(p)) ≈ p` und umgekehrt (innerhalb Rundungstoleranz), als einzige Mathematik-Quelle (P7).                                                                                                                                                                                                                                                                                         |
| **Integration (Module)**  | **Vitest Browser Mode (Chromium)**                                       | diagram-js mit echtem Injector im **echten Browser-DOM** bootstrappen: `importMap` → `elementRegistry` prüfen; `modeling.moveShape` → `EvolutionConstraintBehavior` clampt/snappt korrekt; `wardleyRules` erlaubt/verbietet erwartete Verbindungen; `commandStack` undo/redo stellt Modell wieder her; `exportMap` ist Roundtrip-treu zu `importMap`. Reine DI-Verdrahtung (ohne Layout-Messung) darf in jsdom laufen. |
| **E2E**                   | **Playwright**                                                           | Webapp: Palette-Drag-Create, Drag mit Snapping, Verbinden, evolve, Undo/Redo, Save/Load, SVG-Export. VS-Code-Webview separat (Extension-Test-Harness).                                                                                                                                                                                                                                                                 |
| **Visuell/Snapshot**      | Playwright `toHaveScreenshot` + `saveSVG`-Textsnapshots (echter Browser) | Renderer-Output je Element-Typ und je `style`-Variante; SVG-String-Snapshots (deterministisch, da gerundete Koordinaten).                                                                                                                                                                                                                                                                                              |

Coverage-Gate auf den DOM-freien Paketen (Domänenkern) ≥ 90 %. CI-Pipeline: `tsc -b` → ESLint → Vitest (unit + browser-integration) → Playwright (E2E + visuell) → DSL-Round-Trip gegen offiziellen OWM-Parser → `license-checker` Allowlist + bpmn-js-Provenienz-Heuristik (§3.5).

---

## 12. Erweiterbarkeit / Plugin-Konzept

Dritte erweitern die Map über das **`additionalModules`-Muster** (didi), ohne Fork:

- **Eigener Renderer:** `BaseRenderer`-Subklasse mit `renderPriority > 1500` (überschreibt unseren) bzw. eigener `canRender` für neue Typen; registriert als `{ __init__: ['myRenderer'], myRenderer: ['type', MyRenderer] }`.
- **Eigene Regeln:** `RuleProvider`-Subklasse, `addRule(action, fn)`; höhere Priorität gewinnt.
- **Eigenes Behavior:** `CommandInterceptor`-Subklasse, Hooks auf `commandStack.*`-Events (z.B. eigene Snapping-/Constraint-Logik).
- **Eigene Palette/ContextPad-Einträge:** `palette.registerProvider(prio, provider)` / `contextPad.registerProvider(prio, provider)` (verifiziert) — additiv zu unseren Providern.
- **Eigene CommandHandler:** `commandStack.registerHandler('my.command', Handler)` (verifiziert) oder via eigenem `modeling`-Submodul.
- **Eigene Element-Typen:** Erweiterung der diskriminierten Union via TS-Module-Augmentation des `wardleyType`-Markers + zugehörigem Renderer/Factory.

**Stabilitätszusage:** Wir versionieren die Public API (`Viewer`/`NavigatedViewer`/`Modeler`, `importMap`/`exportMap`, `attachTo`/`detach` falls in V1, Event-Namen, DI-Service-Namen, der öffentliche `seq`-Mechanismus für VS Code) nach SemVer. Die diagram-js-Tiefen-API (`diagram-js/lib/*`) und **private** diagram-js-Felder (`commandStack._stackIdx` etc.) gelten als **interne** Abhängigkeit (durch Pinning gekapselt), **nicht** als Teil unserer Public API und werden von uns nicht direkt gelesen.

---

## 13. Repo-/Verzeichnisstruktur

```
wardley-mapping/
├─ .husky/                      # bereits vorhanden: pre-commit -> lint-staged + lint
├─ .claude/
├─ .npmrc                       # save-exact=true
├─ package.json                 # root: workspaces, scripts, lint-staged, devDeps (fix gepinnt)
├─ tsconfig.json                # references auf alle Pakete
├─ tsconfig.base.json           # strict, bundler resolution
├─ eslint.config.js             # Flat Config + Boundaries
├─ .dependency-cruiser.cjs      # DOM-Boundary-Enforcement
├─ .prettierrc
├─ THIRD-PARTY-NOTICES.md       # generiert, ausgeliefert
├─ packages/
│  ├─ schema-model/             # DOM-frei
│  │  ├─ src/{types.ts, schema.ts, stage.ts, migrations/, index.ts}
│  │  ├─ test/  ├─ tsup.config.ts  ├─ package.json  └─ tsconfig.json
│  ├─ dsl/                      # DOM-frei
│  │  ├─ src/{lexer.ts, parser.ts, serializer.ts, json.ts, index.ts}
│  │  ├─ test/__fixtures__/*.wmap (Golden-Files, inkl. Pipeline-Asymmetrie)
│  │  └─ ...
│  ├─ transforms/               # DOM-frei, reine WardleyMap→WardleyMap, KEIN Stack
│  │  ├─ src/{evolve.ts, method.ts, inertia.ts, pipeline.ts, index.ts}
│  │  └─ ...
│  ├─ renderer/                 # DOM-abhängig
│  │  ├─ src/
│  │  │  ├─ Viewer.ts NavigatedViewer.ts Modeler.ts WardleyBaseViewer.ts
│  │  │  ├─ model/        (WardleyElementFactory, di-types)
│  │  │  ├─ draw/         (WardleyRenderer, styles)
│  │  │  ├─ modeling/     (WardleyModeling, cmd/*Handler — wrappt transforms)
│  │  │  ├─ evolution-grid/ (EvolutionGrid [einzige Mathematik], ConstraintBehavior)
│  │  │  ├─ snapping/     (StageSnapping)
│  │  │  ├─ rules/        (WardleyRules)
│  │  │  ├─ palette/ context-pad/ label-editing/ copy-paste/ overlays/
│  │  │  ├─ io/           (importer, exporter, saveSVG)
│  │  │  └─ index.ts
│  │  ├─ assets/wardley.css
│  │  ├─ test/ (vitest browser mode)  ├─ vite.config.ts  └─ ...
│  └─ react/                    # optionales Binding
├─ apps/
│  ├─ webapp/                   # Vite app
│  │  ├─ src/{main.ts, persistence/}  ├─ index.html  └─ vite.config.ts
│  └─ vscode/                   # Extension
│     ├─ src/extension.ts WardleyEditorProvider.ts WardleyDocument.ts
│     ├─ src/webview/main.ts    (hostet Modeler)
│     ├─ esbuild.host.mjs  vite.webview.config.ts
│     └─ package.json           (contributes.customEditors)
├─ e2e/                         # Playwright
└─ scripts/                     # notices-gen, license-check, owm-roundtrip-gate
```

---

## 14. Roadmap / Meilensteine

| Meilenstein                | Inhalt                                                                                                                                                                                                                                                                                                                                                               | Abgrenzung                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **M0 – Scaffolding**       | npm-Workspaces-Monorepo, inline gepinnte Versionen (am Implementierungsdatum frisch aufgelöst), tsconfig-References, ESLint/Prettier/dependency-cruiser, Vitest (+ Browser-Mode), husky-Anbindung, CI mit license-check + Provenienz-Heuristik. **diagram-js-Subpath-Import-Spike** (`lib/navigation/*`, `keyboard-move-selection` etc. gegen 15.16.0 verifizieren). | Kein Fachcode.                           |
| **M1 – Domänenkern**       | `@miragon/wardley-schema-model` (Typen, Zod, Stage, Migration v1), `@miragon/wardley-dsl` (Parser+Serializer beide Syntaxen, **keyword-differenzierte Koordinaten inkl. Pipeline**, Round-Trip-Golden-Files + OWM-Parser-Gate; Decorator-Syntax inkl. `(inertia)` gegen OWM-Quelle verifiziert), `@miragon/wardley-transforms`. 100 % DOM-frei, Unit-getestet.       | Kein Rendering.                          |
| **M2 – Read-only Viewer**  | `@miragon/wardley-renderer`: Bootstrap, `EvolutionGrid` (+ Achsen-Layer, einzige Mathematik), `WardleyRenderer` (Komponente, Anchor, Dependency, Pipeline), `importMap`/`exportMap`/`saveSVG`, `Viewer`/`NavigatedViewer`, **`attachTo`/`detach`-Grundgerüst (Eigenimpl.)**. Browser-Mode-Integrationstests.                                                         | Nicht editierbar.                        |
| **MVP (= M3)**             | `Modeler`: Palette (Komponente/Pipeline/Note/Anchor), Create/Move mit `EvolutionConstraintBehavior` + Stage-Snapping, Connect (Dependency), ContextPad, `wardleyRules`, eigenes Inline-Label-Editing, Undo/Redo. Webapp mit File-Persistenz + Playwright-E2E.                                                                                                        | Flow/evolve/inertia/attitude noch nicht. |
| **M4 – Wardley-Fülle**     | Flow-Links (`+>`/`+<>`), Movement/evolve (roter Pfeil), Inertia, Build/Buy/Outsource-Decorator, Market/Ecosystem, Annotation + Legende, Accelerator, Attitude-Regionen. Style-Varianten. Visuelle Snapshot-Tests (Browser).                                                                                                                                          | –                                        |
| **M5 – VS Code Extension** | `CustomEditorProvider` (+ `priority: option` für `.json` bzw. Format-Entscheidung aus OF1) + `WardleyDocument`, Webview hostet Modeler, postMessage-Protokoll mit **öffentlichem `seq`-Counter** (kein `_stackIdx`), Undo/Dirty/Save/Hot-Exit, CSP/nonce, `supportsMultipleEditorsPerDocument:false` (dokumentiert), zweigleisiger Build.                            | –                                        |
| **V1 (= M6)**              | Stabilisierung: API-Freeze + SemVer, `attachTo`/`detach`-Robustheit, copyPaste, alignment, vollständige THIRD-PARTY-NOTICES, Doku, `@miragon/wardley-react`-Binding, Performance-Pass (große Maps).                                                                                                                                                                  | –                                        |

**Backlog (Post-V1):** Auto-Layout-Solver, Submap-Drill-down, diagram-js-16-Migration, Minimap, `supportsMultipleEditorsPerDocument:true` (Split-View mit commandStack-Broadcast), Kollaboration/CRDT, Theming-API.

---

## 15. Risiken & offene Fragen

### 15.1 Risiken

| #   | Risiko                                                                                                                                          | Mitigation                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **diagram-js-Tiefen-API & private Felder instabil** (`lib/*`, `commandStack._stackIdx`; kein SemVer-Garant; v16 bricht Importpfade).            | Version hart pinnen (15.16.0), CHANGELOG bei Upgrade prüfen, Tiefen-API hinter unseren Modulen kapseln, **keine** privaten Felder lesen (eigener `seq`-Counter), Integrationstests als Sicherung, M0-Import-Spike. |
| R2  | **Achsen-Reihenfolge keyword-abhängig**; Pipeline = `[maturityStart, maturityEnd]`, sonst `[visibility, maturity]`. Fehler verspiegelt die Map. | Im Code nur benannte Felder, nie Tupel; **keyword-differenzierte** Parser-Spezifikation (§7.4); dedizierte Golden-Tests mit Pipeline + asymmetrischen Koordinaten.                                                 |
| R3  | **Minification bricht DI** (parseAnnotations).                                                                                                  | Alle eigenen Services konsequent mit `$inject` annotieren; Lint-Regel/Review.                                                                                                                                      |
| R4  | **Doppelter Undo-Stack** (VS Code WorkspaceEdit ↔ commandStack) → Desync.                                                                       | `CustomEditorProvider`: commandStack einzige Wahrheit; `makeEdit` mit `seq`-Deduplizierung; bei JSON-Format ggf. CustomTextEditorProvider mit „WorkspaceEdit nur beim Save".                                       |
| R5  | **Vite lib mode bundelt Deps ein** → diagram-js doppelt.                                                                                        | `rollupOptions.external` explizit setzen; Bundle-Size-Check im CI.                                                                                                                                                 |
| R6  | **Versehentliche bpmn-js-Kontamination** aktiviert Watermark-Pflicht.                                                                           | license-checker-Allowlist + `SEE LICENSE IN LICENSE`-Trigger + Block auf bpmn-js/dmn-js/form-js/cmmn-js im Produktionsbaum + Provenienz-Heuristik/PR-Template (§3.5); kein Copy-Paste aus bpmn-js.                 |
| R7  | **DOM-freie Pakete importieren versehentlich diagram-js/DOM**.                                                                                  | ESLint `no-restricted-imports` + dependency-cruiser.                                                                                                                                                               |
| R8  | **Nicht-deterministische Serialisierung** → verrauschte Git-Diffs, falsche Webview-Reloads.                                                     | Stabile Sortierung, Koordinaten auf 3 Stellen runden, Round-Trip-Golden-Tests.                                                                                                                                     |
| R9  | **Flow-Semantik (`+>`/`+<>`) schlecht dokumentiert**.                                                                                           | Gegen reale OWM-Beispiele + offiziellen OWM-Parser testen, vor Implementierung verifizieren.                                                                                                                       |
| R10 | **Preact (diagram-js-ui) im selben Webview** → doppelte Runtime bei React-Webapp.                                                               | `@miragon/wardley-renderer` als external/peer halten; nur benötigte Feature-Module einbinden.                                                                                                                      |
| R11 | **Stage-Grenzen nicht normiert** → falsche Stage-Anzeige.                                                                                       | Grenzen konfigurierbar (`MapConfig.stageBoundaries`, Default 0.17/0.40/0.70), nie hartkodiert.                                                                                                                     |
| R12 | **jsdom ungeeignet für SVG-Renderer-Tests** (`getBBox`/`getComputedTextLength` fehlen) → schein-bestandene Tests.                               | Renderer-/Move-/Snapping-/Label-Tests im **Vitest Browser Mode (Chromium)**; jsdom nur für DOM-freie + reine DI-Verdrahtung.                                                                                       |
| R13 | **Zwei Codepfade für Pixel↔normiert** (Importer vs. Behavior) → Drift.                                                                          | Mathematik **ausschließlich** in `EvolutionGrid` (P7); beide rufen nur diese; Roundtrip-Invariante als Test.                                                                                                       |
| R14 | **`attachTo`/`detach` nicht in diagram-js** → unerwarteter Eigenaufwand.                                                                        | Als Eigenimplementierung deklariert und in M2/M6 eingeplant; alternativ aus V1 streichen (dokumentiert).                                                                                                           |
| R15 | **CustomEditorProvider auf `.json` blockiert Texteditor/Diff**.                                                                                 | `priority: "option"` auf `.json`; Format-Entscheidung (OF1) vor M5; ggf. CustomTextEditorProvider für JSON.                                                                                                        |
| R16 | **Veraltete Versions-Pins** untergraben P5.                                                                                                     | Versionen am Implementierungsdatum frisch auflösen, Dependabot (inkl. `cooldown`), keine veraltete „Stand"-Angabe stehen lassen.                                                                                   |
| R17 | **Modul-Importpfade falsch** (`navigation/*`, `keyboard-move-selection`).                                                                       | Korrigierte Tabelle (§5.1) + M0-Spike gegen echte Version.                                                                                                                                                         |

### 15.2 Offene Fragen

1. **Dateiformat-Primat & VS-Code-Provider:** Soll die VS-Code-Datei kanonisches JSON (`.wardley.json`) **oder** OWM-DSL (`.wmap`) sein? Empfehlung: **OWM-DSL als Primärformat** (`.wmap`, maps-as-code, Git-freundlich, Interop mit wardleyToGo) → `CustomEditorProvider`. Für JSON-kanonisch ist `CustomTextEditorProvider` (Git-Diff/Hot-Exit gratis, zweiter Stack via „WorkspaceEdit nur beim Save" entschärft) oft passender; bei `CustomEditorProvider` auf `.json` zwingend `priority: "option"`. Entscheidung **vor M5**.
2. **Market/Ecosystem** als eigene `elementType` oder reine Component-Decorator-Flags? Konzept wählt **Decorator-Flags** (passt zur unified OWM-Syntax `(market)`/`(ecosystem)`, verifiziert für Juni-2025-Release) — final mit Round-Trip-Tests gegen Legacy-Maps absichern.
3. **VS Code `supportsMultipleEditorsPerDocument`:** V1 = `false` (Split-View deaktiviert, dokumentiert). Backlog = `true` mit commandStack-Broadcast. Bestätigung durch Stakeholder.
4. **Auto-Layout** für koordinatenlose DSL-Knoten: simples deterministisches Default-Placement (V1) vs. echter Solver (Backlog) — Priorisierung offen.
5. **React-Binding** Teil von V1 oder Post-V1? Konzept legt es in V1 (M6), kann bei Zeitdruck nach Backlog wandern.
6. **diagram-js-16-Migration** (ESM `exports`): Zeitpunkt — proaktiv vor V1 oder als kontrolliertes Post-V1-Inkrement (aktuell Backlog).
7. **`(inertia)`-Inline-Decorator-Syntax:** Vor M1 gegen reale OWM-Maps und den offiziellen Parser-Quellcode (`damonsk/onlinewardleymaps`) verifizieren; Serializer defensiv nur auf wieder-einlesbare Syntax beschränken.

---

**Zusammenfassung der Kernentscheidungen:** diagram-js (MIT) als Fundament, eigener Code in bpmn-js-Schichtung (inkl. selbst implementierter `attachTo`/`detach`); plain TS + Zod statt moddle; `{visibility, evolution}`-Kontinuum als Wahrheit mit abgeleiteter Stage; **eine** Geometrie↔Semantik-Mathematik in `EvolutionGrid`, aufgerufen von Importer und `EvolutionConstraintBehavior`; keyword-differenzierte OWM-DSL-Koordinaten (Pipeline = `[maturityStart, maturityEnd]`); npm-Workspaces-Monorepo mit strikter DOM-Boundary und frisch aufgelösten, inline gepinnten Versionen; VS Code via `CustomEditorProvider` mit commandStack als einziger Undo-Quelle und öffentlichem `seq`-Counter (keine privaten diagram-js-Felder); Renderer-Tests im Vitest Browser Mode (nicht jsdom); OWM-DSL-Round-Trip gegen den offiziellen Parser als CI-Gate. `@miragon/wardley-transforms` liefert rein DOM-freie Funktionen ohne eigenen Undo-Stack (P3). `diagram-js-direct-editing` ist MIT — der Label-Editor-Eigenbau ist technisch, nicht lizenzrechtlich begründet.
