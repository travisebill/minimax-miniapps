# minimax-miniapps

我自己的 [MiniMax Code](https://www.minimax.io/) Mini App 收藏庫。

每個 Mini App 都是一個獨立套件，放在 `plugins/<github-user>/<plugin-id>/`，可以用網址直接安裝：
**MiniMax Code → Create → Import from a Git repository**，貼上該 Mini App 的資料夾網址。

## Mini Apps

| Plugin ID | 名稱 | 一句話 | 安裝網址 |
| --- | --- | --- | --- |
| `decision-ledger` | 決策台帳 | 把對話裡散落的取捨變成可累積的資產：加權選項矩陣、依據來源、Agent 補證據、產生 ADR、重評日期 | [安裝](https://github.com/travisebill/minimax-miniapps/tree/main/plugins/travisebill/decision-ledger) |

## 目錄結構

```text
minimax-miniapps/
  README.md
  LICENSE
  .github/workflows/embed-assets.yml   用 base64 把二進位資產寫回 repo 的小工具
  plugins/
    <github-user>/
      <plugin-id>/
        .minimax-plugin/plugin.json    plugin 身分與宣告
        package.json                   Mini App 宣告
        miniapp/
          miniapp.json                 payload、Node 入口、頁面路由、權限宣告
          client/                      頁面
          node/                        Node 服務
        icon.png
```

## 第一次使用這個庫

二進位資產（Plugin 圖示）無法透過純文字的 Git push 傳遞，所以它們以 base64 放在 `assets/*.b64`，
由 `assets/decode-assets.sh` 解出，或由 `embed-assets` workflow 自動解碼並提交。

第一次 clone 之後執行一次：

```bash
git clone --depth 1 https://github.com/travisebill/minimax-miniapps.git
cd minimax-miniapps && bash bootstrap.sh
```

之後若要新增或更新二進位資產，只要改 `assets/*.b64` 並 push，`embed-assets` workflow 會自動解碼提交。

## 新增一個 Mini App

最快的一條路：

```bash
bash new-miniapp.sh <plugin-id> "<顯示名稱>" "<一句話描述>"
```

它會從 `templates/hello-miniapp/` 複製出 `plugins/travisebill/<plugin-id>/` 並寫好 manifest。

再照著做四件事：

1. 改 `miniapp/client/index.html`（頁面）與 `miniapp/node/server.mjs`（Node 服務）。
2. 寫 `README.md`，必須有 `## Tested environment` 與 `## Data & access` 兩個標題
   （前者要寫明測試過的 MiniMax Code 版本，後者要寫明讀寫了哪些檔案、會不會跑 Agent、連哪些對話）。
3. 有自己的圖示 → 把它 base64 放成 `assets/<name>.b64`（一行：`<目標路徑> <base64>`），
   跑 `bash assets/decode-assets.sh`，或直接 push 讓 `embed-assets` workflow 自動解碼提交。
4. 用社群倉庫的驗證器檢查（在 [MiniMax-Code-MiniApps](https://github.com/MiniMax-AI/MiniMax-Code-MiniApps)
   的 checkout 裡）：`node scripts/validate.mjs plugins/travisebill/<plugin-id>` — 必須 0 errors。

最後推上去，並在上面的表格加一列。

### 也可以直接叫 Mavis 做

跟 Mavis 說「**做一個新的 mini app：<名字>，用途是 <一句話>，放進我的 miniapp 庫**」即可，
剩下的驗證、推送、圖示處理都會自動做完。

## 授權

MIT，見 [LICENSE](LICENSE)。每個 Mini App 另附自己的授權檔。
