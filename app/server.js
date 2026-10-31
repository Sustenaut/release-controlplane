// The release control plane's app: one owner's board, state and history, and for its
// operators, changing the state. A deployment is for one owner; another owner runs its
// own, with its own settings, sign-in and storage, so neither can see the other. oauth2-proxy signs people in and
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

// What couldn't be read shows on the page, rather than failing it.
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

export function handler({ owner, team, operators = [], github, storage, save }) {
  const latest = cached(() => storage.latest(owner));
  const state = cached(() => github.stateFile(owner));
  const visible = cached(() => github.repositories(owner));
  const history = stateHistory(github);
  const log = cached(() => storage.log(owner));
  const stateCommits = cached(() => history(owner));

  async function change(request, who, makeState) {
    const form = new URLSearchParams(await readBody(request));
    const note = noteFrom(form);
    const sha = shaFrom(form);
    state.forget();
    const current = await state();
    const answer = await save.save(owner, { state: await makeState(form, current), sha, note, who });
    state.forget();
    stateCommits.forget();
    return answer;
  }

  function answerPage(answer, who) {
    if (answer.status === "nothing to change") return [200, resultPage(who, "Nothing to change", "The state already says this.", null, owner)];
    if (answer.status === "stale") {
      return [409, resultPage(who, "It changed while you were looking", "Someone changed this state first, so nothing was saved. Look at it again, and make your change there.", null, owner)];
    }
    if (answer.autoMerge === "on" || answer.autoMerge === "merged") {
      return [200, resultPage(who, "Saved", answer.autoMerge === "merged" ? "It has merged." : "It merges by itself once its check passes.", answer.url, owner)];
    }
    return [200, resultPage(who, "Opened, but it won't merge by itself", `GitHub said: ${answer.autoMerge}. Merge it there.`, answer.url, owner)];
  }

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
    if (!team.includes(who)) return send(403, refusedPage(who, owner));
    const canEdit = Boolean(save) && Boolean(owner.writerInstallation) && operators.includes(who);

    if (request.method === "POST") {
      const route = path.match(/^\/state(?:\/revert\/([0-9a-f]{40}))?$/);
      if (!route) return send(404, "Not found.\n", "text/plain");
      if (!canEdit) return send(403, resultPage(who, "Not allowed", "Only an operator can change the state.", null, owner));
      if (!fromThisSite(request)) return send(403, resultPage(who, "Not allowed", "That form didn't come from this site.", null, owner));
      try {
        const makeState = route[1]
          ? async () => github.state(owner, route[1])
          : async (form, current) => stateFrom(form, current.state, await visible());
        return send(...answerPage(await change(request, who, makeState), who));
      } catch (error) {
        if (error instanceof FormError) return send(400, resultPage(who, "That didn't save", error.message, null, owner));
        console.error(error);
        return send(502, resultPage(who, "That didn't save", `Something went wrong: ${error.message}`, null, owner));
      }
    }
    if (request.method !== "GET" && request.method !== "HEAD") return send(405, "Not here.\n", "text/plain");

    const read = async (reads) => {
      const out = { owner };
      await Promise.all(Object.entries(reads).map(async ([key, get]) => {
        out[key] = await attempt(() => get());
      }));
      return out;
    };
    if (path === "/") return send(200, boardPage(await read({ result: latest }), who));
    if (path === "/state") return send(200, statePage(await read({ result: state, ...(canEdit ? { visible } : {}) }), who, canEdit));
    if (path === "/history") return send(200, historyPage(await read({ commits: stateCommits, log, ...(canEdit ? { result: state } : {}) }), who, canEdit));
    return send(404, "Not found.\n", "text/plain");
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const config = configFrom(process.env);
  const save = config.writerId && config.writerKey ? writer(config) : null;
  const handle = handler({ owner: config.owner, team: config.team, operators: config.operators, github: reader(config), storage: boards(config), save });
  createServer((request, response) => {
    handle(request, response).catch((error) => {
      console.error(error);
      if (!response.headersSent) response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("Something went wrong.\n");
    });
  }).listen(config.port, () => console.log(`listening on ${config.port}`));
}
