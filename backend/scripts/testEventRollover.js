const assert = require("assert");
const { selectFutureDate } = require("../services/eventsService");

assert.strictEqual(
  selectFutureDate(["2026-10-15T18:30:00.000Z"], new Date("2026-10-16T00:00:00.000Z").getTime()),
  null,
  "Past earnings dates are never upcoming"
);
assert.strictEqual(
  selectFutureDate(
    ["2026-10-15T18:30:00.000Z", "2027-01-10T00:00:00.000Z"],
    new Date("2026-12-31T23:59:00.000Z").getTime()
  ),
  "2027-01-10T00:00:00.000Z",
  "Upcoming-event selection works across year boundaries"
);

console.log("Event rollover checks passed.");
