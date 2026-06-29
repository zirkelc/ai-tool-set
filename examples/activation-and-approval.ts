/**
 * Activation + approval — gating the same tool two ways.
 *
 * A deploy agent where activation and approval compose per tool:
 * - `deploy` unlocks only once CI is green (activation); then production needs a
 *   human while staging auto-ships (approval).
 * - `rollback` is admins-only (activation) and always needs confirmation (approval).
 * - `runTests` is always on, never gated.
 *
 * `inferTools(toolSetContext)` resolves both `activeTools` and `toolApproval`,
 * so one toolset drives each request differently.
 *
 * Uses ai-test-kit's MockLanguageModel so it runs without any API keys.
 *
 * Run: pnpm tsx examples/activation-and-approval.ts
 */
import { generateText, tool, type UIMessage } from 'ai';
import { Language, MockLanguageModel } from 'ai-test-kit/language';
import { z } from 'zod';
import { createToolSet } from '../src/tool-set.js';

const tools = {
  runTests: tool({
    description: 'Run the test suite',
    inputSchema: z.object({ suite: z.string().optional() }),
    execute: async ({ suite }) => ({ suite: suite ?? 'all', passed: true }),
  }),
  deploy: tool({
    description: 'Deploy the app to an environment',
    inputSchema: z.object({ env: z.enum(['staging', 'production']) }),
    execute: async ({ env }) => ({ env, deployed: true }),
  }),
  rollback: tool({
    description: 'Roll back to a previous release',
    inputSchema: z.object({ to: z.string() }),
    execute: async ({ to }) => ({ to, rolledBack: true }),
  }),
};

/** Context resolved per request at `inferTools()` time. */
type Context = { ciGreen: boolean; role: 'dev' | 'admin' };

const toolSet = createToolSet<typeof tools, UIMessage, Context>({ tools })
  // `deploy`: active only when CI is green; production needs a human, staging auto-ships
  .activateWhen('deploy', ({ toolSetContext }) => toolSetContext?.ciGreen)
  .approval('deploy', () => (input) => (input.env === 'production' ? 'user-approval' : 'approved'))
  // `rollback`: admins only, and always confirmed
  .activateWhen('rollback', ({ toolSetContext }) => toolSetContext?.role === 'admin')
  .approval('rollback', 'user-approval');

/** Resolve the toolset for a given context and print active tools + approvals. */
const show = (label: string, toolSetContext: Context) => {
  const { activeTools, toolApproval } = toolSet.inferTools({ toolSetContext });
  const approval = JSON.stringify(toolApproval, (_k, v) => (typeof v === 'function' ? 'ƒ deferred' : v));
  console.log(`${label}: active=[${activeTools.join(', ')}] approval=${approval}`);
};

// Same toolset, three requests — activation and approval resolve differently:
show('dev,   CI red  ', { ciGreen: false, role: 'dev' }); // only runTests
show('dev,   CI green', { ciGreen: true, role: 'dev' }); // + deploy (approval deferred to call time)
show('admin, CI green', { ciGreen: true, role: 'admin' }); // + rollback (always confirmed)

// End-to-end: the model calls a staging deploy, which auto-approves and executes.
const model = MockLanguageModel.from({
  content: [Language.toolCall({ toolCallId: 'call-1', toolName: 'deploy', input: { env: 'staging' } })],
});

const result = await generateText({
  model,
  // Spread resolved tools + activeTools + toolApproval straight into generateText
  ...toolSet.inferTools({ toolSetContext: { ciGreen: true, role: 'dev' } }),
  prompt: 'Ship the latest build to staging',
});

const deployResult = result.toolResults.find((r) => r.toolName === 'deploy');
console.log('\nstaging deploy result:', JSON.stringify(deployResult?.output));
