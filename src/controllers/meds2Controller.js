const Meds2 = require('../models/Meds2');

exports.registerMeds2 = async (req, res) => {
  try {
    const { Name_of_Medication, Doses_sizes, Company, What_it_does, Potential_Side_Effects, Directions } = req.body;

    if (!Name_of_Medication || !Doses_sizes || !Company ||! What_it_does ||! Potential_Side_Effects ||! Directions ) {
      return res.status(400).json({ error: 'All fields (Name_of_Medication, Doses_sizes, Company, What_it_does, Potential_Side_Effects, Directions) are required' });
    }

    const newMeds2 = new Meds2({
      Name_of_Medication: Name_of_Medication,
      Doses_sizes: Doses_sizes,
      Company: Company,
      What_it_does: What_it_does,
      Potential_Side_Effects: Potential_Side_Effects,
      Directions: Directions
    });


    await newMeds2.save();


   

    res.status(200).json({ message: 'Meds2 recorded successfully'});
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};