# AGENTS.md

這個倉庫是 travisebill 的私人 MiniMax Code Mini App 庫。任何在這個倉庫工作的 agent 都必須遵守下面
的流程；用戶會直接說「做一個新的 mini app：<名字>，用途是 <一句話>」，不需要再解釋細節。

## 這個庫在做什麼

- 每個 Mini App 是一個獨立的 MiniMax Plugin 套件，放在 `plugins/<github-user>/<plugin-id>/`。
- 線上安裝：MiniMax Code 的 **Create → Import from a Git repository**，貼上
  `https://github.com/travisebill/minimax-miniapps/tree/main/plugins/<github-user>/<plugin-id>`。
- 版面刻意與社群倉庫 `MiniMax-AI/MiniMax-Code-MiniApps` 同構，日後要提 PR 到社群時路徑不用改。

## 目錄

```text
minimax-miniapps/
  README.md                       給人看的說明（安裝網址、表格）
  AGENTS.md                       這份，給 agent 看的流程
  bootstrap.sh                    首次 clone 後一次收尾（解碼 + workflow + commit + push）
  new-miniapp.sh                  一鍵產生新套件
  templates/hello-miniapp/        可複製的最小套件（取自社群範例）
  assets/
    <name>.b64                    二進位資產的 base64 清單（一行：<目標路徑> <base64>）
    decode-assets.sh              把 .b64 解成真檔案（原子寫）
    embed-assets.yml              workflow 模板（push assets/** 時自動解碼並提交）
  plugins/<github-user>/<plugin-id>/
```

## 新增一個 Mini App

1. **產生套件**：`bash new-miniapp.sh <plugin-id> "<顯示名稱>" "<一句話描述>"`
   （或從 `templates/hello-miniapp/` 複製；`plugin.json.name` 必須等於資料夾名）
2. **實作**：
   - `miniapp/client/` — 頁面（HTML + CSS + JS）。頁面可用 `window.mcode.miniapp`（message / agent / host /
     window / capabilities），每個方法都要先 feature-detect。
   - `miniapp/node/server.mjs` — Node 入口。必須是 ESM `export async function start(context)`，
     用 `node:http` 綁 `context.listen.host/port`，回傳 `{ dispose }`，2 秒內收乾淨。
     狀態寫 `context.dataDir`，用「tmp + rename」原子寫；不要寫 stdout，用 `context.logger`。
   - `miniapp/miniapp.json` — `surface.path`、`runtime.entry`、`agentAccess`、`toolAccess`、
     `deviceAccess`、`hostAccess`。**宣告必須與程式碼實際呼叫一致。**
3. **README**：必須有 `## Tested environment`（寫明測過的 MiniMax Code 版本）與
   `## Data & access`（讀寫哪些檔案、會不會跑 Agent、連哪些對話、有無麥克風/相機/通知、
   state 存在哪）。社群審查會看這段，寫得含糊會被退。
4. **圖示**：`icon` 必填且必須是真正的 PNG/JPEG/WebP（`.png/.jpg/.jpeg/.webp`）。
   自己的圖示 → base64 成 `assets/<name>.b64` → push，workflow 自動解碼提交。
5. **驗證**（必須 0 errors）：
   ```bash
   git clone --depth 1 https://github.com/MiniMax-AI/MiniMax-Code-MiniApps /tmp/miniapps-spec
   node /tmp/miniapps-spec/scripts/validate.mjs plugins/<github-user>/<plugin-id>
   ```
   `npm run check` 還會掃「manifest 宣告的權限 vs 程式碼實際呼叫」，
   宣告了沒用到是多餘權限、沒宣告卻用了會報 `ACCESS_UNDECLARED`（error）。
6. **推上去**：文字檔直接 commit/push；二進位走 `assets/*.b64` + workflow。
   推完重新 clone 再跑一次驗證器，確認線上的那份也過。

## 推 GitHub 的已知限制

- 某些環境（例如只能寫 UTF-8 文字的 MCP connector）**寫不了二進位**：
  位元組會被 UTF-8 展開。要放二進位就一定走 `assets/*.b64` + `assets/decode-assets.sh` 這條路。
- 只有 `.github/workflows/**` 之外的路徑能由這類 connector 直接寫。
  workflow 檔要先由有權限的一方放進去一次，之後靠它自動解碼。

## 硬性規則

- `plugin.json.name` == 資料夾名 == 安裝後的 plugin ID。
- 路徑要可攜：ASCII、無 symlink、無 `..`、無 `node_modules`、不得提交 `node_modules`。
- 套件不放憑證、token、API key。Agent 權限與瀏覽器權限要精確宣告，不要多給。
- Node 入口不要用 `https`/`http2`/`net`/`tls` 起服務，Host 的 loopback 認證只覆蓋 `node:http`。
- 不得在 Node 行程裡 `console.log` 或寫 stdout。
- 頁面只放同源資源，不要載入第三方 script（會共享頁面的 bridge 權限）。
