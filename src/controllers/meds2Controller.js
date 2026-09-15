const Meds2 = require('../models/Meds2');

// Add a new medication (Your existing code)
exports.registerMeds2 = async (req, res) => {
  try {
    const { Name_of_Medication, Doses_sizes, Company, What_it_does, Potential_Side_Effects, Directions } = req.body;

    if (!Name_of_Medication || !Doses_sizes || !Company || !What_it_does || !Potential_Side_Effects || !Directions) {
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

    res.status(200).json({ message: 'Meds2 recorded successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// NEW: Delete a medication record by ID from MongoDB
exports.deleteMedication = async (req, res) => {
  try {
    const medicationId = req.params.id;

    // Find and delete the document by its _id
    const deletedMed = await Meds2.findByIdAndDelete(medicationId);

    // If no medication matches the given ID
    if (!deletedMed) {
      return res.status(404).json({ 
        success: false, 
        error: 'Medication record not found.' 
      });
    }

    // Return success response
    return res.status(200).json({ 
      success: true, 
      message: 'Medication record deleted successfully.' 
    });
    
  } catch (error) {
    console.error('Error deleting medication:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
