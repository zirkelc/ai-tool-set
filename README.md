<div align='center'>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.png" />
  <img src="assets/logo-light.png" alt="ai-tool-set logo" width="400" />
</picture>

<p align="center">Conditional tool activation for the AI SDK, fully type-safe</p>
<p align="center">
  <a href="https://www.npmjs.com/package/ai-tool-set" alt="ai-tool-set"><img src="https://img.shields.io/npm/dt/ai-tool-set?label=ai-tool-set"></a> <a href="https://github.com/zirkelc/ai-tool-set/actions/workflows/ci.yml" alt="CI"><img src="https://img.shields.io/github/actions/workflow/status/zirkelc/ai-tool-set/ci.yml?branch=main"></a>
</p>

</div>

This library provides a type-safe API to manage [`activeTools`](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text#active-tools) and [`toolChoice`](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#tool-choice) for [`generateText()`](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text) and [`streamText()`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) in the AI SDK.

### Why?

The AI SDK provides an `activeTools` parameter to control which tools the model can use, and a `toolChoice` parameter to force which tool is called. However, managing this becomes complex when you need to:

- **Statically activate/deactivate tools**: Some tools should be inactive by default and only available after being explicitly activated
- **Dynamically infer tool activation**: Some tools should be activated based on runtime context like the conversation history
- **Force tool choice**: Sometimes the model should be required to call a specific tool, or any tool, based on context

This library wraps standard AI SDK `tool()` definitions with chainable activation and choice methods and resolves `tools`, `activeTools`, and `toolChoice` for any AI SDK function.

### Installation

```bash
npm install ai-tool-set
```

## Usage

### Creating a Tool Set

Pass a plain record of AI SDK `tool()` definitions to `createToolSet()`. All tools are active by default.

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { createToolSet } from 'ai-tool-set';

const tools = {
  search: tool({
    description: 'Search for products',
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => searchProducts(query),
  }),
  list_orders: tool({
    description: 'List orders for a customer',
    inputSchema: z.object({ customerId: z.string() }),
    execute: async ({ customerId }) => listOrders(customerId),
  }),
  cancel_order: tool({
    description: 'Cancel an order',
    inputSchema: z.object({ orderId: z.string() }),
    execute: async ({ orderId }) => cancelOrder(orderId),
  }),
};

const toolSet = createToolSet({ tools });
```

### Activate and Deactivate Tools

Use `.activate()` and `.deactivate()` to statically control which tools are available. Call `.inferTools()` to resolve `activeTools` and pass into `generateText()` or `streamText()`:

```typescript
import { generateText } from 'ai';

// Activate and deactivate tools
const toolSet = createToolSet({ tools }).deactivate(['cancel_order']).activate(['list_orders']);

// Infer active tools
const { tools, activeTools } = toolSet.inferTools();

const result = await generateText({
  model,
  // Pass tools and activeTools:
  tools,
  activeTools,
  // Or spread directly:
  // ...toolSet.deactivate(['cancel_order']).activate(['list_orders']).inferTools(),
  prompt: 'Show me my orders',
});
```

### Conditional Activation

Use `.activateWhen()` and `.deactivateWhen()` to conditionally control tools based on messages, step history, and context. The predicate receives an input with `messages`, `steps`, and `context` (all can be `undefined` if not provided to `inferTools`) and should return a boolean (or undefined) to determine whether the tool should be activated/deactivated.

```typescript
const toolSet = createToolSet({ tools })
  // context: activate list_orders for authenticated users
  .activateWhen('list_orders', ({ context }) => context?.isAuthenticated)
  // messages: activate cancel_order when the conversation has unfulfilled orders
  .activateWhen('cancel_order', ({ messages }) =>
    messages?.some((m) =>
      m.parts.some(
        (p) =>
          p.type === 'tool-list_orders' &&
          p.state === 'output-available' &&
          p.output.orders?.some((order) => order.status !== 'fulfilled'),
      ),
    ),
  )
  // steps: deactivate search once it has been called in this run
  .deactivateWhen('search', ({ steps }) =>
    steps?.some((s) => s.staticToolCalls.some((c) => c.toolName === 'search')),
  );
```

You can also activate or deactivate multiple tools at once using the object form:

```typescript
const toolSet = createToolSet({ tools })
  .activateWhen({
    list_orders: ({ context }) => { /* ... */ },
    cancel_order: ({ messages }) => { /* ... */ },
  })
  .deactivateWhen({
    search: ({ steps }) => { /* ... */ },
  });
```

Call `.inferTools()` with `messages` and/or `context` to evaluate activation predicates and resolve `activeTools`:

```typescript
const messages = [
  {
    role: 'user',
    parts: [{ type: 'text', text: 'Show me my orders' }],
  },
  {
    role: 'assistant',
    parts: [
      {
        type: 'tool-list_orders',
        state: 'output-available',
        toolCallId: 'call-1',
        input: { customerId: 'cust-123' },
        output: {
          orders: [
            { orderId: '1000', status: 'fulfilled' },
            { orderId: '1001', status: 'pending' },
          ],
        },
      },
    ],
  },
];

const context = { isAuthenticated: true };

// cancel_order is now active because list_orders returned unfulfilled orders
const { tools, activeTools } = toolSet.inferTools({ messages, context });

const result = await generateText({ model, tools, activeTools, messages });
```

In a multi-step run, you can call `.inferTools()` inside `prepareStep()` to re-evaluate active tools after each step. Here you also have access to the `steps` array, which contains the completed steps of the current run:

```typescript
import { generateText, stepCountIs } from 'ai';

const { tools } = toolSet;

const result = await generateText({
  model,
  tools,
  stopWhen: stepCountIs(10),
  prompt: 'Find my orders and cancel the unfulfilled one',
  prepareStep: ({ steps }) => {
    // Resolve activeTools from the steps completed so far
    const { activeTools } = toolSet.inferTools({ steps });
    return { activeTools };
  },
});
```

### Activation Defaults

`.activateWhen()` marks a tool as **inactive by default**. It only becomes active when the predicate returns `true`. If the predicate returns `undefined` or `false`, the tool stays inactive:

```typescript
const toolSet = createToolSet({ tools })
  // undefined when messages is not provided → tool stays inactive
  // false when no orders found → tool stays inactive
  // true when orders found → tool becomes active
  .activateWhen('cancel_order', ({ messages }) => messages?.some((m) => hasOrders(m)));

toolSet.inferTools().activeTools; // cancel_order is inactive (predicate received undefined)
toolSet.inferTools({ messages: [] }).activeTools; // cancel_order is inactive (no orders)
```

`.deactivateWhen()` marks a tool as **active by default**. It only becomes inactive when the predicate returns `true`. If the predicate returns `undefined` or `false`, the tool stays active:

```typescript
const toolSet = createToolSet({ tools })
  // undefined when messages is not provided → tool stays active
  // false when few messages → tool stays active
  // true when too many messages → tool becomes inactive
  .deactivateWhen('search', ({ messages }) => messages && messages.length > 10);

toolSet.inferTools().activeTools; // search is active (predicate received undefined)
toolSet.inferTools({ messages: [] }).activeTools; // search is active (few messages)
```

### Last-Call Wins

Each activation method appends to an internal list. For each tool, the **last entry** determines its state. This makes ordering explicit and predictable:

```typescript
const toolSet = createToolSet({ tools })
  // cancel_order: activated
  .activate(['cancel_order'])
  // cancel_order: deactivated
  .deactivate(['cancel_order'])
  // cancel_order: deactivated with conditional activation
  .activateWhen('cancel_order', ({ messages }) => hasUnfulfilledOrders(messages));
```

### Tool Choice

The AI SDK can steer tool calls with [`toolChoice`](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#tool-choice), which controls whether and which tool the model must call. `.inferTools()` resolves a `toolChoice` value alongside `tools` and `activeTools`, so a single tool set drives activation and choice together.

Use `.choice()` with a constant for static choices or use a resolver to decide dynamically:

```typescript
const toolSet = createToolSet({ tools })
  .deactivate(['cancel_order'])
  // Force the model to call one of the active tools this turn
  .choice('required')
  // Or resolve dynamically, e.g. force unauthenticated users into search
  .choice(({ context }) => (context?.isAuthenticated ? 'auto' : { type: 'tool', toolName: 'search' }));

const { tools, activeTools, toolChoice } = toolSet.inferTools();

const result = await generateText({ model, tools, activeTools, toolChoice, prompt: 'Show me my orders' });
```

A `.choice()` entry is either a constant [`ToolChoice`](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#tool-choice) (`'auto'`, `'required'`, `'none'`, or `{ type: 'tool', toolName }` with `toolName` typed to your tools) or a **resolver**. The resolver runs inside `.inferTools()` with your toolset values (`{ messages, steps, context }`) and returns a `ToolChoice`, or `undefined` to leave the choice unconstrained (the AI SDK then defaults to `'auto'`). Since it sets a single value, it follows the same **last-call wins** rule as activation: the last entry decides, and a resolver returning `undefined` does not fall back to an earlier one, so express any fallback inside the resolver itself.

> [!NOTE]
> `toolChoice` is resolved independently of `activeTools` and passed through as-is. Because the AI SDK filters tools by `activeTools` first, forcing `{ type: 'tool', toolName }` for a tool you have deactivated leaves the model unable to see it and surfaces as a provider error, so keep a forced tool active.

Resolving from `steps` makes it easy to guide a multi-step run. Call `.inferTools()` inside `prepareStep()` to recompute `toolChoice` (and `activeTools`) after each step, for example to force a tool on the first step and then hand control back to the model:

```typescript
import { generateText, stepCountIs } from 'ai';

const toolSet = createToolSet({ tools }).choice(({ steps }) =>
  steps?.length === 0 ? { type: 'tool', toolName: 'search' } : 'auto',
);

const { tools } = toolSet;

const result = await generateText({
  model,
  tools,
  stopWhen: stepCountIs(10),
  prompt: 'Find my orders and cancel the unfulfilled one',
  prepareStep: ({ steps }) => toolSet.inferTools({ steps }),
});
```

### Stable Tool Order

The AI SDK sends tools to the provider in the **insertion order** of the `tools` record, filtered by `activeTools`. When you toggle tools with [conditional activation](#conditional-activation), a dynamic tool in the middle of the record shifts every tool after it as it flips on and off, which can invalidate the provider's prompt cache for the tool block.

`ai-tool-set` resolves this into a stable order for you. **By default it uses `'stable'`**: always-active (static) tools stay in a fixed prefix and conditionally-activated (dynamic) tools sort to the tail, so the static prefix stays byte-identical as the dynamic tools toggle. AI SDK v6 has no `toolOrder` parameter, so `.inferTools()` re-creates the `tools` record in the resolved order (returning the original record reference unchanged when the order is a no-op). Spread the whole result so the reordered `tools` reaches the provider:

```typescript
// Stable tool ordering is default when omitted
const toolSet = createToolSet({ tools, order: 'stable' })
  // list_orders drops out once it has been called this run
  .deactivateWhen('list_orders', ({ steps }) =>
    steps?.some((s) => s.staticToolCalls.some((c) => c.toolName === 'list_orders')),
  );

const result = await generateText({ model, ...toolSet.inferTools(), prompt: 'List my orders' });
```

In a multi-step run, spread the reordered record once at the top level, then recompute `activeTools` per step inside `prepareStep()`. The order depends on the activation config, not on runtime input, so the reordered record is stable across steps and the static prefix never shifts:

```typescript
import { generateText, stepCountIs } from 'ai';

// Re-created once: static tools first, dynamic tools to the tail
const { tools } = toolSet.inferTools();

const result = await generateText({
  model,
  tools,
  stopWhen: stepCountIs(10),
  prepareStep: ({ steps }) => {
    // activeTools recomputed per step; the reordered record keeps the static prefix stable
    const { activeTools } = toolSet.inferTools({ steps });
    return { activeTools };
  },
});
```

Use the `order` parameter of `createToolSet()` or the `.order()` method to change the tool order strategy:

- `'stable'` (default), static tools first, conditionally-activated tools to the tail
- `'insertion'`, as declared in the `tools` record (no reordering — the original record reference is returned)
- `Array<string>`, an explicit order; names not listed keep insertion order after the listed ones
- a comparator `(a, b) => number` over `{ toolName, tool, dynamic, index }`

Ordering follows **last-call wins**:

```typescript
const toolSet = createToolSet({ tools, order: 'insertion' }); // opt out — keep the declared order

toolSet.order(['search', 'get_weather']); // pin a few, the rest follow insertion order
toolSet.order((a, b) => a.toolName.localeCompare(b.toolName)); // comparator over { toolName, tool, dynamic, index }
```

### Immutable vs Mutable

By default, `createToolSet()` returns an **immutable** tool set, that means every method returns a new instance and the original is never modified. This is ideal when the tool set is created once in the global scope and shared across requests:

```typescript
// Global scope: created once, shared across requests
const toolSet = createToolSet({ tools }).deactivate(['list_order', 'cancel_order']);

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Activate list_orders only for this request
  // myToolSet !== toolSet, original toolSet is unchanged for next request
  const myToolSet = toolSet.activate(['list_orders']);

  const result = await generateText({
    model,
    ...myToolSet.inferTools({ messages }),
    messages,
  });
}
```

Use `createToolSet({ mutable: true })` to get a **mutable** tool set where each method mutates in-place and returns `this` for chaining. This is useful when the tool set is created per-request in a local scope:

```typescript
export async function POST(req: Request) {
  const { messages } = await req.json();

  // Local scope: created and mutated per request
  const toolSet = createToolSet({ tools, mutable: true })
    .deactivate(['list_order', 'cancel_order'])
    .activate(['list_orders']);

  const result = await generateText({
    model,
    ...toolSet.inferTools({ messages }),
    messages,
  });
}
```

### Cloning

Use `.clone({ mutable?: boolean })` to convert between immutable and mutable, preserving all activation entries:

```typescript
// Convert an immutable toolset to mutable
const mutableToolSet = toolSet.clone({ mutable: true });

