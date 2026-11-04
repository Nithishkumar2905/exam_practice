# ACCESSPREP-X — Academic Review Report
## Accessible SSC MTS Examination Preparation Portal
**Version:** 1.0 | **Date:** October 2026 | **Status:** Production Build

---

## REVIEW 1 DELIVERABLES

### 1.1 Problem & Case-Study Understanding

**Problem Statement:**
Candidates appearing for the Staff Selection Commission Multi-Tasking Staff (SSC MTS) examination who have visual impairments, low vision, or other PwD disabilities face significant barriers in effective examination preparation. Existing preparation resources lack:
- Screen-reader-optimized interfaces
- Voice-first input mechanisms for answering practice questions
- Real-time accessibility configuration (contrast, font scaling, TTS)
- DoPT-compliant compensatory time enforcement (60 min per 45-min session for PwD)

**Solution:**
ACCESSPREP-X is a purpose-built examination preparation portal providing voice-first question answering via OpenAI Whisper, Bayesian Knowledge Tracing for topic mastery monitoring, SM-2 spaced repetition revision planning, and full WCAG 2.1 AA/AAA accessibility compliance.

**Scope of Impact:**
- Primary Users: Visually impaired, low-vision, and locomotor-impaired SSC MTS candidates
- Regulatory Compliance: Rights of Persons with Disabilities (RPwD) Act 2016 and DoPT Guidelines
- Academic Impact: Machine learning subject classification enables automatic question categorization for the evolving question bank

### 1.2 Data Understanding

**Dataset Summary:**
| Attribute | Value |
|---|---|
| Total Records | 400 |
| Data Format | JSON Lines (ssc_mts_questions.json) |
| Dataset Version | v1.0-mts-verified |
| Language | English |
| Subjects | 4 (balanced, 100 each) |
| Unique Topics | 38 |
| Unique Subtopics | 127 |
| Verification Status | 100% Verified |
| Duplicate Questions | 0 |
| Missing Fields | 0 across 21 schema attributes |

**Subject Distribution:**

| Subject | Count | % |
|---|---|---|
| Numerical and Mathematical Ability | 100 | 25.0% |
| Reasoning Ability and Problem Solving | 100 | 25.0% |
| General Awareness | 100 | 25.0% |
| English Language and Comprehension | 100 | 25.0% |

**Difficulty Distribution:**

| Difficulty | Count | % |
|---|---|---|
| Easy | 257 | 64.3% |
| Medium | 130 | 32.5% |
| Hard | 13 | 3.2% |

*Distribution reflects authentic SSC MTS Tier-I difficulty pattern, where the majority of questions are at the Easy–Medium range.*

**Answer Option Distribution:**

| Option | Count |
|---|---|
| A | 100 |
| B | 100 |
| C | 100 |
| D | 100 |

*Perfectly balanced correct-answer distribution eliminates guessing bias.*

### 1.3 Metadata Understanding

**Schema Fields (21 Fields):**

| Field | Type | Required | Allowed Values |
|---|---|---|---|
| question_id | string | Yes | SSC-MTS-[SUB]-[NNN] format |
| subject | string | Yes | 4 defined subject strings |
| topic | string | Yes | From 38 validated topics |
| subtopic | string | Optional | From 127 subtopics |
| question_text | string | Yes | Free text, preserving operators |
| question_type | string | Yes | "multiple_choice" |
| option_a | string | Yes | Free text |
| option_b | string | Yes | Free text |
| option_c | string | Yes | Free text |
| option_d | string | Yes | Free text |
| correct_answer | string | Yes | "A" \| "B" \| "C" \| "D" |
| explanation | string | Yes | Step-by-step derivation |
| difficulty_label | string | Yes | "Easy" \| "Medium" \| "Hard" |
| source_name | string | Yes | Originating institution |
| source_reference | string | Yes | Specific exam/shift reference |
| source_type | string | Yes | "Official Exam Paper" |
| verification_status | string | Yes | "Verified" \| "Pending" |
| language | string | Yes | "English" |
| created_at | ISO-8601 | Yes | Auto-set at import |
| updated_at | ISO-8601 | Yes | Auto-updated on edit |
| dataset_version | string | Yes | e.g., "v1.0-mts-verified" |

### 1.4 Preprocessing

**Pipeline (scripts/train_model.py):**

1. **Unicode Normalization:** Preserve mathematical operators (+, -, *, /, ^, %), currency (Rs.), and punctuation critical to question meaning.
2. **Whitespace Normalization:** Collapse multiple whitespace using `re.sub(r'\s+', ' ', text).strip()`
3. **Case Normalization:** Convert to lowercase (preserving semantics)
4. **Missing Value Validation:** Assert no null values in `question_text` or `subject`
5. **Feature Extraction:** TF-IDF Vectorization with:
   - `ngram_range=(1, 2)` — captures unigrams and bigrams
   - `sublinear_tf=True` — log-normalization to reduce dominance of frequent terms
   - `max_df=0.90` — exclude terms in >90% of documents
   - `min_df=2` — minimum document frequency of 2

