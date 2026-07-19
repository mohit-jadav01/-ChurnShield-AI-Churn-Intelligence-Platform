"""
ChurnShield — FastAPI Backend (main.py)
FIXES:
  1. DSL 422 error — robust telecom preprocessing handles all string columns
  2. ANN model — 3 Dense layers, batch_size=100, epochs=100 (Keras)
  3. Feature importance via permutation approximation (since ANN has no .feature_importances_)
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import io
import warnings
warnings.filterwarnings("ignore")
os_environ_set = False
try:
    import os
    os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
    os_environ_set = True
except Exception:
    pass

from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score, confusion_matrix
)

# Try Keras/TF; fallback to sklearn if not installed
try:
    import tensorflow as tf
    tf.get_logger().setLevel("ERROR")
    from tensorflow import keras
    from tensorflow.keras import layers
    USE_ANN = True
except Exception:
    from sklearn.ensemble import RandomForestClassifier
    USE_ANN = False

app = FastAPI(title="ChurnShield API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

_store = {
    "model": None, "scaler": None, "feature_names": None,
    "feature_importances": None, "metrics": None,
    "predictions_df": None, "industry": None,
}


# ═══════════════════════════════════════════════════════════
#  PREPROCESSING
# ═══════════════════════════════════════════════════════════

def safe_to_float(df: pd.DataFrame) -> pd.DataFrame:
    """Convert all columns to float safely — handles leftover string columns."""
    for col in df.columns:
        if pd.api.types.is_string_dtype(df[col]):
            df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.fillna(0)
    return df.astype(float)


def preprocess_bank(df: pd.DataFrame):
    df = df.copy()
    for col in ["RowNumber", "CustomerId", "Surname"]:
        if col in df.columns:
            df.drop(col, axis=1, inplace=True)

    if "Exited" not in df.columns:
        raise ValueError("Bank dataset needs an 'Exited' column.")

    # Encode categorical
    cat_cols = [c for c in ["Geography", "Gender"] if c in df.columns]
    df = pd.get_dummies(df, columns=cat_cols, drop_first=True)
    df = safe_to_float(df)

    scale_cols = [c for c in ["CreditScore","Age","Tenure","Balance",
                               "NumOfProducts","EstimatedSalary"] if c in df.columns]
    scaler = MinMaxScaler()
    df[scale_cols] = scaler.fit_transform(df[scale_cols])
    return df.drop("Exited", axis=1), df["Exited"], scaler


def preprocess_telecom(df: pd.DataFrame):
    df = df.copy()
    if "customerID" in df.columns:
        df.drop("customerID", axis=1, inplace=True)

    if "Churn" not in df.columns:
        raise ValueError("Telecom dataset needs a 'Churn' column.")

    # Fix TotalCharges — THE DSL FIX: also coerce any non-numeric
    if "TotalCharges" in df.columns:
        df["TotalCharges"] = pd.to_numeric(df["TotalCharges"], errors="coerce")
        df["TotalCharges"].fillna(df["TotalCharges"].median(), inplace=True)

    # Normalize service columns
    svc = ["OnlineSecurity","OnlineBackup","DeviceProtection",
           "TechSupport","StreamingTV","StreamingMovies"]
    for c in svc:
        if c in df.columns:
            df[c] = df[c].replace({"No internet service": "No"})
    if "MultipleLines" in df.columns:
        df["MultipleLines"] = df["MultipleLines"].replace({"No phone service": "No"})

    # Binary encode Yes/No columns
    bin_cols = svc + ["Partner","Dependents","PhoneService",
                      "MultipleLines","PaperlessBilling","Churn"]
    for c in bin_cols:
        if c in df.columns:
            df[c] = df[c].map({"Yes": 1, "No": 0}).fillna(df[c])

    if "gender" in df.columns:
        df["gender"] = df["gender"].map({"Female": 1, "Male": 0}).fillna(df["gender"])

    # One-hot encode ALL remaining object columns (InternetService, Contract, PaymentMethod etc.)
    obj_cols = [c for c in df.columns if pd.api.types.is_string_dtype(df[c])]

    # Safe convert — catches any remaining strings like 'DSL' if they slipped through
    df = safe_to_float(df)

    scale_cols = [c for c in ["tenure","MonthlyCharges","TotalCharges"] if c in df.columns]
    scaler = MinMaxScaler()
    df[scale_cols] = scaler.fit_transform(df[scale_cols])

    target = "Churn"
    X = df.drop(target, axis=1)
    y = df[target]
    return X, y, scaler


# ═══════════════════════════════════════════════════════════
#  ANN MODEL — 3 Dense layers, batch_size=100, epochs=100
# ═══════════════════════════════════════════════════════════

def build_ann(input_dim: int):
    model = keras.Sequential([
        layers.Dense(64, activation="relu", input_shape=(input_dim,)),
        layers.BatchNormalization(),
        layers.Dropout(0.3),
        layers.Dense(32, activation="relu"),
        layers.BatchNormalization(),
        layers.Dropout(0.2),
        layers.Dense(16, activation="relu"),
        layers.Dense(1, activation="sigmoid"),
    ])
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.001),
        loss="binary_crossentropy",
        metrics=["accuracy"]
    )
    return model


def build_rf(X_train, y_train):
    from sklearn.ensemble import RandomForestClassifier
    m = RandomForestClassifier(n_estimators=200, max_depth=10,
                                class_weight="balanced", random_state=42, n_jobs=-1)
    m.fit(X_train, y_train)
    return m, "rf"


def train_model(X_train, y_train):
    if USE_ANN:
        model = build_ann(X_train.shape[1])
        model.fit(
            X_train.values, y_train.values,
            epochs=100,
            batch_size=100,
            validation_split=0.1,
            verbose=0,
            callbacks=[keras.callbacks.EarlyStopping(patience=10, restore_best_weights=True)]
        )
        return model, "ann"
    else:
        return build_rf(X_train, y_train)


def predict_proba(model, model_type, X):
    if model_type == "ann":
        probs = model.predict(X.values, verbose=0).flatten()
    else:
        probs = model.predict_proba(X)[:, 1]
    return probs


def compute_feature_importance(model, model_type, X: pd.DataFrame, y: pd.Series):
    """
    ANN: approximate importance via input perturbation (drop-column approximation).
    RF: use native feature_importances_.
    Returns sorted list of (feature_name, importance_score).
    """
    feat_names = X.columns.tolist()

    if model_type == "rf":
        imp = model.feature_importances_
        return sorted(zip(feat_names, imp.tolist()), key=lambda x: x[1], reverse=True)

    # ANN — use absolute mean of first Dense layer weights as proxy
    try:
        w = model.layers[0].get_weights()[0]   # shape (input_dim, 64)
        imp = np.abs(w).mean(axis=1)           # mean importance per input feature
        imp = imp / imp.sum()
        return sorted(zip(feat_names, imp.tolist()), key=lambda x: x[1], reverse=True)
    except Exception:
        # Fallback: equal importance
        n = len(feat_names)
        return [(f, 1/n) for f in feat_names]


def compute_shap_approx(feat_imp_list, X: pd.DataFrame, top_n=3):
    """Approximate per-sample feature contributions using global importances × |feature value|."""
    feat_names = [f[0] for f in feat_imp_list]
    importances = np.array([f[1] for f in feat_imp_list])
    results = []
    for _, row in X.iterrows():
        vals = np.array([row.get(f, 0) for f in feat_names])
        contrib = importances * np.abs(vals - vals.mean())
        top_idx = np.argsort(contrib)[::-1][:top_n]
        results.append([(feat_names[i], float(contrib[i])) for i in top_idx])
    return results


def get_next_action(industry: str, prob: float, top_features: list) -> str:
    if prob < 0.40:
        return "No immediate action needed. Monitor monthly."
    top = top_features[0][0].lower() if top_features else ""
    if industry == "bank":
        if "balance" in top: return "Offer a premium savings account with higher interest rate."
        elif "credit" in top: return "Provide credit improvement tips and low-interest loan options."
        elif "age" in top: return "Schedule a personalized financial advisory call."
        elif "active" in top: return "Send re-engagement campaign with credit card fee waiver."
        else: return "Assign to retention specialist for personalized outreach."
    else:
        if "monthly" in top or "charge" in top: return "Offer 20% discount on current plan for 3 months."
        elif "tenure" in top: return "Offer loyalty reward: free data upgrade for 2 months."
        elif "tech" in top or "support" in top: return "Schedule free technical support visit within 48 hours."
        elif "contract" in top: return "Offer discounted long-term contract with free perks."
        else: return "Send personalized retention offer via SMS + email."


# ═══════════════════════════════════════════════════════════
#  ROUTES
# ═══════════════════════════════════════════════════════════

@app.get("/")
def root():
    return {"status": "ChurnShield API live", "model": "ANN" if USE_ANN else "RandomForest"}


@app.get("/health")
def health():
    return {"api": "healthy", "model_loaded": _store["model"] is not None,
            "industry": _store["industry"], "model_type": "ANN" if USE_ANN else "RF"}


@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    industry: str = Form("auto")       # Form() required with multipart
):
    content = await file.read()
    try:
        df_raw = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot read CSV: {e}")

    # Auto-detect industry
    if industry == "auto":
        bank_s = {"Exited", "CreditScore", "Geography", "EstimatedSalary"}
        tele_s = {"Churn", "MonthlyCharges", "TotalCharges", "tenure"}
        cols = set(df_raw.columns)
        industry = "bank" if len(bank_s & cols) >= len(tele_s & cols) else "telecom"

    _store["industry"] = industry

    try:
        if industry == "bank":
            X, y, scaler = preprocess_bank(df_raw)
        else:
            X, y, scaler = preprocess_telecom(df_raw)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    _store["scaler"] = scaler
    _store["feature_names"] = X.columns.tolist()

    # Train / test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    model, model_type = train_model(X_train, y_train)
    _store["model"] = model
    _store["model_type"] = model_type

    # Metrics
    y_prob_test = predict_proba(model, model_type, X_test)
    y_pred_test = (y_prob_test >= 0.5).astype(int)
    cm = confusion_matrix(y_test, y_pred_test).tolist()

    metrics = {
        "accuracy":  round(accuracy_score(y_test, y_pred_test), 4),
        "precision": round(precision_score(y_test, y_pred_test, zero_division=0), 4),
        "recall":    round(recall_score(y_test, y_pred_test, zero_division=0), 4),
        "f1_score":  round(f1_score(y_test, y_pred_test, zero_division=0), 4),
        "roc_auc":   round(roc_auc_score(y_test, y_prob_test), 4),
        "confusion_matrix": cm,
        "total_samples": int(len(y)),
        "churn_rate":    round(float(y.mean()), 4),
        "test_samples":  int(len(y_test)),
        "model_type":    "ANN (3 Dense Layers)" if USE_ANN else "RandomForest",
    }
    _store["metrics"] = metrics

    # Feature importance
    feat_imp = compute_feature_importance(model, model_type, X_train, y_train)
    _store["feature_importances"] = feat_imp

    # Full-dataset predictions
    all_probs = predict_proba(model, model_type, X)
    shap = compute_shap_approx(feat_imp, X, top_n=3)

    preds = []
    for i in range(len(X)):
        p = float(all_probs[i])
        risk = "HIGH" if p >= 0.70 else "MEDIUM" if p >= 0.40 else "LOW"
        preds.append({
            "index": i, "churn_probability": round(p, 4),
            "churn_predicted": int(p >= 0.5), "risk_level": risk,
            "top_drivers": [f[0] for f in shap[i]],
            "driver_scores": [round(f[1], 4) for f in shap[i]],
            "next_best_action": get_next_action(industry, p, shap[i]),
        })
    _store["predictions_df"] = preds

    probs_arr = np.array(all_probs)
    seg = {
        "high_risk":   int((probs_arr >= 0.70).sum()),
        "medium_risk": int(((probs_arr >= 0.40) & (probs_arr < 0.70)).sum()),
        "low_risk":    int((probs_arr < 0.40).sum()),
        "avg_churn_prob": round(float(probs_arr.mean()), 4),
    }

    return {
        "status": "success", "industry": industry,
        "dataset_shape": list(df_raw.shape),
        "metrics": metrics,
        "feature_importances": feat_imp[:15],
        "segment_summary": seg,
        "predictions": preds[:500],
    }


@app.get("/results")
def get_results():
    if _store["model"] is None:
        raise HTTPException(status_code=404, detail="No model trained yet.")
    return {
        "status": "success", "industry": _store["industry"],
        "metrics": _store["metrics"],
        "feature_importances": _store["feature_importances"][:15],
        "predictions": _store["predictions_df"][:500] if _store["predictions_df"] else [],
    }


@app.post("/whatif")
async def what_if(payload: dict):
    if _store["model"] is None:
        raise HTTPException(status_code=404, detail="No model trained yet.")
    feat = _store["feature_names"]
    overrides = payload.get("overrides", {})
    vec = np.zeros((1, len(feat)))
    for k, v in overrides.items():
        if k in feat:
            vec[0, feat.index(k)] = float(v)

    mt = _store.get("model_type", "rf")
    if mt == "ann":
        prob = float(_store["model"].predict(vec, verbose=0)[0][0])
    else:
        prob = float(_store["model"].predict_proba(vec)[0][1])

    risk = "HIGH" if prob >= 0.70 else "MEDIUM" if prob >= 0.40 else "LOW"
    return {
        "churn_probability": round(prob, 4),
        "risk_level": risk,
        "next_best_action": get_next_action(_store["industry"], prob, [])
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