// Convert a mutable toolset back to immutable
const immutableToolSet = mutableToolSet.clone();
```

This is useful when you want to create a base tool set in the global scope and clone it per request to add request-specific activation:

```typescript
// Global scope: base tool set
const baseToolSet = createToolSet({ tools }).deactivate(['list_order', 'cancel_order']);

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Clone the base tool set into a mutable instance for this request
  const toolSet = baseToolSet.clone({ mutable: true });

  // Activate list_orders only for this request
  toolSet.activate(['list_orders']);

  const result = await generateText({
    model,
    ...toolSet.inferTools({ messages }),
    messages,
  });
}
```

### Typed UI Tool Set

Use `InferUIToolSet` to get fully typed UI messages from your tool set:

```typescript
import type { UIMessage } from 'ai';
import type { InferUIToolSet } from 'ai-tool-set';

const tools = { search, list_orders, cancel_order };
const toolSet = createToolSet({ tools });

// From the tools record
type MyToolSet = InferUIToolSet<typeof tools>;

// Or from the ToolSet instance
type MyToolSet = InferUIToolSet<typeof toolSet>;

// Use MyToolSet in your UIMessage type for type-safe access to tool invocation parts:
type MyUIMessage = UIMessage<unknown, any, MyToolSet>;
```

### Custom UIMessage

If you already have a custom `UIMessage` type, you can pass it as `MESSAGE` generic to `createToolSet()` and it will be used in predicates and `inferTools`:

```typescript
import { myTools } from './my-tools.js';
import { MyUIMessage } from './my-ui-message.js';

