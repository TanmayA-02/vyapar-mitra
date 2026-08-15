# Vyapar Mitra

PS-12 prototype: takes a plain-language description of a small/informal Indian
business and returns, in plain language, the GST registration status, income
tax bracket (presumptive taxation), MSME/Udyam classification, and the
government benefits (loans, subsidies, protections) it would unlock.

## Stack

- **Backend:** Node.js + Express
- **Extraction:** `extractProfile.js` — rule-based keyword/regex matching.
  Turns free text into a structured business profile (type, sector, turnover,
  state, category, investment, etc). No API calls, no external dependencies,
  works fully offline.
- **Rules engine:** `rulesEngine.js` — plain deterministic logic encoding GST
  thresholds, Sec 44AD/44ADA presumptive taxation, 2020 MSME classification,
  and benefit eligibility (CGTMSE, PMEGP, Mudra, Stand-Up India, etc).
- **Frontend:** Single-page vanilla HTML/CSS/JS, no build step.

## Setup

```bash
npm install
npm start
```

Then open http://localhost:3000. No API key, `.env` file, or internet
connection required — everything runs locally.

## How it works

1. User types a free-text business description into the textarea.
2. `POST /api/advise` passes it to `extractProfile()` in `extractProfile.js`,
   which matches keywords/regex patterns for business type, sector, turnover
   (with unit/period parsing — "35,000 rupees a month" → annualized), state,
   applicant category, employee count, investment, and digital-payment mix.
   Anything not explicitly stated gets a reasonable default, logged in
   `confidenceNotes` so the user knows what to double check.
3. The extracted profile is passed to `computeAdvisory()` in
   `rulesEngine.js` — pure deterministic logic, fully auditable, with no
   external calls anywhere in the request path.
4. The frontend renders a plain-language summary, a GST/Income-Tax/Udyam
   stat grid, and a benefits checklist.

## Note on this build

This prototype intentionally uses rule-based extraction instead of an LLM,
so it runs with zero setup and no API key for offline/judged demos. The
tradeoff: it only recognizes phrasing that matches its keyword lists (see
`BUSINESS_TYPES`, `STATE_NAMES`, etc. in `extractProfile.js`) — free-form or
unusual descriptions may fall back to defaults rather than being understood.
A production version would likely use an LLM for genuinely open-ended
language understanding, with this rules engine unchanged as the
deterministic backend.

## Important caveat for the demo

The rules engine uses **illustrative figures** for GST thresholds, income tax
slabs, and MSME classification, based on publicly known rules as of this
build. Real tax law changes with every Union Budget — say this explicitly
during the pitch, and frame the real product as syncing live with the GST
portal / CBDT notifications / udyamregistration.gov.in rather than
hardcoding numbers.

## What's not built (roadmap talking points for the pitch)

- Live sync with GST/Income-Tax portal APIs instead of hardcoded slabs
- Multi-language support (Hindi + regional languages) — most target users
  aren't comfortable in English
- Voice input for low-literacy users
- SMS/WhatsApp bot version for feature-phone reach
- Auto-filled Udyam registration form (one-click from the advisory)
- Persistent user accounts to track registration progress over time
