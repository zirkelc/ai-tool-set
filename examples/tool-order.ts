/**
 * Stable tool order across steps — inspect exactly what reaches the provider each step.
 *
 * The AI SDK sends tools to the provider in the order of the `tools` record, and exposes a
 * `toolOrder` parameter (top-level and per-step via `prepareStep`) to override that order.
 *
 * When a tool toggles on and off across steps, a dynamic tool in the middle of the record
 * shifts every tool after it, which invalidates the provider's prompt cache for the tool block.
 * `ai-tool-set`'s `.order('stable')` resolves a `toolOrder` that keeps always-on (static) tools
 * in a fixed prefix and pushes conditionally-activated (dynamic) tools to the tail.
 *
 * This example runs a real `@ai-sdk/openai` model with a custom `fetch` that intercepts each
 * outgoing request and reads the `tools` array OpenAI would receive — no API key or network, the
 * fetch drives a two-step run: step 0 calls `list_orders`, step 1 answers.
 *
 * Two ways to drop `list_orders` after it has run, both via `prepareStep`:
 *   a) a standard AI SDK tool set — hand-written `activeTools` per step
 *   b) `createToolSet` with `.order('stable')` — `inferTools({ steps })` inside `prepareStep`
 *
 * `list_orders` sits between the two static tools. In (a) dropping it shifts `get_weather` from
 * index 2 to index 1 between steps; in (b) the `[search, get_weather]` prefix stays put.
 *
 * Run: pnpm tsx examples/tool-order.ts
 */
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { createToolSet } from '../src/tool-set.js';

const tools = {
  search: tool({
    description: 'Search the web',
    inputSchema: z.object({ query: z.string() }),
    execute: async () => ({}),
  }),
  list_orders: tool({
    description: 'List the customer orders',
    inputSchema: z.object({ customerId: z.string() }),
    execute: async () => ({ orders: [] }),
  }),
  get_weather: tool({
    description: 'Get the weather',
    inputSchema: z.object({ city: z.string() }),
    execute: async () => ({}),
  }),
};

/** Tool names captured from each outgoing request, in order. */
const requests: Array<Array<string>> = [];
let step = 0;

/**
 * Custom fetch: record the `tools` array the AI SDK serialized for OpenAI, then drive a two-step
 * run — the first response calls `list_orders`, the second answers with text.
 */
const captureFetch: typeof fetch = async (_input, init) => {
  const body = JSON.parse(String(init?.body));
  requests.push(
    (body.tools ?? []).map((t: { function?: { name: string }; name?: string }) => t.function?.name ?? t.name),
  );

  const isFirst = step === 0;
  step++;
  const message = isFirst
    ? {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'list_orders', arguments: '{"customerId":"c1"}' } },
        ],
      }
    : { role: 'assistant', content: 'The weather is sunny.' };

  const completion = {
    id: 'chatcmpl-example',
    object: 'chat.completion',
    created: 0,
    model: 'gpt-4o-mini',
    choices: [{ index: 0, message, finish_reason: isFirst ? 'tool_calls' : 'stop' }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
  return new Response(JSON.stringify(completion), { status: 200, headers: { 'content-type': 'application/json' } });
};

const openai = createOpenAI({ apiKey: 'sk-example', fetch: captureFetch });
const model = openai.chat('gpt-4o-mini');

/** Reset capture state, run the two-step call, and return the tool order OpenAI saw per step. */
const collect = async (call: () => Promise<unknown>) => {
  step = 0;
  requests.length = 0;
  await call();
  return requests.map((names) => `[${names.join(', ')}]`);
};

/** a) Standard AI SDK: hand-write activeTools each step, dropping list_orders once it has run. */
const caseA = await collect(() =>
  generateText({
    model,
    prompt: 'List my orders, then tell me the weather.',
    stopWhen: stepCountIs(3),
    tools,
    prepareStep: ({ steps }) => {
      const calledListOrders = steps.some((s) => s.staticToolCalls.some((c) => c.toolName === 'list_orders'));
      const activeTools: Array<keyof typeof tools> = calledListOrders
        ? ['search', 'get_weather']
        : ['search', 'list_orders', 'get_weather'];
      return { activeTools };
    },
  }),
);

/** b) createToolSet + order('stable'): inferTools({ steps }) drives activeTools AND toolOrder. */
const toolSet = createToolSet({ tools })
  .deactivateWhen('list_orders', ({ steps }) =>
    steps?.some((s) => s.staticToolCalls.some((c) => c.toolName === 'list_orders')),
  )
  .order('stable');

const caseB = await collect(() =>
  generateText({
    model,
    prompt: 'List my orders, then tell me the weather.',
    stopWhen: stepCountIs(3),
    tools,
    prepareStep: ({ steps }) => {
      const { activeTools, toolOrder } = toolSet.inferTools({ steps });
      return { activeTools, toolOrder };
    },
  }),
);

console.log('Tools OpenAI receives, per step:\n');
console.log('a) Standard AI SDK (manual activeTools):');
caseA.forEach((names, i) => console.log(`   step ${i}: ${names}`));
console.log('\nb) createToolSet + order("stable"):');
caseB.forEach((names, i) => console.log(`   step ${i}: ${names}`));
console.log('\nIn (a) get_weather shifts 2 → 1 between steps; in (b) the [search, get_weather] prefix stays put.');
