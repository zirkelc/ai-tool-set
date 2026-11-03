/**
 * Activation reasons: tell the model why a tool is not available.
 *
 * The model does not see inactive tools, so it does not know that they exist. Each
 * activation method takes an optional `{ reason }`. `inferTools()` returns the
 * inactive tools in `inactiveTools` and the reason in `toolStatus`. Here the reasons
 * go into the instructions, so the model can tell a user on the free plan why it
 * cannot cancel the order, and that an upgrade makes it available.
 *
 * `inactiveTools` and `toolStatus` are not AI SDK options. The AI SDK ignores them,
 * so the whole result can be spread into `generateText`.
 *
 * Uses ai-test-kit's MockLanguageModel so it runs without any API keys: the mock
 * prints the instructions and the tools that it receives.
 *
 * Run: pnpm tsx examples/activation-reasons.ts
 */
import { generateText, tool, type UIMessage } from 'ai';
import { Language, MockLanguageModel } from 'ai-test-kit/language';
import { z } from 'zod';
import { createToolSet } from '../src/tool-set.js';

const search = tool({
  description: 'Search the help center',
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => ({ results: [`article for "${query}"`] }),
});

const list_orders = tool({
  description: 'List the orders of the user',
  inputSchema: z.object({}),
  execute: async () => ({ orders: ['order-1'] }),
});

const cancel_order = tool({
  description: 'Cancel an order',
  inputSchema: z.object({ orderId: z.string() }),
  execute: async ({ orderId }) => ({ cancelled: orderId }),
});

const tools = { search, list_orders, cancel_order };

const toolSet = createToolSet<typeof tools, UIMessage, { plan: 'free' | 'pro' }>({ tools }).activateWhen(
  'cancel_order',
  ({ toolSetContext }) => toolSetContext?.plan === 'pro',
  {
    reason:
      'Cancelling orders is not available on the free plan. The user can upgrade to the Pro plan to cancel orders.',
  },
);

/** Mock model (ai-test-kit): print what it receives, then answer. */
const model = MockLanguageModel.from({
  doGenerate: async ({ prompt, tools: modelTools }) => {
    const system = prompt.find((message) => message.role === 'system');
    console.log('Instructions:\n' + system?.content);
    console.log('\nTools sent to the model:', modelTools?.map((t) => t.name).join(', '));
    return Language.result('Cancelling orders is not available on the free plan. Upgrade to Pro to cancel orders.');
  },
});

const result = toolSet.inferTools({ toolSetContext: { plan: 'free' } });
const unavailable = result.inactiveTools
  .filter((name) => result.toolStatus[name].reason)
  .map((name) => `- ${name}: ${result.toolStatus[name].reason}`);

const { text } = await generateText({
  model,
  ...result,
  instructions: `You help users with their orders.\n\nUnavailable tools:\n${unavailable.join('\n')}`,
  prompt: 'Cancel my order #1.',
});

console.log('\nFinal text:', text);
