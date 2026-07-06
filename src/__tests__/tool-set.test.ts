import { generateText, type StepResult, stepCountIs, type UIMessage } from 'ai';
import { Language, MockLanguageModel } from 'ai-test-kit/language';
import { describe, expect, test } from 'vitest';
import { createToolSet } from '../tool-set.js';
import { TOOLS, UIMessages } from './fixtures.js';

const getToolNames = (model: MockLanguageModel, callIndex = 0) =>
  model.doGenerateCalls[callIndex]!.tools?.map((t) => t.name) ?? [];

const getToolChoice = (model: MockLanguageModel, callIndex = 0) => model.doGenerateCalls[callIndex]!.toolChoice;

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

    test('should accept context without messages', () => {
      // Arrange
      const toolSet = createToolSet<typeof TOOLS, UIMessage, { isAdmin: boolean }>({
        tools: TOOLS,
      }).activateWhen('cancel', ({ context }) => context?.isAdmin);

      // Act
      const { activeTools } = toolSet.inferTools({ context: { isAdmin: true } });

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

    test('should pass undefined context to predicates when not provided', () => {
      // Arrange
      let receivedContext: unknown = 'not-called';
      const toolSet = createToolSet({ tools: TOOLS }).activateWhen('cancel', ({ context }) => {
        receivedContext = context;
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

  describe('context', () => {
    test('should pass context to predicates', () => {
      // Arrange
      const toolSet = createToolSet<typeof TOOLS, UIMessage, { isAdmin: boolean }>({
        tools: TOOLS,
      }).activateWhen('cancel', ({ context }) => context?.isAdmin);

      // Act
      const { activeTools } = toolSet.inferTools({ context: { isAdmin: true } });

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
  });

  describe('choice', () => {
    test('should be undefined when no choice is set', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS });

      // Act
      const { toolChoice } = toolSet.inferTools();

      // Assert
      expect(toolChoice).toBeUndefined();
    });

    test('should resolve a static string toolChoice', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).choice('required');

      // Act
      const { toolChoice } = toolSet.inferTools();

      // Assert
      expect(toolChoice).toBe('required');
    });

    test('should resolve a static tool toolChoice', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).choice({ type: 'tool', toolName: 'plain' });

      // Act
      const { toolChoice } = toolSet.inferTools();

      // Assert
      expect(toolChoice).toEqual({ type: 'tool', toolName: 'plain' });
    });

    test('should resolve toolChoice from a resolver using steps', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).choice(({ steps }) =>
        steps?.length ? 'auto' : { type: 'tool', toolName: 'plain' },
      );

      // Act
      const firstStep = toolSet.inferTools({ steps: [] }).toolChoice;
      const laterStep = toolSet.inferTools({ steps: [stepWith('plain')] }).toolChoice;

      // Assert
      expect(firstStep).toEqual({ type: 'tool', toolName: 'plain' });
      expect(laterStep).toBe('auto');
    });

    test('should resolve toolChoice from a resolver using context', () => {
      // Arrange
      const toolSet = createToolSet<typeof TOOLS, UIMessage, { forceSearch: boolean }>({ tools: TOOLS }).choice(
        ({ context }) => (context?.forceSearch ? { type: 'tool', toolName: 'plain' } : 'auto'),
      );

      // Act
      const forced = toolSet.inferTools({ context: { forceSearch: true } }).toolChoice;
      const auto = toolSet.inferTools({ context: { forceSearch: false } }).toolChoice;

      // Assert
      expect(forced).toEqual({ type: 'tool', toolName: 'plain' });
      expect(auto).toBe('auto');
    });

    test('should be undefined when the resolver returns undefined', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).choice(() => undefined);

      // Act
      const { toolChoice } = toolSet.inferTools();

      // Assert
      expect(toolChoice).toBeUndefined();
    });

    test('should follow last-call wins', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).choice('required').choice('none');

      // Act
      const { toolChoice } = toolSet.inferTools();

      // Assert
      expect(toolChoice).toBe('none');
    });

    test('should not mutate the original toolset', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).choice('required');

      // Act
      toolSet.choice('none');

      // Assert
      expect(toolSet.inferTools().toolChoice).toBe('required');
    });
  });

  describe('order', () => {
    /** The effective order the provider sees: the resolved record keys filtered to the active tools. */
    const providerOrder = (result: { tools: Record<string, unknown>; activeTools: Array<string> }) =>
      Object.keys(result.tools).filter((name) => result.activeTools.includes(name));

    test('should default to stable, pushing dynamic tools to the tail', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).activateWhen('cancel', () => true);

      // Act
      const result = toolSet.inferTools();

      // Assert — default is 'stable'; the resolved record moves the dynamic tool last
      expect(Object.keys(result.tools)).toEqual(['plain', 'calc', 'edit', 'archive', 'cancel']);
      // The original record is left untouched
      expect(Object.keys(toolSet.tools)).toEqual(['plain', 'calc', 'cancel', 'edit', 'archive']);
    });

    test('should keep the record reference under the default when no tools are dynamic', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS });

      // Act
      const result = toolSet.inferTools();

      // Assert — all tools static, so stable resolves to the declared order and reuses the record
      expect(Object.keys(result.tools)).toEqual(['plain', 'calc', 'cancel', 'edit', 'archive']);
      expect(result.tools).toBe(toolSet.tools);
    });

    test('should push dynamic tools to the tail with an explicit "stable"', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS })
        .activateWhen('cancel', () => true)
        .order('stable');

      // Act
      const result = toolSet.inferTools();

      // Assert
      expect(Object.keys(result.tools)).toEqual(['plain', 'calc', 'edit', 'archive', 'cancel']);
    });

    test('should keep the record untouched for "insertion"', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS })
        .activateWhen('cancel', () => true)
        .order('insertion');

      // Act
      const result = toolSet.inferTools();

      // Assert — no reordering, same reference as the declared record
      expect(Object.keys(result.tools)).toEqual(['plain', 'calc', 'cancel', 'edit', 'archive']);
      expect(result.tools).toBe(toolSet.tools);
    });

    test('should order by an explicit name list, keeping the rest in insertion order', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).order(['edit', 'plain']);

      // Act
      const result = toolSet.inferTools();

      // Assert
      expect(Object.keys(result.tools)).toEqual(['edit', 'plain', 'calc', 'cancel', 'archive']);
    });

    test('should order by a custom comparator', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).order((a, b) => b.toolName.length - a.toolName.length);

      // Act
      const result = toolSet.inferTools();

      // Assert
      expect(Object.keys(result.tools)).toEqual(['archive', 'cancel', 'plain', 'calc', 'edit']);
    });

    test('should keep activeTools in insertion order while the record carries the order', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).deactivate(['cancel']).order(['archive', 'edit']);

      // Act
      const result = toolSet.inferTools();

      // Assert
      expect(result.activeTools).toEqual(['plain', 'calc', 'edit', 'archive']);
      expect(Object.keys(result.tools)).toEqual(['archive', 'edit', 'plain', 'calc', 'cancel']);
    });

    test('should send tools to the provider in the resolved order', async () => {
      // Arrange
      const model = MockLanguageModel.from('Done');
      const toolSet = createToolSet({ tools: TOOLS }).order(['edit', 'plain']);

      // Act
      await generateText({ model, ...toolSet.inferTools(), prompt: 'Hello' });

      // Assert — the provider receives the tools in the re-created record order
      expect(getToolNames(model)).toEqual(['edit', 'plain', 'calc', 'cancel', 'archive']);
    });

    test('should keep the static provider prefix stable when a dynamic tool toggles', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS })
        .activateWhen('cancel', ({ messages }) =>
          messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('cancel'))),
        )
        .order('stable');

      // Act
      const withoutTrigger = toolSet.inferTools({ messages: [UIMessages.user('hello')] });
      const withTrigger = toolSet.inferTools({ messages: [UIMessages.user('cancel my order')] });

      // Assert — the record order is identical, so the active provider prefix never shifts
      expect(Object.keys(withoutTrigger.tools)).toEqual(Object.keys(withTrigger.tools));
      expect(providerOrder(withoutTrigger)).toEqual(['plain', 'calc', 'edit', 'archive']);
      expect(providerOrder(withTrigger)).toEqual(['plain', 'calc', 'edit', 'archive', 'cancel']);
      expect(providerOrder(withTrigger).slice(0, 4)).toEqual(providerOrder(withoutTrigger));
    });

    test('should follow last-call wins', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).order('insertion').order(['edit', 'plain']);

      // Act
      const result = toolSet.inferTools();

      // Assert
      expect(Object.keys(result.tools)).toEqual(['edit', 'plain', 'calc', 'cancel', 'archive']);
    });

    test('should not mutate the original toolset', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS }).order(['edit', 'plain']);

      // Act
      toolSet.order('insertion');

      // Assert
      expect(Object.keys(toolSet.inferTools().tools)).toEqual(['edit', 'plain', 'calc', 'cancel', 'archive']);
    });

    test('should accept order from the factory options', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, order: ['edit', 'plain'] });

      // Act
      const result = toolSet.inferTools();

      // Assert
      expect(Object.keys(result.tools)).toEqual(['edit', 'plain', 'calc', 'cancel', 'archive']);
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

    test('should forward the resolved toolChoice to the model', async () => {
      // Arrange — force the `plain` tool via choice
      const model = MockLanguageModel.from({
        content: [Language.toolCall({ toolCallId: 'call-1', toolName: 'plain', input: { query: 'search' } })],
      });
      const toolSet = createToolSet({ tools: TOOLS }).choice({ type: 'tool', toolName: 'plain' });

      // Act
      await generateText({ model, ...toolSet.inferTools(), prompt: 'Hello' });

      // Assert
      expect(getToolChoice(model)).toEqual({ type: 'tool', toolName: 'plain' });
    });

    /**
     * Edge case: choice forces a tool that activeTools deactivates. The AI SDK filters tools by
     * activeTools first, so the forced tool is dropped from the list sent to the model, yet the
     * toolChoice is forwarded unchanged — the model receives a toolChoice pointing at a tool it
     * cannot see. A real provider rejects this; here we observe the mismatch the SDK passes through.
     */
    test('should forward a toolChoice for a deactivated tool without the tool', async () => {
      // Arrange — `cancel` is deactivated but also forced via choice
      const model = MockLanguageModel.from('Done');
      const toolSet = createToolSet({ tools: TOOLS })
        .deactivate(['cancel'])
        .choice({ type: 'tool', toolName: 'cancel' });

      // Act
      const { activeTools, toolChoice } = toolSet.inferTools();
      await generateText({ model, ...toolSet.inferTools(), prompt: 'Hello' });

      // Assert — inferTools resolves the conflicting pair as-is (no validation, no auto-activation)
      expect(activeTools).not.toContain('cancel');
      expect(toolChoice).toEqual({ type: 'tool', toolName: 'cancel' });

      // Assert — the SDK drops `cancel` from the tools but still forwards the forced toolChoice
      expect(getToolNames(model)).not.toContain('cancel');
      expect(getToolChoice(model)).toEqual({ type: 'tool', toolName: 'cancel' });
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

  describe('context', () => {
    test('should pass context to predicates', () => {
      // Arrange
      const toolSet = createToolSet<typeof TOOLS, UIMessage, { isAdmin: boolean }>({
        tools: TOOLS,
        mutable: true,
      });
      toolSet.activateWhen('cancel', ({ context }) => context?.isAdmin);

      // Act
      const { activeTools } = toolSet.inferTools({ context: { isAdmin: true } });

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

  describe('choice', () => {
    test('should mutate in-place and return this', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });

      // Act
      const result = toolSet.choice('required');

      // Assert
      expect(result).toBe(toolSet);
    });

    test('should resolve toolChoice and follow last-call wins', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });

      // Act
      toolSet.choice('required').choice('none');

      // Assert
      expect(toolSet.inferTools().toolChoice).toBe('none');
    });
  });

  describe('order', () => {
    test('should mutate in-place and return this', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });

      // Act
      const result = toolSet.order('stable');

      // Assert
      expect(result).toBe(toolSet);
    });

    test('should resolve order and follow last-call wins', () => {
      // Arrange
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });

      // Act
      toolSet.order('insertion').order(['edit', 'plain']);

      // Assert
      expect(Object.keys(toolSet.inferTools().tools)).toEqual(['edit', 'plain', 'calc', 'cancel', 'archive']);
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
