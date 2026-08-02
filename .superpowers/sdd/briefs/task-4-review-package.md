# Review package Task 4
HEAD: 732c6747c868a76f4b5102532e2766197f48f1d7
Commit: 732c674

## Stat
732c674 docs: hand-eval protocol for situation-bridge hit rate
 docs/hand-eval-bridge-protocol.md   | 102 ++++++++++++++++++++++++++++++++++++
 docs/situation-bridge-evaluation.md |  11 ++++
 2 files changed, 113 insertions(+)


## Diff
commit 732c6747c868a76f4b5102532e2766197f48f1d7
Author: HuangXin <huangxin1985@gmail.com>
Date:   Tue Jul 28 23:15:08 2026 +0800

    docs: hand-eval protocol for situation-bridge hit rate
    
    Co-authored-by: Cursor <cursoragent@cursor.com>

diff --git a/docs/hand-eval-bridge-protocol.md b/docs/hand-eval-bridge-protocol.md
new file mode 100644
index 0000000..bd4b061
--- /dev/null
+++ b/docs/hand-eval-bridge-protocol.md
@@ -0,0 +1,102 @@
+# Hand-Eval Protocol: Situation-Bridge Hit Rate
+
+Human checklist for **Feature 018 / 019** continued-reading situation bridges. Complements offline `npm run situation-bridge:evaluate` with live desktop proof on real books.
+
+## Season gate
+
+| Metric | Target | Rows |
+| --- | --- | --- |
+| Show-helpful | 鈮?**70%** | S01鈥揝10 (`expected: show`) |
+| Suppress correct | 鈮?**80%** | X01鈥揦05 (`expected: suppress`) |
+
+Evidence-jump (E01鈥揈03) and Reader Memory ranking (R01鈥揜02) are **required smoke** but not part of the season percentage above.
+
+Fill **pass/fail** and **note** locally after each run. Do **not** commit filled results if notes contain private reading-position clutter.
+
+## Books
+
+| Label | Source |
+| --- | --- |
+| **builtin** | Built-in 銆婇暱寰併€?(`long-march`) 鈥?no import |
+| **import** | One imported **argument** or **fiction** EPUB (non-DRM). Record title in your local notes. Use argument rows for philosophy/essay/non-fiction; fiction rows for novel/literary EPUB. |
+
+Run on **desktop** with `npm run dev`. DeepSeek key optional (local bridges still work; adjudicator enriches when key present).
+
+## Setup (every case)
+
+1. Read forward to the checkpoint through normal page turns (leave pages so they become **宸茶**).
+2. Run **AI Trace** (manual or auto) so `bookMemory` exists up to the latest read page.
+3. For **auto reopen** cases: set `yuezhi-reading-activity:<book>` in DevTools 鈫?Application 鈫?Local Storage to a timestamp **鈮?12 hours ago** (or clear it and set `lastActivityAt` inside `shumai-recovery-memory:<book>` similarly).
+4. Close and reopen the book from the shelf, **or** stay on page and tap the page-title **涓诲姩鍥炲繂** (History) control for **manual** rows.
+5. Judge only what the recovery card shows 鈥?bridges, suppress reason, evidence jumps, 鎯宠捣浜?/ 杩樻病鎯宠捣.
+
+### Helpful (show rows)
+
+Pass when **all** apply:
+
+- Card is **not** suppressed; shows **鈮?2** situation bridges.
+- At least **one** bridge is **helpful**: episode-specific, names a prior decision/person/place/claim the current page depends on, and `whyNeeded` ties to visible page text 鈥?not a mega-topic or vague template.
+
+Fail if suppressed on a dependent page, fewer than two bridges, or bridges are scenic trivia / unrelated biography.
+
+### Suppress (scenic rows)
+
+Pass when **any** apply:
+
+- No recovery overlay on auto reopen **and** manual recall shows suppress copy (e.g. 褰撳墠椤典笉蹇呭厛鍥炴兂).
+- Card explicitly suppressed with a low-dependency reason.
+
+Fail if two or more irrelevant bridges appear on a scenic or chapter-ornament page.
+
+### Evidence jump (E rows)
+
+Expand evidence on a bridge (or question). Pass if jump lands on the **correct prior chapter/paragraph** cited in Memory, within one page turn of the evidence anchor.
+
+### 娌℃兂璧?鈫?reopen ranking (R rows)
+
+1. On first open, tap **杩樻病鎯宠捣** on the bridge under test (note its title / candidate theme).
+2. Reload or re-open the same page with 鈮?12h absence (or manual recall).
+3. Pass if a bridge matching that theme (same event, person, claim, or `candidateId` family) appears in the **top two** bridges; fail if it disappears or ranks below unrelated filler.
+
+---
+
+## Checklist (20 cases)
+
+| ID | Book | Chapter / page intent | Expected | Pass | Fail | Note |
+| --- | --- | --- | --- | --- | --- | --- |
+| **S01** | builtin | Mid-book: page where current action references **閬典箟浼氳** or its immediate command outcome (not the meeting scene itself) | show | | | |
+| **S02** | builtin | Mid-book: **鍥涙浮璧ゆ按** / 璧ゆ按娌?maneuver 鈥?page where prior crossing or direction change explains today's movement | show | | | |
+| **S03** | builtin | Mid-book: post-**婀樻睙** passage 鈥?page where command loss, corps change, or route pressure from that battle matters now | show | | | |
+| **S04** | builtin | Mid-book: **宸ф浮閲戞矙姹?* / 閲戞矙姹?鈥?page where earlier crossing decision or timing affects present action | show | | | |
+| **S05** | builtin | Mid-book: **椋炲ず娉稿畾妗?* or 澶ф浮娌?thread 鈥?page that assumes knowledge of prior bridge/route race | show | | | |
+| **S06** | builtin | Mid-book: leadership handoff or **鍛戒护閾?* 鈥?page where who ordered what earlier is needed to read current orders | show | | | |
+| **S07** | builtin | Mid-book: **鏁屾垜鎬佸娍** turn 鈥?page where prior encirclement / pursuit / 鍖呭洿鍦?explains current breakout or march | show | | | |
+| **S08** | import | Argument EPUB: mid-chapter page where text applies an earlier **鏍稿績姒傚康 / 璁虹偣** (e.g. principle 鈫?consequence paragraph) | show | | | |
+| **S09** | import | Argument EPUB: page that depends on a prior **璁鸿瘉姝ラ / 鍙嶉┏** rather than scene or biography | show | | | |
+| **S10** | import | Fiction EPUB: mid-story page where **浜虹墿鍏崇郴 / 鍓嶆枃浜嬩欢** (not atmosphere) is required to understand current beat | show | | | |
+| **X01** | builtin | **Scenic**: landscape, weather, or march atmosphere only 鈥?no new command, battle turn, or decision | suppress | | | |
+| **X02** | builtin | **Chapter ornament**: epigraph, part title, or transitional filler with no causal hook to prior plot | suppress | | | |
+| **X03** | builtin | **Low dependency**: early paragraph of a new chapter that is mostly orientation before action resumes | suppress | | | |
+| **X04** | import | Argument EPUB: aside, metaphor, or scene-setting sentence unrelated to the book's claims | suppress | | | |
+| **X05** | import | Fiction EPUB: pure setting / mood paragraph with no plot dependency on prior chapters | suppress | | | |
+| **E01** | builtin | Any **show** row: open collapsed evidence on the most causal bridge; verify jump to prior battle/meeting/order passage | evidence | | | |
+| **E02** | builtin | Second show row: evidence on a **person** bridge jumps to first substantive mention in read range | evidence | | | |
+| **E03** | import | Non-history show row: evidence jump lands on concept/claim/scene anchor in read range (not wrong chapter) | evidence | | | |
+| **R01** | builtin | Repeat **S02** (or similar causal page): mark **杩樻病鎯宠捣** on the strongest bridge; reopen 鈫?that theme should rank in top 2 | ranking | | | |
+| **R02** | builtin | Repeat **S06** (command chain): **杩樻病鎯宠捣** on person/command bridge; reopen 鈫?related fuel preferred over weak secondary names | ranking | | | |
+
+---
+
+## Recording results
+
+Copy the table to a local file under `reports/` (gitignored) or your notes app. Example season summary:
+
+```text
+Show helpful: __/10 = __%  (gate 鈮?0%)
+Suppress correct: __/5 = __%  (gate 鈮?0%)
+Evidence smoke: __/3
+Ranking smoke: __/2
+Season bridge hand-eval: PASS / FAIL
+```
+
+Re-run after major changes to `situationBridge.js`, Reader Memory scoring, or adjudicator path. Keep automated gate green: `npm run situation-bridge:evaluate`.
diff --git a/docs/situation-bridge-evaluation.md b/docs/situation-bridge-evaluation.md
index 10b78d4..cd5fe92 100644
--- a/docs/situation-bridge-evaluation.md
+++ b/docs/situation-bridge-evaluation.md
@@ -39,9 +39,20 @@ Fixtures live in `scripts/fixtures/situation-bridge-cases.json`, labeled by crit
 - `precision` 鈮?70
 - `suppressAccuracy` 鈮?80
 - `budgetCompliance` = 100
 - `inventIdReject` = 100
 
+## Hand protocol
+
+Automated fixtures catch regressions; they do not prove usefulness on real mid-book pages. Before season close, run the **20-case desktop checklist** in [`hand-eval-bridge-protocol.md`](./hand-eval-bridge-protocol.md):
+
+- Built-in 銆婇暱寰併€?plus one imported argument or fiction EPUB
+- 10 show 路 5 suppress 路 3 evidence-jump 路 2銆屾病鎯宠捣銆峳eopen-ranking cases
+- Fill pass/fail locally 鈥?do not commit private results
+
+**Season gate (hand):** show-helpful 鈮?**70%** on show rows; suppress correct 鈮?**80%** on suppress rows.
+
 ## What this does not do
 
 - Does not dump prior chapters into a model for offline mode
 - Live mode only sends the adjudicator shortlist budgets already enforced by `/api/situation-bridge`
+- Does not replace human helpfulness judgment 鈥?use the hand protocol for that

