Feature: The nightly keeps each repository's checks against pubkit as facts
  bin/pubkit-facts reads what state.json puts on the board through gh, and writes two rows
  for each repository, its pin and its sync check, passes as well as failures, as one Avro
  file for the platform's pubkit-checks buffer. It prints only counts.

  Scenario: Every repository on the board gets both rows, whatever they show
    Given pubkit's latest release is "0.37.0"
    And the state puts "behind" on the board, pinning pubkit "0.35.1", whose main passes its sync check at "c1"
    And the state puts "current" on the board, pinning pubkit "0.37.0", whose main passes its sync check at "c2"
    And the state puts "drifted" on the board, pinning pubkit "0.37.0", whose main fails its sync check at "c3"
    And the state governs "auto", pinning pubkit "0.36.0", whose main passes its sync check at "c4"
    And the state puts "bare" on the board, pinning nothing, with no main runs
    And the state has "hidden" off the board, pinning pubkit "0.30.0", whose main passes its sync check at "c6"
    When I write the facts
    Then it succeeds, printing "10 checks written, 3 failing"
    And the facts hold "Sustenaut/behind" pin "fail" pinned "0.35.1" fixed by "`git latest && ./pubkit bump`, then open its PR"
    And the facts hold "Sustenaut/behind" sync "pass" pinned "0.35.1" fixed by ""
    And the facts hold "Sustenaut/current" pin "pass" pinned "0.37.0" fixed by ""
    And the facts hold "Sustenaut/drifted" sync "fail" pinned "0.37.0" fixed by "`git latest && ./pubkit sync`, then open its PR"
    And the facts hold "Sustenaut/auto" pin "fail" pinned "0.36.0" fixed by "its nightly update PR moves it"
    And the facts hold "Sustenaut/bare" pin "unknown" pinned "" fixed by ""
    And the facts hold "Sustenaut/bare" sync "unknown" pinned "" fixed by ""
    And every fact of "Sustenaut/drifted" names main's commit "c3", its run, latest "0.37.0" and the run's start
    And the facts hold nothing of "Sustenaut/hidden"
    And the output names no repository

  Scenario: The nightly sends the facts only to the private tenant
    When I read the nightly workflow
    Then its pubkit job writes the facts to storage's pubkit-checks tenant as the job's own token
    And it prints only the counts
