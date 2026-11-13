Feature: The nightly tells the operator what each repository must do to be in step with pubkit
  bin/pubkit-report reads what state.json puts on the board through gh, and prints one
  line per thing to do, for the nightly's direct message. It prints nothing else.

  Scenario: A repository behind pubkit's latest, and one whose main fails the sync check, each get their line
    Given pubkit's latest release is "0.37.0"
    And the state puts "behind" on the board, pinning pubkit "0.35.1"
    And the state puts "current" on the board, pinning pubkit "0.37.0"
    And the state puts "drifted" on the board, pinning pubkit "0.37.0", whose main fails its sync check
    And the state governs "auto", pinning pubkit "0.36.0"
    And the state has "hidden" off the board, pinning pubkit "0.30.0"
    When I run the report
    Then it succeeds
    And it says "3 pubkit step(s) to take, against pubkit 0.37.0:"
    And it says "• behind: on pubkit 0.35.1, latest 0.37.0: `git latest && ./pubkit bump`, then open its PR"
    And it says "• auto: on pubkit 0.36.0, latest 0.37.0: its nightly update PR moves it"
    And it says "• drifted: main fails `./pubkit sync --check` (https://github.com/run/1): `git latest && ./pubkit sync`, then open its PR"
    And it does not mention "current" or "hidden"

  Scenario: Nothing to do prints nothing
    Given pubkit's latest release is "0.37.0"
    And the state puts "current" on the board, pinning pubkit "0.37.0"
    When I run the report
    Then it succeeds
    And it prints nothing

  Scenario: The nightly sends the lines only in the direct message
    When I read the nightly workflow
    Then its pubkit job prints a count to the log and the summary, and the lines only to Slack
