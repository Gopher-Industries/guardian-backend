import os
import subprocess
import sys
from pathlib import Path

import pandas as pd
import requests


BASE_URL = "http://localhost:3000/api/v1"

EMAIL = os.getenv("GUARDIAN_EMAIL")
PASSWORD = os.getenv("GUARDIAN_PASSWORD")

PIPELINE_FOLDER = Path(
    r"E:\Deakin\T4\SIT782 (Team Project B)\GuardianProject\Guardian"
)

PIPELINE_SCRIPT = PIPELINE_FOLDER / "guardian_pipeline_final.py"
PREDICTIONS_FILE = PIPELINE_FOLDER / "predictions_baseline.csv"

LOGIN_URL = f"{BASE_URL}/auth/login"
ALERT_URL = f"{BASE_URL}/alerts"
BACKEND_BRIDGE_URL = f"{BASE_URL}/backend-bridge"
NOTIFICATION_URL = f"{BASE_URL}/notifications"


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


def clean_value(value):

    if value is None:
        return None

    try:
        if pd.isna(value):
            return None
    except Exception:
        pass

    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass

    return value


def row_to_dict(row):

    result = {}

    for key, value in row.to_dict().items():
        result[str(key)] = clean_value(value)

    return result


def run_pipeline():

    print()
    print("========================================")
    print("Running Guardian prediction pipeline...")
    print("========================================")
    print()

    if not PIPELINE_SCRIPT.exists():
        raise FileNotFoundError(
            f"Pipeline script not found: {PIPELINE_SCRIPT}"
        )

    result = subprocess.run(
        [
            sys.executable,
            str(PIPELINE_SCRIPT)
        ],
        cwd=str(PIPELINE_FOLDER),
        check=False
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"Pipeline failed with exit code {result.returncode}"
        )

    if not PREDICTIONS_FILE.exists():
        raise FileNotFoundError(
            f"Predictions file was not created: {PREDICTIONS_FILE}"
        )

    print()
    print("Pipeline completed successfully.")


def login():

    print()
    print("Logging in to Guardian backend...")

    if not EMAIL or not PASSWORD:
        raise ValueError(
            "GUARDIAN_EMAIL and GUARDIAN_PASSWORD must be set."
        )

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

    user = data.get("user", {})

    user_id = (
        user.get("id")
        or user.get("_id")
    )

    if not token:
        raise ValueError(
            "Login succeeded but no token was returned."
        )

    if not user_id:
        raise ValueError(
            "Login succeeded but no user ID was returned."
        )

    print(
        "Successfully authenticated with Guardian backend."
    )

    print(
        f"Authenticated user ID: {user_id}"
    )

    return token, user_id


def build_alert_message(row):

    subject_id = clean_value(
        row.get("subject_id", "Unknown")
    )

    final_alert = clean_value(
        row.get("final_alert", "Unknown")
    )

    explanation = clean_value(
        row.get("explanation", "")
    )

    combined_score = clean_value(
        row.get("combined_score")
    )

    message = (
        f"Guardian AI detected a {final_alert} risk alert "
        f"for subject {subject_id}."
    )

    if explanation:
        message += f" {explanation}"

    if combined_score is not None:
        message += (
            f" Combined score: {combined_score}."
        )

    return message


def send_backend_bridge_record(row, token):

    complete_row = row_to_dict(row)

    payload = {
        "subject_id": clean_value(
            row.get("subject_id")
        ),

        "note_id": clean_value(
            row.get("note_id")
        ),

        "model": clean_value(
            row.get("model")
        ),

        "final_alert": clean_value(
            row.get("final_alert")
        ),

        "combined_score": clean_value(
            row.get("combined_score")
        ),

        "text_concern": clean_value(
            row.get("text_concern")
        ),

        "vitals_risk": clean_value(
            row.get("vitals_risk")
        ),

        "anomaly_flag": clean_value(
            row.get("anomaly_flag")
        ),

        "anomaly_type": clean_value(
            row.get("anomaly_type")
        ),

        "borderline": clean_value(
            row.get("borderline")
        ),

        "explanation": clean_value(
            row.get("explanation")
        ),

        # Complete AI prediction row
        "raw_data": complete_row
    }

    response = requests.post(
        BACKEND_BRIDGE_URL,
        json=payload,
        headers=auth_headers(token),
        timeout=120
    )

    response.raise_for_status()

    data = response.json()

    print(
        "Backend Bridge record saved."
    )

    alert = data.get(
        "alert",
        {}
    )

    if alert.get("_id"):
        print(
            "Bridge MongoDB ID:",
            alert.get("_id")
        )

    if alert.get("recorded_at"):
        print(
            "Recorded at:",
            alert.get("recorded_at")
        )

    if alert.get("raw_data"):

        print(
            "Raw fields stored:",
            len(
                alert.get("raw_data", {})
            )
        )

    return data


