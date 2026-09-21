const Test = require('../models/Test');

exports.Test = async (req, res) => {
  try {
    const { test_var_1, test_var_2 } = req.body;

    if (!test_var_1 || !test_var_2) {
      return res.status(400).json({ error: 'All fields (test_var_1, test_var_2) are required' });
    }

    const newTest = new Test({
      test_var_1: test_var_1,
      test_var_2: test_var_2
    });

    

    await newTest.save();

    res.status(201).json({ message: 'Test successful'});
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};