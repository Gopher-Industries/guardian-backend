import os
from pathlib import Path
from datetime import datetime, timezone

import joblib
import requests

from fastapi import FastAPI
from pydantic import BaseModel


# =========================================================
# CONFIGURATION
# =========================================================

BASE_DIR = Path(__file__).resolve().parent

MODEL_FILE = BASE_DIR / "fall_classifier.pkl"
SCALER_FILE = BASE_DIR / "fall_scaler.pkl"

BASE_URL = "http://localhost:3000/api/v1"

LOGIN_URL = f"{BASE_URL}/auth/login"
ALERT_URL = f"{BASE_URL}/alerts"
NOTIFICATION_URL = f"{BASE_URL}/notifications"

EMAIL = os.getenv("GUARDIAN_EMAIL")
PASSWORD = os.getenv("GUARDIAN_PASSWORD")


# =========================================================
# FASTAPI APP
# =========================================================

app = FastAPI(
    title="Guardian SisFall Detection API",
    description=(
        "Guardian Monitor fall detection service using "
        "the SisFall Random Forest classifier."
    ),
    version="1.0.0"
)


# =========================================================
# CHECK MODEL FILES
# =========================================================

if not MODEL_FILE.exists():
    raise FileNotFoundError(
        f"Fall classifier not found: {MODEL_FILE}"
    )

if not SCALER_FILE.exists():
    raise FileNotFoundError(
        f"Fall scaler not found: {SCALER_FILE}"
    )


# =========================================================
# LOAD MODEL
# =========================================================

print("")
print("========================================")
print("Loading Guardian SisFall detector")
print("========================================")

fall_model = joblib.load(MODEL_FILE)
fall_scaler = joblib.load(SCALER_FILE)

print("Fall classifier loaded.")
print("Fall scaler loaded.")
print("========================================")
print("")


# =========================================================
# SISFALL FEATURE NAMES
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


# =========================================================
# INPUT MODEL
# =========================================================

class FallInput(BaseModel):
    features: list[float]


# =========================================================
# AUTH HEADERS
# =========================================================

def auth_headers(token):

    return {
        "Authorization": f"Bearer {token}",
        "x-auth-token": token,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": (
            "Mozilla/5.0 "
            "(Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 "
            "Chrome/151.0 Safari/537.36"
        )
    }


# =========================================================
# LOGIN TO GUARDIAN BACKEND
# =========================================================

def login_to_backend():

    if not EMAIL or not PASSWORD:
        raise ValueError(
            "GUARDIAN_EMAIL and GUARDIAN_PASSWORD "
            "must be set before running the fall detector."
        )

    print("")
    print("Logging in to Guardian backend...")

    response = requests.post(
        LOGIN_URL,
        json={
            "email": EMAIL,
            "password": PASSWORD
        },
        timeout=120
    )

    response.raise_for_status()

    data = response.json()

    token = data.get("token")

    user = data.get(
        "user",
        {}
    )

    user_id = (
        user.get("id")
        or user.get("_id")
    )

    if not token:
        raise ValueError(
            "Backend login succeeded but no token was returned."
        )

    if not user_id:
        raise ValueError(
            "Backend login succeeded but no user ID was returned."
        )

    print(
        "Successfully authenticated with Guardian backend."
    )

    return token, user_id


# =========================================================
# STORE FALL ALERT
# =========================================================

def send_fall_alert(
    token,
    prediction,
    confidence
):

    confidence_text = (
        f"{confidence * 100:.2f}%"
        if confidence is not None
        else "N/A"
    )

    message = (
        "Patient fall detected by Guardian SisFall "
        f"classifier. Confidence: {confidence_text}."
    )

    payload = {
        "alert_type": "fall_detected",
        "message": message
    }

    response = requests.post(
        ALERT_URL,
        headers=auth_headers(token),
        json=payload,
        timeout=120
    )

    response.raise_for_status()

    data = response.json()

    print(
        "Guardian fall alert stored."
    )

    return data


# =========================================================
# SEND FRONTEND NOTIFICATION
# =========================================================

