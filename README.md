# release-controlplane

The software that runs the release control plane. The roles of each repository
live in the state repositories, `Sustenaut/release-state` and
`schryer/release-state`; board snapshots live in storage. See the
[design](https://claude.ai/artifact/KGAd5vKckHCWbrKQCKMhSV).

## Sending the apps' secrets to GitHub

`scripts/push-secrets.sh` sends the two apps' ids and keys from Bitwarden to
GitHub, as [`secrets.json`](secrets.json) says:

```sh
./with-secrets scripts/push-secrets.sh --check   # checks only, sends nothing
./with-secrets scripts/push-secrets.sh
```

`./with-secrets` reads the `Sustenaut` Bitwarden Secrets Manager project. It
needs that project's read-only machine token, as `BWS_ACCESS_TOKEN` or a line in
this checkout's gitignored `.env`.

The script checks that every name is in the project, then that every value has
content of the right kind, and uploads only when all of them pass. It prints
names and lengths, never a value. Run it again whenever a key is rotated.
`gh` must be signed in as someone who administers the repositories.

| Bitwarden name | On GitHub | Where |
|---|---|---|
| `github-release-reader-id` | variable `RELEASE_READER_APP_ID` | both state repositories, this one |
| `github-release-reader-key` | secret `RELEASE_READER_APP_KEY` | both state repositories, this one |
| `github-release-reader-installation-id` | variable `RELEASE_READER_INSTALLATION_ID_SUSTENAUT` | `Sustenaut/release-state`, this one |
| `github-release-reader-installation-id-schryer` (optional) | variable `RELEASE_READER_INSTALLATION_ID_SCHRYER` | `schryer/release-state`, this one |
| `github-release-writer-id` | variable `RELEASE_STATE_WRITER_APP_ID` | this one's `server` environment |
| `github-release-writer-key` | secret `RELEASE_STATE_WRITER_APP_KEY` | this one's `server` environment |
| `github-release-writer-installation-id` | variable `RELEASE_STATE_WRITER_INSTALLATION_ID_SUSTENAUT` | this one's `server` environment |
| `github-release-writer-installation-id-schryer` (optional) | variable `RELEASE_STATE_WRITER_INSTALLATION_ID_SCHRYER` | this one's `server` environment |

Workflows don't need the installation ids: `actions/create-github-app-token`
finds the installation from the owner. The optional names are reported when
missing, and skipped.

The reader only reads, so its key can sit with the workflows that use it. The
state writer can change the state repositories, so its secrets are only in the
`server` environment, which only `main` may use: a pull request's workflow can't
read them. The script makes that environment.

## Working on it

```sh
make functional
```
