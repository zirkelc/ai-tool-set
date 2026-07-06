import type { InferUITool, ModelMessage, StepResult, Tool, ToolChoice, UIMessage } from 'ai';

/** A plain record of tools. */
type ToolRecord = Record<string, Tool>;

/** Supported message types for activation callbacks. */
type MessageType = UIMessage | ModelMessage;

/** The fully-typed UIMessage for a given tool record. */
type InferUIMessage<TOOLS extends ToolRecord> = UIMessage<unknown, any, InferUIToolSet<TOOLS>>;

/** Infer the raw tool record from a ToolRecord or ToolSet instance. */
export type InferToolSet<TOOLSET extends ToolRecord | AnyToolSet> =
  TOOLSET extends ImmutableToolSet<infer TOOLS, any, any>
    ? TOOLS
    : TOOLSET extends MutableToolSet<infer TOOLS, any, any>
      ? TOOLS
      : TOOLSET;

/** Infer the UI tool types from a tool record or ToolSet instance. */
export type InferUIToolSet<TOOLSET extends ToolRecord | AnyToolSet> = {
  [K in keyof InferToolSet<TOOLSET> & string]: InferUITool<InferToolSet<TOOLSET>[K]>;
};

/**
 * Extract tool names tracked as active from an ImmutableToolSet instance.
 * Returns `never` for MutableToolSet (cannot be determined at compile time).
 */
export type InferActiveTools<TOOLSET extends AnyToolSet> =
  TOOLSET extends ImmutableToolSet<any, any, any, infer A, any> ? A : never;

/**
 * Extract tool names tracked as inactive from an ImmutableToolSet instance.
 * Returns `never` for MutableToolSet (cannot be determined at compile time).
 */
export type InferInactiveTools<TOOLSET extends AnyToolSet> =
  TOOLSET extends ImmutableToolSet<any, any, any, any, infer D> ? D : never;

/**
 * Extract all tool names from a ToolSet instance — both active and inactive.
 * Works for both ImmutableToolSet and MutableToolSet since the tool record is statically known.
 */
export type InferAllTools<TOOLSET extends AnyToolSet> = keyof InferToolSet<TOOLSET> & string;

/**
 * Input passed to activation predicates.
 * Use `ActivationInput<MyMsg>` to get per-tool narrowing in callbacks.
 */
export type ActivationInput<
  TOOLS extends ToolRecord = ToolRecord,
  MESSAGE extends MessageType = UIMessage,
  CONTEXT extends Record<string, unknown> = Record<string, unknown>,
> = {
  messages?: Array<MESSAGE>;
  steps?: Array<StepResult<TOOLS>>;
  context?: CONTEXT;
};

/** Activation predicate — returns true if tool should be active. Undefined is treated as false. */
type ActivationPredicate<
  TOOLS extends ToolRecord = ToolRecord,
  MESSAGE extends MessageType = UIMessage,
  CONTEXT extends Record<string, unknown> = Record<string, unknown>,
> = (input: ActivationInput<TOOLS, MESSAGE, CONTEXT>) => boolean | undefined;

type ActivationEntry = {
  toolName: string;
  resolve: (input: ActivationInput<any, any, any>) => boolean | undefined;
  /** True when the entry came from a conditional method (`activateWhen`/`deactivateWhen`). */
  dynamic: boolean;
};

/**
 * Resolves the toolset's `toolChoice` at `inferTools()` time from the toolset's own values
 * (`context`, your `messages`, `steps`). Returns a {@link ToolChoice} to force, or `undefined`
 * to leave the choice unconstrained (omitted, so the AI SDK defaults to `'auto'`).
 */
type ToolChoiceResolver<
  TOOLS extends ToolRecord = ToolRecord,
  MESSAGE extends MessageType = UIMessage,
  CONTEXT extends Record<string, unknown> = Record<string, unknown>,
> = (input: ActivationInput<TOOLS, MESSAGE, CONTEXT>) => ToolChoice<TOOLS> | undefined;

/** A tool-choice entry for the toolset — a constant {@link ToolChoice} or a resolver. */
type ToolChoiceEntry<
  TOOLS extends ToolRecord = ToolRecord,
  MESSAGE extends MessageType = UIMessage,
  CONTEXT extends Record<string, unknown> = Record<string, unknown>,
> = ToolChoice<TOOLS> | ToolChoiceResolver<TOOLS, MESSAGE, CONTEXT>;

