// The release control plane's app: the board, the state and its history, for each
// owner. It only reads. oauth2-proxy signs people in and hands over their verified
// email in X-Forwarded-Email; nothing else can reach this port (k8s network policy),
// and the team list here is a second check, so a mistake there fails closed.

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { configFrom } from "./config.js";
import { reader } from "./github.js";
import { boards } from "./storage.js";
import { changes } from "./history.js";
import { boardPage, historyPage, refusedPage, statePage } from "./render.js";

const FRESH_MS = 60_000;

// What was read a moment ago. A failure isn't kept, so the next request tries again.
export function cached(read, now = Date.now, freshFor = FRESH_MS) {
  const held = new Map();
  return async (key) => {
    const found = held.get(key);
    if (found && now() - found.at < freshFor) return found.value;
    const value = await read(key);
    held.set(key, { at: now(), value });
    return value;
  };
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

export function handler({ owners, team, github, storage }) {
  const latest = cached((name) => storage.latest(owners.find((o) => o.name === name)));
  const state = cached((name) => github.state(owners.find((o) => o.name === name)));
  const history = stateHistory(github);
  const log = cached((name) => storage.log(owners.find((o) => o.name === name)));
  const stateCommits = cached((name) => history(owners.find((o) => o.name === name)));

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
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(body);
    };
    const path = new URL(request.url, "http://app").pathname;
    if (path === "/healthz") return send(200, "ok\n", "text/plain");

    const who = String(request.headers["x-forwarded-email"] ?? "").trim().toLowerCase();
    if (!team.includes(who)) return send(403, refusedPage(who));
    if (request.method !== "GET" && request.method !== "HEAD") return send(405, "Only reading here.\n", "text/plain");

    if (path === "/") return send(200, boardPage(await each({ result: latest }), who));
    if (path === "/state") return send(200, statePage(await each({ result: state }), who));
    if (path === "/history") return send(200, historyPage(await each({ commits: stateCommits, log }), who));
    return send(404, "Not found.\n", "text/plain");
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const config = configFrom(process.env);
  const handle = handler({ owners: config.owners, team: config.team, github: reader(config), storage: boards(config) });
  createServer((request, response) => {
    handle(request, response).catch((error) => {
      console.error(error);
      if (!response.headersSent) response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("Something went wrong.\n");
    });
  }).listen(config.port, () => console.log(`listening on ${config.port}`));
}
