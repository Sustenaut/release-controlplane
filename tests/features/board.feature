Feature: The hourly board stays quiet, and keeps its board with pubrules
  pubfleet's own tests cover `pubfleet state --repos-for` and `pubfleet board-publish`. These check
  how this repository's public workflow calls them.

  Scenario: The workflow sends pubfleet board's output nowhere, and uploads no artifact
    When I read the hourly board workflow
    Then the result includes "pubfleet board --out site --repos repos.json > /dev/null"
    And the result does not include "upload-artifact"
    And the result does not include "STEP_SUMMARY"

  Scenario: The workflow's token comes from the reader app
    When I read the hourly board workflow
    Then the result includes "app-id: '${{ vars.RELEASE_READER_APP_ID }}'"
    And the result includes "private-key: '${{ secrets.RELEASE_READER_APP_KEY }}'"
    And the result includes "owner: '${{ matrix.owner }}'"

  Scenario: The workflow may ask for an OpenID Connect token
    When I read the hourly board workflow
    Then the result includes "id-token: write"

  Scenario: The workflow keeps the board in the tenant release-sustenaut
    When I read the hourly board workflow
    Then the result includes "pubfleet state --repos-for board state.json > repos.json"
    And the result includes "pubfleet board-publish --url https://storage.sustenaut.eu --tenant release-sustenaut"
