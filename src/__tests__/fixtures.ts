import { tool } from 'ai';
import type { UIMessage } from 'ai';
import { z } from 'zod';
import { type InferUIToolSet } from '../tool-set.js';

export const plainTool = tool({
  description: 'A plain tool without activation control',
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }) => ({ result: query }),
});

export const calcTool = tool({
  description: 'A calculator tool',
  inputSchema: z.object({ expression: z.string() }),
  execute: async () => ({ value: 42 }),
});

export const cancelTool = tool({
  description: 'Cancel an order',
  inputSchema: z.object({ orderId: z.string() }),
  execute: async () => ({ success: true }),
});

export const editTool = tool({
  description: 'Edit an order',
  inputSchema: z.object({ orderId: z.string(), changes: z.string() }),
  execute: async () => ({ success: true }),
});

export const archiveTool = tool({
  description: 'Archive an item',
  inputSchema: z.object({ itemId: z.string() }),
  execute: async () => ({ archived: true }),
});

/** Plain tool record — all tools, no activation config. */
export const TOOLS = {
  plain: plainTool,
  calc: calcTool,
  cancel: cancelTool,
  edit: editTool,
  archive: archiveTool,
};

export type MyUIMessage = UIMessage<unknown, any, InferUIToolSet<typeof TOOLS>>;

export const makeMessage = (parts: MyUIMessage['parts'] = [], role: MyUIMessage['role'] = 'user'): MyUIMessage => ({
  id: '1',
  role,
  parts,
});
