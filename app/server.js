// The release control plane's app: the board, the state and its history, for each
// owner, and for its operators, changing the state. oauth2-proxy signs people in and
// hands over their verified email in X-Forwarded-Email; nothing else can reach this
// port (k8s network policy), and the team list here is a second check, so a mistake
// there fails closed. A change is a form, checked to come from this site, that
// becomes a pull request on the owner's state repository.

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { configFrom } from "./config.js";
import { reader } from "./github.js";
import { boards } from "./storage.js";
import { writer } from "./writer.js";
import { FormError, noteFrom, shaFrom, stateFrom } from "./forms.js";
import { changes } from "./history.js";
import { boardPage, historyPage, refusedPage, resultPage, statePage } from "./render.js";

const FRESH_MS = 60_000;
const FORM_BYTES = 256 * 1024;

// What was read a moment ago. A failure isn't kept, so the next request tries again.
export function cached(read, now = Date.now, freshFor = FRESH_MS) {
  const held = new Map();
  const get = async (key) => {
    const found = held.get(key);
    if (found && now() - found.at < freshFor) return found.value;
    const value = await read(key);
    held.set(key, { at: now(), value });
    return value;
  };
  get.forget = (key) => held.delete(key);
  return get;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    request.on("data", (part) => {
      size += part.length;
      if (size > FORM_BYTES) {
        reject(new FormError("That form is too large."));
        request.destroy();
      } else parts.push(part);
    });
    request.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    request.on("error", reject);
  });
}

// Only this site's own pages may post here. A browser always sends Origin on a form
// post, and another site can't forge it.
function fromThisSite(request) {
  const host = request.headers["x-forwarded-host"] ?? request.headers.host;
  try {
    return new URL(request.headers.origin).host === host;
  } catch {
    return false;
  }
}

// One owner failing shows on its own part of the page and doesn't stop the others.
const attempt = async (read) => {
  try {
    return { value: await read() };
  } catch (error) {
    return { error: error.message };
  }
};

// The state changes, each with what it changed. A commit never changes, so its state
// file is kept for good, as the app keeps nothing else.
export function stateHistory(github) {
  const atCommit = new Map();
  const stateAt = (owner, sha) => {
    const key = `${owner.name}@${sha}`;
    if (!atCommit.has(key)) {
      atCommit.set(key, github.state(owner, sha).catch((error) => {
        atCommit.delete(key);
        throw error;
      }));
    }
    return atCommit.get(key);
  };
  return async (owner) => {
    const commits = await github.commits(owner);
    const states = await Promise.all(commits.map((c) => stateAt(owner, c.sha)));
    return commits.map((c, i) => ({ ...c, changes: changes(states[i + 1] ?? null, states[i]) }));
  };
}

export function handler({ owners, team, operators = [], github, storage, save }) {
  const latest = cached((name) => storage.latest(owners.find((o) => o.name === name)));
  const state = cached((name) => github.stateFile(owners.find((o) => o.name === name)));
  const visible = cached((name) => github.repositories(owners.find((o) => o.name === name)));
  const history = stateHistory(github);
  const log = cached((name) => storage.log(owners.find((o) => o.name === name)));
  const stateCommits = cached((name) => history(owners.find((o) => o.name === name)));

  async function change(request, who, owner, makeState) {
    const form = new URLSearchParams(await readBody(request));
    const note = noteFrom(form);
    const sha = shaFrom(form);
    state.forget(owner.name);
    const current = await state(owner.name);
    const answer = await save.save(owner, { state: await makeState(form, current), sha, note, who });
    state.forget(owner.name);
    stateCommits.forget(owner.name);
    return answer;
  }

  function answerPage(answer, who) {
    if (answer.status === "nothing to change") return [200, resultPage(who, "Nothing to change", "The state already says this.")];
    if (answer.status === "stale") {
      return [409, resultPage(who, "It changed while you were looking", "Someone changed this state first, so nothing was saved. Look at it again, and make your change there.")];
    }
    if (answer.autoMerge === "on" || answer.autoMerge === "merged") {
      return [200, resultPage(who, "Saved", answer.autoMerge === "merged" ? "It has merged." : "It merges by itself once its check passes.", answer.url)];
    }
    return [200, resultPage(who, "Opened, but it won't merge by itself", `GitHub said: ${answer.autoMerge}. Merge it there.`, answer.url)];
  }

  const each = (reads) => Promise.all(owners.map(async (owner) => {
    const out = { owner };
    await Promise.all(Object.entries(reads).map(async ([key, read]) => {
      out[key] = await attempt(() => read(owner.name));
    }));
    return out;
  }));

  return async (request, response) => {
    const send = (status, body, type = "text/html; charset=utf-8") => {
      response.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(body);
    };
    const path = request.url.split("?")[0];
    if (path === "/healthz") return send(200, "ok\n", "text/plain");

    const who = String(request.headers["x-forwarded-email"] ?? "").trim().toLowerCase();
    if (!team.includes(who)) return send(403, refusedPage(who));
    const canEdit = Boolean(save) && operators.includes(who);

    if (request.method === "POST") {
      const route = path.match(/^\/state\/([^/]+)(?:\/revert\/([0-9a-f]{40}))?$/);
      const owner = route && owners.find((o) => o.name === route[1]);
      if (!owner) return send(404, "Not found.\n", "text/plain");
      if (!canEdit || !owner.writerInstallation) return send(403, resultPage(who, "Not allowed", "Only an operator can change the state."));
      if (!fromThisSite(request)) return send(403, resultPage(who, "Not allowed", "That form didn't come from this site."));
      try {
        const makeState = route[2]
          ? async () => github.state(owner, route[2])
          : async (form, current) => stateFrom(form, current.state, await visible(owner.name));
        return send(...answerPage(await change(request, who, owner, makeState), who));
      } catch (error) {
        if (error instanceof FormError) return send(400, resultPage(who, "That didn't save", error.message));
        console.error(error);
        return send(502, resultPage(who, "That didn't save", `Something went wrong: ${error.message}`));
      }
    }
    if (request.method !== "GET" && request.method !== "HEAD") return send(405, "Not here.\n", "text/plain");

    if (path === "/") return send(200, boardPage(await each({ result: latest }), who));
    if (path === "/state") return send(200, statePage(await each({ result: state, ...(canEdit ? { visible } : {}) }), who, canEdit));
    if (path === "/history") return send(200, historyPage(await each({ commits: stateCommits, log, ...(canEdit ? { result: state } : {}) }), who, canEdit));
    return send(404, "Not found.\n", "text/plain");
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const config = configFrom(process.env);
  const save = config.writerId && config.writerKey ? writer(config) : null;
  const handle = handler({ owners: config.owners, team: config.team, operators: config.operators, github: reader(config), storage: boards(config), save });
  createServer((request, response) => {
    handle(request, response).catch((error) => {
      console.error(error);
      if (!response.headersSent) response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("Something went wrong.\n");
    });
  }).listen(config.port, () => console.log(`listening on ${config.port}`));
}
