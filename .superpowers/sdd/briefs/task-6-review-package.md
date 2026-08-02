# Review package Task 6
BASE: 73e88a7503195d8bbc7828da2c2e3b8253045636
HEAD: 2c3a649d16165a3719efbc1a98ac8877ef100272

## Commits
2c3a649 fix: builtin retry and duplicate-import open path


## Stat
 src/App.jsx | 160 ++++++++++++++++++++++++++++++++++++++----------------------
 1 file changed, 103 insertions(+), 57 deletions(-)


## Diff (App.jsx)
diff --git a/src/App.jsx b/src/App.jsx
index dc1e2a4..59fca45 100644
--- a/src/App.jsx
+++ b/src/App.jsx
@@ -440,16 +440,17 @@ export function App() {
   const readingAnchorRef = useRef({ paragraphIndex: 0, charOffset: 0 });
   const pendingLayoutAnchorRef = useRef(null);
   const layoutRestoreRef = useRef(false);
   const didInitialPageMeasureRef = useRef(false);
   const pendingParagraphRef = useRef(null);
   const pendingChapterEndRef = useRef(false);
   const recoveryCardJobRef = useRef(0);
   const readingStartedAtRef = useRef(Date.now());
+  const loadBuiltInBookRef = useRef(null);
 
   useEffect(() => {
     didInitialPageMeasureRef.current = false;
     layoutRestoreRef.current = false;
     pendingLayoutAnchorRef.current = null;
     pageSizeRef.current = { width: 900, height: 720 };
   }, [book?.id, screen]);
 
@@ -529,66 +530,17 @@ export function App() {
     if (latestRead && unreadSinceAnalysis >= analysisSettings.autoPageThreshold) {
       setTraceJob({ status: "queued", message: "AI Trace 宸叉帓闃? });
       const timer = window.setTimeout(() => analyzeBook("read", true), 120);
       return () => window.clearTimeout(timer);
     }
   }, [readPages, analysisSettings.analysisMode, analysisSettings.autoPageThreshold, analysisRecord, analysisState.status, traceJob.status, book]);
 
   useEffect(() => {
-    async function loadBuiltInBook() {
-      try {
-        const storedBooks = await loadStoredLibraryBooks();
-        const importedBooks = storedBooks.filter((item) => !item.local);
-        const cachedBuiltIn = storedBooks.find((item) => item.id === BUILT_IN_BOOK_ID && item.builtInCacheVersion === BUILT_IN_CACHE_VERSION) || null;
-        const activeBookId = loadStored("shumai-active-book-id", "");
-        const cachedBooks = cachedBuiltIn ? [cachedBuiltIn, ...importedBooks] : importedBooks;
-        const activeCachedBook = cachedBooks.find((item) => item.id === activeBookId) || cachedBuiltIn || importedBooks[0] || null;
-        setLibraryBooks(cachedBooks);
-        if (activeCachedBook) {
-          setBook(activeCachedBook);
-          setChapterIndex((current) => Math.min(Math.max(current, 0), activeCachedBook.chapters.length - 1));
-        }
-        const staleEpubCount = importedBooks.filter((item) => needsEpubContentReparse(item)).length;
-        if (staleEpubCount > 0 && !loadStored("shumai-epub-image-reparse-hint", false)) {
-          localStorage.setItem("shumai-epub-image-reparse-hint", JSON.stringify(true));
-          showNotice(`${staleEpubCount} 鏈凡瀵煎叆 EPUB 浠嶆槸鏃цВ鏋愶紱閲嶆柊瀵煎叆鍚屼竴鏂囦欢鍗冲彲鏄剧ず鎻掑浘`);
-        }
-        if (cachedBuiltIn) {
-          return;
-        }
-        await yieldToBrowser();
-
-        const response = await fetch(BOOK_PATH);
-        if (!response.ok) throw new Error("鏃犳硶鎵撳紑鏈湴 EPUB 鏂囦欢");
-        const parsed = await parseEpubInWorker(await response.blob());
-        const builtIn = {
-          ...parsed,
-          id: BUILT_IN_BOOK_ID,
-          fingerprint: "builtin:long-march",
-          cover: COVER_PATH,
-          bookType: "鍘嗗彶绾疄 / 浼犺",
-          indexSchema: findBookType("鍘嗗彶绾疄 / 浼犺").facets,
-          local: true,
-          builtIn: true,
-          format: "EPUB",
-          builtInCacheVersion: BUILT_IN_CACHE_VERSION,
-          contentParseVersion: EPUB_CONTENT_PARSE_VERSION,
-        };
-        await saveStoredLibraryBook(builtIn);
-        const books = [builtIn, ...importedBooks];
-        const activeBook = books.find((item) => item.id === activeBookId) || builtIn;
-        setLibraryBooks(books);
-        setBook((current) => current || activeBook);
-        setChapterIndex((current) => Math.min(Math.max(current, 0), activeBook.chapters.length - 1));
-      } catch (error) {
-        setLoadError(error.message || "瑙ｆ瀽 EPUB 鏃跺嚭鐜伴棶棰?);
-      }
-    }
-    loadBuiltInBook();
+    void loadBuiltInBookRef.current?.();
   }, []);
 
   useEffect(() => {
     if (book?.id) localStorage.setItem("shumai-active-book-id", JSON.stringify(book.id));
   }, [book?.id]);
 
   useEffect(() => {
     Promise.all(libraryBooks.filter((item) => !item.local).map((item) => saveStoredLibraryBook(item))).catch(() => {});
@@ -914,16 +866,76 @@ export function App() {
     };
   }, [screen, book?.id]);
 
   function showNotice(message) {
     setNotice(message);
     window.setTimeout(() => setNotice(""), 2600);
   }
 
+  function isMissingApiKeyError(message) {
+    return /API_KEY|configure.*\.env/i.test(String(message || ""));
+  }
+
+  function noticeMissingApiKey(fallbackHint = "闃呰涓庢湰鍦版帴椹充粛鍙户缁?) {
+    showNotice(`鏈厤缃?API Key锛屽ぇ妯″瀷鏆備笉鍙敤锛?{fallbackHint}`);
+  }
+
+  async function loadBuiltInBook() {
+    setLoadError("");
+    try {
+      const storedBooks = await loadStoredLibraryBooks();
+      const importedBooks = storedBooks.filter((item) => !item.local);
+      const cachedBuiltIn = storedBooks.find((item) => item.id === BUILT_IN_BOOK_ID && item.builtInCacheVersion === BUILT_IN_CACHE_VERSION) || null;
+      const activeBookId = loadStored("shumai-active-book-id", "");
+      const cachedBooks = cachedBuiltIn ? [cachedBuiltIn, ...importedBooks] : importedBooks;
+      const activeCachedBook = cachedBooks.find((item) => item.id === activeBookId) || cachedBuiltIn || importedBooks[0] || null;
+      setLibraryBooks(cachedBooks);
+      if (activeCachedBook) {
+        setBook(activeCachedBook);
+        setChapterIndex((current) => Math.min(Math.max(current, 0), activeCachedBook.chapters.length - 1));
+      }
+      const staleEpubCount = importedBooks.filter((item) => needsEpubContentReparse(item)).length;
+      if (staleEpubCount > 0 && !loadStored("shumai-epub-image-reparse-hint", false)) {
+        localStorage.setItem("shumai-epub-image-reparse-hint", JSON.stringify(true));
+        showNotice(`${staleEpubCount} 鏈凡瀵煎叆 EPUB 浠嶆槸鏃цВ鏋愶紱閲嶆柊瀵煎叆鍚屼竴鏂囦欢鍗冲彲鏄剧ず鎻掑浘`);
+      }
+      if (cachedBuiltIn) {
+        return;
+      }
+      await yieldToBrowser();
+
+      const response = await fetch(BOOK_PATH);
+      if (!response.ok) throw new Error("鏃犳硶鎵撳紑鏈湴 EPUB 鏂囦欢");
+      const parsed = await parseEpubInWorker(await response.blob());
+      const builtIn = {
+        ...parsed,
+        id: BUILT_IN_BOOK_ID,
+        fingerprint: "builtin:long-march",
+        cover: COVER_PATH,
+        bookType: "鍘嗗彶绾疄 / 浼犺",
+        indexSchema: findBookType("鍘嗗彶绾疄 / 浼犺").facets,
+        local: true,
+        builtIn: true,
+        format: "EPUB",
+        builtInCacheVersion: BUILT_IN_CACHE_VERSION,
+        contentParseVersion: EPUB_CONTENT_PARSE_VERSION,
+      };
+      await saveStoredLibraryBook(builtIn);
+      const books = [builtIn, ...importedBooks];
+      const activeBook = books.find((item) => item.id === activeBookId) || builtIn;
+      setLibraryBooks(books);
+      setBook((current) => current || activeBook);
+      setChapterIndex((current) => Math.min(Math.max(current, 0), activeBook.chapters.length - 1));
+    } catch (error) {
+      setLoadError(error.message || "瑙ｆ瀽 EPUB 鏃跺嚭鐜伴棶棰?);
+    }
+  }
+  loadBuiltInBookRef.current = loadBuiltInBook;
+
   function recordProgress(delta) {
     setReadingProgress((current) => {
       const domain = activeSkillDomain;
       const previous = domainProgress(current, domain);
       const nextDomain = {
         seconds: previous.seconds + (delta.seconds || 0),
         pages: previous.pages + (delta.pages || 0),
         xp: previous.xp + (delta.xp || 0),
@@ -1303,27 +1315,27 @@ export function App() {
         setBookCategories([categories[0]].filter(Boolean));
         setActiveCategory("鍏ㄩ儴");
         setActiveType("鍏ㄩ儴绫诲瀷");
         setChapterIndex(0);
         setPageIndex(0);
         setScreen("shelf");
       } else if (duplicateBooks.length) {
         const existing = duplicateBooks[duplicateBooks.length - 1];
-        setBook(existing);
         setActiveCategory("鍏ㄩ儴");
         setActiveType("鍏ㄩ儴绫诲瀷");
-        setScreen("shelf");
+        openShelfBook(existing);
       }
 
       const messages = [];
       if (importedBooks.length) messages.push(`宸插鍏?${importedBooks.length} 鏈功`);
       if (upgradedCount) messages.push(`宸插崌绾?${upgradedCount} 鏈彃鍥捐В鏋恅);
       if (classifiedCount) messages.push(`宸茶瘑鍒?${classifiedCount} 鏈被鍨媊);
-      if (duplicateCount) messages.push(`${duplicateCount} 鏈凡鍦ㄤ功鏋朵腑`);
+      if (duplicateCount && !shelfUpdates.length) messages.push("涔︽灦宸叉湁杩欐湰涔︼紝宸蹭负浣犳墦寮€");
+      else if (duplicateCount) messages.push(`${duplicateCount} 鏈凡鍦ㄤ功鏋朵腑`);
       if (unsupported.length) messages.push(`${unsupported.length} 涓殏涓嶆敮鎸佺殑鏂囦欢宸茶烦杩嘸);
       if (failedCount) messages.push(`${failedCount} 鏈鍏ュけ璐);
       if (!shelfUpdates.length && failedCount && firstFailureMessage) messages.push(firstFailureMessage);
       showNotice(messages.join("锛?) || "娌℃湁鍙鍏ョ殑涔︾睄");
     } catch (error) {
       setLoadError(error.message || "瀵煎叆澶辫触锛岃妫€鏌ヤ功绫嶆枃浠?);
     } finally {
       setImportStatus(null);
@@ -1465,17 +1477,21 @@ export function App() {
             bookType: bookProfile?.category || book.bookType,
             indexSchema: bookProfile?.facets || book.indexSchema,
             chapters: newChapters,
           },
         }),
       });
       await yieldToBrowser();
       const result = await response.json();
-      if (!response.ok) throw new Error(result.error || "鍒嗘瀽鏈嶅姟鏆備笉鍙敤");
+      if (!response.ok) {
+        const message = result.error || "鍒嗘瀽鏈嶅姟鏆備笉鍙敤";
+        if (isMissingApiKeyError(message)) noticeMissingApiKey();
+        throw new Error(message);
+      }
       const nextBookMemory = normalizeBookMemory(result.bookMemory || {
         index: result.index,
         traceMemory: result.traceMemory,
         cursor,
         profile: result.profile,
         traceProfile: result.traceProfile || traceProfile,
       }, {
         bookId: book.id || book.title || "book",
@@ -1559,20 +1575,23 @@ export function App() {
           currentPageBrief: payload.currentPageBrief,
         }),
       });
       const result = await response.json();
       if (response.status === 422 && result?.fallback) {
         const fallbackPlan = applySituationBridgeJudgement(shortlist, result.judgement || { bridges: [] });
         return situationBridgeToRecoveryCard(fallbackPlan) || localFallback;
       }
-      if (!response.ok) throw new Error(result.error || "Situation bridge failed");
+      if (!response.ok) {
+        throw new Error(result.error || "Situation bridge failed");
+      }
       const plan = applySituationBridgeJudgement(shortlist, result.judgement);
       return situationBridgeToRecoveryCard(plan) || localFallback;
     } catch (error) {
+      if (isMissingApiKeyError(error?.message)) noticeMissingApiKey("宸叉敼鐢ㄦ湰鍦版帴椹?);
       console.warn("Situation bridge fallback:", error);
       return localFallback;
     }
   }
 
   async function requestModelRecoveryCard({
     targetBook = book,
     cursor,
@@ -2028,17 +2047,26 @@ export function App() {
     setBookmarks((items) => {
       const next = items.filter((item) => item.id !== id);
       localStorage.setItem(bookmarkStorageKey(book), JSON.stringify(next));
       return next;
     });
   }
 
   if (loadError && !book && !libraryBooks.length && screen !== "shelf") {
-    return <main className="loading-screen"><div className="loader-mark"><FileText size={26} /></div><strong>鏃犳硶鎵撳紑杩欐湰涔?/strong><span>{loadError}</span><button className="primary-button" onClick={() => inputRef.current?.click()}><Upload size={16} /> 閫夋嫨涔︾睄鏂囦欢</button><input ref={inputRef} className="sr-only" type="file" multiple accept={SUPPORTED_IMPORT_ACCEPT} onChange={importBook} /></main>;
+    return (
+      <main className="loading-screen">
+        <div className="loader-mark"><FileText size={26} /></div>
+        <strong>鏃犳硶鍔犺浇鍐呯疆涔︺€婇暱寰併€?/strong>
+        <span>{loadError}</span>
+        <button className="primary-button" type="button" onClick={() => void loadBuiltInBook()} title="閲嶈瘯鍔犺浇銆婇暱寰併€? aria-label="閲嶈瘯鍔犺浇銆婇暱寰併€?>閲嶈瘯鍔犺浇銆婇暱寰併€?/button>
+        <button className="text-action" type="button" onClick={() => inputRef.current?.click()}><Upload size={16} /> 閫夋嫨涔︾睄鏂囦欢</button>
+        <input ref={inputRef} className="sr-only" type="file" multiple accept={SUPPORTED_IMPORT_ACCEPT} onChange={importBook} />
+      </main>
+    );
   }
 
   if (!book && screen !== "shelf") {
     return <main className="loading-screen"><div className="loader-mark"><BookOpen size={26} /></div><strong>涔︽灦杩樻病鏈夊彲闃呰鐨勪功</strong><span>璇峰厛瀵煎叆涓€鏈?EPUB銆丳DF 鎴?MOBI / AZW3銆?/span><button className="primary-button" onClick={() => inputRef.current?.click()}><Upload size={16} /> 瀵煎叆涔︾睄</button><input ref={inputRef} className="sr-only" type="file" multiple accept={SUPPORTED_IMPORT_ACCEPT} onChange={importBook} /></main>;
   }
 
   if (screen === "skills") {
     return <SkillTreeScreen book={book} config={activeSkillConfig} domain={activeSkillDomain} progress={readingProgress} domainProgress={activeDomainProgress} onBack={() => setScreen("shelf")} />;
@@ -2067,17 +2095,35 @@ export function App() {
           <section><h3>鑷畾涔夋爣绛?/h3>{categories.map((category) => <button className={activeCategory === category ? "filter-row active" : "filter-row"} key={category} onClick={() => setActiveCategory(category)}>{category}<span>{bookCategories.includes(category) ? 1 : 0}</span></button>)}<button className="filter-row muted" onClick={() => setCategoryModalOpen(true)}>绠＄悊鍒嗙被<Tag size={15} /></button></section>
           <section><h3>鍥句功绫诲瀷</h3><button className={activeType === "鍏ㄩ儴绫诲瀷" ? "filter-row active" : "filter-row"} onClick={() => setActiveType("鍏ㄩ儴绫诲瀷")}>鍏ㄩ儴绫诲瀷<span>{shelfBooks.length}</span></button>{BOOK_TYPES.map((type) => <button className={activeType === type.name ? "filter-row active" : "filter-row"} key={type.id} onClick={() => setActiveType(type.name)}><i /><span>{type.name}</span><small>{shelfBooks.filter((item) => item.bookType === type.name).length}</small></button>)}</section>
         </aside>
         <section className="library-content">
           <header className="library-heading"><div><p>{shelfLabel}</p><h1>{activeType !== "鍏ㄩ儴绫诲瀷" ? "绫诲瀷鍥句功" : activeCategory === "鍏ㄩ儴" ? "姝ｅ湪闃呰" : "鍒嗙被鍥句功"}</h1><small className="import-format-note">褰撳墠鍙洿鎺ラ槄璇?EPUB銆丳DF銆丮OBI / AZW / AZW3锛汿XT銆丏OCX銆丗B2 绛夋牸寮忓皢浣滀负鍚庣画瑙ｆ瀽鍣ㄦ帴鍏ャ€?/small></div><button className="sort-button"><SlidersHorizontal size={16} /> 鏈€杩戦槄璇?<ChevronDown size={15} /></button></header>
           {searchedShelfBooks.length ? <div className="book-grid">{searchedShelfBooks.map((shelfBook) => {
             const shelfState = shelfBookStates.get(shelfBook.id) || getBookShelfState(shelfBook);
             return <article className="book-card" key={shelfBook.id}><BookCover book={shelfBook} /><div className="book-info"><div className="book-card-actions">{!shelfBook.local && <button className="book-delete-button" onClick={() => requestDeleteBook(shelfBook)} title="鍒犻櫎涔︾睄"><X size={14} /></button>}</div><div className="book-tags"><span>{shelfBook.bookType || "寰?AI 璇嗗埆"}</span></div><h2>{shelfBook.title}</h2><p>{shelfBook.creator}</p><p className="publisher">{shelfBook.publisher || localFormatLabel(shelfBook)}</p><div className="book-progress"><span><i style={{ width: `${shelfState.percent}%` }} /></span><b>{shelfState.hasRead ? `${shelfState.percent}%` : "鏈"}</b><small>{shelfState.label}</small></div><button className="read-button" onPointerDown={(event) => { if (event.button === 0) openShelfBook(shelfBook); }} onClick={() => openShelfBook(shelfBook)}>鎵撳紑闃呰 <ChevronRight size={17} /></button></div></article>;
-          })}</div> : <div className="empty-library"><ListFilter size={28} /><strong>杩欎釜鍒嗙被杩樻病鏈夊浘涔?/strong><span>瀵煎叆涓€鏈?EPUB銆丳DF 鎴?MOBI / AZW3 鍚庡氨鍙互寮€濮嬮槄璇汇€?/span><button className="text-action" onClick={() => inputRef.current?.click()}>瀵煎叆涔︾睄</button></div>}
+          })}</div> : (
+            <div className="empty-library">
+              <ListFilter size={28} />
+              {loadError && !libraryBooks.length ? (
+                <>
+                  <strong>鏃犳硶鍔犺浇鍐呯疆涔︺€婇暱寰併€?/strong>
+                  <span>{loadError}</span>
+                  <button className="primary-button" type="button" onClick={() => void loadBuiltInBook()} title="閲嶈瘯鍔犺浇銆婇暱寰併€? aria-label="閲嶈瘯鍔犺浇銆婇暱寰併€?>閲嶈瘯鍔犺浇銆婇暱寰併€?/button>
+                  <button className="text-action" type="button" onClick={() => inputRef.current?.click()}>瀵煎叆涔︾睄</button>
+                </>
+              ) : (
+                <>
+                  <strong>杩欎釜鍒嗙被杩樻病鏈夊浘涔?/strong>
+                  <span>瀵煎叆涓€鏈?EPUB銆丳DF 鎴?MOBI / AZW3 鍚庡氨鍙互寮€濮嬮槄璇汇€?/span>
+                  <button className="text-action" type="button" onClick={() => inputRef.current?.click()}>瀵煎叆涔︾睄</button>
+                </>
+              )}
+            </div>
+          )}
         </section>
         {shelfSearchOpen && <div className="library-search-panel"><div className="search-panel-head"><h2>{shelfSearchText ? "鎼滅储缁撴灉" : "涔︽灦涓婄殑鐑棬"}</h2><button onClick={() => setShelfSearchOpen(false)} aria-label="鍏抽棴鎼滅储"><X size={20} /></button></div><div className="search-suggestion-grid">{(shelfSearchText ? searchedShelfBooks : shelfBooks).slice(0, 6).map((item) => <button className="search-suggestion-card" key={item.id} onClick={() => { setShelfSearchOpen(false); openShelfBook(item); }}><BookCover book={item} /><span>{item.title}</span><small>{item.bookType || localFormatLabel(item)}</small></button>)}{!shelfSearchText && shelfSearchSuggestions.map((item) => <button className="search-suggestion-card type-result" key={item.label} onClick={() => { setActiveType(item.label); setShelfSearchOpen(false); }}><i /><span>{item.label}</span><small>{item.count} 鏈?/small></button>)}</div></div>}
         {categoryModalOpen && <CategoryModal categories={categories} selected={bookCategories} newCategory={newCategory} setNewCategory={setNewCategory} onAdd={addCategory} onToggle={toggleBookCategory} onClose={() => setCategoryModalOpen(false)} />}
         {deleteCandidate && <DeleteBookConfirmModal book={deleteCandidate} onCancel={() => setDeleteCandidate(null)} onConfirm={confirmDeleteBook} />}
         {importStatus && <ImportProgressModal status={importStatus} />}
       </main>
     );
   }

