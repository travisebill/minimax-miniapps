/* Decision Ledger — page logic. Runs with or without the Host bridge. */

(() => {
  'use strict';

  const bridge = window.mcode?.miniapp ?? null;

  const state = {
    decisions: [],
    selectedId: null,
    filter: 'all',
    query: '',
    agent: {
      open: false,
      running: false,
      messages: [],
      pendingAsk: null,
    },
  };

  const VIEW_KEY = 'decision-ledger:view';

  const el = {
    list: document.getElementById('list'),
    detail: document.getElementById('detail'),
    search: document.getElementById('search'),
    filters: document.getElementById('filters'),
    stats: document.getElementById('stats'),
    toast: document.getElementById('toast'),
    newDecision: document.getElementById('newDecision'),
    agentPanel: document.getElementById('agentPanel'),
    agentBody: document.getElementById('agentBody'),
    agentSub: document.getElementById('agentSub'),
    agentRun: document.getElementById('agentRun'),
    agentImport: document.getElementById('agentImport'),
    closeAgent: document.getElementById('closeAgent'),
    bridgeState: document.getElementById('bridgeState'),
  };

  /* ── utilities ───────────────────────────────────────────── */

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(value) {
    if (!value) return '—';
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return '—';
    return new Date(time).toISOString().slice(0, 10);
  }

  function fmtDateTime(value) {
    if (!value) return '';
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return '';
    const date = new Date(time);
    return `${date.toISOString().slice(0, 10)} ${String(date.getHours()).padStart(2, '0')}:${String(
      date.getMinutes(),
    ).padStart(2, '0')}`;
  }

  function weighted(decision) {
    const options = decision?.options ?? [];
    let total = 0;
    let weight = 0;
    for (const option of options) {
      total += Number(option.score ?? 0) * Number(option.weight ?? 1);
      weight += Number(option.weight ?? 1);
    }
    return weight > 0 ? total / weight : 0;
  }

  function isReviewDue(decision) {
    if (!decision?.reviewAt) return false;
    if (decision.status === 'archived') return false;
    const time = Date.parse(decision.reviewAt);
    return Number.isFinite(time) && time <= Date.now();
  }

  function statusOf(decision) {
    if (isReviewDue(decision)) return 'review';
    return decision?.status ?? 'draft';
  }

  const STATUS_TEXT = { draft: '草稿', decided: '已定案', review: '待重評', archived: '已封存' };

  let toastTimer = null;
  function toast(message, tone) {
    if (!el.toast) return;
    el.toast.textContent = message;
    if (tone) el.toast.dataset.tone = tone;
    else delete el.toast.dataset.tone;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.hidden = true;
    }, 3200);
  }

  async function api(method, path, body) {
    const options = { method, headers: { accept: 'application/json' } };
    if (body !== undefined) {
      options.headers['content-type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(path, options);
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = {};
      }
    }
    if (!response.ok) {
      throw new Error(payload.error ?? `http_${response.status}`);
    }
    return payload;
  }

  /* ── data ────────────────────────────────────────────────── */

  async function load() {
    try {
      const payload = await api('GET', '/api/state');
      state.decisions = Array.isArray(payload.decisions) ? payload.decisions : [];
    } catch (error) {
      toast(`讀取台帳失敗：${error.message}`, 'error');
      state.decisions = [];
    }
    if (!state.decisions.some((item) => item.id === state.selectedId)) {
      state.selectedId = state.decisions[0]?.id ?? null;
    }
    renderAll();
  }

  function current() {
    return state.decisions.find((item) => item.id === state.selectedId) ?? null;
  }

  function replaceDecision(decision) {
    const index = state.decisions.findIndex((item) => item.id === decision.id);
    if (index === -1) state.decisions.unshift(decision);
    else state.decisions[index] = decision;
  }

  async function persist(id, patch) {
    try {
      const payload = await api('PATCH', `/api/decisions/${encodeURIComponent(id)}`, patch);
      if (payload.decision) replaceDecision(payload.decision);
      return payload.decision;
    } catch (error) {
      toast(`存檔失敗：${error.message}`, 'error');
      return null;
    }
  }

  /* ── filters ─────────────────────────────────────────────── */

  function visibleDecisions() {
    const query = state.query.trim().toLowerCase();
    return state.decisions.filter((decision) => {
      const status = statusOf(decision);
      if (state.filter === 'draft' && status !== 'draft') return false;
      if (state.filter === 'decided' && status !== 'decided') return false;
      if (state.filter === 'review' && status !== 'review') return false;
      if (!query) return true;
      const haystack = [
        decision.title,
        decision.context,
        decision.rationale,
        decision.outcome,
        ...(decision.options ?? []).map((option) => option.label),
        ...(decision.evidence ?? []).map((item) => `${item.source} ${item.detail}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  /* ── rendering ───────────────────────────────────────────── */

  function renderAll() {
    renderList();
    renderDetail();
    renderAgent();
    renderStats();
  }

  function renderStats() {
    const total = state.decisions.length;
    const decided = state.decisions.filter((item) => item.status === 'decided').length;
    const due = state.decisions.filter(isReviewDue).length;
    el.stats.textContent = `${total} 筆決策 · ${decided} 已定案${due ? ` · ${due} 待重評` : ''}`;
    if (el.bridgeState) {
      el.bridgeState.textContent = bridge?.agent?.run ? 'bridge: ready' : 'bridge: offline';
    }
  }

  function renderList() {
    const items = visibleDecisions();
    if (items.length === 0) {
      el.list.innerHTML = `<li class="empty" style="padding:26px 10px">
          <p style="margin:0">${state.decisions.length ? '沒有符合條件的決策' : '還沒有任何決策'}</p>
        </li>`;
      return;
    }
    el.list.innerHTML = items
      .map((decision) => {
        const status = statusOf(decision);
        const score = weighted(decision);
        const hasOptions = (decision.options ?? []).length > 0;
        return `<li class="item${decision.id === state.selectedId ? ' is-active' : ''}"
            data-id="${escapeHtml(decision.id)}" data-status="${escapeHtml(status)}">
          <div class="item__title">${escapeHtml(decision.title || '（未命名決策）')}</div>
          <div class="item__meta">
            <span class="badge badge--${escapeHtml(status)}" style="padding:1px 8px;font-size:10.5px">${escapeHtml(
              STATUS_TEXT[status],
            )}</span>
            ${hasOptions ? `<span class="item__score">${score.toFixed(2)}</span>` : ''}
            <span>${escapeHtml(fmtDate(decision.updatedAt))}</span>
            ${status === 'review' ? '<span class="item__tag">該回頭看了</span>' : ''}
          </div>
        </li>`;
      })
      .join('');
  }

  function renderDetail() {
    const decision = current();
    if (!decision) {
      el.detail.innerHTML = `<div class="empty">
          <div class="empty__mark">決</div>
          <h2>從左邊挑一個決策，或開一筆新的</h2>
          <p>每個決策都記得：情境、加權選項、支持它的依據、定了案的理由，以及該回頭看結果的日子。</p>
          <button class="btn btn--primary" data-action="create" type="button">＋ 開一筆新決策</button>
        </div>`;
      return;
    }

    const status = statusOf(decision);
    const options = decision.options ?? [];
    const evidence = decision.evidence ?? [];
    const score = weighted(decision);

    const optionRows = options
      .map((option) => {
        const weightedValue = Number(option.score ?? 0) * Number(option.weight ?? 1);
        const percent = Math.max(0, Math.min(100, (Number(option.score ?? 0) / 10) * 100));
        return `<div class="matrix__row" data-option="${escapeHtml(option.id)}">
            <input class="opt-label" type="text" value="${escapeHtml(option.label)}"
              placeholder="選項名稱" data-field="label" aria-label="選項名稱" />
            <input class="opt-score" type="number" min="0" max="10" step="0.5"
              value="${Number(option.score ?? 0)}" data-field="score" aria-label="評分 0 到 10" />
            <input class="opt-weight" type="number" min="1" max="5" step="1"
              value="${Number(option.weight ?? 1)}" data-field="weight" aria-label="權重 1 到 5" />
            <div class="opt-bar"><i style="width:${percent}%"></i></div>
            <span class="opt-weighted">${weightedValue.toFixed(1)}</span>
          </div>`;
      })
      .join('');

    const evidenceItems = evidence
      .map(
        (item) => `<div class="ev" data-kind="${escapeHtml(item.kind)}" data-evidence="${escapeHtml(item.id)}">
            <select class="ev__kind" data-evidence-field="kind" aria-label="依據類型">
              <option value="file"${item.kind === 'file' ? ' selected' : ''}>檔案</option>
              <option value="conversation"${item.kind === 'conversation' ? ' selected' : ''}>對話</option>
              <option value="note"${item.kind === 'note' ? ' selected' : ''}>筆記</option>
            </select>
            <div class="ev__body">
              <input class="ev__source" type="text" data-evidence-field="source"
                value="${escapeHtml(item.source ?? '')}" placeholder="來源：檔案路徑或對話標題" />
              <textarea class="ev__detail" data-evidence-field="detail" rows="2"
                placeholder="這條依據為什麼相關">${escapeHtml(item.detail ?? '')}</textarea>
            </div>
            <button class="btn btn--ghost btn--icon btn--danger" type="button"
              data-action="remove-evidence" data-id="${escapeHtml(item.id)}" aria-label="移除依據">✕</button>
          </div>`,
      )
      .join('');

    el.detail.innerHTML = `<div class="sheet">
        <header class="sheet__head">
          <input class="sheet__title" type="text" value="${escapeHtml(decision.title)}"
            placeholder="這次要決定什麼？" data-field="title" aria-label="決策標題" />
          <div class="sheet__side">
            <span class="badge badge--${escapeHtml(status)}">${escapeHtml(STATUS_TEXT[status])}</span>
            <div class="sheet__meta">
              <span>建立 ${escapeHtml(fmtDate(decision.createdAt))}</span>
              <span>更新 ${escapeHtml(fmtDateTime(decision.updatedAt))}</span>
            </div>
          </div>
        </header>

        <section class="block">
          <div class="block__head"><h3 class="block__title">情境 <span>為什麼現在要做這個決定</span></h3></div>
          <textarea class="textarea" data-field="context" placeholder="背景、限制、真正的問題是什麼…">${escapeHtml(
            decision.context ?? '',
          )}</textarea>
        </section>

        <section class="block">
          <div class="block__head">
            <h3 class="block__title">選項與權重 <span>評分 0–10，權重 1–5</span></h3>
            <div class="block__actions">
              <button class="btn btn--ghost btn--icon" type="button" data-action="add-option" aria-label="新增選項">＋</button>
            </div>
          </div>
          <div class="matrix">
            <div class="matrix__row matrix__row--head">
              <span>選項</span><span>評分</span><span>權重</span><span>相對強度</span><span></span>
            </div>
            ${
              options.length
                ? optionRows
                : '<div class="matrix__row"><span style="color:var(--muted);grid-column:1/-1">還沒有選項。加一個你正在考慮的做法。</span></div>'
            }
            <div class="matrix__foot">
              <span>加權平均分</span>
              <span class="matrix__total" id="totalScore">${score.toFixed(2)}</span>
            </div>
          </div>
        </section>

        <section class="block">
          <div class="block__head">
            <h3 class="block__title">依據 <span>支持或反對這個決策的事實</span></h3>
            <div class="block__actions">
              <button class="btn btn--ghost" type="button" data-action="add-evidence">＋ 手動加一條</button>
              <button class="btn btn--ghost" type="button" data-action="open-agent">讓 Agent 補</button>
            </div>
          </div>
          <div class="evidence" id="evidenceList">
            ${
              evidence.length
                ? evidenceItems
                : '<div class="ev" data-kind="note" style="border-left-color:var(--rule-strong)"><span class="ev__kind">空</span><div class="ev__body"><div class="ev__note">還沒有依據。讓 Agent 去讀檔案與對話，或手動補一條。</div></div></div>'
            }
          </div>
        </section>

        <section class="block">
          <div class="block__head"><h3 class="block__title">決策理由 <span>定了案就寫下為什麼</span></h3></div>
          <textarea class="textarea" data-field="rationale" placeholder="我們選了…，因為…，放棄了…">${escapeHtml(
            decision.rationale ?? '',
          )}</textarea>
          <div class="grid2" style="margin-top:12px">
            <div class="field">
              <label for="decidedBy">決策者</label>
              <input class="input" id="decidedBy" type="text" data-field="decidedBy"
                value="${escapeHtml(decision.decidedBy ?? '')}" placeholder="誰拍板" />
            </div>
            <div class="field">
              <label for="reviewAt">重評日期</label>
              <input class="input" id="reviewAt" type="date" data-field="reviewAt"
                value="${escapeHtml((decision.reviewAt ?? '').slice(0, 10))}" />
            </div>
          </div>
          <div class="block__actions" style="margin-top:12px">
            ${
              decision.status === 'decided'
                ? '<button class="btn btn--ghost" type="button" data-action="reopen">回到草稿</button>'
                : '<button class="btn btn--primary" type="button" data-action="decide">定案</button>'
            }
            <button class="btn btn--ghost" type="button" data-action="archive">封存</button>
            <button class="btn btn--ghost btn--danger" type="button" data-action="delete">刪除</button>
          </div>
        </section>

        <section class="block">
          <div class="block__head">
            <h3 class="block__title">事後結果 <span>到期回來補，驗證當時的判斷</span></h3>
          </div>
          <textarea class="textarea" data-field="outcome" placeholder="後來發生了什麼？當時的假設哪裡對、哪裡錯？">${escapeHtml(
            decision.outcome ?? '',
          )}</textarea>
        </section>

        <section class="block">
          <div class="block__head">
            <h3 class="block__title">ADR <span>貼進 repo 的決策紀錄</span></h3>
            <div class="block__actions">
              <button class="btn btn--ghost" type="button" data-action="build-adr">產生 ADR</button>
              <button class="btn btn--ghost" type="button" data-action="copy-adr">複製</button>
              <button class="btn btn--ghost" type="button" data-action="send-adr">貼到對話</button>
            </div>
          </div>
          <pre class="adr" id="adrBox">${escapeHtml(decision.adr ?? '按「產生 ADR」把這筆決策寫成 Markdown。')}</pre>
        </section>
      </div>`;
  }

  function renderAgent() {
    el.agentPanel.hidden = !state.agent.open;
    document.getElementById('app')?.classList.toggle('agent-open', state.agent.open);
    el.agentRun.disabled = state.agent.running;
    el.agentImport.disabled = state.agent.running;
    el.agentRun.textContent = state.agent.running ? 'Agent 思考中…' : '讓 Agent 補依據';

    el.agentBody.innerHTML = state.agent.messages.length
      ? state.agent.messages.map((message) => renderMessage(message)).join('')
      : `<div class="msg msg--system">還沒開始。按「讓 Agent 補依據」，它會讀目前工作目錄的檔案、程式碼與 git 紀錄，找出支持或反對各選項的事實；或者從最近的對話匯入依據。</div>`;

    el.agentBody.scrollTop = el.agentBody.scrollHeight;
  }

  function renderMessage(message) {
    if (message.type === 'user') {
      return `<div class="msg msg--user">${escapeHtml(message.text)}</div>`;
    }
    if (message.type === 'tool') {
      return `<div class="msg msg--tool">${escapeHtml(message.text)}</div>`;
    }
    if (message.type === 'system') {
      return `<div class="msg msg--system">${escapeHtml(message.text)}</div>`;
    }
    if (message.type === 'session') {
      return `<div class="conv">
          <div style="min-width:0">
            <div class="conv__title">${escapeHtml(message.text)}</div>
            <div class="conv__meta">${escapeHtml(message.meta ?? '')}</div>
          </div>
          <button class="btn btn--ghost" type="button" data-action="import-session"
            data-session="${escapeHtml(message.sessionId ?? '')}">匯入</button>
        </div>`;
    }
    if (message.type === 'ask') {
      return `<div class="ask">
          <div class="ask__title">Agent 想使用工具：${escapeHtml(message.toolName)}</div>
          <div class="ask__reason">${escapeHtml(message.reason ?? '')}</div>
          <div class="ask__actions">
            <button class="btn btn--primary" type="button" data-action="allow-once">允許一次</button>
            <button class="btn btn--ghost" type="button" data-action="deny">拒絕</button>
          </div>
        </div>`;
    }
    return `<div class="msg msg--agent">${escapeHtml(message.text || '…')}</div>`;
  }

  /* ── view state ──────────────────────────────────────────── */

  function saveView() {
    try {
      localStorage.setItem(
        VIEW_KEY,
        JSON.stringify({
          selectedId: state.selectedId,
          filter: state.filter,
          query: state.query,
          scroll: el.detail.scrollTop,
        }),
      );
    } catch {
      /* storage is optional */
    }
  }

  function restoreView() {
    try {
      const raw = localStorage.getItem(VIEW_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /* ── theme ───────────────────────────────────────────────── */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  }

  function setupTheme() {
    const host = bridge?.host;
    if (host?.ui?.subscribe) {
      try {
        const subscription = host.ui.subscribe(({ theme }) => applyTheme(theme));
        addEventListener('pagehide', () => subscription?.dispose?.(), { once: true });
        return;
      } catch {
        /* fall through to the system theme */
      }
    }
    const prefersDark = matchMedia?.('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  /* ── agent: run a turn ───────────────────────────────────── */

  function buildPrompt(decision) {
    const options = (decision.options ?? [])
      .map((option) => `- ${option.label || '（未命名）'}：評分 ${option.score}、權重 ${option.weight}`)
      .join('\n');
    return [
      '你是決策記錄助理。使用者正在「決策台帳」記錄一個決策，我要你幫忙找出依據。',
      '',
      `決策標題：${decision.title || '（未命名決策）'}`,
      `情境：${decision.context || '（尚未記錄）'}`,
      `目前評估的選項：\n${options || '（尚未列出）'}`,
      '',
      '請完成兩件事：',
      '1. 蒐集依據：讀取目前工作目錄中與這個決策相關的檔案、程式碼、測試、文件與 git 紀錄，找出支持或反對各選項的事實。每條依據要能追溯到具體來源。',
      '2. 給出判斷：以兩三句話說明你建議採哪個選項、理由，以及最需要先驗證的假設。',
      '',
      '最後只輸出 JSON，不要任何其他文字：',
      '{"evidence":[{"kind":"file|conversation|note","source":"檔案路徑或來源名稱","detail":"這條依據為何相關，不超過 120 字"}],"rationale":"你的判斷，不超過 200 字"}',
    ].join('\n');
  }

  function extractJson(text) {
    if (typeof text !== 'string') return null;
    let body = text.trim();
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(body);
    if (fence) body = fence[1].trim();
    try {
      return JSON.parse(body);
    } catch {
      /* try the last balanced object */
    }
    const start = body.lastIndexOf('{');
    if (start === -1) return null;
    let depth = 0;
    for (let index = start; index < body.length; index += 1) {
      const char = body[index];
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(body.slice(start, index + 1));
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }

  function pushMessage(message) {
    state.agent.messages.push(message);
    renderAgent();
  }

  async function runAgent() {
    const decision = current();
    if (!decision) {
      toast('先選一個決策', 'error');
      return;
    }
    const agent = bridge?.agent;
    if (!agent?.run) {
      state.agent.open = true;
      pushMessage({
        type: 'system',
        text: '這個 MiniMax Code 版本沒有提供 Agent 橋接（或權限被關掉了）。決策、權重矩陣與 ADR 仍然可以正常使用。',
      });
      toast('沒有 Agent 橋接，無法執行', 'error');
      return;
    }
    if (state.agent.running) return;

    state.agent.open = true;
    state.agent.running = true;
    const prompt = buildPrompt(decision);
    pushMessage({ type: 'user', text: prompt });
    const replyMessage = { type: 'agent', text: '' };
    state.agent.messages.push(replyMessage);
    renderAgent();

    const onEvent = (event) => {
      if (!event || typeof event !== 'object') return;
      if (event.type === 'text.delta') {
        replyMessage.text += event.text ?? '';
        renderAgent();
      } else if (event.type === 'tool.started') {
        pushMessage({ type: 'tool', text: `▶ ${event.name}` });
      } else if (event.type === 'tool.finished') {
        pushMessage({ type: 'tool', text: `■ ${event.name} ${event.ok ? '完成' : '失敗'}` });
      } else if (event.type === 'permission.requested') {
        state.agent.pendingAsk = {
          sessionId: event.sessionId,
          requestId: event.requestId,
          toolName: event.toolName,
          reason: event.reason,
        };
        pushMessage({
          type: 'ask',
          toolName: event.toolName,
          reason: event.reason,
        });
      } else if (event.type === 'question.requested') {
        pushMessage({ type: 'system', text: 'Agent 想問你一個問題，已交給 MiniMax Code 的對話面板處理。' });
        agent.open?.(event.sessionId)?.catch(() => undefined);
      }
    };

    try {
      const input = { text: prompt };
      if (decision.agentSessionId) {
        input.sessionId = decision.agentSessionId;
        input.whenBusy = 'queue';
      }
      const result = await agent.run(input, { onEvent });
      if (result?.text && !replyMessage.text) replyMessage.text = result.text;

      if (result?.sessionId && result.sessionId !== decision.agentSessionId) {
        await persist(decision.id, { agentSessionId: result.sessionId });
      }

      const parsed = extractJson(result?.text ?? replyMessage.text);
      if (parsed && Array.isArray(parsed.evidence) && parsed.evidence.length) {
        const existing = decision.evidence ?? [];
        // The same evidence can come back on every follow-up turn; keep it only once.
        const seen = new Set(existing.map((item) => `${item.kind}|${item.source}|${item.detail}`));
        const added = parsed.evidence
          .filter((item) => item && (item.source || item.detail))
          .map((item) => ({
            id: uid('e'),
            kind: ['file', 'conversation', 'note'].includes(item.kind) ? item.kind : 'note',
            source: String(item.source ?? '').slice(0, 300),
            detail: String(item.detail ?? '').slice(0, 1200),
            addedAt: new Date().toISOString(),
          }))
          .filter((item) => {
            const key = `${item.kind}|${item.source}|${item.detail}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        if (added.length) {
          await persist(decision.id, { evidence: [...existing, ...added] });
          toast(`Agent 補了 ${added.length} 條依據`, undefined);
        } else {
          pushMessage({ type: 'system', text: 'Agent 這次沒有帶回新的依據。' });
        }
        if (parsed.rationale && !decision.rationale) {
          await persist(decision.id, { rationale: String(parsed.rationale).slice(0, 4000) });
        }
      } else if (result?.status === 'finished') {
        pushMessage({
          type: 'system',
          text: 'Agent 完成了，但回覆裡沒有可解析的 JSON。內容留在下方，你可以自己摘錄成依據。',
        });
      }
    } catch (error) {
      const code = error?.message ?? 'unknown';
      const hint =
        code === 'not_permitted'
          ? 'Agent 權限被關掉了，到外掛詳情裡把 session.run 打開。'
          : code === 'busy'
            ? 'Agent 現在很忙，等一下再試。'
            : code;
      pushMessage({ type: 'system', text: `執行失敗：${hint}` });
    } finally {
      state.agent.running = false;
      // A pending permission request stays answerable after the turn ends; it is cleared when the
      // user answers it.
      renderAll();
    }
  }

  async function answerAsk(decision) {
    const ask = state.agent.pendingAsk;
    const agent = bridge?.agent;
    if (!ask || !agent?.reply) return;
    try {
      await agent.reply({ sessionId: ask.sessionId, requestId: ask.requestId, decision });
      pushMessage({
        type: 'system',
        text: decision === 'allowOnce' ? `已允許一次 ${ask.toolName}` : `已拒絕 ${ask.toolName}`,
      });
    } catch (error) {
      pushMessage({ type: 'system', text: `回覆失敗：${error?.message ?? 'unknown'}` });
    } finally {
      state.agent.pendingAsk = null;
      renderAgent();
    }
  }

  async function importFromConversations() {
    const agent = bridge?.agent;
    if (!agent?.sessions) {
      toast('這個版本讀不到對話紀錄', 'error');
      return;
    }
    state.agent.open = true;
    pushMessage({ type: 'system', text: '正在讀取最近的對話…' });
    try {
      const payload = await agent.sessions();
      const sessions = (payload?.sessions ?? []).slice(0, 12);
      if (!sessions.length) {
        pushMessage({ type: 'system', text: '沒有可匯入的對話。' });
        return;
      }
      state.agent.messages = state.agent.messages.filter((message) => message.text !== '正在讀取最近的對話…');
      state.agent.messages.push({ type: 'system', text: '挑一個對話，把它的最後回覆匯入成依據：' });
      for (const session of sessions) {
        const title = session.title || '（未命名對話）';
        const when = fmtDateTime(new Date(session.updatedAtMs).toISOString());
        state.agent.messages.push({
          type: 'session',
          sessionId: session.sessionId,
          text: title,
          meta: when,
        });
      }
      renderAgent();
    } catch (error) {
      pushMessage({ type: 'system', text: `讀取失敗：${error?.message ?? 'unknown'}` });
    }
  }

  async function importSession(sessionId) {
    const agent = bridge?.agent;
    const decision = current();
    if (!agent?.session || !decision) return;
    try {
      const detail = await agent.session(sessionId);
      const text = detail?.lastAssistantText;
      if (!text) {
        toast('這個對話沒有可匯入的回覆', 'error');
        return;
      }
      const existing = decision.evidence ?? [];
      await persist(decision.id, {
        evidence: [
          ...existing,
          {
            id: uid('e'),
            kind: 'conversation',
            source: detail.title || '對話',
            detail: text.slice(0, 1200),
            addedAt: new Date().toISOString(),
          },
        ],
      });
      pushMessage({ type: 'system', text: '已匯入一條對話依據。' });
      renderAll();
    } catch (error) {
      pushMessage({ type: 'system', text: `匯入失敗：${error?.message ?? 'unknown'}` });
    }
  }

  /* ── actions ─────────────────────────────────────────────── */

  async function createDecision() {
    try {
      const payload = await api('POST', '/api/decisions', { title: '新決策' });
      if (payload.decision) {
        replaceDecision(payload.decision);
        state.selectedId = payload.decision.id;
        state.filter = 'all';
        syncFilterChips();
        renderAll();
        el.detail.querySelector('.sheet__title')?.focus();
        el.detail.querySelector('.sheet__title')?.select();
      }
    } catch (error) {
      toast(`建立失敗：${error.message}`, 'error');
    }
  }

  async function deleteDecision() {
    const decision = current();
    if (!decision) return;
    const title = decision.title || '（未命名決策）';
    if (!confirm(`刪掉「${title}」？這筆決策與它的依據會一起消失。`)) return;
    try {
      await api('DELETE', `/api/decisions/${encodeURIComponent(decision.id)}`);
      state.decisions = state.decisions.filter((item) => item.id !== decision.id);
      state.selectedId = state.decisions[0]?.id ?? null;
      renderAll();
      toast('已刪除');
    } catch (error) {
      toast(`刪除失敗：${error.message}`, 'error');
    }
  }

  function syncFilterChips() {
    for (const chip of el.filters.querySelectorAll('.chip')) {
      chip.classList.toggle('is-active', chip.dataset.filter === state.filter);
    }
  }

  /* ── events ──────────────────────────────────────────────── */

  el.list.addEventListener('click', (event) => {
    const item = event.target.closest('.item');
    if (!item) return;
    state.selectedId = item.dataset.id;
    renderAll();
    saveView();
  });

  el.filters.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    state.filter = chip.dataset.filter;
    syncFilterChips();
    renderList();
    renderStats();
    saveView();
  });

  el.search.addEventListener('input', () => {
    state.query = el.search.value;
    renderList();
    renderStats();
    saveView();
  });

  el.newDecision.addEventListener('click', () => {
    void createDecision();
  });

  el.closeAgent.addEventListener('click', () => {
    state.agent.open = false;
    renderAgent();
  });

  el.agentRun.addEventListener('click', () => {
    void runAgent();
  });

  el.agentImport.addEventListener('click', () => {
    void importFromConversations();
  });

  el.agentBody.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'allow-once') void answerAsk('allowOnce');
    else if (action === 'deny') void answerAsk('deny');
    else if (action === 'import-session') void importSession(button.dataset.session);
  });

  // Detail pane: text fields commit on blur, option edits update in place.
  const commitTimers = new Map();
  const pendingPatches = new Map();

  function handleEvidenceField(target) {
    const evidenceField = target.dataset.evidenceField;
    if (!evidenceField) return false;
    const decision = current();
    const row = target.closest('[data-evidence]');
    const item = decision?.evidence?.find((entry) => entry.id === row?.dataset.evidence);
    if (!decision || !item) return true;
    item[evidenceField] = target.value;
    if (evidenceField === 'kind') row.dataset.kind = target.value;
    scheduleCommit(decision.id, { evidence: decision.evidence });
    return true;
  }

  el.detail.addEventListener('input', (event) => {
    const target = event.target;
    if (handleEvidenceField(target)) return;
    const field = target.dataset.field;
    if (!field) return;
    const decision = current();
    if (!decision) return;

    if (field === 'score' || field === 'weight' || field === 'label') {
      const row = target.closest('.matrix__row');
      const option = decision.options?.find((item) => item.id === row?.dataset.option);
      if (!option) return;
      if (field === 'label') option.label = target.value;
      else option[field] = Math.max(
        field === 'score' ? 0 : 1,
        Math.min(field === 'score' ? 10 : 5, Number(target.value) || 0),
      );
      updateMatrixRow(decision, row, option);
      scheduleCommit(decision.id, { options: decision.options });
      return;
    }

    decision[field] = target.value;
    if (field === 'title') {
      const item = el.list.querySelector(`.item[data-id="${CSS.escape(decision.id)}"] .item__title`);
      if (item) item.textContent = decision.title || '（未命名決策）';
    }
    scheduleCommit(decision.id, { [field]: target.value });
  });

  el.detail.addEventListener('change', (event) => {
    const target = event.target;
    if (target.dataset.evidenceField) {
      handleEvidenceField(target);
      return;
    }
    const field = target.dataset.field;
    const decision = current();
    if (!decision || !field) return;
    if (field === 'reviewAt') {
      const value = target.value ? new Date(`${target.value}T00:00:00`).toISOString() : null;
      decision.reviewAt = value;
      void persist(decision.id, { reviewAt: value }).then(() => {
        renderAll();
        saveView();
      });
    }
  });

  el.detail.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.dataset.action;
    const decision = current();
    if (!action || !decision) return;

    if (action === 'create') {
      void createDecision();
    } else if (action === 'add-option') {
      const options = [
        ...(decision.options ?? []),
        { id: uid('o'), label: '', score: 5, weight: 3, note: '' },
      ];
      void persist(decision.id, { options }).then(() => {
        renderAll();
      });
    } else if (action === 'remove-evidence') {
      const evidence = (decision.evidence ?? []).filter((item) => item.id !== button.dataset.id);
      void persist(decision.id, { evidence }).then(() => renderAll());
    } else if (action === 'add-evidence') {
      const evidence = [
        ...(decision.evidence ?? []),
        { id: uid('e'), kind: 'note', source: '', detail: '', addedAt: new Date().toISOString() },
      ];
      void persist(decision.id, { evidence }).then(() => {
        renderAll();
        const inputs = el.detail.querySelectorAll('[data-evidence-field="source"]');
        inputs[inputs.length - 1]?.focus();
      });
    } else if (action === 'decide') {
      void persist(decision.id, {
        status: 'decided',
        decidedAt: new Date().toISOString(),
        decidedBy: decision.decidedBy ?? '',
      }).then(() => {
        renderAll();
        toast('已定案');
      });
    } else if (action === 'reopen') {
      void persist(decision.id, { status: 'draft', decidedAt: null }).then(() => renderAll());
    } else if (action === 'archive') {
      void persist(decision.id, { status: 'archived' }).then(() => renderAll());
    } else if (action === 'delete') {
      void deleteDecision();
    } else if (action === 'open-agent') {
      state.agent.open = true;
      renderAgent();
    } else if (action === 'build-adr') {
      void buildAdr(decision);
    } else if (action === 'copy-adr') {
      void copyAdr(decision);
    } else if (action === 'send-adr') {
      void sendAdr(decision);
    }
  });

  function updateMatrixRow(decision, row, option) {
    if (!row) return;
    const weightedValue = Number(option.score ?? 0) * Number(option.weight ?? 1);
    const percent = Math.max(0, Math.min(100, (Number(option.score ?? 0) / 10) * 100));
    const bar = row.querySelector('.opt-bar > i');
    if (bar) bar.style.width = `${percent}%`;
    const cell = row.querySelector('.opt-weighted');
    if (cell) cell.textContent = weightedValue.toFixed(1);
    const total = document.getElementById('totalScore');
    if (total) total.textContent = weighted(decision).toFixed(2);
  }

  function scheduleCommit(id, patch) {
    // Merge into the pending patch: a newer edit must not drop an earlier one that has not
    // reached the server yet.
    const pending = pendingPatches.get(id) ?? {};
    pendingPatches.set(id, { ...pending, ...patch });
    clearTimeout(commitTimers.get(id));
    commitTimers.set(
      id,
      setTimeout(() => {
        commitTimers.delete(id);
        const merged = pendingPatches.get(id) ?? {};
        pendingPatches.delete(id);
        void persist(id, merged);
      }, 450),
    );
  }

  async function buildAdr(decision) {
    try {
      const payload = await api('POST', `/api/decisions/${encodeURIComponent(decision.id)}/adr`);
      if (payload.decision) replaceDecision(payload.decision);
      renderAll();
      toast('ADR 已產生');
    } catch (error) {
      toast(`產生 ADR 失敗：${error.message}`, 'error');
    }
  }

  async function copyAdr(decision) {
    const adr = decision.adr;
    if (!adr) {
      toast('先產生 ADR', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(adr);
      toast('已複製到剪貼簿');
    } catch {
      const box = document.getElementById('adrBox');
      if (box) {
        const range = document.createRange();
        range.selectNodeContents(box);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      toast('已選取，按 Ctrl/⌘+C 複製');
    }
  }

  async function sendAdr(decision) {
    const adr = decision.adr;
    if (!adr) {
      toast('先產生 ADR', 'error');
      return;
    }
    const message = bridge?.message;
    if (!message?.append) {
      toast('這個版本不能貼到對話', 'error');
      return;
    }
    try {
      await message.append(adr);
      toast('已放進對話輸入框，確認後送出');
    } catch (error) {
      toast(error?.message === 'user_cancelled' ? '已取消' : `貼到對話失敗：${error?.message}`, 'error');
    }
  }

  /* ── boot ────────────────────────────────────────────────── */

  function boot() {
    setupTheme();

    const view = restoreView();
    if (view) {
      state.filter = view.filter ?? 'all';
      state.query = view.query ?? '';
      state.selectedId = view.selectedId ?? null;
      el.search.value = state.query;
      syncFilterChips();
    }

    void load().then(() => {
      if (view?.scroll) el.detail.scrollTop = view.scroll;
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveView();
    });
    addEventListener('pagehide', saveView);
  }

  boot();
})();
