@manifests
Feature: What the deploy applies, where kustomize is installed, as it is in CI
  A mistake here would stop the deploy of both sites.

  Scenario: Schryer's deployment is its own, with its own host, realm and list
    Then schryer's deployment is its own, with its own host, realm and list

  Scenario: Sustenaut's deployment is unchanged by it
    Then Sustenaut's deployment is unchanged by it