/** Any tool-choice entry value, for internal storage. */
type AnyToolChoiceEntry = ToolChoice<any> | ToolChoiceResolver<any, any, any>;

/** Metadata for one tool, passed to a manual {@link ToolComparator}. */
type ToolOrderEntry = {
  /** Tool name (record key). */
  toolName: string;
  /** The tool definition. */
  tool: Tool;
  /** True when activation depends on a runtime predicate (`activateWhen`/`deactivateWhen`). */
  dynamic: boolean;
  /** Original insertion index in the `tools` record, for stable tie-breaking. */
  index: number;
};

/** A manual comparator over {@link ToolOrderEntry} values, matching `Array.prototype.sort`. */
type ToolComparator = (a: ToolOrderEntry, b: ToolOrderEntry) => number;

/**
 * How to order the tools sent to the provider.
 *
 * AI SDK v6 has no `toolOrder` parameter, so `inferTools()` re-creates the `tools` record in the
 * resolved order — the provider renders tools in the record's own key order (filtered by
 * `activeTools`). When the order is unchanged the original record reference is returned as-is.
 *
 * - `'stable'` — static tools first (in insertion order), conditionally-activated tools to the tail.
 *   Keeps the prompt's static tool prefix byte-identical when a dynamic tool toggles, which preserves
 *   provider prompt caching. This is the default.
 * - `'insertion'` — as declared in the `tools` record (no reordering).
 * - `Array<string>` — explicit order; names not listed keep insertion order after the listed ones.
 * - {@link ToolComparator} — full manual control (e.g. `(a, b) => a.toolName.localeCompare(b.toolName)`).
 */
type ToolOrderStrategy<TOOLS extends ToolRecord = ToolRecord> =
  | 'stable'
  | 'insertion'
  | Array<keyof TOOLS & string>
  | ToolComparator;

/** Build a name comparator from a {@link ToolOrderStrategy} and per-tool metadata. */
const toOrderComparator = (
  order: ToolOrderStrategy<any>,
  entries: Map<string, ToolOrderEntry>,
): ((a: string, b: string) => number) => {
  if (typeof order === 'function') {
    return (a, b) => order(entries.get(a)!, entries.get(b)!);
  }
  if (Array.isArray(order)) {
    const rank = new Map(order.map((name, i) => [name, i] as const));
    return (a, b) => {
      const ra = rank.get(a) ?? Number.POSITIVE_INFINITY;
      const rb = rank.get(b) ?? Number.POSITIVE_INFINITY;
      return ra - rb || entries.get(a)!.index - entries.get(b)!.index;
    };
  }
  if (order === 'stable') {
    return (a, b) => {
      const ea = entries.get(a)!;
      const eb = entries.get(b)!;
      /** static (false → 0) before dynamic (true → 1); ties keep insertion order. */
      return Number(ea.dynamic) - Number(eb.dynamic) || ea.index - eb.index;
    };
  }
  /** 'insertion' */
  return (a, b) => entries.get(a)!.index - entries.get(b)!.index;
};

/** Resolved tools and active tool names returned by `inferTools()`. */
type ResolvedToolSet<TOOLS extends ToolRecord> = {
  tools: TOOLS;
  activeTools: Array<keyof TOOLS & string>;
  toolChoice?: ToolChoice<TOOLS>;
};

/** Union of both toolset classes for type utility constraints. */
type AnyToolSet = ImmutableToolSet<any, any, any> | MutableToolSet<any, any, any>;

/**
 * Derive a parameter type that accepts both immutable and mutable variants of an existing tool set.
 *
 * `createToolSet({ tools })` returns an `ImmutableToolSet`, while `.clone({ mutable: true })`
 * returns a structurally distinct `MutableToolSet`. Helpers written against `typeof baseToolSet`
 * directly cannot accept the cloned mutable instance — `ToolSet<typeof baseToolSet>` resolves
 * to a union of both flavors and infers `TOOLS`, `MESSAGE`, and `CONTEXT` from the source.
 *
 * @example Accept either flavor in a helper function
 * ```ts
 * const baseToolSet = createToolSet({ tools }).deactivate(['cancel_order']);
 *
 * type MyToolSet = ToolSet<typeof baseToolSet>;
 *
 * // Accepts the immutable baseToolSet AND the cloned mutable instance
 * function activateAdminTools(toolSet: MyToolSet) {
 *   toolSet.activate(['cancel_order']);
 * }
 *
 * activateAdminTools(baseToolSet);
 * activateAdminTools(baseToolSet.clone({ mutable: true }));
 * ```
 */