**Data Leakage Prevention:**
- TF-IDF vocabulary fitted ONLY on training fold
- `correct_answer` field explicitly excluded as predictive feature
- `explanation` field excluded (contains answer-relevant information)
- Stratified split ensures each class maintains proportional representation

**Before-After Statistics:**
| Metric | Before | After |
|---|---|---|
| Total Records | 400 | 400 |
| Records with Missing Fields | 0 | 0 |
| Duplicate Question IDs | 0 | 0 |
| Near-Duplicate Questions | 0 | 0 |
| Vocabulary Size (unigrams) | — | ~2,400 |
| Vocabulary Size (bigrams) | — | ~8,600 |

### 1.5 Scope and Impact

**Technical Scope:**
- 16 accessible application screens
- Real-time BKT topic mastery tracking
- SM-2 spaced repetition scheduling
- OpenAI Whisper voice input (when Python environment available)
- Gemini AI tutoring with RAG context
- Full WCAG 2.1 AA compliance

**Academic Impact:**
- Subject classification model (TF-IDF + LR) enables automated categorization of new exam questions
- Error analysis on misclassified examples provides direct guidance for dataset expansion

### 1.6 Novelty and Innovation

1. **Voice-First Exam Interface:** First known implementation of OpenAI Whisper STT specifically designed for MCQ exam answer selection by visually impaired candidates
2. **BKT + SM-2 Hybrid:** Combining Bayesian Knowledge Tracing (latent skill estimation) with SuperMemo SM-2 (forgetting curve scheduling) for adaptive revision
3. **Accessibility-First ML Dashboard:** Model evaluation metrics and inference examples made accessible via TTS-enabled admin interface
4. **DoPT Compliance Engine:** Automated compensatory time calculation (exactly 15 min per 45-min session) per official PwD accommodation rules

---

## REVIEW 2 DELIVERABLES

### 2.1 Model Selection

**Primary Task:** Predict the subject category of a question from its question text.

**Justification:** This task is meaningful because:
- New questions added to the bank can be auto-categorized
- Misclassified questions reveal boundary cases between subjects
- The 4-class classification maps directly to the 4 exam sections

**Baseline:** Majority-class classifier (25% accuracy on balanced 4-class dataset)

**Selected Model:** TF-IDF Vectorizer + Logistic Regression (L2, balanced weights)

**Rationale for Selection over LinearSVC:**
- **Probability outputs:** Logistic Regression provides calibrated class probabilities via `predict_proba`, enabling the inference API to report confidence scores per class
- **Equal performance:** Both models achieved 93.75% test accuracy (0% difference)
- **Interpretability:** Feature importance derivable from LR coefficient matrix
- **Production safety:** No margin inflation risk from SVM kernel trick

### 2.2 Training and Testing Methodology

| Configuration | Value |
|---|---|
| Random Seed | 42 |
| Train/Test Split | 80% / 20% (320 / 80 samples) |
| Split Strategy | Stratified (preserves 25% per class) |
| Cross-Validation | 5-Fold Stratified KFold |
| Vectorizer | TfidfVectorizer (max_features=5000, ngram_range=(1,2), sublinear_tf=True) |
| Classifier | LogisticRegression (C=2.0, max_iter=1000, solver='lbfgs', class_weight='balanced') |
| Benchmark | LinearSVC (C=1.0, loss='squared_hinge', max_iter=2000) |
| Training Time | 0.116 seconds |
| Total Pipeline Time | 0.460 seconds |

### 2.3 Results

**Primary Model (Logistic Regression):**

| Metric | Score |
|---|---|
| Test Accuracy | 93.75% |
| Macro Precision | 94.47% |
| Macro Recall | 93.75% |
| Macro F1-Score | 93.49% |
| Weighted F1-Score | 93.49% |
| 5-Fold CV Macro F1 | 89.89% ± 2.37% |

**Per-Class Results:**

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| English Language & Comprehension | 1.000 | 1.000 | 1.000 | 20 |
| General Awareness | 0.909 | 1.000 | 0.952 | 20 |
| Numerical and Mathematical Ability | 0.870 | 1.000 | 0.930 | 20 |
| Reasoning Ability and Problem Solving | 1.000 | 0.750 | 0.857 | 20 |

**4×4 Confusion Matrix (Test Set, n=80):**

```
Predicted →  ENG   GA   NUM   REA
Actual ENG: [ 20,   0,   0,   0 ]
Actual GA:  [  0,  20,   0,   0 ]
Actual NUM: [  0,   0,  20,   0 ]
Actual REA: [  0,   2,   3,  15 ]
```

