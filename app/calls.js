// Every call this app makes itself, to storage or to GitHub, goes through one Caller
// (integrations' caller.js): the operation's class sets its timeout and retries, and each
// call leaves a record. pubpr makes its own calls and isn't routed here.
//
// The records go to stdout as JSON lines for now, beside the app's log. To send them to
// the call log instead, the app needs its own buffer tenant in storage and a BigQuery
// dataset that ingest loads it into; then this sink becomes caller.js's StorageSink.

import { Caller } from "@sustenaut/integrations/caller.js";

export const REPO = "release-controlplane";

export const stdoutSink = { write: (record) => console.log(JSON.stringify(record)) };

export function caller(options = {}) {
  return new Caller(REPO, "web", { sink: stdoutSink, ...options });
}
