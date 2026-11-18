@access
Feature: The access check against auth's contract, with Keycloak answered here
  Keycloak is pubtest's fake "keycloak" service: the realm's hash of the client's access
  state, and each person's userinfo, answered in turn, the last answer repeating. The
  clock is the scenario's own.

  Background:
    Given a fake "keycloak" service
    And the access check for the client "sustenaut.eu" with the secret "a b", asking the "keycloak" service

  Scenario: It asks with the client's id and secret, and the person's token
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    When "a@x.org" is checked with the token "tok"
    Then the result's "reason" is "ok"
    And the "keycloak" service was asked "GET /realms/team/app-registration/sustenaut.eu/access-state" with the header "Authorization" set to "Basic c3VzdGVuYXV0LmV1OmElMjBi"
    And the "keycloak" service was asked "GET /realms/team/protocol/openid-connect/userinfo" with the header "Authorization" set to "Bearer tok"

  Scenario: A burst of requests makes one fetch of the hash
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    When "a@x.org" and "b@x.org" are checked at once
    Then the "keycloak" service was asked "GET /realms/team/app-registration/sustenaut.eu/access-state" 1 times
    And the "keycloak" service was asked "GET /realms/team/protocol/openid-connect/userinfo" 2 times

  Scenario: A hash fetched within 2 seconds is used again
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    And "a@x.org" and "b@x.org" were checked at once
    And 1 second passes
    When "a@x.org" is checked
    Then the "keycloak" service was asked "GET /realms/team/app-registration/sustenaut.eu/access-state" 1 times

  Scenario: An unchanged hash makes no second full check
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    And "a@x.org" and "b@x.org" were checked at once
    And 1 second passes
    And "a@x.org" was checked
    And 2 seconds pass
    When "a@x.org" is checked
    Then the "keycloak" service was asked "GET /realms/team/app-registration/sustenaut.eu/access-state" 2 times
    And the "keycloak" service was asked "GET /realms/team/protocol/openid-connect/userinfo" 2 times

  Scenario: Someone with the role is let in
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h2"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["opportunity"]}
      """
    When "a@x.org" is checked
    Then the result's "allowed" is "true"

  Scenario: A changed hash keeps the role until its 2 seconds are up
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h2"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["opportunity"]}
      """
    And "a@x.org" was checked
    When "a@x.org" is checked
    Then the result's "allowed" is "true"

  Scenario: A changed hash takes the role away at the next request after its 2 seconds
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h2"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["opportunity"]}
      """
    And "a@x.org" was checked
    And 2 seconds pass
    When "a@x.org" is checked
    Then the result's "allowed" is "false"
    And the result's "reason" is "no_role"

  Scenario: A full check waits 5 minutes with the hash unchanged
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    And "a@x.org" was checked
    And 299999 ms pass
    When "a@x.org" is checked
    Then the "keycloak" service was asked "GET /realms/team/protocol/openid-connect/userinfo" 1 times

  Scenario: A full check comes after 5 minutes even with the hash unchanged
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    And "a@x.org" was checked
    And 299999 ms pass
    And "a@x.org" was checked
    And 1 ms passes
    When "a@x.org" is checked
    Then the "keycloak" service was asked "GET /realms/team/protocol/openid-connect/userinfo" 2 times

  Scenario Outline: A refused token is sent to sign in
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h2"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with <status>
    And "a@x.org" was checked
    And 2 seconds pass
    When "a@x.org" is checked
    Then the result's "reason" is "sign_in"

    Examples:
      | status |
      | 401    |
      | 403    |

  Scenario Outline: A refused token is forgotten, so it isn't vouched for after
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h2"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with <status>
    And "a@x.org" was checked
    And 2 seconds pass
    And "a@x.org" was checked
    And Keycloak can't be reached
    And 2 seconds pass
    When "a@x.org" is checked
    Then the result's "reason" is "unavailable"

    Examples:
      | status |
      | 401    |
      | 403    |

  Scenario: No token is sent to sign in
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    When "a@x.org" is checked with no token
    Then the result's "reason" is "sign_in"

  Scenario: Keycloak unreachable: someone vouched for reads on, with their last roles
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release", "controller"]}
      """
    And "a@x.org" was checked
    And Keycloak can't be reached
    And 2 seconds pass
    When "a@x.org" is checked
    Then the result's "reason" is "degraded"
    And the result's "roles" is "[\"release\", \"controller\"]"

  Scenario: Keycloak unreachable: changes are refused
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release", "controller"]}
      """
    And "a@x.org" was checked
    And Keycloak can't be reached
    And 2 seconds pass
    When "a@x.org" is checked for a change
    Then the result's "reason" is "unavailable"

  Scenario: Keycloak unreachable: anyone not vouched for is refused
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release", "controller"]}
      """
    And "a@x.org" was checked
    And Keycloak can't be reached
    And 2 seconds pass
    When "b@x.org" is checked
    Then the result's "reason" is "unavailable"

  Scenario: The 503 before auth's key is set counts as unreachable
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 503
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    When "a@x.org" is checked
    Then the result's "reason" is "unavailable"

  Scenario: Keycloak unreachable: a stored hash that is the last one known is vouched for
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h2"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    And "a@x.org" was checked
    And 2 seconds pass
    And "b@x.org" was checked
    And Keycloak can't be reached
    And 2 seconds pass
    When "b@x.org" is checked
    Then the result's "reason" is "degraded"

  Scenario: Keycloak unreachable: a stored hash already out of date isn't vouched for
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h2"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    And "a@x.org" was checked
    And 2 seconds pass
    And "b@x.org" was checked
    And Keycloak can't be reached
    And 2 seconds pass
    When "a@x.org" is checked
    Then the result's "reason" is "unavailable"

  Scenario: Userinfo failing with the hash answering goes on the last answer
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 500
    And "a@x.org" was checked
    And 300 seconds pass
    When "a@x.org" is checked
    Then the result's "reason" is "degraded"

  Scenario: Userinfo failing with the hash answering refuses a change
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 500
    And "a@x.org" was checked
    And 300 seconds pass
    When "a@x.org" is checked for a change
    Then the result's "reason" is "unavailable"

  Scenario Outline: The role is matched by its exact name, and a bad claim gives nothing
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": <claim>}
      """
    When "a@x.org" is checked
    Then the result's "reason" is "no_role"

    Examples:
      | claim            |
      | ["released"]     |
      | ["role:release"] |
      | []               |
      | "release"        |
      | [1]              |

  Scenario: It remembers at most so many people
    Given the "keycloak" service answers "GET /realms/team/app-registration/sustenaut.eu/access-state" with 200 and:
      """
      {"hash": "h1"}
      """
    And the "keycloak" service answers "GET /realms/team/protocol/openid-connect/userinfo" with 200 and:
      """
      {"access": ["release"]}
      """
    And the access check remembers at most 1 person
    When "a@x.org" is checked
    And "b@x.org" is checked
    And "a@x.org" is checked
    Then the "keycloak" service was asked "GET /realms/team/protocol/openid-connect/userinfo" 3 times

  Scenario: An email list lets those on it do everything, and asks nobody
    Given access by the email list "a@x.org", granting "release,controller"
    When "a@x.org" is checked
    Then the result's "allowed" is "true"
    And the result's "reason" is "ok"
    And the result's "roles" is "[\"release\", \"controller\"]"
    And the "keycloak" service was asked nothing

  Scenario: An email list lets nobody else in
    Given access by the email list "a@x.org", granting "release,controller"
    When "b@x.org" is checked
    Then the result's "allowed" is "false"
    And the result's "reason" is "no_role"
    And the result's "roles" is "[]"