const toolSet = createToolSet<typeof myTools, MyUIMessage>({ tools: myTools }).activateWhen(
  'cancel_order',
  ({ messages }) => hasUnfulfilledOrders(messages),
  // ~~~~~~~~
  // Messages are now typed as Array<MyUIMessage> | undefined
);

const { tools, activeTools } = toolSet.inferTools({ messages });
```

### Custom Context

Pass a `CONTEXT` generic to `createToolSet()` to type the `context` field in predicates and `inferTools`:

```typescript
import { myTools } from './my-tools.js';
import { MyUIMessage } from './my-ui-message.js';

type MyContext = { userId: string; isAdmin: boolean };

const toolSet = createToolSet<typeof myTools, MyUIMessage, MyContext>({ tools: myTools }).activateWhen(
  'cancel_order',
  ({ context }) => context?.isAdmin,
  // ~~~~~~~
  // Context is typed as MyContext | undefined
);

const { tools, activeTools } = toolSet.inferTools({
  messages,
  context: { userId: '1', isAdmin: true },
});
```

## API

## `createToolSet(options)`

- `options.tools`, a plain `Record<string, Tool>` of AI SDK tools
- `options.mutable` (optional), set to `true` for a mutable tool set (default: `false`)
- `options.order` (optional), the ordering strategy that reorders the resolved `tools` record (default: `'stable'`), see [`.order(order)`](#orderorder)

Returns a `ToolSet` instance. All tools are active by default.

```ts
const toolSet = createToolSet({ tools: { search, list_orders, cancel_order } });