def send_fall_notification(
    token,
    user_id,
    confidence
):

    confidence_text = (
        f"{confidence * 100:.2f}%"
        if confidence is not None
        else "N/A"
    )

    payload = {

        "userId":
            user_id,

        "title":
            "Fall Detected",

        "message":
            (
                "Guardian AI detected a possible patient fall. "
                f"SisFall confidence: {confidence_text}."
            )
    }

    response = requests.post(
        NOTIFICATION_URL,
        headers=auth_headers(token),
        json=payload,
        timeout=120
    )

    response.raise_for_status()

    data = response.json()

    print(
        "Frontend fall notification created."
    )

    return data


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
def health():

    return {
        "status": "ok",
        "service": "Guardian SisFall Detector",
        "model_loaded": True,
        "expected_features": 9
    }


# =========================================================
# FALL PREDICTION
# =========================================================

@app.post("/predict/fall")
def predict_fall(data: FallInput):

    # -----------------------------------------------------
    # Validate number of features
    # -----------------------------------------------------

    if len(data.features) != 9:

        return {

            "error":
                "SisFall model requires exactly 9 sensor features",

            "received":
                len(data.features),

            "required_features":
                FEATURE_NAMES

        }


    try:

        # -------------------------------------------------
        # Scale features
        # -------------------------------------------------

        scaled_features = (
            fall_scaler.transform(
                [data.features]
            )
        )


        # -------------------------------------------------
        # Predict
        # -------------------------------------------------

        prediction = fall_model.predict(
            scaled_features
        )

        raw_prediction = int(
            prediction[0]
        )


        label = (
            "Fall"
            if raw_prediction == 1
            else "Normal"
        )


        # -------------------------------------------------
        # Prediction confidence
        # -------------------------------------------------

        confidence = None


        if hasattr(
            fall_model,
            "predict_proba"
        ):

            probabilities = (
                fall_model.predict_proba(
                    scaled_features
                )[0]
            )


            classes = list(
                fall_model.classes_
            )


            predicted_index = (
                classes.index(
                    raw_prediction
                )
            )


            confidence = float(
                probabilities[
                    predicted_index
                ]
            )


        # -------------------------------------------------
        # Build response
        # -------------------------------------------------

        response = {

            "model":
                "SisFall Random Forest",

            "prediction":
                label,

            "raw_prediction":
                raw_prediction,

            "confidence":
                confidence,

            "detected_at":
                datetime.now(
                    timezone.utc
                ).isoformat(),

            "alert_sent":
                False,

            "notification_sent":
                False

        }


        # -------------------------------------------------
        # If FALL detected:
        #
        # 1. Login
        # 2. Store Guardian alert
        # 3. Call Notification API
        # -------------------------------------------------

        if label == "Fall":

            print("")
            print(
                "========================================"
            )

            print(
                "FALL DETECTED"
            )

            print(
                "========================================"
            )

            print(
                "Raw prediction:",
                raw_prediction
            )

            print(
                "Confidence:",
                confidence
            )


            try:

                token, user_id = (
                    login_to_backend()
                )


                # -----------------------------------------
                # Storage API
                # -----------------------------------------

                alert_response = (
                    send_fall_alert(
                        token,
                        raw_prediction,
                        confidence
                    )
                )


                response[
                    "alert_sent"
                ] = True


                response[
                    "alert_response"
                ] = alert_response


                # -----------------------------------------
                # Notification API
                # -----------------------------------------

                notification_response = (
                    send_fall_notification(
                        token,
                        user_id,
                        confidence
                    )
                )


                response[
                    "notification_sent"
                ] = True


                response[
                    "notification_response"
                ] = notification_response


                print("")
                print(
                    "SUCCESS:"
                )

                print(
                    "Fall alert stored."
                )

                print(
                    "Frontend notification created."
                )

                print(
                    "========================================"
                )


            except requests.RequestException as error:

                print(
                    "Guardian backend request failed:",
                    error
                )


                response[
                    "backend_error"
                ] = str(error)


                if (
                    hasattr(
                        error,
                        "response"
                    )
                    and
                    error.response is not None
                ):

                    try:

                        response[
                            "backend_response"
                        ] = error.response.text

                    except Exception:

                        pass


            except Exception as error:

                print(
                    "Fall alert integration error:",
                    error
                )

                response[
                    "backend_error"
                ] = str(error)


        else:

            print("")
            print(
                "Normal activity detected."
            )

            print(
                "No fall alert required."
            )


        return response


    except Exception as error:

        return {
            "error":
                str(error)
        }