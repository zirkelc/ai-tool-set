/**
 * Per-tool call limit — cap how often a single tool may be called.
 *
 * The AI SDK has no built-in per-tool limit (`stopWhen`/`stepCountIs` only cap
 * the total number of steps). `deactivateWhen` plus `prepareStep` gives you one:
 * before each step, count `search` calls in the run history and deactivate it
 * once it reaches the budget. The predicate reads `steps`, inferred from the
 * tool set so the step's tool calls are typed.
 *
 * Note: count from `step.staticToolCalls`, not `step.toolCalls`. `toolCalls`
 * includes a dynamic-tool branch whose `toolName` widens to `string`;
 * `staticToolCalls` keeps `toolName` narrowed to the declared tool names.
 *
 * Uses ai-test-kit's MockLanguageModel so it runs without any API keys: the mock
 * keeps calling `search` while it is offered, then emits text once it is gone.
 *
 * Run: pnpm tsx examples/tool-call-limit.ts
 */
import { generateText, type ModelMessage, type StepResult, stepCountIs, tool } from 'ai';
import { Language, MockLanguageModel } from 'ai-test-kit/language';
import { z } from 'zod';
import { createToolSet } from '../src/tool-set.js';

/** Limit `search` to at most this many calls across the whole run. */
const MAX_SEARCH_CALLS = 2;

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

/** Count how often a declared tool was called, reading the narrowed `staticToolCalls`. */
const countToolCalls = (steps: Array<StepResult<typeof tools>>, toolName: string): number =>
  steps.reduce((sum, step) => sum + step.staticToolCalls.filter((call) => call.toolName === toolName).length, 0);

/**
 * `search` is active by default and deactivates once it has hit its budget.
 * `steps` is inferred from the tool set, so it is fully typed in the predicate.
 */
const toolSet = createToolSet<typeof tools, ModelMessage>({ tools }).deactivateWhen(
  'search',
  ({ steps = [] }) => countToolCalls(steps, 'search') >= MAX_SEARCH_CALLS,
);

/** Mock model (ai-test-kit): call `search` while it is offered, otherwise produce final text. */
let searchCallId = 0;
const model = MockLanguageModel.from({
  doGenerate: async ({ tools: availableTools }) => {
    const canSearch = availableTools?.some((t) => t.type === 'function' && t.name === 'search');
    if (canSearch) {
      return Language.result([
        Language.toolCall({
          toolCallId: `call-${++searchCallId}`,
          toolName: 'search',
          input: { query: 'ai sdk tool limits' },
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
  prepareStep: async ({ stepNumber, steps }) => {
    /** Hand the completed steps to the toolset; the predicate counts from them. */
    const { activeTools } = toolSet.inferTools({ steps });
    const searchCalls = countToolCalls(steps, 'search');
    console.log(
      `step ${stepNumber} → search called ${searchCalls}/${MAX_SEARCH_CALLS} so far → activeTools: [${activeTools.join(', ')}]`,
    );
    return { activeTools };
  },
});

console.log('\nTool-call trace:');
for (const [i, step] of result.steps.entries()) {
  for (const call of step.toolCalls) {
    console.log(`  step ${i} → called ${call.toolName}(${JSON.stringify(call.input)})`);
  }
}

console.log(`\nTotal search calls: ${countToolCalls(result.steps, 'search')} (limit ${MAX_SEARCH_CALLS})`);
console.log('Final text:', result.text);
