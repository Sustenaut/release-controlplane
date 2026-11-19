@app
Feature: The pages, with GitHub and storage answered here
  The site is example-org's, whose board shows two repositories, good and bad. Keycloak
  is answered here too: an access token is the list of roles it grants.

  Background:
    Given the site of "example-org", whose board shows a good and a bad repository
    And I am signed in as "me@example.org"
    And my access token is "release"

  Scenario: The board groups by project, worst first
    When I GET "/"
    Then the answer is 200
    And the answer shows "example-org/bad" before "example-org/good"
    And the answer includes "<h3>tools</h3>"
    And the answer includes "private"
    And the answer includes "aria-current=\"page\">Board"

  Scenario: The board says when there is none
    Given the board isn't there yet
    When I GET "/"
    Then the answer includes "No board yet"

  Scenario: What a repository says is escaped, everywhere
    When I GET "/"
    Then the answer does not include "<b>old</b>"
    And the answer does not include "<issues>"
    And the answer includes "3 open &#60;issues&#62;"

  Scenario: The state shows each repository's roles
    When I GET "/state"
    Then the answer includes "bad</td><td>·</td><td class=\"on\">on</td><td class=\"off\">off</td><td class=\"off\">off"
    And the answer includes "good</td><td>tools</td><td class=\"on\">on</td><td class=\"on\">on</td><td class=\"on\">on"

  Scenario: The history shows state changes in words, and the board's snapshots
    Given the state's history has a commit governing good, after one adding it
    When I GET "/history"
    Then the answer includes "good: govern on"
    And the answer includes "good added"
    And the answer includes "Govern good"
    And the answer includes "aaaaaaaaaaaa"
    And the answer does not include "aaaaaaaaaaaaa"

  Scenario: Someone without the role gets in nowhere
    Given I am signed in as "stranger@example.org"
    And my access token is "opportunity"
    When I GET "/state"
    Then the answer is 403
    And the answer does not include "good"

  Scenario: Someone not signed in gets in nowhere
    Given I am not signed in
    When I GET "/state"
    Then the answer is 403
    And the answer does not include "good"

  Scenario Outline: The health checks need no sign-in, and tell nothing
    Given I am not signed in
    When I GET "<path>"
    Then the answer is 200
    And the answer is the line "ok"

    Examples:
      | path     |
      | /healthz |
      | /livez   |

  Scenario: Without what it needs the app is not ready
    Given the app isn't ready, saying "no token"
    And I am not signed in
    When I GET "/healthz"
    Then the answer is 503
    And the answer is the line "not ready"

  Scenario: Without what it needs the app is still alive
    Given the app isn't ready, saying "no token"
    And I am not signed in
    When I GET "/livez"
    Then the answer is 200

  Scenario: Readiness says what is missing
    Given a readiness check that fails, saying "no token"
    When readiness is asked
    Then the result is "no token"
    And "the readiness check" was called 1 time

  Scenario: A failed readiness check is kept for 30 seconds
    Given a readiness check that fails, saying "no token"
    And readiness was asked
    And the failure ends
    And 29999 ms pass
    When readiness is asked
    Then the result is "no token"
    And "the readiness check" was called 1 time

  Scenario: Readiness is checked again after 30 seconds
    Given a readiness check that fails, saying "no token"
    And readiness was asked
    And the failure ends
    And 30000 ms pass
    When readiness is asked
    Then the result is "null"
    And "the readiness check" was called 2 times

  Scenario Outline: Only GET and POST are taken, and an unknown page is not found
    When I send "<method>" to "<path>"
    Then the answer is <status>

    Examples:
      | method | path         | status |
      | PUT    | /            | 405    |
      | POST   | /            | 404    |
      | GET    | /example-org | 404    |
      | GET    | /nope        | 404    |

  Scenario: Pages allow no scripts and are not stored
    When I GET "/"
    Then the answer's "Content-Security-Policy" is "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
    And the answer's "Cache-Control" is "no-store"

  Scenario: What can't be read is said on the page
    Given storage fails, saying "storage said 500"
    When I GET "/"
    Then the answer is 200
    And the answer includes "storage said 500"

  Scenario Outline: The page names only this deployment's owner, and reads only its tenant and repository
    Given every read is recorded
    When I GET "<path>"
    Then the answer is 200
    And every read asked for this deployment's owner

    Examples:
      | path     |
      | /        |
      | /state   |
      | /history |

  Scenario: A read that fails isn't kept
    Given a read, kept for a minute, that fails at first
    When the read is asked for "a"
    Then it is refused, saying "no"

  Scenario: After a failure the next request reads again
    Given a read, kept for a minute, that fails at first
    And the read was asked for "a"
    And the failure ends
    When the read is asked for "a"
    Then the result is "2"

  Scenario: A read is kept for a minute
    Given a read, kept for a minute, that fails at first
    And the read was asked for "a"
    And the failure ends
    And the read was asked for "a"
    When the read is asked for "a"
    Then the result is "2"

  Scenario: A read is made again after a minute
    Given a read, kept for a minute, that fails at first
    And the read was asked for "a"
    And the failure ends
    And the read was asked for "a"
    And 60 seconds pass
    When the read is asked for "a"
    Then the result is "3"

  Scenario: A commit's state file that can't be read fails the history
    Given a state history whose reads of a state fail at first
    When the state history is read
    Then it is refused, saying "no"

  Scenario: A commit's state file is read once, and a failed read is tried again
    Given a state history whose reads of a state fail at first
    And the state history was read
    And the failure ends
    And the state history was read
    When the state history is read
    Then it is not refused
    And the result has 1 commit
    And "the state read" was called 2 times

  Scenario: Changes says what moved, added and went
    Given the state before:
      """
      {"repos": {
        "a": {"board": true, "protect": true, "govern": false},
        "b": {"board": true, "protect": true, "govern": false},
        "c": {"board": true, "protect": true, "govern": false, "project": "x"}}}
      """
    And the state after:
      """
      {"repos": {
        "a": {"board": false, "protect": true, "govern": false},
        "c": {"board": true, "protect": true, "govern": false, "project": "y"},
        "d": {"board": true, "protect": true, "govern": false}}}
      """
    When the changes from one to the other are listed
    Then the result is:
      """
      ["a: board off", "b removed", "c: project y", "d added"]
      """

  Scenario: Changes of a state to itself are none
    Given the state before:
      """
      {"repos": {"a": {"board": false, "protect": true, "govern": false}, "d": {"board": true, "protect": true, "govern": false}}}
      """
    And the state after:
      """
      {"repos": {"a": {"board": false, "protect": true, "govern": false}, "d": {"board": true, "protect": true, "govern": false}}}
      """
    When the changes from one to the other are listed
    Then the result is "[]"

  Scenario: A project taken away is said as none
    Given the state before:
      """
      {"repos": {"a": {"board": true, "protect": true, "govern": false, "project": "x"}}}
      """
    And the state after:
      """
      {"repos": {"a": {"board": true, "protect": true, "govern": false}}}
      """
    When the changes from one to the other are listed
    Then the result is:
      """
      ["a: project none"]
      """

  Scenario: The app's token is a signed JWT GitHub can check
    When the app "123" makes its token at 1000 seconds past the epoch
    Then the result is a JWT signed with the app's key, claiming:
      """
      {"iat": 940, "exp": 1540, "iss": "123"}
      """

  Scenario: The reader reads as the owner's installation, Contents read only
    Given a fake "github" service
    And the "github" service answers "POST /app/installations/11/access_tokens" with 201 and:
      """
      {"token": "token-11", "expires_at": "2026-10-30T11:00:00Z"}
      """
    And the "github" service answers "GET /repos/example-org/release-state/contents/state.json?ref=main" with 200 and:
      """
      {"owner": "example-org", "repos": {"good": {"board": true, "protect": true, "govern": true, "project": "tools"}, "bad": {"board": true, "protect": false, "govern": false}}}
      """
    And the time is "2026-10-30T10:00:00Z"
    And the reader app, asking the "github" service for GitHub
    When the reader reads the state
    Then the result is:
      """
      {"owner": "example-org", "repos": {"good": {"board": true, "protect": true, "govern": true, "project": "tools"}, "bad": {"board": true, "protect": false, "govern": false}}}
      """
    And the "github" service was asked "POST /app/installations/11/access_tokens" 1 times
    And the "github" service was sent:
      """
      {"permissions": {"contents": "read"}}
      """
    And the "github" service was asked "GET /repos/example-org/release-state/contents/state.json?ref=main" with the header "Authorization" set to "Bearer token-11"

  Scenario: The reader keeps its token
    Given a fake "github" service
    And the "github" service answers "POST /app/installations/11/access_tokens" with 201 and:
      """
      {"token": "token-11", "expires_at": "2026-10-30T11:00:00Z"}
      """
    And the "github" service answers "GET /repos/example-org/release-state/contents/state.json?ref=main" with 200 and:
      """
      {"owner": "example-org", "repos": {}}
      """
    And the time is "2026-10-30T10:00:00Z"
    And the reader app, asking the "github" service for GitHub
    And the reader has read the state
    When the reader reads the state
    Then the "github" service was asked "POST /app/installations/11/access_tokens" 1 times
    And the "github" service was asked "GET /repos/example-org/release-state/contents/state.json?ref=main" 2 times

  Scenario: The reader replaces a token near its end
    Given a fake "github" service
    And the "github" service answers "POST /app/installations/11/access_tokens" with 201 and:
      """
      {"token": "token-11", "expires_at": "2026-10-30T11:00:00Z"}
      """
    And the "github" service answers "GET /repos/example-org/release-state/contents/state.json?ref=main" with 200 and:
      """
      {"owner": "example-org", "repos": {}}
      """
    And the time is "2026-10-30T10:00:00Z"
    And the reader app, asking the "github" service for GitHub
    And the reader has read the state
    And 3600 seconds pass
    When the reader reads the state
    Then the "github" service was asked "POST /app/installations/11/access_tokens" 2 times

  Scenario: The reader reads the commits, each by its title
    Given a fake "github" service
    And the "github" service answers "POST /app/installations/11/access_tokens" with 201 and:
      """
      {"token": "token-11", "expires_at": "2026-10-30T11:00:00Z"}
      """
    And the "github" service answers "GET /repos/example-org/release-state/commits?path=state.json&per_page=20" with 200 and:
      """
      [{"sha": "s", "commit": {"message": "Title\n\nbody", "author": {"name": "David", "date": "d"}}}]
      """
    And the time is "2026-10-30T10:00:00Z"
    And the reader app, asking the "github" service for GitHub
    When the reader reads the commits
    Then the result is:
      """
      [{"sha": "s", "message": "Title", "author": "David", "time": "d"}]
      """

  Scenario: Storage reads the board as this app, with the token it reads
    Given a fake "storage" service
    And the "storage" service answers "GET /release-x/head/board" with 200 and:
      """
      {"summary": "2 repos: 1 A, 1 D.", "repos": []}
      """
    And the board store, asking the "storage" service for storage, with the token "first"
    When the board of "release-x" is read
    Then the result is:
      """
      {"summary": "2 repos: 1 A, 1 D.", "repos": []}
      """
    And the "storage" service was asked "GET /release-x/head/board" with the header "Authorization" set to "Bearer first"
    And the "storage" service was asked "GET /release-x/head/board" with the header "User-Agent" set to "sustenaut-release-controlplane"
    And the call records are:
      | repo                 | plugin      | operation | status |
      | release-controlplane | storage.api | read      | 200    |

  Scenario: Storage reads the token afresh for each request
    Given a fake "storage" service
    And the "storage" service answers "GET /release-x/head/board" with 200 and:
      """
      {"summary": "s", "repos": []}
      """
    And the "storage" service answers "GET /release-x/head/board/log" with 200 and:
      """
      {"name": "board", "log": [{"hash": "h"}]}
      """
    And the board store, asking the "storage" service for storage, with the token "first"
    And the board of "release-x" was read
    And the storage token becomes "second"
    When the board's log of "release-x" is read
    Then the result is:
      """
      [{"hash": "h"}]
      """
    And the "storage" service was asked "GET /release-x/head/board/log" with the header "Authorization" set to "Bearer second"

  Scenario: A board never written is no board, and has no log
    Given a fake "storage" service
    And the "storage" service answers "GET /release-none/head/board" with 404 and:
      """
      {"error": "not found"}
      """
    And the "storage" service answers "GET /release-none/head/board/log" with 404 and:
      """
      {"error": "not found"}
      """
    And the board store, asking the "storage" service for storage, with the token "t"
    And the board of "release-none" was read
    When the board's log of "release-none" is read
    Then the result is "[]"
    And the call records are:
      | repo                 | plugin      | operation | status |
      | release-controlplane | storage.api | read      | 404    |
      | release-controlplane | storage.api | read      | 404    |

  Scenario: A board never written reads as none
    Given a fake "storage" service
    And the "storage" service answers "GET /release-none/head/board" with 404 and:
      """
      {"error": "not found"}
      """
    And the board store, asking the "storage" service for storage, with the token "t"
    When the board of "release-none" is read
    Then the result is "null"

  Scenario: Storage refusing is an error that says why, not an empty board
    Given a fake "storage" service
    And the "storage" service answers "GET /x/head/board" with 403 and:
      """
      {"error": "k8s:x may not read here"}
      """
    And the board store, asking the "storage" service for storage, with the token "t"
    When the board of "x" is read
    Then it is refused, saying "storage said 403: k8s:x may not read here"

  Scenario: Storage that doesn't answer is an error that says so, and a person isn't kept waiting on retries
    Given a fake "storage" service
    And the board store, asking the "storage" service for storage, with the token "t"
    And storage never answers in time
    When the board of "x" is read
    Then it is refused, saying "storage didn't answer: no answer: timed out after 10 s"
    And "storage" was called 1 time
    And every call to "storage" had a deadline

  Scenario: Storage failing is an error that says what it said
    Given a fake "storage" service
    And the "storage" service answers "GET /x/head/board" with 503 and:
      """
      {"error": "down"}
      """
    And the board store, asking the "storage" service for storage, with the token "t"
    When the board of "x" is read
    Then it is refused, saying "storage said 503: down"
    And the "storage" service was asked "GET /x/head/board" 1 times

  Scenario: The records go to the call log's buffer as the pod, with its storage token
    Given a fake "storage" service
    And the "storage" service answers "GET /release-x/head/board" with 200 and:
      """
      {"summary": "s", "repos": []}
      """
    And the "storage" service answers "PUT /calls-release-controlplane/inbox/calls" with 200 and:
      """
      {"name": "x", "size": 1}
      """
    And the call log of the sender "app-7", sending to the "storage" service with the token file "/token"
    When the board of "release-x" is read, and the call log sent
    Then it is not refused
    And the "storage" service was asked a request matching the expression "^PUT " 1 time
    And the "storage" service was asked a request matching the expression "^PUT /calls-release-controlplane/inbox/calls/\d{4}-\d{2}-\d{2}/\d{6}-app-7-[0-9a-f]{16}\.avro$" with the header "Authorization" set to "Bearer token from /token"

  Scenario: The call log is the app's dataset, and a page never waits on it
    When the call log is made for the sender "app-7"
    Then the result's "datasets" is "{\"release-controlplane\": \"calls_release_controlplane\"}"
    And the result's "flushOnWrite" is "false"

  Scenario: The app's caller is the app's, for its web pages
    When the app's caller is made
    Then the result's "repo" is "release-controlplane"
    And the result's "app" is "web"

  Scenario: The config is for one owner
    Given the settings:
      | RELEASE_OWNER                      | A-org |
      | RELEASE_READER_APP_INSTALLATION_ID | 1     |
      | OIDC_CLIENT_ID                     | c     |
      | OIDC_CLIENT_SECRET                 | s     |
      | RELEASE_READER_APP_ID              | 9     |
      | RELEASE_READER_APP_KEY             | k     |
      | STORAGE_TOKEN_FILE                 | f     |
    When the config is read
    Then the result's "owner.name" is "A-org"
    And the result's "owner.installation" is "1"
    And the result's "owner.writerInstallation" is "null"
    And the result's "owner.tenant" is "release-a-org"
    And the result's "storageUrl" is "https://storage.sustenaut.eu"
    And the result's "port" is "8080"

  Scenario Outline: The config needs everything
    Given the settings:
      | RELEASE_OWNER                      | A-org |
      | RELEASE_READER_APP_INSTALLATION_ID | 1     |
      | OIDC_CLIENT_ID                     | c     |
      | OIDC_CLIENT_SECRET                 | s     |
      | RELEASE_READER_APP_ID              | 9     |
      | RELEASE_READER_APP_KEY             | k     |
      | STORAGE_TOKEN_FILE                 | f     |
    And the setting "<name>" is empty
    When the config is read
    Then it is refused, saying "<name> is not set"

    Examples:
      | name                               |
      | RELEASE_OWNER                      |
      | RELEASE_READER_APP_INSTALLATION_ID |
      | OIDC_CLIENT_ID                     |
      | OIDC_CLIENT_SECRET                 |
      | RELEASE_READER_APP_ID              |
      | RELEASE_READER_APP_KEY             |
      | STORAGE_TOKEN_FILE                 |

  Scenario: The config's installation is a number
    Given the settings:
      | RELEASE_OWNER                      | A-org |
      | RELEASE_READER_APP_INSTALLATION_ID | x     |
      | OIDC_CLIENT_ID                     | c     |
      | OIDC_CLIENT_SECRET                 | s     |
      | RELEASE_READER_APP_ID              | 9     |
      | RELEASE_READER_APP_KEY             | k     |
      | STORAGE_TOKEN_FILE                 | f     |
    When the config is read
    Then it is refused, saying "must be a number"

  Scenario: The board says when it was last checked, apart from when it last changed
    Given the board's workflow last ran at "2026-10-31T09:13:00Z", ending in "success", its page "https://github.com/x/runs/1"
    When I GET "/"
    Then the answer includes "Last checked <a href=\"https://github.com/x/runs/1\">2026-10-31T09:13:00Z</a>."
    And the answer includes "2 repos: 1 A, 1 D"
    And the answer does not include "It ended"

  Scenario: A run that didn't pass says so
    Given the board's workflow last ran at "t", ending in "failure", its page "https://u"
    When I GET "/"
    Then the answer includes "It ended: failure"

  Scenario: With no workflow the board shows without that line
    When I GET "/"
    Then the answer does not include "Last checked"

  Scenario: With GitHub not answering the board still shows, without that line
    Given the board's workflow can't be read, GitHub saying "GitHub said 403"
    When I GET "/"
    Then the answer is 200
    And the answer does not include "Last checked"
    And the answer includes "example-org/good"

  Scenario: The last run comes from the workflow named, with no token, as github.board-read
    Given a fake "github" service
    And the "github" service answers "GET /repos/o/r/actions/workflows/board.yml/runs?status=completed&per_page=1" with 200 and:
      """
      {"workflow_runs": [{"updated_at": "t", "conclusion": "success", "html_url": "https://u"}]}
      """
    And the last run read from the workflow "o/r/board.yml", asking the "github" service for GitHub
    When the last run is read
    Then the result is:
      """
      {"time": "t", "conclusion": "success", "url": "https://u"}
      """
    And the "github" service was asked "GET /repos/o/r/actions/workflows/board.yml/runs?status=completed&per_page=1"
    And the "github" service was asked "GET /repos/o/r/actions/workflows/board.yml/runs?status=completed&per_page=1" without the header "Authorization"
    And every call to "github" had a deadline
    And the call records are:
      | plugin           | operation |
      | github.board-read | read     |

  Scenario: A workflow that never ran has no last run
    Given a fake "github" service
    And the "github" service answers "GET /repos/o/r/actions/workflows/b.yml/runs" with 200 and:
      """
      {"workflow_runs": []}
      """
    And the last run read from the workflow "o/r/b.yml", asking the "github" service for GitHub
    When the last run is read
    Then the result is "null"

  Scenario: GitHub refusing the last run is an error that says so
    Given a fake "github" service
    And the "github" service answers "GET /repos/o/r/actions/workflows/b.yml/runs" with 403
    And the last run read from the workflow "o/r/b.yml", asking the "github" service for GitHub
    When the last run is read
    Then it is refused, saying "GitHub said 403"

  Scenario: GitHub failing for the last run is an error that says so, after its retries
    Given a fake "github" service
    And the "github" service answers "GET /repos/o/r/actions/workflows/b.yml/runs" with 502
    And the last run read from the workflow "o/r/b.yml", asking the "github" service for GitHub
    When the last run is read
    Then it is refused, saying "GitHub said 502"
    And the caller waited "1, 2" seconds between its tries
    And the "github" service was asked "GET /repos/o/r/actions/workflows/b.yml/runs" 3 times

  Scenario: GitHub not answering for the last run is an error that says so
    Given a fake "github" service
    And the last run read from the workflow "o/r/b.yml", asking the "github" service for GitHub
    And GitHub doesn't answer, the connection failing
    When the last run is read
    Then it is refused, saying "GitHub didn't answer: no answer: fetch failed"

  Scenario: A call the caller doesn't know is not GitHub failing
    Given the last run read from the workflow "o/r/b.yml" by a caller that doesn't know the operation
    When the last run is read
    Then the refusal is a RangeError

  Scenario Outline: Reading takes the release role, by its exact name
    Given my access token is "<roles>"
    When I GET "/"
    Then the answer is <status>

    Examples:
      | roles               | status |
      | release             | 200    |
      | opportunity,release | 200    |
      | opportunity         | 403    |
      | controller          | 403    |
      | role:release        | 403    |
      | released            | 403    |

  Scenario: A read after a sign-in that has ended goes to sign in
    Given Keycloak says my sign-in has ended
    When I GET "/state"
    Then the answer is 302
    And the answer redirects to "/oauth2/start?rd=%2Fstate"

  Scenario: A change after a sign-in that has ended is refused
    Given Keycloak says my sign-in has ended
    When I send "POST" to "/state"
    Then the answer is 403
    And the answer includes "nothing was saved"

  Scenario: An operator gets the state's form while Keycloak answers
    Given the owner has a writer
    And the site asks Keycloak, which grants "release,controller"
    When I GET "/state"
    Then the answer includes "<form"

  Scenario: With Keycloak down someone vouched for reads, without a form
    Given the owner has a writer
    And the site asks Keycloak, which grants "release,controller"
    And I have looked at "/state"
    And Keycloak can't be reached
    And 2 seconds pass
    When I GET "/state"
    Then the answer is 200
    And the answer does not include "<form"

  Scenario: With Keycloak down someone vouched for can't change anything
    Given the owner has a writer
    And the site asks Keycloak, which grants "release,controller"
    And I have looked at "/state"
    And Keycloak can't be reached
    And 2 seconds pass
    When I send "POST" to "/state"
    Then the answer is 503

  Scenario: With Keycloak down anyone else gets a 503
    Given the site asks Keycloak, which grants "release,controller"
    And I have looked at "/state"
    And Keycloak can't be reached
    And 2 seconds pass
    And I am signed in as "other@example.org"
    When I GET "/state"
    Then the answer is 503

  Scenario: With an email list the config needs no sign-in client
    Given the settings:
      | RELEASE_OWNER                      | a           |
      | RELEASE_READER_APP_INSTALLATION_ID | 1           |
      | ALLOWED_EMAILS                     |  Me@x.org,  |
      | RELEASE_READER_APP_ID              | 9           |
      | RELEASE_READER_APP_KEY             | k           |
      | STORAGE_TOKEN_FILE                 | f           |
    When the config is read
    Then the result's "allowedEmails" is "[\"me@x.org\"]"
    And the result's "clientId" is "null"

  Scenario: Without an email list the config needs the sign-in client
    Given the settings:
      | RELEASE_OWNER                      | a |
      | RELEASE_READER_APP_INSTALLATION_ID | 1 |
      | RELEASE_READER_APP_ID              | 9 |
      | RELEASE_READER_APP_KEY             | k |
      | STORAGE_TOKEN_FILE                 | f |
    And the setting "ALLOWED_EMAILS" is empty
    When the config is read
    Then it is refused, saying "OIDC_CLIENT_ID is not set"
