// The pages, as plain HTML with no scripts. A grade's breakdown opens with the
// browser's own <details>.

import { labelsOf, NEW_LABEL } from "./forms.js";

const LETTERS = ["A", "B", "C", "D", "E"];
const CATEGORIES = [["quality", "Quality"], ["security", "Security"], ["delivery", "Delivery"]];

export function escape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const STYLE = `
:root{color-scheme:light dark;--bg:#f6f7f5;--surface:#fff;--fg:#1b2420;--muted:#5b6862;--line:#dde3df;--accent:#1f6b5c;
--gA:#2e9e4f;--gB:#8cc63f;--gC:#e6c229;--gD:#f08c2e;--gE:#d9473b;--ink:#1b2420}
@media (prefers-color-scheme:dark){:root{--bg:#121816;--surface:#1a2220;--fg:#e4ebe7;--muted:#9aa8a1;--line:#2c3632;--accent:#6cc4ae}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 64px;display:flex;flex-direction:column;gap:20px}
nav{display:flex;gap:16px;align-items:baseline;flex-wrap:wrap}
nav b{font-size:18px}
a{color:var(--accent)}
a[aria-current]{font-weight:600;text-decoration:none;color:var(--fg)}
h1{margin:0;font-size:24px}
h2{margin:0;font-size:18px}
h3{margin:0;font-size:13px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
section{display:flex;flex-direction:column;gap:12px}
p{margin:0}
.who,.meta,.tag{color:var(--muted);font-size:13px}
.who{margin-left:auto}
.problem{color:var(--gE)}
.wrap{background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:640px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
tbody tr:last-child>td{border-bottom:0}
.mono{font-family:ui-monospace,Menlo,monospace;font-size:13px}
.dot{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;font:600 12px/1 ui-monospace,Menlo,monospace;color:#fff}
.A{background:var(--gA)}.E{background:var(--gE)}.B{background:var(--gB);color:var(--ink)}.C{background:var(--gC);color:var(--ink)}.D{background:var(--gD);color:var(--ink)}
details>summary{cursor:pointer;list-style:none;display:inline-block}
details>summary::-webkit-details-marker{display:none}
details ul{margin:8px 0 0;padding:0 0 0 16px;font-size:13px;min-width:220px}
.on{color:var(--accent);font-weight:600}.off{color:var(--muted)}
.absent td{color:var(--muted)}
select,input:not([type]),input[name=note]{font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);width:100%;min-width:90px}
input[type=checkbox]{width:20px;height:20px;accent-color:var(--accent)}
button{font:inherit;font-weight:600;padding:6px 14px;border:1px solid var(--accent);border-radius:6px;background:var(--accent);color:var(--bg);cursor:pointer}
form{display:flex;flex-direction:column;gap:10px}
.actions{display:flex;gap:8px}
td form{flex-direction:row}
`;

function page(title, active, who, body, owner) {
  const links = [["/", "Board"], ["/state", "State"], ["/history", "History"]]
    .map(([href, label]) => `<a href="${href}"${label === active ? ' aria-current="page"' : ""}>${label}</a>`)
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)} · ${escape(owner.name)} · Release control plane</title><style>${STYLE}</style></head>
<body><main><nav><b>${escape(owner.name)} releases</b>${links}<span class="who">${escape(who)}</span></nav>${body}</main></body></html>
`;
}

const dot = (letter) => `<span class="dot ${escape(letter)}">${escape(letter)}</span>`;

function grade(name, found) {
  if (!found) return "<td>·</td>";
  const steps = [found.start, ...(found.steps ?? [])].filter(Boolean)
    .map((step) => `<li>${escape(step.text)}</li>`).join("");
  return `<td><details><summary aria-label="${name} ${escape(found.letter)}">${dot(found.letter)}</summary><ul>${steps}</ul></details></td>`;
}

function boardRow(row) {
  const grades = CATEGORIES.map(([key, label]) => grade(label, row.grades?.[key])).join("");
  const privately = row.visibility === "private" ? ' <span class="tag">private</span>' : "";
  return `<tr><td class="mono">${escape(row.repo)}${privately} <span class="tag">${escape(row.kind)}</span></td>
<td>${dot(row.overall)}</td><td class="mono">${escape(row.released)}</td><td class="mono">${escape(row.pubkit)}</td>${grades}</tr>`;
}

const worstFirst = (a, b) => LETTERS.indexOf(b.overall) - LETTERS.indexOf(a.overall) || a.repo.localeCompare(b.repo);

function byProject(rows) {
  const groups = new Map();
  for (const row of rows) {
    const project = row.project ?? "No project";
    groups.set(project, [...(groups.get(project) ?? []), row]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const failed = (result) => `<p class="problem">Couldn't read this: ${escape(result.error)}</p>`;

// When the board was last looked at, which its own time can't say: a run that finds
// nothing new keeps nothing.
function lastChecked(checked) {
  if (!checked?.value) return "";
  const { time, conclusion, url } = checked.value;
  const went = conclusion === "success" ? "" : ` <span class="problem">It ended: ${escape(conclusion)}.</span>`;
  return `<p class="meta">Last checked <a href="${escape(url)}">${escape(time)}</a>.${went}</p>`;
}

export function boardPage({ owner, result, checked }, who) {
  let body;
  if (result.error) body = failed(result);
  else if (!result.value) body = '<p class="meta">No board yet. The hourly run makes the first.</p>';
  else {
    const board = result.value;
    const problems = (board.problems ?? []).map((p) => `<p class="problem">${escape(p)}</p>`).join("");
    const groups = byProject(board.repos ?? []).map(([project, rows]) => `<h3>${escape(project)}</h3><div class="wrap"><table>
<thead><tr><th>Repository</th><th>Overall</th><th>Released</th><th>pubkit</th><th>Quality</th><th>Security</th><th>Delivery</th></tr></thead>
<tbody>${[...rows].sort(worstFirst).map(boardRow).join("")}</tbody></table></div>`).join("");
    body = `<p class="meta">${escape(board.summary)}</p>${problems}${groups}`;
  }
  return page("Board", "Board", who, `<h1>Board</h1><section>${lastChecked(checked)}${body}</section>`, owner);
}

