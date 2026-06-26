import type {
  InferToolInput,
  InferUITool,
  ModelMessage,
  SingleToolApprovalFunction,
  Tool,
  ToolApprovalStatus,
  UIMessage,
} from 'ai';

/** A plain record of tools. */
type ToolRecord = Record<string, Tool>;

/** Supported message types for activation callbacks. */
type MessageType = UIMessage | ModelMessage;

/**
 * Per-tool context inferred from a tool's `contextSchema`.
 * Inlined because `InferToolContext` is not re-exported from `ai`.
 */
type InferToolContext<TOOL extends Tool> = TOOL extends Tool<any, any, infer CONTEXT> ? CONTEXT : never;

/** The fully-typed UIMessage for a given tool record. */
type InferUIMessage<TOOLS extends ToolRecord> = UIMessage<unknown, any, InferUIToolSet<TOOLS>>;

/** Infer the raw tool record from a ToolRecord or ToolSet instance. */
export type InferToolSet<TOOLSET extends ToolRecord | AnyToolSet> =
  TOOLSET extends ImmutableToolSet<infer TOOLS, any, any, any, any, any>
    ? TOOLS
    : TOOLSET extends MutableToolSet<infer TOOLS, any, any, any>
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
  TOOLSET extends ImmutableToolSet<any, any, any, any, infer A, any> ? A : never;

/**
 * Extract tool names tracked as inactive from an ImmutableToolSet instance.
 * Returns `never` for MutableToolSet (cannot be determined at compile time).
 */
export type InferInactiveTools<TOOLSET extends AnyToolSet> =
  TOOLSET extends ImmutableToolSet<any, any, any, any, any, infer D> ? D : never;

/**
 * Extract all tool names from a ToolSet instance — both active and inactive.
 * Works for both ImmutableToolSet and MutableToolSet since the tool record is statically known.
 */
export type InferAllTools<TOOLSET extends AnyToolSet> = keyof InferToolSet<TOOLSET> & string;

/**
 * Input passed to `inferTools()` and to activation predicates and approval resolvers.
 * Holds the toolset's own values: the messages you pass and the `toolSetContext`.
 * Distinct from the AI SDK's call-time values (`runtimeContext`, `ModelMessage`s) that a
 * returned approval function receives — see {@link ApprovalResolver}.
 */
export type InferToolsInput<
  MESSAGE extends MessageType = UIMessage,
  TOOLSET_CONTEXT extends Record<string, unknown> = Record<string, unknown>,
> = {
  messages?: Array<MESSAGE>;
  toolSetContext?: TOOLSET_CONTEXT;
};

/** Activation predicate — returns true if tool should be active. Undefined is treated as false. */
type ActivationPredicate<
  MESSAGE extends MessageType = UIMessage,
  TOOLSET_CONTEXT extends Record<string, unknown> = Record<string, unknown>,
> = (input: InferToolsInput<MESSAGE, TOOLSET_CONTEXT>) => boolean | undefined;

type StoredActivationEntry = {
  toolName: string;
  resolve: (input: InferToolsInput<any, any>) => boolean | undefined;
};

/**
 * Resolves a tool's approval at `inferTools()` time using the toolset's own values
 * (`toolSetContext`, your `messages`).
 *
 * Returns either:
 * - a final {@link ToolApprovalStatus} decided now, or
 * - a `SingleToolApprovalFunction` deferred to tool-call time, which the AI SDK invokes with the
 *   tool input and the SDK's own values (`runtimeContext`, `ModelMessage`s, `toolContext`).
 *
 * @typeParam RUNTIME_CONTEXT — the AI SDK runtime context type for the deferred function (defaults to `unknown`).
 */
export type ApprovalResolver<
  TOOL extends Tool,
  MESSAGE extends MessageType = UIMessage,
  TOOLSET_CONTEXT extends Record<string, unknown> = Record<string, unknown>,
  RUNTIME_CONTEXT = unknown,