// Mutable mode — methods mutate in-place and return `this`
const toolSet = createToolSet({ tools: { search, list_orders, cancel_order }, mutable: true });
```

#### `.tools`

All tools as a standard AI SDK tool record, regardless of activation state.

```ts
const { tools } = toolSet;
```

#### `.activate(names)`

Statically activate tools by name. Returns a new instance (immutable) or `this` (mutable).

```ts
toolSet.activate(['cancel_order']);
```

#### `.deactivate(names)`

Statically deactivate tools by name. Returns a new instance (immutable) or `this` (mutable).

```ts
toolSet.deactivate(['search']);
```

#### `.activateWhen(name, predicate)` / `.activateWhen(predicates)`

Conditionally activate tools. The predicate receives `{ messages, steps, context }` and returns `true` to activate. All fields can be `undefined` if not provided to `inferTools`. Returning `undefined` is treated as `false`.

```ts
toolSet.activateWhen('cancel_order', ({ messages }) => messages?.some((m) => hasOrders(m)));

toolSet.activateWhen({
  cancel_order: ({ messages }) => messages?.some((m) => hasOrders(m)),
  list_orders: ({ context }) => context?.isAuthenticated,
});
```

#### `.deactivateWhen(name, predicate)` / `.deactivateWhen(predicates)`

Conditionally deactivate tools. The predicate receives `{ messages, steps, context }` and returns `true` to deactivate. All fields can be `undefined` if not provided to `inferTools`. Returning `undefined` is treated as `false` (tool stays active).

```ts
toolSet.deactivateWhen('search', ({ messages }) => messages && messages.length > 10);
```

#### `.choice(entry)`

Set the toolset's `toolChoice` to a constant `ToolChoice` (`'auto'`, `'none'`, `'required'`, or `{ type: 'tool', toolName }`) or a resolver. A resolver receives `{ messages, steps, context }` and returns a `ToolChoice`, or `undefined` to leave it unconstrained (omitted). Last-call wins. The resolved `toolChoice` is passed through as-is; keep a forced tool active so the AI SDK does not filter it out.

```ts
// Constant
toolSet.choice('required');
toolSet.choice({ type: 'tool', toolName: 'search' });

