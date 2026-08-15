const descriptionEl = document.getElementById("description");
const submitBtn = document.getElementById("submitBtn");
const errorEl = document.getElementById("error");
const loadingEl = document.getElementById("loading");
const resultsEl = document.getElementById("results");

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    descriptionEl.value = chip.dataset.example;
    descriptionEl.focus();
  });
});

function inr(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "N/A";
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

// Minimal inline line-icons (18x18, stroke=currentColor) — one per field, no
// external icon library needed.
const ICONS = {
  business: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l1-4h10l1 4"/><path d="M3 7v7h12V7"/><path d="M7 14v-4h4v4"/></svg>`,
  revenue: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="9" r="7.25"/><text x="9" y="12.3" text-anchor="middle" font-size="8.5" font-family="inherit" fill="currentColor" stroke="none">₹</text></svg>`,
  expenses: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="9" cy="9" r="7.25"/><line x1="6" y1="9" x2="12" y2="9"/></svg>`,
  netProfit: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,12 7,7 10,10 16,4"/><polyline points="11,4 16,4 16,9"/></svg>`,
  gst: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2h6l3 3v11H5z"/><path d="M11 2v3h3"/><path d="M7 9h4M7 12h4"/></svg>`,
  tax: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="7.25"/><circle cx="6.6" cy="6.6" r="1.15" fill="currentColor" stroke="none"/><circle cx="11.4" cy="11.4" r="1.15" fill="currentColor" stroke="none"/><path d="M6 12L12 6"/></svg>`,
  udyam: `<svg viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2l6 2.4v3.8c0 4-2.5 6.4-6 7.4-3.5-1-6-3.4-6-7.4V4.4z"/><path d="M6.4 9l1.8 1.8L11.8 6.6"/></svg>`,
};

function fieldTitle(icon, label) {
  return `<div class="stat-title"><span class="stat-icon">${icon}</span>${label}</div>`;
}

// Queues a card's fade-up-in animation at the given delay. Used for cards
// that are freshly created each render, so there's no prior animation state
// to reset — adding the class is enough for it to play once appended.
function withReveal(el, delaySeconds) {
  el.classList.add("reveal");
  el.style.animationDelay = `${delaySeconds}s`;
  return el;
}

// The three result panels are static DOM nodes reused across searches, so —
// unlike the cards — their animation has to be explicitly restarted each
// time: remove the class, force a reflow, then re-add it with fresh delays.
function revealPanels() {
  const panels = resultsEl.querySelectorAll(":scope > .panel");
  panels.forEach((panel, i) => {
    panel.classList.remove("reveal");
    void panel.offsetWidth;
    panel.style.animationDelay = `${i * 0.15}s`;
    panel.classList.add("reveal");
  });
}

function renderStatGrid(data) {
  const grid = document.getElementById("statGrid");
  grid.innerHTML = "";

  const businessCard = document.createElement("div");
  businessCard.className = "stat-card";
  businessCard.innerHTML = `
    ${fieldTitle(ICONS.business, "Business Type")}
    <div class="stat-value">${data.profile.businessType}</div>
    <div class="stat-detail">${data.profile.sector === "both" ? "Goods & services" : data.profile.sector.charAt(0).toUpperCase() + data.profile.sector.slice(1)}${data.profile.state ? ` · ${data.profile.state.replace(/\b\w/g, (c) => c.toUpperCase())}` : ""}</div>`;
  grid.appendChild(businessCard);

  const revenueCard = document.createElement("div");
  revenueCard.className = "stat-card";
  revenueCard.innerHTML = `
    ${fieldTitle(ICONS.revenue, "Annual Revenue (est.)")}
    <div class="stat-value">${inr(data.profile.estimatedAnnualTurnoverINR)}</div>
    <div class="stat-detail">${data.profile.employeeCount > 0 ? `${data.profile.employeeCount} employee${data.profile.employeeCount === 1 ? "" : "s"}` : "Solo operation"}</div>`;
  grid.appendChild(revenueCard);

  const expensesCard = document.createElement("div");
  expensesCard.className = "stat-card";
  expensesCard.innerHTML = `
    ${fieldTitle(ICONS.expenses, "Total Expenses (est.)")}
    <div class="stat-value">${inr(data.profile.estimatedAnnualExpensesINR)}</div>
    <div class="stat-detail">Estimated annual cost of running the business.</div>`;
  grid.appendChild(expensesCard);

  const netProfitCard = document.createElement("div");
  netProfitCard.className = "stat-card";
  netProfitCard.innerHTML = `
    ${fieldTitle(ICONS.netProfit, "Net Profit (est.)")}
    <div class="stat-value ${data.incomeTax.netProfit > 0 ? "pos" : "neg"}">${inr(data.incomeTax.netProfit)}</div>
    <div class="stat-detail">Revenue minus expenses — determines whether income tax applies this cycle.</div>`;
  grid.appendChild(netProfitCard);

  const gstCard = document.createElement("div");
  gstCard.className = "stat-card";
  gstCard.innerHTML = `
    ${fieldTitle(ICONS.gst, "GST Registration")}
    <span class="status-pill ${data.gst.required ? "amber" : "green"}">${data.gst.required ? "Registration Required" : "Not Required Yet"}</span>
    <div class="stat-detail">
      Threshold: ${inr(data.gst.threshold)}${data.gst.special ? " (special category state)" : ""}.
      ${data.gst.scheme ? `Suggested scheme: ${data.gst.scheme.type === "composition" ? "Composition" : "Regular"} — ${data.gst.scheme.rate}.` : "Voluntary registration still possible for input tax credit."}
    </div>`;
  grid.appendChild(gstCard);

  const itCard = document.createElement("div");
  itCard.className = "stat-card";
  itCard.innerHTML = data.incomeTax.inLoss
    ? `
    ${fieldTitle(ICONS.tax, "Income Tax")}
    <span class="status-pill green">No Tax This Cycle</span>
    <div class="stat-detail">${data.incomeTax.note}</div>`
    : `
    ${fieldTitle(ICONS.tax, "Income Tax")}
    <div class="stat-value pos">Section ${data.incomeTax.section}</div>
    <div class="stat-detail">
      Deemed profit: ${data.incomeTax.deemedProfitRate} ≈ ${inr(data.incomeTax.deemedProfit)}.<br/>
      Estimated tax (new regime): <strong>${inr(data.incomeTax.estimatedTax)}</strong>
    </div>`;
  grid.appendChild(itCard);

  const udyamCard = document.createElement("div");
  udyamCard.className = "stat-card";
  udyamCard.innerHTML = `
    ${fieldTitle(ICONS.udyam, "MSME / Udyam Classification")}
    <div class="stat-value ${data.udyam.classification === "Not classified as MSME" ? "neg" : "pos"}">${data.udyam.classification}</div>
    <div class="stat-detail">
      Based on estimated investment ${inr(data.udyam.investment)} and turnover ${inr(data.udyam.turnover)}.
    </div>`;
  grid.appendChild(udyamCard);

  Array.from(grid.children).forEach((card, i) => withReveal(card, 0.15 + i * 0.04));
}

function renderBenefits(benefits) {
  const grid = document.getElementById("benefitGrid");
  grid.innerHTML = "";
  benefits.forEach((b, i) => {
    const card = document.createElement("div");
    card.className = `benefit-card ${b.eligible ? "eligible" : "not-eligible"}`;
    card.innerHTML = `
      <div class="benefit-name">${b.name}
        <span class="badge ${b.eligible ? "yes" : "no"}">${b.eligible ? "Unlocked" : "Not applicable"}</span>
      </div>
      <div class="benefit-detail">${b.details}</div>`;
    withReveal(card, 0.3 + i * 0.04);
    grid.appendChild(card);
  });
}

async function submit() {
  const description = descriptionEl.value.trim();
  if (!description) {
    descriptionEl.focus();
    return;
  }

  errorEl.style.display = "none";
  resultsEl.style.display = "none";
  loadingEl.style.display = "block";
  submitBtn.disabled = true;

  try {
    const res = await fetch("/api/advise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    document.getElementById("summaryText").textContent = data.summary;
    renderStatGrid(data);
    renderBenefits(data.benefits);

    resultsEl.style.display = "block";
    revealPanels();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = "block";
  } finally {
    loadingEl.style.display = "none";
    submitBtn.disabled = false;
  }
}

submitBtn.addEventListener("click", submit);
descriptionEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
});

document.getElementById("exportPdfBtn").addEventListener("click", () => {
  window.print();
});
