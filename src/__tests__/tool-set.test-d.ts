import type { InferUITool, ModelMessage, UIMessage } from 'ai';
import { tool } from 'ai';
import { describe, expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import {
  createToolSet,
  type ActivationInput,
  type InferActiveTools,
  type InferInactiveTools,
  type InferToolSet,
  type InferUIToolSet,
  type ToolSet,
} from '../tool-set.js';
import { TOOLS, type MyUIMessage, plainTool, calcTool, cancelTool, editTool, archiveTool } from './fixtures.js';

describe('exported types', () => {
  describe('ActivationInput', () => {
    test('should have messages as optional Array', () => {
      type Input = ActivationInput<UIMessage>;
      expectTypeOf<Input['messages']>().toEqualTypeOf<Array<UIMessage> | undefined>();
    });

    test('should have context as optional', () => {
      type Input = ActivationInput<UIMessage, { isAdmin: boolean }>;
      expectTypeOf<Input['context']>().toEqualTypeOf<{ isAdmin: boolean } | undefined>();
    });
  });

  describe('InferToolSet', () => {
    test('should infer tools from ToolRecord', () => {
      type Result = InferToolSet<typeof TOOLS>;
      expectTypeOf<keyof Result>().toEqualTypeOf<'plain' | 'calc' | 'cancel' | 'edit' | 'archive'>();
      expectTypeOf<Result['plain']>().toEqualTypeOf<typeof plainTool>();
      expectTypeOf<Result['calc']>().toEqualTypeOf<typeof calcTool>();
      expectTypeOf<Result['cancel']>().toEqualTypeOf<typeof cancelTool>();
      expectTypeOf<Result['edit']>().toEqualTypeOf<typeof editTool>();
      expectTypeOf<Result['archive']>().toEqualTypeOf<typeof archiveTool>();
    });

    test('should infer tools from immutable toolset', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      type Result = InferToolSet<typeof toolSet>;
      expectTypeOf<keyof Result>().toEqualTypeOf<'plain' | 'calc' | 'cancel' | 'edit' | 'archive'>();
      expectTypeOf<Result['plain']>().toEqualTypeOf<typeof plainTool>();
    });

    test('should infer tools from mutable toolset', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      type Result = InferToolSet<typeof toolSet>;
      expectTypeOf<keyof Result>().toEqualTypeOf<'plain' | 'calc' | 'cancel' | 'edit' | 'archive'>();
      expectTypeOf<Result['plain']>().toEqualTypeOf<typeof plainTool>();
    });
  });

  describe('InferUIToolSet', () => {
    test('should infer UI tools from ToolRecord', () => {
      type Result = InferUIToolSet<typeof TOOLS>;
      expectTypeOf<keyof Result>().toEqualTypeOf<'plain' | 'calc' | 'cancel' | 'edit' | 'archive'>();
      expectTypeOf<Result['plain']>().toEqualTypeOf<InferUITool<typeof plainTool>>();
    });

    test('should infer UI tools from immutable toolset', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      type Result = InferUIToolSet<typeof toolSet>;
      expectTypeOf<keyof Result>().toEqualTypeOf<'plain' | 'calc' | 'cancel' | 'edit' | 'archive'>();
      expectTypeOf<Result['plain']>().toEqualTypeOf<InferUITool<typeof plainTool>>();
    });

    test('should infer UI tools from mutable toolset', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      type Result = InferUIToolSet<typeof toolSet>;
      expectTypeOf<keyof Result>().toEqualTypeOf<'plain' | 'calc' | 'cancel' | 'edit' | 'archive'>();
      expectTypeOf<Result['plain']>().toEqualTypeOf<InferUITool<typeof plainTool>>();
    });
  });

  describe('InferActiveTools', () => {
    test('should return all tools for fresh immutable toolset', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      expectTypeOf<InferActiveTools<typeof toolSet>>().toEqualTypeOf<
        'plain' | 'calc' | 'cancel' | 'edit' | 'archive'
      >();
    });

    test('should exclude deactivated tools', () => {
      const toolSet = createToolSet({ tools: TOOLS }).deactivate(['plain', 'calc']);
      expectTypeOf<InferActiveTools<typeof toolSet>>().toEqualTypeOf<'cancel' | 'edit' | 'archive'>();
    });

    test('should track activateWhen as inactive', () => {
      const toolSet = createToolSet({ tools: TOOLS }).activateWhen('cancel', () => true);
      expectTypeOf<InferActiveTools<typeof toolSet>>().toEqualTypeOf<'plain' | 'calc' | 'edit' | 'archive'>();
    });

    test('should track deactivateWhen as active', () => {
      const toolSet = createToolSet({ tools: TOOLS }).deactivateWhen('plain', () => true);
      expectTypeOf<InferActiveTools<typeof toolSet>>().toEqualTypeOf<keyof typeof TOOLS>();
    });

    test('should track chained operations', () => {
      const toolSet = createToolSet({ tools: TOOLS })
        .deactivate(['cancel'])
        .activateWhen('edit', () => true)
        .deactivateWhen('plain', () => true);
      expectTypeOf<InferActiveTools<typeof toolSet>>().toEqualTypeOf<'plain' | 'calc' | 'archive'>();
    });

    test('should return never for mutable toolset', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      expectTypeOf<InferActiveTools<typeof toolSet>>().toEqualTypeOf<never>();
    });
  });

  describe('ToolSet', () => {
    test('should accept an immutable instance', () => {
      const base = createToolSet({ tools: TOOLS }).deactivate(['plain']);
      const fn = (_toolSet: ToolSet<typeof base>) => {};
      fn(base);
      fn(base.clone({ mutable: true }));
    });

    test('should accept a mutable instance', () => {
      const base = createToolSet({ tools: TOOLS, mutable: true });
      const fn = (_toolSet: ToolSet<typeof base>) => {};
      fn(base);
      fn(base.clone());
    });

    test('should preserve TOOLS inferred from immutable source', () => {
      const base = createToolSet({ tools: TOOLS });
      expectTypeOf<InferToolSet<ToolSet<typeof base>>>().toEqualTypeOf<typeof TOOLS>();
    });

    test('should preserve TOOLS inferred from mutable source', () => {
      const base = createToolSet({ tools: TOOLS, mutable: true });
      expectTypeOf<InferToolSet<ToolSet<typeof base>>>().toEqualTypeOf<typeof TOOLS>();
    });

    test('should reject unknown tool names on an immutable source helper', () => {
      const base = createToolSet({ tools: TOOLS });
      const fn = (toolSet: ToolSet<typeof base>) => {
        toolSet.activate(['plain']);
        // @ts-expect-error — 'unknown' is not in TOOLS
        toolSet.activate(['unknown']);
      };
      fn(base);
    });

    test('should reject unknown tool names on a mutable source helper', () => {
      const base = createToolSet({ tools: TOOLS, mutable: true });
      const fn = (toolSet: ToolSet<typeof base>) => {
        toolSet.activate(['plain']);
        // @ts-expect-error — 'unknown' is not in TOOLS
        toolSet.activate(['unknown']);
      };
      fn(base);
    });

    test('should preserve MESSAGE generic from immutable source', () => {
      const base = createToolSet<typeof TOOLS, ModelMessage>({ tools: TOOLS });
      type Input = Parameters<Extract<ToolSet<typeof base>, { activateWhen: (...args: any) => any }>['inferTools']>[0];
      expectTypeOf<NonNullable<Input>['messages']>().toEqualTypeOf<Array<ModelMessage> | undefined>();
    });

    test('should preserve CONTEXT generic from immutable source', () => {
      type MyCtx = { isAdmin: boolean };
      const base = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      type Input = Parameters<Extract<ToolSet<typeof base>, { activateWhen: (...args: any) => any }>['inferTools']>[0];
      expectTypeOf<NonNullable<Input>['context']>().toEqualTypeOf<MyCtx | undefined>();
    });
  });

  describe('InferInactiveTools', () => {
    test('should return never for fresh immutable toolset', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      expectTypeOf<InferInactiveTools<typeof toolSet>>().toEqualTypeOf<never>();
    });

    test('should include deactivated tools', () => {
      const toolSet = createToolSet({ tools: TOOLS }).deactivate(['plain', 'calc']);
      expectTypeOf<InferInactiveTools<typeof toolSet>>().toEqualTypeOf<'plain' | 'calc'>();
    });

    test('should track activateWhen as inactive', () => {
      const toolSet = createToolSet({ tools: TOOLS }).activateWhen({
        cancel: () => true,
        edit: () => true,
      });
      expectTypeOf<InferInactiveTools<typeof toolSet>>().toEqualTypeOf<'cancel' | 'edit'>();
    });

    test('should return never for mutable toolset', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      expectTypeOf<InferInactiveTools<typeof toolSet>>().toEqualTypeOf<never>();
    });
  });
});

