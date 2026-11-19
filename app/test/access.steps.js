// The access check against auth's contract, with Keycloak answered by pubtest's fake
// "keycloak" service, on a clock the scenario moves.
import { Given, When } from "@cucumber/cucumber";
import { accessCheck, emailAccess } from "../access.js";

// A decision, with its roles as a list, so the result's steps read them.
const shown = (decision) => ({ ...decision, roles: [...decision.roles] });

function realm(world, options = {}) {
  return accessCheck({
    realmUrl: `${process.env.KEYCLOAK_URL}/realms/team/`, clientId: world.client, clientSecret: world.secret, role: "release",
    now: () => world.time,
    // Keycloak that can't be reached is a fetch that fails, as a refused connection does.
    request: async (url, init) => {
      if (world.keycloakDown) throw new Error("connection refused");
      return fetch(url, init);
    },
    ...options,
  });
}

Given("the access check for the client {string} with the secret {string}, asking the {string} service", function (client, secret, _name) {
  Object.assign(this, { client, secret });
  this.check = realm(this);
});

Given("the access check remembers at most {int} person(s)", function (maxPeople) {
  this.check = realm(this, { maxPeople });
});

Given("access by the email list {string}, granting {string}", function (emails, roles) {
  this.check = emailAccess(emails.split(","), roles.split(","));
});

Given("Keycloak can't be reached", function () {
  this.keycloakDown = true;
});

Given("{string} was checked", async function (person) {
  await this.check(person, "t");
});

Given("{string} and {string} were checked at once", async function (a, b) {
  await Promise.all([this.check(a, "t"), this.check(b, "t")]);
});

When("{string} is checked", async function (person) {
  await this.attempt(async () => shown(await this.check(person, "t")));
});

When("{string} is checked with the token {string}", async function (person, token) {
  await this.attempt(async () => shown(await this.check(person, token)));
});

When("{string} is checked with no token", async function (person) {
  await this.attempt(async () => shown(await this.check(person, "")));
});

When("{string} is checked for a change", async function (person) {
  await this.attempt(async () => shown(await this.check(person, "t", { write: true })));
});

When("{string} and {string} are checked at once", async function (a, b) {
  await this.attempt(async () => (await Promise.all([this.check(a, "t"), this.check(b, "t")])).map(shown));
});
