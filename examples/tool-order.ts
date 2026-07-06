/**
 * Stable tool order — keep the provider's tool list in a stable order so a toggling
 * dynamic tool never shifts the static tools around it, which would otherwise invalidate
 * the provider's prompt cache for the tool block.
 *
 * AI SDK v6 has no `toolOrder` parameter, so `.order()` re-creates the `tools` record in
 * the resolved order. The provider renders tools in the record's own key order (filtered
 * by `activeTools`), so reordering the record reorders what the provider sees.
 *
 * `'stable'` (the default) keeps always-active tools in a fixed prefix and sorts
 * conditionally-activated tools to the tail. Here `list_orders` is declared between two
 * static tools; once it is called it deactivates. Watch how the provider's tool list
 * evolves under `'insertion'` vs `'stable'`:
 *
 *   insertion → step 0: [search, list_orders, get_weather]   step 1: [search, get_weather]
 *   stable    → step 0: [search, get_weather, list_orders]   step 1: [search, get_weather]
 *
 * Under `'insertion'`, dropping `list_orders` from the middle shifts `get_weather` and
 * invalidates the cache; under `'stable'` the `[search, get_weather]` prefix is identical
 * across both steps.
 *
 * Uses ai-test-kit's MockLanguageModel so it runs without any API keys.
 *
 * Run: pnpm tsx examples/tool-order.ts
 */
import { generateText, stepCountIs, tool } from 'ai';
import { Language, MockLanguageModel } from 'ai-test-kit/language';
import { z } from 'zod';
import { createToolSet } from '../src/tool-set.js';

const search = tool({
  description: 'Search the web',
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => ({ results: [`result for "${query}"`] }),
});

const list_orders = tool({
  description: 'List the orders for the current customer',
  inputSchema: z.object({}),
  execute: async () => ({ orders: [{ id: '1001', status: 'pending' }] }),
});

const get_weather = tool({
  description: 'Get the current weather',
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => ({ tempC: 21, city }),
});

/** `list_orders` sits in the middle of the declared record, between two static tools. */
const tools = { search, list_orders, get_weather };

/** Fresh mock per run (ai-test-kit): call list_orders while available, otherwise answer. */
const makeModel = () =>
  MockLanguageModel.from({
    doGenerate: async ({ tools: sentTools }) => {
      const available = new Set((sentTools ?? []).map((t) => t.name));
      if (available.has('list_orders')) {
        return Language.result([Language.toolCall({ toolCallId: 'call-1', toolName: 'list_orders', input: {} })]);
      }
      return Language.result('Here are your orders.');
    },
  });

/** Drive one run with the given order strategy and return the tool names the provider saw per step. */
const run = async (order: 'insertion' | 'stable') => {
  const toolSet = createToolSet({ tools })
    // list_orders drops out once it has been called this run
    .deactivateWhen('list_orders', ({ steps }) =>
      steps?.some((s) => s.staticToolCalls.some((c) => c.toolName === 'list_orders')),
    )
    .order(order);

  const model = makeModel();

  await generateText({
    model,
    // inferTools() re-creates the record in the resolved order; spread it in once here
    ...toolSet.inferTools(),
    stopWhen: stepCountIs(5),
    prompt: 'List my orders',
    prepareStep: ({ steps }) => {
      // Recompute activeTools per step; the record order is fixed from the top-level spread
      const { activeTools } = toolSet.inferTools({ steps });
      return { activeTools };
    },
  });

  return model.doGenerateCalls.map((call) => (call.tools ?? []).map((t) => t.name));
};

const insertion = await run('insertion');
const stable = await run('stable');

console.log('insertion order — provider tools per step:');
insertion.forEach((names, i) => console.log(`  step ${i}: [${names.join(', ')}]`));

console.log('\nstable order — provider tools per step:');
stable.forEach((names, i) => console.log(`  step ${i}: [${names.join(', ')}]`));

console.log('\nUnder "stable" the [search, get_weather] prefix is byte-identical across steps.');
