import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalkthroughService } from '../service.mjs';
import { createWalkthroughMcpServer } from '../server.mjs';

function fixtureApi() {
  const calls = [];
  const issue = { id: 8, batch_id: 3, page_id: 5, seq: 2, code: 'P01-D02', title: '按钮间距', description: '间距应为 16px', item: '设计', dev_status: '待处理', retest_result: '', evidence: [{ id: 9, kind: 'finding', annotated_path: '9/annotated', caption: '红框区域' }], logs: [] };
  const parent = { id: 3, name: '官网走查', env: 'staging', pages: [{ id: 5, no: 1, name: '首页', test_url: 'https://example.test', figma_url: 'https://figma.test' }], issues: [issue, { ...issue, id: 10, code: 'P01-F01', title: '已经完成', retest_result: '已修正' }] };
  return {
    calls,
    async get(path) {
      if (path === '/api/batches') return [{ id: 3, name: '官网走查', issue_count: 2, open_count: 1 }];
      if (path === '/api/batches/3') return parent;
      if (path === '/api/issues/8') return issue;
      throw new Error(`unexpected GET ${path}`);
    },
    async post(path, body) { calls.push({ path, body }); return { ...issue, dev_status: body.dev_status || issue.dev_status }; },
    async file(path) { assert.equal(path, '9/annotated'); return { mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }; },
  };
}

test('默认只列出未复测通过的问题', async () => {
  const result = await createWalkthroughService(fixtureApi()).listIssues({ batch_id: 3 });
  assert.equal(result.total, 1);
  assert.equal(result.issues[0].page, 'P01 首页');
});

test('回报修正固定更新为已修复待复测', async () => {
  const api = fixtureApi();
  const result = await createWalkthroughService(api).reportIssueFix({ issue_id: 8, summary: '改为 16px', validation: ['npm test'] });
  assert.equal(result.status, '已修复待复测');
  assert.equal(api.calls[0].body.dev_status, '已修复待复测');
});

test('提供七个 MCP 工具', () => {
  const server = createWalkthroughMcpServer(createWalkthroughService(fixtureApi()));
  for (const name of ['list_batches', 'list_issues', 'get_issue', 'get_issue_evidence', 'start_issue', 'add_issue_note', 'report_issue_fix']) {
    assert.ok(server.toolInputSchemaJson(name), `${name} missing`);
  }
});

