---
name: nlp-ml-engineer
description: >
  Activa este skill cuando trabajes con el pipeline NLP, embeddings vectoriales,
  motor de matching ML, métricas del modelo, sesgo algorítmico, o cualquier
  componente de inteligencia artificial del sistema. Se activa automáticamente
  al trabajar en backend/app/nlp/, backend/app/ml/, o al mencionar embeddings,
  similitud coseno, matching, scikit-learn, sentence-transformers o pgvector.
---

# NLP + Machine Learning — Motor de Intermediación Laboral

## Modelo y dimensiones (NUNCA cambiar sin consenso del equipo)

```python
MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
EMBEDDING_DIM = 384
SIMILARITY_METRIC = "cosine"  # pgvector: <=> operator
TOP_K_DEFAULT = 10
F1_MINIMUM_PRODUCTION = 0.75
F1_ALERT_THRESHOLD = 0.70
DISPARATE_IMPACT_MINIMUM = 0.80
RANDOM_STATE = 42  # reproducibilidad total
```

---

## Pipeline NLP — Orden obligatorio

```python
# app/nlp/preprocessor.py
import re
import ftfy
import spacy
from nltk.corpus import stopwords

nlp = spacy.load("es_core_news_md")
SPANISH_STOPWORDS = set(stopwords.words("spanish"))

# Diccionario de equivalencias locales Huancayo
LOCAL_DICT = {
    "gasfitero": "plomero",
    "techero": "techadista",
    "fierrero": "soldador",
    "albañil": "constructor",
    "electricista": "instalador eléctrico",
    "pintor de obra": "pintor",
    "operario": "técnico",
}

def preprocess_text(text: str) -> str:
    """
    Pipeline NLP estándar del proyecto. SIEMPRE usar este orden:
    1. Corregir encoding (ftfy)
    2. Minúsculas
    3. Aplicar diccionario local Huancayo
    4. Eliminar caracteres especiales
    5. Eliminar stopwords español
    6. Lematizar con spaCy
    """
    # 1. Corregir encoding
    text = ftfy.fix_text(text)
    # 2. Minúsculas
    text = text.lower()
    # 3. Diccionario local
    for local_term, canonical in LOCAL_DICT.items():
        text = text.replace(local_term, canonical)
    # 4. Limpiar caracteres especiales (conservar letras, números, espacios)
    text = re.sub(r"[^a-záéíóúüñ0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    # 5 y 6. Stopwords + lematización
    doc = nlp(text)
    tokens = [
        token.lemma_ for token in doc
        if token.text not in SPANISH_STOPWORDS and not token.is_punct and len(token.text) > 1
    ]
    return " ".join(tokens)
```

---

## Generación de Embeddings

```python
# app/nlp/embeddings.py
from sentence_transformers import SentenceTransformer
import numpy as np

_model = None

def get_model() -> SentenceTransformer:
    """Singleton — cargar modelo una sola vez."""
    global _model
    if _model is None:
        _model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    return _model

def build_profile_text(worker) -> str:
    """
    CRÍTICO: Enriquecer el texto del perfil con metadatos estructurados
    antes de generar el embedding. Mejora discriminación semántica
    especialmente para perfiles con bio corta.
    """
    return (
        f"{worker.office} | "
        f"{worker.years_experience} años experiencia | "
        f"{worker.zone} | "
        f"{worker.avg_rating:.1f}/5.0 | "
        f"{worker.bio or ''}"
    )

def generate_embedding(text: str) -> list[float]:
    """
    Genera vector de 384 dimensiones.
    SIEMPRE preprocesar el texto antes de llamar esta función.
    Timeout máximo: 5 segundos.
    """
    from app.nlp.preprocessor import preprocess_text
    processed = preprocess_text(text)
    model = get_model()
    vector = model.encode(processed, normalize_embeddings=True)
    return vector.tolist()  # pgvector espera lista de floats

# ❌ NUNCA generar embedding sin preprocesar
# vector = generate_embedding(raw_text)  # ❌

# ✅ SIEMPRE
# processed = preprocess_text(raw_text)
# vector = generate_embedding(processed)  # ✅
```

---

## Búsqueda Vectorial pgvector

