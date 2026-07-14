import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CodexItemView } from '../src/renderer/components/CodexItemView';
import { flattenTurns, normalizeThread } from '../src/renderer/lib/codex';

const legacyThread = normalizeThread({
  id: 'legacy-thread',
  name: { type: 'Legacy thread title' },
  status: { type: 'idle' },
  turns: [
    {
      id: 'legacy-turn',
      status: { type: 'completed' },
      items: [
        {
          id: 'legacy-user',
          type: 'userMessage',
          content: [{ type: 'inputText', text: { type: 'Legacy user message' } }],
          status: { type: 'completed' },
        },
        {
          id: 'legacy-agent',
          type: 'agentMessage',
          text: { type: 'Legacy agent message' },
          status: { type: 'completed' },
        },
        {
          id: 'legacy-command',
          type: 'commandExecution',
          command: [{ type: 'npm' }, { type: 'test' }],
          aggregatedOutput: { type: 'PASS' },
          cwd: { type: '/srv/legacy' },
          status: { type: 'completed' },
          exitCode: 0,
        },
      ],
    },
  ],
});

const markup = renderToStaticMarkup(
  <>{flattenTurns(legacyThread).map((item) => <CodexItemView key={item.id} item={item} />)}</>,
);

for (const expected of ['Legacy user message', 'Legacy agent message', 'npm test']) {
  if (!markup.includes(expected)) throw new Error(`Legacy render did not contain: ${expected}`);
}

console.log('Historical thread schema renders safely.');
