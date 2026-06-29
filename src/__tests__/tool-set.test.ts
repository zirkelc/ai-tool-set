import { generateText, type StepResult, stepCountIs, type UIMessage } from 'ai';
import { Language, MockLanguageModel } from 'ai-test-kit/language';
import { describe, expect, test } from 'vitest';
import { createToolSet } from '../tool-set.js';
import { TOOLS, UIMessages } from './fixtures.js';

const getToolNames = (model: MockLanguageModel, callIndex = 0) =>
  model.doGenerate.mock.calls[callIndex]?.[0]?.tools?.map((t) => t.name) ?? [];

/** Build a minimal step whose tool calls reference the given tool names. */
const stepWith = (...toolNames: Array<keyof typeof TOOLS & string>): StepResult<typeof TOOLS> => {
  const calls = toolNames.map((toolName) => ({ toolName }));
  return { toolCalls: calls, staticToolCalls: calls } as unknown as StepResult<typeof TOOLS>;
};

/** Count how often a tool was called across steps, reading `staticToolCalls`. */
const countCalls = (steps: Array<StepResult<typeof TOOLS>>, toolName: string) =>
  steps.reduce((sum, step) => sum + step.staticToolCalls.filter((c) => c.toolName === toolName).length, 0);

describe('createToolSet', () => {
  test('should return immutable toolset by default', () => {
    // Arrange & Act
    const toolSet = createToolSet({ tools: TOOLS });

    // Assert — immutable: deactivate returns a different reference
    const result = toolSet.deactivate(['plain']);
    expect(result).not.toBe(toolSet);
  });

  test('should return mutable toolset when mutable: true', () => {
    // Arrange & Act
    const toolSet = createToolSet({ tools: TOOLS, mutable: true });

    // Assert — mutable: deactivate returns the same reference
    const result = toolSet.deactivate(['plain']);
    expect(result).toBe(toolSet);
  });

  test('should have all tools active by default', () => {
    // Arrange & Act
    const toolSet = createToolSet({ tools: TOOLS });

    // Assert
    const { activeTools } = toolSet.inferTools();
    expect(activeTools.length).toBe(5);
    expect(activeTools).toContain('plain');
    expect(activeTools).toContain('calc');
    expect(activeTools).toContain('cancel');
    expect(activeTools).toContain('edit');
    expect(activeTools).toContain('archive');
  });
});

