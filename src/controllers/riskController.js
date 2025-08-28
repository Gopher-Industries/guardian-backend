const RiskAssessment = require('../models/RiskAssessment');
const cfg = require('../config/humpty-dumpty.json');
const notifyRules = require('../services/notifyRules'); // we add riskAssessed() below

function scoreFromConfig(inputs) {
  let score = 0;
  const components = [];

  for (const item of cfg.items) {
    const choice = inputs[item.key];
    const pts = Number(item.options?.[choice]);
    if (!choice || Number.isNaN(pts)) {
      const allowed = Object.keys(item.options).join(', ');
      const e = new Error(`Invalid or missing "${item.key}". Allowed: ${allowed}`);
      e.status = 400;
      throw e;
    }
    components.push({ item: item.label, choice, points: pts });
    score += pts;
  }
  return { score, components };
}

function bandFromScore(score) {
  // Official scale: ≥12 = High, else Low
  return score >= cfg.thresholds.high ? 'high' : 'low';
}

exports.assessHumpty = async (req, res, next) => {
  try {
    const { patientId, inputs } = req.body || {};
    if (!patientId || !inputs) return res.status(400).json({ message: 'patientId and inputs are required' });

    const { score, components } = scoreFromConfig(inputs);
    const band = bandFromScore(score);

    const doc = await RiskAssessment.create({
      patientId, type: 'humpty-dumpty', score, band, components
    });

    // Notify the current user (your socket.io client joins with JWT _id)
    try {
      await notifyRules.riskAssessed({
        patientId,
        actorId: req.user?._id,
        score,
        band
      });
    } catch (_) {}

    res.status(201).json(doc);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

exports.latestHumpty = async (req, res, next) => {
  try {
    const { patient } = req.query || {};
    if (!patient) return res.status(400).json({ message: 'patient query param is required' });

    const doc = await RiskAssessment.findOne({ patientId: patient, type: 'humpty-dumpty' })
      .sort({ assessedAt: -1 })
      .lean();

    if (!doc) return res.status(404).json({ message: 'No assessment found' });
    res.json(doc);
  } catch (err) { next(err); }
};
