(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const elements = {
    app: $("#app"),
    body: document.body,
    workspace: $("#workspace"),
    welcome: $("#welcome"),
    reader: $("#reader"),
    content: $("#content"),
    fileInput: $("#fileInput"),
    knownInput: $("#knownInput"),
    fileTitle: $("#fileTitle"),
    readTime: $("#readTime"),
    documentName: $("#documentName"),
    documentDate: $("#documentDate"),
    railLabel: $("#railLabel"),
    footerProgress: $("#footerProgress"),
    cutoff: $("#cutoff"),
    cutoffValue: $("#cutoffValue"),
    cutoffLabel: $("#cutoffLabel"),
    fontSize: $("#fontSize"),
    fontSizeValue: $("#fontSizeValue"),
    readerWidth: $("#readerWidth"),
    readerWidthValue: $("#readerWidthValue"),
    phraseToggle: $("#phraseToggle"),
    glossToggle: $("#glossToggle"),
    frequencyToggle: $("#frequencyToggle"),
    highlightButton: $("#highlightButton"),
    clickModeToggle: $("#clickModeToggle"),
    immersiveToggle: $("#immersiveToggle"),
    immersiveExit: $("#immersiveExit"),
    immersiveProgress: $("#immersiveProgress"),
    immersiveProgressBar: $("#immersiveProgressBar"),
    immersivePercent: $("#immersivePercent"),
    forcedCount: $("#forcedCount"),
    manageForced: $("#manageForced"),
    forcedPanel: $("#forcedPanel"),
    forcedFilter: $("#forcedFilter"),
    forcedList: $("#forcedList"),
    forcedEmpty: $("#forcedEmpty"),
    themeToggle: $("#themeToggle"),
    themeIcon: $("#themeIcon"),
    sidebar: $("#sidebar"),
    sidebarToggle: $("#sidebarToggle"),
    sidebarScrim: $("#sidebarScrim"),
    tocSection: $("#tocSection"),
    toc: $("#toc"),
    tocModeBadge: $("#tocModeBadge"),
    dropOverlay: $("#dropOverlay"),
    toast: $("#toast"),
    aboutDialog: $("#aboutDialog"),
    knownCount: $("#knownCount"),
    knownFilter: $("#knownFilter"),
    knownList: $("#knownList"),
    knownEmpty: $("#knownEmpty"),
    knownPanel: $("#knownPanel"),
    manageKnown: $("#manageKnown"),
    exportKnown: $("#exportKnown"),
    dictStatus: $("#dictStatus"),
    dictList: $("#dictList"),
    dictCount: $("#dictCount"),
    dictRetry: $("#dictRetry"),
    dictClearGlosses: $("#dictClearGlosses"),
    dictDialog: $("#dictDialog"),
    dictClose: $("#dictClose"),
    dictWord: $("#dictWord"),
    dictWordMeta: $("#dictWordMeta"),
    dictSearchForm: $("#dictSearchForm"),
    dictSearch: $("#dictSearch"),
    dictTabs: $("#dictTabs"),
    dictSenses: $("#dictSenses"),
    dictFullToggle: $("#dictFullToggle"),
    dictArticle: $("#dictArticle"),
    dictOpenGolden: $("#dictOpenGolden"),
    dictResetGloss: $("#dictResetGloss"),
    annotatedStat: $("#annotatedStat"),
    phraseStat: $("#phraseStat"),
    unfamiliarStat: $("#unfamiliarStat"),
    uniqueStat: $("#uniqueStat"),
    metaFrequency: $("#metaFrequency"),
    metaGlossary: $("#metaGlossary"),
    metaPhrases: $("#metaPhrases"),
    metaDictionary: $("#metaDictionary"),
    saveBookmark: $("#saveBookmark"),
    saveBookmarkLabel: $("#saveBookmarkLabel"),
    jumpBookmark: $("#jumpBookmark"),
    bookmarkPanel: $("#bookmarkPanel"),
    bookmarkList: $("#bookmarkList"),
    bookmarkCount: $("#bookmarkCount"),
    bookmarkSummary: $("#bookmarkSummary"),
  };

  const DEFAULT_PREFS = {
    cutoff: 1200,
    mode: "rare",
    fontSize: 19,
    readerWidth: 760,
    phrases: true,
    frequency: true,
    showGloss: true,
    theme: "light",
    clickToAnnotate: true,
    dictionaries: [],
  };

  const STORAGE = {
    prefs: "reading-room:prefs:v1",
    known: "reading-room:known:v1",
    forced: "reading-room:forced:v1",
    glosses: "reading-room:glosses:v1",
    document: "reading-room:last-document:v1",
    progress: "reading-room:progress:v2",
    bookmarks: "reading-room:bookmarks:v3",
    legacyBookmarks: "reading-room:bookmarks:v2",
    highlights: "reading-room:highlights:v1",
  };

  const state = {
    prefs: loadPrefs(),
    knownWords: loadKnownWords(),
    forcedWords: loadForcedWords(),
    glossOverrides: loadGlossOverrides(),
    dictionaries: [],
    dictionaryReady: false,
    apiBase: "",
    lookupPayload: null,
    lookupContext: null,
    activeDictTab: "",
    immersive: false,
    markdown: "",
    fileName: "",
    modifiedAt: 0,
    eligibleOccurrences: 0,
    eligibleUnique: new Set(),
    toastTimer: 0,
    scrollTicking: false,
    progressSaveTimer: 0,
    refreshTimer: 0,
    restoringTimer: 0,
    restoringLocation: false,
    dragDepth: 0,
    documentKey: "",
    progressMap: loadLocationMap(STORAGE.progress),
    bookmarkMap: loadBookmarks(),
    highlightMap: loadHighlights(),
    annotationObserver: null,
    annotatedBlocks: new Set(),
  };

  let blockSources = new WeakMap();
  let blockMetrics = new WeakMap();

  const markdown = window.markdownit({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
  });

  const SAFE_HTML_TAGS = new Set([
    "abbr", "b", "bdi", "bdo", "br", "cite", "data", "del", "details", "dfn",
    "div", "em", "ins", "kbd", "mark", "p", "q", "s", "samp", "small", "span",
    "strong", "sub", "summary", "sup", "time", "u", "var", "wbr",
  ]);
  const UNSAFE_HTML_TAGS = new Set([
    "base", "button", "embed", "form", "frame", "frameset", "iframe", "img",
    "input", "link", "math", "meta", "noembed", "noframes", "noscript",
    "object", "option", "script", "select", "style", "svg", "textarea",
    "title", "video", "audio", "canvas", "portal", "xmp",
  ]);
  const SAFE_HTML_ATTRIBUTES = new Set([
    "aria-label", "class", "data-block-type", "dir", "id", "lang", "style", "title",
  ]);

  function normalizeHtmlQuotes(html) {
    return html.replace(
      /<\/?[A-Za-z][^>]*>/g,
      (tag) => tag.replace(/[“”]/g, '"')
    );
  }

  function safeHtmlColor(value) {
    const color = String(value || "").trim();
    if (
      /^#[0-9a-f]{3,8}$/i.test(color) ||
      /^rgba?\([0-9\s.,/]+\)$/i.test(color) ||
      /^hsla?\([0-9\s.,/]+\)$/i.test(color)
    ) {
      return color;
    }
    return "";
  }

  function safeHtmlStyle(value) {
    const declarations = [];
    for (const declaration of String(value || "").split(";")) {
      const separator = declaration.indexOf(":");
      if (separator < 0) continue;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const rawValue = declaration.slice(separator + 1).trim();
      if (property === "color") {
        const color = safeHtmlColor(rawValue);
        if (color) declarations.push(`color:${color}`);
      }
    }
    return declarations.join(";");
  }

  function copySafeHtmlAttributes(source, target) {
    for (const attribute of [...source.attributes]) {
      const name = attribute.name.toLowerCase();
      if (!SAFE_HTML_ATTRIBUTES.has(name)) continue;
      if (name.startsWith("on")) continue;

      let value = attribute.value;
      if (name === "style") {
        value = safeHtmlStyle(value);
        if (!value) continue;
      }
      if (name === "id" && !/^[A-Za-z][\w:.-]*$/.test(value)) continue;
      try {
        target.setAttribute(name, value);
      } catch {
        // Unsupported values are ignored instead of breaking the document.
      }
    }
    return target;
  }

  function sanitizeHtmlNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const tagName = node.tagName.toLowerCase();
    if (UNSAFE_HTML_TAGS.has(tagName)) return null;

    if (SAFE_HTML_TAGS.has(tagName)) {
      const safeNode = copySafeHtmlAttributes(node, document.createElement(tagName));
      for (const child of [...node.childNodes]) {
        const safeChild = sanitizeHtmlNode(child);
        if (safeChild) safeNode.append(safeChild);
      }
      return safeNode;
    }

    const fragment = document.createDocumentFragment();
    for (const child of [...node.childNodes]) {
      const safeChild = sanitizeHtmlNode(child);
      if (safeChild) fragment.append(safeChild);
    }
    return fragment;
  }

  function sanitizeHtmlFragment(html) {
    const normalized = normalizeHtmlQuotes(html);
    const template = document.createElement("template");
    template.innerHTML = normalized;

    const fragment = document.createDocumentFragment();
    for (const child of [...template.content.childNodes]) {
      const safeChild = sanitizeHtmlNode(child);
      if (safeChild) fragment.append(safeChild);
    }

    const holder = document.createElement("div");
    holder.append(fragment);
    return holder.innerHTML;
  }

  function sanitizeHtmlTag(html) {
    const normalized = normalizeHtmlQuotes(html).trim();
    const opening = normalized.match(/^<([A-Za-z][\w:-]*)([^>]*)>$/);
    const closing = normalized.match(/^<\/([A-Za-z][\w:-]*)>$/);

    if (closing) {
      const tagName = closing[1].toLowerCase();
      return SAFE_HTML_TAGS.has(tagName) && !UNSAFE_HTML_TAGS.has(tagName)
        ? `</${tagName}>`
        : "";
    }
    if (!opening) return "";

    const tagName = opening[1].toLowerCase();
    if (!SAFE_HTML_TAGS.has(tagName) || UNSAFE_HTML_TAGS.has(tagName)) return "";

    const template = document.createElement("template");
    template.innerHTML = normalized;
    const source = template.content.firstElementChild;
    if (!source || source.tagName.toLowerCase() !== tagName) return "";

    const safeNode = copySafeHtmlAttributes(source, document.createElement(tagName));
    return safeNode.outerHTML.replace(/<\/[A-Za-z][^>]*>$/, "");
  }

  markdown.renderer.rules.html_block = (_tokens, index) =>
    sanitizeHtmlFragment(_tokens[index].content);
  markdown.renderer.rules.html_inline = (_tokens, index) =>
    sanitizeHtmlTag(_tokens[index].content) ||
    sanitizeHtmlFragment(_tokens[index].content);

  if (window.markdownItKatex) {
    markdown.use(window.markdownItKatex, {
      errorColor: "var(--vermilion-dark)",
    });
  }

  const wordPattern = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
  const lowValueAcronyms = new Set(["cc", "ok"]);
  const headingObserverTargets = [];
  let tocMode = "source";

  function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE.prefs) || "{}");
      return { ...DEFAULT_PREFS, ...saved };
    } catch {
      return { ...DEFAULT_PREFS };
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(STORAGE.prefs, JSON.stringify(state.prefs));
    } catch {
      // Preferences remain active for this session if storage is unavailable.
    }
  }

  function loadKnownWords() {
    try {
      const values = JSON.parse(localStorage.getItem(STORAGE.known) || "[]");
      return new Set(Array.isArray(values) ? values : []);
    } catch {
      return new Set();
    }
  }

  function saveKnownWords() {
    try {
      localStorage.setItem(STORAGE.known, JSON.stringify([...state.knownWords]));
      return true;
    } catch {
      return false;
    }
  }

  function loadForcedWords() {
    try {
      const values = JSON.parse(localStorage.getItem(STORAGE.forced) || "[]");
      return new Set(Array.isArray(values) ? values : []);
    } catch {
      return new Set();
    }
  }

  function saveForcedWords() {
    try {
      localStorage.setItem(STORAGE.forced, JSON.stringify([...state.forcedWords]));
      return true;
    } catch {
      return false;
    }
  }

  function loadGlossOverrides() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE.glosses) || "{}");
      const entries = Object.entries(saved).filter(
        ([key, value]) =>
          typeof key === "string" &&
          typeof value === "string" &&
          value.trim() &&
          // 接口形状变更期间可能写入过坏值，加载时直接丢掉。
          !value.includes("[object Object]")
      );
      return new Map(entries);
    } catch {
      return new Map();
    }
  }

  function saveGlossOverrides() {
    try {
      localStorage.setItem(
        STORAGE.glosses,
        JSON.stringify(Object.fromEntries(state.glossOverrides))
      );
      return true;
    } catch {
      return false;
    }
  }

  function loadLocationMap(storageKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    } catch {
      return {};
    }
  }

  function saveLocationMap(storageKey, map, limit) {
    try {
      const entries = Object.entries(map)
        .filter(([, location]) => location && typeof location === "object")
        .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
        .slice(0, limit);
      const nextMap = Object.fromEntries(entries);
      Object.keys(map).forEach((key) => {
        if (!nextMap[key]) delete map[key];
      });
      localStorage.setItem(storageKey, JSON.stringify(nextMap));
      return true;
    } catch {
      return false;
    }
  }

  function isValidBookmarkArray(value) {
    return (
      Array.isArray(value) &&
      value.every(
        (bookmark) =>
          bookmark &&
          typeof bookmark === "object" &&
          Number.isFinite(Number(bookmark.blockIndex))
      )
    );
  }

  function loadBookmarks() {
    try {
      const current = JSON.parse(localStorage.getItem(STORAGE.bookmarks) || "{}");
      if (current && typeof current === "object" && !Array.isArray(current)) {
        const normalized = Object.fromEntries(
          Object.entries(current).filter(([, bookmarks]) => isValidBookmarkArray(bookmarks))
        );
        if (Object.keys(normalized).length) return normalized;
      }
    } catch {
      // Fall through to the legacy single-bookmark format.
    }

    try {
      const legacy = JSON.parse(localStorage.getItem(STORAGE.legacyBookmarks) || "{}");
      const migrated = {};
      if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
        Object.entries(legacy).forEach(([documentKey, bookmark]) => {
          if (bookmark && typeof bookmark === "object") {
            migrated[documentKey] = [
              {
                ...bookmark,
                id: bookmark.id || `legacy-${fnv1a(JSON.stringify(bookmark))}`,
                createdAt: bookmark.createdAt || bookmark.updatedAt || Date.now(),
              },
            ];
          }
        });
      }
      if (Object.keys(migrated).length) {
        localStorage.setItem(STORAGE.bookmarks, JSON.stringify(migrated));
        return migrated;
      }
    } catch {
      // Damaged local data is ignored and the reader starts with no bookmarks.
    }
    return {};
  }

  function saveBookmarks() {
    try {
      const entries = Object.entries(state.bookmarkMap)
        .map(([documentKey, bookmarks]) => [
          documentKey,
          (isValidBookmarkArray(bookmarks) ? bookmarks : [])
            .slice()
            .sort(
              (a, b) =>
                Number(a.blockIndex) - Number(b.blockIndex) ||
                Number(a.offsetRatio || 0) - Number(b.offsetRatio || 0)
            )
            .slice(0, 60),
        ])
        .filter(([, bookmarks]) => bookmarks.length)
        .sort(
          (a, b) =>
            Math.max(0, ...b[1].map((bookmark) => Number(bookmark.updatedAt) || 0)) -
            Math.max(0, ...a[1].map((bookmark) => Number(bookmark.updatedAt) || 0))
        )
        .slice(0, 60);

      const nextMap = Object.fromEntries(entries);
      Object.keys(state.bookmarkMap).forEach((documentKey) => {
        if (!nextMap[documentKey]) delete state.bookmarkMap[documentKey];
      });
      localStorage.setItem(STORAGE.bookmarks, JSON.stringify(nextMap));
      return true;
    } catch {
      return false;
    }
  }

  function fnv1a(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }

  function createDocumentKey(text, fileName) {
    const normalizedName = (fileName || "document.md").toLowerCase();
    return `${fnv1a(text)}-${text.length.toString(36)}-${fnv1a(normalizedName)}`;
  }

  function blockExcerpt(block) {
    const source = blockSources.get(block);
    let text = block.textContent || "";
    if (source !== undefined) {
      const scratch = document.createElement("div");
      scratch.innerHTML = source;
      text = scratch.textContent || text;
    }
    return text.replace(/\s+/g, " ").trim().slice(0, 96);
  }

  function captureReadingAnchor() {
    const blocks = [...elements.content.children];
    if (!blocks.length || !state.documentKey) return null;

    const readingLine = window.innerHeight * 0.32;
    let block = blocks.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.top <= readingLine && rect.bottom >= readingLine;
    });

    if (!block) {
      block = blocks.reduce((closest, candidate) => {
        const distance = Math.abs(candidate.getBoundingClientRect().top - readingLine);
        return !closest || distance < closest.distance ? { candidate, distance } : closest;
      }, null)?.candidate;
    }
    if (!block) block = blocks[0];

    const index = blocks.indexOf(block);
    const rect = block.getBoundingClientRect();
    const offsetRatio = rect.height > 0
      ? Math.min(1, Math.max(0, (readingLine - rect.top) / rect.height))
      : 0;
    const scrollMax = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);

    let chapterTarget = null;
    for (const target of headingObserverTargets) {
      if (target.heading.getBoundingClientRect().top <= readingLine) chapterTarget = target;
      else break;
    }
    if (!chapterTarget && headingObserverTargets.length) {
      chapterTarget = headingObserverTargets.reduce((closest, target) => {
        const distance = Math.abs(target.heading.getBoundingClientRect().top - readingLine);
        return !closest || distance < closest.distance ? { target, distance } : closest;
      }, null)?.target;
    }

    return {
      blockIndex: index,
      offsetRatio,
      excerpt: blockExcerpt(block),
      scrollRatio: Math.min(1, Math.max(0, window.scrollY / scrollMax)),
      chapter:
        (chapterTarget
          ? (blockExcerpt(chapterTarget.heading) ||
            chapterTarget.heading.textContent.replace(/\s+/g, " ").trim())
          : ""
        ).slice(0, 72),
      chapterId: chapterTarget?.heading.id || "",
      fileName: state.fileName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  function findAnchorBlock(location) {
    const blocks = [...elements.content.children];
    if (!blocks.length) return null;
    const preferred = blocks[Number(location.blockIndex)];
    if (preferred && (!location.excerpt || blockExcerpt(preferred) === location.excerpt)) {
      return { block: preferred, index: Number(location.blockIndex) };
    }
    if (!location.excerpt) return null;

    const index = blocks.findIndex((block) => blockExcerpt(block) === location.excerpt);
    if (index >= 0) return { block: blocks[index], index };
    const looseIndex = blocks.findIndex((block) => blockExcerpt(block).includes(location.excerpt.slice(0, 48)));
    return looseIndex >= 0 ? { block: blocks[looseIndex], index: looseIndex } : null;
  }

  function cancelLocationRestore() {
    if (!state.restoringLocation) return;
    clearTimeout(state.restoringTimer);
    state.restoringTimer = 0;
    state.restoringLocation = false;
  }

  function restoreLocation(location, { behavior = "auto", silent = false } = {}) {
    if (!location || !state.markdown || elements.reader.hidden) return false;

    const locationScrollTop = () => {
      const scrollMax = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      let top = scrollMax * Math.min(1, Math.max(0, Number(location.scrollRatio) || 0));
      const anchor = findAnchorBlock(location);

      if (anchor) {
        const rect = anchor.block.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, Number(location.offsetRatio) || 0));
        top = rect.top + window.scrollY + rect.height * ratio - window.innerHeight * 0.32;
      }
      return Math.min(scrollMax, Math.max(0, top));
    };

    clearTimeout(state.restoringTimer);
    state.restoringLocation = true;
    window.scrollTo({ top: locationScrollTop(), behavior });

    // 先把目标位置上方的一批段落标注好，避免它们之后变高把正文往下推。
    const anchorBlock = findAnchorBlock(location);
    if (anchorBlock) {
      const blocks = [...elements.content.children];
      const anchorIndex = blocks.indexOf(anchorBlock.block);
      for (let index = Math.max(0, anchorIndex - 60); index <= anchorIndex; index += 1) {
        annotateBlock(blocks[index]);
      }
    }

    const settleLocation = (remainingPasses, stableCount = 0) => {
      const top = locationScrollTop();
      let stable = stableCount;
      // 懒标注会让上方的段落变高，位置会漂移几次；稳定两轮就收尾。
      if (Math.abs(window.scrollY - top) > 8) {
        window.scrollTo({ top, behavior: "auto" });
        stable = 0;
      } else {
        stable += 1;
      }

      if (remainingPasses > 0 && stable < 2) {
        state.restoringTimer = window.setTimeout(
          () => settleLocation(remainingPasses - 1, stable),
          260
        );
        return;
      }

      state.restoringTimer = window.setTimeout(() => {
        state.restoringLocation = false;
        saveReadingProgress(true);
        updateFooterProgress();
      }, 100);
    };

    state.restoringTimer = window.setTimeout(
      () => settleLocation(6, 0),
      behavior === "smooth" ? 900 : 100
    );

    // 恢复过程中用户自己滚动就立刻让位。
    const cancelOnUserScroll = () => cancelLocationRestore();
    window.addEventListener("wheel", cancelOnUserScroll, { passive: true, once: true });
    window.addEventListener("touchstart", cancelOnUserScroll, { passive: true, once: true });
    window.setTimeout(
      () => {
        window.removeEventListener("wheel", cancelOnUserScroll);
        window.removeEventListener("touchstart", cancelOnUserScroll);
      },
      behavior === "smooth" ? 2600 : 2000
    );

    if (!silent) showToast("已跳转到书签位置。");
    return true;
  }

  function saveReadingProgress(force = false) {
    if (!state.documentKey || !state.markdown) return;
    if (state.restoringLocation && !force) return;

    clearTimeout(state.progressSaveTimer);
    state.progressSaveTimer = 0;
    const anchor = captureReadingAnchor();
    if (!anchor) return;

    state.progressMap[state.documentKey] = anchor;
    saveLocationMap(STORAGE.progress, state.progressMap, 60);
  }

  function scheduleProgressSave() {
    if (!state.documentKey || state.restoringLocation) return;
    clearTimeout(state.progressSaveTimer);
    state.progressSaveTimer = window.setTimeout(() => saveReadingProgress(), 400);
  }

  function formatBookmarkTime(timestamp) {
    if (!timestamp) return "";
    try {
      return new Intl.DateTimeFormat("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(timestamp));
    } catch {
      return "";
    }
  }

  function currentBookmarks() {
    const bookmarks = state.documentKey ? state.bookmarkMap[state.documentKey] : null;
    return isValidBookmarkArray(bookmarks) ? bookmarks : [];
  }

  function bookmarkTitle(bookmark, index) {
    const chapter = String(bookmark.chapter || "").trim();
    const excerpt = String(bookmark.excerpt || "").trim();
    if (chapter) return chapter;
    if (excerpt) return excerpt.slice(0, 42);
    return `书签 ${String(index + 1).padStart(2, "0")}`;
  }

  function closeBookmarkPanel() {
    elements.bookmarkPanel.hidden = true;
    elements.jumpBookmark.setAttribute("aria-expanded", "false");
  }

  function toggleBookmarkPanel(force) {
    const shouldOpen =
      typeof force === "boolean" ? force : elements.bookmarkPanel.hidden;
    elements.bookmarkPanel.hidden = !shouldOpen;
    elements.jumpBookmark.setAttribute("aria-expanded", String(shouldOpen));
    if (shouldOpen) renderBookmarkList();
  }

  function jumpToBookmark(bookmark) {
    if (!bookmark) return;
    closeBookmarkPanel();
    restoreLocation(bookmark, { behavior: "smooth" });
  }

  function deleteBookmark(bookmarkId) {
    const bookmarks = currentBookmarks();
    const target = bookmarks.find((bookmark) => bookmark.id === bookmarkId);
    const next = bookmarks.filter((bookmark) => bookmark.id !== bookmarkId);
    if (next.length === bookmarks.length) return;

    if (next.length) state.bookmarkMap[state.documentKey] = next;
    else delete state.bookmarkMap[state.documentKey];

    const persisted = saveBookmarks();
    syncBookmarkControls();
    showToast(
      persisted
        ? `已删除书签：${target ? bookmarkTitle(target, 0) : "指定位置"}`
        : "已删除当前列表中的书签，但浏览器保存失败。"
    );
  }

  function renderBookmarkList() {
    const bookmarks = currentBookmarks();
    elements.bookmarkList.replaceChildren();

    if (!bookmarks.length) {
      const empty = document.createElement("p");
      empty.className = "bookmark-panel__empty";
      empty.textContent = "还没有书签。阅读到需要返回的位置时，点击“添加书签”。";
      elements.bookmarkList.append(empty);
      return;
    }

    bookmarks.forEach((bookmark, index) => {
      const item = document.createElement("div");
      item.className = "bookmark-item";

      const jump = document.createElement("button");
      jump.className = "bookmark-item__jump";
      jump.type = "button";
      jump.setAttribute("role", "menuitem");

      const number = document.createElement("span");
      number.className = "bookmark-item__number";
      number.textContent = String(index + 1).padStart(2, "0");

      const copy = document.createElement("span");
      copy.className = "bookmark-item__copy";

      const title = document.createElement("strong");
      title.textContent = bookmarkTitle(bookmark, index);

      const meta = document.createElement("small");
      const excerpt = String(bookmark.excerpt || "文章开头").trim();
      meta.textContent = `${excerpt} · ${formatBookmarkTime(bookmark.updatedAt)}`;

      copy.append(title, meta);
      jump.append(number, copy);
      jump.addEventListener("click", () => jumpToBookmark(bookmark));

      const remove = document.createElement("button");
      remove.className = "bookmark-item__delete";
      remove.type = "button";
      remove.textContent = "×";
      remove.title = `删除书签：${bookmarkTitle(bookmark, index)}`;
      remove.setAttribute("aria-label", remove.title);
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteBookmark(bookmark.id);
        renderBookmarkList();
      });

      item.append(jump, remove);
      elements.bookmarkList.append(item);
    });
  }

  function syncBookmarkControls() {
    const bookmarks = currentBookmarks();
    elements.saveBookmarkLabel.textContent = "添加书签";
    elements.bookmarkCount.textContent = `书签 ${bookmarks.length.toLocaleString("zh-CN")}`;

    if (!bookmarks.length) {
      elements.bookmarkSummary.textContent = "还没有书签";
    } else {
      const latest = bookmarks.reduce((newest, bookmark) =>
        (bookmark.updatedAt || 0) > (newest.updatedAt || 0) ? bookmark : newest
      );
      elements.bookmarkSummary.textContent =
        `${bookmarks.length} 个位置 · 最近 ${formatBookmarkTime(latest.updatedAt)}`;
    }

    if (!elements.bookmarkPanel.hidden) renderBookmarkList();
  }

  function saveBookmark() {
    if (!state.markdown) {
      showToast("请先打开一篇文稿，再添加书签。");
      return;
    }
    const bookmark = captureReadingAnchor();
    if (!bookmark) return;

    const bookmarks = currentBookmarks();
    const duplicate = bookmarks.find(
      (candidate) =>
        Number(candidate.blockIndex) === Number(bookmark.blockIndex) &&
        (!candidate.excerpt || candidate.excerpt === bookmark.excerpt)
    );

    let isUpdate = false;
    if (duplicate) {
      isUpdate = true;
      Object.assign(duplicate, bookmark, {
        id: duplicate.id,
        createdAt: duplicate.createdAt || Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      bookmarks.push({
        ...bookmark,
        id: `${Date.now().toString(36)}-${fnv1a(bookmark.excerpt || "start")}`,
      });
    }

    bookmarks.sort(
      (a, b) =>
        Number(a.blockIndex) - Number(b.blockIndex) ||
        Number(a.offsetRatio || 0) - Number(b.offsetRatio || 0)
    );
    state.bookmarkMap[state.documentKey] = bookmarks;
    const persisted = saveBookmarks();
    syncBookmarkControls();

    if (persisted) {
      showToast(
        `${isUpdate ? "已更新" : "已添加"}书签：${bookmark.chapter || bookmark.excerpt || "文章开头"}`
      );
    } else {
      showToast("书签已记录在当前页面，但浏览器无法长期保存。");
    }
  }

  function jumpBookmark() {
    const bookmarks = currentBookmarks();
    if (!bookmarks.length) {
      showToast("当前文稿还没有书签。先点击“添加书签”。");
      return;
    }
    toggleBookmarkPanel();
  }

  function normalizeWord(word) {
    return word
      .toLowerCase()
      .replace(/[’]/g, "'")
      .replace(/^'+|'+$/g, "");
  }

  function normalizePhrase(phrase) {
    return phrase
      .toLowerCase()
      .replace(/[’]/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function wordVariants(word) {
    const base = normalizeWord(word).replace(/'s$/, "");
    const variants = [];

    if (base.endsWith("ies") && base.length > 4) {
      variants.push(`${base.slice(0, -3)}y`);
    }
    if (base.endsWith("es") && base.length > 4) {
      variants.push(base.slice(0, -1), base.slice(0, -2));
    }
    if (base.endsWith("s") && base.length > 3) {
      variants.push(base.slice(0, -1));
    }
    if (base.endsWith("ing") && base.length > 5) {
      const stem = base.slice(0, -3);
      variants.push(`${stem}e`, stem, stem.slice(0, -1));
      if (stem.length > 2 && stem.at(-1) === stem.at(-2)) {
        variants.push(stem.slice(0, -1));
      }
    }
    if (base.endsWith("ed") && base.length > 4) {
      const stem = base.slice(0, -2);
      variants.push(`${stem}e`, stem, stem.slice(0, -1));
      if (stem.length > 2 && stem.at(-1) === stem.at(-2)) {
        variants.push(stem.slice(0, -1));
      }
    }
    if (base.endsWith("ly") && base.length > 4) {
      variants.push(base.slice(0, -2));
    }
    variants.push(base);

    return [...new Set(variants.filter(Boolean))];
  }

  function getWordInfo(rawWord) {
    const normalized = normalizeWord(rawWord);
    if (rawWord === rawWord.toUpperCase() && lowValueAcronyms.has(normalized)) {
      return null;
    }

    const variants = wordVariants(rawWord);
    let glossaryWord = "";
    let translation = null;
    let rank = Number.POSITIVE_INFINITY;

    for (const variant of variants) {
      const frequency = window.MD_FREQUENCY[variant];
      if (frequency && frequency[0] < rank) {
        rank = frequency[0];
      }
      if (!translation && window.MD_GLOSSARY[variant]) {
        translation = window.MD_GLOSSARY[variant];
        glossaryWord = variant;
      }
    }

    if (!translation) {
      return null;
    }

    if (!Number.isFinite(rank)) {
      rank = 99_999;
    }

    return { translation, rank, word: glossaryWord };
  }

  function frequencyBand(rank) {
    if (rank <= 5000) return "mid";
    if (rank <= 15_000) return "low";
    return "rare";
  }

  function isKnown(rawWord) {
    const normalized = normalizeWord(rawWord).replace(/'s$/, "");
    if (state.knownWords.has(normalized)) return true;
    return wordVariants(normalized).some((variant) => state.knownWords.has(variant));
  }

  function isKnownPhrase(tokens) {
    const phrase = normalizePhrase(tokens.join(" "));
    if (state.knownWords.has(phrase)) return true;
    return tokens.every((token) => isKnown(token));
  }

  function forcedKey(rawWord) {
    return normalizeWord(rawWord).replace(/'s$/, "");
  }

  // 词条 key 统一用内置词表里的原形（becomes → become），选择释义时才不会存成两份。
  function glossEntryKey(rawWord) {
    const info = getWordInfo(rawWord);
    return info ? info.word : forcedKey(rawWord);
  }

  function isForcedWord(rawWord) {
    const normalized = forcedKey(rawWord);
    if (state.forcedWords.has(normalized)) return true;
    return wordVariants(normalized).some((variant) => state.forcedWords.has(variant));
  }

  function shouldAnnotateWord(rawWord, info) {
    if (!state.prefs.frequency) return false;
    if (!info || isKnown(rawWord)) return false;
    if (isForcedWord(rawWord)) return true;
    if (state.prefs.mode === "all") return true;
    return info.rank > state.prefs.cutoff;
  }

  function phraseRank(tokens) {
    let rank = 0;
    for (const token of tokens) {
      const info = getWordInfo(token);
      rank = Math.max(rank, info ? info.rank : 99_999);
    }
    return rank;
  }

  function shouldAnnotatePhrase(tokens) {
    if (!state.prefs.frequency) return false;
    if (isKnownPhrase(tokens)) return false;
    if (state.prefs.mode === "all") {
      return true;
    }
    return phraseRank(tokens) > state.prefs.cutoff;
  }

  // 手动标注一个已掌握的词时，把它连同词形变体一起移出掌握词表。
  function releaseKnownWords(rawWord) {
    const normalized = normalizeWord(rawWord).replace(/'s$/, "");
    const keys = new Set([normalized, ...wordVariants(normalized)]);

    let removed = 0;
    for (const key of keys) {
      if (state.knownWords.delete(key)) removed += 1;
    }
    if (!removed) return 0;

    saveKnownWords();
    renderKnownPanel();
    updateStats();
    return removed;
  }

  function markAsKnown({ source, kind, entryKey }) {
    const key = entryKey || (kind === "phrase" ? normalizePhrase(source) : normalizeWord(source));
    const savedKey = key.replace(/'s$/, "");
    const label = source.trim();

    if (state.knownWords.has(savedKey)) {
      showToast(`“${label}”已经在掌握词表中。`);
      return;
    }

    state.knownWords.add(savedKey);
    // 掌握词和生词表互斥：标为已掌握就取消强制标注。
    state.forcedWords.delete(savedKey);
    saveForcedWords();
    const persisted = saveKnownWords();
    renderKnownPanel();
    renderForcedPanel();
    syncForcedCount();
    refreshAnnotatedBlocks();
    const count = state.knownWords.size.toLocaleString("zh-CN");
    showToast(
      persisted
        ? `已掌握“${label}”，词表共 ${count} 个词条。`
        : `已掌握“${label}”，但浏览器没有足够空间长期保存。`
    );
  }

  function effectiveAlternatives(entryKey, alternatives) {
    const override = state.glossOverrides.get(entryKey);
    if (!override) return alternatives;
    return [override, ...alternatives.filter((item) => item !== override)];
  }

  function applyGlossOverride(entryKey, text, label) {
    // 手动挑释义就是手动标注：已掌握的词同时移出掌握词表。
    const released = releaseKnownWords(entryKey);
    state.glossOverrides.set(entryKey, text);
    const persisted = saveGlossOverrides();
    // 自选释义的词也进生词表，这样它不受词频阈值限制，后面每篇都会标出来。
    if (!entryKey.includes(" ")) {
      state.forcedWords.add(entryKey);
      saveForcedWords();
      renderForcedPanel();
      syncForcedCount();
    }
    syncDictionaryControls();
    scheduleRefresh();
    showToast(
      [
        persisted
          ? `“${label}”的释义已改为：${text.slice(0, 40)}`
          : `“${label}”的释义已改，但浏览器没能长期保存。`,
        released ? `“${label}”已同时移出掌握词表。` : "",
      ]
        .filter(Boolean)
        .join(" ")
    );
  }

  function clearGlossOverride(entryKey, label) {
    if (!state.glossOverrides.delete(entryKey)) return;
    saveGlossOverrides();
    syncDictionaryControls();
    scheduleRefresh();
    showToast(`“${label}”已恢复默认释义。`);
  }

  function buildGloss({ source, alternatives, rank, kind, entryKey }) {
    const list = effectiveAlternatives(entryKey, alternatives);
    const wrapper = document.createElement("span");
    wrapper.className = `annotated-word band-${frequencyBand(rank)}`;
    wrapper.dataset.rank = String(rank);
    wrapper.dataset.kind = kind;
    wrapper.title = `${kind === "phrase" ? "词组" : "单词"} · 词频排名约 ${rank.toLocaleString("zh-CN")}`;

    const sourceNode = document.createElement("span");
    sourceNode.className = "annotated-source";
    sourceNode.textContent = source;

    const gloss = document.createElement("span");
    gloss.className = "gloss";
    if (state.glossOverrides.has(entryKey)) gloss.classList.add("gloss--chosen");
    gloss.textContent = list[0];
    gloss.dataset.translationIndex = "0";
    gloss.dataset.alternatives = JSON.stringify(list);
    gloss.title = list.length > 1 ? `${list.join("、")}（点击切换）` : list[0];
    gloss.addEventListener("click", (event) => {
      event.stopPropagation();
      const current = Number(gloss.dataset.translationIndex || 0);
      const next = (current + 1) % list.length;
      gloss.dataset.translationIndex = String(next);
      gloss.textContent = list[next];
    });

    const markButton = document.createElement("button");
    markButton.className = "mark-known-button";
    markButton.type = "button";
    markButton.textContent = "✓";
    markButton.title = `将“${source}”标为已掌握并加入词表`;
    markButton.setAttribute("aria-label", markButton.title);
    markButton.addEventListener("click", (event) => {
      event.stopPropagation();
      markAsKnown({ source, kind, entryKey });
    });

    const actions = [markButton];

    if (state.dictionaryReady && state.prefs.dictionaries.length) {
      const lookupButton = document.createElement("button");
      lookupButton.className = "dict-lookup-button";
      lookupButton.type = "button";
      lookupButton.textContent = "典";
      lookupButton.title = `在本地词典里查“${source}”，选择要显示的释义`;
      lookupButton.setAttribute("aria-label", lookupButton.title);
      lookupButton.addEventListener("click", (event) => {
        event.stopPropagation();
        openDictionaryPanel({ source, kind, entryKey });
      });
      actions.push(lookupButton);
    }

    wrapper.append(sourceNode, gloss, ...actions);
    return wrapper;
  }

  function collectTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !/[A-Za-z]/.test(node.nodeValue)) {
          return NodeFilter.FILTER_REJECT;
        }
        const parent = node.parentElement;
        if (
          !parent ||
          parent.closest(
            "a, code, pre, button, label, input, textarea, select, .gloss, .annotated-word, .katex, .math-inline, .math-block"
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let current;
    while ((current = walker.nextNode())) {
      nodes.push(current);
    }
    return nodes;
  }

  function findMatches(text) {
    const tokens = [...text.matchAll(wordPattern)].map((match) => ({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      normalized: normalizeWord(match[0]),
    }));
    const matches = [];
    let index = 0;

    while (index < tokens.length) {
      let phraseMatch = null;

      if (state.prefs.phrases) {
        const maxLength = Math.min(5, tokens.length - index);
        for (let length = maxLength; length >= 2; length -= 1) {
          const slice = tokens.slice(index, index + length);
          const phrase = slice.map((token) => token.normalized).join(" ");
          const alternatives = window.MD_PHRASES[phrase];
          if (alternatives && shouldAnnotatePhrase(slice.map((token) => token.text))) {
            phraseMatch = {
              type: "phrase",
              start: slice[0].start,
              end: slice.at(-1).end,
              source: text.slice(slice[0].start, slice.at(-1).end),
            alternatives,
            rank: phraseRank(slice.map((token) => token.text)),
            entryKey: phrase,
          };
            break;
          }
        }
      }

      if (phraseMatch) {
        matches.push(phraseMatch);
        while (index < tokens.length && tokens[index].start < phraseMatch.end) {
          index += 1;
        }
        continue;
      }

      const token = tokens[index];
      const info = getWordInfo(token.text);
      if (info && shouldAnnotateWord(token.text, info)) {
        matches.push({
          type: "word",
          start: token.start,
          end: token.end,
          source: token.text,
          alternatives: info.translation,
          rank: info.rank,
          entryKey: info.word,
        });
      } else if (isForcedWord(token.text) && !isKnown(token.text)) {
        // 生词表里的词即使内置词表没有条目，也用你选过的释义标出来。
        const entryKey = forcedKey(token.text);
        const override = state.glossOverrides.get(entryKey);
        if (override) {
          matches.push({
            type: "word",
            start: token.start,
            end: token.end,
            source: token.text,
            alternatives: [override],
            rank: info ? info.rank : 99_999,
            entryKey,
          });
        }
      }
      index += 1;
    }

    return matches;
  }

  function annotateBlock(block) {
    if (state.annotatedBlocks.has(block)) return;
    if (!blockSources.has(block)) blockSources.set(block, block.innerHTML);

    if (!state.prefs.frequency) {
      block.dataset.annotationState = "disabled";
      blockMetrics.set(block, {
        glosses: 0,
        phrases: 0,
        eligibleOccurrences: 0,
        eligibleUnique: new Set(),
      });
      state.annotatedBlocks.add(block);
      updateStats();
      return;
    }

    const metrics = {
      glosses: 0,
      phrases: 0,
      eligibleOccurrences: 0,
      eligibleUnique: new Set(),
    };

    for (const textNode of collectTextNodes(block)) {
      const text = textNode.nodeValue;
      const tokens = [...text.matchAll(wordPattern)];
      for (const token of tokens) {
        const info = getWordInfo(token[0]);
        if (info && !isKnown(token[0]) && (state.prefs.mode === "all" || info.rank > state.prefs.cutoff)) {
          metrics.eligibleOccurrences += 1;
          metrics.eligibleUnique.add(normalizeWord(token[0]));
        }
      }

      const matches = findMatches(text);
      if (!matches.length) continue;

      const fragment = document.createDocumentFragment();
      let cursor = 0;
      for (const match of matches) {
        if (match.start > cursor) {
          fragment.append(document.createTextNode(text.slice(cursor, match.start)));
        }
        const gloss = buildGloss({
          source: match.source,
          alternatives: match.alternatives,
          rank: match.rank,
          kind: match.type,
          entryKey: match.entryKey,
        });
        metrics.glosses += 1;
        if (match.type === "phrase") metrics.phrases += 1;
        fragment.append(gloss);
        cursor = match.end;
      }
      if (cursor < text.length) {
        fragment.append(document.createTextNode(text.slice(cursor)));
      }
      textNode.replaceWith(fragment);
    }

    block.dataset.annotationState = "annotated";
    blockMetrics.set(block, metrics);
    state.annotatedBlocks.add(block);
    updateStats();
  }

  function refreshAnnotatedBlocks() {
    if (!state.markdown) return;
    const anchor = captureReadingAnchor();
    const rootMargin = 700;

    for (const block of [...state.annotatedBlocks]) {
      const source = blockSources.get(block);
      if (source !== undefined) block.innerHTML = source;

      const rect = block.getBoundingClientRect();
      const isVisibleNearby = rect.bottom >= -rootMargin && rect.top <= window.innerHeight + rootMargin;
      state.annotatedBlocks.delete(block);
      blockMetrics.delete(block);
      block.dataset.annotationState = "pending";

      if (isVisibleNearby) annotateBlock(block);
    }

    updateStats();
    if (anchor) restoreLocation(anchor, { behavior: "auto", silent: true });
  }

  function scheduleRefresh() {
    if (!state.markdown) return;
    clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(refreshAnnotatedBlocks, 60);
  }

  // ---------------------------------------------------------------- 本地词典

  const DICTIONARY_PORTS = [8765, 8766, 8767, 8768, 8769, 8770];

  function sameOriginApiAvailable() {
    return location.protocol === "http:" || location.protocol === "https:";
  }

  // file:// 打开时没有同源接口，就退一步探测本机上已经跑起来的服务。
  async function resolveApiBase() {
    if (sameOriginApiAvailable()) return "";

    for (const port of DICTIONARY_PORTS) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`, { cache: "no-store" });
        if (response.ok) return `http://127.0.0.1:${port}`;
      } catch {
        continue;
      }
    }
    return null;
  }

  function dictionaryScore(entry) {
    let score = 0;
    if (/高阶|双解/.test(entry.name)) score += 3;
    if (/英汉|汉英|英中/.test(entry.name)) score += 2;
    if (/麦克米伦|朗文|牛津高阶|柯林斯|剑桥|cambridge/i.test(entry.name)) score += 2;
    if (/ldoce|longman/i.test(entry.name)) score += 3;
    if (/牛津|oxford/i.test(entry.name)) score += 2;
    if (/搭配|collocation/i.test(entry.name)) score += 1;
    if (/韦氏|webster|merriam/i.test(entry.name)) score += 1;
    if (/词根|词源|词缀/.test(entry.name)) score += 1;
    if (/医学|medical/i.test(entry.name)) score -= 3;
    if (entry.direction === "ja") score -= 5;
    return score;
  }

  function defaultDictionaryIds(dictionaries) {
    return dictionaries
      .map((entry) => ({ entry, score: dictionaryScore(entry) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.entry.id);
  }

  function setDictionaryStatus(message, tone = "muted") {
    if (!elements.dictStatus) return;
    elements.dictStatus.textContent = message;
    elements.dictStatus.dataset.tone = tone;
  }

  function renderDictionaryList() {
    if (!elements.dictList) return;
    elements.dictList.textContent = "";

    const enabled = new Set(state.prefs.dictionaries);
    for (const entry of state.dictionaries) {
      const row = document.createElement("label");
      row.className = "dictionary-row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = enabled.has(entry.id);
      checkbox.addEventListener("change", () => {
        const next = new Set(state.prefs.dictionaries);
        if (checkbox.checked) next.add(entry.id);
        else next.delete(entry.id);
        state.prefs.dictionaries = [...next];
        savePrefs();
        syncDictionaryControls();
        if (state.markdown) scheduleRefresh();
      });

      const text = document.createElement("span");
      text.className = "dictionary-row__text";
      text.innerHTML = `<strong></strong><small></small>`;
      text.querySelector("strong").textContent = entry.name;
      text.querySelector("small").textContent =
        `${(entry.size / 1_000_000).toFixed(1)} MB${entry.detail ? ` · ${entry.detail}` : ""}`;

      row.append(checkbox, text);
      elements.dictList.append(row);
    }
  }

  function syncDictionaryControls() {
    if (elements.dictCount) {
      elements.dictCount.textContent = String(state.prefs.dictionaries.length || 0);
    }
    const hasOverrides = state.glossOverrides.size > 0;
    if (elements.dictClearGlosses) elements.dictClearGlosses.hidden = !hasOverrides;
  }

  async function initDictionaries() {
    if (!elements.dictList) return;

    const base = await resolveApiBase();
    if (base === null) {
      state.dictionaryReady = false;
      state.apiBase = "";
      setDictionaryStatus("未连接本地词典服务。运行 ./start.sh 后，标注旁会出现「典」按钮。");
      syncDictionaryControls();
      return;
    }

    try {
      const response = await fetch(`${base}/api/dictionaries`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      state.apiBase = base;
      state.dictionaries = payload.dictionaries || [];
      state.dictionaryReady = true;

      const known = new Set(state.dictionaries.map((entry) => entry.id));
      state.prefs.dictionaries = state.prefs.dictionaries.filter((id) => known.has(id));
      if (!state.prefs.dictionaries.length) {
        state.prefs.dictionaries = defaultDictionaryIds(state.dictionaries);
      }
      savePrefs();

      renderDictionaryList();
      syncDictionaryControls();
      const count = state.prefs.dictionaries.length;
      setDictionaryStatus(
        state.dictionaries.length
          ? `已连接 ${state.dictionaries.length} 部本地 MDX 词典，默认启用 ${count} 部。`
          : "服务已连接，但没有找到 MDX 词典。可在 dictionaries.json 里补充词典目录。",
        state.dictionaries.length ? "ok" : "muted"
      );
      if (state.markdown) scheduleRefresh();
    } catch (error) {
      state.dictionaryReady = false;
      setDictionaryStatus(`词典服务连接失败：${error.message}`);
    }
  }

  let dictionaryRequestToken = 0;

  function closeDictionaryPanel() {
    if (!elements.dictDialog) return;
    if (typeof elements.dictDialog.close === "function" && elements.dictDialog.open) {
      elements.dictDialog.close();
    } else {
      elements.dictDialog.removeAttribute("open");
    }
  }

  function openDictionaryPanel({ source, kind, entryKey }) {
    if (!elements.dictDialog) return;

    if (!state.dictionaryReady) {
      showToast("本地词典服务没有连接，运行 ./start.sh 后再试。");
      return;
    }
    if (!state.prefs.dictionaries.length) {
      showToast("请先在侧栏「本地词典」里勾选要查的词典。");
      openSidebar();
      return;
    }

    state.lookupContext = {
      source,
      kind,
      entryKey: kind === "phrase" ? entryKey || normalizePhrase(source) : glossEntryKey(source),
      word: kind === "phrase" ? normalizePhrase(source) : glossEntryKey(source),
    };
    state.lookupPayload = null;
    state.activeDictTab = "";

    elements.dictWord.textContent = source;
    elements.dictWordMeta.textContent = state.glossOverrides.has(entryKey)
      ? "已使用你选择的释义"
      : "点中文段或英文段，选中的那段会显示在正文这个词旁边";
    elements.dictSearch.value = source;
    elements.dictFullToggle.checked = false;
    elements.dictArticle.hidden = true;
    elements.dictArticle.textContent = "";
    elements.dictResetGloss.hidden = !state.glossOverrides.has(entryKey);

    if (typeof elements.dictDialog.showModal === "function") elements.dictDialog.showModal();
    else elements.dictDialog.setAttribute("open", "");

    runDictionaryLookup(state.lookupContext.word);
  }

  async function runDictionaryLookup(word) {
    if (!word || !state.dictionaryReady) return;
    const token = ++dictionaryRequestToken;

    elements.dictTabs.textContent = "";
    elements.dictSenses.textContent = "";
    elements.dictArticle.hidden = true;
    elements.dictArticle.textContent = "";

    const loading = document.createElement("p");
    loading.className = "dict-placeholder";
    loading.textContent = "正在本地词典里查找…";
    elements.dictSenses.append(loading);

    const params = new URLSearchParams();
    params.set("word", word);
    state.prefs.dictionaries.forEach((id) => params.append("dict", id));

    try {
      const response = await fetch(`${state.apiBase}/api/lookup?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (token !== dictionaryRequestToken) return;
      state.lookupPayload = payload;
      renderLookupResults(payload);
    } catch (error) {
      if (token !== dictionaryRequestToken) return;
      elements.dictSenses.textContent = "";
      const note = document.createElement("p");
      note.className = "dict-placeholder";
      note.textContent = `查词失败：${error.message}`;
      elements.dictSenses.append(note);
    }
  }

  function renderLookupResults(payload) {
    const results = (payload.results || []).filter((result) => result.found && result.senses?.length);
    elements.dictTabs.textContent = "";
    elements.dictSenses.textContent = "";

    if (!results.length) {
      const note = document.createElement("p");
      note.className = "dict-placeholder";
      note.textContent = `“${payload.word}”在已启用的词典里没有收录。`;
      elements.dictSenses.append(note);
      return;
    }

    for (const result of results) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "dict-tab";
      tab.dataset.dictId = result.id;
      tab.setAttribute("role", "tab");
      tab.innerHTML = `<strong></strong><span>${result.senses.length}</span>`;
      tab.querySelector("strong").textContent = result.name;
      tab.addEventListener("click", () => {
        state.activeDictTab = result.id;
        renderActiveDictionary();
      });
      elements.dictTabs.append(tab);
    }

    const first = results.find((result) => result.id === state.activeDictTab) || results[0];
    state.activeDictTab = first.id;
    elements.dictWord.textContent = first.key || elements.dictWord.textContent;
    renderActiveDictionary();
  }

  function currentDictionaryResult() {
    const results = (state.lookupPayload?.results || []).filter((result) => result.found);
    return results.find((result) => result.id === state.activeDictTab) || null;
  }

  // 兼容两种接口形状：老的 senses 是字符串数组，新的用并行的 senseParts 描述语言分段。
  function sensePartsFor(result) {
    const senses = Array.isArray(result.senses) ? result.senses : [];
    const parallel =
      Array.isArray(result.senseParts) && result.senseParts.length === senses.length
        ? result.senseParts
        : null;

    const normalize = (value) => {
      if (Array.isArray(value)) {
        const parts = value
          .filter(
            (part) =>
              part &&
              typeof part.text === "string" &&
              part.text.trim() &&
              !part.text.includes("[object Object]")
          )
          .map((part) => ({ lang: part.lang === "zh" ? "zh" : "en", text: part.text }));
        if (parts.length) return parts;
        return null;
      }
      if (value && typeof value === "object") {
        return normalize(value.parts);
      }
      if (typeof value === "string" && value.trim()) {
        return [{ lang: "en", text: value }];
      }
      return null;
    };

    const rows = [];
    senses.forEach((sense, index) => {
      const parts = normalize(parallel ? parallel[index] : sense);
      if (parts) rows.push(parts);
    });
    return rows;
  }

  function renderActiveDictionary() {
    const result = currentDictionaryResult();
    elements.dictSenses.textContent = "";

    $$(".dict-tab", elements.dictTabs).forEach((tab) => {
      const active = tab.dataset.dictId === state.activeDictTab;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });

    if (!result) return;

    for (const parts of sensePartsFor(result)) {
      const row = document.createElement("div");
      row.className = "dict-sense";

      for (const part of parts) {
        if (!part.text) continue;
        const button = document.createElement("button");
        button.type = "button";
        button.className = `dict-sense__part dict-sense__part--${part.lang === "zh" ? "zh" : "en"}`;
        button.textContent = part.text;
        button.title =
          part.lang === "zh"
            ? `把这段中文显示在正文旁：${part.text}`
            : `把这段英文显示在正文旁：${part.text}`;
        button.addEventListener("click", () => chooseSense(part.text));
        row.append(button);
      }

      if (row.childElementCount) elements.dictSenses.append(row);
    }

    elements.dictFullToggle.checked = false;
    elements.dictArticle.hidden = true;
    elements.dictArticle.textContent = "";
    renderArticle();
  }

  function renderArticle() {
    const result = currentDictionaryResult();
    if (!result) return;

    const expanded = Boolean(elements.dictFullToggle.checked);
    elements.dictArticle.hidden = !expanded;
    elements.dictArticle.textContent = "";
    if (!expanded) return;

    const fragment = sanitizeHtmlFragment(result.article || "");
    elements.dictArticle.append(fragment);
  }

  function chooseSense(text) {
    const context = state.lookupContext;
    closeDictionaryPanel();
    if (!context) return;
    applyGlossOverride(context.entryKey, text, context.source);
  }

  function openInGoldendict(word) {
    if (!state.apiBase || !word) return;
    fetch(`${state.apiBase}/api/open-goldendict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word }),
    }).catch(() => showToast("没能唤起 Goldendict。"));
    showToast(`已在 Goldendict 中打开“${word}”。`);
  }

  // ---------------------------------------------------------------- 掌握词表

  function setImmersive(enabled) {
    const next = Boolean(enabled);
    if (state.immersive === next) return;

    // 切换布局会改变行高与横向边距，先把阅读位置记下来，切换后再对齐回同一处。
    const anchor = state.markdown ? captureReadingAnchor() : null;
    state.immersive = Boolean(enabled);
    document.body.classList.toggle("is-immersive", state.immersive);
    elements.immersiveToggle?.setAttribute("aria-pressed", String(state.immersive));
    if (elements.immersiveExit) elements.immersiveExit.hidden = !state.immersive;
    if (elements.immersiveProgress) elements.immersiveProgress.hidden = !state.immersive;

    if (state.immersive) {
      closeSidebar();
      showToast("已进入沉浸阅读：按 Esc 或 I 退出。");
    } else {
      showToast("已退出沉浸阅读。");
    }

    updateFooterProgress();
    if (anchor) restoreLocation(anchor, { behavior: "auto", silent: true });
    else saveReadingProgress(true);
  }

  function toggleImmersive() {
    setImmersive(!state.immersive);
  }

  function toggleClickToAnnotate() {
    state.prefs.clickToAnnotate = !state.prefs.clickToAnnotate;
    savePrefs();
    syncControls();
    showToast(
      state.prefs.clickToAnnotate
        ? "取词标注已开启：点击正文里的任意单词即可标注。"
        : "取词标注已关闭。"
    );
  }

  function wordAtPoint(x, y) {
    let range = null;
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(x, y);
    } else if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(x, y);
      if (position) {
        range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
      }
    }
    if (!range) return "";

    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return "";
    const parent = node.parentElement;
    if (!parent || parent.closest(".annotated-word, .gloss, button, a, .katex, .text-highlight")) {
      return "";
    }

    const text = node.nodeValue || "";
    const offset = Math.max(0, Math.min(range.startOffset, text.length));
    const before = text.slice(0, offset).match(/[A-Za-z]+(?:['\u2019][A-Za-z]+)*$/);
    const after = text.slice(offset).match(/^[A-Za-z]+(?:['\u2019][A-Za-z]+)*/);
    const word = `${before ? before[0] : ""}${after ? after[0] : ""}`;
    return /[A-Za-z]/.test(word) ? word : "";
  }

  function annotatePickedWord(rawWord) {
    const word = String(rawWord || "").replace(/^'+|'+$/g, "");
    const key = glossEntryKey(word);
    if (!/[A-Za-z]/.test(key)) return;

    const mastered = isKnown(word);
    const already = isForcedWord(word);
    const info = getWordInfo(word);
    // 手动标注优先：真能标出来时才把词从掌握词表里移走。
    const releaseNote = mastered ? `，并已把“${word}”移出掌握词表` : "";

    if (info || state.glossOverrides.has(key)) {
      if (mastered) releaseKnownWords(word);
      if (!already) {
        state.forcedWords.add(key);
        saveForcedWords();
      }
      renderForcedPanel();
      syncForcedCount();
      scheduleRefresh();
      showToast(
        already
          ? `“${word}”已经在生词表里${mastered ? `，并已把“${word}”移出掌握词表` : ""}。`
          : `已标注“${word}”，并加入生词表（共 ${state.forcedWords.size.toLocaleString("zh-CN")} 个）${releaseNote}。`
      );
      return;
    }

    if (state.dictionaryReady && state.prefs.dictionaries.length) {
      // 已掌握的词先留在掌握词表里，等真正选好释义时再由 applyGlossOverride 移出。
      if (!mastered) {
        state.forcedWords.add(key);
        saveForcedWords();
        renderForcedPanel();
        syncForcedCount();
      }
      showToast(
        mastered
          ? `“${word}”本地没有现成释义，请从词典里挑一条；选好后会自动把它移出掌握词表。`
          : `“${word}”本地没有现成释义，请从词典里挑一条。`
      );
      openDictionaryPanel({ source: word, kind: "word", entryKey: key });
      return;
    }

    if (mastered) {
      showToast(`“${word}”已在掌握词表里，而当前没有可用的释义来源，先不标注。`);
      return;
    }

    if (!already) {
      state.forcedWords.add(key);
      saveForcedWords();
    }
    renderForcedPanel();
    syncForcedCount();
    showToast(`已把“${word}”加入生词表，但当前没有可用的释义来源。`);
  }

  function renderWordList({ panel, listEl, emptyEl, filterEl, words, onRemove, removeLabel }) {
    if (!panel || panel.hidden) return;

    const filter = (filterEl.value || "").trim().toLowerCase();
    const sorted = [...words].sort((a, b) => a.localeCompare(b, "zh-CN"));
    const matched = filter ? sorted.filter((word) => word.includes(filter)) : sorted;
    const shown = matched.slice(0, 300);

    listEl.textContent = "";
    for (const word of shown) {
      const row = document.createElement("div");
      row.className = "wordbook__row";

      const label = document.createElement("span");
      label.className = "wordbook__word";
      label.textContent = word;

      const remove = document.createElement("button");
      remove.className = "wordbook__remove";
      remove.type = "button";
      remove.textContent = removeLabel;
      remove.title = `${removeLabel}：${word}`;
      remove.setAttribute("aria-label", remove.title);
      remove.addEventListener("click", () => onRemove(word));

      row.append(label, remove);
      listEl.append(row);
    }

    if (matched.length > shown.length) {
      const note = document.createElement("p");
      note.className = "wordbook__more";
      note.textContent = `仅显示前 ${shown.length} 个，共 ${matched.length.toLocaleString("zh-CN")} 个匹配词条。`;
      listEl.append(note);
    }

    emptyEl.hidden = matched.length > 0;
  }

  function renderKnownPanel() {
    renderWordList({
      panel: elements.knownPanel,
      listEl: elements.knownList,
      emptyEl: elements.knownEmpty,
      filterEl: elements.knownFilter,
      words: state.knownWords,
      onRemove: removeKnownWord,
      removeLabel: "移回学习",
    });
  }

  function renderForcedPanel() {
    renderWordList({
      panel: elements.forcedPanel,
      listEl: elements.forcedList,
      emptyEl: elements.forcedEmpty,
      filterEl: elements.forcedFilter,
      words: state.forcedWords,
      onRemove: removeForcedWord,
      removeLabel: "取消标注",
    });
  }

  function syncForcedCount() {
    if (elements.forcedCount) {
      elements.forcedCount.textContent = String(state.forcedWords.size);
    }
  }

  function removeForcedWord(word) {
    if (!state.forcedWords.delete(word)) return;
    saveForcedWords();
    renderForcedPanel();
    syncForcedCount();
    updateStats();
    scheduleRefresh();
    showToast(`“${word}”已移出生词表，之后按词频决定是否标注。`);
  }

  function removeKnownWord(word) {
    if (!state.knownWords.delete(word)) return;
    saveKnownWords();
    renderKnownPanel();
    scheduleRefresh();
    updateStats();
    showToast(`“${word}”已移出掌握词表，会重新参与标注。`);
  }

  function exportKnownWords() {
    if (!state.knownWords.size) {
      showToast("掌握词表还是空的。");
      return;
    }

    const words = [...state.knownWords].sort((a, b) => a.localeCompare(b, "zh-CN"));
    const blob = new Blob([`${words.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "known-words.txt";
    link.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${words.length.toLocaleString("zh-CN")} 个已掌握词条。`);
  }

  function updateStats() {
    let glosses = 0;
    let phrases = 0;
    let unfamiliar = 0;
    const unique = new Set();

    for (const block of state.annotatedBlocks) {
      const metrics = blockMetrics.get(block);
      if (!metrics) continue;
      glosses += metrics.glosses;
      phrases += metrics.phrases;
      unfamiliar += metrics.eligibleOccurrences;
      for (const word of metrics.eligibleUnique) unique.add(word);
    }

    elements.annotatedStat.textContent = glosses.toLocaleString("zh-CN");
    elements.phraseStat.textContent = phrases.toLocaleString("zh-CN");
    elements.unfamiliarStat.textContent = unfamiliar.toLocaleString("zh-CN");
    elements.uniqueStat.textContent = unique.size.toLocaleString("zh-CN");
    elements.knownCount.textContent = state.knownWords.size.toLocaleString("zh-CN");
  }

  function directChildFromContent(node) {
    let current = node;
    while (current && current.parentElement !== elements.content) {
      current = current.parentElement;
    }
    return current instanceof Element ? current : null;
  }

  function isAnnotationUiNode(node) {
    return Boolean(node.parentElement?.closest(".gloss, .mark-known-button, button"));
  }

  function rawTextNodes(block) {
    const nodes = [];
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return isAnnotationUiNode(node)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });

    let current;
    while ((current = walker.nextNode())) nodes.push(current);
    return nodes;
  }

  function characterOffsetInBlock(block, container, offset) {
    if (isAnnotationUiNode(container)) return Number.NaN;
    let total = 0;
    for (const node of rawTextNodes(block)) {
      if (node === container) return total + offset;
      total += node.nodeValue.length;
    }
    return Number.NaN;
  }

  function setRangeBoundaryFromOffset(block, characterOffset, isStart) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, Math.min(characterOffset, block.textContent.length));
    let node = walker.nextNode();

    while (node) {
      const length = node.nodeValue.length;
      if (remaining <= length) {
        if (isStart) return { container: node, offset: remaining };
        return { container: node, offset: remaining };
      }
      remaining -= length;
      node = walker.nextNode();
    }

    return null;
  }

  function wrapRangeWithHighlight(range, id) {
    const nodes = [];
    const walker = document.createTreeWalker(elements.content, NodeFilter.SHOW_TEXT);
    let current;
    while ((current = walker.nextNode())) {
      if (range.intersectsNode(current) && !isAnnotationUiNode(current)) {
        nodes.push(current);
      }
    }

    for (const node of nodes) {
      if (node.parentElement?.closest(`[data-highlight-id="${id}"]`)) continue;

      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.nodeValue.length;
      if (start >= end) continue;

      let target = node;
      if (start > 0) target = target.splitText(start);
      if (end - start < target.nodeValue.length) target.splitText(end - start);

      const mark = document.createElement("mark");
      mark.className = "text-highlight";
      mark.dataset.highlightId = id;
      mark.title = "点击取消这段高亮";
      target.replaceWith(mark);
      mark.append(target);
    }
  }

  function applySavedHighlights() {
    if (!state.documentKey) return;
    const highlights = state.highlightMap[state.documentKey] || [];
    for (const highlight of highlights) {
      const startBlock = $((
        `[data-reading-index="${Number(highlight.startBlockIndex)}"]`
      ), elements.content);
      const endBlock = $((
        `[data-reading-index="${Number(highlight.endBlockIndex)}"]`
      ), elements.content);
      if (!startBlock || !endBlock) continue;

      const start = setRangeBoundaryFromOffset(
        startBlock,
        Number(highlight.startOffset),
        true
      );
      const end = setRangeBoundaryFromOffset(
        endBlock,
        Number(highlight.endOffset),
        false
      );
      if (!start || !end) continue;

      const range = document.createRange();
      range.setStart(start.container, start.offset);
      range.setEnd(end.container, end.offset);
      wrapRangeWithHighlight(range, highlight.id);
    }
  }

  function addHighlightFromSelection() {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) {
      showToast("请先在正文中选中要高亮的文字。");
      return;
    }

    const range = selection.getRangeAt(0);
    const startBlock = directChildFromContent(range.startContainer);
    const endBlock = directChildFromContent(range.endContainer);
    const text = selection.toString().trim();
    if (!startBlock || !endBlock || !text) {
      showToast("请选择正文中的文字。");
      return;
    }

    const startBlockIndex = Number(startBlock.dataset.readingIndex);
    const endBlockIndex = Number(endBlock.dataset.readingIndex);
    const startOffset = characterOffsetInBlock(
      startBlock,
      range.startContainer,
      range.startOffset
    );
    const endOffset = characterOffsetInBlock(
      endBlock,
      range.endContainer,
      range.endOffset
    );
    if (
      !Number.isFinite(startBlockIndex) ||
      !Number.isFinite(endBlockIndex) ||
      startOffset >= endOffset ||
      (startBlockIndex === endBlockIndex && startOffset >= endOffset)
    ) {
      showToast("请选择一段有内容的正文文字。");
      return;
    }

    const id = `highlight-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const highlight = {
      id,
      text: text.slice(0, 600),
      startBlockIndex,
      startOffset,
      endBlockIndex,
      endOffset,
      createdAt: Date.now(),
    };
    state.highlightMap[state.documentKey] ||= [];
    state.highlightMap[state.documentKey].push(highlight);
    const persisted = saveHighlights();
    wrapRangeWithHighlight(range, id);
    selection.removeAllRanges();
    showToast(
      persisted
        ? "已高亮所选文字；点击黄色区域可取消。"
        : "已临时高亮，但浏览器没有足够空间长期保存。"
    );
  }

  function removeHighlight(id) {
    const highlights = state.highlightMap[state.documentKey] || [];
    state.highlightMap[state.documentKey] = highlights.filter(
      (highlight) => highlight.id !== id
    );
    if (!state.highlightMap[state.documentKey].length) {
      delete state.highlightMap[state.documentKey];
    }
    const persisted = saveHighlights();
    $$(`[data-highlight-id="${id}"]`, elements.content).forEach((mark) => {
      mark.replaceWith(...mark.childNodes);
    });
    showToast(persisted ? "已取消这段高亮。" : "已取消，但浏览器保存失败。");
  }

  function stripBom(text) {
    return text.replace(/^\uFEFF/, "");
  }

  function saveLastDocument() {
    if (!state.markdown || state.markdown.length > 1_500_000) return;
    try {
      localStorage.setItem(
        STORAGE.document,
        JSON.stringify({
          markdown: state.markdown,
          fileName: state.fileName,
          modifiedAt: state.modifiedAt,
        })
      );
    } catch {
      // A very large or storage-blocked document is still readable this session.
    }
  }

  function restoreLastDocument() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE.document) || "null");
      if (saved?.markdown && saved?.fileName) {
        loadDocument(saved.markdown, saved.fileName, saved.modifiedAt, false);
        showToast("已恢复上次阅读的文稿。");
        return true;
      }
    } catch {
      // Ignore damaged local state and start with the welcome screen.
    }
    return false;
  }

  function isValidHighlight(value) {
    return (
      value &&
      typeof value === "object" &&
      typeof value.id === "string" &&
      typeof value.text === "string" &&
      Number.isFinite(Number(value.startBlockIndex)) &&
      Number.isFinite(Number(value.startOffset)) &&
      Number.isFinite(Number(value.endBlockIndex)) &&
      Number.isFinite(Number(value.endOffset))
    );
  }

  function loadHighlights() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE.highlights) || "{}");
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
      return Object.fromEntries(
        Object.entries(saved)
          .map(([documentKey, highlights]) => [
            documentKey,
            Array.isArray(highlights) ? highlights.filter(isValidHighlight).slice(-500) : [],
          ])
          .filter(([, highlights]) => highlights.length)
      );
    } catch {
      return {};
    }
  }

  function saveHighlights() {
    try {
      const entries = Object.entries(state.highlightMap)
        .map(([documentKey, highlights]) => [
          documentKey,
          highlights.filter(isValidHighlight).slice(-500),
        ])
        .filter(([, highlights]) => highlights.length)
        .sort(
          (a, b) =>
            Math.max(0, ...b[1].map((highlight) => Number(highlight.createdAt) || 0)) -
            Math.max(0, ...a[1].map((highlight) => Number(highlight.createdAt) || 0))
        )
        .slice(0, 80);

      const nextMap = Object.fromEntries(entries);
      Object.keys(state.highlightMap).forEach((documentKey) => {
        if (!nextMap[documentKey]) delete state.highlightMap[documentKey];
      });
      localStorage.setItem(STORAGE.highlights, JSON.stringify(nextMap));
      return true;
    } catch {
      return false;
    }
  }

  function formatDate(timestamp) {
    if (!timestamp) return "本地文稿";
    try {
      return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(new Date(timestamp));
    } catch {
      return "本地文稿";
    }
  }

  function estimateReadingTime(text) {
    const latinWords = (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length;
    const chineseCharacters = (text.match(/[\u3400-\u9fff]/g) || []).length;
    const units = latinWords + chineseCharacters / 2.2;
    return Math.max(1, Math.round(units / 220));
  }

  function outlineLabel(block, index) {
    const text = (block?.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return `段落 ${index + 1}`;
    return text.length > 38 ? `${text.slice(0, 38).trim()}…` : text;
  }

  function inferGeneratedOutline(blocks) {
    const candidates = blocks.filter(
      (block) => block.tagName !== "HR" && (block.textContent || "").trim()
    );
    if (!candidates.length) return [];

    const chapterPattern =
      /^(?:第\s*[0-9一二三四五六七八九十百千万]+\s*[章节回部卷篇]|(?:chapter|part|section)\s+\d+|\d{1,3}\s*[.、)]\s*\S)/i;
    const explicit = [];
    candidates.forEach((block) => {
      const text = (block.textContent || "").replace(/\s+/g, " ").trim();
      const looksLikeChapter =
        text.length <= 82 &&
        (chapterPattern.test(text) ||
          (text.split(/\s+/).length <= 11 &&
            !/[.!?。！？,，;；:：]$/.test(text)));
      if (looksLikeChapter && explicit.at(-1) !== block) explicit.push(block);
    });
    if (explicit.length >= 3) return explicit;

    const breaks = blocks.filter((block) => block.tagName === "HR");
    if (breaks.length >= 2) {
      const starts = [];
      const first = candidates[0];
      if (first) starts.push(first);
      breaks.forEach((breakElement) => {
        const index = blocks.indexOf(breakElement);
        const next = candidates.find((candidate) => blocks.indexOf(candidate) > index);
        if (next && !starts.includes(next)) starts.push(next);
      });
      if (starts.length >= 2) return starts;
    }

    const targetCount = Math.min(14, Math.max(4, Math.ceil(candidates.length / 8)));
    const groupSize = Math.ceil(candidates.length / targetCount);
    const targets = [];
    for (let index = 0; index < candidates.length; index += groupSize) {
      targets.push(candidates[index]);
    }
    return targets;
  }

  function appendTocLink(target, index, generated = false) {
    const link = document.createElement("a");
    link.href = `#${target.id}`;
    link.textContent = generated
      ? `${String(index + 1).padStart(2, "0")} · ${outlineLabel(target, index)}`
      : target.textContent.replace(/\s+/g, " ").trim();
    link.title = target.textContent.replace(/\s+/g, " ").trim();
    link.dataset.level = generated ? "auto" : target.tagName.slice(1);
    if (!generated) {
      link.style.paddingLeft = `${14 + (Number(link.dataset.level) - 1) * 9}px`;
    }
    link.addEventListener("click", (event) => {
      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      closeSidebar();
      window.setTimeout(updateActiveHeading, 120);
    });
    elements.toc.append(link);
    headingObserverTargets.push({ heading: target, link });
  }

  function buildTableOfContents() {
    elements.toc.replaceChildren();
    headingObserverTargets.splice(0);

    const sourceHeadings = $$(".prose h1, .prose h2, .prose h3, .prose h4", elements.content);
    const usedIds = new Set($$("[id]", elements.content).map((node) => node.id));

    if (sourceHeadings.length) {
      tocMode = "source";
      sourceHeadings.forEach((heading, index) => {
        const baseId = heading.id || `section-${index + 1}`;
        let id = baseId;
        let suffix = 2;
        while (usedIds.has(id) && id !== heading.id) {
          id = `${baseId}-${suffix}`;
          suffix += 1;
        }
        heading.id = id;
        usedIds.add(id);
        appendTocLink(heading, index);
      });
    } else {
      tocMode = "generated";
      const blocks = [...elements.content.children];
      const targets = inferGeneratedOutline(blocks);
      targets.forEach((target, index) => {
        target.id = `auto-section-${index + 1}`;
        appendTocLink(target, index, true);
      });
    }

    elements.tocModeBadge.hidden = tocMode !== "generated";
    elements.tocModeBadge.textContent = tocMode === "generated" ? "自动" : "标题";
    elements.tocSection.hidden = headingObserverTargets.length === 0;
    updateActiveHeading();
  }

  function updateActiveHeading() {
    if (!headingObserverTargets.length) return;
    const marker = 120;
    let active = headingObserverTargets[0];
    for (const target of headingObserverTargets) {
      if (target.heading.getBoundingClientRect().top <= marker) {
        active = target;
      } else {
        break;
      }
    }
    for (const target of headingObserverTargets) {
      target.link.classList.toggle("is-active", target === active);
    }
  }

  function updateFooterProgress() {
    if (elements.reader.hidden) return;
    const scrollMax = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollMax > 0 ? window.scrollY / scrollMax : 0;
    const percent = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
    elements.footerProgress.textContent = percent >= 99 ? "END OF DOCUMENT" : `已读 ${percent}%`;
    if (elements.immersiveProgressBar) {
      elements.immersiveProgressBar.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;
    }
    if (elements.immersivePercent) elements.immersivePercent.textContent = `${percent}%`;
  }

  function handleScroll() {
    if (state.scrollTicking) return;
    state.scrollTicking = true;
    requestAnimationFrame(() => {
      updateActiveHeading();
      updateFooterProgress();
      scheduleProgressSave();
      state.scrollTicking = false;
    });
  }

  function renderDocument({ scrollToTop = true } = {}) {
    state.annotationObserver?.disconnect();
    state.annotationObserver = null;
    state.annotatedBlocks.clear();
    blockMetrics = new WeakMap();
    blockSources = new WeakMap();

    elements.content.classList.toggle("gloss-off", !state.prefs.showGloss);
    elements.content.innerHTML = markdown.render(state.markdown);

    $$('a[href^="http"]', elements.content).forEach((link) => {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });

    buildTableOfContents();

    const blocks = [...elements.content.children];
    blocks.forEach((block, index) => {
      block.dataset.readingIndex = String(index);
      block.dataset.annotationState = "pending";
    });
    applySavedHighlights();
    blocks.forEach((block) => blockSources.set(block, block.innerHTML));

    if ("IntersectionObserver" in window) {
      state.annotationObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) annotateBlock(entry.target);
          }
        },
        { root: null, rootMargin: "600px 0px", threshold: 0 }
      );
      blocks.forEach((block) => state.annotationObserver.observe(block));
    } else {
      blocks.forEach(annotateBlock);
    }

    elements.welcome.hidden = true;
    elements.reader.hidden = false;
    if (scrollToTop) window.scrollTo({ top: 0, behavior: "auto" });
    requestAnimationFrame(() => {
      updateFooterProgress();
      updateActiveHeading();
    });
  }

  function loadDocument(rawText, fileName, modifiedAt = Date.now(), notify = true) {
    const text = stripBom(rawText);
    if (!text.trim()) {
      showToast("这个文件是空的，换一篇 Markdown 再试试。");
      return false;
    }

    if (state.documentKey && state.markdown && state.markdown !== text) {
      saveReadingProgress(true);
    }

    const documentKey = createDocumentKey(text, fileName);
    state.documentKey = documentKey;
    state.markdown = text;
    state.fileName = fileName || "document.md";
    state.modifiedAt = modifiedAt;

    const extension = (state.fileName.split(".").pop() || "MD").toUpperCase();
    elements.fileTitle.textContent = state.fileName;
    elements.documentName.textContent = state.fileName;
    elements.documentDate.textContent = formatDate(modifiedAt);
    elements.railLabel.textContent = extension.slice(0, 5);
    elements.readTime.textContent = `· 约 ${estimateReadingTime(text)} 分钟`;
    document.title = `${state.fileName} · 词频阅读室`;

    renderDocument({ scrollToTop: false });
    closeBookmarkPanel();
    syncBookmarkControls();

    const savedProgress = state.progressMap[documentKey];
    if (savedProgress) {
      restoreLocation(savedProgress, { behavior: "auto", silent: true });
    } else {
      window.scrollTo({ top: 0, behavior: "auto" });
      updateFooterProgress();
    }

    saveLastDocument();
    closeSidebar();
    if (notify) {
      showToast(
        savedProgress
          ? `已恢复 ${state.fileName} 的上次阅读进度。`
          : `已打开 ${state.fileName}`
      );
    }
    return true;
  }

  async function handleFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      loadDocument(text, file.name, file.lastModified || Date.now());
    } catch (error) {
      console.error(error);
      showToast("读取文件失败，请确认文件没有被其他程序占用。");
    }
  }

  function handleKnownFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const words = text
        .match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)
        ?.map((word) => normalizeWord(word).replace(/['-]/g, ""))
        .filter(Boolean);
      if (!words?.length) {
        showToast("没有找到英文词。词表支持每行一个词，或用逗号/空格分隔。");
        return;
      }
      words.forEach((word) => state.knownWords.add(word));
      const persisted = saveKnownWords();
      renderKnownPanel();
      if (state.markdown) scheduleRefresh();
      else updateStats();
      const count = state.knownWords.size.toLocaleString("zh-CN");
      showToast(
        persisted
          ? `已导入 ${words.length.toLocaleString("zh-CN")} 个词次，去重后共 ${count} 个词。`
          : `已导入 ${words.length.toLocaleString("zh-CN")} 个词次，但浏览器没有足够空间长期保存。`
      );
    };
    reader.onerror = () => showToast("词表读取失败，请换一个文本文件。");
    reader.readAsText(file);
  }

  function setRangeProgress(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    const progress = ((value - min) / (max - min)) * 100;
    input.style.setProperty("--range-progress", `${progress}%`);
  }

  function syncControls() {
    elements.cutoff.value = String(state.prefs.cutoff);
    elements.cutoffValue.value = state.prefs.cutoff.toLocaleString("zh-CN");
    elements.cutoffLabel.textContent = state.prefs.cutoff.toLocaleString("zh-CN");
    setRangeProgress(elements.cutoff);

    elements.fontSize.value = String(state.prefs.fontSize);
    elements.fontSizeValue.textContent = `${state.prefs.fontSize}px`;
    setRangeProgress(elements.fontSize);

    elements.readerWidth.value = String(state.prefs.readerWidth);
    elements.readerWidthValue.textContent = `${state.prefs.readerWidth}px`;
    setRangeProgress(elements.readerWidth);

    elements.phraseToggle.checked = state.prefs.phrases;
    $$(".segmented__button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === state.prefs.mode);
      button.setAttribute("aria-pressed", String(button.dataset.mode === state.prefs.mode));
    });

    elements.glossToggle.setAttribute("aria-pressed", String(state.prefs.showGloss));
    const glossLabel = $(".toolbar-button__label", elements.glossToggle);
    if (glossLabel) glossLabel.textContent = state.prefs.showGloss ? "显示中文" : "隐藏中文";

    elements.frequencyToggle.setAttribute("aria-pressed", String(state.prefs.frequency));
    elements.clickModeToggle?.setAttribute("aria-pressed", String(state.prefs.clickToAnnotate));
    document.body.classList.toggle("is-picking", Boolean(state.prefs.clickToAnnotate));

    elements.clickModeToggle?.classList.toggle("is-active", Boolean(state.prefs.clickToAnnotate));

    const frequencyLabel = $(".toolbar-button__label", elements.frequencyToggle);
    if (frequencyLabel) frequencyLabel.textContent = state.prefs.frequency ? "显示词频" : "关闭词频";

    elements.body.dataset.theme = state.prefs.theme;
    elements.themeIcon.textContent = state.prefs.theme === "dark" ? "◑" : "◐";
    document.documentElement.style.setProperty("--reader-font-size", `${state.prefs.fontSize}px`);
    document.documentElement.style.setProperty("--reader-width", `${state.prefs.readerWidth}px`);
    elements.content?.classList.toggle("gloss-off", !state.prefs.showGloss);
    updateStats();
  }

  function maybeRender() {
    refreshAnnotatedBlocks();
  }

  function toggleGlosses() {
    state.prefs.showGloss = !state.prefs.showGloss;
    savePrefs();
    syncControls();
  }

  function toggleFrequency() {
    state.prefs.frequency = !state.prefs.frequency;
    savePrefs();
    syncControls();
    scheduleRefresh();
    showToast(state.prefs.frequency ? "已恢复词频标注。" : "已关闭词频标注，正文保持纯原文。");
  }

  function toggleTheme() {
    state.prefs.theme = state.prefs.theme === "dark" ? "light" : "dark";
    savePrefs();
    syncControls();
  }

  function openSidebar() {
    elements.sidebar.classList.add("is-open");
    elements.sidebarScrim.hidden = false;
    elements.sidebarToggle.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    elements.sidebar.classList.remove("is-open");
    elements.sidebarScrim.hidden = true;
    elements.sidebarToggle.setAttribute("aria-expanded", "false");
  }

  function toggleSidebar() {
    if (elements.sidebar.classList.contains("is-open")) closeSidebar();
    else openSidebar();
  }

  function showToast(message) {
    clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    state.toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove("is-visible");
    }, 2800);
  }

  function showSample() {
    if (!window.SAMPLE_MD) {
      showToast("示例文章没有加载成功。");
      return;
    }
    loadDocument(window.SAMPLE_MD, "A Field Guide to Better Reading.md", Date.now());
  }

  function showAbout() {
    elements.metaFrequency.textContent = Object.keys(window.MD_FREQUENCY).length.toLocaleString("zh-CN");
    elements.metaGlossary.textContent = Object.keys(window.MD_GLOSSARY).length.toLocaleString("zh-CN");
    elements.metaPhrases.textContent = Object.keys(window.MD_PHRASES).length.toLocaleString("zh-CN");
    elements.metaDictionary.textContent = "CC-CEDICT · 2026-10-08";
    if (typeof elements.aboutDialog.showModal === "function") {
      elements.aboutDialog.showModal();
    } else {
      elements.aboutDialog.setAttribute("open", "");
    }
  }

  function closeAbout() {
    if (typeof elements.aboutDialog.close === "function") elements.aboutDialog.close();
    else elements.aboutDialog.removeAttribute("open");
  }

  function handleDrop(event) {
    event.preventDefault();
    state.dragDepth = 0;
    elements.dropOverlay.hidden = true;
    const file = [...event.dataTransfer.files].find((candidate) =>
      /\.(md|markdown|mdown|txt)$/i.test(candidate.name)
    );
    if (!file) {
      showToast("请拖入 .md、.markdown 或 .txt 文件。");
      return;
    }
    handleFile(file);
  }

  function handleKeyboard(event) {
    if (event.key === "Escape" && !elements.bookmarkPanel.hidden) {
      event.preventDefault();
      closeBookmarkPanel();
      elements.jumpBookmark.focus();
      return;
    }
    if (event.key === "Escape" && state.immersive) {
      event.preventDefault();
      setImmersive(false);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.matches("input, textarea, select, button, label") || target.isContentEditable)
    ) {
      return;
    }
    if (elements.aboutDialog.open) return;

    const key = event.key.toLowerCase();
    if (key === "o") {
      event.preventDefault();
      elements.fileInput.click();
    } else if (key === "a") {
      event.preventDefault();
      toggleGlosses();
    } else if (key === "f") {
      event.preventDefault();
      toggleFrequency();
    } else if (key === "h") {
      event.preventDefault();
      addHighlightFromSelection();
    } else if (key === "b") {
      event.preventDefault();
      if (event.shiftKey) jumpBookmark();
      else saveBookmark();
    } else if (key === "d") {
      event.preventDefault();
      toggleTheme();
    } else if (key === "l") {
      event.preventDefault();
      const selection = String(window.getSelection()?.toString() || "").trim();
      const word = selection.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/)?.[0];
      if (!word) {
        showToast("先选中正文里的英文单词，再按 L 查词。");
        return;
      }
      openDictionaryPanel({ source: word, kind: "word", entryKey: normalizeWord(word) });
    } else if (key === "v") {
      event.preventDefault();
      toggleClickToAnnotate();
    } else if (key === "i") {
      event.preventDefault();
      toggleImmersive();
    } else if (key === "t") {
      event.preventDefault();
      if (elements.tocSection.hidden) {
        showToast("当前文稿没有可用目录。");
      } else if (window.matchMedia("(max-width: 820px)").matches) {
        toggleSidebar();
      } else {
        elements.tocSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  function bindEvents() {
    $$("[data-open-file]").forEach((button) => {
      button.addEventListener("click", () => elements.fileInput.click());
    });
    $$("[data-open-known]").forEach((button) => {
      button.addEventListener("click", () => elements.knownInput.click());
    });

    elements.fileInput.addEventListener("change", (event) => {
      handleFile(event.target.files?.[0]);
      event.target.value = "";
    });

    elements.knownInput.addEventListener("change", (event) => {
      handleKnownFile(event.target.files?.[0]);
      event.target.value = "";
    });

    $("#sampleButton").addEventListener("click", showSample);
    $("#heroSampleButton").addEventListener("click", showSample);
    $("#clearKnown").addEventListener("click", () => {
      if (!state.knownWords.size) {
        showToast("当前词表是空的。");
        return;
      }
      state.knownWords.clear();
      const persisted = saveKnownWords();
      renderKnownPanel();
      scheduleRefresh();
      updateStats();
      showToast(persisted ? "已清空掌握词表。" : "已清空当前词表，但浏览器保存失败。");
    });

    elements.exportKnown?.addEventListener("click", exportKnownWords);
    elements.manageKnown?.addEventListener("click", () => {
      elements.knownPanel.hidden = !elements.knownPanel.hidden;
      elements.manageKnown.setAttribute("aria-expanded", String(!elements.knownPanel.hidden));
      if (!elements.knownPanel.hidden) {
        renderKnownPanel();
        elements.knownFilter.focus();
      }
    });
    elements.knownFilter?.addEventListener("input", renderKnownPanel);

    elements.manageForced?.addEventListener("click", () => {
      elements.forcedPanel.hidden = !elements.forcedPanel.hidden;
      elements.manageForced.setAttribute("aria-expanded", String(!elements.forcedPanel.hidden));
      if (!elements.forcedPanel.hidden) {
        renderForcedPanel();
        elements.forcedFilter.focus();
      }
    });
    elements.forcedFilter?.addEventListener("input", renderForcedPanel);

    elements.clickModeToggle?.addEventListener("click", toggleClickToAnnotate);
    elements.immersiveToggle?.addEventListener("click", toggleImmersive);
    elements.immersiveExit?.addEventListener("click", () => setImmersive(false));
    elements.content.addEventListener("click", (event) => {
      if (!state.prefs.clickToAnnotate) return;
      if (String(window.getSelection()?.toString() || "").trim()) return;
      const word = wordAtPoint(event.clientX, event.clientY);
      if (word) annotatePickedWord(word);
    });

    elements.dictRetry?.addEventListener("click", () => {
      setDictionaryStatus("正在连接本地词典服务…");
      initDictionaries();
    });
    elements.dictClearGlosses?.addEventListener("click", () => {
      if (!state.glossOverrides.size) {
        showToast("还没有选择过自定义释义。");
        return;
      }
      const count = state.glossOverrides.size;
      state.glossOverrides.clear();
      saveGlossOverrides();
      syncDictionaryControls();
      scheduleRefresh();
      showToast(`已清除 ${count} 条自定义释义。`);
    });

    elements.dictClose?.addEventListener("click", closeDictionaryPanel);
    elements.dictDialog?.addEventListener("click", (event) => {
      if (event.target === elements.dictDialog) closeDictionaryPanel();
    });
    elements.dictSearchForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      const word = elements.dictSearch.value.trim();
      if (!word) return;
      const normalized = glossEntryKey(word);
      if (!state.lookupContext) {
        state.lookupContext = { source: word, kind: "word", entryKey: normalized, word: normalized };
      }
      elements.dictWord.textContent = word;
      runDictionaryLookup(normalized);
    });
    elements.dictFullToggle?.addEventListener("change", renderArticle);
    elements.dictOpenGolden?.addEventListener("click", () => {
      const word = state.lookupContext?.source || elements.dictSearch.value.trim();
      if (word) openInGoldendict(word);
    });
    elements.dictResetGloss?.addEventListener("click", () => {
      const context = state.lookupContext;
      if (context) clearGlossOverride(context.entryKey, context.source);
      closeDictionaryPanel();
    });

    elements.cutoff.addEventListener("input", () => {
      state.prefs.cutoff = Number(elements.cutoff.value);
      elements.cutoffValue.value = state.prefs.cutoff.toLocaleString("zh-CN");
      elements.cutoffLabel.textContent = state.prefs.cutoff.toLocaleString("zh-CN");
      setRangeProgress(elements.cutoff);
      savePrefs();
      scheduleRefresh();
    });

    elements.fontSize.addEventListener("input", () => {
      state.prefs.fontSize = Number(elements.fontSize.value);
      elements.fontSizeValue.textContent = `${state.prefs.fontSize}px`;
      setRangeProgress(elements.fontSize);
      document.documentElement.style.setProperty("--reader-font-size", `${state.prefs.fontSize}px`);
      savePrefs();
    });

    elements.readerWidth.addEventListener("input", () => {
      state.prefs.readerWidth = Number(elements.readerWidth.value);
      elements.readerWidthValue.textContent = `${state.prefs.readerWidth}px`;
      setRangeProgress(elements.readerWidth);
      document.documentElement.style.setProperty("--reader-width", `${state.prefs.readerWidth}px`);
      savePrefs();
    });

    $$(".segmented__button").forEach((button) => {
      button.addEventListener("click", () => {
        state.prefs.mode = button.dataset.mode;
        savePrefs();
        syncControls();
        scheduleRefresh();
      });
    });

    elements.phraseToggle.addEventListener("change", () => {
      state.prefs.phrases = elements.phraseToggle.checked;
      savePrefs();
      scheduleRefresh();
    });

    elements.glossToggle.addEventListener("click", toggleGlosses);
    elements.frequencyToggle.addEventListener("click", toggleFrequency);
    elements.highlightButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    elements.highlightButton.addEventListener("click", addHighlightFromSelection);
    elements.content.addEventListener("click", (event) => {
      const mark = event.target instanceof Element
        ? event.target.closest(".text-highlight")
        : null;
      if (mark?.dataset.highlightId) removeHighlight(mark.dataset.highlightId);
    });
    elements.themeToggle.addEventListener("click", toggleTheme);
    elements.sidebarToggle.addEventListener("click", toggleSidebar);
    elements.sidebarScrim.addEventListener("click", closeSidebar);
    elements.saveBookmark.addEventListener("click", saveBookmark);
    elements.jumpBookmark.addEventListener("click", jumpBookmark);
    document.addEventListener("click", (event) => {
      if (
        !elements.bookmarkPanel.hidden &&
        !event.target.closest(".bookmark-menu") &&
        !event.target.closest("#saveBookmark")
      ) {
        closeBookmarkPanel();
      }
    });
    $("#aboutButton").addEventListener("click", showAbout);
    $("#aboutClose").addEventListener("click", closeAbout);
    elements.aboutDialog.addEventListener("click", (event) => {
      if (event.target === elements.aboutDialog) closeAbout();
    });

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });
    window.addEventListener("keydown", handleKeyboard);
    window.addEventListener("pagehide", () => saveReadingProgress(true));
    window.addEventListener("beforeunload", () => saveReadingProgress(true));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveReadingProgress(true);
    });

    document.addEventListener("dragenter", (event) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      state.dragDepth += 1;
      elements.dropOverlay.hidden = false;
    });
    document.addEventListener("dragover", (event) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    });
    document.addEventListener("dragleave", (event) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      state.dragDepth = Math.max(0, state.dragDepth - 1);
      if (state.dragDepth === 0) elements.dropOverlay.hidden = true;
    });
    document.addEventListener("drop", handleDrop);
  }

  function init() {
    syncControls();
    bindEvents();
    restoreLastDocument();
    updateStats();
    syncForcedCount();
    syncDictionaryControls();
    saveGlossOverrides(); // 把加载时清理过的词表写回，坏记录不会一直留着
    initDictionaries();
  }

  init();
})();
