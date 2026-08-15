import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeAdvisory } from "./rulesEngine.js";
import { extractProfile } from "./extractProfile.js";

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

app.post("/api/advise", (req, res) => {
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
    res.json(advisory);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Something went wrong while generating advice." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Vyapar Mitra running at http://localhost:${PORT}`);
});
