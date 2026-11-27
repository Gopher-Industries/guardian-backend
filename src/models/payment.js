const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
    index: true
    },
    billing: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Billing',
        required: true,
        unique: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0.01,
        validate: {
        validator: value =>
            Number.isFinite(value) &&
            Math.abs(value - Math.round(value * 100) / 100) < 1e-9,
        message: 'Payment amount must have at most two decimal places'
        }
    },
    recorded_at: {
        type: Date,
        default: Date.now
    },
    recorded_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
});

module.exports = mongoose.model('Payment', PaymentSchema);