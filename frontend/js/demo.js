/* ═══════════════════════════════════════════════════════════
   ChurnShield — demo.js
   Generates realistic demo results so the site can be
   experienced without a running FastAPI backend.
   Exposes: window.ChurnDemo.generate(industry)
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  // deterministic PRNG so demo output is stable
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const FEATURES = {
    telecom: ["MonthlyCharges", "tenure", "TotalCharges", "Contract_Two year",
      "InternetService_Fiber optic", "TechSupport", "PaymentMethod_Electronic check",
      "OnlineSecurity", "PaperlessBilling", "Contract_One year", "StreamingTV",
      "MultipleLines", "DeviceProtection", "Partner", "SeniorCitizen"],
    bank: ["Age", "Balance", "NumOfProducts", "IsActiveMember", "CreditScore",
      "Geography_Germany", "EstimatedSalary", "Gender_Male", "Tenure",
      "HasCrCard", "Geography_Spain"]
  };

  function nextAction(industry, prob, topFeature) {
    if (prob < 0.40) return "No immediate action needed. Monitor monthly.";
    const top = (topFeature || "").toLowerCase();
    if (industry === "bank") {
      if (top.includes("balance")) return "Offer a premium savings account with higher interest rate.";
      if (top.includes("credit")) return "Provide credit improvement tips and low-interest loan options.";
      if (top.includes("age")) return "Schedule a personalized financial advisory call.";
      if (top.includes("active")) return "Send re-engagement campaign with credit card fee waiver.";
      return "Assign to retention specialist for personalized outreach.";
    }
    if (top.includes("monthly") || top.includes("charge")) return "Offer 20% discount on current plan for 3 months.";
    if (top.includes("tenure")) return "Offer loyalty reward: free data upgrade for 2 months.";
    if (top.includes("tech") || top.includes("support")) return "Schedule free technical support visit within 48 hours.";
    if (top.includes("contract")) return "Offer discounted long-term contract with free perks.";
    return "Send personalized retention offer via SMS + email.";
  }

  function generate(industry) {
    industry = industry === "bank" ? "bank" : "telecom";
    const rnd = mulberry32(industry === "bank" ? 1337 : 4242);
    const feats = FEATURES[industry];
    const total = industry === "bank" ? 10000 : 7043;
    const sample = 500;

    // feature importances (decaying, normalised)
    let raw = feats.map((f, i) => Math.pow(0.78, i) * (0.85 + rnd() * 0.3));
    const sum = raw.reduce((a, b) => a + b, 0);
    const fi = feats.map((f, i) => [f, +(raw[i] / sum).toFixed(4)]);

    // predictions
    const preds = [];
    let high = 0, med = 0, low = 0, probSum = 0;
    for (let i = 0; i < sample; i++) {
      // bimodal-ish distribution
      const base = rnd() < 0.62 ? rnd() * 0.38 : 0.38 + rnd() * 0.62;
      const p = Math.min(0.985, Math.max(0.015, base + (rnd() - 0.5) * 0.06));
      const risk = p >= 0.70 ? "HIGH" : p >= 0.40 ? "MEDIUM" : "LOW";
      if (risk === "HIGH") high++; else if (risk === "MEDIUM") med++; else low++;
      probSum += p;
      const shuffled = feats.slice(0, 6).sort(() => rnd() - 0.5).slice(0, 3);
      preds.push({
        index: i,
        churn_probability: +p.toFixed(4),
        churn_predicted: p >= 0.5 ? 1 : 0,
        risk_level: risk,
        top_drivers: shuffled,
        driver_scores: shuffled.map(() => +(0.02 + rnd() * 0.12).toFixed(4)),
        next_best_action: nextAction(industry, p, shuffled[0])
      });
    }

    const acc = industry === "bank" ? 0.8632 : 0.8121;
    const testN = Math.round(total * 0.25);
    const churnRate = industry === "bank" ? 0.2037 : 0.2654;
    const churned = Math.round(testN * churnRate);
    const stayed = testN - churned;
    const tp = Math.round(churned * 0.62), fn = churned - tp;
    const fp = Math.round(stayed * 0.085), tn = stayed - fp;

    return {
      status: "success",
      industry,
      demo: true,
      dataset_shape: [total, industry === "bank" ? 14 : 21],
      metrics: {
        accuracy: acc,
        precision: +(tp / (tp + fp)).toFixed(4),
        recall: +(tp / (tp + fn)).toFixed(4),
        f1_score: +((2 * tp) / (2 * tp + fp + fn)).toFixed(4),
        roc_auc: industry === "bank" ? 0.8712 : 0.8464,
        confusion_matrix: [[tn, fp], [fn, tp]],
        total_samples: total,
        churn_rate: churnRate,
        test_samples: testN,
        model_type: "ANN (3 Dense Layers)"
      },
      feature_importances: fi,
      segment_summary: {
        high_risk: Math.round(total * high / sample),
        medium_risk: Math.round(total * med / sample),
        low_risk: Math.round(total * low / sample),
        avg_churn_prob: +(probSum / sample).toFixed(4)
      },
      predictions: preds
    };
  }

  window.ChurnDemo = { generate };
})();
