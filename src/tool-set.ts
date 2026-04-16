import type { InferUITool, ModelMessage, Tool, UIMessage } from 'ai';

/** A plain record of tools. */
type ToolRecord = Record<string, Tool>;

/** Supported message types for activation callbacks. */
type MessageType = UIMessage | ModelMessage;

/** The fully-typed UIMessage for a given tool record. */
type InferUIMessage<TOOLS extends ToolRecord> = UIMessage<unknown, any, InferUIToolSet<TOOLS>>;

/** Infer the raw tool record from a ToolRecord or ToolSet instance. */
export type InferToolSet<T extends ToolRecord | AnyToolSet> =
  T extends ImmutableToolSet<infer TOOLS, any, any>
    ? TOOLS
    : T extends MutableToolSet<infer TOOLS, any, any>
      ? TOOLS
      : T;

/** Infer the UI tool types from a tool record or ToolSet instance. */
export type InferUIToolSet<T extends ToolRecord | AnyToolSet> = {
  [K in keyof InferToolSet<T> & string]: InferUITool<InferToolSet<T>[K]>;
};

/**
 * Extract tool names tracked as active from an ImmutableToolSet instance.
 * Returns `never` for MutableToolSet (cannot be determined at compile time).
 */
export type InferActiveTools<T extends AnyToolSet> =
  T extends ImmutableToolSet<any, any, any, infer A, any> ? A : never;

/**
 * Extract tool names tracked as inactive from an ImmutableToolSet instance.
 * Returns `never` for MutableToolSet (cannot be determined at compile time).
 */
export type InferInactiveTools<T extends AnyToolSet> =
  T extends ImmutableToolSet<any, any, any, any, infer D> ? D : never;

/**
 * Input passed to activation predicates.
 * Use `ActivationInput<MyMsg>` to get per-tool narrowing in callbacks.
 */
export type ActivationInput<
  MESSAGE extends MessageType = UIMessage,
  CONTEXT extends Record<string, unknown> = Record<string, unknown>,
> = {
  messages?: Array<MESSAGE>;
  context?: CONTEXT;
};

/** Activation predicate — returns true if tool should be active. Undefined is treated as false. */
type ActivationPredicate<
  MESSAGE extends MessageType = UIMessage,
  CONTEXT extends Record<string, unknown> = Record<string, unknown>,
> = (input: ActivationInput<MESSAGE, CONTEXT>) => boolean | undefined;

type ActivationEntry = {
  toolName: string;
  resolve: (input: ActivationInput<any, any>) => boolean | undefined;
};

/** Resolved tools and active tool names returned by `inferTools()`. */
type ResolvedToolSet<TOOLS extends ToolRecord> = {
  tools: TOOLS;
  activeTools: Array<keyof TOOLS & string>;
};

/** Union of both toolset classes for type utility constraints. */
type AnyToolSet = ImmutableToolSet<any> | MutableToolSet<any>;

/* ------------------------------------------------------------------ */
/*  ToolSetState                                                       */
/* ------------------------------------------------------------------ */

