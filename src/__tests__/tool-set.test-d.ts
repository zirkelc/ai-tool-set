import type { InferUITool, ModelMessage, PrepareStepResult, StepResult, ToolChoice, UIMessage } from 'ai';
import { tool } from 'ai';
import { describe, expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import {
  createToolSet,
  type AnyToolSet,
  type InferActiveTools,
  type InferAllTools,
  type InferConditionalTools,
  type InferInactiveTools,
  type InferToolSet,
  type InferToolSetContext,
  type InferToolsInput,
  type InferUIToolSet,
  type ResolvedToolSet,
  type ToolSet,
} from '../tool-set.js';
import { TOOLS, type MyUIMessage, plainTool, calcTool, cancelTool, editTool, archiveTool } from './fixtures.js';

describe('exported types', () => {
  describe('InferToolsInput', () => {
    test('should have messages as optional Array', () => {
      type Input = InferToolsInput<typeof TOOLS, UIMessage>;
      expectTypeOf<Input['messages']>().toEqualTypeOf<Array<UIMessage> | undefined>();
    });

    test('should have steps inferred from the tool set', () => {
      type Input = InferToolsInput<typeof TOOLS>;
      expectTypeOf<Input['steps']>().toEqualTypeOf<Array<StepResult<typeof TOOLS>> | undefined>();
    });

    /**
     * `toolCalls[n].toolName` is `string`, NOT the tool-name union:
     * `TypedToolCall = StaticToolCall | DynamicToolCall`, and the dynamic branch's
     * `toolName` is `string`, which widens the union. Use `staticToolCalls` for the
     * narrowed declared names (next test).
     */
    test('should type steps toolCalls toolName as string', () => {
      type Step = NonNullable<InferToolsInput<typeof TOOLS>['steps']>[number];
      expectTypeOf<Step['toolCalls'][number]['toolName']>().toEqualTypeOf<string>();
    });

    test('should narrow steps staticToolCalls toolName to the tool-name union', () => {
      type Step = NonNullable<InferToolsInput<typeof TOOLS>['steps']>[number];
      expectTypeOf<Step['staticToolCalls'][number]['toolName']>().toEqualTypeOf<
        'plain' | 'calc' | 'cancel' | 'edit' | 'archive'
      >();
    });

    test('should thread the runtime context into steps', () => {
      type Input = InferToolsInput<typeof TOOLS, UIMessage, Record<string, unknown>, { userId: string }>;
      type Step = NonNullable<Input['steps']>[number];
      expectTypeOf<Step['runtimeContext']>().toEqualTypeOf<{ userId: string }>();
    });

    test('should have toolSetContext as optional', () => {
      type Input = InferToolsInput<typeof TOOLS, UIMessage, { isAdmin: boolean }>;
      expectTypeOf<Input['toolSetContext']>().toEqualTypeOf<{ isAdmin: boolean } | undefined>();
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

    test('should exclude activateWhen tools', () => {
      const toolSet = createToolSet({ tools: TOOLS }).activateWhen('cancel', () => true);
      expectTypeOf<InferActiveTools<typeof toolSet>>().toEqualTypeOf<'plain' | 'calc' | 'edit' | 'archive'>();
    });

    test('should exclude deactivateWhen tools', () => {
      const toolSet = createToolSet({ tools: TOOLS }).deactivateWhen('plain', () => true);
      expectTypeOf<InferActiveTools<typeof toolSet>>().toEqualTypeOf<'calc' | 'cancel' | 'edit' | 'archive'>();
    });

    test('should track chained operations', () => {
      const toolSet = createToolSet({ tools: TOOLS })
        .deactivate(['cancel'])
        .activateWhen('edit', () => true)
        .deactivateWhen('plain', () => true);
      expectTypeOf<InferActiveTools<typeof toolSet>>().toEqualTypeOf<'calc' | 'archive'>();
    });

    test('should track a single tool name', () => {
      const toolSet = createToolSet({ tools: TOOLS }).deactivate('plain');
      expectTypeOf<InferActiveTools<typeof toolSet>>().toEqualTypeOf<'calc' | 'cancel' | 'edit' | 'archive'>();
    });

    test('should return never for mutable toolset', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      expectTypeOf<InferActiveTools<typeof toolSet>>().toEqualTypeOf<never>();
    });
  });

  describe('order', () => {
    test('should preserve activation tracking through the chain', () => {
      const toolSet = createToolSet({ tools: TOOLS }).deactivate(['plain', 'calc']).order('stable');
      expectTypeOf<InferActiveTools<typeof toolSet>>().toEqualTypeOf<'cancel' | 'edit' | 'archive'>();
    });

    test('should constrain an explicit name list to tool names', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.order(['plain', 'calc']);
      // @ts-expect-error unknown tool name is rejected
      toolSet.order(['nope']);
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

    test('should preserve TOOLSET_CONTEXT generic from immutable source', () => {
      type MyCtx = { isAdmin: boolean };
      const base = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      type Input = Parameters<Extract<ToolSet<typeof base>, { activateWhen: (...args: any) => any }>['inferTools']>[0];
      expectTypeOf<NonNullable<Input>['toolSetContext']>().toEqualTypeOf<MyCtx | undefined>();
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

    test('should exclude activateWhen tools', () => {
      const toolSet = createToolSet({ tools: TOOLS }).activateWhen({
        cancel: () => true,
        edit: () => true,
      });
      expectTypeOf<InferInactiveTools<typeof toolSet>>().toEqualTypeOf<never>();
    });

    test('should remove a deactivated tool when it becomes conditional', () => {
      const toolSet = createToolSet({ tools: TOOLS })
        .deactivate(['plain', 'calc'])
        .activateWhen('plain', () => true);
      expectTypeOf<InferInactiveTools<typeof toolSet>>().toEqualTypeOf<'calc'>();
    });

    test('should return never for mutable toolset', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      expectTypeOf<InferInactiveTools<typeof toolSet>>().toEqualTypeOf<never>();
    });
  });

  describe('InferConditionalTools', () => {
    test('should return never for fresh immutable toolset', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      expectTypeOf<InferConditionalTools<typeof toolSet>>().toEqualTypeOf<never>();
    });

    test('should include activateWhen and deactivateWhen tools', () => {
      const toolSet = createToolSet({ tools: TOOLS })
        .activateWhen('cancel', () => true)
        .deactivateWhen({ plain: () => true, edit: () => true });
      expectTypeOf<InferConditionalTools<typeof toolSet>>().toEqualTypeOf<'cancel' | 'plain' | 'edit'>();
    });

    test('should remove a tool after a static activate or deactivate', () => {
      const toolSet = createToolSet({ tools: TOOLS })
        .activateWhen({ cancel: () => true, edit: () => true, archive: () => true })
        .activate('cancel')
        .deactivate(['edit']);
      expectTypeOf<InferConditionalTools<typeof toolSet>>().toEqualTypeOf<'archive'>();
      expectTypeOf<InferActiveTools<typeof toolSet>>().toEqualTypeOf<'plain' | 'calc' | 'cancel'>();
      expectTypeOf<InferInactiveTools<typeof toolSet>>().toEqualTypeOf<'edit'>();
    });

    test('should return all tools for mutable toolset', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      expectTypeOf<InferConditionalTools<typeof toolSet>>().toEqualTypeOf<
        'plain' | 'calc' | 'cancel' | 'edit' | 'archive'
      >();
    });
  });

  describe('InferAllTools', () => {
    test('should return all tools for fresh immutable toolset', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      expectTypeOf<InferAllTools<typeof toolSet>>().toEqualTypeOf<'plain' | 'calc' | 'cancel' | 'edit' | 'archive'>();
    });

    test('should return all tools regardless of activation state', () => {
      const toolSet = createToolSet({ tools: TOOLS }).deactivate(['plain', 'calc']);
      expectTypeOf<InferAllTools<typeof toolSet>>().toEqualTypeOf<'plain' | 'calc' | 'cancel' | 'edit' | 'archive'>();
    });

    test('should return all tools after chained operations', () => {
      const toolSet = createToolSet({ tools: TOOLS })
        .deactivate(['cancel'])
        .activateWhen('edit', () => true)
        .deactivateWhen('plain', () => true);
      expectTypeOf<InferAllTools<typeof toolSet>>().toEqualTypeOf<'plain' | 'calc' | 'cancel' | 'edit' | 'archive'>();
    });

    test('should return all tools for mutable toolset', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      expectTypeOf<InferAllTools<typeof toolSet>>().toEqualTypeOf<'plain' | 'calc' | 'cancel' | 'edit' | 'archive'>();
    });
  });

  describe('InferToolSetContext', () => {
    test('should infer TOOLSET_CONTEXT from an immutable toolset', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS }).deactivate(['plain']);
      expectTypeOf<InferToolSetContext<typeof toolSet>>().toEqualTypeOf<MyCtx>();
    });

    test('should infer TOOLSET_CONTEXT from a mutable toolset', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS, mutable: true });
      expectTypeOf<InferToolSetContext<typeof toolSet>>().toEqualTypeOf<MyCtx>();
    });

    test('should default to Record<string, unknown>', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      expectTypeOf<InferToolSetContext<typeof toolSet>>().toEqualTypeOf<Record<string, unknown>>();
    });

    test('should infer TOOLSET_CONTEXT from a ToolSet union', () => {
      type MyCtx = { isAdmin: boolean };
      const base = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      expectTypeOf<InferToolSetContext<ToolSet<typeof base>>>().toEqualTypeOf<MyCtx>();
    });
  });

  describe('ResolvedToolSet', () => {
    test('should match the inferTools() return type of an immutable toolset', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      expectTypeOf<ReturnType<typeof toolSet.inferTools>>().toEqualTypeOf<ResolvedToolSet<typeof TOOLS>>();
    });

    test('should match the inferTools() return type of a mutable toolset', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      expectTypeOf<ReturnType<typeof toolSet.inferTools>>().toEqualTypeOf<ResolvedToolSet<typeof TOOLS>>();
    });

    test('should carry RUNTIME_CONTEXT', () => {
      type MyRuntime = { userId: string };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, Record<string, unknown>, MyRuntime>({ tools: TOOLS });
      expectTypeOf<ReturnType<typeof toolSet.inferTools>>().toEqualTypeOf<ResolvedToolSet<typeof TOOLS, MyRuntime>>();
    });
  });

  describe('AnyToolSet', () => {
    type MyCtx = { isAdmin: boolean };

    /**
     * Through a generic TOOLSET, `inferTools()` resolves against the `any` arguments of the
     * constraint, so the result is annotated with the toolset's own tools.
     */
    function run<TOOLSET extends AnyToolSet>(input: {
      toolSet: TOOLSET;
      toolSetContext?: InferToolSetContext<TOOLSET>;
    }): ResolvedToolSet<InferToolSet<TOOLSET>> {
      const result: ResolvedToolSet<InferToolSet<TOOLSET>> = input.toolSet.inferTools({
        toolSetContext: input.toolSetContext,
      });
      const _tools: InferToolSet<TOOLSET> = result.tools;
      return result;
    }

    test('should accept an immutable toolset with its context', () => {
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS }).deactivate(['plain']);
      const result = run({ toolSet, toolSetContext: { isAdmin: true } });
      expectTypeOf(result.tools).toEqualTypeOf<typeof TOOLS>();
      expectTypeOf(result.toolChoice).toEqualTypeOf<ToolChoice<typeof TOOLS> | undefined>();
    });

    test('should accept a mutable toolset with its context', () => {
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS, mutable: true });
      const result = run({ toolSet, toolSetContext: { isAdmin: true } });
      expectTypeOf(result.activeTools).toEqualTypeOf<Array<keyof typeof TOOLS & string>>();
    });

    test('should accept a toolset without context', () => {
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      run({ toolSet });
    });

    test('should reject a context that does not match the toolset', () => {
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      // @ts-expect-error — isAdmin must be a boolean
      run({ toolSet, toolSetContext: { isAdmin: 'yes' } });
      // @ts-expect-error — userId is not in MyCtx
      run({ toolSet: toolSet.clone({ mutable: true }), toolSetContext: { userId: '1' } });
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

    test('should accept a single tool name', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.activate('plain');
      toolSet.deactivate('plain');
    });

    test('should reject unknown tool names', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.activate(['unknown']);
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.deactivate(['unknown']);
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.activate('unknown');
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.deactivate('unknown');
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

    test('should type steps in predicates', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.activateWhen('cancel', ({ steps }) =>
        steps?.some((s) => s.staticToolCalls.some((c) => c.toolName === 'cancel')),
      );
      toolSet.deactivateWhen('plain', ({ steps }) =>
        steps?.some((s) => s.staticToolCalls.some((c) => c.toolName === 'plain')),
      );
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

    test('should accept toolSetContext only', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      toolSet.inferTools({ toolSetContext: { isAdmin: true } });
    });

    test('should accept steps only', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.inferTools({ steps: [] as Array<StepResult<typeof TOOLS>> });
    });

    test('should accept both messages and toolSetContext', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      toolSet.inferTools({ messages: [], toolSetContext: { isAdmin: true } });
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

  describe('TOOLSET_CONTEXT generic', () => {
    test('should type predicates with custom toolSetContext', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      toolSet.activateWhen('cancel', ({ toolSetContext }) => toolSetContext?.isAdmin);
    });

    test('should type inferTools with custom toolSetContext', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      toolSet.inferTools({ toolSetContext: { isAdmin: true } });
    });

    test('should reject wrong toolSetContext shape', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      // @ts-expect-error — toolSetContext is missing isAdmin
      toolSet.inferTools({ toolSetContext: {} });
    });
  });

  describe('RUNTIME_CONTEXT generic', () => {
    test('should type runtimeContext on steps in predicates', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, Record<string, unknown>, MyCtx>({ tools: TOOLS });
      toolSet.activateWhen('cancel', ({ steps }) => steps?.some((s) => s.runtimeContext.isAdmin));
    });
  });

  describe('approval', () => {
    test('should accept tool names for approve and deny', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.approve(['cancel', 'edit']);
      toolSet.deny(['cancel']);
    });

    test('should accept a single tool name for approve and deny', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.approve('cancel');
      toolSet.deny('cancel');
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.approve('unknown');
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.deny('unknown');
    });

    test('should reject unknown tool names for approve and deny', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.approve(['unknown']);
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.deny(['unknown']);
    });

    test('should accept a constant status', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.approval('cancel', 'user-approval');
      toolSet.approval('cancel', { type: 'denied', reason: 'nope' });
      toolSet.approval('cancel', undefined);
    });

    test('should type the resolver input as the inferTools input', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      toolSet.approval('cancel', (input) => {
        expectTypeOf(input.toolSetContext).toEqualTypeOf<MyCtx | undefined>();
        expectTypeOf(input.messages).toEqualTypeOf<Array<UIMessage> | undefined>();
        return 'approved';
      });
    });

    test('should type the deferred function input per tool', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.approval('cancel', () => (input) => {
        expectTypeOf(input).toEqualTypeOf<{ orderId: string }>();
        return 'approved';
      });
      toolSet.approval('edit', () => (input) => {
        expectTypeOf(input).toEqualTypeOf<{ orderId: string; changes: string }>();
        return undefined;
      });
    });

    test('should type the deferred function runtimeContext', () => {
      type MyRuntime = { role: string };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, Record<string, unknown>, MyRuntime>({ tools: TOOLS });
      toolSet.approval('cancel', () => (_input, options) => {
        expectTypeOf(options.runtimeContext).toEqualTypeOf<MyRuntime>();
        return 'approved';
      });
    });

    test('should accept the record form', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.approval({ cancel: 'denied', edit: ({ toolSetContext }) => (toolSetContext ? 'approved' : undefined) });
    });

    test('should reject unknown tool names in approval', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.approval('unknown', 'denied');
    });

    test('should expose toolApproval on inferTools result', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      const result = toolSet.inferTools();
      expectTypeOf(result).toHaveProperty('toolApproval');
    });
  });

  describe('choice', () => {
    test('should accept the string toolChoice values', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.choice('auto');
      toolSet.choice('none');
      toolSet.choice('required');
    });

    test('should accept a tool toolChoice with a known tool name', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.choice({ type: 'tool', toolName: 'plain' });
      toolSet.choice({ type: 'tool', toolName: 'cancel' });
    });

    test('should reject a tool toolChoice with an unknown tool name', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.choice({ type: 'tool', toolName: 'unknown' });
    });

    test('should type the resolver input as the inferTools input', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS });
      toolSet.choice((input) => {
        expectTypeOf(input.toolSetContext).toEqualTypeOf<MyCtx | undefined>();
        expectTypeOf(input.messages).toEqualTypeOf<Array<UIMessage> | undefined>();
        return 'required';
      });
    });

    test('should allow the resolver to return undefined', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      toolSet.choice(({ steps }) => (steps?.length ? 'auto' : undefined));
    });

    test('should type toolChoice on the inferTools result', () => {
      const toolSet = createToolSet({ tools: TOOLS });
      const result = toolSet.inferTools();
      expectTypeOf(result.toolChoice).toEqualTypeOf<
        | 'auto'
        | 'none'
        | 'required'
        | { type: 'tool'; toolName: 'plain' | 'calc' | 'cancel' | 'edit' | 'archive' }
        | undefined
      >();
    });

    test('should spread the inferTools result into a prepareStep return', () => {
      const toolSet = createToolSet({ tools: TOOLS }).choice('required');
      // The resolved `activeTools` + `toolChoice` are accepted by PrepareStepResult.
      const prepareStep = ({ steps }: { steps: Array<StepResult<typeof TOOLS>> }): PrepareStepResult<typeof TOOLS> =>
        toolSet.inferTools({ steps });
      expectTypeOf(prepareStep).toBeFunction();
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

    test('should accept a single tool name', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.activate('plain');
      toolSet.deactivate('plain');
      toolSet.approve('cancel');
      toolSet.deny('cancel');
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.activate('unknown');
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

  describe('choice', () => {
    test('should return this', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      const result = toolSet.choice('required');
      expectTypeOf(result).toEqualTypeOf(toolSet);
    });

    test('should reject a tool toolChoice with an unknown tool name', () => {
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      // @ts-expect-error — 'unknown' is not in TOOLS
      toolSet.choice({ type: 'tool', toolName: 'unknown' });
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

    test('should reject wrong toolSetContext shape', () => {
      type MyCtx = { isAdmin: boolean };
      const toolSet = createToolSet<typeof TOOLS, UIMessage, MyCtx>({ tools: TOOLS, mutable: true });
      // @ts-expect-error — toolSetContext is missing isAdmin
      toolSet.inferTools({ toolSetContext: {} });
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
      expectTypeOf<InferInactiveTools<typeof deactivated>>().toEqualTypeOf<'plain'>();
      expectTypeOf<InferConditionalTools<typeof deactivated>>().toEqualTypeOf<'calc' | 'cancel' | 'edit' | 'archive'>();
    });

    test('should track all tools as conditional on an immutable clone', () => {
      // The mutable source can have any state, so no tool is statically active or inactive
      const toolSet = createToolSet({ tools: TOOLS, mutable: true });
      toolSet.deactivate(['plain']);
      const cloned = toolSet.clone();
      expectTypeOf<InferActiveTools<typeof cloned>>().toEqualTypeOf<never>();
      expectTypeOf<InferInactiveTools<typeof cloned>>().toEqualTypeOf<never>();
      expectTypeOf<InferConditionalTools<typeof cloned>>().toEqualTypeOf<
        'plain' | 'calc' | 'cancel' | 'edit' | 'archive'
      >();
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
