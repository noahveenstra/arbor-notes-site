/* Fixed, fictional evidence for a standalone Arbor drill-down prototype. */
const DEMO = Object.freeze({
  writer: Object.freeze({
    id: "writer-reflection",
    kind: "Writer reflection",
    person: "Mara Vale",
    source: "Tuesday pages · personal reflection",
    date: "14 May 2025",
    quote: "I keep reaching for certainty when what I need is one honest question at a time."
  }),
  speaker: Object.freeze({
    id: "sermon-passage",
    kind: "Sermon speaker",
    person: "Amara Flores",
    source: "A question before a conclusion · recorded talk",
    date: "12 May 2025",
    quote: "I don't have to make the whole road visible to ask for the next step.",
    time: "00:18:42"
  }),
  response: Object.freeze({
    id: "listener-response",
    kind: "Listener response",
    person: "Micah Chen",
    source: "After the Sunday gathering · listening note",
    date: "12 May 2025",
    quote: "That leaves room for me to ask for help before I know what I think."
  }),
  reference: Object.freeze({
    id: "james-1-5",
    title: "James 1:5",
    kind: "Scripture reference",
    note: "Reference only · verse text is not included in this demo."
  })
});

const main = document.querySelector("#prototype-main");
const breadcrumbs = document.querySelector("#breadcrumbs");
const contextRail = document.querySelector("#context-rail");
const returnLink = document.querySelector("#return-link");

