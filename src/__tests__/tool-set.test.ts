import { generateText, type UIMessage } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, test } from 'vitest';
import { createToolSet } from '../tool-set.js';
import { TOOLS, makeMessage } from './fixtures.js';

const USAGE = {
  inputTokens: { total: 0, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: undefined, reasoning: undefined },
};
const STOP = { unified: 'stop' as const, raw: undefined };

const textResult = () => ({
  content: [{ type: 'text' as const, text: 'Done', id: 'text-1' }],
  finishReason: STOP,
  usage: USAGE,
  warnings: [] as Array<never>,
});

const getToolNames = (model: MockLanguageModelV3, callIndex = 0) =>
  model.doGenerateCalls[callIndex]!.tools?.map((t) => t.name) ?? [];

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
        messages: [makeMessage([{ type: 'text', text: 'please cancel' }])],
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
        messages: [makeMessage([{ type: 'text', text: 'hello' }])],
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
        messages: [makeMessage([{ type: 'text', text: 'edit and archive' }])],
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
        messages: [makeMessage([{ type: 'text', text: 'no search needed' }])],
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
        messages: [makeMessage([{ type: 'text', text: 'hello' }])],
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
        messages: [makeMessage([{ type: 'text', text: 'cancel' }])],
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
        messages: [makeMessage([{ type: 'text', text: 'cancel' }])],
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
        messages: [makeMessage([{ type: 'text', text: 'cancel order' }])],
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
    test('should spread inferTools result into generateText', async () => {
      // Arrange
      const model = new MockLanguageModelV3({ doGenerate: textResult() });
      const toolSet = createToolSet({ tools: TOOLS }).deactivate(['cancel', 'edit', 'archive']);

      // Act
      await generateText({ model, ...toolSet.inferTools(), prompt: 'Hello' });

      // Assert
      const toolNames = getToolNames(model);
      expect(toolNames.length).toBe(2);
      expect(toolNames).toContain('plain');
      expect(toolNames).toContain('calc');
    });

    test('should spread inferTools with messages into generateText', async () => {
      // Arrange
      const model = new MockLanguageModelV3({ doGenerate: textResult() });
      const toolSet = createToolSet({ tools: TOOLS }).activateWhen('edit', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('edit'))),
      );
      const messages = [makeMessage([{ type: 'text', text: 'edit order' }])];

      // Act
      await generateText({ model, ...toolSet.inferTools({ messages }), prompt: 'Hello' });

      // Assert
      const toolNames = getToolNames(model);
      expect(toolNames).toContain('edit');
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
        messages: [makeMessage([{ type: 'text', text: 'please cancel' }])],
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
        messages: [makeMessage([{ type: 'text', text: 'hello' }])],
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
        messages: [makeMessage([{ type: 'text', text: 'no search needed' }])],
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
        messages: [makeMessage([{ type: 'text', text: 'hello' }])],
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
        messages: [makeMessage([{ type: 'text', text: 'cancel' }])],
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
        messages: [makeMessage([{ type: 'text', text: 'cancel order' }])],
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
    test('should spread inferTools result into generateText', async () => {
      // Arrange
      const model = new MockLanguageModelV3({ doGenerate: textResult() });
      const toolSet = createToolSet({ tools: TOOLS, mutable: true }).deactivate(['cancel', 'edit', 'archive']);

      // Act
      await generateText({ model, ...toolSet.inferTools(), prompt: 'Hello' });

      // Assert
      const toolNames = getToolNames(model);
      expect(toolNames.length).toBe(2);
      expect(toolNames).toContain('plain');
      expect(toolNames).toContain('calc');
    });

    test('should spread inferTools with messages into generateText', async () => {
      // Arrange
      const model = new MockLanguageModelV3({ doGenerate: textResult() });
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.activateWhen('edit', ({ messages }) =>
        messages?.some((m) => m.parts.some((p) => p.type === 'text' && p.text.includes('edit'))),
      );
      const messages = [makeMessage([{ type: 'text', text: 'edit order' }])];

      // Act
      await generateText({ model, ...toolSet.inferTools({ messages }), prompt: 'Hello' });

      // Assert
      const toolNames = getToolNames(model);
      expect(toolNames).toContain('edit');
    });
  });
});