export type ToolSet<TOOLSET extends AnyToolSet> =
  TOOLSET extends ImmutableToolSet<infer TOOLS, infer MESSAGE, infer CONTEXT, infer ACTIVATED, infer DEACTIVATED>
    ? ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, ACTIVATED, DEACTIVATED> | MutableToolSet<TOOLS, MESSAGE, CONTEXT>
    : TOOLSET extends MutableToolSet<infer TOOLS, infer MESSAGE, infer CONTEXT>
      ? ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, any, any> | MutableToolSet<TOOLS, MESSAGE, CONTEXT>
      : never;

const toEntries = (
  nameOrPredicates: string | Partial<Record<string, ActivationPredicate<any, any, any>>>,
  predicate?: ActivationPredicate<any, any, any>,
): Array<ActivationEntry> => {
  if (typeof nameOrPredicates === 'string') {
    return [{ toolName: nameOrPredicates, resolve: predicate!, dynamic: true }];
  }
  return Object.entries(nameOrPredicates)
    .filter(([, pred]) => pred != null)
    .map(([name, pred]) => ({ toolName: name, resolve: pred!, dynamic: true }));
};

/**
 * Immutable state container for tool activation.
 *
 * All mutation methods return a new ToolSetState instance.
 * Resolution follows "last-call wins": each method appends entries,
 * and the last entry for each tool determines its state.
 */
