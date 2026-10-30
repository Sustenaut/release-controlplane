Feature: push-secrets sends the apps' ids and keys to GitHub, or nothing at all
  scripts/push-secrets.sh reads secrets.json. It checks every name, then every
  value, and uploads only when all of them pass. It never prints a value, and
  never puts one on a command line. These run it against a fake gh.

  Scenario: Everything present is checked, then sent where secrets.json says
    Given every secret is in Bitwarden
    When I run push-secrets
    Then it succeeds
    And it prints "Done: 8 values sent."
    And gh set the secret "RELEASE_READER_APP_KEY" in "schryer/release-state"
    And gh set the variable "RELEASE_READER_APP_ID" in "Sustenaut/release-controlplane"
    And gh set the variable "RELEASE_READER_INSTALLATION_ID_SCHRYER" in "schryer/release-state"
    And gh set the secret "RELEASE_STATE_WRITER_APP_KEY" in "Sustenaut/release-controlplane" for the environment "server"
    And gh did not set "RELEASE_STATE_WRITER_APP_KEY" outside an environment
    And the environment "server" of "Sustenaut/release-controlplane" takes only "main"
    And no value is printed or on any command line

  Scenario: --check stops before any upload
    Given every secret is in Bitwarden
    When I run push-secrets with "--check"
    Then it succeeds
    And it prints "--check: nothing was uploaded."
    And gh was not called

  Scenario: A missing name stops everything, and all of them are listed
    Given every secret is in Bitwarden
    But "github-release-reader-key" and "github-release-writer-id" are not
    When I run push-secrets
    Then it fails
    And it prints "MISSING  github-release-reader-key"
    And it prints "MISSING  github-release-writer-id"
    And it prints "found    github-release-reader-id"
    And gh was not called

  Scenario Outline: A value that is wrong stops everything, without showing it
    Given every secret is in Bitwarden
    But "<name>" holds "<value>"
    When I run push-secrets
    Then it fails
    And it prints "BAD      <name> <says>"
    And gh was not called
    And "<value>" is not printed

    Examples:
      | name                                   | value          | says              |
      | github-release-reader-id               | abc-not-digits | is not an id      |
      | github-release-reader-installation-id | 12x            | is not an id      |
      | github-release-reader-key              | notakeyatall   | is not a private key |

  Scenario: An empty value stops everything
    Given every secret is in Bitwarden
    But "github-release-reader-id" is empty
    When I run push-secrets
    Then it fails
    And it prints "BAD      github-release-reader-id is empty"
    And gh was not called

  Scenario: An upload that fails is reported, and the rest still go
    Given every secret is in Bitwarden
    And gh refuses "RELEASE_READER_APP_ID"
    When I run push-secrets
    Then it fails
    And stderr mentions "FAILED   github-release-reader-id"
    And gh set the secret "RELEASE_READER_APP_KEY" in "schryer/release-state"

  Scenario: schryer's installation ids may be missing, and are said to be
    Given every secret is in Bitwarden
    But "github-release-reader-installation-id-schryer" and "github-release-writer-installation-id-schryer" are not
    When I run push-secrets
    Then it succeeds
    And it prints "missing  github-release-reader-installation-id-schryer (optional: it will be skipped)"
    And it prints "Done: 6 values sent."
    And gh did not set "RELEASE_READER_INSTALLATION_ID_SCHRYER" anywhere
    And gh set the variable "RELEASE_READER_INSTALLATION_ID_SUSTENAUT" in "Sustenaut/release-state"

  Scenario: An optional name that is there but empty still stops everything
    Given every secret is in Bitwarden
    But "github-release-reader-installation-id-schryer" is empty
    When I run push-secrets
    Then it fails
    And gh was not called

  Scenario: The environment's branch is added once
    Given every secret is in Bitwarden
    And the environment already takes "main"
    When I run push-secrets
    Then it succeeds
    And gh did not add a branch to the environment

  Scenario: Anything but --check is refused
    When I run push-secrets with "--force"
    Then the exit code is 2

  Scenario: secrets.json sends each key by secret and each id by variable
    When I read secrets.json
    Then every key goes as a secret and every id as a variable
    And the state writer goes only to an environment