describe('createToolSet', () => {
  test('should infer tool names from options', () => {
    const toolSet = createToolSet({ tools: TOOLS });
    expectTypeOf(toolSet.tools).toHaveProperty('plain');
    expectTypeOf(toolSet.tools).toHaveProperty('calc');
    expectTypeOf(toolSet.tools).toHaveProperty('cancel');
    expectTypeOf(toolSet.tools).toHaveProperty('edit');
    expectTypeOf(toolSet.tools).toHaveProperty('archive');
  });
});

describe('immutable toolset', () => {
  describe('tools', () => {
    test('should type tools as raw Tool types', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      expectTypeOf(toolSet.tools.plain).toEqualTypeOf<typeof plainTool>();
      expectTypeOf(toolSet.tools.calc).toEqualTypeOf<typeof calcTool>();
    });
  });

  describe('activate / deactivate', () => {
    test('should accept tool names', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.activate(['plain', 'calc']);
      toolSet.deactivate(['plain', 'calc']);
    });

    test('should reject unknown tool names', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.activate(['unknown']);
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.deactivate(['unknown']);
    });

    test('should support chaining', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.deactivate(['plain']).activate(['plain']);
      toolSet.activate(['plain']).deactivate(['plain']);
    });
  });

  describe('activateWhen / deactivateWhen', () => {
    test('should accept name + predicate', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.activateWhen('cancel', () => true);
      toolSet.deactivateWhen('plain', () => true);
    });

    test('should accept object form', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.activateWhen({ cancel: () => true, edit: () => false });
      toolSet.deactivateWhen({ plain: () => true });
    });

    test('should reject unknown tool names', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.activateWhen('unknown', () => true);
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.deactivateWhen('unknown', () => true);
    });

    test('should reject unknown tool names in object form', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.activateWhen({ unknown: () => true });
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.deactivateWhen({ unknown: () => true });
    });

    test('should accept predicates returning undefined', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.activateWhen('cancel', () => undefined);
      toolSet.deactivateWhen('plain', () => undefined);
      toolSet.activateWhen('cancel', ({ messages }) => messages?.some((m) => m.parts.length > 0));
      toolSet.deactivateWhen('plain', ({ messages }) => messages?.some((m) => m.parts.length > 0));
    });
  });

  describe('inferTools', () => {
    test('should accept no arguments', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      const result = toolSet.inferTools();
      expectTypeOf(result).toHaveProperty('tools');
      expectTypeOf(result).toHaveProperty('activeTools');
    });

    test('should accept messages only', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.inferTools({ messages: [] as Array<MyUIMessage> });
    });

    test('should accept context only', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      toolSet.inferTools({ context: { isAdmin: true } });
    });

    test('should accept both messages and context', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      toolSet.inferTools({ messages: [], context: { isAdmin: true } });
    });

    test('should return tools and activeTools', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      const result = toolSet.inferTools();
      expectTypeOf(result.tools).toEqualTypeOf<typeof TOOLS>();
      expectTypeOf(result.activeTools).toEqualTypeOf<Array<keyof typeof TOOLS & string>>();
    });
  });

  describe('MESSAGE generic', () => {
    test('should type predicates with ModelMessage', () => {
      const toolSet = createToolSet<typeof TOOLS, ModelMessage>({ tools: TOOLS });
      toolSet.activateWhen('cancel', ({ messages }) =>
        messages?.some(
          (m) =>
            m.role === 'tool' &&
            Array.isArray(m.content) &&
            m.content.some((p) => p.type === 'tool-result' && p.toolName === 'cancel'),
        ),
      );
    });

    test('should type inferTools with ModelMessage', () => {
      const toolSet = createToolSet<typeof TOOLS, ModelMessage>({ tools: TOOLS });
      toolSet.inferTools({ messages: [] as Array<ModelMessage> });
    });
  });

  describe('CONTEXT generic', () => {
    test('should type predicates with custom context', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      toolSet.activateWhen('cancel', ({ context }) => context?.isAdmin);
    });

    test('should type inferTools with custom context', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      toolSet.inferTools({ context: { isAdmin: true } });
    });

    test('should reject wrong context shape', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      // @ts-expect-error — context is missing isAdmin
      toolSet.inferTools({ context: {} });
    });
  });

  describe('clone', () => {
    test('should return immutable toolset by default', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      const cloned = toolSet.clone();
      expectTypeOf(cloned.tools).toEqualTypeOf<typeof TOOLS>();
      // Immutable: deactivate returns new instance with updated types
      const deactivated = cloned.deactivate(['plain']);
      expectTypeOf<InferActiveTools<typeof deactivated>>().toEqualTypeOf<'calc' | 'cancel' | 'edit' | 'archive'>();
    });

    test('should preserve InferActiveTools and InferInactiveTools types', () => {
      const toolSet = createToolSet({ tools: TOOLS }).deactivate(['plain', 'calc']);
      const cloned = toolSet.clone();
      expectTypeOf<InferActiveTools<typeof cloned>>().toEqualTypeOf<'cancel' | 'edit' | 'archive'>();
      expectTypeOf<InferInactiveTools<typeof cloned>>().toEqualTypeOf<'plain' | 'calc'>();
    });

    test('should return mutable toolset with mutable: true', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      const cloned = toolSet.clone({ mutable: true });
      expectTypeOf(cloned.tools).toEqualTypeOf<typeof TOOLS>();
      // Mutable: returns this
      const result = cloned.deactivate(['plain']);
      expectTypeOf(result).toEqualTypeOf(cloned);
    });
  });

  describe('spread', () => {
    test('should only expose tools', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      const spread = { ...toolSet };

      expectTypeOf<keyof typeof spread>().toEqualTypeOf<'tools'>();

      // @ts-expect-error — private field
      void spread.state;
      // @ts-expect-error — prototype method
      void spread.activate;
      // @ts-expect-error — prototype method
      void spread.deactivate;
      // @ts-expect-error — prototype method
      void spread.activateWhen;
      // @ts-expect-error — prototype method
      void spread.deactivateWhen;
      // @ts-expect-error — prototype method
      void spread.inferTools;
    });
  });
});

