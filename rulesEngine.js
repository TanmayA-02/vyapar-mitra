// Illustrative rules engine for India's informal-sector tax & registration landscape.
// Figures reflect widely-published thresholds (GST Act, Income Tax Act presumptive
// schemes, 2020 MSME classification, PMEGP/Mudra/Stand-Up India guidelines) as of
// this build. They are demo-grade approximations, not tax advice — real numbers
// must be verified against the current GST/CBDT/MSME notifications before filing.

const SPECIAL_CATEGORY_STATES = new Set([
  "arunachal pradesh", "assam", "manipur", "meghalaya", "mizoram",
  "nagaland", "sikkim", "tripura", "himachal pradesh", "uttarakhand",
  "jammu and kashmir",
]);

function resolveSpecialCategory(profile) {
  if (typeof profile.isSpecialCategoryState === "boolean") {
    return profile.isSpecialCategoryState;
  }
  const state = (profile.state || "").trim().toLowerCase();
  return SPECIAL_CATEGORY_STATES.has(state);
}

function determineGST(profile) {
  const special = resolveSpecialCategory(profile);
  const turnover = profile.estimatedAnnualTurnoverINR || 0;
  const sector = profile.sector || "services";

  const threshold =
    sector === "goods"
      ? (special ? 2000000 : 4000000)
      : (special ? 1000000 : 2000000);

  // Sec 24 CGST Act: inter-state supply and e-commerce sales require GST
  // registration regardless of turnover, and composition scheme is not
  // available to either — so both override the threshold check below.
  const mandatoryReason = profile.isInterState
    ? "you make inter-state sales/services"
    : profile.sellsOnEcommerce
    ? "you sell through an e-commerce operator"
    : null;
  const compositionBlocked = !!mandatoryReason;

  const required = turnover > threshold || compositionBlocked;

  let scheme = null;
  if (required) {
    if (profile.isProfessional || sector === "services") {
      const compositionCap = 5000000; // Sec 10(2A) composition for services
      if (!compositionBlocked && turnover <= compositionCap) {
        scheme = { type: "composition", rate: "6% of turnover (3% CGST + 3% SGST)", note: "Composition scheme for services (Sec 10(2A)) — no input tax credit, cannot collect GST from customers." };
      } else {
        scheme = { type: "regular", rate: "Depends on SAC classification of the service", note: "Regular scheme — file monthly/quarterly returns, can claim input tax credit." };
      }
    } else {
      const compositionCap = special ? 7500000 : 15000000;
      if (!compositionBlocked && turnover <= compositionCap) {
        scheme = { type: "composition", rate: "1% of turnover (traders/manufacturers)", note: "Composition scheme for goods — flat rate, no input tax credit, cannot sell inter-state." };
      } else {
        scheme = { type: "regular", rate: "Depends on HSN classification of goods", note: "Regular scheme — file monthly/quarterly returns, can claim input tax credit." };
      }
    }
    if (compositionBlocked) {
      scheme.note = `Composition scheme isn't available because ${mandatoryReason} — regular scheme is mandatory here. ` + scheme.note;
    }
  }

  return { required, threshold, special, scheme, mandatoryReason };
}

const NEW_REGIME_SLABS = [
  { upTo: 400000, rate: 0 },
  { upTo: 800000, rate: 0.05 },
  { upTo: 1200000, rate: 0.10 },
  { upTo: 1600000, rate: 0.15 },
  { upTo: 2000000, rate: 0.20 },
  { upTo: 2400000, rate: 0.25 },
  { upTo: Infinity, rate: 0.30 },
];

function slabTax(taxableIncome) {
  if (taxableIncome <= 1200000) return 0; // Sec 87A rebate, new regime
  let tax = 0;
  let lower = 0;
  for (const slab of NEW_REGIME_SLABS) {
    if (taxableIncome <= lower) break;
    const upper = Math.min(taxableIncome, slab.upTo);
    tax += Math.max(0, upper - lower) * slab.rate;
    lower = slab.upTo;
  }
  return Math.round(tax);
}

