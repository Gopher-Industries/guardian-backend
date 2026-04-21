const CarePlan = require('../models/CarePlan');
const Patient = require('../models/Patient');

exports.createCarePlan = async (req, res) => {
  try {
    const { title, patientId, tasks } = req.body;
    const authorId = req.user._id;

    if (!title || !patientId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const carePlan = new CarePlan({
      title,
      patient: patientId,
      author: authorId,
      tasks: tasks || []
    });

    await carePlan.save();
    return res.status(201).json({ message: 'Care plan created', carePlan });
  } catch (error) {
    return res.status(500).json({ message: 'Error creating care plan', details: error.message });
  }
};

exports.updateCarePlan = async (req, res) => {
  try {
    const { carePlanId } = req.params;
    const updates = req.body;

    const carePlan = await CarePlan.findByIdAndUpdate(carePlanId, updates, { new: true, runValidators: true })
      .populate('tasks');

    if (!carePlan) return res.status(404).json({ message: 'Care plan not found' });

    return res.status(200).json({ message: 'Care plan updated', carePlan });
  } catch (error) {
    return res.status(500).json({ message: 'Error updating care plan', details: error.message });
  }
};

exports.getCarePlanByPatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const carePlans = await CarePlan.find({ patient: patientId })
      .populate({
        path: 'tasks',
        populate: {
          path: 'assignee',
          select: 'fullname email'
        }
      })
      .populate('author', 'fullname email')
      .sort({ created_at: -1 });

    return res.status(200).json(carePlans);
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching care plan', details: error.message });
  }
};