describe('mutable toolset', () => {
  describe('tools', () => {
    test('should type tools as raw Tool types', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      expectTypeOf(toolSet.tools.plain).toEqualTypeOf<typeof plainTool>();
      expectTypeOf(toolSet.tools.calc).toEqualTypeOf<typeof calcTool>();
    });
  });

  describe('activate / deactivate', () => {
    test('should accept tool names', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.activate(['plain', 'calc']);
      toolSet.deactivate(['plain', 'calc']);
    });

    test('should reject unknown tool names', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.activate(['unknown']);
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.deactivate(['unknown']);
    });

    test('should return this', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      const activated = toolSet.activate(['plain']);
      expectTypeOf(activated).toEqualTypeOf(toolSet);

      const deactivated = toolSet.deactivate(['plain']);
      expectTypeOf(deactivated).toEqualTypeOf(toolSet);
    });
  });

  describe('activateWhen / deactivateWhen', () => {
    test('should accept name + predicate', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.activateWhen('cancel', () => true);
      toolSet.deactivateWhen('plain', () => true);
    });

    test('should accept object form', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.activateWhen({ cancel: () => true, edit: () => false });
      toolSet.deactivateWhen({ plain: () => true });
    });

    test('should reject unknown tool names', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.activateWhen('unknown', () => true);
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.deactivateWhen('unknown', () => true);
    });

    test('should reject unknown tool names in object form', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.activateWhen({ unknown: () => true });
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.deactivateWhen({ unknown: () => true });
    });

    test('should accept predicates returning undefined', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.activateWhen('cancel', () => undefined);
      toolSet.deactivateWhen('plain', () => undefined);
      toolSet.activateWhen('cancel', ({ messages }) => messages?.some((m) => m.parts.length > 0));
      toolSet.deactivateWhen('plain', ({ messages }) => messages?.some((m) => m.parts.length > 0));
    });
  });

  describe('inferTools', () => {
    test('should accept no arguments', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      const result = toolSet.inferTools();
      expectTypeOf(result).toHaveProperty('tools');
      expectTypeOf(result).toHaveProperty('activeTools');
    });

    test('should accept messages only', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.inferTools({ messages: [] as Array<MyUIMessage> });
    });

    test('should reject wrong context shape', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS, mutable: true });
      // @ts-expect-error — context is missing isAdmin
      toolSet.inferTools({ context: {} });
    });

    test('should return tools and activeTools', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      const result = toolSet.inferTools();
      expectTypeOf(result.tools).toEqualTypeOf<typeof TOOLS>();
      expectTypeOf(result.activeTools).toEqualTypeOf<Array<keyof typeof TOOLS & string>>();
    });
  });

  describe('clone', () => {
    test('should return immutable toolset by default', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      const cloned = toolSet.clone();
      expectTypeOf(cloned.tools).toEqualTypeOf<typeof TOOLS>();
      // Immutable: deactivate returns new instance with updated types
      const deactivated = cloned.deactivate(['plain']);
      expectTypeOf<InferActiveTools<typeof deactivated>>().toEqualTypeOf<'calc' | 'cancel' | 'edit' | 'archive'>();
    });

    test('should return mutable toolset with mutable: true', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      const cloned = toolSet.clone({ mutable: true });
      expectTypeOf(cloned.tools).toEqualTypeOf<typeof TOOLS>();
      // Mutable: returns this
      const result = cloned.deactivate(['plain']);
      expectTypeOf(result).toEqualTypeOf(cloned);
    });

    test('should not preserve InferActiveTools and InferInactiveTools types', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.deactivate(['plain', 'calc']);
      const cloned = toolSet.clone({ mutable: true });
      expectTypeOf<InferActiveTools<typeof cloned>>().toEqualTypeOf<never>();
      expectTypeOf<InferInactiveTools<typeof cloned>>().toEqualTypeOf<never>();
    });
  });

  describe('spread', () => {
    test('should only expose tools', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      const spread = { ...toolSet };
      expectTypeOf<keyof typeof spread>().toEqualTypeOf<'tools'>();
    });
  });
});

describe('typed UIMessage in callbacks', () => {
  test('should narrow tool parts in activateWhen', () => {
    const myTool = tool({
      description: 'test',
      inputSchema: z.object({ q: z.string() }),
      execute: async () => ({ result: 'ok' }),
    });

    const toolSet = createToolSet({ tools: { my_tool: myTool } });

    toolSet.activateWhen('my_tool', ({ messages }) =>
      messages?.some((m) => m.parts.some((p) => p.type === 'tool-my_tool')),
    );
  });
});