describe('immutable toolset', () => {
  describe('tools', () => {
    test('should expose all tools', () => {
      // Arrange & Act
      const toolSet = createToolSet({ tools: TOOLS });

      // Assert
      expect(Object.keys(toolSet.tools).length).toBe(5);
    });

    test('should only spread tools', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS });

      // Act
      const spread = { ...toolSet };
      const keys = Object.keys(spread);

      // Assert
      expect(keys.length).toBe(1);
      expect(keys).toContain('tools');
    });
  });

  describe('activate', () => {
    test('should activate a deactivated tool', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).deactivate(['plain']);

      // Act
      const { activeTools } = toolSet.activate(['plain']).inferTools();

      // Assert
      expect(activeTools).toContain('plain');
    });

    test('should not mutate the original toolset', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).deactivate(['plain']);

      // Act
      toolSet.activate(['plain']);

      // Assert
      expect(toolSet.inferTools().activeTools).not.toContain('plain');
    });
  });

  describe('deactivate', () => {
    test('should exclude tools from activeTools', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS });

      // Act
      const { activeTools } = toolSet.deactivate(['plain', 'calc']).inferTools();

      // Assert
      expect(activeTools).not.toContain('plain');
      expect(activeTools).not.toContain('calc');
      expect(activeTools).toContain('cancel');
    });

    test('should not mutate the original toolset', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS });

      // Act
      toolSet.deactivate(['plain']);

      // Assert
      expect(toolSet.inferTools().activeTools).toContain('plain');
    });
  });

  describe('activateWhen', () => {
    test('should activate tool when predicate returns true', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).activateWhen('cancel', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('cancel'))),
      );

      // Act
      const { activeTools } = toolSet.inferTools({
        messages: [UIMessages.user('please cancel')],
      });

      // Assert
      expect(activeTools).toContain('cancel');
    });

    test('should not activate tool when predicate returns false', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).activateWhen('cancel', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('cancel'))),
      );

      // Act
      const { activeTools } = toolSet.inferTools({
        messages: [UIMessages.user('hello')],
      });

      // Assert
      expect(activeTools).not.toContain('cancel');
    });

    test('should accept object form for multiple tools', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).activateWhen({
        edit: ({ messages }) =>
          messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('edit'))),
        archive: ({ messages }) =>
          messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('archive'))),
      });

      // Act
      const { activeTools } = toolSet.inferTools({
        messages: [UIMessages.user('edit and archive')],
      });

      // Assert
      expect(activeTools).toContain('edit');
      expect(activeTools).toContain('archive');
    });
  });

  describe('deactivateWhen', () => {
    test('should deactivate tool when predicate returns true', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).deactivateWhen('plain', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('no search'))),
      );

      // Act
      const { activeTools } = toolSet.inferTools({
        messages: [UIMessages.user('no search needed')],
      });

      // Assert
      expect(activeTools).not.toContain('plain');
    });

    test('should keep tool active when predicate returns false', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).deactivateWhen('plain', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('no search'))),
      );

      // Act
      const { activeTools } = toolSet.inferTools({
        messages: [UIMessages.user('hello')],
      });

      // Assert
      expect(activeTools).toContain('plain');
    });
  });

  describe('inferTools', () => {
    test('should return resolved tools and activeTools', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).deactivate(['cancel']);

      // Act
      const result = toolSet.inferTools();

      // Assert
      expect(result.tools).toBe(toolSet.tools);
      expect(result.activeTools).not.toContain('cancel');
      expect(result.activeTools).toContain('plain');
    });

    test('should evaluate predicates with provided input', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).activateWhen('cancel', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('cancel'))),
      );

      // Act
      const { activeTools } = toolSet.inferTools({
        messages: [UIMessages.user('cancel')],
      });

      // Assert
      expect(activeTools).toContain('cancel');
    });

    test('should accept no arguments', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).deactivate(['cancel']);

      // Act
      const { activeTools } = toolSet.inferTools();

      // Assert
      expect(activeTools).not.toContain('cancel');
      expect(activeTools.length).toBe(4);
    });

    test('should accept messages without context', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).activateWhen('cancel', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('cancel'))),
      );

      // Act
      const { activeTools } = toolSet.inferTools({
        messages: [UIMessages.user('cancel')],
      });

      // Assert
      expect(activeTools).toContain('cancel');
    });

    test('should accept toolSetContext without messages', () => {
      // Arrange
      const toolSet = createToolSet<typeof TOOLS, UIMessage, { isAdmin: boolean }>({
        tools: TOOLS,
      }).activateWhen('cancel', ({ toolSetContext }) => toolSetContext?.isAdmin);

      // Act
      const { activeTools } = toolSet.inferTools({ toolSetContext: { isAdmin: true } });

      // Assert
      expect(activeTools).toContain('cancel');
    });

    test('should treat undefined predicate result as false for activateWhen', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).activateWhen('cancel', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('cancel'))),
      );

      // Act — no input, predicate receives undefined messages, returns undefined
      const { activeTools } = toolSet.inferTools();

      // Assert — undefined treated as false, tool stays inactive
      expect(activeTools).not.toContain('cancel');
    });

    test('should treat undefined predicate result as false for deactivateWhen', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).deactivateWhen('plain', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('no search'))),
      );

      // Act — no input, predicate receives undefined messages, returns undefined
      const { activeTools } = toolSet.inferTools();

      // Assert — undefined treated as false, tool stays active
      expect(activeTools).toContain('plain');
    });

    test('should pass undefined messages to predicates when not provided', () => {
      // Arrange
      let receivedMessages: unknown = 'not-called';
      const toolSet = createToolSet({ tools: TOOLS }).activateWhen('cancel', ({ messages }) => {
        receivedMessages = messages;
        return false;
      });

      // Act
      toolSet.inferTools();

      // Assert
      expect(receivedMessages).toBe(undefined);
    });

    test('should pass undefined toolSetContext to predicates when not provided', () => {
      // Arrange
      let receivedContext: unknown = 'not-called';
      const toolSet = createToolSet({ tools: TOOLS }).activateWhen('cancel', ({ toolSetContext }) => {
        receivedContext = toolSetContext;
        return false;
      });

      // Act
      toolSet.inferTools();

      // Assert
      expect(receivedContext).toBe(undefined);
    });
  });

  describe('last-call wins', () => {
    test('should let activate override deactivate', () => {
      // Arrange & Act
      const { activeTools } = createToolSet({ tools: TOOLS }).deactivate(['plain']).activate(['plain']).inferTools();

      // Assert
      expect(activeTools).toContain('plain');
    });

    test('should let deactivate override activate', () => {
      // Arrange & Act
      const { activeTools } = createToolSet({ tools: TOOLS }).activate(['plain']).deactivate(['plain']).inferTools();

      // Assert
      expect(activeTools).not.toContain('plain');
    });

    test('should let activateWhen override deactivate', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS })
        .deactivate(['cancel'])
        .activateWhen('cancel', ({ messages }) =>
          messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('cancel'))),
        );

      // Act
      const { activeTools } = toolSet.inferTools({
        messages: [UIMessages.user('cancel order')],
      });

      // Assert
      expect(activeTools).toContain('cancel');
    });

    test('should let deactivateWhen override activateWhen', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS })
        .activateWhen('cancel', () => true)
        .deactivateWhen('cancel', ({ messages }) => !messages || messages.length === 0);

      // Act
      const { activeTools } = toolSet.inferTools();

      // Assert
      expect(activeTools).not.toContain('cancel');
    });

    test('should let activate override activateWhen', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS })
        .activateWhen('cancel', () => false)
        .activate(['cancel']);

      // Act
      const { activeTools } = toolSet.inferTools();

      // Assert
      expect(activeTools).toContain('cancel');
    });
  });

  describe('toolSetContext', () => {
    test('should pass toolSetContext to predicates', () => {
      // Arrange
      const toolSet = createToolSet<typeof TOOLS, UIMessage, { isAdmin: boolean }>({
        tools: TOOLS,
      }).activateWhen('cancel', ({ toolSetContext }) => toolSetContext?.isAdmin);

      // Act
      const { activeTools } = toolSet.inferTools({ toolSetContext: { isAdmin: true } });

      // Assert
      expect(activeTools).toContain('cancel');
    });
  });

  describe('steps', () => {
    test('should pass steps to predicates', () => {
      // Arrange
      let received: Array<StepResult<typeof TOOLS>> | undefined;
      const toolSet = createToolSet({ tools: TOOLS }).deactivateWhen('cancel', ({ steps }) => {
        received = steps;
        return false;
      });

      // Act
      const steps = [stepWith('cancel')];
      toolSet.inferTools({ steps });

      // Assert
      expect(received).toBe(steps);
    });

    test('should deactivate a tool once it reaches its call limit', () => {
      // Arrange
      const MAX_CALLS = 2;
      const toolSet = createToolSet({ tools: TOOLS }).deactivateWhen(
        'cancel',
        ({ steps }) => countCalls(steps ?? [], 'cancel') >= MAX_CALLS,
      );

      // Act
      const { activeTools } = toolSet.inferTools({ steps: [stepWith('cancel'), stepWith('cancel')] });

      // Assert
      expect(activeTools).not.toContain('cancel');
    });

    test('should keep a tool active below its call limit', () => {
      // Arrange
      const MAX_CALLS = 2;
      const toolSet = createToolSet({ tools: TOOLS }).deactivateWhen(
        'cancel',
        ({ steps }) => countCalls(steps ?? [], 'cancel') >= MAX_CALLS,
      );

      // Act
      const { activeTools } = toolSet.inferTools({ steps: [stepWith('cancel')] });

      // Assert
      expect(activeTools).toContain('cancel');
    });

    test('should only deactivate the limited tool, leaving others active', () => {
      // Arrange
      const MAX_CALLS = 1;
      const toolSet = createToolSet({ tools: TOOLS }).deactivateWhen(
        'cancel',
        ({ steps }) => countCalls(steps ?? [], 'cancel') >= MAX_CALLS,
      );

      // Act
      const { activeTools } = toolSet.inferTools({ steps: [stepWith('cancel'), stepWith('edit')] });

      // Assert
      expect(activeTools).not.toContain('cancel');
      expect(activeTools).toContain('edit');
      expect(activeTools).toContain('plain');
    });

    test('should treat missing steps as no calls', () => {
      // Arrange
      const MAX_CALLS = 2;
      const toolSet = createToolSet({ tools: TOOLS }).deactivateWhen(
        'cancel',
        ({ steps }) => countCalls(steps ?? [], 'cancel') >= MAX_CALLS,
      );

      // Act
      const { activeTools } = toolSet.inferTools();

      // Assert
      expect(activeTools).toContain('cancel');
    });
  });

  describe('approval', () => {
    test('should omit tools without an approval entry', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS });

      // Act
      const { toolApproval } = toolSet.inferTools();

      // Assert
      expect(Object.keys(toolApproval).length).toBe(0);
    });

    test('should set approved status via approve', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).approve(['cancel']);

      // Act
      const { toolApproval } = toolSet.inferTools();

      // Assert
      expect(toolApproval.cancel).toBe('approved');
    });

    test('should set denied status via deny', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).deny(['cancel']);

      // Act
      const { toolApproval } = toolSet.inferTools();

      // Assert
      expect(toolApproval.cancel).toBe('denied');
    });

    test('should set a constant status via approval', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).approval('cancel', 'user-approval');

      // Act
      const { toolApproval } = toolSet.inferTools();

      // Assert
      expect(toolApproval.cancel).toBe('user-approval');
    });

    test('should run a resolver and store its returned status', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).approval('cancel', () => 'denied');

      // Act
      const { toolApproval } = toolSet.inferTools();

      // Assert — a resolver returning a constant produces that constant
      expect(toolApproval.cancel).toBe('denied');
    });

    test('should store a deferred function returned by a resolver', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).approval('cancel', () => () => 'approved');

      // Act
      const { toolApproval } = toolSet.inferTools();

      // Assert — a resolver returning an AI SDK function passes it through
      expect(typeof toolApproval.cancel).toBe('function');
    });

    test('should accept the record form', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).approval({
        cancel: 'denied',
        edit: 'user-approval',
      });

      // Act
      const { toolApproval } = toolSet.inferTools();

      // Assert
      expect(toolApproval.cancel).toBe('denied');
      expect(toolApproval.edit).toBe('user-approval');
    });

    test('should pass inferTools messages and toolSetContext to the resolver', () => {
      // Arrange
      const messages = [UIMessages.user('cancel order')];
      let received: unknown;
      const toolSet = createToolSet<typeof TOOLS, UIMessage, { isAdmin: boolean }>({
        tools: TOOLS,
      }).approval('cancel', (input) => {
        received = input;
        return 'approved';
      });

      // Act
      const { toolApproval } = toolSet.inferTools({ messages, toolSetContext: { isAdmin: true } });

      // Assert — the resolver runs at inferTools time with the toolset's own values
      expect(toolApproval.cancel).toBe('approved');
      expect(received).toEqual({ messages, toolSetContext: { isAdmin: true } });
    });

    test('should let the last approval entry win', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).approve(['cancel']).deny(['cancel']);

      // Act
      const { toolApproval } = toolSet.inferTools();

      // Assert
      expect(toolApproval.cancel).toBe('denied');
    });
  });

  describe('chaining', () => {
    test('should support method chaining', () => {
      // Arrange & Act
      const { activeTools } = createToolSet({ tools: TOOLS })
        .deactivate(['cancel'])
        .activate(['cancel'])
        .deactivate(['plain'])
        .inferTools();

      // Assert
      expect(activeTools).toContain('cancel');
      expect(activeTools).not.toContain('plain');
    });
  });

  describe('clone', () => {
    test('should clone as immutable by default', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS });

      // Act
      const cloned = toolSet.clone();

      // Assert — immutable: returns new reference
      expect(cloned).not.toBe(toolSet);
      const result = cloned.deactivate(['plain']);
      expect(result).not.toBe(cloned);
    });

    test('should clone as mutable', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS });

      // Act
      const cloned = toolSet.clone({ mutable: true });

      // Assert — mutable: returns same reference on mutation
      const result = cloned.deactivate(['plain']);
      expect(result).toBe(cloned);
    });

    test('should preserve activation entries', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).deactivate(['cancel', 'edit']);

      // Act
      const cloned = toolSet.clone({ mutable: true });

      // Assert
      const { activeTools } = cloned.inferTools();
      expect(activeTools).not.toContain('cancel');
      expect(activeTools).not.toContain('edit');
      expect(activeTools).toContain('plain');
    });

    test('should not share state with original', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS });
      const cloned = toolSet.clone();

      // Act — mutate cloned via chaining
      const modified = cloned.deactivate(['plain']);

      // Assert — original unchanged
      expect(toolSet.inferTools().activeTools).toContain('plain');
      expect(modified.inferTools().activeTools).not.toContain('plain');
    });
  });

  describe('generateText integration', () => {
    test('should pass only active tools to the model', async () => {
      // Arrange
      const model = MockLanguageModel.from('Done');
      const toolSet = createToolSet({ tools: TOOLS }).deactivate(['cancel', 'edit', 'archive']);

      // Act
      await generateText({ model, ...toolSet.inferTools(), prompt: 'Hello' });

      // Assert
      const toolNames = getToolNames(model);
      expect(toolNames.length).toBe(2);
      expect(toolNames).toContain('plain');
      expect(toolNames).toContain('calc');
    });

    test('should execute an active tool the model calls', async () => {
      // Arrange — the model calls the active `plain` tool
      const model = MockLanguageModel.from({
        content: [Language.toolCall({ toolCallId: 'call-1', toolName: 'plain', input: { query: 'search' } })],
      });
      const toolSet = createToolSet({ tools: TOOLS }).deactivate(['cancel', 'edit', 'archive']);

      // Act
      const result = await generateText({ model, ...toolSet.inferTools(), prompt: 'Hello' });

      // Assert — the active tool is called and executed end-to-end
      expect(result.toolCalls.length).toBe(1);
      expect(result.toolCalls[0]!.toolName).toBe('plain');
      expect(result.toolResults[0]!.output).toEqual({ result: 'search' });
    });

    test('should execute a tool activated by messages', async () => {
      // Arrange — `edit` only activates when a message mentions it, and the model calls it
      const model = MockLanguageModel.from({
        content: [
          Language.toolCall({ toolCallId: 'call-1', toolName: 'edit', input: { orderId: 'o-1', changes: 'qty=2' } }),
        ],
      });
      const toolSet = createToolSet({ tools: TOOLS }).activateWhen('edit', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('edit'))),
      );
      const messages = [UIMessages.user('edit order')];

      // Act
      const result = await generateText({ model, ...toolSet.inferTools({ messages }), prompt: 'Hello' });

      // Assert — the message-activated tool is passed and executed
      expect(getToolNames(model)).toContain('edit');
      expect(result.toolCalls[0]!.toolName).toBe('edit');
      expect(result.toolResults[0]!.output).toEqual({ success: true });
    });

    test('should not execute a tool denied by approval', async () => {
      // Arrange — the model calls `cancel`, but the toolset denies it
      const model = MockLanguageModel.from({
        content: [Language.toolCall({ toolCallId: 'call-1', toolName: 'cancel', input: { orderId: 'o-1' } })],
      });
      const toolSet = createToolSet({ tools: TOOLS }).deny(['cancel']);

      // Act
      const result = await generateText({ model, ...toolSet.inferTools(), prompt: 'Hello' });

      // Assert — the call is emitted but never executed
      expect(result.toolCalls.length).toBe(1);
      expect(result.toolResults.length).toBe(0);
      expect(result.content.map((c) => c.type)).toContain('tool-approval-response');
    });

    test('should auto-approve via a resolver using toolSetContext and execute', async () => {
      // Arrange — the model calls `cancel`; the resolver decides now from toolSetContext
      const model = MockLanguageModel.from({
        content: [Language.toolCall({ toolCallId: 'call-1', toolName: 'cancel', input: { orderId: 'o-1' } })],
      });
      const toolSet = createToolSet<typeof TOOLS, UIMessage, { isAdmin: boolean }>({ tools: TOOLS }).approval(
        'cancel',
        ({ toolSetContext }) => (toolSetContext?.isAdmin ? 'approved' : 'denied'),
      );

      // Act
      const result = await generateText({
        model,
        ...toolSet.inferTools({ toolSetContext: { isAdmin: true } }),
        prompt: 'Hello',
      });

      // Assert — auto-approved, so the tool executes end-to-end
      expect(result.toolResults.length).toBe(1);
      expect(result.toolResults[0]!.output).toEqual({ success: true });
    });

    test('should defer approval to an AI SDK function and execute when approved', async () => {
      // Arrange — the resolver returns an SDK function that decides from the SDK runtimeContext
      const model = MockLanguageModel.from({
        content: [Language.toolCall({ toolCallId: 'call-1', toolName: 'cancel', input: { orderId: 'o-1' } })],
      });
      const received: Array<{ input: unknown; runtimeContext: unknown }> = [];
      const toolSet = createToolSet<typeof TOOLS, UIMessage, Record<string, unknown>, { role: string }>({
        tools: TOOLS,
      }).approval('cancel', () => (input, { runtimeContext }) => {
        received.push({ input, runtimeContext });
        return runtimeContext.role === 'admin' ? 'approved' : 'denied';
      });

      // Act
      const result = await generateText({
        model,
        ...toolSet.inferTools(),
        runtimeContext: { role: 'admin' },
        prompt: 'Hello',
      });

      // Assert — the AI SDK calls the deferred function with the tool input and runtimeContext
      expect(received[0]).toEqual({ input: { orderId: 'o-1' }, runtimeContext: { role: 'admin' } });
      // Assert — deferred function approved at call time, so the tool executes
      expect(result.toolResults.length).toBe(1);
      expect(result.toolResults[0]!.output).toEqual({ success: true });
    });

    test('should stop offering a tool to the model after its call limit via prepareStep', async () => {
      // Arrange — the model calls `cancel` twice, then finishes with text
      const model = MockLanguageModel.from([
        { content: [Language.toolCall({ toolCallId: 'c-0', toolName: 'cancel', input: { orderId: 'o-1' } })] },
        { content: [Language.toolCall({ toolCallId: 'c-1', toolName: 'cancel', input: { orderId: 'o-2' } })] },
        { content: [Language.text('done')] },
      ]);
      const MAX_CALLS = 2;
      const toolSet = createToolSet({ tools: TOOLS }).deactivateWhen(
        'cancel',
        ({ steps }) => countCalls(steps ?? [], 'cancel') >= MAX_CALLS,
      );

      // Act — pass the freshly inferred activeTools before each step
      const result = await generateText({
        model,
        tools: toolSet.tools,
        stopWhen: stepCountIs(10),
        prompt: 'cancel everything',
        prepareStep: ({ steps }) => {
          const { activeTools } = toolSet.inferTools({ steps });
          return { activeTools };
        },
      });

      // Assert — `cancel` is offered on the first two steps, then withdrawn on the third
      expect(getToolNames(model, 0)).toContain('cancel');
      expect(getToolNames(model, 1)).toContain('cancel');
      expect(getToolNames(model, 2)).not.toContain('cancel');
      // Assert — `cancel` executed exactly MAX_CALLS times
      const cancelCalls = result.steps.flatMap((s) => s.staticToolCalls).filter((c) => c.toolName === 'cancel').length;
      expect(cancelCalls).toBe(MAX_CALLS);
    });
  });
});