```python
# app/nlp/vector_search.py
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

async def search_similar_workers(
    db: AsyncSession,
    query_embedding: list[float],
    districts: list[str],
    max_budget: float | None,
    top_k: int = 10,
) -> list[dict]:
    """
    Búsqueda vectorial con filtros duros ANTES del ranking.
    Orden: filtros → similitud coseno → top_k
    Índice HNSW: m=16, ef_construction=64
    """
    sql = text("""
        SELECT
            w.id,
            w.office,
            w.zone,
            w.avg_rating,
            w.hourly_rate,
            1 - (w.embedding <=> :query_vec::vector) AS cosine_similarity
        FROM workers w
        WHERE
            w.is_available = true
            AND w.zone = ANY(:districts)
            AND (:max_budget IS NULL OR w.hourly_rate <= :max_budget)
            AND w.embedding IS NOT NULL
            AND w.profile_completeness >= 60
        ORDER BY w.embedding <=> :query_vec::vector
        LIMIT :top_k
    """)

    result = await db.execute(sql, {
        "query_vec": str(query_embedding),
        "districts": districts,
        "max_budget": max_budget,
        "top_k": top_k,
    })
    return [dict(row._mapping) for row in result]

# Crear índice HNSW (ejecutar una sola vez en migración)
CREATE_HNSW_INDEX = """
CREATE INDEX IF NOT EXISTS workers_embedding_hnsw_idx
ON workers USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
"""
```

---

## Motor de Matching ML

```python
# app/ml/matching_engine.py
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score
import shap
import structlog

logger = structlog.get_logger()

# Pesos del score combinado — configurables desde DB pero estos son los defaults
ALPHA = 0.5  # peso similitud coseno
BETA  = 0.3  # peso score modelo supervisado
GAMMA = 0.2  # peso reputación

def combined_score(
    cosine_sim: float,
    ml_score: float,
    reputation: float,
    alpha: float = ALPHA,
    beta: float = BETA,
    gamma: float = GAMMA,
) -> float:
    """
    Fórmula central del ranking. NO modificar pesos sin validar
    impacto en F1-score y disparate impact ratio.
    """
    reputation_normalized = reputation / 5.0
    return alpha * cosine_sim + beta * ml_score + gamma * reputation_normalized

def build_features(candidate: dict) -> np.ndarray:
    """
    Features del modelo supervisado. Orden fijo — no alterar.
    [cosine_similarity, entity_overlap, geo_distance, rate_ratio, avg_rating]
    """
    return np.array([
        candidate["cosine_similarity"],
        candidate.get("entity_overlap", 0.0),
        candidate.get("geo_distance_km", 0.0),
        candidate.get("rate_ratio", 1.0),
        candidate.get("avg_rating", 0.0) / 5.0,
    ])

def evaluate_model(y_true, y_pred, y_proba) -> dict:
    """
    Métricas estándar de la investigación.
    F1 mínimo aceptable en producción: 0.75
    """
    metrics = {
        "precision": precision_score(y_true, y_pred),
        "recall": recall_score(y_true, y_pred),
        "f1_score": f1_score(y_true, y_pred),
        "auc_roc": roc_auc_score(y_true, y_proba),
    }

    if metrics["f1_score"] < F1_ALERT_THRESHOLD:
        logger.error("model_f1_below_threshold",
                     f1=metrics["f1_score"],
                     threshold=F1_ALERT_THRESHOLD)

    return metrics

def explain_recommendation(model, features: np.ndarray, feature_names: list[str]) -> list[str]:
    """
    Genera explicación en español usando SHAP values.
    Se incluye en el top-5 de recomendaciones para el empleador.
    """
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(features.reshape(1, -1))

    top_features = sorted(
        zip(feature_names, shap_values[0]),
        key=lambda x: abs(x[1]),
        reverse=True
    )[:3]

    explanations_map = {
        "cosine_similarity": "Coincidencia semántica con el perfil requerido",
        "entity_overlap": "Habilidades específicas coincidentes",
        "geo_distance_km": "Proximidad geográfica en Huancayo",
        "rate_ratio": "Tarifa dentro del presupuesto",
        "avg_rating": "Calificación promedio del trabajador",
    }

    return [explanations_map.get(name, name) for name, _ in top_features]
```

---

## Sesgo Algorítmico — Obligatorio

