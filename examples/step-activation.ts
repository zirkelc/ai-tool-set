/**
 * Step-based activation — activate a different tool at each step.
 *
 * A small order agent runs as a fixed pipeline: list orders (step 0), analyze
 * them (step 1), then cancel one (step 2). Only one tool is active per step, so
 * the model is walked down the pipeline in order instead of choosing freely.
 *
 * `prepareStep` runs before every step and gives us `steps`, the steps completed
 * so far. We hand it straight to the toolset, and each `activateWhen` predicate
 * turns its tool on only when `steps.length` (the current step index) matches.
 *
 * Uses ai-test-kit's MockLanguageModel so it runs without any API keys.
 *
 * Run: pnpm tsx examples/step-activation.ts
 */
import { generateText, stepCountIs, tool } from 'ai';
import { Language, MockLanguageModel } from 'ai-test-kit/language';
import { z } from 'zod';
import { createToolSet } from '../src/tool-set.js';

const list_orders = tool({
  description: 'List the customer orders',
  inputSchema: z.object({}),
  execute: async () => ({
    orders: [
      { id: 'o-1', status: 'pending' },
      { id: 'o-2', status: 'fulfilled' },
    ],
  }),
});

const analyze_orders = tool({
  description: 'Analyze which orders look refundable',
  inputSchema: z.object({}),
  execute: async () => ({ refundable: ['o-1'] }),
});

const cancel_order = tool({
  description: 'Cancel a pending order',
  inputSchema: z.object({ orderId: z.string() }),
  execute: async ({ orderId }) => ({ cancelled: orderId }),
});

const tools = { list_orders, analyze_orders, cancel_order };

/** Each tool is active only on its step; the step index is `steps.length`. */
const toolSet = createToolSet({ tools })
  .activateWhen('list_orders', ({ steps }) => steps?.length === 0)
  .activateWhen('analyze_orders', ({ steps }) => steps?.length === 1)
  .activateWhen('cancel_order', ({ steps }) => steps?.length === 2);

/**
 * Mock model: call whichever tool is offered this step (the AI SDK only passes
 * the active tools), or produce a final text answer when none are left.
 */
const model = MockLanguageModel.from({
  doGenerate: async ({ tools: availableTools }) => {
    const offered = availableTools?.find((t) => t.type === 'function');
    if (offered) {
      // `cancel_order` needs an orderId; the other two take no input
      const input = offered.name === 'cancel_order' ? { orderId: 'o-1' } : {};
      return Language.result([
        Language.toolCall({ toolCallId: `call-${offered.name}`, toolName: offered.name, input }),
      ]);
    }
    return Language.result('Done — cancelled the pending order.');
  },
});

const result = await generateText({
  model,
  tools,
  stopWhen: stepCountIs(5),
  prompt: 'Review my orders and cancel any unfulfilled one.',
  prepareStep: async ({ steps }) => {
    // Resolve the single tool active for this step from the run history
    const { activeTools } = toolSet.inferTools({ steps });
    console.log(`step ${steps.length} → activeTools: [${activeTools.join(', ')}]`);
    return { activeTools };
  },
});

console.log('\nTool-call trace:');
for (const [i, step] of result.steps.entries()) {
  for (const call of step.toolCalls) {
    console.log(`  step ${i} → called ${call.toolName}(${JSON.stringify(call.input)})`);
  }
}

console.log('\nFinal text:', result.text);