const toEntries = (
  nameOrPredicates: string | Partial<Record<string, ActivationPredicate<any, any>>>,
  predicate?: ActivationPredicate<any, any>,
): Array<ActivationEntry> => {
  if (typeof nameOrPredicates === 'string') {
    return [{ toolName: nameOrPredicates, resolve: predicate! }];
  }
  return Object.entries(nameOrPredicates)
    .filter(([, pred]) => pred != null)
    .map(([name, pred]) => ({ toolName: name, resolve: pred! }));
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

  constructor(tools: TOOLS, entries: Array<ActivationEntry>) {
    this.#tools = tools;
    this.#entries = entries;
  }

  /** All tools as a standard AI SDK tool record. */
  get tools(): TOOLS {
    return this.#tools;
  }

  activate(names: Array<string>): ToolSetState<TOOLS, MESSAGE, CONTEXT> {
    const newEntries = names.map((name) => ({ toolName: name, resolve: () => true }));
    return new ToolSetState(this.#tools, [...this.#entries, ...newEntries]);
  }

  deactivate(names: Array<string>): ToolSetState<TOOLS, MESSAGE, CONTEXT> {
    const newEntries = names.map((name) => ({ toolName: name, resolve: () => false }));
    return new ToolSetState(this.#tools, [...this.#entries, ...newEntries]);
  }

  activateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<MESSAGE, CONTEXT>>>,
    predicate?: ActivationPredicate<MESSAGE, CONTEXT>,
  ): ToolSetState<TOOLS, MESSAGE, CONTEXT> {
    return new ToolSetState(this.#tools, [...this.#entries, ...toEntries(nameOrPredicates, predicate)]);
  }

  deactivateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<MESSAGE, CONTEXT>>>,
    predicate?: ActivationPredicate<MESSAGE, CONTEXT>,
  ): ToolSetState<TOOLS, MESSAGE, CONTEXT> {
    const newEntries = toEntries(nameOrPredicates, predicate).map((e) => ({
      ...e,
      resolve: (input: ActivationInput<any, any>) => !e.resolve(input),
    }));
    return new ToolSetState(this.#tools, [...this.#entries, ...newEntries]);
  }

  /** Evaluate all predicates with the provided input and return resolved tools + activeTools. */
  inferTools(input?: ActivationInput<MESSAGE, CONTEXT>): ResolvedToolSet<TOOLS> {
    const allNames = Object.keys(this.#tools) as Array<keyof TOOLS & string>;
    const activeTools = allNames.filter((name) => {
      const lastEntry = this.#entries.findLast((e) => e.toolName === name);
      if (!lastEntry) return true;
      return lastEntry.resolve(input ?? {});
    });
    return { tools: this.#tools, activeTools };
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
    predicate: ActivationPredicate<MESSAGE, CONTEXT>,
  ): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, Exclude<ACTIVATED, NAME>, DEACTIVATED | NAME>;
  activateWhen<NAMES extends keyof TOOLS & string>(
    predicates: Partial<Record<NAMES, ActivationPredicate<MESSAGE, CONTEXT>>>,
  ): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, Exclude<ACTIVATED, NAMES>, DEACTIVATED | NAMES>;
  activateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<MESSAGE, CONTEXT>>>,
    predicate?: ActivationPredicate<MESSAGE, CONTEXT>,
  ): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, ACTIVATED, DEACTIVATED> {
    return new ImmutableToolSet(this.#state.activateWhen(nameOrPredicates, predicate));
  }

  /**
   * Conditionally deactivate a tool — active by default, becomes inactive when predicate returns true.
   * Tracks names in ACTIVATED since the tool starts active.
   */
  deactivateWhen<NAME extends keyof TOOLS & string>(
    name: NAME,
    predicate: ActivationPredicate<MESSAGE, CONTEXT>,
  ): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, ACTIVATED | NAME, Exclude<DEACTIVATED, NAME>>;
  deactivateWhen<NAMES extends keyof TOOLS & string>(
    predicates: Partial<Record<NAMES, ActivationPredicate<MESSAGE, CONTEXT>>>,
  ): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, ACTIVATED | NAMES, Exclude<DEACTIVATED, NAMES>>;
  deactivateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<MESSAGE, CONTEXT>>>,
    predicate?: ActivationPredicate<MESSAGE, CONTEXT>,
  ): ImmutableToolSet<TOOLS, MESSAGE, CONTEXT, ACTIVATED, DEACTIVATED> {
    return new ImmutableToolSet(this.#state.deactivateWhen(nameOrPredicates, predicate));
  }

  /** Evaluate all predicates with the provided input. Returns resolved `{ tools, activeTools }`. */
  inferTools(input?: ActivationInput<MESSAGE, CONTEXT>): ResolvedToolSet<TOOLS> {
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
  activateWhen(name: keyof TOOLS & string, predicate: ActivationPredicate<MESSAGE, CONTEXT>): this;
  activateWhen(predicates: Partial<Record<keyof TOOLS & string, ActivationPredicate<MESSAGE, CONTEXT>>>): this;
  activateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<MESSAGE, CONTEXT>>>,
    predicate?: ActivationPredicate<MESSAGE, CONTEXT>,
  ): this {
    this.#state = this.#state.activateWhen(nameOrPredicates, predicate);
    return this;
  }

  /**
   * Conditionally deactivate a tool — active by default, becomes inactive when predicate returns true.
   */
  deactivateWhen(name: keyof TOOLS & string, predicate: ActivationPredicate<MESSAGE, CONTEXT>): this;
  deactivateWhen(predicates: Partial<Record<keyof TOOLS & string, ActivationPredicate<MESSAGE, CONTEXT>>>): this;
  deactivateWhen(
    nameOrPredicates: string | Partial<Record<string, ActivationPredicate<MESSAGE, CONTEXT>>>,
    predicate?: ActivationPredicate<MESSAGE, CONTEXT>,
  ): this {
    this.#state = this.#state.deactivateWhen(nameOrPredicates, predicate);
    return this;
  }

  /** Evaluate all predicates with the provided input. Returns resolved `{ tools, activeTools }`. */
  inferTools(input?: ActivationInput<MESSAGE, CONTEXT>): ResolvedToolSet<TOOLS> {
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
  const state = new ToolSetState(options.tools, []);
  return options.mutable ? new MutableToolSet(state) : new ImmutableToolSet(state);
}