// Resolver — force a tool on the first step, then let the model decide
toolSet.choice(({ steps }) => (steps?.length === 0 ? { type: 'tool', toolName: 'search' } : 'auto'));
```

#### `.order(order)`

Set how tools are ordered for the provider. AI SDK v6 has no `toolOrder` parameter, so `.inferTools()` re-creates the `tools` record in the resolved order (the provider renders tools in the record's own key order). When the order is unchanged, the original record reference is returned as-is. Returns a new instance (immutable) or `this` (mutable). Last-call wins. `order` is one of:

- `'stable'` (default), static tools first (in insertion order), conditionally-activated tools to the tail — keeps the prompt's static tool prefix stable for provider prompt caching
- `'insertion'`, as declared in the `tools` record (no reordering)
- `Array<string>`, an explicit order; names not listed keep insertion order after the listed ones
- a comparator `(a, b) => number` over `{ toolName, tool, dynamic, index }`, matching `Array.prototype.sort`

```ts
toolSet.order('stable');
toolSet.order(['search', 'get_weather']);
toolSet.order((a, b) => a.toolName.localeCompare(b.toolName));
```

#### `.inferTools(input?)`

Evaluate all predicates and the tool-choice entry and return `{ tools, activeTools, toolChoice }`, directly spreadable into `generateText()` or `streamText()`. The `tools` record is re-created in the resolved order (see [`.order(order)`](#orderorder)). The input is optional; all fields are optional. Predicates and resolvers receive `undefined` for fields not provided.

- `input` (optional):
  - `messages` (optional), the current conversation messages
  - `steps` (optional), the completed steps of the current run (the `StepResult` array from `prepareStep`)
  - `context` (optional), arbitrary values passed to predicates and the tool-choice resolver

The result also includes `toolChoice` when set via `.choice()` (otherwise `undefined`).

```ts
// Static-only (no predicates)
const { tools, activeTools, toolChoice } = toolSet.inferTools();

// With messages
const { tools, activeTools, toolChoice } = toolSet.inferTools({ messages });