function escapeText(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function link(href, label, className = "") {
  return `<a class="${className}" href="${href}">${label}</a>`;
}

function breadcrumb(items) {
  breadcrumbs.innerHTML = items.map((item, index) => {
    const content = index === items.length - 1
      ? `<span class="crumb-current" aria-current="page">${escapeText(item.label)}</span>`
      : link(item.href, escapeText(item.label));
    return `${index ? '<span class="crumb-divider" aria-hidden="true">/</span>' : ""}${content}`;
  }).join("");
}

function heading(kicker, title, summary) {
  return `<div class="page-heading"><p class="page-kicker">${escapeText(kicker)}</p><h1>${escapeText(title)}</h1><p class="page-summary">${escapeText(summary)}</p></div>`;
}

function sourceChip(href, label, extra = "") {
  return link(href, `${escapeText(label)}${extra}`, "source-chip");
}

function evidenceEntry(entry, flavor) {
  return `<article class="evidence-entry ${flavor}">
    <div class="voice-line"><span class="voice-kind">${escapeText(entry.kind)}</span><span class="voice-person">${escapeText(entry.person)}</span></div>
    <blockquote>“${escapeText(entry.quote)}”</blockquote>
    ${link(`#source/${entry.id}`, `Open ${escapeText(entry.kind.toLowerCase())} passage`, "entry-source")}
  </article>`;
}

function contextForWisdom() {
  contextRail.innerHTML = `<p class="context-kicker">Source context</p>
    <h2>Three voices, kept distinct</h2>
    <div class="context-rule"></div>
    <div class="context-source writer"><strong>Writer reflection · ${escapeText(DEMO.writer.person)}</strong><p>“${escapeText(DEMO.writer.quote)}”</p></div>
    <div class="context-source speaker"><strong>Sermon speaker · ${escapeText(DEMO.speaker.person)}</strong><p>“${escapeText(DEMO.speaker.quote)}”</p></div>
    <div class="context-source response"><strong>Listener response · ${escapeText(DEMO.response.person)}</strong><p>“${escapeText(DEMO.response.quote)}”</p></div>
    <p class="context-quiet">The nearby reference is shown by citation only.</p>`;
}

function renderLibrary() {
  breadcrumb([{ label: "Library" }]);
  contextRail.innerHTML = `<p class="context-kicker">A small sample library</p><h2>Two paths, one source</h2><p>James 1:5 is linked from both Faith and Prayer. The reference stays the same when a note has more than one path.</p><div class="context-rule"></div><span class="reference-only">Reference only</span>`;
  main.innerHTML = `${heading("Library", "What came back to you?", "Follow a topic, then open the exact words that made it useful to keep.")}
    <div class="path-list" aria-label="Library paths">
      <a class="path-row" href="#faith"><span><span class="path-title">Faith</span><span class="path-description">Questions about wisdom, asking, and uncertainty</span></span><span class="path-count">3 notes</span></a>
      <a class="path-row" href="#source/james-1-5"><span><span class="path-title">Prayer</span><span class="path-description">A second path to the same James 1:5 reference</span></span><span class="path-count">1 reference</span></a>
    </div>
    <div class="shared-reference">Shared source ${sourceChip("#source/james-1-5", DEMO.reference.title)}<span>Also linked from Faith · Wisdom</span></div>`;
}

function renderFaith() {
  breadcrumb([{ label: "Library", href: "#library" }, { label: "Faith" }]);
  contextRail.innerHTML = `<p class="context-kicker">Source context</p><h2>One citation, two routes</h2><p>The James 1:5 record appears here and under Prayer. It is a reference-only item in this sample.</p>${sourceChip("#source/james-1-5", DEMO.reference.title)}`;
  main.innerHTML = `${heading("Library / Faith", "Faith", "A few saved notes touch on asking, uncertainty, and what comes next.")}
    <div class="path-list"><a class="path-row" href="#wisdom"><span><span class="path-title">Wisdom</span><span class="path-description">A reflection, a recorded talk, and a listener's response</span></span><span class="path-count">3 excerpts</span></a></div>
    <section class="section-intro"><h2>Related reference</h2><p>This citation is also visible on the Prayer path. Its text is not reproduced in this demo.</p></section>
    <div class="reference-band">${sourceChip("#source/james-1-5", DEMO.reference.title)}<p>Same reference record · also filed under <a href="#source/james-1-5">Prayer</a></p></div>`;
}

function compareSurface() {
  return `<section class="surface-content" aria-labelledby="surface-title">
    <h2 id="surface-title">Compare these current excerpts</h2>
    <p class="surface-lede">A side-by-side view of two fictional notes attached to this path. Each quote stays with its own source and voice.</p>
    <div class="compare-list">
      <div class="compare-item writer"><span class="voice-kind">Writer reflection · ${escapeText(DEMO.writer.person)}</span><blockquote>“${escapeText(DEMO.writer.quote)}”</blockquote><small>${escapeText(DEMO.writer.source)}</small></div>
      <div class="compare-item response"><span class="voice-kind">Listener response · ${escapeText(DEMO.response.person)}</span><blockquote>“${escapeText(DEMO.response.quote)}”</blockquote><small>${escapeText(DEMO.response.source)}</small></div>
    </div>
  </section>`;
}

function historySurface() {
  return `<section class="surface-content" aria-labelledby="surface-title">
    <h2 id="surface-title">Curated link history</h2>
    <p class="surface-lede">This records how the demo groups its fixed sources. It is not a history of edits to anyone's writing.</p>
    <ol class="history-list">
      <li><time datetime="2025-05-12">12 May 2025</time>The recorded talk and listener response were placed on the Wisdom path.</li>
      <li><time datetime="2025-05-14">14 May 2025</time>Mara's reflection was linked alongside those excerpts.</li>
      <li><time datetime="2025-05-14">14 May 2025</time>James 1:5 was added as a reference-only link, also visible under Prayer.</li>
    </ol>
    <p class="history-note">No saved prior text revisions exist in this prototype. The current excerpts above are the complete fictional sample.</p>
  </section>`;
}

function renderWisdom(surface = "") {
  breadcrumb([{ label: "Library", href: "#library" }, { label: "Faith", href: "#faith" }, { label: "Wisdom" }]);
  contextForWisdom();
  main.innerHTML = `${heading("Faith / Wisdom", "Wisdom", "These excerpts sit near one another in this demo. That connection is a way to browse, not a conclusion about what anyone believes.")}
    <div class="evidence-list" aria-label="Fictional source excerpts">
      ${evidenceEntry(DEMO.writer, "writer")}
      ${evidenceEntry(DEMO.speaker, "speaker")}
      ${evidenceEntry(DEMO.response, "response")}
    </div>
    <div class="reference-band">${sourceChip("#source/james-1-5", DEMO.reference.title, '<span class="reference-only">reference only</span>')}<p>A nearby citation, shown without verse text.<span class="also-path"><br>Also appears in <a href="#source/james-1-5">Prayer</a>.</span></p></div>
    <div class="detail-tools" role="group" aria-label="Compare and history">
      <button class="surface-button" type="button" data-surface="compare" aria-pressed="${surface === "compare"}">Compare</button>
      <button class="surface-button" type="button" data-surface="history" aria-pressed="${surface === "history"}">History</button>
    </div>
    ${surface === "compare" ? compareSurface() : surface === "history" ? historySurface() : ""}`;
}

function sourceBreadcrumb(label) {
  breadcrumb([{ label: "Library", href: "#library" }, { label: "Faith", href: "#faith" }, { label: "Wisdom", href: "#wisdom" }, { label }]);
}

function renderExcerptSource(entry, flavor) {
  sourceBreadcrumb(entry.kind);
  returnLink.hidden = false;
  contextRail.innerHTML = `<p class="context-kicker">Source context</p><h2>${escapeText(entry.kind)}</h2><div class="context-rule"></div><div class="context-source ${flavor}"><strong>${escapeText(entry.person)}</strong><p>“${escapeText(entry.quote)}”</p></div><p class="context-quiet">Exact fictional excerpt, preserved as written in this demo.</p>`;
  main.innerHTML = `<div class="source-page">
    ${heading("Wisdom / source passage", entry.source, "The excerpt is shown with the voice and source that it came from.")}
    <dl class="source-meta"><div><dt>Voice</dt><dd>${escapeText(entry.kind)} · ${escapeText(entry.person)}</dd></div><div><dt>Source date</dt><dd>${escapeText(entry.date)}</dd></div>${entry.time ? `<div><dt>Recording position</dt><dd>${escapeText(entry.time)}</dd></div>` : ""}</dl>
    <article class="transcript-passage ${flavor}"><div class="voice-line"><span class="voice-kind">${escapeText(entry.kind)}</span><span class="voice-person">${escapeText(entry.person)}</span></div><blockquote>“${escapeText(entry.quote)}”</blockquote><span class="passage-index">Exact source excerpt · ${escapeText(entry.time || entry.date)}</span></article>
    <section class="connected-notes"><h2>Nearby sources on Wisdom</h2><p>These are separate fictional entries, not one merged account.</p>
      <a class="connected-note" href="#source/writer-reflection"><span><strong>Writer reflection</strong><small>${escapeText(DEMO.writer.person)} · ${escapeText(DEMO.writer.source)}</small></span><span aria-hidden="true">↗</span></a>
      <a class="connected-note" href="#source/listener-response"><span><strong>Listener response</strong><small>${escapeText(DEMO.response.person)} · ${escapeText(DEMO.response.source)}</small></span><span aria-hidden="true">↗</span></a>
    </section>
    <a class="source-return" href="#wisdom">Return to Wisdom</a>
    </div>`;
}

function renderReference() {
  sourceBreadcrumb(DEMO.reference.title);
  returnLink.hidden = false;
  contextRail.innerHTML = `<p class="context-kicker">Citation record</p><h2>${escapeText(DEMO.reference.title)}</h2><div class="context-rule"></div><span class="reference-only">Reference only</span><p>Verse text is not included in this demo.</p><p class="context-quiet">Linked from Faith · Wisdom and Prayer.</p>`;
  main.innerHTML = `<div class="source-page">
    ${heading("Faith / Wisdom / citation", DEMO.reference.title, "A saved source reference, shown with its filing context.")}
    <dl class="source-meta"><div><dt>Source</dt><dd>${escapeText(DEMO.reference.kind)}</dd></div><div><dt>Text status</dt><dd>Reference only</dd></div></dl>
    <div class="ref-notice"><p>${escapeText(DEMO.reference.note)}</p></div>
    <section class="connected-notes"><h2>Where this reference appears</h2><p>One citation, visible through two paths.</p>
      <a class="connected-note" href="#wisdom"><span><strong>Faith · Wisdom</strong><small>Related to three separate fictional excerpts</small></span><span aria-hidden="true">↗</span></a>
      <a class="connected-note" href="#source/james-1-5"><span><strong>Prayer</strong><small>The same James 1:5 reference</small></span><span aria-hidden="true">↗</span></a>
    </section>
    <a class="source-return" href="#wisdom">Return to Wisdom</a>
    </div>`;
}

function updateNav(route) {
  const navRoute = route.type === "source" ? "wisdom" : route.type === "reference" ? "prayer" : route.type;
  document.querySelectorAll("[data-nav]").forEach(item => {
    if (item.dataset.nav === navRoute) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
}

function routeFromHash() {
  const hash = location.hash.replace(/^#/, "") || "library";
  const [page, segment] = hash.split("/");
  if (page === "source") {
    if (segment === DEMO.reference.id) return { type: "reference" };
    const source = Object.values(DEMO).find(item => item.id === segment);
    return source ? { type: "source", source } : { type: "wisdom" };
  }
  if (page === "faith" || page === "wisdom" || page === "library") {
    const surface = page === "wisdom" ? segment : "";
    return { type: page, surface: surface === "compare" || surface === "history" ? surface : "" };
  }
  return { type: "library" };
}

function render() {
  const route = routeFromHash();
  returnLink.hidden = route.type !== "source" && route.type !== "reference";
  updateNav(route);
  if (route.type === "library") renderLibrary();
  if (route.type === "faith") renderFaith();
  if (route.type === "wisdom") renderWisdom(route.surface);
  if (route.type === "source") renderExcerptSource(route.source, route.source.id === DEMO.writer.id ? "writer" : route.source.id === DEMO.response.id ? "response" : "speaker");
  if (route.type === "reference") renderReference();
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-surface]");
  if (!button) return;
  const current = routeFromHash();
  const surface = current.surface === button.dataset.surface ? "" : button.dataset.surface;
  location.hash = surface ? `wisdom/${surface}` : "wisdom";
});

window.addEventListener("hashchange", render);
window.addEventListener("popstate", render);
render();
