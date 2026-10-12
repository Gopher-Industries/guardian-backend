const Role = require('./models/Role');

const seedRoles = async () => {
  const roles = ['admin', 'nurse', 'caretaker', 'doctor'];

  try {
    for (let role of roles) {
      const existingRole = await Role.findOne({ name: role });

      if (!existingRole) {
        await Role.create({ name: role });
        console.log(`Role '${role}' added to the database.`);
      } else {
        console.log(`Role '${role}' already exists in the database.`);
      }
    }
  } catch (error) {
    console.error('Error seeding roles:', error);
    throw error;
  }
};

module.exports = seedRoles;