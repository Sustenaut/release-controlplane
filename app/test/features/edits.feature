@edits
Feature: An operator changing the state, with the pull request written to memory

  Scenario: An operator's state page is a form, with the repositories not in the state in grey
    Then an operator's state page is a form, with the repositories not in the state in grey

  Scenario: Someone not an operator sees no form, and an owner with no writer has none either
    Then someone not an operator sees no form, and an owner with no writer has none either

  Scenario: A save opens a pull request with the new state, the note and who asked
    Then a save opens a pull request with the new state, the note and who asked

  Scenario: What GitHub answered is said plainly
    Then what GitHub answered is said plainly

  Scenario: Only an operator may save, and only from this site
    Then only an operator may save, and only from this site

  Scenario: A bad form says why, and saves nothing
    Then a bad form says why, and saves nothing

  Scenario: A form too large is refused
    Then a form too large is refused

  Scenario: A failure saving is said, not thrown
    Then a failure saving is said, not thrown

  Scenario: A save reads the state afresh, and doesn't show the old one after
    Then a save reads the state afresh, and doesn't show the old one after

  Scenario: History offers going back to any but the newest, and reverting saves the old file
    Then history offers going back to any but the newest, and reverting saves the old file

  Scenario: The state page offers the labels in use, the current one chosen, and a new one
    Then the state page offers the labels in use, the current one chosen, and a new one

  Scenario: A new label goes to each repository set to it, and then is one of the labels
    Then a new label goes to each repository set to it, and then is one of the labels

  Scenario: stateFrom keeps what the form doesn't name, adds on a role, and drops a project
    Then stateFrom keeps what the form doesn't name, adds on a role, and drops a project

  Scenario: A repository in the state stays even with every role off
    Then a repository in the state stays even with every role off

  Scenario: Form checks throw FormError
    Then form checks throw FormError

  Scenario: The file is stable: sorted, indented, ending in a newline
    Then the file is stable: sorted, indented, ending in a newline

  Scenario: The writer proposes one file, expecting what was read, merging itself, with its own token
    Then the writer proposes one file, expecting what was read, merging itself, with its own token

  Scenario: The reader reads the file with its sha, and lists every page of repositories
    Then the reader reads the file with its sha, and lists every page of repositories

  Scenario: The config takes a writer installation
    Then the config takes a writer installation

  Scenario: An operator sees what fixes secret scanning: a button, or the next apply
    Then an operator sees what fixes secret scanning: a button, or the next apply

  Scenario: A reader sees the notch, and no way to fix it
    Then a reader sees the notch, and no way to fix it

  Scenario: Nothing to fix shows no button
    Then nothing to fix shows no button

  Scenario: Turn on saves that repository's protect, and nothing else
    Then Turn on saves that repository's protect, and nothing else

  Scenario: Turn on refuses a repository not in the state, a reader, and another site
    Then Turn on refuses a repository not in the state, a reader, and another site
