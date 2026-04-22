<div align='center'>

# ai-tool-set

<p align="center">Conditional tool activation for the AI SDK, fully type-safe</p>
<p align="center">
  <a href="https://www.npmjs.com/package/ai-tool-set" alt="ai-tool-set"><img src="https://img.shields.io/npm/dt/ai-tool-set?label=ai-tool-set"></a> <a href="https://github.com/zirkelc/ai-tool-set/actions/workflows/ci.yml" alt="CI"><img src="https://img.shields.io/github/actions/workflow/status/zirkelc/ai-tool-set/ci.yml?branch=main"></a>
</p>

</div>

This library provides a type-safe API to manage [`activeTools`](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text#active-tools) for [`generateText()`](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text) and [`streamText()`](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text) in the AI SDK.

### Why?

The AI SDK provides an `activeTools` parameter to control which tools the model can use at any given time. However, managing tool activation becomes complex when you need to:

- **Statically activate/deactivate tools**: Some tools should be inactive by default and only available after being explicitly activated
- **Dynamically infer tool activation**: Some tools should be activated based on runtime context like the conversation history

This library wraps standard AI SDK `tool()` definitions with chainable activation methods and resolves `tools` and `activeTools` for any AI SDK function.

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
const toolSet = createToolSet({ tools })
  .deactivate(['cancel_order'])
  .activate(['list_orders']);

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

Use `.activateWhen()` and `.deactivateWhen()` to conditionally control tools based on messages and context. The predicate receives an input with `messages` and `context` (both can be `undefined` if not provided to `inferTools`) and should return a boolean (or undefined) to determine whether the tool should be activated/deactivated.

```typescript
// Conditional activation with a predicate that checks for unfulfilled orders in the messages
const toolSet = createToolSet({ tools })
  .activateWhen('list_orders', ({ context }) => context?.isAuthenticated)
  .activateWhen('cancel_order', ({ messages }) =>
    messages?.some((m) =>
      m.parts.some(
        (p) =>
          p.type === 'tool-list_orders' &&
          p.state === 'output-available' &&
          p.output.orders?.some((order) => order.status !== 'fulfilled'),
      ),
    ),
  );
```

Call `.inferTools()` with messages and/or context to evaluate activation predicates and resolve `activeTools`:

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

You can also activate multiple tools at once:

```typescript
const toolSet = createToolSet({ tools })
  .activateWhen({
    list_orders: ({ context }) => context?.isAuthenticated,
    cancel_order: ({ messages }) => hasUnfulfilledOrders(messages),
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

const toolSet = createToolSet<typeof myTools, MyUIMessage>({ tools: myTools })
  .activateWhen(
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

const toolSet = createToolSet<typeof myTools, MyUIMessage, MyContext>({ tools: myTools })
  .activateWhen(
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

Conditionally activate tools. The predicate receives `{ messages, context }` and returns `true` to activate. Both `messages` and `context` can be `undefined` if not provided to `inferTools`. Returning `undefined` is treated as `false`.

```ts
toolSet.activateWhen('cancel_order', ({ messages }) => messages?.some((m) => hasOrders(m)));

toolSet.activateWhen({
  cancel_order: ({ messages }) => messages?.some((m) => hasOrders(m)),
  list_orders: ({ context }) => context?.isAuthenticated,
});
```

#### `.deactivateWhen(name, predicate)` / `.deactivateWhen(predicates)`

Conditionally deactivate tools. The predicate receives `{ messages, context }` and returns `true` to deactivate. Both `messages` and `context` can be `undefined` if not provided to `inferTools`. Returning `undefined` is treated as `false` (tool stays active).

```ts
toolSet.deactivateWhen('search', ({ messages }) => messages && messages.length > 10);
```

#### `.inferTools(input?)`

Evaluate all predicates and return `{ tools, activeTools }`, directly spreadable into `generateText()` or `streamText()`. The input is optional; all fields are optional. Predicates receive `undefined` for fields not provided.

- `input` (optional):
  - `messages` (optional), the current conversation messages
  - `context` (optional), arbitrary values passed to predicates

```ts
// Static-only (no predicates)
const { tools, activeTools } = toolSet.inferTools();

// With messages
const { tools, activeTools } = toolSet.inferTools({ messages });

// With context
const { tools, activeTools } = toolSet.inferTools({ context: { isAdmin: true } });

// With both
const { tools, activeTools } = toolSet.inferTools({ messages, context });

const result = await generateText({ model, tools, activeTools, messages });
```

#### `.clone(options?)`

Clone the toolset, preserving all activation entries. Pass `{ mutable: true }` to get a mutable clone, or omit for an immutable clone. Defaults to immutable.

```ts
const mutableClone = toolSet.clone({ mutable: true });
const immutableClone = toolSet.clone();
```

## Types

### `ActivationInput`

Input passed to activation predicates. Generic over `MESSAGE` and `CONTEXT`. Both `messages` and `context` are optional since they may not be provided to `inferTools`:

```ts
import type { ActivationInput } from 'ai-tool-set';

type MyInput = ActivationInput<MyUIMessage, { isAdmin: boolean }>;
// { messages?: Array<MyUIMessage>; context?: { isAdmin: boolean } }
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

## License

MIT
