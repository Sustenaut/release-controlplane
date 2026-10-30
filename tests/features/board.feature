Feature: The hourly board is kept in storage only when something changed
  scripts/publish-board.py compares a new board with the one the head names,
  ignoring when it was read, and uploads it and moves the head only if a fact or a
  grade differs. These run it against a fake storage service.

  Scenario: The first board is uploaded, and the head's first move says so
    Given storage has no board for "release-sustenaut"
    When I publish a board for "Sustenaut"
    Then it succeeds
    And it uploaded 1 file to "release-sustenaut"
    And the head moved with "If-None-Match: *"
    And it signed in with the job's token for "storage.sustenaut.eu"

  Scenario: A board that only differs in when it was read uploads nothing
    Given storage's board for "release-sustenaut" has the grade "A"
    When I publish a board for "Sustenaut" with the grade "A", read later
    Then it succeeds
    And it prints "nothing changed"
    And it uploaded 0 files to "release-sustenaut"
    And the head did not move

  Scenario: A changed grade is uploaded, and the move names the old hash
    Given storage's board for "release-sustenaut" has the grade "A"
    When I publish a board for "Sustenaut" with the grade "B", read later
    Then it succeeds
    And it uploaded 1 file to "release-sustenaut"
    And the head moved with If-Match on the old hash

  Scenario: Another move first fails the run, and overwrites nothing
    Given storage's board for "release-sustenaut" has the grade "A"
    And another writer moves the head first
    When I publish a board for "Sustenaut" with the grade "B", read later
    Then it fails
    And stderr mentions "storage said 412"

  Scenario: Each owner has its own tenant, in lower case
    Given storage has no board for "release-schryer"
    When I publish a board for "schryer"
    Then it uploaded 1 file to "release-schryer"

  Scenario: Storage refusing the read stops it before any upload
    Given storage refuses to read the head with 403
    When I publish a board for "Sustenaut"
    Then it fails
    And stderr mentions "storage said 403"
    And it uploaded 0 files to "release-sustenaut"

  Scenario: Nothing printed names a repository or the token
    Given storage has no board for "release-sustenaut"
    When I publish a board for "Sustenaut"
    Then its output names no repository and no token

  Scenario Outline: A state file becomes the repos file for a role
    Given a state file for "example-org"
    When I turn it into the repos file for "<role>"
    Then it lists "<repos>"

    Examples:
      | role   | repos                                |
      | board  | example-org/one, example-org/two     |
      | govern | example-org/two, example-org/three   |

  Scenario: The repos file keeps each repository's roles and project
    Given a state file for "example-org"
    When I turn it into the repos file for "board"
    Then "example-org/one" has the project "tools", protect on and govern off
    And "example-org/two" has no project

  Scenario: The workflows stay quiet, and use the reader app
    When I read the hourly board workflow
    Then it sends pubkit board's output nowhere, and uploads no artifact
    And its token comes from the reader app
    And it may ask for an OpenID Connect token
