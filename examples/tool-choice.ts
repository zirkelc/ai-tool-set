/**
 * Tool choice — force which tool the model must call, resolved from the same
 * `{ messages, steps, toolSetContext }` values that drive activation and approval.
 *
 * `.choice()` sets the AI SDK's `toolChoice`. It accepts a constant
 * (`'auto'` | `'none'` | `'required'` | `{ type: 'tool', toolName }`) or a resolver
 * that runs inside `inferTools()` and returns one of those (or `undefined` to leave
 * it unconstrained). `inferTools()` returns `toolChoice` alongside `activeTools`, and
 * both spread straight into `generateText` and into `prepareStep`'s return.
 *
 * Here the resolver forces `search` on the first step (so the run always starts by
 * gathering data), then hands control back to the model with `'auto'`. The toolChoice
 * is recomputed per step from the run's `steps`.
 *
 * Uses ai-test-kit's MockLanguageModel so it runs without any API keys: the mock
 * honors the `toolChoice` it receives — it calls `search` while forced, then answers.
 *
 * Run: pnpm tsx examples/tool-choice.ts
 */
import { generateText, stepCountIs, tool } from 'ai';
import { Language, MockLanguageModel } from 'ai-test-kit/language';
import { z } from 'zod';
import { createToolSet } from '../src/tool-set.js';

const search = tool({
  description: 'Search the web for information',
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => ({ results: [`result for "${query}"`] }),
});

const answer = tool({
  description: 'Give the final answer to the user',
  inputSchema: z.object({ text: z.string() }),
  execute: async ({ text }) => ({ answered: text }),
});

const tools = { search, answer };

/**
 * Force `search` on the first step (no steps completed yet), then let the model
 * decide for every step after. Returning `'auto'` is the explicit fallback —
 * with last-call wins, a resolver returning `undefined` would simply omit
 * `toolChoice`, which also defaults to `'auto'`.
 */
const toolSet = createToolSet({ tools }).choice(({ steps }) =>
  steps?.length ? 'auto' : { type: 'tool', toolName: 'search' },
);

/** Mock model (ai-test-kit): obey the forced toolChoice, otherwise produce final text. */
let searchCallId = 0;
const model = MockLanguageModel.from({
  doGenerate: async ({ toolChoice }) => {
    const forcedTool = toolChoice?.type === 'tool' ? toolChoice.toolName : undefined;
    if (forcedTool === 'search') {
      return Language.result([
        Language.toolCall({
          toolCallId: `call-${++searchCallId}`,
          toolName: 'search',
          input: { query: 'ai sdk tool choice' },
        }),
      ]);
    }
    return Language.result('Here is my answer based on what I found.');
  },
});

const result = await generateText({
  model,
  tools,
  stopWhen: stepCountIs(10),
  prompt: 'Research the topic and then answer.',
  prepareStep: ({ stepNumber, steps }) => {
    /** Recompute activeTools + toolChoice for this step from the run so far. */
    const { activeTools, toolChoice } = toolSet.inferTools({ steps });
    console.log(
      `step ${stepNumber} → toolChoice: ${JSON.stringify(toolChoice)} → activeTools: [${activeTools.join(', ')}]`,
    );
    return { activeTools, toolChoice };
  },
});

console.log('\nTool-call trace:');
for (const [i, step] of result.steps.entries()) {
  for (const call of step.toolCalls) {
    console.log(`  step ${i} → called ${call.toolName}(${JSON.stringify(call.input)})`);
  }
}

console.log('\nFinal text:', result.text);