function determineIncomeTax(profile) {
  const turnover = profile.estimatedAnnualTurnoverINR || 0;
  const expenses = profile.estimatedAnnualExpensesINR || 0;
  const netProfit = turnover - expenses;
  const highDigital = (profile.digitalReceiptsPercent || 0) >= 95;

  // Simplification for this prototype: presumptive taxation (44AD/44ADA) is
  // normally charged on a deemed profit regardless of actual expenses, since
  // the whole point of the scheme is not having to track them. Here we gate
  // on actual net profit instead, since the business owner now tells us
  // expenses directly — a loss-making cycle owes no income tax.
  if (netProfit <= 0) {
    return {
      inLoss: true,
      netProfit,
      section: null,
      note: "Your business is in loss so no tax for this cycle",
    };
  }

  if (profile.isProfessional) {
    const cap = highDigital ? 7500000 : 5000000;
    const eligible = turnover <= cap;
    const deemedProfit = turnover * 0.5;
    const tax = slabTax(deemedProfit);
    return {
      inLoss: false,
      netProfit,
      section: "44ADA",
      eligible,
      cap,
      deemedProfitRate: "50% of gross receipts",
      deemedProfit,
      estimatedTax: tax,
      note: "Presumptive taxation for specified professionals (legal, medical, engineering, architecture, accountancy, IT, technical consultancy, etc). No need to maintain detailed books if opted.",
    };
  }

  const cap = highDigital ? 30000000 : 20000000;
  const eligible = turnover <= cap;
  const rate = highDigital ? 0.06 : 0.08;
  const deemedProfit = turnover * rate;
  const tax = slabTax(deemedProfit);
  return {
    inLoss: false,
    netProfit,
    section: "44AD",
    eligible,
    cap,
    deemedProfitRate: `${Math.round(rate * 100)}% of turnover (${highDigital ? "digital receipts ≥95%" : "includes cash receipts"})`,
    deemedProfit,
    estimatedTax: tax,
    note: "Presumptive taxation for small businesses. No need to maintain detailed books of account or get audited if opted and eligible.",
  };
}

function determineUdyam(profile) {
  const investment = profile.estimatedInvestmentINR || 0;
  const turnover = profile.estimatedAnnualTurnoverINR || 0;

  const tiers = [
    { name: "Micro", investCap: 10000000, turnoverCap: 50000000 },
    { name: "Small", investCap: 100000000, turnoverCap: 500000000 },
    { name: "Medium", investCap: 500000000, turnoverCap: 2500000000 },
  ];

  for (const tier of tiers) {
    if (investment <= tier.investCap && turnover <= tier.turnoverCap) {
      return { classification: tier.name, investment, turnover };
    }
  }
  return { classification: "Not classified as MSME", investment, turnover };
}

