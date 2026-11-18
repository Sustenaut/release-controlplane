Feature: The nightly keeps each repository's checks against pubrules as facts
  bin/pubrules-facts reads what state.json puts on the board through gh, and writes two rows
  for each repository, its pin and its sync check, passes as well as failures, as one Avro
  file for the platform's pubrules-checks buffer. It prints only counts. gh is a stand-in
  that answers from the state, the pins and the runs given.

  Scenario: Every repository on the board gets both rows, whatever they show
    Given a scratch directory
    And pubrules' latest release is "0.37.0"
    And the state puts "behind" on the board, pinning pubrules "0.35.1", whose main passes its sync check at "c1"
    And the state puts "current" on the board, pinning pubrules "0.37.0", whose main passes its sync check at "c2"
    And the state puts "drifted" on the board, pinning pubrules "0.37.0", whose main fails its sync check at "c3"
    And the state governs "auto", pinning pubrules "0.36.0", whose main passes its sync check at "c4"
    And the state puts "bare" on the board, pinning nothing, with no main runs
    And the state has "hidden" off the board, pinning pubrules "0.30.0", whose main passes its sync check at "c6"
    When I write the facts
    Then it succeeds
    And it prints:
      """
      10 checks written, 3 failing
      """
    And the facts hold "Sustenaut/behind" pin "fail" pinned "0.35.1" fixed by "`git latest && ./pubrules bump`, then open its PR"
    And the facts hold "Sustenaut/behind" sync "pass" pinned "0.35.1" fixed by ""
    And the facts hold "Sustenaut/current" pin "pass" pinned "0.37.0" fixed by ""
    And the facts hold "Sustenaut/drifted" sync "fail" pinned "0.37.0" fixed by "`git latest && ./pubrules sync`, then open its PR"
    And the facts hold "Sustenaut/auto" pin "fail" pinned "0.36.0" fixed by "its nightly update PR moves it"
    And the facts hold "Sustenaut/bare" pin "unknown" pinned "" fixed by ""
    And the facts hold "Sustenaut/bare" sync "unknown" pinned "" fixed by ""
    And every fact of "Sustenaut/drifted" names main's commit "c3", its run, latest "0.37.0" and the run's start
    And the facts hold nothing of "Sustenaut/hidden"
    And it does not print "Sustenaut/"
    And it does not print "behind"
    And it does not print "drifted"
    And stderr does not mention "Sustenaut/"
    And stderr does not mention "behind"
    And stderr does not mention "drifted"

  Scenario: A repository behind a release still in its grace days is behind, not failing
    Given a scratch directory
    And pubrules' latest release is "0.38.0"
    And pubrules "0.38.0" was released 1 days ago
    And pubrules "0.37.1" was released 20 days ago
    And the state puts "fresh" on the board, pinning pubrules "0.37.1", whose main passes its sync check at "f1"
    And the state puts "stale" on the board, pinning pubrules "0.36.0", whose main passes its sync check at "s1"
    When I write the facts
    Then it succeeds
    And it prints:
      """
      4 checks written, 1 failing
      """
    And the facts hold "Sustenaut/fresh" pin "behind"
    And the facts hold "Sustenaut/stale" pin "fail"

  Scenario: The nightly's pubrules job may ask for an OpenID Connect token
    When I read the nightly workflow's "pubrules" job
    Then the result's "permissions.id-token" is "write"

  Scenario: The nightly sends the facts only to the private tenant, as the job's own token
    When I read what the nightly's step that runs bin/pubrules-facts runs
    Then the result includes "bin/pubrules-facts state.json --url https://storage.sustenaut.eu --tenant pubrules-checks"
    And the result does not include "--out"
    And the result does not include "cat "

  Scenario: The nightly's facts step fails when a write is refused
    # bash with pipefail, so a refused write fails the job though tee runs last.
    When I read the nightly's step that runs bin/pubrules-facts
    Then the result's "shell" is "bash"

  Scenario: The nightly prints only the counts
    When I read the nightly's pubrules job, in lower case
    Then the result does not include "slack"
    And the result does not include "upload-artifact"
