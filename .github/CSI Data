Table users {
    id ObjectId [pk, not null] 
    username string [unique, not null]
    email string [unique, not null]
    password_hash string [not null]
    created_at date [default: `current_timestamp`]
    updated_at date [default: `current_timestamp`]
}

Table WifiCSI {
    user_id ObjectId [not null, ref: > users.id]
    timestamp date [default: `current_timestamp`]
    created_at date [default: `current_timestamp`]
    csi_data JSON [not null]
}

Table csi_data {
    user_id ObjectId [not null, ref: > users.id]
    csi_id ObjectId [pk, not null]
    timestamp date [not null]
    csi_values JSON [not null, unique]
    frequency_band int [not null]
    subcarrier_index int
    amplitude double
    phase double
    created_at date [default: `current_timestamp`]
    updated_at date [default: `current_timestamp`]
}

Table AlertSchema {
    alert_id ObjectId [pk, not null]
    user_id ObjectId [not null, ref: > users.id]
    alert_type string [not null]
    message TEXT [not null]
    is_read BOOLEAN [not null, default: false]
    created_at date [default: `current_timestamp`]
}

Table NotificationSchema {
    notification_id ObjectId [pk, not null]
    user_id ObjectId [not null, ref: > users.id]
    notification_type string [not null]
    message TEXT
    sent_at date
}

Table WifiCSIArchiveSchema {
    archive_id ObjectId [pk, not null]
    user_id ObjectId [not null, ref: > users.id]
    timestamp date
    start_date TIMESTAMP
    csi_data JSON
    archived_at TIMESTAMP [default: `current_timestamp`]
}

Table ActivityRecognitionSchema {
    recognition_id ObjectId [pk, not null]
    user_id ObjectId [not null, ref: > users.id]
    wifi_csi_id ObjectId [not null, ref: > WifiCSI.user_id]
    activity_type string [not null]
    confidence float
    created_at date [default: `current_timestamp`]
    detected_at date
}

Table UserRole {
    user_role_id ObjectId [pk, not null]
    user_id ObjectId [not null, ref: > users.id]
    role_name String [not null]
}

Table notifications {
    notification_id ObjectId [pk, not null]
    user_id ObjectId [not null, ref: > users.id]
    notification_type ENUM('Alert', 'Reminder', 'Task Update') [not null]
    message TEXT
    is_read BOOLEAN [default: false]
    created_at TIMESTAMP [default: `current_timestamp`]
}
