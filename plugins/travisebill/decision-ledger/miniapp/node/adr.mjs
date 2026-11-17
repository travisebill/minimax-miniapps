// @ts-check

/**
 * ADR rendering for the Decision Ledger.
 *
 * The generated Markdown is what a human pastes into a repository: a numbered decision record
 * with the context, the weighted options, the evidence behind it, and the review date.
 */

const STATUS_LABEL = {
  draft: '草稿',
  decided: '已定案',
  archived: '已封存',
};

const KIND_LABEL = {
  file: '檔案',
  conversation: '對話',
  note: '筆記',
};

/**
 * @param {Record<string, unknown>} decision
 * @returns {number}
 */
export function weightedScore(decision) {
  const options = Array.isArray(decision.options) ? decision.options : [];
  let total = 0;
  let weight = 0;
  for (const option of options) {
    const item = /** @type {Record<string, unknown>} */ (option);
    total += Number(item.score ?? 0) * Number(item.weight ?? 1);
    weight += Number(item.weight ?? 1);
  }
  return weight > 0 ? total / weight : 0;
}

/**
 * @param {unknown} value
 */
function dateOnly(value) {
  if (typeof value !== 'string' || value === '') return '';
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '';
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * @param {Record<string, unknown>} decision
 * @param {number} index
 * @returns {string}
 */
export function buildAdr(decision, index) {
  const number = String(Math.max(1, index)).padStart(4, '0');
  const title = String(decision.title ?? '').trim() || '未命名決策';
  const status = String(decision.status ?? 'draft');
  const options = Array.isArray(decision.options) ? decision.options : [];
  const evidence = Array.isArray(decision.evidence) ? decision.evidence : [];

  const lines = [];
  lines.push(`# ADR-${number}: ${title}`);
  lines.push('');
  lines.push(`- 狀態：${STATUS_LABEL[status] ?? status}`);
  lines.push(`- 決策日期：${dateOnly(decision.decidedAt) || '未定案'}`);
  lines.push(`- 決策者：${String(decision.decidedBy ?? '').trim() || '未署名'}`);
  lines.push(`- 重評日期：${dateOnly(decision.reviewAt) || '未設定'}`);
  lines.push('- 來源：決策台帳（Decision Ledger）');
  lines.push('');
  lines.push('## 情境');
  lines.push('');
  lines.push(String(decision.context ?? '').trim() || '_（尚未記錄情境）_');
  lines.push('');
  lines.push('## 決策');
  lines.push('');
  lines.push(String(decision.rationale ?? '').trim() || '_（尚未記錄決策理由）_');
  lines.push('');
  lines.push('## 評估');
  lines.push('');

  if (options.length === 0) {
    lines.push('_（尚未評估任何選項）_');
  } else {
    lines.push('| 選項 | 評分 (0–10) | 權重 (1–5) | 加權分 | 備註 |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const option of options) {
      const item = /** @type {Record<string, unknown>} */ (option);
      const score = Number(item.score ?? 0);
      const weight = Number(item.weight ?? 1);
      const note = String(item.note ?? '').trim().replace(/\|/g, '\\|');
      lines.push(
        `| ${String(item.label ?? '').trim() || '（未命名）'} | ${score.toFixed(1)} | ${weight} | ${(score * weight).toFixed(1)} | ${note || '—'} |`,
      );
    }
    lines.push('');
    lines.push(`加權平均分：${weightedScore(decision).toFixed(2)}`);
  }

  lines.push('');
  lines.push('## 依據');
  lines.push('');
  if (evidence.length === 0) {
    lines.push('_（尚未記錄依據）_');
  } else {
    for (const item of evidence) {
      const evidenceItem = /** @type {Record<string, unknown>} */ (item);
      const kind = KIND_LABEL[String(evidenceItem.kind ?? 'note')] ?? '筆記';
      const source = String(evidenceItem.source ?? '').trim();
      const detail = String(evidenceItem.detail ?? '').trim();
      const head = source ? `**${kind}** ${source}` : `**${kind}**`;
      lines.push(`- ${head}${detail ? ` — ${detail.replace(/\n+/g, ' ')}` : ''}`);
    }
  }

  lines.push('');
  lines.push('## 事後結果');
  lines.push('');
  lines.push(String(decision.outcome ?? '').trim() || '_（尚未回填結果）_');
  lines.push('');

  return lines.join('\n');
}
