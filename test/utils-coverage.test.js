const assert = require('node:assert/strict');
const test = require('node:test');

const { renderMarkdown, compareIssuesByPriority, sortIssues, sortIssuesByPriority, sortIssuesByDueDate } = require('../out/utils');

test('markdown renderer covers headings, lists, quotes, and code fences', () => {
  const md = [
    '# Heading',
    '',
    'Paragraph with **bold** and _emphasis_ and `code`.',
    '',
    '- item 1',
    '- item 2',
    '',
    '1. first',
    '2. second',
    '',
    '> quote line',
    '',
    '```',
    '<script>alert(1)</script>',
    '```',
  ].join('\n');

  const html = renderMarkdown(md);

  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>emphasis<\/em>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<ul><li>item 1<\/li><li>item 2<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
  assert.match(html, /<blockquote>quote line<\/blockquote>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('sorting helpers cover priority and wrapper sort functions', () => {
  const issues = [
    {
      id: 'a',
      title: 'A',
      description: '',
      groupId: 'g',
      status: 'todo',
      priority: 'low',
      dueDate: '2026-06-20',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
    },
    {
      id: 'b',
      title: 'B',
      description: '',
      groupId: 'g',
      status: 'in-progress',
      priority: 'high',
      dueDate: '2026-06-10',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'c',
      title: 'C',
      description: '',
      groupId: 'g',
      status: 'done',
      priority: 'medium',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
  ];

  assert.ok(compareIssuesByPriority(issues[1], issues[0]) < 0);
  assert.deepEqual(sortIssues([...issues]).map((x) => x.id), ['b', 'a', 'c']);
  assert.deepEqual(sortIssuesByPriority([...issues]).map((x) => x.id), ['b', 'c', 'a']);
  assert.deepEqual(sortIssuesByDueDate([...issues]).map((x) => x.id), ['b', 'a', 'c']);
});

test('sorting helpers cover tie-breaker branches', () => {
  const issues = [
    {
      id: 'x',
      title: 'Alpha',
      description: '',
      groupId: 'g',
      status: 'todo',
      priority: 'medium',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'y',
      title: 'Beta',
      description: '',
      groupId: 'g',
      status: 'todo',
      priority: 'medium',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'z',
      title: 'Gamma',
      description: '',
      groupId: 'g',
      status: 'todo',
      priority: 'medium',
      dueDate: '2026-05-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  assert.deepEqual(sortIssues([...issues]).map((x) => x.id), ['x', 'y', 'z']);
  assert.deepEqual(sortIssuesByPriority([...issues]).map((x) => x.id), ['x', 'y', 'z']);
  assert.deepEqual(sortIssuesByDueDate([issues[0], issues[1]]).map((x) => x.id), ['x', 'y']);
  assert.deepEqual(sortIssuesByDueDate([issues[0], issues[2]]).map((x) => x.id), ['z', 'x']);
});

test('markdown renderer covers alternate block transitions', () => {
  const md = [
    '```',
    'const x = 1;',
    '',
    '> this stays code until fence closes',
    '```',
    '',
    '+ plus-list item',
    '',
    '__strong__ and *em*',
  ].join('\n');

  const html = renderMarkdown(md);
  assert.match(html, /<pre><code>/);
  assert.match(html, /<ul><li>plus-list item<\/li><\/ul>/);
  assert.match(html, /<strong>strong<\/strong>/);
});
