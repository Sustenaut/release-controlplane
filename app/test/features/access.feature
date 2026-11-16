@access
Feature: The access check against auth's contract, with Keycloak answered here

  Scenario: It asks with the client's id and secret, and the person's token
    Then it asks with the client's id and secret, and the person's token

  Scenario: An unchanged hash makes no second full check, and a burst makes one fetch
    Then an unchanged hash makes no second full check, and a burst makes one fetch

  Scenario: A changed hash takes the role away at the next request after its 2 seconds
    Then a changed hash takes the role away at the next request after its 2 seconds

  Scenario: A full check comes after 5 minutes even with the hash unchanged
    Then a full check comes after 5 minutes even with the hash unchanged

  Scenario: A refused token, or none, is sent to sign in, and forgotten
    Then a refused token, or none, is sent to sign in, and forgotten

  Scenario: Keycloak unreachable: someone vouched for reads on, changes are refused, and so is anyone else
    Then Keycloak unreachable: someone vouched for reads on, changes are refused, and so is anyone else

  Scenario: The 503 before auth's key is set counts as unreachable
    Then the 503 before auth's key is set counts as unreachable

  Scenario: A stored hash already out of date isn't vouched for
    Then a stored hash already out of date isn't vouched for

  Scenario: Userinfo failing with the hash answering goes on the last answer
    Then userinfo failing with the hash answering goes on the last answer

  Scenario: The role is matched by its exact name, and a bad claim gives nothing
    Then the role is matched by its exact name, and a bad claim gives nothing

  Scenario: It remembers at most so many people
    Then it remembers at most so many people

  Scenario: An email list lets those on it do everything, and asks nobody
    Then an email list lets those on it do everything, and asks nobody
