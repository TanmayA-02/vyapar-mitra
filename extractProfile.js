// Rule-based / keyword-matching extractor. Turns a free-text business
// description into the profile shape rulesEngine.computeAdvisory() expects.
// No API calls, no external dependencies — pure string matching.
//
// extractProfile() returns { profile, missing }. `profile` is null and
// `missing` lists the unresolvable fields ("revenue", "expenses",
// "business_type") when the description doesn't contain enough signal to
// compute a real advisory — callers should ask the user to clarify rather
// than guessing a number or a business category on their behalf.

const SPECIAL_CATEGORY_STATES = new Set([
  "arunachal pradesh", "assam", "manipur", "meghalaya", "mizoram",
  "nagaland", "sikkim", "tripura", "himachal pradesh", "uttarakhand",
  "jammu and kashmir",
]);

const STATE_NAMES = [
  "andhra pradesh", "arunachal pradesh", "assam", "bihar", "chhattisgarh",
  "goa", "gujarat", "haryana", "himachal pradesh", "jharkhand", "karnataka",
  "kerala", "madhya pradesh", "maharashtra", "manipur", "meghalaya",
  "mizoram", "nagaland", "odisha", "punjab", "rajasthan", "sikkim",
  "tamil nadu", "telangana", "tripura", "uttar pradesh", "uttarakhand",
  "west bengal", "jammu and kashmir", "ladakh", "delhi", "chandigarh",
  "puducherry",
];

// Common city -> state inference, so "Lucknow" or "Bengaluru" still resolves.
const CITY_TO_STATE = {
  mumbai: "maharashtra", pune: "maharashtra", nagpur: "maharashtra",
  bengaluru: "karnataka", bangalore: "karnataka", mysuru: "karnataka",
  chennai: "tamil nadu", coimbatore: "tamil nadu", madurai: "tamil nadu",
  kolkata: "west bengal", howrah: "west bengal",
  hyderabad: "telangana", warangal: "telangana",
  ahmedabad: "gujarat", surat: "gujarat", vadodara: "gujarat", rajkot: "gujarat",
  jaipur: "rajasthan", jodhpur: "rajasthan", udaipur: "rajasthan",
  lucknow: "uttar pradesh", kanpur: "uttar pradesh", varanasi: "uttar pradesh",
  agra: "uttar pradesh", noida: "uttar pradesh", ghaziabad: "uttar pradesh",
  patna: "bihar", gaya: "bihar",
  bhopal: "madhya pradesh", indore: "madhya pradesh", jabalpur: "madhya pradesh",
  chandigarh: "chandigarh", ludhiana: "punjab", amritsar: "punjab",
  guwahati: "assam", shillong: "meghalaya",
  shimla: "himachal pradesh", dehradun: "uttarakhand", haridwar: "uttarakhand",
  srinagar: "jammu and kashmir", jammu: "jammu and kashmir",
  bhubaneswar: "odisha", cuttack: "odisha",
  ranchi: "jharkhand", raipur: "chhattisgarh",
  kochi: "kerala", thiruvananthapuram: "kerala", kozhikode: "kerala",
  gurgaon: "haryana", gurugram: "haryana", faridabad: "haryana",
  delhi: "delhi", "new delhi": "delhi",
};

const URBAN_HINTS = ["city", "urban", "town", "metro"];
const RURAL_HINTS = ["village", "rural", "gram panchayat", "gaon", "hamlet"];

