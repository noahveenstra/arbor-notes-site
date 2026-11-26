(function attachArborMarkdown(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ArborMarkdown = api;
})(globalThis, function createArborMarkdown() {
  function escapeHTML(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function inlineHTML(raw) {
    return escapeHTML(raw).replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/~~([^~]+)~~/g, "<s>$1</s>")
      .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
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
        blocks.push("<blockquote><p>" + quoted.map(inlineHTML).join("<br>") + "</p></blockquote>"); continue;
      }
      const paragraph = [];
      while (index < lines.length && lines[index].trim() && !/^(?:#{1,3}\s+|>\s?)/.test(lines[index]) && !parseMarkdownListItem(lines[index])) paragraph.push(lines[index++]);
      blocks.push("<p>" + paragraph.map(inlineHTML).join("<br>") + "</p>");
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

  return Object.freeze({ parseMarkdownListItem, splitMarkdownDocument, markdownHTML, serializeMarkdownList });
});
