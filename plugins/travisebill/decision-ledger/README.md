# Decision Ledger

A ledger for the decisions you actually make. The reasoning behind a decision usually lives in a
chat window that scrolls away; this Mini App turns it into a record you can search, review, and
paste into a repository as an ADR.

## What it does

- **Decision cards.** Every decision keeps a title, the situation that forced it, a status, and the
  date it was last touched.
- **A weighted option matrix.** Each option carries a score (0–10) and a weight (1–5); the ledger
  shows the weighted score and the relative strength of each option side by side.
- **Evidence, with a source.** An evidence item is a file, a conversation, or a note, kept with the
  source that produced it. The Agent can add them for you, so the reasoning survives the chat.
- **A rationale and a decision maker.** Marking a decision as decided records when it was decided
  and who decided it.
- **A review date.** When the review date passes, the decision turns into "due for review" and asks
  for the outcome: what happened, which assumption held, which one did not.
- **ADR output.** One click renders the decision as a numbered Markdown ADR: context, decision,
  weighted options, evidence, outcome. Copy it, or send it to the chat input for review.
- **The Agent as a research assistant.** The Agent reads the current working directory — source
  code, tests, documents, git history — and reports the facts that support or undermine each
  option, in a format the ledger can store. It also needs your approval before it uses a tool.

Everything is stored on your own machine, in the Host's private data directory for this plugin.

## Install and open

1. Import this plugin into MiniMax Code: **Create → Import from a Git repository**, and paste
   `https://github.com/travisebill/minimax-miniapps/tree/main/plugins/travisebill/decision-ledger`.
   Or copy the `decision-ledger` folder into `~/.minimax/plugins/` and restart MiniMax Code.
2. Open it from the Mini App menu, or ask the Agent: "打開決策台帳".
3. Press **＋ 新決策** to start a record. The Agent features stay off until you ask for them, and
   every Agent turn is visible in the drawer on the right.

The page works without the Agent bridge as well: the ledger, the matrix, the ADR, and the review
dates are all local.

## Tested environment

- MiniMax Code 3.1.11 on macOS 15.
- Verified against the package contract of MiniMax Code 3.1.11: `agentAccess` with
  `session.read` needs 3.1.6 or later.

## Data & access

- **Files read.** The Mini App's own `miniapp/` payload (the page, the stylesheet, and the script)
  and the files inside its own package directory. Nothing else on your machine is read by this
  plugin.
- **Files written.** Only `decisions.json` inside the Host-owned data directory for this plugin
  (`context.dataDir`), written atomically on every change. No other file is created or modified,
  and nothing is written outside the data directory.
- **Network hosts.** None. The plugin makes no network request of its own.
- **Processes spawned.** None. The Node entry starts no child process.
- **Agent turns.** The Agent runs only when you press **讓 Agent 補依據**. That turn runs in the
  Mini App's own session with the Agent's normal capabilities (files, shell, Skills, MCP), so it can
  read the working directory of the conversation the Mini App is open in. The turn's output is
  parsed for evidence and a rationale, and what it found is shown in the drawer before it is stored.
  A tool call that needs approval waits for you in the drawer and is never granted automatically.
- **Conversations read.** With **從對話匯入** the plugin lists your most recent conversations
  (title and timestamp) and, for the one you pick, reads its final reply to store it as evidence.
  It never runs, answers, or continues any of those conversations.
- **Tools called.** None directly. The Agent may call tools of its own during a turn you started;
  those calls are judged by your MiniMax Code permission rules and shown to you for approval.
- **Microphone, camera, notifications.** Not used. The plugin declares no `deviceAccess`.
- **Host navigation read.** Not used. The plugin declares no `hostAccess`.
- **Where state is stored.** In the Host's private data directory for this plugin, in one JSON
  file. The plugin reads the Host's display theme through `host.ui` only to match the page to the
  interface; nothing else is read from the Host.
