const pageLabel = (page) => `P${String(page.no).padStart(2, '0')} ${page.name}`;
const issueLabel = (issue) => `${issue.code || `#${issue.id}`} ${issue.title}`;

function publicIssue(issue, pages = []) {
  const page = pages.find((row) => row.id === issue.page_id);
  return {
    id: issue.id,
    code: issue.code,
    sequence: issue.seq,
    title: issue.title,
    description: issue.description || '',
    item: issue.item,
    sub_dimension: issue.sub_dim || '',
    platform: issue.platform || '',
    page_id: issue.page_id,
    page: page ? pageLabel(page) : '',
    test_url: page?.test_url || '',
    figma_url: issue.figma_node_url || page?.figma_url || '',
    viewport_width: issue.viewport_width || null,
    trigger_state: issue.trigger_state || '',
    also_on: issue.also_on || '',
    status: issue.dev_status,
    retest_result: issue.retest_result || '未复测',
    evidence_count: Number(issue.evidence_count || issue.evidence?.filter((row) => row.kind === 'finding').length || 0),
    updated_at: issue.updated_at,
  };
}

export function createWalkthroughService(api) {
  async function batch(batchId) {
    return api.get(`/api/batches/${Number(batchId)}`);
  }

  async function issueContext(issueId) {
    const issue = await api.get(`/api/issues/${Number(issueId)}`);
    const parent = await batch(issue.batch_id);
    return { issue, batch: parent, pages: parent.pages || [] };
  }

  return {
    async listBatches() {
      const rows = await api.get('/api/batches');
      return rows.map((row) => ({
        id: row.id, name: row.name, environment: row.env || '', base_url: row.base_url || '',
        pages: Number(row.page_count || 0), issues: Number(row.issue_count || 0), open_issues: Number(row.open_count || 0),
        updated_at: row.updated_at,
      }));
    },

    async listIssues({ batch_id, status = 'open', page_id, item, search, limit = 50 }) {
      const parent = await batch(batch_id);
      const query = String(search || '').trim().toLowerCase();
      const issues = (parent.issues || []).filter((issue) => {
        if (status === 'open' && issue.retest_result === '已修正') return false;
        if (!['open', 'all'].includes(status) && issue.dev_status !== status) return false;
        if (page_id && issue.page_id !== page_id) return false;
        if (item && issue.item !== item) return false;
        if (query && !`${issue.code} ${issue.title} ${issue.description || ''}`.toLowerCase().includes(query)) return false;
        return true;
      });
      return {
        batch: { id: parent.id, name: parent.name },
        total: issues.length,
        issues: issues.slice(0, Math.min(100, Math.max(1, limit))).map((issue) => publicIssue(issue, parent.pages)),
      };
    },

    async getIssue({ issue_id }) {
      const context = await issueContext(issue_id);
      const detail = publicIssue(context.issue, context.pages);
      return {
        ...detail,
        batch: { id: context.batch.id, name: context.batch.name, environment: context.batch.env || '', base_url: context.batch.base_url || '' },
        evidence: (context.issue.evidence || []).filter((row) => row.kind === 'finding').map((row) => ({
          id: row.id, caption: row.caption || '', annotated_path: row.annotated_path, width: row.width, height: row.height,
        })),
        history: (context.issue.logs || []).map((row) => ({
          field: row.field, from: row.from_value, to: row.to_value, note: row.note || '', operator: row.operator || '', created_at: row.created_at,
        })),
      };
    },

    async getIssueEvidence({ issue_id, evidence_id }) {
      const context = await issueContext(issue_id);
      const findings = (context.issue.evidence || []).filter((row) => row.kind === 'finding');
      const evidence = evidence_id ? findings.find((row) => row.id === evidence_id) : findings[0];
      if (!evidence) throw new Error(evidence_id ? '找不到这个问题的指定截图' : '这个问题没有走查截图');
      const image = await api.file(evidence.annotated_path || evidence.original_path);
      return {
        issue: publicIssue(context.issue, context.pages), evidence: { id: evidence.id, caption: evidence.caption || '' }, ...image,
      };
    },

    async startIssue({ issue_id, note = '' }) {
      const updated = await api.post(`/api/issues/${Number(issue_id)}/status`, {
        dev_status: '处理中', note: String(note || '').trim().slice(0, 2000), operator: '技术端 AI',
      });
      return { ok: true, issue: issueLabel(updated), status: updated.dev_status };
    },

    async addIssueNote({ issue_id, note }) {
      const updated = await api.post(`/api/issues/${Number(issue_id)}/status`, {
        note: String(note).trim().slice(0, 4000), operator: '技术端 AI',
      });
      return { ok: true, issue: issueLabel(updated), status: updated.dev_status, note_recorded: true };
    },

    async reportIssueFix({ issue_id, summary, validation = [], reference = '' }) {
      const checks = Array.isArray(validation) ? validation : [validation];
      const lines = [`修正说明：${String(summary).trim()}`];
      if (checks.filter(Boolean).length) lines.push(`验证：${checks.filter(Boolean).map(String).join('；')}`);
      if (String(reference || '').trim()) lines.push(`参考：${String(reference).trim()}`);
      const updated = await api.post(`/api/issues/${Number(issue_id)}/status`, {
        dev_status: '已修复待复测', note: lines.join('\n').slice(0, 4000), operator: '技术端 AI',
      });
      return { ok: true, issue: issueLabel(updated), status: updated.dev_status, next: '等待管理者复测' };
    },
  };
}