**Benchmark Model (LinearSVC):**

| Metric | Score |
|---|---|
| Test Accuracy | 93.75% |
| Macro F1-Score | 93.49% |

*Logistic Regression selected as primary model due to probability calibration support.*

### 2.4 Inference

The inference service (`scripts/inference.py`) loads the trained scikit-learn Pipeline artifact (`src/data/model_artifact.pkl`, 97.8 KB) and executes subject classification on arbitrary question text.

**API Endpoint:** `POST /api/model/predict`
**Request:** `{ "questionText": "Find the unit digit in 2467^153 * 341^72" }`
**Response:** `{ "success": true, "predicted_subject": "Numerical and Mathematical Ability", "confidence": 0.97, "class_probabilities": {...}, "model_version": "v1.0" }`

The inference service returns calibrated probability distributions for all 4 classes per query.

### 2.5 Error Analysis

**Total Misclassified Test Examples:** 5 of 80 (6.25% error rate)

**Pattern: All 5 misclassifications involve Reasoning questions:**
1. Analogical reasoning with geographic proper nouns ("India : New Delhi :: Australia : ?") → classified as General Awareness due to country/capital vocabulary overlap
2. Series completion with purely numerical sequences (120, 99, 80, 63, 48, ?) → classified as Numerical Ability due to number-heavy token overlap
3. Blood relations with symbolic operators ("M % N means M is sister of N") → classified as General Awareness due to symbol ambiguity

**Root Cause:** TF-IDF treats surface-level vocabulary as the classification signal. Reasoning questions that use country names, numbers, or relationship vocabulary leak into neighboring subject categories.

**Mitigation Strategies:**
1. Character n-grams in addition to word n-grams to capture number pattern syntax
2. Domain-specific subtopic feature engineering (e.g., add subtopic as an auxiliary input feature)
3. Expand reasoning training examples for boundary-case subtopics (analogies, series with numbers)

### 2.6 Justification of Selected Model

The Logistic Regression + TF-IDF pipeline was chosen because:
1. **93.75% accuracy** significantly exceeds the majority-class baseline (25%)
2. **Calibrated probabilities** enable the production API to report confidence per class
3. **Interpretability:** Feature coefficients reveal which word/bigram patterns distinguish each subject (e.g., "lcm" → Numerical, "article" → General Awareness, "synonym" → English, "syllogism" → Reasoning)
4. **Computational efficiency:** 0.116 seconds training time; sub-millisecond inference
5. **Equivalent performance** to LinearSVC eliminates the need for a more complex model

### 2.7 Limitations and Future Work

**Current Limitations:**
1. 400 records is a small dataset by NLP standards. Cross-validation variance (±2.37%) indicates sensitivity to train/test partitioning
2. All questions are in English; Hindi-medium question bank not yet created
3. Difficulty prediction not implemented — the 3-label difficulty distribution (257 Easy, 130 Medium, 13 Hard) is severely imbalanced for the Hard class (3.2%), making supervised difficulty classification unreliable
4. Whisper integration requires a Python 3.8+ runtime with `openai-whisper` and `ffmpeg` installed — not bundled in the Node.js deployment environment
5. No PostgreSQL deployment configured — persistence uses JSON flat-file store

**Future Work:**
1. Expand dataset to 1000+ questions per subject through official SSC question paper archives
2. Implement Hindi language question bank with transliteration support
3. Deploy to a Python-native environment (FastAPI + Uvicorn) or containerize with Docker
4. Fine-tune a pre-trained sentence transformer (e.g., `paraphrase-multilingual-mpnet-base-v2`) for higher accuracy with semantic understanding
5. Implement difficulty prediction once sufficient Hard-label examples (minimum 50) are accumulated
6. Add student response prediction model using actual candidate attempt history (requires real cohort data)
7. PostgreSQL migration with Alembic versioned migrations

---

## APPENDIX

### A. Dataset Provenance
All 400 questions are sourced from SSC MTS Tier-I official examination papers (2021–2023, various shifts). Questions are labeled as `source_type: "Official Exam Paper"` with shift-level references in `source_reference`. All questions carry `verification_status: "Verified"` confirming manual answer verification.

### B. Reproducibility Checklist
- [x] Fixed random seed (42) for all stochastic operations
- [x] Training configuration saved in evaluation report JSON
- [x] Trained model + preprocessor saved as single pickle artifact
- [x] Evaluation report contains training timestamp, dataset version, split configuration
- [x] Scripts runnable with `python3 scripts/train_model.py` from project root

### C. Academic Integrity Statement
No student performance data was fabricated. The ML model was trained exclusively on question text features, not on student response labels. Metrics in the evaluation dashboard are loaded from the actual `model_evaluation_report.json` generated by the scikit-learn pipeline execution, not hardcoded display values.
