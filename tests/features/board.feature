Feature: The hourly board stays quiet, and keeps its board with pubkit
  pubfleet's own tests cover `pubfleet state --repos-for` and `pubfleet board-publish`. These check
  how this repository's public workflow calls them.

  Scenario: The workflows stay quiet, and use the reader app
    When I read the hourly board workflow
    Then it sends pubfleet board's output nowhere, and uploads no artifact
    And its token comes from the reader app
    And it may ask for an OpenID Connect token
    And it keeps the board in the tenant "release-sustenaut"