function determineBenefits(profile, udyam) {
  const benefits = [];
  const isMSME = udyam.classification !== "Not classified as MSME";
  const category = (profile.category || "general").toLowerCase();
  const priorityCategory = ["sc", "st", "women"].includes(category);

  if (isMSME) {
    benefits.push({
      name: "Udyam Registration",
      eligible: true,
      details: `Free, instant online registration. Classifies your business as ${udyam.classification} under the MSME Act — this is the gateway to every benefit below.`,
    });
    benefits.push({
      name: "Collateral-free loans (CGTMSE)",
      eligible: udyam.classification === "Micro" || udyam.classification === "Small",
      details: "Credit Guarantee Fund Trust for Micro & Small Enterprises — collateral-free bank loans up to ₹2 crore, government-backed guarantee.",
    });
    benefits.push({
      name: "Priority Sector Lending",
      eligible: true,
      details: "Banks are mandated to allocate a share of lending to registered MSMEs, generally at more favorable terms than unsecured retail credit.",
    });
    benefits.push({
      name: "45-day payment protection",
      eligible: true,
      details: "Buyers must pay registered MSMEs within 45 days (MSME Samadhaan / Section 15 of the MSMED Act) or pay compound interest on delayed payment.",
    });
    benefits.push({
      name: "Government tender reservation",
      eligible: udyam.classification === "Micro" || udyam.classification === "Small",
      details: "25% of government procurement is reserved for Micro & Small Enterprises (MSEs), with relaxed eligibility norms.",
    });
    benefits.push({
      name: "2% interest subvention",
      eligible: true,
      details: "Interest subvention scheme for MSMEs on incremental fresh/renewed working-capital loans, subject to bank participation.",
    });
  } else {
    benefits.push({
      name: "Udyam Registration",
      eligible: false,
      details: "Estimated investment/turnover exceed MSME thresholds — Udyam-linked benefits below don't apply, but Startup India and standard bank credit lines may still be relevant.",
    });
  }

  if (udyam.classification === "Micro") {
    const investment = profile.estimatedInvestmentINR || 0;
    let tier;
    if (investment <= 50000) tier = "Shishu (up to ₹50,000)";
    else if (investment <= 500000) tier = "Kishor (₹50,000 – ₹5,00,000)";
    else if (investment <= 1000000) tier = "Tarun (₹5,00,000 – ₹10,00,000)";
    else tier = "Tarun Plus (up to ₹20,00,000)";
    benefits.push({
      name: "Mudra Loan (PMMY)",
      eligible: true,
      details: `Collateral-free micro-loan under Pradhan Mantri Mudra Yojana. Based on your scale, the closest tier is ${tier}.`,
    });
  }

  benefits.push({
    name: "PMEGP margin money subsidy",
    eligible: udyam.classification === "Micro" || udyam.classification === "Not classified as MSME",
    details: "For new manufacturing (project cost up to ₹50 lakh) or service (up to ₹20 lakh) units: 15–25% subsidy for general category, 25–35% for SC/ST/women/PwD & special-area applicants, on the balance funded via bank loan.",
  });

  if (priorityCategory) {
    benefits.push({
      name: "Stand-Up India Scheme",
      eligible: true,
      details: "Bank loans between ₹10 lakh and ₹1 crore for greenfield enterprises, reserved for SC/ST and women entrepreneurs.",
    });
  }

  return benefits;
}

// Short, numberless plain-English framing. The actual figures (revenue,
// GST threshold, deemed profit, net profit, tax owed) already live in their
// own cards below — this is interpretation, not a second copy of the data.
function buildSummary(profile, gst, incomeTax, udyam) {
  const businessLabel = profile.businessType || "small business";

  const gstSentence = gst.required
    ? gst.mandatoryReason
      ? `As a ${businessLabel}, you need GST registration — it's mandatory because ${gst.mandatoryReason}, regardless of turnover.`
      : `As a ${businessLabel}, you need GST registration.`
    : `As a ${businessLabel}, you don't need GST registration yet.`;

  const udyamSentence =
    udyam.classification === "Not classified as MSME"
      ? "Your scale is above MSME thresholds, so Udyam-specific benefits don't apply — see what else you unlock below."
      : `You're classified as a ${udyam.classification} enterprise, which unlocks the benefits below.`;

  return `${gstSentence} ${udyamSentence}`;
}

export function computeAdvisory(profile) {
  const gst = determineGST(profile);
  const incomeTax = determineIncomeTax(profile);
  const udyam = determineUdyam(profile);
  const benefits = determineBenefits(profile, udyam);
  const summary = buildSummary(profile, gst, incomeTax, udyam);

  return {
    profile,
    gst,
    incomeTax,
    udyam,
    benefits,
    summary,
    disclaimer:
      "This is an informational estimate and is not a substitute for professional tax, legal, or accounting " +
      "advice. Consult a qualified professional before making financial decisions.",
  };
}