// [keywords], label, sector, isProfessional
const BUSINESS_TYPES = [
  { keywords: ["tailor", "tailoring", "stitching", "boutique", "alteration"], label: "Tailoring / boutique", sector: "services", isProfessional: false },
  { keywords: ["kirana", "grocery", "provision store", "general store"], label: "Grocery / kirana store", sector: "goods", isProfessional: false },
  { keywords: ["tea stall", "chai stall", "snack", "food cart", "dhaba", "street food", "vendor", "hawker"], label: "Street food / vendor stall", sector: "goods", isProfessional: false },
  { keywords: ["manufactur", "factory", "production unit", "packaging unit", "workshop"], label: "Manufacturing unit", sector: "goods", isProfessional: false },
  { keywords: ["software", "developer", "programmer", "app development", "it consult", "it services"], label: "IT / software services", sector: "services", isProfessional: true },
  { keywords: ["graphic design", "web design", "content writ", "copywrit", "freelance design", "illustrat"], label: "Freelance creative / digital services", sector: "services", isProfessional: false },
  { keywords: ["lawyer", "advocate", "legal consult", "law firm"], label: "Legal practice", sector: "services", isProfessional: true },
  { keywords: ["doctor", "clinic", "physician", "dental", "medical practice", "hospital"], label: "Medical practice", sector: "services", isProfessional: true },
  { keywords: ["architect"], label: "Architecture practice", sector: "services", isProfessional: true },
  { keywords: ["chartered accountant", "ca firm", "accounting service", "bookkeep", "auditor"], label: "Accounting / CA services", sector: "services", isProfessional: true },
  { keywords: ["engineering consult", "engineer"], label: "Engineering consultancy", sector: "services", isProfessional: true },
  { keywords: ["salon", "parlour", "parlor", "beauty"], label: "Salon / beauty services", sector: "services", isProfessional: false },
  { keywords: ["restaurant", "cafe", "eatery", "catering", "dhaba", "bakery"], label: "Restaurant / catering", sector: "both", isProfessional: false },
  { keywords: ["transport", "taxi", "cab driver", "auto driver", "delivery", "logistics"], label: "Transport / delivery services", sector: "services", isProfessional: false },
  { keywords: ["carpenter", "electrician", "plumber", "mechanic", "repair shop"], label: "Skilled trade services", sector: "services", isProfessional: false },
  { keywords: ["artisan", "handicraft", "handloom", "weav", "potter", "craft"], label: "Artisan / handicraft", sector: "goods", isProfessional: false },
  { keywords: ["retail", "shop", "store"], label: "Retail shop", sector: "goods", isProfessional: false },
];

function findBusinessType(text) {
  for (const type of BUSINESS_TYPES) {
    if (type.keywords.some((kw) => text.includes(kw))) return type;
  }
  return null;
}

function findState(text) {
  for (const state of STATE_NAMES) {
    if (text.includes(state)) return { state, viaCity: false };
  }
  for (const [city, state] of Object.entries(CITY_TO_STATE)) {
    if (text.includes(city)) return { state, viaCity: true };
  }
  return { state: "", viaCity: false };
}

function findAreaType(text, stateMatchedViaCity) {
  if (RURAL_HINTS.some((w) => text.includes(w))) return "rural";
  if (URBAN_HINTS.some((w) => text.includes(w)) || stateMatchedViaCity) return "urban";
  return "unspecified";
}

function findCategory(text) {
  if (/\bscheduled tribe\b|\bst category\b|\bst\/sc\b|\bsc\/st\b/.test(text)) return "st";
  if (/\bscheduled caste\b|\bsc category\b/.test(text)) return "sc";
  if (/\bobc\b|other backward class/.test(text)) return "obc";
  if (/\bdivyang\b|differently.?abled|\bdisab(led|ility)\b|\bpwd\b/.test(text)) return "pwd";
  if (/women.?(owned|entrepreneur|led|run)|woman.?(owned|entrepreneur|led|run)|run by (a )?woman|female entrepreneur|\bi am a woman\b|\bshe runs\b/.test(text)) return "women";
  return "general";
}

const WORD_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function findEmployeeCount(text) {
  const explicit = text.match(
    /\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(employees|workers|staff|helpers|helper|people|persons|artisans|tailors)\b/
  );
  if (explicit) {
    const raw = explicit[1];
    return /^\d+$/.test(raw) ? parseInt(raw, 10) : WORD_NUMBERS[raw];
  }
  if (/me and my|myself and|my (wife|husband|brother|sister|son|daughter|partner|friend) (works?|helps?)/.test(text)) return 1;
  if (/\bsolo\b|\balone\b|by myself|\bjust me\b|\bonly me\b/.test(text)) return 0;
  return null; // unknown — caller decides default
}

// Boundary between clauses — a description that packs several money figures
// into one sentence ("I earn 35,000 a month and spend 15,000 a month on
// rent") must not let one figure's context bleed into its neighbor's.
const CLAUSE_BOUNDARY_RE = /[,.;]| and /gi;