> = (
  input: InferToolsInput<MESSAGE, TOOLSET_CONTEXT>,
) => ToolApprovalStatus | SingleToolApprovalFunction<InferToolInput<TOOL>, InferToolContext<TOOL>, RUNTIME_CONTEXT>;

/** An approval entry for a tool — a constant status or a resolver. */
export type ApprovalEntry<
  TOOL extends Tool,
  MESSAGE extends MessageType = UIMessage,
  TOOLSET_CONTEXT extends Record<string, unknown> = Record<string, unknown>,
  RUNTIME_CONTEXT = unknown,
> = ToolApprovalStatus | ApprovalResolver<TOOL, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT>;

/** Any approval entry value, for internal storage. */
type AnyApprovalEntry = ToolApprovalStatus | ApprovalResolver<any, any, any, any>;

type StoredApprovalEntry = {
  toolName: string;
  value: AnyApprovalEntry;
};

/** The resolved `toolApproval` record, ready to pass to `generateText`/`streamText`/`Agent`. */
type ResolvedToolApproval<TOOLS extends ToolRecord, RUNTIME_CONTEXT = unknown> = {
  [K in keyof TOOLS]?:
    | ToolApprovalStatus
    | SingleToolApprovalFunction<InferToolInput<TOOLS[K]>, InferToolContext<TOOLS[K]>, RUNTIME_CONTEXT>;
};

/** Resolved tools, active tool names, and approval record returned by `inferTools()`. */
type ResolvedToolSet<TOOLS extends ToolRecord, RUNTIME_CONTEXT = unknown> = {
  tools: TOOLS;
  activeTools: Array<keyof TOOLS & string>;
  toolApproval: ResolvedToolApproval<TOOLS, RUNTIME_CONTEXT>;
};

/** Union of both toolset classes for type utility constraints. */
type AnyToolSet = ImmutableToolSet<any, any, any, any, any, any> | MutableToolSet<any, any, any, any>;

/**
 * Derive a parameter type that accepts both immutable and mutable variants of an existing tool set.
 *
 * `createToolSet({ tools })` returns an `ImmutableToolSet`, while `.clone({ mutable: true })`
 * returns a structurally distinct `MutableToolSet`. Helpers written against `typeof baseToolSet`
 * directly cannot accept the cloned mutable instance — `ToolSet<typeof baseToolSet>` resolves
 * to a union of both flavors and infers the source's type parameters.
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
  TOOLSET extends ImmutableToolSet<
    infer TOOLS,
    infer MESSAGE,
    infer TOOLSET_CONTEXT,
    infer RUNTIME_CONTEXT,
    infer ACTIVATED,
    infer DEACTIVATED
  >
    ?
        | ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT, ACTIVATED, DEACTIVATED>
        | MutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT>
    : TOOLSET extends MutableToolSet<infer TOOLS, infer MESSAGE, infer TOOLSET_CONTEXT, infer RUNTIME_CONTEXT>
      ?
          | ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT, any, any>
          | MutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT>
      : never;

const toActivationEntries = (
  nameOrPredicates: string | Partial<Record<string, ActivationPredicate<any, any>>>,
  predicate?: ActivationPredicate<any, any>,
): Array<StoredActivationEntry> => {
  if (typeof nameOrPredicates === 'string') {
    return [{ toolName: nameOrPredicates, resolve: predicate! }];
  }
  return Object.entries(nameOrPredicates)
    .filter(([, pred]) => pred != null)
    .map(([name, pred]) => ({ toolName: name, resolve: pred! }));
};

const toApprovalEntries = (
  nameOrEntries: string | Partial<Record<string, AnyApprovalEntry>>,
  entry?: AnyApprovalEntry,
): Array<StoredApprovalEntry> => {
  if (typeof nameOrEntries === 'string') {
    return [{ toolName: nameOrEntries, value: entry }];
  }
  return Object.entries(nameOrEntries)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ({ toolName: name, value }));
};

/**
 * Immutable state container for tool activation and approval.
 *
 * All mutation methods return a new ToolSetState instance.
 * Resolution follows "last-call wins": each method appends entries,
 * and the last entry for each tool determines its state.
 */
