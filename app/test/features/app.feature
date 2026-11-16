@app
Feature: The pages, with GitHub and storage answered here

  Scenario: The board groups by project, worst first, and says when there is none
    Then the board groups by project, worst first, and says when there is none

  Scenario: What a repository says is escaped, everywhere
    Then what a repository says is escaped, everywhere

  Scenario: The state shows each repository's roles
    Then the state shows each repository's roles

  Scenario: The history shows state changes in words, and the board's snapshots
    Then the history shows state changes in words, and the board's snapshots

  Scenario: Someone without the role gets in nowhere
    Then someone without the role gets in nowhere

  Scenario: The health checks need no sign-in, and tell nothing
    Then the health checks need no sign-in, and tell nothing

  Scenario: Without what it needs the app is not ready, but still alive
    Then without what it needs the app is not ready, but still alive

  Scenario: Readiness is checked at most every 30 seconds, a failure too
    Then readiness is checked at most every 30 seconds, a failure too

  Scenario: Only GET and POST are taken, and an unknown page is not found
    Then only GET and POST are taken, and an unknown page is not found

  Scenario: Pages allow no scripts and are not stored
    Then pages allow no scripts and are not stored

  Scenario: What can't be read is said on the page
    Then what can't be read is said on the page

  Scenario: The page names only this deployment's owner, and reads only its tenant and repository
    Then the page names only this deployment's owner, and reads only its tenant and repository

  Scenario: A read is kept for a minute, and a failure isn't kept
    Then a read is kept for a minute, and a failure isn't kept

  Scenario: A commit's state file is read once, and a failed read is tried again
    Then a commit's state file is read once, and a failed read is tried again

  Scenario: Changes says what moved, added and went
    Then changes says what moved, added and went

  Scenario: The app's token is a signed JWT GitHub can check
    Then the app's token is a signed JWT GitHub can check

  Scenario: The reader reads as each owner's installation, Contents read only, and keeps its token
    Then the reader reads as each owner's installation, Contents read only, and keeps its token

  Scenario: Storage reads the token afresh, names itself, and a missing head is no board
    Then storage reads the token afresh, names itself, and a missing head is no board

  Scenario: Storage refusing is an error that says why, not an empty board
    Then storage refusing is an error that says why, not an empty board

  Scenario: Storage that doesn't answer is an error that says so, and a person isn't kept waiting on retries
    Then storage that doesn't answer is an error that says so, and a person isn't kept waiting on retries

  Scenario: The records go to the call log's buffer as the pod, with its storage token
    Then the records go to the call log's buffer as the pod, with its storage token

  Scenario: The config is for one owner, and needs everything
    Then the config is for one owner, and needs everything

  Scenario: The board says when it was last checked, apart from when it last changed
    Then the board says when it was last checked, apart from when it last changed

  Scenario: A run that didn't pass says so
    Then a run that didn't pass says so

  Scenario: With no workflow, or GitHub not answering, the board still shows, without that line
    Then with no workflow, or GitHub not answering, the board still shows, without that line

  Scenario: The last run comes from the workflow named, with no token, as github.board-read
    Then the last run comes from the workflow named, with no token, as github.board-read

  Scenario: GitHub failing or not answering for the last run is an error that says so, after its retries
    Then GitHub failing or not answering for the last run is an error that says so, after its retries

  Scenario: Reading takes the release role, by its exact name
    Then reading takes the release role, by its exact name

  Scenario: The page's answer to a sign-in that has ended: a read goes to sign in, a change is refused
    Then the page's answer to a sign-in that has ended: a read goes to sign in, a change is refused

  Scenario: With Keycloak down someone vouched for reads, without a form; anyone else gets a 503
    Then with Keycloak down someone vouched for reads, without a form; anyone else gets a 503

  Scenario: With an email list the config needs no sign-in client
    Then with an email list the config needs no sign-in client
