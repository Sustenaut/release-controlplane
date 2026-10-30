# release-controlplane

The software that runs the release control plane. The roles of each repository
live in the state repositories, `Sustenaut/release-state` and
`schryer/release-state`; board snapshots live in storage. See the
[design](https://claude.ai/artifact/KGAd5vKckHCWbrKQCKMhSV).

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