class ToolSetState<
  TOOLS extends ToolRecord,
  MESSAGE extends MessageType = UIMessage,
  TOOLSET_CONTEXT extends Record<string, unknown> = Record<string, unknown>,
  RUNTIME_CONTEXT = unknown,
> {
  readonly #tools: TOOLS;
  readonly #activationEntries: Array<StoredActivationEntry>;
  readonly #approvalEntries: Array<StoredApprovalEntry>;

  constructor(
    tools: TOOLS,
    activationEntries: Array<StoredActivationEntry>,
    approvalEntries: Array<StoredApprovalEntry> = [],
  ) {
    this.#tools = tools;
    this.#activationEntries = activationEntries;
    this.#approvalEntries = approvalEntries;
  }

  /** All tools as a standard AI SDK tool record. */
  get tools(): TOOLS {
    return this.#tools;
  }

  activate(names: Array<string>): ToolSetState<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT> {
    const newEntries = names.map((name) => ({ toolName: name, resolve: () => true }));
    return new ToolSetState(this.#tools, [...this.#activationEntries, ...newEntries], this.#approvalEntries);
  }

  deactivate(names: Array<string>): ToolSetState<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT> {
    const newEntries = names.map((name) => ({ toolName: name, resolve: () => false }));
    return new ToolSetState(this.#tools, [...this.#activationEntries, ...newEntries], this.#approvalEntries);
  }

  activateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>>>,
    predicate?: ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>,
  ): ToolSetState<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT> {
    return new ToolSetState(
      this.#tools,
      [...this.#activationEntries, ...toActivationEntries(nameOrPredicates, predicate)],
      this.#approvalEntries,
    );
  }

  deactivateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>>>,
    predicate?: ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>,
  ): ToolSetState<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT> {
    const newEntries = toActivationEntries(nameOrPredicates, predicate).map((e) => ({
      ...e,
      resolve: (input: InferToolsInput<any, any>) => !e.resolve(input),
    }));
    return new ToolSetState(this.#tools, [...this.#activationEntries, ...newEntries], this.#approvalEntries);
  }

  approve(names: Array<string>): ToolSetState<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT> {
    const newEntries = names.map((name) => ({ toolName: name, value: 'approved' as ToolApprovalStatus }));
    return new ToolSetState(this.#tools, this.#activationEntries, [...this.#approvalEntries, ...newEntries]);
  }

  deny(names: Array<string>): ToolSetState<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT> {
    const newEntries = names.map((name) => ({ toolName: name, value: 'denied' as ToolApprovalStatus }));
    return new ToolSetState(this.#tools, this.#activationEntries, [...this.#approvalEntries, ...newEntries]);
  }

  approval(
    nameOrEntries: string | Partial<Record<string, AnyApprovalEntry>>,
    entry?: AnyApprovalEntry,
  ): ToolSetState<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT> {
    return new ToolSetState(this.#tools, this.#activationEntries, [
      ...this.#approvalEntries,
      ...toApprovalEntries(nameOrEntries, entry),
    ]);
  }

  /** Evaluate all predicates and resolvers with the provided input. */
  inferTools(input?: InferToolsInput<MESSAGE, TOOLSET_CONTEXT>): ResolvedToolSet<TOOLS, RUNTIME_CONTEXT> {
    const allNames = Object.keys(this.#tools) as Array<keyof TOOLS & string>;
    const activeTools = allNames.filter((name) => {
      const lastEntry = this.#activationEntries.findLast((e) => e.toolName === name);
      if (!lastEntry) return true;
      return lastEntry.resolve(input ?? {});
    });

    const toolApproval: Record<string, ToolApprovalStatus | SingleToolApprovalFunction<any, any, any>> = {};
    for (const name of allNames) {
      const lastApproval = this.#approvalEntries.findLast((e) => e.toolName === name);
      if (!lastApproval) continue;
      /** A resolver runs now with the toolset values; a constant is used as-is. */
      const resolved = typeof lastApproval.value === 'function' ? lastApproval.value(input ?? {}) : lastApproval.value;
      if (resolved === undefined) continue;
      toolApproval[name] = resolved;
    }

    return {
      tools: this.#tools,
      activeTools,
      toolApproval: toolApproval as ResolvedToolApproval<TOOLS, RUNTIME_CONTEXT>,
    };
  }
}

/**
 * An immutable tool set with chainable activation and approval methods.
 *
 * Resolution follows "last-call wins": each method appends an entry,
 * and the last entry for each tool determines its state.
 * Default (no entry) is active, and no approval (not-applicable).
 */
class ImmutableToolSet<
  TOOLS extends ToolRecord,
  MESSAGE extends MessageType = UIMessage,
  TOOLSET_CONTEXT extends Record<string, unknown> = Record<string, unknown>,
  RUNTIME_CONTEXT = unknown,
  ACTIVATED extends string = never,
  DEACTIVATED extends string = never,
> {
  readonly #state: ToolSetState<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT>;

  /** All tools as a standard AI SDK tool record. */
  readonly tools: TOOLS;

  constructor(state: ToolSetState<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT>) {
    this.#state = state;
    this.tools = state.tools;
  }

  /** Statically activate tools by name. */
  activate<NAMES extends keyof TOOLS & string>(
    names: Array<NAMES>,
  ): ImmutableToolSet<
    TOOLS,
    MESSAGE,
    TOOLSET_CONTEXT,
    RUNTIME_CONTEXT,
    ACTIVATED | NAMES,
    Exclude<DEACTIVATED, NAMES>
  > {
    return new ImmutableToolSet(this.#state.activate(names));
  }

  /** Statically deactivate tools by name. */
  deactivate<NAMES extends keyof TOOLS & string>(
    names: Array<NAMES>,
  ): ImmutableToolSet<
    TOOLS,
    MESSAGE,
    TOOLSET_CONTEXT,
    RUNTIME_CONTEXT,
    Exclude<ACTIVATED, NAMES>,
    DEACTIVATED | NAMES
  > {
    return new ImmutableToolSet(this.#state.deactivate(names));
  }

  /**
   * Conditionally activate a tool — inactive by default, becomes active when predicate returns true.
   * Tracks names in DEACTIVATED since the tool starts inactive.
   */
  activateWhen<NAME extends keyof TOOLS & string>(
    name: NAME,
    predicate: ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>,
  ): ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT, Exclude<ACTIVATED, NAME>, DEACTIVATED | NAME>;
  activateWhen<NAMES extends keyof TOOLS & string>(
    predicates: Partial<Record<NAMES, ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>>>,
  ): ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT, Exclude<ACTIVATED, NAMES>, DEACTIVATED | NAMES>;
  activateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>>>,
    predicate?: ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>,
  ): ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT, ACTIVATED, DEACTIVATED> {
    return new ImmutableToolSet(this.#state.activateWhen(nameOrPredicates, predicate));
  }

  /**
   * Conditionally deactivate a tool — active by default, becomes inactive when predicate returns true.
   * Tracks names in ACTIVATED since the tool starts active.
   */
  deactivateWhen<NAME extends keyof TOOLS & string>(
    name: NAME,
    predicate: ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>,
  ): ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT, ACTIVATED | NAME, Exclude<DEACTIVATED, NAME>>;
  deactivateWhen<NAMES extends keyof TOOLS & string>(
    predicates: Partial<Record<NAMES, ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>>>,
  ): ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT, ACTIVATED | NAMES, Exclude<DEACTIVATED, NAMES>>;
  deactivateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>>>,
    predicate?: ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>,
  ): ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT, ACTIVATED, DEACTIVATED> {
    return new ImmutableToolSet(this.#state.deactivateWhen(nameOrPredicates, predicate));
  }

  /** Statically auto-approve tools by name (status `'approved'`). */
  approve<NAMES extends keyof TOOLS & string>(
    names: Array<NAMES>,
  ): ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT, ACTIVATED, DEACTIVATED> {
    return new ImmutableToolSet(this.#state.approve(names));
  }

  /** Statically deny tools by name (status `'denied'`). */
  deny<NAMES extends keyof TOOLS & string>(
    names: Array<NAMES>,
  ): ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT, ACTIVATED, DEACTIVATED> {
    return new ImmutableToolSet(this.#state.deny(names));
  }

  /**
   * Set an approval entry for a tool — a constant `ToolApprovalStatus` or a resolver.
   * The resolver runs at `inferTools()` time with the toolset values, and may return either a final
   * status or a `SingleToolApprovalFunction` deferred to tool-call time.
   */
  approval<NAME extends keyof TOOLS & string>(
    name: NAME,
    entry: ApprovalEntry<TOOLS[NAME], MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT>,
  ): ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT, ACTIVATED, DEACTIVATED>;
  approval(entries: {
    [K in keyof TOOLS & string]?: ApprovalEntry<TOOLS[K], MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT>;
  }): ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT, ACTIVATED, DEACTIVATED>;
  approval(
    nameOrEntries: string | Partial<Record<string, AnyApprovalEntry>>,
    entry?: AnyApprovalEntry,
  ): ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT, ACTIVATED, DEACTIVATED> {
    return new ImmutableToolSet(this.#state.approval(nameOrEntries, entry));
  }

  /** Evaluate all predicates and resolvers. Returns resolved `{ tools, activeTools, toolApproval }`. */
  inferTools(input?: InferToolsInput<MESSAGE, TOOLSET_CONTEXT>): ResolvedToolSet<TOOLS, RUNTIME_CONTEXT> {
    return this.#state.inferTools(input);
  }

  /** Clone this toolset, optionally switching between immutable and mutable. */
  clone(options: { mutable: true }): MutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT>;
  clone(options?: {
    mutable?: false;
  }): ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT, ACTIVATED, DEACTIVATED>;
  clone(options?: {
    mutable?: boolean;
  }):
    | MutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT>
    | ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT> {
    return options?.mutable ? new MutableToolSet(this.#state) : new ImmutableToolSet(this.#state);
  }
}

/**
 * A mutable tool set with chainable activation and approval methods.
 *
 * Same resolution semantics as ImmutableToolSet, but methods mutate
 * in-place and return `this` instead of creating new instances.
 */
class MutableToolSet<
  TOOLS extends ToolRecord,
  MESSAGE extends MessageType = UIMessage,
  TOOLSET_CONTEXT extends Record<string, unknown> = Record<string, unknown>,
  RUNTIME_CONTEXT = unknown,
> {
  #state: ToolSetState<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT>;

  /** All tools as a standard AI SDK tool record. */
  readonly tools: TOOLS;

  constructor(state: ToolSetState<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT>) {
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
  activateWhen(name: keyof TOOLS & string, predicate: ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>): this;
  activateWhen(predicates: Partial<Record<keyof TOOLS & string, ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>>>): this;
  activateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>>>,
    predicate?: ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>,
  ): this {
    this.#state = this.#state.activateWhen(nameOrPredicates, predicate);
    return this;
  }

  /**
   * Conditionally deactivate a tool — active by default, becomes inactive when predicate returns true.
   */
  deactivateWhen(name: keyof TOOLS & string, predicate: ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>): this;
  deactivateWhen(
    predicates: Partial<Record<keyof TOOLS & string, ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>>>,
  ): this;
  deactivateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>>>,
    predicate?: ActivationPredicate<MESSAGE, TOOLSET_CONTEXT>,
  ): this {
    this.#state = this.#state.deactivateWhen(nameOrPredicates, predicate);
    return this;
  }

  /** Statically auto-approve tools by name (status `'approved'`). */
  approve(names: Array<keyof TOOLS & string>): this {
    this.#state = this.#state.approve(names);
    return this;
  }

  /** Statically deny tools by name (status `'denied'`). */
  deny(names: Array<keyof TOOLS & string>): this {
    this.#state = this.#state.deny(names);
    return this;
  }

  /**
   * Set an approval entry for a tool — a constant `ToolApprovalStatus` or a resolver.
   */
  approval<NAME extends keyof TOOLS & string>(
    name: NAME,
    entry: ApprovalEntry<TOOLS[NAME], MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT>,
  ): this;
  approval(entries: {
    [K in keyof TOOLS & string]?: ApprovalEntry<TOOLS[K], MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT>;
  }): this;
  approval(nameOrEntries: string | Partial<Record<string, AnyApprovalEntry>>, entry?: AnyApprovalEntry): this {
    this.#state = this.#state.approval(nameOrEntries, entry);
    return this;
  }

  /** Evaluate all predicates and resolvers. Returns resolved `{ tools, activeTools, toolApproval }`. */
  inferTools(input?: InferToolsInput<MESSAGE, TOOLSET_CONTEXT>): ResolvedToolSet<TOOLS, RUNTIME_CONTEXT> {
    return this.#state.inferTools(input);
  }

  /** Clone this toolset, optionally switching between immutable and mutable. */
  clone(options: { mutable: true }): MutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT>;
  clone(options?: {
    mutable?: false;
  }): ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT, keyof TOOLS & string>;
  clone(options?: {
    mutable?: boolean;
  }):
    | MutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT>
    | ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT> {
    return options?.mutable ? new MutableToolSet(this.#state) : new ImmutableToolSet(this.#state);
  }
}

type CreateToolSetOptions<TOOLS extends ToolRecord> = {
  tools: TOOLS;
  mutable?: boolean;
};

/**
 * Create a chainable tool set.
 *
 * @typeParam TOOLS — inferred from the argument
 * @typeParam MESSAGE — defaults to the fully-typed UIMessage derived from TOOLS
 * @typeParam TOOLSET_CONTEXT — the toolset's own context passed to `inferTools` (defaults to Record<string, unknown>)
 * @typeParam RUNTIME_CONTEXT — the AI SDK runtime context for deferred approval functions (defaults to unknown)
 */
export function createToolSet<
  const TOOLS extends ToolRecord,
  MESSAGE extends MessageType = InferUIMessage<TOOLS>,
  TOOLSET_CONTEXT extends Record<string, unknown> = Record<string, unknown>,
  RUNTIME_CONTEXT = unknown,
>(
  options: CreateToolSetOptions<TOOLS> & { mutable: true },
): MutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT>;
export function createToolSet<
  const TOOLS extends ToolRecord,
  MESSAGE extends MessageType = InferUIMessage<TOOLS>,
  TOOLSET_CONTEXT extends Record<string, unknown> = Record<string, unknown>,
  RUNTIME_CONTEXT = unknown,
>(
  options: CreateToolSetOptions<TOOLS> & { mutable?: false },
): ImmutableToolSet<TOOLS, MESSAGE, TOOLSET_CONTEXT, RUNTIME_CONTEXT, keyof TOOLS & string>;
export function createToolSet(options: CreateToolSetOptions<ToolRecord>): AnyToolSet {
  const state = new ToolSetState(options.tools, []);
  return options.mutable ? new MutableToolSet(state) : new ImmutableToolSet(state);
}