function clauseAround(text, start, end) {
  CLAUSE_BOUNDARY_RE.lastIndex = 0;
  let left = 0;
  let m;
  while ((m = CLAUSE_BOUNDARY_RE.exec(text)) !== null) {
    if (m.index >= start) break;
    left = m.index + m[0].length;
  }
  CLAUSE_BOUNDARY_RE.lastIndex = end;
  const after = CLAUSE_BOUNDARY_RE.exec(text);
  const right = after ? after.index : text.length;
  return text.slice(left, right);
}

// Finds money-like tokens: requires either a currency marker (₹/rs/inr/rupees)
// or a magnitude suffix (lakh/crore/thousand/k) so bare counts ("8 workers")
// never get parsed as amounts.
function findMoneyMatches(text) {
  // Group 2's first alternative requires at least one comma group, so a plain
  // 4+ digit number like "2000" (no commas) falls through to the second
  // alternative instead of being truncated to its first 3 digits.
  const re = /(₹|\brs\.?\s|\binr\b|\brupees\b)?\s*(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|crore|crores|\bcr\b|\bk\b|thousand)?\s*(rupees|\brs\.?\b|\binr\b)?/gi;
  const matches = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const hasCurrency = !!(m[1] || m[4]);
    const multiplierWord = (m[3] || "").toLowerCase();
    if (!hasCurrency && !multiplierWord) continue;
    const numeric = parseFloat(m[2].replace(/,/g, ""));
    if (Number.isNaN(numeric)) continue;
    let value = numeric;
    if (/lakh|lac/.test(multiplierWord)) value = numeric * 100000;
    else if (/crore|\bcr\b/.test(multiplierWord)) value = numeric * 10000000;
    else if (/thousand|\bk\b/.test(multiplierWord)) value = numeric * 1000;
    matches.push({ value, index: m.index, context: clauseAround(text, m.index, m.index + m[0].length) });
  }
  return matches;
}

function periodMultiplier(context) {
  if (/per\s*day|\bdaily\b|\/day\b|\ba day\b/.test(context)) return 365;
  if (/per\s*week|\bweekly\b|\ba week\b/.test(context)) return 52;
  if (/per\s*month|\bmonthly\b|\/month\b|\/mo\b|\ba month\b/.test(context)) return 12;
  if (/per\s*year|\byearly\b|\bannual(ly)?\b|per annum|\bp\.?a\.?\b|\ba year\b/.test(context)) return 1;
  return null; // no explicit period found
}

const TURNOVER_CONTEXT = /turnover|earn|income|revenue|sales|business does|make about|makes about|profit/;
const INVESTMENT_CONTEXT = /machinery|equipment|invest|capital|worth of|worth\b/;
const EXPENSE_CONTEXT = /expense|\bspend(s|ing)?\b|\bspent\b|\bcost(s|ing)?\b|overhead|\brent(s|ing|ed)?\b|supplies|supply|expenditure|raw material/;

function findTurnover(text, moneyMatches) {
  const withContext = moneyMatches.filter((m) => TURNOVER_CONTEXT.test(m.context) && !INVESTMENT_CONTEXT.test(m.context) && !EXPENSE_CONTEXT.test(m.context));
  const pool = withContext.length ? withContext : moneyMatches.filter((m) => !INVESTMENT_CONTEXT.test(m.context) && !EXPENSE_CONTEXT.test(m.context));
  if (!pool.length) return null;
  const candidate = pool[0];
  const period = periodMultiplier(candidate.context);
  const annualized = candidate.value * (period || 1);
  return { value: annualized, wasAnnualized: !!period && period !== 1 };
}

function findInvestment(text, moneyMatches) {
  const withContext = moneyMatches.filter((m) => INVESTMENT_CONTEXT.test(m.context) && !EXPENSE_CONTEXT.test(m.context));
  if (!withContext.length) return null;
  return withContext[0].value;
}

function findExpenses(text, moneyMatches) {
  const withContext = moneyMatches.filter((m) => EXPENSE_CONTEXT.test(m.context) && !INVESTMENT_CONTEXT.test(m.context));
  if (!withContext.length) return null;
  const candidate = withContext[0];
  const period = periodMultiplier(candidate.context);
  const annualized = candidate.value * (period || 1);
  return { value: annualized };
}