```python
# app/ml/fairness.py

def disparate_impact_ratio(
    results: list[dict],
    protected_attribute: str,  # "gender" | "zone" | "education_level"
    privileged_group: str,
    unprivileged_group: str,
) -> float:
    """
    Calcula disparate impact ratio.
    Umbral mínimo aceptable: 0.80
    Si ratio < 0.80 → activar re-ranking equitativo automáticamente.

    DI = P(seleccionado | grupo_no_privilegiado) / P(seleccionado | grupo_privilegiado)
    """
    priv = [r for r in results if r.get(protected_attribute) == privileged_group]
    unpriv = [r for r in results if r.get(protected_attribute) == unprivileged_group]

    if not priv or not unpriv:
        return 1.0

    rate_priv = sum(1 for r in priv if r["selected"]) / len(priv)
    rate_unpriv = sum(1 for r in unpriv if r["selected"]) / len(unpriv)

    if rate_priv == 0:
        return 1.0

    ratio = rate_unpriv / rate_priv

    if ratio < DISPARATE_IMPACT_MINIMUM:
        logger.warning("disparate_impact_below_threshold",
                       attribute=protected_attribute,
                       ratio=ratio,
                       threshold=DISPARATE_IMPACT_MINIMUM)

    return ratio

def rerank_equitable(candidates: list[dict], protected_attribute: str) -> list[dict]:
    """
    Re-ranking equitativo (Rooney Rule adaptado).
    Se activa automáticamente si disparate impact < 0.80.
    Garantiza representación mínima de grupos subrepresentados en top-5.
    """
    # Implementar lógica de re-ranking aquí
    ...
```

---

## Entrenamiento del Modelo

```python
# app/ml/train.py
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import train_test_split, cross_val_score
import joblib
import mlflow

def train_matching_model(X, y, experiment_name="matching_model"):
    """
    SIEMPRE fijar random_state=42 para reproducibilidad total.
    Comparar RF vs GBT y seleccionar el de mayor F1.
    Registrar todo en MLflow para trazabilidad de la investigación.
    """
    mlflow.set_experiment(experiment_name)

    with mlflow.start_run():
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y  # ← SIEMPRE random_state=42
        )

        models = {
            "random_forest": RandomForestClassifier(n_estimators=100, random_state=42),
            "gradient_boosting": GradientBoostingClassifier(n_estimators=100, random_state=42),
        }

        best_model, best_f1 = None, 0.0

        for name, model in models.items():
            model.fit(X_train, y_train)
            y_pred = model.predict(X_val)
            metrics = evaluate_model(y_val, y_pred, model.predict_proba(X_val)[:, 1])

            mlflow.log_params({"model": name, "random_state": 42})
            mlflow.log_metrics(metrics)

            if metrics["f1_score"] > best_f1:
                best_model, best_f1 = model, metrics["f1_score"]

        # Desplegar solo si supera F1 mínimo de producción
        if best_f1 >= F1_MINIMUM_PRODUCTION:
            joblib.dump(best_model, "models/matching_model.pkl")
            mlflow.sklearn.log_model(best_model, "model")
            logger.info("model_deployed", f1=best_f1)
        else:
            logger.error("model_not_deployed_f1_too_low", f1=best_f1, minimum=F1_MINIMUM_PRODUCTION)
```

---

## KPIs de Investigación — Fórmulas exactas

```python
# app/services/research_metrics.py

def velocidad_insercion_laboral(worker_id: str, db) -> int | None:
    """VIL = días entre registro y primer contrato. None si no tiene contratos."""
    ...

def indice_visibilidad_perfil(worker_id: str, db) -> float:
    """IVP = (apariciones en búsquedas / total consultas últimos 30 días) × 100"""
    ...

def tasa_formalizacion(db) -> float:
    """% trabajadores con al menos 1 contrato registrado"""
    ...

def reduccion_brecha_salarial(worker_id: str, db) -> float | None:
    """((ingreso_post - ingreso_pre) / ingreso_pre) × 100"""
    ...

# ⚠️ NUNCA modificar estas fórmulas sin validar con el equipo investigador
# Son las variables dependientes de la hipótesis de la tesis
```

---

## Checklist antes de cada PR con cambios en NLP/ML

- [ ] `random_state=42` en todos los modelos sklearn
- [ ] F1-score validado ≥ 0.75 en conjunto de validación
- [ ] Disparate impact ratio calculado ≥ 0.80 para género y zona
- [ ] Experimento registrado en MLflow con métricas completas
- [ ] Tests unitarios del pipeline NLP con textos en español coloquial
- [ ] Embeddings generados con modelo `paraphrase-multilingual-MiniLM-L12-v2`
- [ ] Score combinado usando fórmula: `0.5×cosine + 0.3×ml + 0.2×reputation`
- [ ] KPIs de investigación no modificados

---

## Prohibiciones absolutas

- ❌ No cambiar `MODEL_NAME` sin actualizar todos los embeddings existentes en BD
- ❌ No modificar `EMBEDDING_DIM` — rompe el índice HNSW y toda la BD vectorial
- ❌ No usar `random_state` distinto de 42 — rompe reproducibilidad de la tesis
- ❌ No desplegar modelo con F1 < 0.75
- ❌ No ignorar alertas de disparate impact < 0.80
- ❌ No modificar las fórmulas de los KPIs de investigación
- ❌ No generar embeddings sincrónicamente en endpoints (siempre Celery)
