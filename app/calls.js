// Every call this app makes itself, to storage or to GitHub, goes through one Caller
// (integrations' caller.js): the operation's class sets its timeout and retries, and each
// call leaves a record. pubpr makes its own calls and isn't routed here.
//
// The records go to the call log: an Avro file every two minutes, even an idle one, in
// the storage buffer calls-release-controlplane, which both owners' deployments write
// with the pod's storage token and integrations' ingest loads into BigQuery
// (calls_release_controlplane). Writing a record never fails or waits on storage.

import { Caller, StorageSink } from "@sustenaut/integrations/caller.js";

export const REPO = "release-controlplane";
export const DATASET = "calls_release_controlplane";

// The process's sink, sending on its own timer; the sender is the pod.
export function callLog({ storageUrl, storageTokenFile }, { sender = process.env.HOSTNAME || REPO, ...options } = {}) {
  return new StorageSink({ [REPO]: DATASET }, { sender, url: storageUrl, tokenFile: storageTokenFile, start: true, flushOnWrite: false, ...options });
}

// Without a sink, as in the tests, the records are kept nowhere.
export function caller(options = {}) {
  return new Caller(REPO, "web", options);
}
