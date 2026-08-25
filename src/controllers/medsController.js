const Meds = require('../models/Meds');

exports.registerMeds = async (req, res) => {
  try {
    const { Name_of_Medication, Doses_sizes, Company, What_it_does, Potential_Side_Effects, Directions } = req.body;

    if (!Name_of_Medication || !Doses_sizes || !Company ||! What_it_does ||! Potential_Side_Effects ||! Directions ) {
      return res.status(400).json({ error: 'All fields (Name_of_Medication, Doses_sizes, Company, What_it_does, Potential_Side_Effects, Directions) are required' });
    }

    const newMeds = new Meds({
      Name_of_Medication: Name_of_Medication,
      Doses_sizes: Doses_sizes,
      Company: Company,
      What_it_does: What_it_does,
      Potential_Side_Effects: Potential_Side_Effects,
      Directions: Directions
    });


    await newMeds.save();


   

    res.status(200).json({ message: 'Meds recorded successfully'});
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};