// With context
const { tools, activeTools, toolChoice } = toolSet.inferTools({ context: { isAdmin: true } });

// With steps (e.g. inside prepareStep)
const { tools, activeTools, toolChoice } = toolSet.inferTools({ steps });

// With both
const { tools, activeTools, toolChoice } = toolSet.inferTools({ messages, context });

const result = await generateText({ model, tools, activeTools, toolChoice, messages });
```

#### `.clone(options?)`

Clone the toolset, preserving all activation entries. Pass `{ mutable: true }` to get a mutable clone, or omit for an immutable clone. Defaults to immutable.

```ts
const mutableClone = toolSet.clone({ mutable: true });
const immutableClone = toolSet.clone();
```

## Types

### `ActivationInput`

Input passed to activation predicates. Generic over `TOOLS`, `MESSAGE`, and `CONTEXT`. All fields are optional since they may not be provided to `inferTools`. `steps` is inferred from `TOOLS`:

```ts
import type { ActivationInput } from 'ai-tool-set';

type MyInput = ActivationInput<typeof tools, MyUIMessage, { isAdmin: boolean }>;
// { messages?: Array<MyUIMessage>; steps?: Array<StepResult<typeof tools>>; context?: { isAdmin: boolean } }
```

### `ToolSet`

Parameter type that accepts both immutable and mutable variants of an existing tool set. Use it for helpers that should work regardless of which flavor the caller is holding:

```ts
import { createToolSet, type ToolSet } from 'ai-tool-set';

const toolSet = createToolSet({ tools }).deactivate(['cancel_order']);

type MyToolSet = ToolSet<typeof toolSet>;

// Accepts the immutable toolset AND the cloned mutable instance
function activateTools(toolSet: MyToolSet) {
  toolSet.activate(['cancel_order']);
}

activateTools(toolSet);

const mutableToolSet = toolSet.clone({ mutable: true });
activateTools(mutableToolSet);
```

### `InferToolSet`

Extract the raw tool record from a tool record or `ToolSet` instance:

```ts
import type { InferToolSet } from 'ai-tool-set';

type Tools = InferToolSet<typeof toolSet>;
// { search: Tool<...>, list_orders: Tool<...>, cancel_order: Tool<...> }
```

### `InferUIToolSet`

Derive typed UI tool parts from a tool record or `ToolSet` instance. Use with `UIMessage` for type-safe access to tool invocation parts:

```ts
import type { UIMessage } from 'ai';
import type { InferUIToolSet } from 'ai-tool-set';

type MyUIMessage = UIMessage<unknown, any, InferUIToolSet<typeof toolSet>>;

// Parts are now typed per tool:
// message.parts[0].type === 'tool-search'
// message.parts[0].output // typed as search tool's return type
```

### `InferActiveTools`

Extract the tool names tracked as active from an immutable `ToolSet` instance. Tracks tools from `.activate()` and `.deactivateWhen()`.

> [!NOTE]
> `InferActiveTools` returns `never` for mutable toolsets, since TypeScript cannot track type changes on the same reference across method calls.

```ts
import type { InferActiveTools } from 'ai-tool-set';

const toolSet = createToolSet({ tools }).deactivate(['cancel_order']);

type Active = InferActiveTools<typeof toolSet>;
// 'search' | 'list_orders'
```

### `InferInactiveTools`

Extract the tool names tracked as inactive from an immutable `ToolSet` instance. Tracks tools from `.deactivate()` and `.activateWhen()`.

> [!NOTE]
> `InferInactiveTools` returns `never` for mutable toolsets, since TypeScript cannot track type changes on the same reference across method calls.

```ts
import type { InferInactiveTools } from 'ai-tool-set';

const toolSet = createToolSet({ tools }).deactivate(['cancel_order']);

type Inactive = InferInactiveTools<typeof toolSet>;
// 'cancel_order'
```

### `InferAllTools`

Extract all tool names from a `ToolSet` instance, regardless of activation state. Works for both immutable and mutable toolsets since the tool record is statically known.

```ts
import type { InferAllTools } from 'ai-tool-set';

const toolSet = createToolSet({ tools }).deactivate(['cancel_order']);

type All = InferAllTools<typeof toolSet>;
// 'search' | 'list_orders' | 'cancel_order'
```

## License

MIT
