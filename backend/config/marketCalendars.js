// Exchange full-day closures used by StockDekho's session model. Keep this
// data annual and review it against the relevant exchange calendar before a
// new year begins. Unknown dates remain governed by weekday/session logic;
// they are never guessed from a provider retrieval timestamp.
const MARKET_HOLIDAYS = Object.freeze({
  INDIA: Object.freeze({
    "2026-01-26": "Republic Day",
    "2026-03-03": "Holi",
    "2026-03-26": "Shri Ram Navami",
    "2026-03-31": "Shri Mahavir Jayanti",
    "2026-04-03": "Good Friday",
    "2026-04-14": "Dr. B. R. Ambedkar Jayanti",
    "2026-05-01": "Maharashtra Day",
    "2026-10-02": "Mahatma Gandhi Jayanti",
    "2026-12-25": "Christmas",
  }),
  US: Object.freeze({
    "2026-01-01": "New Year's Day",
    "2026-01-19": "Martin Luther King Jr. Day",
    "2026-02-16": "Washington's Birthday",
    "2026-04-03": "Good Friday",
    "2026-05-25": "Memorial Day",
    "2026-06-19": "Juneteenth",
    "2026-07-03": "Independence Day (observed)",
    "2026-09-07": "Labor Day",
    "2026-11-26": "Thanksgiving Day",
    "2026-12-25": "Christmas",
  }),
  UK: Object.freeze({
    "2026-01-01": "New Year's Day",
    "2026-04-03": "Good Friday",
    "2026-04-06": "Easter Monday",
    "2026-05-04": "Early May Bank Holiday",
    "2026-05-25": "Spring Bank Holiday",
    "2026-08-31": "Late Summer Bank Holiday",
    "2026-12-25": "Christmas",
    "2026-12-28": "Boxing Day (substitute day)",
  }),
  GERMANY: Object.freeze({
    "2026-01-01": "New Year's Day",
    "2026-04-03": "Good Friday",
    "2026-04-06": "Easter Monday",
    "2026-05-01": "Labour Day",
    "2026-12-24": "Christmas Eve",
    "2026-12-25": "Christmas",
    "2026-12-31": "New Year's Eve",
  }),
  JAPAN: Object.freeze({
    "2026-01-01": "New Year's Day",
    "2026-01-02": "Exchange holiday",
    "2026-01-12": "Coming of Age Day",
    "2026-02-11": "National Foundation Day",
    "2026-02-23": "Emperor's Birthday",
    "2026-03-20": "Vernal Equinox Day",
    "2026-04-29": "Showa Day",
    "2026-05-04": "Greenery Day",
    "2026-05-05": "Children's Day",
    "2026-05-06": "Constitution Memorial Day (observed)",
    "2026-07-20": "Marine Day",
    "2026-08-11": "Mountain Day",
    "2026-09-21": "Respect for the Aged Day",
    "2026-09-22": "Citizen's Holiday",
    "2026-09-23": "Autumnal Equinox Day",
    "2026-10-12": "Sports Day",
    "2026-11-03": "Culture Day",
    "2026-11-23": "Labour Thanksgiving Day",
    "2026-12-31": "Exchange holiday",
  }),
  HONG_KONG: Object.freeze({
    "2026-01-01": "New Year's Day",
    "2026-02-17": "Lunar New Year",
    "2026-02-18": "Lunar New Year",
    "2026-02-19": "Lunar New Year",
    "2026-04-03": "Good Friday",
    "2026-04-06": "Easter Monday",
    "2026-04-07": "Ching Ming Festival (observed)",
    "2026-05-01": "Labour Day",
    "2026-05-25": "Buddha's Birthday",
    "2026-06-19": "Tuen Ng Festival",
    "2026-07-01": "HKSAR Establishment Day",
    "2026-10-01": "National Day",
    "2026-10-19": "Chung Yeung Festival",
    "2026-12-25": "Christmas",
  }),
  SOUTH_KOREA: Object.freeze({
    "2026-01-01": "New Year's Day",
    "2026-02-16": "Seollal",
    "2026-02-17": "Seollal",
    "2026-02-18": "Seollal",
    "2026-03-02": "Independence Movement Day (observed)",
    "2026-05-05": "Children's Day",
    "2026-05-25": "Buddha's Birthday (observed)",
    "2026-08-17": "Liberation Day (observed)",
    "2026-09-24": "Chuseok",
    "2026-09-25": "Chuseok",
    "2026-10-05": "National Foundation Day (observed)",
    "2026-10-09": "Hangul Day",
    "2026-12-25": "Christmas",
    "2026-12-31": "Exchange year-end holiday",
  }),
  TAIWAN: Object.freeze({
    "2026-01-01": "Republic Day",
    "2026-02-16": "Lunar New Year holiday",
    "2026-02-17": "Lunar New Year",
    "2026-02-18": "Lunar New Year holiday",
    "2026-02-19": "Lunar New Year holiday",
    "2026-02-20": "Lunar New Year holiday",
    "2026-02-27": "Peace Memorial Day (observed)",
    "2026-04-03": "Children's Day (observed)",
    "2026-04-06": "Tomb Sweeping Day (observed)",
    "2026-05-01": "Labour Day",
    "2026-06-19": "Dragon Boat Festival",
    "2026-09-25": "Mid-Autumn Festival",
    "2026-10-09": "National Day (observed)",
  }),
});

function marketClosure(calendar, dateKey, weekday) {
  if (["Sat", "Sun"].includes(weekday)) {
    return { closed: true, type: "weekend", name: "Weekend" };
  }
  const name = MARKET_HOLIDAYS[calendar]?.[dateKey];
  return name
    ? { closed: true, type: "holiday", name }
    : { closed: false, type: null, name: null };
}

module.exports = { MARKET_HOLIDAYS, marketClosure };
