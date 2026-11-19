@manifests
Feature: What the deploy applies, where kustomize is installed, as it is in CI
  A mistake here would stop the deploy of both sites.

  Scenario: Schryer's deployment is its own, with its own host, realm and list
    When I run "kustomize build k8s-schryer"
    Then it succeeds
    And it prints no line matching "*namespace: release"
    And it prints "namespace: release-schryer"
    And it prints "host: release.schryer.eu"
    And it does not print "release.sustenaut.eu"
    And it prints "realms/family"
    And it does not print "realms/team"
    And it prints "--authenticated-emails-file=/etc/oauth2-proxy/emails"
    And it prints "ALLOWED_EMAILS"
    And it prints no line matching "*OIDC_CLIENT_ID"
    And it does not print "allowed-group"
    And it does not print "email-domain"
    And it prints a line matching "*value: schryer"

  Scenario: Sustenaut's deployment is unchanged by it
    When I run "kustomize build k8s"
    Then it succeeds
    And it does not print "schryer"
    And it prints a line matching "*namespace: release"
    And it prints "--allowed-group=release"
