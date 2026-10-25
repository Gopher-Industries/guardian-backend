import os
from pathlib import Path

import joblib
import pandas as pd
import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.svm import SVC
from sklearn.neighbors import KNeighborsClassifier

from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    ConfusionMatrixDisplay
)


# =========================================================
# CONFIGURATION
# =========================================================

# Folder containing this Python file.
OUTPUT_FOLDER = Path(__file__).resolve().parent

# SisFall dataset location.
#
# If your dataset is still in this location,
# you do not need to change anything.
#
# You can also set SISFALL_DATASET_PATH
# as an environment variable later.
BASE_PATH = Path(
    os.getenv(
        "SISFALL_DATASET_PATH",
        r"E:\Deakin\T3\Sit764\dataset\SisFall_dataset"
    )
)

MODEL_FILE = OUTPUT_FOLDER / "fall_classifier.pkl"
SCALER_FILE = OUTPUT_FOLDER / "fall_scaler.pkl"


# =========================================================
# 1. CHECK DATASET
# =========================================================

print("")
print("========================================")
print("SISFALL MODEL TRAINING")
print("========================================")

print("")
print("Dataset path:")
print(BASE_PATH)

print("")
print("Output folder:")
print(OUTPUT_FOLDER)


if not BASE_PATH.exists():
    raise FileNotFoundError(
        f"SisFall dataset folder not found:\n{BASE_PATH}"
    )


# =========================================================
# 2. LOAD DATASET
# =========================================================

all_data = []


for subject_folder in os.listdir(BASE_PATH):

    subject_path = BASE_PATH / subject_folder

    if not subject_path.is_dir():
        continue


    print(
        f"Processing folder: {subject_folder}"
    )


    for filename in os.listdir(subject_path):

        if not filename.endswith(".txt"):
            continue


        filepath = subject_path / filename


        # SisFall:
        #
        # F = Fall
        # D = Daily / normal activity
        #
        label = (
            1
            if filename.upper().startswith("F")
            else 0
        )


        try:

            df = pd.read_csv(
                filepath,
                header=None,
                sep=r"[,;\s]+",
                engine="python",
                on_bad_lines="skip"
            )


            # Keep first 9 sensor features
            df = df.iloc[:, :9]


            # Convert values into numeric form
            df = df.apply(
                pd.to_numeric,
                errors="coerce"
            )


            # Remove completely empty rows
            df.dropna(
                how="all",
                inplace=True
            )


            if (
                df.shape[1] == 9
                and len(df) > 0
            ):

                df["label"] = label

                all_data.append(
                    df
                )


        except Exception as error:

            print(
                f"Error reading {filepath}: "
                f"{error}"
            )


# =========================================================
# CHECK THAT DATA WAS FOUND
# =========================================================

if not all_data:

    raise RuntimeError(
        "No SisFall data could be loaded."
    )


full_dataset_df = pd.concat(
    all_data,
    ignore_index=True
)


print("")
print(
    "Dataset Loaded Successfully!"
)

print(
    "Original Shape:",
    full_dataset_df.shape
)


# =========================================================
# 3. SAMPLE DATA FOR SPEED
# =========================================================

SAMPLE_SIZE = 200000


if len(full_dataset_df) > SAMPLE_SIZE:

    full_dataset_df = (
        full_dataset_df.sample(
            n=SAMPLE_SIZE,
            random_state=42
        )
    )


print(
    "Sampled Shape:",
    full_dataset_df.shape
)


# =========================================================
# 4. DATA CLEANING
# =========================================================

sensor_cols = (
    full_dataset_df.columns[:9]
)


full_dataset_df[
    sensor_cols
] = full_dataset_df[
    sensor_cols
].apply(
    pd.to_numeric,
    errors="coerce"
)


full_dataset_df.dropna(
    subset=sensor_cols,
    how="all",
    inplace=True
)


full_dataset_df = (
    full_dataset_df
    .iloc[:, :9]
    .copy()
    .assign(
        label=full_dataset_df[
            "label"
        ]
    )
)


# =========================================================
# SENSOR FEATURE NAMES
# =========================================================

FEATURE_NAMES = [

    "acc1_x",
    "acc1_y",
    "acc1_z",

    "gyro_x",
    "gyro_y",
    "gyro_z",

    "acc2_x",
    "acc2_y",
    "acc2_z"

]


full_dataset_df.columns = (
    FEATURE_NAMES
    +
    ["label"]
)


print("")
print(
    "After cleaning:",
    full_dataset_df.shape
)


print("")
print(
    "Class distribution:"
)

print(
    full_dataset_df[
        "label"
    ].value_counts()
)


# =========================================================
# 5. FEATURES + TARGET
# =========================================================

X = full_dataset_df[
    FEATURE_NAMES
]

y = full_dataset_df[
    "label"
]


# =========================================================
# 6. TRAIN / TEST SPLIT
# =========================================================

X_train, X_test, y_train, y_test = (
    train_test_split(

        X,

        y,

        test_size=0.3,

        random_state=42,

        stratify=y

    )
)


print("")
print(
    "Training rows:",
    len(X_train)
)

print(
    "Testing rows:",
    len(X_test)
)


# =========================================================
# 7. SCALING
# =========================================================

scaler = StandardScaler()


X_train_scaled = (
    scaler.fit_transform(
        X_train
    )
)


X_test_scaled = (
    scaler.transform(
        X_test
    )
)


# =========================================================
# 8. CREATE MODELS
# =========================================================

rf = RandomForestClassifier(

    n_estimators=100,

    random_state=42,

    n_jobs=-1

)


svm = SVC(
    kernel="rbf"
)


knn = KNeighborsClassifier(
    n_neighbors=5
)


