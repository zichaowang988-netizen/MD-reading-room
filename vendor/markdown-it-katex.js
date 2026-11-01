/*!
 * markdown-it-katex browser adapter
 * Based on markdown-it-katex 2.0.3 (MIT License).
 * https://github.com/waylonflinn/markdown-it-katex
 *
 * Adds $...$ inline math and $$...$$ display math using KaTeX.
 */
(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./katex/katex.min.js"));
  } else {
    root.markdownItKatex = factory(root.katex);
  }
})(typeof self !== "undefined" ? self : this, function (katex) {
  "use strict";

  if (!katex) {
    return function () {};
  }

  function isValidDelimiter(state, pos) {
    const previous = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
    const next = pos + 1 <= state.posMax ? state.src.charCodeAt(pos + 1) : -1;
    const canClose = !(
      previous === 0x20 ||
      previous === 0x09 ||
      (next >= 0x30 && next <= 0x39)
    );
    const canOpen = !(next === 0x20 || next === 0x09);
    return { canOpen, canClose };
  }

  function mathInline(state, silent) {
    if (state.src[state.pos] !== "$") return false;

    const delimiter = isValidDelimiter(state, state.pos);
    if (!delimiter.canOpen) {
      if (!silent) state.pending += "$";
      state.pos += 1;
      return true;
    }

    const start = state.pos + 1;
    let match = start;
    let position;

    while ((match = state.src.indexOf("$", match)) !== -1) {
      position = match - 1;
      while (state.src[position] === "\\") position -= 1;
      if ((match - position) % 2 === 1) break;
      match += 1;
    }

    if (match === -1) {
      if (!silent) state.pending += "$";
      state.pos = start;
      return true;
    }

    if (match === start) {
      if (!silent) state.pending += "$$";
      state.pos = start + 1;
      return true;
    }

    if (!isValidDelimiter(state, match).canClose) {
      if (!silent) state.pending += "$";
      state.pos = start;
      return true;
    }

    if (!silent) {
      const token = state.push("math_inline", "math", 0);
      token.markup = "$";
      token.content = state.src.slice(start, match);
    }

    state.pos = match + 1;
    return true;
  }

  function mathBlock(state, start, end, silent) {
    const position = state.bMarks[start] + state.tShift[start];
    const max = state.eMarks[start];

    if (position + 2 > max) return false;
    if (state.src.slice(position, position + 2) !== "$$") return false;

    let firstLine = state.src.slice(position + 2, max);
    if (silent) return true;

    let found = firstLine.trim().endsWith("$$");
    let lastLine = "";
    if (found) firstLine = firstLine.trim().slice(0, -2);

    let next = start;
    while (!found) {
      next += 1;
      if (next >= end) break;

      const lineStart = state.bMarks[next] + state.tShift[next];
      const lineEnd = state.eMarks[next];
      if (
        lineStart < lineEnd &&
        state.tShift[next] < state.blkIndent
      ) {
        break;
      }

      const line = state.src.slice(lineStart, lineEnd);
      if (line.trim().endsWith("$$")) {
        const closing = line.lastIndexOf("$$");
        lastLine = line.slice(0, closing);
        found = true;
      }
    }

    state.line = next + 1;

    const token = state.push("math_block", "math", 0);
    token.block = true;
    token.content =
      (firstLine.trim() ? `${firstLine.trim()}\n` : "") +
      (next > start + 1
        ? state.getLines(start + 1, next, state.tShift[start], true)
        : "") +
      (lastLine.trim() ? lastLine.trim() : "");
    token.map = [start, state.line];
    token.markup = "$$";
    return true;
  }

  function renderMath(latex, displayMode, options) {
    try {
      return katex.renderToString(
        latex,
        Object.assign({}, options, {
          displayMode,
          throwOnError: false,
          strict: false,
        })
      );
    } catch {
      return "";
    }
  }

  return function mathPlugin(markdown, options = {}) {
    markdown.inline.ruler.after("escape", "math_inline", mathInline);
    markdown.block.ruler.after(
      "blockquote",
      "math_block",
      mathBlock,
      { alt: ["paragraph", "reference", "blockquote", "list"] }
    );

    markdown.renderer.rules.math_inline = (tokens, index) =>
      `<span class="math-inline">${renderMath(
        tokens[index].content,
        false,
        options
      )}</span>`;

    markdown.renderer.rules.math_block = (tokens, index) =>
      `<div class="math-block">${renderMath(
        tokens[index].content,
        true,
        options
      )}</div>\n`;
  };
});
