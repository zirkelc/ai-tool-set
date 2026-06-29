/**
 * Type-safe active / inactive tool names.
 *
 * A tool set tracks, at the type level, which tools end up active vs inactive
 * based on the static `.activate()`/`.deactivate()` and conditional
 * `.activateWhen()`/`.deactivateWhen()` calls you chain. The `Infer*` helpers
 * read that back out as string-literal unions:
 *
 * - `InferActiveTools`   — tools from `.activate()` and `.deactivateWhen()`
 * - `InferInactiveTools` — tools from `.deactivate()` and `.activateWhen()`
 * - `InferAllTools`      — every tool name, regardless of state
 *
 * At runtime the same predicates resolve against `toolSetContext`, and only the
 * active tools are passed to the model — shown here with ai-test-kit so it runs
 * without any API keys.
 *
 * Run: pnpm tsx examples/tool-types.ts
 */
import { generateText, tool, type UIMessage } from 'ai';
import { Language, MockLanguageModel } from 'ai-test-kit/language';
import { z } from 'zod';
import { createToolSet, type InferActiveTools, type InferAllTools, type InferInactiveTools } from '../src/tool-set.js';

const tools = {
  search: tool({
    description: 'Search for products',
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }) => ({ results: [query] }),
  }),
  list_orders: tool({
    description: 'List orders for a customer',
    inputSchema: z.object({ customerId: z.string() }),
    execute: async () => ({ orders: ['o-1'] }),
  }),
  cancel_order: tool({
    description: 'Cancel an order',
    inputSchema: z.object({ orderId: z.string() }),
    execute: async ({ orderId }) => ({ cancelled: orderId }),
  }),
  refund: tool({
    description: 'Refund an order',
    inputSchema: z.object({ orderId: z.string() }),
    execute: async ({ orderId }) => ({ refunded: orderId }),
  }),
};

/** The context the conditional predicates read at `inferTools()` time. */
type Context = { isAdmin: boolean };

const toolSet = createToolSet<typeof tools, UIMessage, Context>({ tools })
  .activate(['search']) // always active
  .deactivate(['cancel_order']) // always inactive
  .deactivateWhen('list_orders', ({ toolSetContext }) => toolSetContext?.isAdmin === false) // active by default
  .activateWhen('refund', ({ toolSetContext }) => toolSetContext?.isAdmin === true); // inactive by default

// The helpers surface the tracked state as plain string-literal unions:

type ActiveTools = InferActiveTools<typeof toolSet>;
//   ^? type ActiveTools = "search" | "list_orders"

type InactiveTools = InferInactiveTools<typeof toolSet>;
//   ^? type InactiveTools = "cancel_order" | "refund"

type AllTools = InferAllTools<typeof toolSet>;
//   ^? type AllTools = "search" | "list_orders" | "cancel_order" | "refund"

// At runtime, the conditional tools flip based on `toolSetContext`:

const asUser = toolSet.inferTools({ toolSetContext: { isAdmin: false } });
console.log(`non-admin → activeTools: [${asUser.activeTools.join(', ')}]`);
//   search, but list_orders is deactivated and refund stays off

const asAdmin = toolSet.inferTools({ toolSetContext: { isAdmin: true } });
console.log(`admin     → activeTools: [${asAdmin.activeTools.join(', ')}]`);
//   search + list_orders + refund (cancel_order is always off)

// Only the active tools are handed to the model — inspect the recorded call:

const model = MockLanguageModel.from({ content: [Language.text('ok')] });

await generateText({
  model,
  tools: asAdmin.tools,
  activeTools: asAdmin.activeTools,
  prompt: 'What can you do?',
});

const offered = model.doGenerate.mock.calls[0]?.[0]?.tools?.map((t) => t.name) ?? [];
console.log(`tools passed to the model: [${offered.join(', ')}]`);
