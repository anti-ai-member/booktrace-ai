### Task 6: Implement open-book reliability

**Files:**
- Modify: `src/App.jsx` (`loadBuiltInBook`, import handlers, analysis entry)
- Optional: tiny notice helpers only

**Interfaces:**
- Consumes: `BOOK_PATH`, `BUILT_IN_BOOK_ID`, `parseEpubInWorker`
- Produces: Shelf never silently empty when builtin asset is present; clear `loadError` + Retry

- [ ] **Step 1: Reproduce empty-shelf failure modes**

In DevTools: block `/books/long-march.epub`, reload, note UI. Unblock, add Retry.

- [ ] **Step 2: UI for builtin load failure**

When `loadError` and library empty, show shelf empty-state with **閲嶈瘯鍔犺浇銆婇暱寰併€?* calling `loadBuiltInBook` again 鈥?not only銆屽鍏ヤ功绫嶃€?

- [ ] **Step 3: Duplicate import**

On matching fingerprint, `openBook(existing)` + notice銆屼功鏋跺凡鏈夎繖鏈功锛屽凡涓轰綘鎵撳紑銆?

- [ ] **Step 4: Verify**

Cold load with network allowed: builtin visible. History without API key: local bridges or toast, no freeze.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "fix: builtin retry and duplicate-import open path"
```

---


