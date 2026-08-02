### Task 4: Hand-eval protocol (differentiator proof)

**Files:**
- Modify: `docs/situation-bridge-evaluation.md`
- Create: `docs/hand-eval-bridge-protocol.md`
- Create: `reports/.gitkeep` already ignored 鈥?store results locally only

**Interfaces:**
- Produces: A 20-case checklist humans can run on desktop against builtin 銆婇暱寰併€?+ one imported argument/fiction EPUB

- [ ] **Step 1: Write protocol**

`docs/hand-eval-bridge-protocol.md` must include:

- 10 show cases (dependent mid-book pages, 鈮?2h simulated absence via stored lastActivity if needed)
- 5 suppress cases (scenic / chapter ornament)
- 3 evidence-jump cases
- 2銆屾病鎯宠捣銆峵hen reopen ranking cases

Each row: book, chapter/page intent, expected show|suppress, pass/fail, note.

- [ ] **Step 2: Link from evaluation doc**

Add a 鈥淗and protocol鈥?section pointing to that file; season gate = 鈮?0% helpful on show rows and 鈮?0% suppress correct.

- [ ] **Step 3: Commit**

```bash
git add docs/hand-eval-bridge-protocol.md docs/situation-bridge-evaluation.md
git commit -m "docs: hand-eval protocol for situation-bridge hit rate"
```

---