function findDigitalReceiptsPercent(text, businessType) {
  const hasCash = /\bcash\b/.test(text);
  const hasDigital = /\bupi\b|\bonline\b|\bdigital\b|bank transfer|\bcard\b|net banking/.test(text);
  if (hasDigital && !hasCash) return 90;
  if (hasCash && !hasDigital) return 15;
  if (hasCash && hasDigital) return 50;
  if (businessType && ["IT / software services", "Freelance creative / digital services"].includes(businessType.label)) return 80;
  return 40; // typical informal-sector default
}

// Fields the rest of the pipeline cannot safely guess. If either is missing,
// extractProfile() returns them in `missing` instead of inventing a number
// or a business category, so the caller can ask the user to clarify rather
// than silently computing an advisory off a fabricated figure.
export function extractProfile(description) {
  const text = " " + description.toLowerCase() + " ";
  const inferred = [];
  const missing = [];

  const businessType = findBusinessType(text);
  const businessTypeLabel = businessType ? businessType.label : "Business";

  let sector = businessType ? businessType.sector : null;
  const mentionsGoods = /\bsell(s|ing)?\b.*\b(goods|products)\b|\bproducts?\b/.test(text);
  const mentionsServices = /\bservice(s)?\b|\brepair\b|\bprovide\b/.test(text);
  if (businessType && businessType.sector !== "both" && mentionsGoods && mentionsServices) {
    sector = "both";
  } else if (!sector) {
    if (mentionsGoods && mentionsServices) sector = "both";
    else if (mentionsGoods) sector = "goods";
    else if (mentionsServices) sector = "services";
  }
  if (!sector) missing.push("business_type");

  const isProfessional = businessType ? businessType.isProfessional : false;

  const moneyMatches = findMoneyMatches(text);
  const turnoverResult = findTurnover(text, moneyMatches);
  let estimatedAnnualTurnoverINR = null;
  if (turnoverResult) {
    estimatedAnnualTurnoverINR = Math.round(turnoverResult.value);
  } else {
    missing.push("revenue");
  }

  const expensesResult = findExpenses(text, moneyMatches);
  let estimatedAnnualExpensesINR = null;
  if (expensesResult) {
    estimatedAnnualExpensesINR = Math.round(expensesResult.value);
  } else {
    missing.push("expenses");
  }

  if (missing.length) {
    return { profile: null, missing };
  }

  const { state, viaCity: stateMatchedViaCity } = findState(text);
  if (!state) inferred.push("state not mentioned — GST special-category status defaulted to false");
  const isSpecialCategoryState = state ? SPECIAL_CATEGORY_STATES.has(state) : false;

  const category = findCategory(text);

  const areaType = findAreaType(text, stateMatchedViaCity);
  if (areaType === "unspecified") inferred.push("urban/rural area not mentioned");

  let employeeCount = findEmployeeCount(text);
  if (employeeCount === null) {
    employeeCount = 0;
    inferred.push("employee count not mentioned — assumed solo operation");
  }

  const investmentFound = findInvestment(text, moneyMatches);
  let estimatedInvestmentINR;
  if (investmentFound !== null) {
    estimatedInvestmentINR = Math.round(investmentFound);
  } else {
    estimatedInvestmentINR = Math.max(50000, Math.round(estimatedAnnualTurnoverINR * 0.15));
    inferred.push(`no investment figure found — estimated ${estimatedInvestmentINR.toLocaleString("en-IN")} (≈15% of estimated turnover) for Udyam classification`);
  }

  const digitalReceiptsPercent = findDigitalReceiptsPercent(text, businessType);
  if (!/\bcash\b|\bupi\b|\bonline\b|\bdigital\b|bank transfer|\bcard\b/.test(text)) {
    inferred.push(`payment mode not mentioned — assumed ${digitalReceiptsPercent}% digital receipts`);
  }

  const confidenceNotes =
    "Extracted via rule-based keyword matching (no LLM/API used). " +
    (inferred.length ? inferred.join("; ") + "." : "All fields matched explicit keywords in the description.");

  return {
    profile: {
      businessType: businessTypeLabel,
      sector,
      isProfessional,
      estimatedAnnualTurnoverINR,
      estimatedAnnualExpensesINR,
      state: state || "",
      isSpecialCategoryState,
      category,
      areaType,
      employeeCount,
      estimatedInvestmentINR,
      digitalReceiptsPercent,
      confidenceNotes,
    },
    missing: [],
  };
}
