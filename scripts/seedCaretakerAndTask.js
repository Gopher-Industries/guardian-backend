const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Caretaker = require('../src/models/Caretaker');
const Patient = require('../src/models/Patient');
const Task = require('../src/models/Task');

dotenv.config();
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

(async () => {
  try {
    const email = 'seedcaretaker@example.com';

    await Caretaker.deleteOne({ email });
    await Task.deleteMany({});

    const caretaker = new Caretaker({
      name: 'Seed Caretaker',
      email,
      password: 'SeedPassword123',
      isApproved: true
    });
    await caretaker.save();

    const patient = await Patient.findOne();
    if (!patient) throw new Error('Patient not found.');

    const task = new Task({
      description: 'Assist with morning medication',
      dueDate: new Date(),
      priority: 'High',
      caretaker: caretaker._id,
      patient: patient._id
    });
    await task.save();

    console.log('✅ Caretaker + Task seeded.');
    console.log('Caretaker ID:', caretaker._id.toString());
    console.log('Task ID:', task._id.toString());

    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding error:', err);
    process.exit(1);
  }
})();