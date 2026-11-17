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

1. 依 [MiniMax-Code-MiniApps](https://github.com/MiniMax-AI/MiniMax-Code-MiniApps) 的契約建立
   `plugins/<github-user>/<plugin-id>/`（`plugin.json.name` 必須等於資料夾名）。
2. 在 `plugins/<github-user>/<plugin-id>/README.md` 寫明 `## Tested environment` 與 `## Data & access`。
3. 用社群倉庫的驗證器檢查：
   `node scripts/validate.mjs plugins/<github-user>/<plugin-id>`（把它 checkout 到本機即可）。
4. 推到本倉庫，並在上面的表格加一列。

## 授權

MIT，見 [LICENSE](LICENSE)。每個 Mini App 另附自己的授權檔。
