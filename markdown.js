(function attachArborMarkdown(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborMarkdown = api;
})(globalThis, function createArborMarkdown() {
  function escapeHTML(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function safeMarkdownHref(value) {
    const href = String(value || "").trim();
    if (!href || /[\\\u0000-\u0020\u007f]/.test(href) || href.startsWith("//")) return null;
    if (/^(?:https?:|mailto:|tel:)/i.test(href)) return href;
    if (/^[a-z][a-z\d+.-]*:/i.test(href)) return null;
    return href;
  }

  function escapedAt(source, index) {
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor--) backslashes++;
    return backslashes % 2 === 1;
  }

  function parseMarkdownLinkAt(source, start) {
    let labelDepth = 0;
    let labelEnd = -1;
    for (let cursor = start + 1; cursor < source.length; cursor++) {
      if (source[cursor] === "\\") { cursor++; continue; }
      if (source[cursor] === "\n") return null;
      if (source[cursor] === "[") labelDepth++;
      else if (source[cursor] === "]") {
        if (labelDepth === 0) { labelEnd = cursor; break; }
        labelDepth--;
      }
    }
    if (labelEnd < 0 || source[labelEnd + 1] !== "(") return null;

    let destinationDepth = 0;
    let destinationEnd = -1;
    for (let cursor = labelEnd + 2; cursor < source.length; cursor++) {
      if (source[cursor] === "\\") { cursor++; continue; }
      if (source[cursor] === "\n") return null;
      if (source[cursor] === "(") destinationDepth++;
      else if (source[cursor] === ")") {
        if (destinationDepth === 0) { destinationEnd = cursor; break; }
        destinationDepth--;
      }
    }
    if (destinationEnd < 0) return null;

    const inside = source.slice(labelEnd + 2, destinationEnd).trim();
    let destinationSource = inside;
    let titleSource = "";
    let href = inside;
    if (inside.startsWith("<")) {
      const angle = inside.match(/^(<[^<>]*>)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?$/);
      if (!angle) return null;
      destinationSource = angle[1];
      titleSource = inside.slice(destinationSource.length).trim();
      href = destinationSource.slice(1, -1);
    } else {
      const title = inside.match(/^(\S+)\s+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\))$/);
      if (title) {
        destinationSource = title[1];
        titleSource = inside.slice(destinationSource.length).trim();
        href = destinationSource;
      } else if (/\s/.test(inside)) return null;
    }
    href = href.replace(/\\([\\()[\]{}<>])/g, "$1");
    return {
      end: destinationEnd + 1,
      label: source.slice(start + 1, labelEnd),
      href: href,
      destinationSource: destinationSource,
      titleSource: titleSource,
      raw: source.slice(start, destinationEnd + 1)
    };
  }

  function inlineHTML(raw, allowLinks = true, context = null) {
    const root = !context;
    if (!context) {
      const source = String(raw || "");
      let prefix = "\u0000ARBOR_MARKDOWN_" + Math.random().toString(36).slice(2) + "_";
      while (source.includes(prefix)) prefix += "X";
      context = { prefix: prefix, tokens: [] };
    }
    const hold = function (html) {
      const token = context.prefix + context.tokens.length + "\u0000";
      context.tokens.push(html);
      return token;
    };
    let source = String(raw || "").replace(/`([^`]+)`/g, function (_, value) {
      return hold("<code>" + escapeHTML(value) + "</code>");
    });
    if (allowLinks) {
      let rendered = "";
      for (let index = 0; index < source.length;) {
        if (source[index] === "\\" && index + 1 < source.length) {
          rendered += source.slice(index, index + 2);
          index += 2;
          continue;
        }
        const imageMarker = index > 0 && source[index - 1] === "!" && !escapedAt(source, index - 1);
        if (source[index] === "[" && !imageMarker && !escapedAt(source, index)) {
          const link = parseMarkdownLinkAt(source, index);
          if (link) {
            const href = safeMarkdownHref(link.href);
            if (href) {
              const titleValue = link.titleSource ? link.titleSource.replace(/^(?:"([\s\S]*)"|'([\s\S]*)'|\(([\s\S]*)\))$/, "$1$2$3") : "";
              const titleAttribute = link.titleSource ? ' title="' + escapeHTML(titleValue) + '" data-markdown-title-source="' + escapeHTML(link.titleSource) + '"' : "";
              const anchor = '<a href="' + escapeHTML(href) + '" target="_blank" rel="noopener noreferrer" contenteditable="false" data-markdown-destination="' + escapeHTML(link.destinationSource) + '"' + titleAttribute + '>' + inlineHTML(link.label, false, context) + "</a>";
              rendered += hold(anchor);
            } else rendered += hold(escapeHTML(link.raw));
            index = link.end;
            continue;
          }
        }
        rendered += source[index++];
      }
      source = rendered;
    }
    let html = escapeHTML(source).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/~~([^~]+)~~/g, "<s>$1</s>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    if (!root) return html;
    function restore(value, depth = 0) {
      if (depth > context.tokens.length) return value;
      const pattern = new RegExp(context.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\d+)\\u0000", "g");
      return value.replace(pattern, function (_, index) {
        const replacement = context.tokens[Number(index)];
        return replacement == null ? "" : restore(replacement, depth + 1);
      });
    }
    return restore(html);
  }

  function parseMarkdownListItem(line) {
    const match = String(line || "").match(/^([ \t]*)(?:([-*+])[ \t]+\[([ xX])\](?:[ \t]+(.*))?|([-*+])(?:[ \t]+(.*))?|([0-9]+)([.)])(?:[ \t]+(.*))?)$/);
    if (!match) return null;
    if (match[2]) return { indentation: match[1], marker: match[2], checklist: true, checked: match[3].toLowerCase() === "x", content: match[4] || "", number: 0, ordered: false };
    if (match[5]) return { indentation: match[1], marker: match[5], checklist: false, content: match[6] || "", number: 0, ordered: false };
    const number = Number(match[7]);
    const item = { indentation: match[1], marker: "", checklist: false, content: match[9] || "", number, delimiter: match[8], ordered: true };
    if (String(number) !== match[7]) item.numberSpelling = match[7];
    return item;
  }

  function splitMarkdownDocument(raw) {
    const lines = String(raw || "").split(/\r?\n/);
    let titleIndex = -1;
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].replace(/^#+\s*/, "").trim()) { titleIndex = index; break; }
    }
    if (titleIndex < 0) return { title: "", body: "" };
    return {
      title: lines[titleIndex],
      body: lines.slice(titleIndex + 1).join("\n").replace(/^\n/, "")
    };
  }

  function markdownHTML(raw) {
    const source = String(raw || "").replace(/\r/g, "");
    if (!source) return "";
    const lines = source.split("\n");
    const blocks = [];
    let index = 0;
    while (index < lines.length) {
      if (!lines[index].trim()) {
        const start = index;
        while (index < lines.length && !lines[index].trim()) index += 1;
        const blankLineCount = index - start;
        const hasPreviousBlock = blocks.length > 0;
        const hasNextBlock = index < lines.length;
        let emptyParagraphCount;
        if (hasPreviousBlock && hasNextBlock) emptyParagraphCount = Math.floor(Math.max(0, blankLineCount - 1) / 2);
        else if (hasPreviousBlock || hasNextBlock) emptyParagraphCount = Math.floor(blankLineCount / 2);
        else emptyParagraphCount = Math.ceil(blankLineCount / 2);
        for (let emptyIndex = 0; emptyIndex < emptyParagraphCount; emptyIndex += 1) blocks.push("<p><br></p>");
        continue;
      }
      const heading = lines[index].match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        const tag = heading[1].length === 1 ? "h1" : heading[1].length === 2 ? "h2" : "h3";
        blocks.push("<" + tag + ">" + inlineHTML(heading[2]) + "</" + tag + ">"); index += 1; continue;
      }
      const first = parseMarkdownListItem(lines[index]);
      if (first) {
        const tag = first.ordered ? "ol" : "ul";
        const items = [];
        while (index < lines.length) {
          const item = parseMarkdownListItem(lines[index]);
          if (!item || item.ordered !== first.ordered || item.indentation !== first.indentation || item.marker !== first.marker || item.delimiter !== first.delimiter) break;
          const itemIndentation = item.indentation || "";
          const itemIndentLevel = Math.ceil(itemIndentation.length / 2);
          const itemAttributes = ' data-indent="' + escapeHTML(itemIndentation) + '" data-indent-level="' + itemIndentLevel + '"' + (itemIndentLevel ? ' style="margin-left: ' + (itemIndentLevel * 1.35) + 'em"' : "");
          if (item.checklist) items.push("<li" + itemAttributes + '><input type="checkbox" ' + (item.checked ? "checked " : "") + 'contenteditable="false" aria-label="Checklist item"><span>' + (inlineHTML(item.content) || "<br>") + "</span></li>");
          else items.push("<li" + (item.ordered ? ' data-number="' + (item.numberSpelling || item.number) + '"' : "") + itemAttributes + ">" + (inlineHTML(item.content) || "<br>") + "</li>");
          index += 1;
        }
        const level = Math.ceil(first.indentation.length / 2);
        const attrs = (first.checklist ? ' data-checklist="true"' : "") + (!first.ordered ? ' data-marker="' + escapeHTML(first.marker) + '"' : ' start="' + (first.numberSpelling ? first.numberSpelling.replace(/^0+(?=\d)/, "") : first.number) + '" data-delimiter="' + escapeHTML(first.delimiter) + '"') + (first.indentation ? ' data-indent="' + escapeHTML(first.indentation) + '"' : "") + ' data-indent-level="' + level + '"';
        blocks.push("<" + tag + attrs + ">" + items.join("") + "</" + tag + ">"); continue;
      }
      if (/^>\s?/.test(lines[index])) {
        const quoted = [];
        while (index < lines.length && /^>\s?/.test(lines[index])) quoted.push(lines[index++].replace(/^>\s?/, ""));
        blocks.push("<blockquote><p>" + quoted.map(line => inlineHTML(line)).join("<br>") + "</p></blockquote>"); continue;
      }
      const paragraph = [];
      while (index < lines.length && lines[index].trim() && !/^(?:#{1,3}\s+|>\s?)/.test(lines[index]) && !parseMarkdownListItem(lines[index])) paragraph.push(lines[index++]);
      blocks.push("<p>" + paragraph.map(line => inlineHTML(line)).join("<br>") + "</p>");
    }
    return blocks.join("");
  }

  function serializeMarkdownList(list) {
    const tagName = String(list.tagName || "").toUpperCase();
    const items = Array.isArray(list.items) ? list.items : [];
    const rawStart = list.start == null || list.start === "" ? 1 : Number(list.start);
    const start = Number.isFinite(rawStart) ? rawStart : 1;
    return items.map(function (item, itemIndex) {
      const indentation = item.indentation != null ? item.indentation : (list.indentation || "");
      const content = String(item.content || "").replace(/\n/g, " ").trim();
      if (item.checkbox) return indentation + (list.marker || "-") + " [" + (item.checked ? "x" : " ") + "]" + (content ? " " + content : "");
      if (tagName === "OL") {
        let number = start + itemIndex;
        if (item.number != null && item.number !== "") {
          number = /^[0-9]+$/.test(String(item.number)) ? item.number : Number(item.number);
        } else if (!Number.isSafeInteger(rawStart) && /^[0-9]+$/.test(String(list.start))) {
          number = BigInt(list.start) + BigInt(itemIndex);
        }
        return indentation + number + (list.delimiter || ".") + (content ? " " + content : "");
      }
      return indentation + (list.marker || "-") + (content ? " " + content : "");
    }).join("\n");
  }

  return Object.freeze({ parseMarkdownListItem, splitMarkdownDocument, markdownHTML, serializeMarkdownList, safeMarkdownHref });
});