# =========================================================
# 9. TRAIN MODELS
# =========================================================

print("")
print(
    "Training Random Forest..."
)

rf.fit(
    X_train_scaled,
    y_train
)


print(
    "Training SVM..."
)

svm.fit(
    X_train_scaled,
    y_train
)


print(
    "Training KNN..."
)

knn.fit(
    X_train_scaled,
    y_train
)


# =========================================================
# 10. PREDICTIONS
# =========================================================

pred_rf = rf.predict(
    X_test_scaled
)


pred_svm = svm.predict(
    X_test_scaled
)


pred_knn = knn.predict(
    X_test_scaled
)


# =========================================================
# 11. ACCURACY
# =========================================================

acc_rf = accuracy_score(
    y_test,
    pred_rf
)


acc_svm = accuracy_score(
    y_test,
    pred_svm
)


acc_knn = accuracy_score(
    y_test,
    pred_knn
)


print("")
print(
    "========================================"
)

print(
    "MODEL ACCURACY"
)

print(
    "========================================"
)


print(
    f"Random Forest: {acc_rf:.4f}"
)

print(
    f"SVM:           {acc_svm:.4f}"
)

print(
    f"KNN:           {acc_knn:.4f}"
)


# =========================================================
# 12. BEST MODEL FOR EVALUATION
# =========================================================

results = [

    (
        "Random Forest",
        acc_rf,
        pred_rf
    ),

    (
        "SVM",
        acc_svm,
        pred_svm
    ),

    (
        "KNN",
        acc_knn,
        pred_knn
    )

]


best_model = max(
    results,
    key=lambda x: x[1]
)


print("")
print(
    "Best Model:",
    best_model[0]
)


# =========================================================
# 13. CLASSIFICATION REPORT
# =========================================================

print("")
print(
    "========================================"
)

print(
    "CLASSIFICATION REPORT"
)

print(
    "========================================"
)


print(

    classification_report(

        y_test,

        best_model[2],

        target_names=[
            "Normal",
            "Fall"
        ]

    )

)


# =========================================================
# 14. SAVE RANDOM FOREST MODEL
# =========================================================
#
# We intentionally save Random Forest for the Guardian
# fall detector service.
#
# This provides a consistent deployed classifier even
# though the evaluation section compares all 3 models.
# =========================================================

print("")
print(
    "Saving Guardian fall detector..."
)


joblib.dump(
    rf,
    MODEL_FILE
)


joblib.dump(
    scaler,
    SCALER_FILE
)


print("")
print(
    f"Model saved:"
)

print(
    MODEL_FILE
)


print("")
print(
    f"Scaler saved:"
)

print(
    SCALER_FILE
)


# =========================================================
# VERIFY SAVED FILES
# =========================================================

if not MODEL_FILE.exists():

    raise RuntimeError(
        "fall_classifier.pkl "
        "was not created."
    )


if not SCALER_FILE.exists():

    raise RuntimeError(
        "fall_scaler.pkl "
        "was not created."
    )


print("")
print(
    "✓ Fall classifier saved successfully"
)

print(
    "✓ Fall scaler saved successfully"
)


# =========================================================
# 15. RANDOM FOREST CLASSIFICATION REPORT
# =========================================================

print("")
print(
    "Random Forest Deployment Report:"
)


print(

    classification_report(

        y_test,

        pred_rf,

        target_names=[
            "Normal",
            "Fall"
        ]

    )

)


# =========================================================
# 16. CONFUSION MATRIX
# =========================================================

cm = confusion_matrix(
    y_test,
    pred_rf
)


disp = ConfusionMatrixDisplay(

    confusion_matrix=cm,

    display_labels=[
        "Normal",
        "Fall"
    ]

)


disp.plot()


plt.title(
    "Confusion Matrix - Random Forest"
)


plt.tight_layout()


CONFUSION_FILE = (
    OUTPUT_FOLDER
    / "fall_confusion_matrix.png"
)


plt.savefig(
    CONFUSION_FILE,
    dpi=150
)


plt.show()


# =========================================================
# 17. ACCURACY GRAPH
# =========================================================

models = [
    "Random Forest",
    "SVM",
    "KNN"
]


accuracies = [
    acc_rf,
    acc_svm,
    acc_knn
]


plt.figure(
    figsize=(8, 5)
)


bars = plt.bar(
    models,
    accuracies
)


plt.title(
    "Model Accuracy Comparison - SisFall"
)


plt.xlabel(
    "Model"
)


plt.ylabel(
    "Accuracy"
)


plt.ylim(
    0,
    1
)


for bar in bars:

    height = (
        bar.get_height()
    )

    plt.text(

        bar.get_x()
        +
        bar.get_width() / 2,

        height + 0.01,

        f"{height:.4f}",

        ha="center",

        va="bottom"

    )


plt.tight_layout()


ACCURACY_FILE = (
    OUTPUT_FOLDER
    / "fall_accuracy_graph.png"
)


plt.savefig(
    ACCURACY_FILE,
    dpi=150
)


plt.show()


# =========================================================
# COMPLETE
# =========================================================

print("")
print(
    "========================================"
)

print(
    "SISFALL TRAINING COMPLETE"
)

print(
    "========================================"
)


print(
    f"Deployment model: Random Forest"
)


print(
    f"Accuracy: {acc_rf:.4f}"
)


print("")
print(
    "Generated files:"
)


print(
    f"  {MODEL_FILE.name}"
)

print(
    f"  {SCALER_FILE.name}"
)

print(
    f"  {CONFUSION_FILE.name}"
)

print(
    f"  {ACCURACY_FILE.name}"
)


print(
    "========================================"
)