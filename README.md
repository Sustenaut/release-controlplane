# release-controlplane

The software that runs the release control plane. The roles of each repository
live in the state repository, `Sustenaut/release-state`; board snapshots live in storage.
`k8s-schryer/` deploys the same app for schryer, whose own board, state and apps are in
`schryer/release-controlplane` and `schryer/release-state`. See the
[design](https://claude.ai/artifact/KGAd5vKckHCWbrKQCKMhSV).

## The app

`app/` is a small Node server with no build step, for the team to read: one owner's board, its state, and the history of both. Its pages are plain HTML with no scripts.

A repository's project is a label that groups it on the board. An operator picks it
from a list of the labels in use, or adds one with "New label". It changes nothing
else.

An operator changes the state on the state page, or goes back to an earlier one on
the history page. Where the board says secret scanning or push protection is off, its
security breakdown offers a "Turn on" button if the repository's protect is off, and
otherwise says the next apply will do it. Nothing here turns them off. Each change needs a note, and becomes a pull request on the
state repository that merges itself once `state / valid` passes, naming who asked. If
the state has changed since the page was loaded, nothing is saved and it says to look
again.

It trusts the email and access token oauth2-proxy puts in `X-Forwarded-Email` and
`X-Forwarded-Access-Token`, so nothing but the proxy may reach it.

Who may use it is kept on auth's [access page](https://auth.sustenaut.eu/realms/team/access):
the `release` role may read, and a `controller` may change the state as well. On each
request the app compares auth's hash of that list, kept 2 seconds, and asks for the
person's roles again if it changed or after 5 minutes, so a role taken away counts at
their next request. With no requests it asks nothing. If auth can't be reached, people
it already vouched for keep reading, and changes are refused. **A deployment is for one owner.** Another owner
runs its own, from the same image, with its own settings, sign-in, secrets and storage
tenant, so neither can see the other.

| Setting | What |
|---|---|
| `RELEASE_OWNER` | The GitHub owner this deployment is for. Its state repository is `<owner>/release-state`, and its storage tenant `release-<owner>`. |
| `RELEASE_READER_APP_INSTALLATION_ID` | The reader app's installation on that owner |
| `RELEASE_READER_APP_ID`, `RELEASE_READER_APP_KEY` | The reader app, which reads `<owner>/release-state` |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | The sign-in client, which alone may read its hash of the access list |
| `ALLOWED_EMAILS` | Instead of those, for a realm with no access page: the addresses that may read and change the state, separated by commas |
| `STORAGE_TOKEN_FILE` | The pod's projected token for storage, read on each request |
| `RELEASE_STATE_WRITER_APP_ID`, `RELEASE_STATE_WRITER_APP_KEY`, `RELEASE_STATE_WRITER_INSTALLATION_ID` | The state writer app, which may write only to the state repository. Without them, the app only reads. |
| `RELEASE_BOARD_WORKFLOW` | Optional: `owner/repository/file` of the public workflow that makes the board, for the board's "Last checked" |
| `AUTH_REALM_URL`, `STORAGE_URL`, `PORT` | Optional: `https://auth.sustenaut.eu/realms/team`, `https://storage.sustenaut.eu` and `8080` |

## What runs

- **`hourly-board.yml`**, each hour: reads Sustenaut's `state.json` with the
  reader app, grades what it puts on the board with `pubfleet board`, and keeps
  `board.json` in the storage tenant `release-<owner>` if a fact or a grade changed
  (`pubfleet board-publish`), moving the `board` head. This repository is public
  and a state file may name private repositories, so this workflow's logs print no
  repository's name and it uploads no artifact.
- **`fleet-nightly.yml`**, each night: pubfleet's reusable nightly on
  what its `state.json` governs. It needs the nightly app's `NIGHTLY_APP_ID` variable
  and `NIGHTLY_APP_KEY` secret, and the secrets `SUSTENAUT_SLACK_BOT_TOKEN` and
  `SLACK_DM_USER_ID`, here. Its `variables` job runs `pubfleet variables --check` on
  `state.json`, as the reader app, and sends the operator a direct message saying what
  differs when a repository's GitHub variables aren't what the state gives them, as after
  a change by hand. It puts nothing back, and its log says only whether they differ.
  Its `pubkit` job runs `bin/pubkit-report` on `state.json`, as the reader app: each
  repository on the board that pins an older pubkit than its latest release, or whose
  main fails `pubkit sync --check`, gets a line in a direct message saying what to run
  (`git latest && ./pubkit bump`, or `./pubkit sync`, then a pull request; a governed
  one waits for its nightly update PR). Its log and summary give only how many.

## Its calls

The app reads storage (the board and its log) with integrations' generated storage
client, and the board workflow's last run from GitHub as `github.board-read`, both through
one `Caller` from [integrations](https://github.com/Sustenaut/integrations)
(`@sustenaut/integrations`, pinned to a release tag in `package.json`): each call has its
class's timeout and retries and leaves a record. The records go to the call log
(`app/calls.js`): every two minutes an Avro file, written with the pod's storage token
into the buffer `calls-release-controlplane`, which integrations' ingest loads into the
BigQuery dataset `calls_release_controlplane`.
pubpr makes its own calls to GitHub.

## The reader app's values

This repository's `pubkit.json` names the reader app's three values in Bitwarden
and on GitHub, in its `github_app` block. `pubsec app-secrets` sends them here:

```sh
./with-secrets ./pubsec app-secrets --check   # checks only, sends nothing
./with-secrets ./pubsec app-secrets
```

`./with-secrets` reads the `Sustenaut` Bitwarden Secrets Manager project. It needs
that project's read-only machine token, as `BWS_ACCESS_TOKEN` or a line in this
checkout's gitignored `.env`.

## Deploying

`.github/workflows/deploy.yml` builds the image on each merge to main, once CI has
passed, and applies `k8s/` to namespace `release` with pubkit's `k8s-deploy.yml`, once
`DEPLOY_RELEASE` is `on`, and `k8s-schryer/` to `release-schryer`, once `DEPLOY_SCHRYER`
is `on`.

pubkit.json's `deploy` block lists everything else the two deployments need: its top
level is the unit `release` (release.sustenaut.eu), and `units` adds `release-schryer`
(release.schryer.eu). pubkit's deploy walk checks each need and makes what it can. To
take Sustenaut's deployment live, or bring it back in step, from a checkout of this
repository with Sustenaut/shared-infra and Sustenaut/auth checked out beside it, on a
machine on the admin tailnet, signed in to `gh`:

```sh
./with-secrets ./pubdeploy walk --fulfil --unit release --server sustenaut --zones ../shared-infra/pubkit.json
```

schryer.eu's zone is kept in schryer/schryer-eu-infra, so schryer's unit is walked with
that checkout beside this one:

```sh
./with-secrets ./pubdeploy walk --unit release-schryer --server sustenaut --zones ../schryer-eu-infra/pubkit.json
```

It checks every need, prints the plan, and waits for a typed `yes`; then it makes each
missing need it can, over the admin channel (`ssh root@sustenaut`), and checks it again.
Every run can run again: what is ready is left alone. For the unit `release`, in order:

| Need | What the walk does |
|---|---|
| the namespace `release` | the server's `sustenaut-app`, which makes it and its deploy identity |
| `bitwarden.generated` `release-cookie-secret` | oauth2-proxy's cookie secret: a new one of its shape, written to Bitwarden, when it is missing or misshapen |
| the Secret `release-secrets` | made from the reader and state writer apps' six values in Bitwarden (`github-release-reader-id`, `-key`, `-installation-id` and `github-release-writer-id`, `-key`, `-installation-id`) and the cookie secret; the app and oauth2-proxy restarted |
| `auth.sign-in-client` | sustenaut.eu's team-site client in the team realm, role `release`: the approval record written into shared-infra's `infra/auth-approvals.json` when auth.sustenaut.eu wants one, and once the client is issued, the Secret `release-oidc` made from it on the server |
| `k8s.manifests` | `k8s/admin/network-policy.yaml` applied: only oauth2-proxy's pods may reach the app |
| the repository's secrets and variables | the reader and nightly apps' values and the Slack secrets, from Bitwarden, as `pubsec app-secrets` sends them |
| `DEPLOY_RELEASE` and the rollout | the gate on, once everything before it is ready, and `deploy.yml` run and waited for |
| `service.health` | `https://release.sustenaut.eu/healthz` answers |

A new cookie secret wants a Bitwarden token that may write: the walk asks for it once, at
a hidden prompt, and keeps it only in its process. An approval record is a change to
shared-infra: commit it there, merge, apply, and run the walk again.

Some needs it only checks, and says what a person does:

- **The six app values in Bitwarden**: made when the apps are (each app's own steps).
- **storage's tenants** in Sustenaut/storage's `tenants.json`: `release-sustenaut`
  (the board, which `k8s:release/app` reads and this repository's main writes) and
  `calls-release-controlplane` (the call log buffer, which both deployments' apps
  write). When one is missing, the fix is the entry to add there.
- **Its entries in other services' variables**: `release-controlplane` in integrations'
  `INGEST_DATASETS`, and `release_controlplane.app` in observability's
  `OBSERVABILITY_SENDERS`.
- **The DNS record** for `release.sustenaut.eu`, in shared-infra's hosting block.
- **storage itself** (`upstream`).

The unit `release-schryer` is schryer's: its values are in schryer's own Bitwarden
project and its sign-in client is kept on the photos server, so
schryer/release-controlplane's `push-secrets.sh` and `register-client.sh` put in its
Secrets `release-secrets` and `release-oidc` and its network policy. This repository's
walk only checks that they are there with the keys the manifests read, along with
storage's tenant `release-schryer`, the shared needs above, and `DEPLOY_SCHRYER`.

`./pubdeploy walk` without `--fulfil` (or `pubdeploy check`) changes nothing, and
`./pubdeploy walk --offline` checks only the files. `.github/workflows/deploy-check.yml`
walks both units every 30 minutes, read-only, with the deploy key, and writes the walk to
storage's `plane` tenant; it fails when a need is missing, drift or blocked.