def send_alert(row, token):

    payload = {
        "alert_type": "AI Backend Bridge",
        "message": build_alert_message(row)
    }

    response = requests.post(
        ALERT_URL,
        json=payload,
        headers=auth_headers(token),
        timeout=120
    )

    response.raise_for_status()

    data = response.json()

    print(
        "Guardian Alert created."
    )

    alert = (
        data.get("alert")
        or data
    )

    if isinstance(alert, dict):

        alert_id = (
            alert.get("_id")
            or alert.get("id")
        )

        if alert_id:
            print(
                f"Alert ID: {alert_id}"
            )

    return data


def send_notification(
    row,
    token,
    user_id
):

    final_alert = clean_value(
        row.get(
            "final_alert",
            "Alert"
        )
    )

    payload = {
        "userId": user_id,

        "title": (
            f"Guardian AI {final_alert} Alert"
        ),

        "message": build_alert_message(
            row
        )
    }

    response = requests.post(
        NOTIFICATION_URL,
        json=payload,
        headers=auth_headers(token),
        timeout=120
    )

    response.raise_for_status()

    data = response.json()

    print(
        "Frontend notification created."
    )

    notification = (
        data.get("notification")
        or data
    )

    if isinstance(
        notification,
        dict
    ):

        notification_id = (
            notification.get("_id")
            or notification.get("id")
        )

        if notification_id:
            print(
                "Notification ID:",
                notification_id
            )

    return data


def process_predictions(
    token,
    user_id
):

    predictions = pd.read_csv(
        PREDICTIONS_FILE
    )

    if "final_alert" not in predictions.columns:
        raise ValueError(
            "predictions_baseline.csv does not contain final_alert column."
        )

    alert_rows = predictions[
        predictions["final_alert"]
        .astype(str)
        .str.strip()
        .str.lower()
        .isin(
            [
                "medium",
                "high"
            ]
        )
    ]

    print()
    print(
        f"Found {len(alert_rows)} Medium/High alerts."
    )

    # Keep this for one more verification test
    alert_rows = alert_rows.head(3)

    print(
        f"Processing {len(alert_rows)} alerts for this test."
    )

    successful = 0
    failed = 0

    for _, row in alert_rows.iterrows():

        subject_id = clean_value(
            row.get(
                "subject_id",
                "Unknown"
            )
        )

        severity = clean_value(
            row.get(
                "final_alert",
                "Unknown"
            )
        )

        print()
        print(
            "========================================"
        )

        print(
            f"Processing subject: {subject_id}"
        )

        print(
            f"Severity: {severity}"
        )

        print(
            "========================================"
        )

        try:

            send_backend_bridge_record(
                row,
                token
            )

            send_alert(
                row,
                token
            )

            send_notification(
                row,
                token,
                user_id
            )

            successful += 1

            print(
                "SUCCESS: Backend Bridge + "
                "Alert + Notification completed."
            )

        except requests.RequestException as error:

            failed += 1

            print(
                f"FAILED for subject {subject_id}: {error}"
            )

            if (
                hasattr(error, "response")
                and error.response is not None
            ):

                print(
                    "Backend response:",
                    error.response.text
                )

        except Exception as error:

            failed += 1

            print(
                f"FAILED for subject {subject_id}: {error}"
            )

    print()
    print(
        "========================================"
    )

    print(
        "BACKEND BRIDGE SUMMARY"
    )

    print(
        "========================================"
    )

    print(
        f"Successful alerts: {successful}"
    )

    print(
        f"Failed alerts: {failed}"
    )

    print(
        f"Total processed: {len(alert_rows)}"
    )

    print(
        "========================================"
    )


def main():

    print()
    print(
        "========================================"
    )

    print(
        "Guardian Backend Bridge Starting"
    )

    print(
        "========================================"
    )

    try:

        run_pipeline()

        token, user_id = login()

        process_predictions(
            token,
            user_id
        )

    except requests.RequestException as error:

        print()
        print(
            f"Backend request failed: {error}"
        )

        if (
            hasattr(error, "response")
            and error.response is not None
        ):

            print(
                "Backend response:",
                error.response.text
            )

    except Exception as error:

        print()
        print(
            f"Bridge error: {error}"
        )


if __name__ == "__main__":
    main()