class ToolSetState<
  TOOLS extends ToolRecord,
  MESSAGE extends MessageType = UIMessage,
  CONTEXT extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly #tools: TOOLS;
  readonly #entries: Array<ActivationEntry>;
  readonly #toolChoiceEntries: Array<AnyToolChoiceEntry>;
  readonly #order: ToolOrderStrategy<any>;

  constructor(
    tools: TOOLS,
    entries: Array<ActivationEntry>,
    toolChoiceEntries: Array<AnyToolChoiceEntry> = [],
    order: ToolOrderStrategy<any> = 'stable',
  ) {
    this.#tools = tools;
    this.#entries = entries;
    this.#toolChoiceEntries = toolChoiceEntries;
    this.#order = order;
  }

  /** All tools as a standard AI SDK tool record. */
  get tools(): TOOLS {
    return this.#tools;
  }

  activate(names: Array<string>): ToolSetState<TOOLS, MESSAGE, CONTEXT> {
    const newEntries = names.map((name) => ({ toolName: name, resolve: () => true, dynamic: false }));
    return new ToolSetState(this.#tools, [...this.#entries, ...newEntries], this.#toolChoiceEntries, this.#order);
  }

  deactivate(names: Array<string>): ToolSetState<TOOLS, MESSAGE, CONTEXT> {
    const newEntries = names.map((name) => ({ toolName: name, resolve: () => false, dynamic: false }));
    return new ToolSetState(this.#tools, [...this.#entries, ...newEntries], this.#toolChoiceEntries, this.#order);
  }

  activateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<TOOLS, MESSAGE, CONTEXT>>>,
    predicate?: ActivationPredicate<TOOLS, MESSAGE, CONTEXT>,
  ): ToolSetState<TOOLS, MESSAGE, CONTEXT> {
    return new ToolSetState(
      this.#tools,
      [...this.#entries, ...toEntries(nameOrPredicates, predicate)],
      this.#toolChoiceEntries,
      this.#order,
    );
  }

  deactivateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<TOOLS, MESSAGE, CONTEXT>>>,
    predicate?: ActivationPredicate<TOOLS, MESSAGE, CONTEXT>,
  ): ToolSetState<TOOLS, MESSAGE, CONTEXT> {
    const newEntries = toEntries(nameOrPredicates, predicate).map((e) => ({
      ...e,
      resolve: (input: ActivationInput<any, any, any>) => !e.resolve(input),
    }));
    return new ToolSetState(this.#tools, [...this.#entries, ...newEntries], this.#toolChoiceEntries, this.#order);
  }

  /** Set the toolset's `toolChoice` — a constant {@link ToolChoice} or a resolver. Last-call wins. */
  choice(entry: AnyToolChoiceEntry): ToolSetState<TOOLS, MESSAGE, CONTEXT> {
    return new ToolSetState(this.#tools, this.#entries, [...this.#toolChoiceEntries, entry], this.#order);
  }

  /** Set the ordering strategy that reorders the resolved `tools` record. Last-call wins. */
  order(order: ToolOrderStrategy<TOOLS>): ToolSetState<TOOLS, MESSAGE, CONTEXT> {
    return new ToolSetState(this.#tools, this.#entries, this.#toolChoiceEntries, order);
  }

  /** Evaluate all predicates with the provided input and return resolved tools, activeTools, and toolChoice. */
  inferTools(input?: ActivationInput<TOOLS, MESSAGE, CONTEXT>): ResolvedToolSet<TOOLS> {
    const allNames = Object.keys(this.#tools) as Array<keyof TOOLS & string>;

    /** Per-tool metadata for ordering; the `index` doubles as insertion order. */
    const orderEntries = new Map<string, ToolOrderEntry>();
    const activeTools = allNames.filter((name, index) => {
      const lastEntry = this.#entries.findLast((e) => e.toolName === name);
      orderEntries.set(name, { toolName: name, tool: this.#tools[name]!, dynamic: lastEntry?.dynamic ?? false, index });
      if (!lastEntry) return true;
      return lastEntry.resolve(input ?? {});
    });

    /**
     * AI SDK v6 has no `toolOrder` param, so the provider order comes from the `tools` record's key
     * order. Re-create the record in the resolved order, but keep the original reference when the
     * order is unchanged (a true no-op) so callers can rely on identity.
     */
    const orderedNames =
      this.#order === 'insertion'
        ? allNames
        : ([...allNames].sort(toOrderComparator(this.#order, orderEntries)) as Array<keyof TOOLS & string>);
    const reordered = orderedNames.some((name, i) => name !== allNames[i]);
    const tools = reordered
      ? (Object.fromEntries(orderedNames.map((name) => [name, this.#tools[name]!])) as TOOLS)
      : this.#tools;

    /** The last `choice()` entry wins; a resolver runs now with the toolset values. */
    const lastToolChoice = this.#toolChoiceEntries.at(-1);
    const toolChoice = (typeof lastToolChoice === 'function' ? lastToolChoice(input ?? {}) : lastToolChoice) as
      | ToolChoice<TOOLS>
      | undefined;

    return { tools, activeTools, toolChoice };
  }
}

/**
 * An immutable tool set with chainable activation methods.
 *
 * Resolution follows "last-call wins": each method appends an entry,
 * and the last entry for each tool determines its state.
 * Default (no entry) is active.
 */
class ImmutableToolSet<
  TOOLS extends ToolRecord,
  MESSAGE extends MessageType = UIMessage,
  CONTEXT extends Record<string, unknown> = Record<string, unknown>,
  ACTIVATED extends string = never,
  DEACTIVATED extends string = never,
> {
  readonly #state: ToolSetState<TOOLS, MESSAGE, CONTEXT>;

  /** All tools as a standard AI SDK tool record. */
  readonly tools: TOOLS;

  constructor(state: ToolSetState<TOOLS, MESSAGE, CONTEXT>) {
    this.#state = state;
    this.tools = state.tools;
  }

  /** Statically activate tools by name. */
  activate<NAMES extends keyof TOOLS & string>(
    names: Array<NAMES>,
  ): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, ACTIVATED | NAMES, Exclude<DEACTIVATED, NAMES>> {
    return new ImmutableToolSet(this.#state.activate(names));
  }

  /** Statically deactivate tools by name. */
  deactivate<NAMES extends keyof TOOLS & string>(
    names: Array<NAMES>,
  ): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, Exclude<ACTIVATED, NAMES>, DEACTIVATED | NAMES> {
    return new ImmutableToolSet(this.#state.deactivate(names));
  }

  /**
   * Conditionally activate a tool — inactive by default, becomes active when predicate returns true.
   * Tracks names in DEACTIVATED since the tool starts inactive.
   */
  activateWhen<NAME extends keyof TOOLS & string>(
    name: NAME,
    predicate: ActivationPredicate<TOOLS, MESSAGE, CONTEXT>,
  ): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, Exclude<ACTIVATED, NAME>, DEACTIVATED | NAME>;
  activateWhen<NAMES extends keyof TOOLS & string>(
    predicates: Partial<Record<NAMES, ActivationPredicate<TOOLS, MESSAGE, CONTEXT>>>,
  ): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, Exclude<ACTIVATED, NAMES>, DEACTIVATED | NAMES>;
  activateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<TOOLS, MESSAGE, CONTEXT>>>,
    predicate?: ActivationPredicate<TOOLS, MESSAGE, CONTEXT>,
  ): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, ACTIVATED, DEACTIVATED> {
    return new ImmutableToolSet(this.#state.activateWhen(nameOrPredicates, predicate));
  }

  /**
   * Conditionally deactivate a tool — active by default, becomes inactive when predicate returns true.
   * Tracks names in ACTIVATED since the tool starts active.
   */
  deactivateWhen<NAME extends keyof TOOLS & string>(
    name: NAME,
    predicate: ActivationPredicate<TOOLS, MESSAGE, CONTEXT>,
  ): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, ACTIVATED | NAME, Exclude<DEACTIVATED, NAME>>;
  deactivateWhen<NAMES extends keyof TOOLS & string>(
    predicates: Partial<Record<NAMES, ActivationPredicate<TOOLS, MESSAGE, CONTEXT>>>,
  ): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, ACTIVATED | NAMES, Exclude<DEACTIVATED, NAMES>>;
  deactivateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<TOOLS, MESSAGE, CONTEXT>>>,
    predicate?: ActivationPredicate<TOOLS, MESSAGE, CONTEXT>,
  ): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, ACTIVATED, DEACTIVATED> {
    return new ImmutableToolSet(this.#state.deactivateWhen(nameOrPredicates, predicate));
  }

  /**
   * Set the toolset's `toolChoice` — a constant `ToolChoice` (`'auto'`, `'none'`, `'required'`, or
   * `{ type: 'tool', toolName }`) or a resolver that runs at `inferTools()` time with the toolset
   * values and returns a `ToolChoice` (or `undefined` to leave it unconstrained). Last-call wins.
   */
  choice(
    entry: ToolChoiceEntry<TOOLS, MESSAGE, CONTEXT>,
  ): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, ACTIVATED, DEACTIVATED> {
    return new ImmutableToolSet(this.#state.choice(entry));
  }

  /**
   * Set how tools are ordered for the provider by reordering the resolved `tools` record: a preset
   * (`'insertion'`, `'stable'`), an explicit `Array` of tool names, or a comparator.
   * Defaults to `'stable'`. Last-call wins.
   */
  order(order: ToolOrderStrategy<TOOLS>): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, ACTIVATED, DEACTIVATED> {
    return new ImmutableToolSet(this.#state.order(order));
  }

  /** Evaluate all predicates with the provided input. Returns resolved `{ tools, activeTools, toolChoice }`. */
  inferTools(input?: ActivationInput<TOOLS, MESSAGE, CONTEXT>): ResolvedToolSet<TOOLS> {
    return this.#state.inferTools(input);
  }

  /** Clone this toolset, optionally switching between immutable and mutable. */
  clone(options: { mutable: true }): MutableToolSet<TOOLS, MESSAGE, CONTEXT>;
  clone(options?: { mutable?: false }): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, ACTIVATED, DEACTIVATED>;
  clone(options?: {
    mutable?: boolean;
  }): MutableToolSet<TOOLS, MESSAGE, CONTEXT> | ImmutableToolSet<TOOLS, MESSAGE, CONTEXT> {
    return options?.mutable ? new MutableToolSet(this.#state) : new ImmutableToolSet(this.#state);
  }
}

/**
 * A mutable tool set with chainable activation methods.
 *
 * Same resolution semantics as ImmutableToolSet, but methods mutate
 * in-place and return `this` instead of creating new instances.
 */
class MutableToolSet<
  TOOLS extends ToolRecord,
  MESSAGE extends MessageType = UIMessage,
  CONTEXT extends Record<string, unknown> = Record<string, unknown>,
> {
  #state: ToolSetState<TOOLS, MESSAGE, CONTEXT>;

  /** All tools as a standard AI SDK tool record. */
  readonly tools: TOOLS;

  constructor(state: ToolSetState<TOOLS, MESSAGE, CONTEXT>) {
    this.#state = state;
    this.tools = state.tools;
  }

  /** Statically activate tools by name. */
  activate(names: Array<keyof TOOLS & string>): this {
    this.#state = this.#state.activate(names);
    return this;
  }

  /** Statically deactivate tools by name. */
  deactivate(names: Array<keyof TOOLS & string>): this {
    this.#state = this.#state.deactivate(names);
    return this;
  }

  /**
   * Conditionally activate a tool — inactive by default, becomes active when predicate returns true.
   */
  activateWhen(name: keyof TOOLS & string, predicate: ActivationPredicate<TOOLS, MESSAGE, CONTEXT>): this;
  activateWhen(predicates: Partial<Record<keyof TOOLS & string, ActivationPredicate<TOOLS, MESSAGE, CONTEXT>>>): this;
  activateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<TOOLS, MESSAGE, CONTEXT>>>,
    predicate?: ActivationPredicate<TOOLS, MESSAGE, CONTEXT>,
  ): this {
    this.#state = this.#state.activateWhen(nameOrPredicates, predicate);
    return this;
  }

  /**
   * Conditionally deactivate a tool — active by default, becomes inactive when predicate returns true.
   */
  deactivateWhen(name: keyof TOOLS & string, predicate: ActivationPredicate<TOOLS, MESSAGE, CONTEXT>): this;
  deactivateWhen(predicates: Partial<Record<keyof TOOLS & string, ActivationPredicate<TOOLS, MESSAGE, CONTEXT>>>): this;
  deactivateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<TOOLS, MESSAGE, CONTEXT>>>,
    predicate?: ActivationPredicate<TOOLS, MESSAGE, CONTEXT>,
  ): this {
    this.#state = this.#state.deactivateWhen(nameOrPredicates, predicate);
    return this;
  }

  /**
   * Set the toolset's `toolChoice` — a constant `ToolChoice` (`'auto'`, `'none'`, `'required'`, or
   * `{ type: 'tool', toolName }`) or a resolver that runs at `inferTools()` time with the toolset
   * values and returns a `ToolChoice` (or `undefined` to leave it unconstrained). Last-call wins.
   */
  choice(entry: ToolChoiceEntry<TOOLS, MESSAGE, CONTEXT>): this {
    this.#state = this.#state.choice(entry);
    return this;
  }

  /**
   * Set how tools are ordered for the provider by reordering the resolved `tools` record: a preset
   * (`'insertion'`, `'stable'`), an explicit `Array` of tool names, or a comparator.
   * Defaults to `'stable'`. Last-call wins.
   */
  order(order: ToolOrderStrategy<TOOLS>): this {
    this.#state = this.#state.order(order);
    return this;
  }

  /** Evaluate all predicates with the provided input. Returns resolved `{ tools, activeTools, toolChoice }`. */
  inferTools(input?: ActivationInput<TOOLS, MESSAGE, CONTEXT>): ResolvedToolSet<TOOLS> {
    return this.#state.inferTools(input);
  }

  /** Clone this toolset, optionally switching between immutable and mutable. */
  clone(options: { mutable: true }): MutableToolSet<TOOLS, MESSAGE, CONTEXT>;
  clone(options?: { mutable?: false }): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, keyof TOOLS & string>;
  clone(options?: {
    mutable?: boolean;
  }): MutableToolSet<TOOLS, MESSAGE, CONTEXT> | ImmutableToolSet<TOOLS, MESSAGE, CONTEXT> {
    return options?.mutable ? new MutableToolSet(this.#state) : new ImmutableToolSet(this.#state);
  }
}

type CreateToolSetOptions<TOOLS extends ToolRecord> = {
  tools: TOOLS;
  mutable?: boolean;
  /** Ordering strategy that reorders the resolved `tools` record. Defaults to `'stable'`. */
  order?: ToolOrderStrategy<TOOLS>;
};

/**
 * Create a chainable tool set.
 *
 * @typeParam TOOLS — inferred from the argument
 * @typeParam MESSAGE — defaults to the fully-typed UIMessage derived from TOOLS
 * @typeParam CONTEXT — defaults to Record<string, unknown>
 */
export function createToolSet<
  const TOOLS extends ToolRecord,
  MESSAGE extends MessageType = InferUIMessage<TOOLS>,
  CONTEXT extends Record<string, unknown> = Record<string, unknown>,
>(options: CreateToolSetOptions<TOOLS> & { mutable: true }): MutableToolSet<TOOLS, MESSAGE, CONTEXT>;
export function createToolSet<
  const TOOLS extends ToolRecord,
  MESSAGE extends MessageType = InferUIMessage<TOOLS>,
  CONTEXT extends Record<string, unknown> = Record<string, unknown>,
>(
  options: CreateToolSetOptions<TOOLS> & { mutable?: false },
): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, keyof TOOLS & string>;
export function createToolSet(options: CreateToolSetOptions<ToolRecord>): AnyToolSet {
  const state = new ToolSetState(options.tools, [], [], options.order ?? 'stable');
  return options.mutable ? new MutableToolSet(state) : new ImmutableToolSet(state);
}
