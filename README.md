# release-controlplane

The software that runs the release control plane. The roles of each repository
live in the state repositories, `Sustenaut/release-state` and
`schryer/release-state`; board snapshots live in storage. See the
[design](https://claude.ai/artifact/KGAd5vKckHCWbrKQCKMhSV).

## The app

`app/` is a small Node server with no build step, for the team to read: one owner's board, its state, and the history of both. Its pages are plain HTML with no scripts.

An operator changes the state on the state page, or goes back to an earlier one on
the history page. Each change needs a note, and becomes a pull request on the
state repository that merges itself once `state / valid` passes, naming who asked. If
the state has changed since the page was loaded, nothing is saved and it says to look
again.

It trusts the email oauth2-proxy puts in `X-Forwarded-Email`, so nothing but the
proxy may reach it.

It checks that email against `TEAM`. **A deployment is for one owner.** Another owner
runs its own, from the same image, with its own settings, sign-in, secrets and storage
tenant, so neither can see the other.

| Setting | What |
|---|---|
| `RELEASE_OWNER` | The GitHub owner this deployment is for. Its state repository is `<owner>/release-state`, and its storage tenant `release-<owner>`. |
| `RELEASE_READER_APP_INSTALLATION_ID` | The reader app's installation on that owner |
| `TEAM` | The email addresses that may read it, separated by commas |
| `RELEASE_READER_APP_ID`, `RELEASE_READER_APP_KEY` | The reader app, which reads `<owner>/release-state` |
| `STORAGE_TOKEN_FILE` | The pod's projected token for storage, read on each request |
| `OPERATORS` | The team's addresses that may change the state, separated by commas. Without it, nobody can. |
| `RELEASE_STATE_WRITER_APP_ID`, `RELEASE_STATE_WRITER_APP_KEY`, `RELEASE_STATE_WRITER_INSTALLATION_ID` | The state writer app, which may write only to the state repository. Without them, the app only reads. |
| `STORAGE_URL`, `PORT` | Optional: `https://storage.sustenaut.eu` and `8080` |

## What runs

- **`hourly-board.yml`**, each hour for each owner: reads its `state.json` with the
  reader app, grades what it puts on the board with `pubkit board`, and keeps
  `board.json` in the storage tenant `release-<owner>` if a fact or a grade changed
  (`scripts/publish-board.py`), moving the `board` head. This repository is public
  and a state file may name private repositories, so this workflow's logs print no
  repository's name and it uploads no artifact.
- **`fleet-nightly.yml`**, each night for each owner: pubkit's reusable nightly on
  what its `state.json` governs. It needs the nightly app's `NIGHTLY_APP_ID` variable
  and `NIGHTLY_APP_KEY` secret, and the secrets `SUSTENAUT_SLACK_BOT_TOKEN` and
  `SLACK_DM_USER_ID`, here.

## The reader app's values

This repository's `pubkit.json` names the reader app's three values in Bitwarden
and on GitHub, in its `github_app` block. `pubkit app-secrets` sends them here:

```sh
./with-secrets ./pubkit app-secrets --check   # checks only, sends nothing
./with-secrets ./pubkit app-secrets
```

`./with-secrets` reads the `Sustenaut` Bitwarden Secrets Manager project. It needs
that project's read-only machine token, as `BWS_ACCESS_TOKEN` or a line in this
checkout's gitignored `.env`.
