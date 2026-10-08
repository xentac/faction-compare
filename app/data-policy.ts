// The data use policy Torn's API Terms of Service asks every tool to publish:
// one row per column of Torn's disclosure table, each with a value from
// Torn's fixed list and a note saying exactly what this site does. The login
// form's policy dialog renders it and the README links here, so this file is
// the only copy.

// Tags every request to api.torn.com, so the key owner can pick this site's
// requests out of their Torn API log.
export const TORN_API_COMMENT = "faction-compare";

export function tornFactionUrl(factionId: string, key: string): string {
  const query = new URLSearchParams({
    selections: "basic",
    key,
    comment: TORN_API_COMMENT,
  });
  return `https://api.torn.com/faction/${factionId}?${query.toString()}`;
}

export const FF_SCOUTER_URL = "https://ffscouter.com";
export const FF_SCOUTER_PRIVACY_URL = "https://ffscouter.com/privacy";

// The selections FF Scouter asks a registered key to have, as listed on
// ffscouter.com when last checked. FF Scouter can change them.
export const FF_SCOUTER_SELECTIONS_CHECKED = "2026-10-08";
export const FF_SCOUTER_SELECTIONS = {
  user: [
    "basic",
    "faction",
    "profile",
    "battlestats",
    "personalstats",
    "hof",
    "attacks",
    "cooldowns",
    "refills",
  ],
  faction: ["members", "rankedwarreport", "warfare", "wars", "rankedwars"],
  torn: ["rankedwarreport", "rankedwars"],
} as const;

// The values Torn's API Terms of Service allow in each column.
export const TORN_POLICY_VALUES = {
  dataStorage: [
    "No / Only locally",
    "Temporary - less than a minute",
    "Temporary - less than a day",
    "Persistent - until account deletion",
    "Persistent - forever",
  ],
  dataSharing: [
    "Nobody",
    "Faction",
    "Friends & faction",
    "General public",
    "Service owners",
    "Service owners & their customers",
  ],
  purposeOfUse: [
    "Non malicious statistical analysis",
    "Public amusement",
    "Public community tools",
    "Competitive advantage",
    "Personal gain",
    "Other",
  ],
  keyStorageAndSharing: [
    "Not stored / Not shared",
    "Stored / Used only for automation",
    "Stored / Shared with the faction",
    "Stored / Shared with other services",
  ],
  keyAccessLevel: ["Public", "Minimal", "Limited", "Full", "Custom"],
} as const;

type PolicyColumn = keyof typeof TORN_POLICY_VALUES;

export interface PolicyRow<C extends PolicyColumn = PolicyColumn> {
  column: C;
  heading: string;
  // Torn's question for the column.
  question: string;
  value: (typeof TORN_POLICY_VALUES)[C][number];
  // The text Torn asks for after values marked [specify].
  specify?: string;
  // Text between backticks is shown as code, as in Markdown.
  notes: string[];
  links: { label: string; href: string }[];
}

export const DATA_POLICY: {
  [C in PolicyColumn]: PolicyRow<C>;
}[PolicyColumn][] = [
  {
    column: "dataStorage",
    heading: "Data Storage",
    question: "Will the data be stored for any purpose?",
    value: "No / Only locally",
    notes: [
      "Your browser's `localStorage` keeps your API key and the IDs of the two factions you compare, until you press Reset (faction IDs) or Logout (key).",
      "Data fetched from Torn and FF Scouter is held in memory only and is gone when you reload or close the page.",
    ],
    links: [],
  },
  {
    column: "dataSharing",
    heading: "Data Sharing",
    question: "Who can access the data besides the end user?",
    value: "Nobody",
    notes: [
      "All data this site accesses is stored locally on your device only. This site has no server; nothing is sent to us.",
      "Each visitor uses their own key, and what it fetches stays in their own browser tab.",
    ],
    links: [],
  },
  {
    column: "purposeOfUse",
    heading: "Purpose of Use",
    question: "What is the stored data being used for?",
    value: "Other",
    specify:
      "No API data is stored. Fetched data is held in memory only, to compare two factions' members before a war.",
    notes: [],
    links: [],
  },
  {
    column: "keyStorageAndSharing",
    heading: "Key Storage & Sharing",
    question: "Will the API key be stored securely and who can access it?",
    value: "Stored / Shared with other services",
    notes: [
      "Your browser stores the key in `localStorage` until you press Logout. It never reaches us.",
      `The key is sent to \`api.torn.com\` to read \`/faction/{id}?selections=basic\` (API v1): once for a faction ID you enter, to find the two factions in its ranked war, then once for each faction, to read its basic information and members. These requests are tagged \`comment=${TORN_API_COMMENT}\`, so you can find them in your Torn API log.`,
      `The key is sent to FF Scouter (\`${FF_SCOUTER_URL}/api/v1/get-stats\`) with each faction's member IDs, to fetch their battle score estimates. FF Scouter uses the key in accordance with its own data use policy.`,
    ],
    links: [
      { label: "FF Scouter's data use policy", href: FF_SCOUTER_PRIVACY_URL },
    ],
  },
  {
    column: "keyAccessLevel",
    heading: "Key Access Level",
    question: "What key access level or specific selections are required?",
    value: "Custom",
    specify: `The selections FF Scouter requires (as of ${FF_SCOUTER_SELECTIONS_CHECKED}): user: ${FF_SCOUTER_SELECTIONS.user.join(", ")}; faction: ${FF_SCOUTER_SELECTIONS.faction.join(", ")}; torn: ${FF_SCOUTER_SELECTIONS.torn.join(", ")}.`,
    notes: [
      "This site requires a Torn API key registered with FF Scouter and does not work without one. FF Scouter also accepts Limited and Full keys, and its requirements may have changed since the date above.",
    ],
    links: [
      { label: "FF Scouter's current key requirements", href: FF_SCOUTER_URL },
    ],
  },
];
