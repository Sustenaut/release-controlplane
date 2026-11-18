@edits
Feature: An operator changing the state, with the pull request written to memory
  The site is example-org's, which saves its state through pubtest's fake "writer"
  service: what the site asked to save is what that service was sent, and its answer is
  what GitHub answered. An access token is the list of roles it grants; an operator holds
  "controller" too.

  Background:
    Given a fake "writer" service
    And the site of "example-org", saving its state through the "writer" service
    And I am signed in as "op@x.org"
    And my access token is "release,controller"
    And requests come from this site

  Scenario: An operator's state page is a form, with the repositories not in the state in grey
    When I GET "/state"
    Then the answer includes "<form method=\"post\" action=\"/state\">"
    And the answer includes "name=\"base\" value=\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\""
    And the answer includes "name=\"good.govern\""
    And the answer shows "class=\"absent\"" before "unlisted"
    And the answer includes "name=\"note\" required"

  Scenario: Someone not an operator sees no form
    Given I am signed in as "reader@x.org"
    And my access token is "release"
    When I GET "/state"
    Then the answer does not include "<form"
    And the answer does not include "unlisted"

  Scenario: An owner with no writer has no form
    Given the owner has no writer
    When I GET "/state"
    Then the answer does not include "<form"

  Scenario: A site that can't save has no form
    Given the site can't save
    When I GET "/state"
    Then the answer does not include "<form"

  Scenario: A save opens a pull request with the new state, the note and who asked
    Given the "writer" service answers "POST /save" with 200 and:
      """
      {"status": "opened", "url": "https://github.com/x/pull/1", "autoMerge": "on"}
      """
    When I POST to "/state" with the form:
      | base          | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note          | Govern good |
      | repo          | good |
      | good.board    | on |
      | good.protect  | on |
      | good.govern   | on |
      | good.project  | tools |
      | repo          | bad |
      | bad.board     | on |
      | bad.protect   | on |
    Then the answer is 200
    And the answer includes "merges by itself"
    And the answer includes "github.com/x/pull/1"
    And the "writer" service was sent:
      """
      {"owner": "example-org", "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "note": "Govern good", "who": "op@x.org",
       "state": {"owner": "example-org", "repos": {
         "good": {"project": "tools", "board": true, "protect": true, "govern": true},
         "bad": {"board": true, "protect": true, "govern": false}}}}
      """

  Scenario Outline: What GitHub answered is said plainly
    Given the "writer" service answers "POST /save" with 200 and:
      """
      <answer>
      """
    When I POST to "/state" with the form:
      | base          | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note          | Govern good |
      | repo          | good |
      | good.board    | on |
      | good.protect  | on |
      | good.govern   | on |
      | good.project  | tools |
      | repo          | bad |
      | bad.board     | on |
      | bad.protect   | on |
    Then the answer is <status>
    And the answer includes "<words>"

    Examples:
      | answer                                                                                  | status | words                         |
      | {"status": "nothing to change"}                                                         | 200    | already says this             |
      | {"status": "stale", "path": "state.json", "url": "https://github.com/x/pull/1", "autoMerge": "on"} | 409    | changed while you were looking |
      | {"status": "opened", "url": "https://github.com/x/pull/1", "autoMerge": "merged"}        | 200    | It has merged                 |
      | {"status": "opened", "url": "https://github.com/x/pull/1", "autoMerge": "not allowed"}   | 200    | GitHub said: not allowed      |

  Scenario Outline: Only an operator may save
    Given I am signed in as "<who>"
    And my access token is "<roles>"
    When I POST to "/state" with the form:
      | base          | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note          | Govern good |
      | repo          | good |
      | good.board    | on |
      | good.protect  | on |
      | good.govern   | on |
      | good.project  | tools |
      | repo          | bad |
      | bad.board     | on |
      | bad.protect   | on |
    Then the answer is 403
    And the "writer" service was asked nothing

    Examples:
      | who            | roles       |
      | reader@x.org   | release     |
      | stranger@x.org | opportunity |

  Scenario: A save from another site is refused
    Given requests come from "https://evil.example"
    When I POST to "/state" with the form:
      | base          | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note          | Govern good |
      | repo          | good |
      | good.board    | on |
      | good.protect  | on |
      | good.govern   | on |
      | good.project  | tools |
      | repo          | bad |
      | bad.board     | on |
      | bad.protect   | on |
    Then the answer is 403
    And the "writer" service was asked nothing

  Scenario: A save from no site is refused
    Given requests come from nowhere
    When I POST to "/state" with the form:
      | base          | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note          | Govern good |
      | repo          | good |
      | good.board    | on |
      | good.protect  | on |
      | good.govern   | on |
      | good.project  | tools |
      | repo          | bad |
      | bad.board     | on |
      | bad.protect   | on |
    Then the answer is 403
    And the "writer" service was asked nothing

  Scenario: An owner with no writer can't save
    Given the owner has no writer
    When I POST to "/state" with the form:
      | base          | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note          | Govern good |
      | repo          | good |
      | good.board    | on |
      | good.protect  | on |
      | good.govern   | on |
      | good.project  | tools |
      | repo          | bad |
      | bad.board     | on |
      | bad.protect   | on |
    Then the answer is 403
    And the "writer" service was asked nothing

  Scenario: A site that can't save refuses a save
    Given the site can't save
    When I POST to "/state" with the form:
      | base          | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note          | Govern good |
      | repo          | good |
      | good.board    | on |
      | good.protect  | on |
      | good.govern   | on |
      | good.project  | tools |
      | repo          | bad |
      | bad.board     | on |
      | bad.protect   | on |
    Then the answer is 403
    And the "writer" service was asked nothing

  Scenario: A save to another page is not found
    When I POST to "/other" with the form:
      | base          | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note          | Govern good |
      | repo          | good |
      | good.board    | on |
      | good.protect  | on |
      | good.govern   | on |
      | good.project  | tools |
      | repo          | bad |
      | bad.board     | on |
      | bad.protect   | on |
    Then the answer is 404
    And the "writer" service was asked nothing

  Scenario: A form without a note says why, and saves nothing
    When I POST to "/state" with the form:
      | base | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
    Then the answer is 400
    And the answer includes "needs a note"
    And the "writer" service was asked nothing

  Scenario: A blank note says why, and saves nothing
    When I POST to "/state" with the form:
      | base | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note |     |
    Then the answer is 400
    And the answer includes "needs a note"
    And the "writer" service was asked nothing

  Scenario: A note too long says why, and saves nothing
    When I POST to "/state" with the form:
      | base | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note | xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx |
    Then the answer is 400
    And the answer includes "at most 200"
    And the "writer" service was asked nothing

  Scenario: A form not read from the state says why, and saves nothing
    When I POST to "/state" with the form:
      | note | n |
    Then the answer is 400
    And the answer includes "Reload the page"
    And the "writer" service was asked nothing

  Scenario: A form read from something else says why, and saves nothing
    When I POST to "/state" with the form:
      | base | nope |
      | note | n |
    Then the answer is 400
    And the answer includes "Reload the page"
    And the "writer" service was asked nothing

  Scenario: A repository the app can't see says why, and saves nothing
    When I POST to "/state" with the form:
      | base | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note | n |
      | repo | stranger |
    Then the answer is 400
    And the answer includes "isn&#39;t a repository"
    And the "writer" service was asked nothing

  Scenario: A project that isn't one of the labels says why, and saves nothing
    When I POST to "/state" with the form:
      | base | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note | n |
      | repo | good |
      | good.project | typo |
    Then the answer is 400
    And the answer includes "isn&#39;t one of the labels"
    And the "writer" service was asked nothing

  Scenario: A new label not given says why, and saves nothing
    When I POST to "/state" with the form:
      | base | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note | n |
      | repo | good |
      | good.project | __new__ |
    Then the answer is 400
    And the answer includes "none is given"
    And the "writer" service was asked nothing

  Scenario: A label not in lower case says why, and saves nothing
    When I POST to "/state" with the form:
      | base | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note | n |
      | new-label | Bad Label |
      | repo | good |
      | good.project | __new__ |
    Then the answer is 400
    And the answer includes "A label is lower case"
    And the "writer" service was asked nothing

  Scenario: A new label no repository takes says why, and saves nothing
    When I POST to "/state" with the form:
      | base | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note | n |
      | new-label | spare |
      | repo | good |
      | good.project | tools |
    Then the answer is 400
    And the answer includes "wouldn&#39;t be kept"
    And the "writer" service was asked nothing

  Scenario: A form too large is refused
    When I POST a form of 300 KB to "/state"
    Then the form is refused, by a 400 or by closing the connection
    And the "writer" service was asked nothing

  Scenario: A failure saving is said, not thrown
    Given the "writer" service answers "POST /save" with 500 and:
      """
      GitHub said 500
      """
    When I POST to "/state" with the form:
      | base          | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note          | Govern good |
      | repo          | good |
      | good.board    | on |
      | good.protect  | on |
      | good.govern   | on |
      | good.project  | tools |
      | repo          | bad |
      | bad.board     | on |
      | bad.protect   | on |
    Then the answer is 502
    And the answer includes "GitHub said 500"

  Scenario: A save reads the state afresh
    Given the "writer" service answers "POST /save" with 200 and:
      """
      {"status": "opened", "url": "https://github.com/x/pull/1", "autoMerge": "on"}
      """
    And I have looked at "/state"
    When I POST to "/state" with the form:
      | base          | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note          | Govern good |
      | repo          | good |
      | good.board    | on |
      | good.protect  | on |
      | good.govern   | on |
      | good.project  | tools |
      | repo          | bad |
      | bad.board     | on |
      | bad.protect   | on |
    Then "the state file" was called 2 times

  Scenario: After a save the state isn't the old one
    Given the "writer" service answers "POST /save" with 200 and:
      """
      {"status": "opened", "url": "https://github.com/x/pull/1", "autoMerge": "on"}
      """
    And I have looked at "/state"
    And I have saved a change to the state
    When I GET "/state"
    Then "the state file" was called 3 times

  Scenario: History offers going back to any but the newest
    When I GET "/history"
    Then the answer includes "/state/revert/cccccccccccccccccccccccccccccccccccccccc"
    And the answer does not include "/revert/dddddddddddddddddddddddddddddddddddddddd"

  Scenario: History offers a reader no going back
    Given I am signed in as "reader@x.org"
    And my access token is "release"
    When I GET "/history"
    Then the answer does not include "revert"

  Scenario: Reverting saves the old file
    Given the "writer" service answers "POST /save" with 200 and:
      """
      {"status": "opened", "url": "https://github.com/x/pull/1", "autoMerge": "on"}
      """
    When I POST to "/state/revert/cccccccccccccccccccccccccccccccccccccccc" with the form:
      | base | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note | Undo it |
    Then the answer is 200
    And the "writer" service was sent:
      """
      {"owner": "example-org", "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "note": "Undo it", "who": "op@x.org",
       "state": {"owner": "example-org", "repos": {"good": {"board": true, "protect": true, "govern": false}}}}
      """

  Scenario: The state page offers the labels in use, the current one chosen, and a new one
    When I GET "/state"
    Then the answer includes "<select name=\"good.project\" aria-label=\"good project\"><option value=\"\">None</option><option value=\"tools\" selected>tools</option><option value=\"__new__\">New label…"
    And the answer includes "<select name=\"bad.project\" aria-label=\"bad project\"><option value=\"\" selected>None"
    And the answer includes "<select name=\"unlisted.project\""
    And the answer includes "name=\"new-label\""

  Scenario: A new label goes to each repository set to it
    Given the form:
      | new-label    | shiny   |
      | repo         | good    |
      | good.board   | on      |
      | good.project | __new__ |
      | repo         | bad     |
      | bad.board    | on      |
      | bad.project  | __new__ |
    When the state is made from the form
    Then the result's "repos.good.project" is "shiny"
    And the result's "repos.bad.project" is "shiny"

  Scenario: A new label, once given, is one of the labels
    Given the form:
      | new-label    | shiny   |
      | repo         | good    |
      | good.board   | on      |
      | good.project | __new__ |
      | repo         | bad     |
      | bad.board    | on      |
      | bad.project  | __new__ |
    When the labels of the state made from the form are listed
    Then the result is:
      """
      ["shiny"]
      """

  Scenario: The labels are those in use
    When the labels of the state are listed
    Then the result is:
      """
      ["tools"]
      """

  Scenario: stateFrom keeps what the form doesn't name, adds on a role, and drops a project
    Given the form:
      | new-label    | pub     |
      | repo         | good    |
      | good.board   | on      |
      | repo         | unlisted |
      | repo         | more    |
      | more.govern  | on      |
      | more.project | __new__ |
    When the state is made from the form, with "good,bad,unlisted,more" visible
    Then the result is:
      """
      {"owner": "example-org", "repos": {
        "bad": {"board": true, "protect": true, "govern": false},
        "good": {"board": true, "protect": false, "govern": false},
        "more": {"project": "pub", "board": false, "protect": false, "govern": true}}}
      """

  Scenario: A repository in the state stays even with every role off
    Given the form:
      | repo | good |
    When the state is made from the form
    Then the result's "repos.good" is "{\"board\": false, \"protect\": false, \"govern\": false}"

  Scenario: A form without a note throws FormError
    Given an empty form
    When the note is read from the form
    Then the refusal is a FormError

  Scenario: A form with a bad sha throws FormError
    Given the form:
      | base | zz |
    When the sha is read from the form
    Then the refusal is a FormError

  Scenario: A note is one line
    Given the form:
      | note | a\nb |
    When the note is read from the form
    Then the result is "a b"

  Scenario: The file is stable: sorted, indented, ending in a newline
    Given the state:
      """
      {"owner": "o", "repos": {"b": {"board": true}, "a": {"board": false}}}
      """
    When the state's file is written
    Then the result is:
      """
      {
        "owner": "o",
        "repos": {
          "a": {
            "board": false
          },
          "b": {
            "board": true
          }
        }
      }

      """

  Scenario: The writer proposes one file, expecting what was read, merging itself, with its own token
    Given a fake "github" service
    And the "github" service answers "POST /app/installations/33/access_tokens" with 201 and:
      """
      {"token": "w", "expires_at": "2030-01-01T00:00:00Z"}
      """
    And the time is "2026-10-30T10:00:00Z"
    And the state writer app, asking the "github" service for its token
    When the writer saves the state, noting "Why", for "op@x.org"
    Then the result's "autoMerge" is "on"
    And the proposal's "repo" is "example-org/release-state"
    And the proposal's "base" is "main"
    And the proposal's "branch" matches the expression "^state/20261030100000-[0-9a-f]{6}$"
    And the proposal's "title" is "Why"
    And the proposal's "body" matches the expression "op@x\.org"
    And the proposal's "message" matches the expression "Requested-by: op@x\.org\n$"
    And the proposal's "expect" is:
      """
      {"state.json": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}
      """
    And the proposal's "autoMerge" is "true"
    And the proposal's "changes" is:
      """
      {"state.json": "{\n  \"owner\": \"example-org\",\n  \"repos\": {\n    \"bad\": {\n      \"board\": true,\n      \"protect\": true,\n      \"govern\": false\n    },\n    \"good\": {\n      \"board\": true,\n      \"protect\": true,\n      \"govern\": false,\n      \"project\": \"tools\"\n    }\n  }\n}\n"}
      """
    And the proposal's "token" is "w"
    And the "github" service was asked "POST /app/installations/33/access_tokens"
    And the "github" service was sent:
      """
      {"permissions": {"contents": "write", "pull_requests": "write"}}
      """

  Scenario: The reader reads the file with its sha
    Given a fake "github" service
    And the "github" service answers "POST /app/installations/11/access_tokens" with 201 and:
      """
      {"token": "t", "expires_at": "2030-01-01T00:00:00Z"}
      """
    And the "github" service answers "GET /repos/example-org/release-state/contents/state.json?ref=main" with 200 and:
      """
      {"sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "content": "eyJvd25lciI6ImV4YW1wbGUtb3JnIiwicmVwb3MiOnsiZ29vZCI6eyJib2FyZCI6dHJ1ZSwicHJvdGVjdCI6dHJ1ZSwiZ292ZXJuIjpmYWxzZSwicHJvamVjdCI6InRvb2xzIn0sImJhZCI6eyJib2FyZCI6dHJ1ZSwicHJvdGVjdCI6dHJ1ZSwiZ292ZXJuIjpmYWxzZX19fQ=="}
      """
    And the reader app, asking the "github" service for GitHub
    When the reader reads the state file
    Then the result is:
      """
      {"sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "state": {"owner": "example-org", "repos": {
        "good": {"board": true, "protect": true, "govern": false, "project": "tools"},
        "bad": {"board": true, "protect": true, "govern": false}}}}
      """

  Scenario: The reader lists every page of repositories
    Given a fake "github" service
    And the answers recorded in "app/test/answers/repositories"
    And the reader app, asking the "github" service for GitHub
    When the reader lists the repositories
    Then the result has 101 names
    And the result includes "last"
    And every recorded answer was used

  Scenario: The config takes a writer installation
    Given the settings:
      | RELEASE_OWNER                        | a |
      | RELEASE_READER_APP_INSTALLATION_ID   | 1 |
      | RELEASE_STATE_WRITER_INSTALLATION_ID | 2 |
      | OIDC_CLIENT_ID                       | c |
      | OIDC_CLIENT_SECRET                   | s |
      | RELEASE_READER_APP_ID                | 9 |
      | RELEASE_READER_APP_KEY               | k |
      | STORAGE_TOKEN_FILE                   | f |
      | RELEASE_STATE_WRITER_APP_ID          | 8 |
      | RELEASE_STATE_WRITER_APP_KEY         | w |
    When the config is read
    Then the result's "owner.writerInstallation" is "2"
    And the result's "writerId" is "8"

  Scenario: The config needs no writer installation
    Given the settings:
      | RELEASE_OWNER                        | a |
      | RELEASE_READER_APP_INSTALLATION_ID   | 1 |
      | RELEASE_STATE_WRITER_INSTALLATION_ID | 2 |
      | OIDC_CLIENT_ID                       | c |
      | OIDC_CLIENT_SECRET                   | s |
      | RELEASE_READER_APP_ID                | 9 |
      | RELEASE_READER_APP_KEY               | k |
      | STORAGE_TOKEN_FILE                   | f |
      | RELEASE_STATE_WRITER_APP_ID          | 8 |
      | RELEASE_STATE_WRITER_APP_KEY         | w |
    And the setting "RELEASE_STATE_WRITER_INSTALLATION_ID" is not set
    When the config is read
    Then the result's "owner.writerInstallation" is "null"

  Scenario: The config's writer installation is a number
    Given the settings:
      | RELEASE_OWNER                        | a |
      | RELEASE_READER_APP_INSTALLATION_ID   | 1 |
      | RELEASE_STATE_WRITER_INSTALLATION_ID | x |
      | OIDC_CLIENT_ID                       | c |
      | OIDC_CLIENT_SECRET                   | s |
      | RELEASE_READER_APP_ID                | 9 |
      | RELEASE_READER_APP_KEY               | k |
      | STORAGE_TOKEN_FILE                   | f |
      | RELEASE_STATE_WRITER_APP_ID          | 8 |
      | RELEASE_STATE_WRITER_APP_KEY         | w |
    When the config is read
    Then it is refused, saying "must be a number"

  Scenario: An operator sees what fixes secret scanning: a button, or the next apply
    Given the board shows push protection off for good and bad
    And the state protects good, but not bad
    When I GET "/"
    Then the answer includes "action=\"/state/turn-on\"" once
    And the answer includes "name=\"repo\" value=\"bad\""
    And the answer includes "Protect is on, so the next apply turns these on"

  Scenario: A reader sees the notch, and no way to fix it
    Given the board shows push protection off for good and bad
    And the state protects good, but not bad
    And I am signed in as "reader@x.org"
    And my access token is "release"
    When I GET "/"
    Then the answer includes "push protection off"
    And the answer does not include "turn-on"
    And the answer does not include "next apply"

  Scenario: Nothing to fix shows no button
    Given the board shows bad's secret scanning settings as not available
    And the state protects good, but not bad
    When I GET "/"
    Then the answer does not include "turn-on"
    And the answer does not include "next apply"

  Scenario: Turn on saves that repository's protect, and nothing else
    Given the "writer" service answers "POST /save" with 200 and:
      """
      {"status": "opened", "url": "https://github.com/x/pull/1", "autoMerge": "on"}
      """
    And the state protects good, but not bad
    When I POST to "/state/turn-on" with the form:
      | base | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note | Turn on |
      | repo | bad |
    Then the answer is 200
    And the "writer" service was sent:
      """
      {"owner": "example-org", "sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "note": "Turn on", "who": "op@x.org",
       "state": {"owner": "example-org", "repos": {
         "good": {"board": true, "protect": true, "govern": false, "project": "tools"},
         "bad": {"board": true, "protect": true, "govern": false}}}}
      """

  Scenario Outline: Turn on refuses a repository not in the state
    Given the state protects good, but not bad
    When I POST to "/state/turn-on" with the form:
      | base | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note | Turn on |
      | repo | <repo> |
    Then the answer is 400
    And the "writer" service was asked nothing

    Examples:
      | repo      |
      | unlisted  |
      | __proto__ |

  Scenario: Turn on refuses a reader
    Given the state protects good, but not bad
    And I am signed in as "reader@x.org"
    And my access token is "release"
    When I POST to "/state/turn-on" with the form:
      | base | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note | Turn on |
      | repo | bad |
    Then the answer is 403
    And the "writer" service was asked nothing

  Scenario: Turn on refuses another site
    Given the state protects good, but not bad
    And requests come from "https://evil.example"
    When I POST to "/state/turn-on" with the form:
      | base | aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa |
      | note | Turn on |
      | repo | bad |
    Then the answer is 403
    And the "writer" service was asked nothing
