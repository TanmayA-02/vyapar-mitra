import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeAdvisory } from "./rulesEngine.js";
import { extractProfile, BUSINESS_TYPES, STATE_NAMES, SPECIAL_CATEGORY_STATES } from "./extractProfile.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// What to ask the user for when extractProfile() can't determine a field
// with any confidence — rather than silently guessing a number or category.
const MISSING_FIELD_HINTS = {
  revenue: `your approximate income — monthly or yearly (e.g. "₹30,000 a month" or "₹5 lakh a year")`,
  expenses: `your approximate total expenses — monthly or yearly (e.g. "spend about ₹10,000 a month on rent and supplies")`,
  business_type: "what your business sells or does — goods/products, a service, or both",
};

function titleCase(str) {
  return str.replace(/\w\S*/g, (word, index) => {
    if (index !== 0 && (word === "and" || word === "of")) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}

// Indian financial year runs April–March. "FY 2026-27" starting today means
// April 2026 through March 2027, so a month index < 3 (Jan–Mar) belongs to
// the FY that started the previous calendar year.
function currentFY(date = new Date()) {
  const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

function financialYearOptions() {
  const [currentStart] = currentFY().split("-").map(Number);
  return [currentStart - 2, currentStart - 1, currentStart].map((y) => `${y}-${String(y + 1).slice(-2)}`);
}

// Backs the precise-mode dropdowns — sourced live from the same vocabulary
// the free-text extractor uses, so the two input paths can never drift apart
// on what counts as a valid business type or state.
app.get("/api/form-options", (req, res) => {
  const businessTypes = BUSINESS_TYPES.map((t) => ({ id: t.label, label: t.label }));
  const states = STATE_NAMES
    .map((s) => ({ value: s, label: titleCase(s), special: SPECIAL_CATEGORY_STATES.has(s) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  res.json({ businessTypes, states, financialYears: financialYearOptions(), currentFinancialYear: currentFY() });
});

// Precise mode skips the free-text extractor entirely — the user supplied
// exact values, so there's nothing to parse. Fields precise mode doesn't
// collect (applicant category, urban/rural, digital-receipts mix) fall back
// to the same neutral defaults the free-text path uses when it can't find
// them, so both paths stay comparable for equivalent input.
function buildPreciseProfile(body) {
  const businessTypeId = (body.businessTypeId || "").trim();
  const match = BUSINESS_TYPES.find((t) => t.label === businessTypeId);
  if (!match) return { error: "Please choose a business type." };

  const state = (body.state || "").trim().toLowerCase();
  if (!state || !STATE_NAMES.includes(state)) return { error: "Please choose a business location." };

  const turnover = Number(body.estimatedAnnualTurnoverINR);
  if (!Number.isFinite(turnover) || turnover < 0) return { error: "Please enter a valid annual revenue (0 or more)." };

  const expenses = Number(body.estimatedAnnualExpensesINR);
  if (!Number.isFinite(expenses) || expenses < 0) return { error: "Please enter valid annual expenses (0 or more)." };

  const employeeCountRaw = Number(body.employeeCount);
  const employeeCount = Number.isFinite(employeeCountRaw) ? Math.max(0, Math.round(employeeCountRaw)) : 0;

  const yearsOperatingRaw = Number(body.yearsOperating);
  const yearsOperating = Number.isFinite(yearsOperatingRaw) ? Math.max(0, Math.round(yearsOperatingRaw)) : 0;

  // Cash % is what the form asks for (matches how a business owner thinks
  // about it); the rules engine wants the digital share, so convert here.
  const cashPercentRaw = Number(body.cashReceiptsPercent);
  const cashPercent = Number.isFinite(cashPercentRaw) ? Math.min(100, Math.max(0, cashPercentRaw)) : null;
  const digitalReceiptsPercent = cashPercent === null ? 40 : Math.round(100 - cashPercent);

  const isInterState = body.isInterState === true;
  const sellsOnEcommerce = body.sellsOnEcommerce === true;

  const financialYear = (body.financialYear || "").trim() || currentFY();

  return {
    financialYear,
    profile: {
      businessType: match.label,
      sector: match.sector,
      isProfessional: match.isProfessional,
      estimatedAnnualTurnoverINR: Math.round(turnover),
      estimatedAnnualExpensesINR: Math.round(expenses),
      state,
      isSpecialCategoryState: SPECIAL_CATEGORY_STATES.has(state),
      category: "general",
      areaType: "unspecified",
      employeeCount,
      yearsOperating,
      estimatedInvestmentINR: Math.max(50000, Math.round(turnover * 0.15)),
      digitalReceiptsPercent,
      isInterState,
      sellsOnEcommerce,
      confidenceNotes:
        "Entered directly via precise mode — business type, location, revenue, expenses, employees, years " +
        "operating, cash-receipts mix, inter-state sales, and e-commerce sales are exact. Applicant category, " +
        "urban/rural area, and investment aren't collected in precise mode and are defaulted.",
    },
  };
}

app.post("/api/advise", (req, res) => {
  if (req.body?.mode === "precise") {
    const { profile, financialYear, error } = buildPreciseProfile(req.body || {});
    if (error) return res.status(422).json({ error });
    try {
      return res.json({ ...computeAdvisory(profile), financialYear });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message || "Something went wrong while generating advice." });
    }
  }

  const description = (req.body?.description || "").trim();
  if (!description) {
    return res.status(400).json({ error: "Please describe your business." });
  }

  try {
    const { profile, missing } = extractProfile(description);
    if (missing.length) {
      const hints = missing.map((field) => MISSING_FIELD_HINTS[field] || field);
      const error =
        hints.length === 1
          ? `We couldn't find enough detail to estimate your bracket. Please add ${hints[0]}.`
          : `We couldn't find enough detail to estimate your bracket. Please add: ${hints.join("; and ")}.`;
      return res.status(422).json({ error, missingFields: missing });
    }

    const advisory = computeAdvisory(profile);
    res.json({ ...advisory, financialYear: currentFY() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Something went wrong while generating advice." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Vyapar Mitra running at http://localhost:${PORT}`);
});