const role = (on) => (on ? '<td class="on">on</td>' : '<td class="off">off</td>');
const box = (name, key, on) => `<td><input type="checkbox" name="${escape(name)}.${key}" aria-label="${escape(name)} ${key}"${on ? " checked" : ""}></td>`;

function readRow(name, r) {
  return `<tr><td class="mono">${escape(name)}</td><td>${escape(r.project ?? "·")}</td>${role(r.board)}${role(r.protect)}${role(r.govern)}</tr>`;
}

function projectSelect(name, current, labels) {
  const options = ["", ...labels].map((label) => `<option value="${escape(label)}"${label === (current ?? "") ? " selected" : ""}>${escape(label || "None")}</option>`);
  return `<select name="${escape(name)}.project" aria-label="${escape(name)} project">${options.join("")}<option value="${NEW_LABEL}">New label…</option></select>`;
}

function editRow(name, r, labels) {
  return `<tr${r ? "" : ' class="absent"'}><td class="mono">${escape(name)}<input type="hidden" name="repo" value="${escape(name)}"></td>
<td>${projectSelect(name, r?.project, labels)}</td>
${box(name, "board", r?.board)}${box(name, "protect", r?.protect)}${box(name, "govern", r?.govern)}</tr>`;
}

const HEAD = "<thead><tr><th>Repository</th><th>Project</th><th>Board</th><th>Protect</th><th>Govern</th></tr></thead>";

function stateBody({ owner, result, visible }, canEdit) {
  if (result.error) return failed(result);
  const { state, sha } = result.value;
  const named = Object.keys(state.repos);
  if (!canEdit || !owner.writerInstallation) {
    const rows = named.sort((a, b) => a.localeCompare(b)).map((name) => readRow(name, state.repos[name])).join("");
    return `<div class="wrap"><table>${HEAD}<tbody>${rows}</tbody></table></div>`;
  }
  const others = visible.error ? [] : visible.value.filter((name) => !state.repos[name]);
  const labels = labelsOf(state);
  const rows = [...named].sort((a, b) => a.localeCompare(b)).map((name) => editRow(name, state.repos[name], labels))
    .concat(others.map((name) => editRow(name, null, labels))).join("");
  return `${visible.error ? failed(visible) : ""}
<form method="post" action="/state"><input type="hidden" name="base" value="${escape(sha)}">
<div class="wrap"><table>${HEAD}<tbody>${rows}</tbody></table></div>
<p class="actions"><input name="new-label" maxlength="40" pattern="[a-z0-9][a-z0-9-]*" aria-label="New label" placeholder="New label, for repositories set to it (lower case, digits, hyphens)"></p>
<p class="actions"><input name="note" required maxlength="200" aria-label="Why" placeholder="Why this change?"> <button>Save</button></p>
<p class="meta">A save opens a pull request on ${escape(owner.name)}/release-state that merges itself once its check passes. A repository in grey joins when a role is switched on.</p>
</form>`;
}

export function statePage(read, who, canEdit = false) {
  return page("State", "State", who, `<h1>State</h1><section>${stateBody(read, canEdit)}</section>`, read.owner);
}

export function resultPage(who, title, message, url, owner) {
  const link = url ? `<p><a href="${escape(url)}">${escape(url)}</a></p>` : "";
  const back = '<p><a href="/state">Back to the state</a></p>';
  return page(title, "State", who, `<h1>${escape(title)}</h1><p>${escape(message)}</p>${link}${back}`, owner);
}

function revertCell(commit, base) {
  return `<td><form method="post" action="/state/revert/${escape(commit.sha)}">
<input type="hidden" name="base" value="${escape(base)}"><input name="note" required maxlength="200" aria-label="Why revert" placeholder="Why?"> <button>Revert</button></form></td>`;
}

export function historyPage({ owner, commits, log, result }, who, canEdit = false) {
  {
    const reverting = canEdit && owner.writerInstallation && result?.value;
    const changed = commits.error ? failed(commits) : `<div class="wrap"><table>
<thead><tr><th>When</th><th>Who</th><th>Note</th><th>What changed</th>${reverting ? "<th>Go back to this</th>" : ""}</tr></thead><tbody>${commits.value.map((c, i) => `<tr>
<td class="mono">${escape(c.time)}</td><td>${escape(c.author)}</td><td>${escape(c.message)}</td><td>${c.changes.map(escape).join("<br>") || "·"}</td>${reverting ? (i === 0 ? "<td>·</td>" : revertCell(c, result.value.sha)) : ""}</tr>`).join("")}</tbody></table></div>`;
    const timeline = log.error ? failed(log) : `<div class="wrap"><table>
<thead><tr><th>When</th><th>Snapshot</th><th>By</th></tr></thead><tbody>${log.value.map((e) => `<tr>
<td class="mono">${escape(e.time)}</td><td class="mono">${escape(String(e.hash).slice(0, 12))}</td><td class="mono">${escape(e.principal)}</td></tr>`).join("")}</tbody></table></div>`;
    return page("History", "History", who, `<h1>History</h1><section><h3>State changes</h3>${changed}<h3>Board snapshots</h3>${timeline}</section>`, owner);
  }
}

export function refusedPage(who, owner) {
  return page("Not on the list", "", who, "<h1>Not on the list</h1><p>This address can't see anything here.</p>", owner);
}