describe('mutable toolset', () => {
  describe('tools', () => {
    test('should expose all tools', () => {
      // Arrange & Act
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });

      // Assert
      expect(Object.keys(toolSet.tools).length).toBe(5);
    });

    test('should only spread tools', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });

      // Act
      const spread = { ...toolSet };
      const keys = Object.keys(spread);

      // Assert
      expect(keys.length).toBe(1);
      expect(keys).toContain('tools');
    });
  });

  describe('activate', () => {
    test('should activate a deactivated tool', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.deactivate(['plain']);

      // Act
      toolSet.activate(['plain']);

      // Assert
      expect(toolSet.inferTools().activeTools).toContain('plain');
    });

    test('should return the same reference', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });

      // Act
      const result = toolSet.activate(['plain']);

      // Assert
      expect(result).toBe(toolSet);
    });
  });

  describe('deactivate', () => {
    test('should exclude tools from activeTools', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });

      // Act
      toolSet.deactivate(['plain', 'calc']);

      // Assert
      const { activeTools } = toolSet.inferTools();
      expect(activeTools).not.toContain('plain');
      expect(activeTools).not.toContain('calc');
      expect(activeTools).toContain('cancel');
    });

    test('should mutate in-place', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });

      // Act
      const result = toolSet.deactivate(['plain']);

      // Assert
      expect(result).toBe(toolSet);
      expect(toolSet.inferTools().activeTools).not.toContain('plain');
    });
  });

  describe('activateWhen', () => {
    test('should activate tool when predicate returns true', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.activateWhen('cancel', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('cancel'))),
      );

      // Act
      const { activeTools } = toolSet.inferTools({
        messages: [UIMessages.user('please cancel')],
      });

      // Assert
      expect(activeTools).toContain('cancel');
    });

    test('should not activate tool when predicate returns false', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.activateWhen('cancel', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('cancel'))),
      );

      // Act
      const { activeTools } = toolSet.inferTools({
        messages: [UIMessages.user('hello')],
      });

      // Assert
      expect(activeTools).not.toContain('cancel');
    });
  });

  describe('deactivateWhen', () => {
    test('should deactivate tool when predicate returns true', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.deactivateWhen('plain', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('no search'))),
      );

      // Act
      const { activeTools } = toolSet.inferTools({
        messages: [UIMessages.user('no search needed')],
      });

      // Assert
      expect(activeTools).not.toContain('plain');
    });

    test('should keep tool active when predicate returns false', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.deactivateWhen('plain', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('no search'))),
      );

      // Act
      const { activeTools } = toolSet.inferTools({
        messages: [UIMessages.user('hello')],
      });

      // Assert
      expect(activeTools).toContain('plain');
    });
  });

  describe('inferTools', () => {
    test('should treat undefined predicate result as false for activateWhen', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.activateWhen('cancel', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('cancel'))),
      );

      // Act — no input, predicate receives undefined messages, returns undefined
      const { activeTools } = toolSet.inferTools();

      // Assert — undefined treated as false, tool stays inactive
      expect(activeTools).not.toContain('cancel');
    });

    test('should treat undefined predicate result as false for deactivateWhen', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.deactivateWhen('plain', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('no search'))),
      );

      // Act — no input, predicate receives undefined messages, returns undefined
      const { activeTools } = toolSet.inferTools();

      // Assert — undefined treated as false, tool stays active
      expect(activeTools).toContain('plain');
    });

    test('should return resolved tools and activeTools', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.deactivate(['cancel']);

      // Act
      const result = toolSet.inferTools();

      // Assert
      expect(result.tools).toBe(toolSet.tools);
      expect(result.activeTools).not.toContain('cancel');
      expect(result.activeTools).toContain('plain');
    });

    test('should evaluate predicates with provided input', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.activateWhen('cancel', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('cancel'))),
      );

      // Act
      const { activeTools } = toolSet.inferTools({
        messages: [UIMessages.user('cancel')],
      });

      // Assert
      expect(activeTools).toContain('cancel');
    });
  });

  describe('last-call wins', () => {
    test('should let activate override deactivate', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });

      // Act
      toolSet.deactivate(['plain']).activate(['plain']);

      // Assert
      expect(toolSet.inferTools().activeTools).toContain('plain');
    });

    test('should let activateWhen override deactivate', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet
        .deactivate(['cancel'])
        .activateWhen('cancel', ({ messages }) =>
          messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('cancel'))),
        );

      // Act
      const { activeTools } = toolSet.inferTools({
        messages: [UIMessages.user('cancel order')],
      });

      // Assert
      expect(activeTools).toContain('cancel');
    });
  });

  describe('toolSetContext', () => {
    test('should pass toolSetContext to predicates', () => {
      // Arrange
      const toolSet = createToolSet<typeof TOOLS, UIMessage, { isAdmin: boolean }>({
        tools: TOOLS,
        mutable: true,
      });
      toolSet.activateWhen('cancel', ({ toolSetContext }) => toolSetContext?.isAdmin);

      // Act
      const { activeTools } = toolSet.inferTools({ toolSetContext: { isAdmin: true } });

      // Assert
      expect(activeTools).toContain('cancel');
    });
  });

  describe('steps', () => {
    test('should deactivate a tool once it reaches its call limit', () => {
      // Arrange
      const MAX_CALLS = 2;
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.deactivateWhen('cancel', ({ steps }) => countCalls(steps ?? [], 'cancel') >= MAX_CALLS);

      // Act
      const { activeTools } = toolSet.inferTools({ steps: [stepWith('cancel'), stepWith('cancel')] });

      // Assert
      expect(activeTools).not.toContain('cancel');
    });

    test('should keep a tool active below its call limit', () => {
      // Arrange
      const MAX_CALLS = 2;
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.deactivateWhen('cancel', ({ steps }) => countCalls(steps ?? [], 'cancel') >= MAX_CALLS);

      // Act
      const { activeTools } = toolSet.inferTools({ steps: [stepWith('cancel')] });

      // Assert
      expect(activeTools).toContain('cancel');
    });
  });

  describe('chaining', () => {
    test('should support method chaining', () => {
      // Arrange & Act
      const toolSet = createToolSet({ tools: TOOLS, mutable: true })
        .deactivate(['cancel'])
        .activate(['cancel'])
        .deactivate(['plain']);

      // Assert
      const { activeTools } = toolSet.inferTools();
      expect(activeTools).toContain('cancel');
      expect(activeTools).not.toContain('plain');
    });
  });

  describe('clone', () => {
    test('should clone as immutable by default', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });

      // Act
      const cloned = toolSet.clone();

      // Assert — immutable: returns new reference on mutation
      const result = cloned.deactivate(['plain']);
      expect(result).not.toBe(cloned);
    });

    test('should clone as mutable', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });

      // Act
      const cloned = toolSet.clone({ mutable: true });

      // Assert — mutable: returns same reference on mutation
      expect(cloned).not.toBe(toolSet);
      const result = cloned.deactivate(['plain']);
      expect(result).toBe(cloned);
    });

    test('should preserve activation entries', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true }).deactivate(['cancel', 'edit']);

      // Act
      const cloned = toolSet.clone();

      // Assert
      const { activeTools } = cloned.inferTools();
      expect(activeTools).not.toContain('cancel');
      expect(activeTools).not.toContain('edit');
      expect(activeTools).toContain('plain');
    });

    test('should not share state with original', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      const cloned = toolSet.clone({ mutable: true });

      // Act
      cloned.deactivate(['plain']);

      // Assert — original unchanged
      expect(toolSet.inferTools().activeTools).toContain('plain');
      expect(cloned.inferTools().activeTools).not.toContain('plain');
    });
  });

  describe('generateText integration', () => {
    test('should pass only active tools to the model', async () => {
      // Arrange
      const model = MockLanguageModel.from('Done');
      const toolSet = createToolSet({ tools: TOOLS, mutable: true }).deactivate(['cancel', 'edit', 'archive']);

      // Act
      await generateText({ model, ...toolSet.inferTools(), prompt: 'Hello' });

      // Assert
      const toolNames = getToolNames(model);
      expect(toolNames.length).toBe(2);
      expect(toolNames).toContain('plain');
      expect(toolNames).toContain('calc');
    });

    test('should execute an active tool the model calls', async () => {
      // Arrange — the model calls the active `plain` tool
      const model = MockLanguageModel.from({
        content: [Language.toolCall({ toolCallId: 'call-1', toolName: 'plain', input: { query: 'search' } })],
      });
      const toolSet = createToolSet({ tools: TOOLS, mutable: true }).deactivate(['cancel', 'edit', 'archive']);

      // Act
      const result = await generateText({ model, ...toolSet.inferTools(), prompt: 'Hello' });

      // Assert — the active tool is called and executed end-to-end
      expect(result.toolCalls.length).toBe(1);
      expect(result.toolCalls[0]!.toolName).toBe('plain');
      expect(result.toolResults[0]!.output).toEqual({ result: 'search' });
    });

    test('should execute a tool activated by messages', async () => {
      // Arrange — `edit` only activates when a message mentions it, and the model calls it
      const model = MockLanguageModel.from({
        content: [
          Language.toolCall({ toolCallId: 'call-1', toolName: 'edit', input: { orderId: 'o-1', changes: 'qty=2' } }),
        ],
      });
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.activateWhen('edit', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('edit'))),
      );
      const messages = [UIMessages.user('edit order')];

      // Act
      const result = await generateText({ model, ...toolSet.inferTools({ messages }), prompt: 'Hello' });

      // Assert — the message-activated tool is passed and executed
      expect(getToolNames(model)).toContain('edit');
      expect(result.toolCalls[0]!.toolName).toBe('edit');
      expect(result.toolResults[0]!.output).toEqual({ success: true });
    });
  });
});
