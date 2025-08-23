require('dotenv').config({ path: '../.env.local' });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const Role = require('../src/models/Role');
const User = require('../src/models/User');
const Patient = require('../src/models/Patient');
const EntryReport = require('../src/models/EntryReport');

class DatabaseManager {
  constructor() {
    this.isConnected = false;
    mongoose.set('strictQuery', false);
  }

  async connect() {
    if (this.isConnected) return;
    
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is required');
    }

    try {
      await mongoose.connect(process.env.MONGODB_URI);
      this.isConnected = true;
      console.log('Connected to database');
    } catch (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }
  }

  async disconnect() {
    if (!this.isConnected) return;
    await mongoose.disconnect();
    this.isConnected = false;
    console.log('\nDatabase disconnected');
  }

  async validateDatabase() {
    console.log('Validating database state...');
    
    const stats = {
      roles: await Role.countDocuments(),
      users: await User.countDocuments(),
      patients: await Patient.countDocuments(),
      reports: await EntryReport.countDocuments()
    };

    console.log(`Current database state:
    - Roles: ${stats.roles}
    - Users: ${stats.users}
    - Patients: ${stats.patients}
    - Reports: ${stats.reports}`);

    const issues = [];
    
    const orphanedPatients = await Patient.countDocuments({
      $and: [
        { $or: [{ caretaker: { $exists: false } }, { caretaker: null }] },
        { $or: [{ assignedNurses: { $exists: false } }, { assignedNurses: { $size: 0 } }] }
      ]
    });

    if (orphanedPatients > 0) {
      issues.push(`${orphanedPatients} patients without proper caregiver assignment`);
    }

    const usersWithoutRoles = await User.countDocuments({ role: { $exists: false } });
    if (usersWithoutRoles > 0) {
      issues.push(`${usersWithoutRoles} users without assigned roles`);
    }

    if (issues.length > 0) {
      console.log('Data integrity issues found:');
      issues.forEach(issue => console.log(`   - ${issue}`));
      return false;
    }

    console.log('Database validation passed');
    return true;
  }

  async fullSeed() {
    console.log('Starting comprehensive database seeding...\n');
    
    try {
      await this.connect();
      
      // Seed roles
      console.log('Seeding roles...');
      const requiredRoles = ['admin', 'nurse', 'caretaker'];
      let rolesCreated = 0;
      for (const roleName of requiredRoles) {
        const existingRole = await Role.findOne({ name: roleName });
        if (!existingRole) {
          await Role.create({ name: roleName });
          rolesCreated++;
        }
      }
      console.log(`   ${rolesCreated} roles created, ${requiredRoles.length - rolesCreated} already existed`);

      // Get role IDs
      const roles = await Role.find({});
      const roleMap = {};
      roles.forEach(role => roleMap[role.name] = role._id);

      // Seed users
      console.log('\nSeeding users...');
      const defaultPassword = await bcrypt.hash('Guardian2024!', 12);
      const userData = [
        { fullname: 'Dr. Sarah Wilson', email: 'sarah.wilson@guardian.com', role: roleMap.admin },
        { fullname: 'Nurse Jennifer Martinez', email: 'jennifer.martinez@guardian.com', role: roleMap.nurse },
        { fullname: 'Nurse Michael Chen', email: 'michael.chen@guardian.com', role: roleMap.nurse },
        { fullname: 'Alice Thompson', email: 'alice.thompson@guardian.com', role: roleMap.caretaker },
        { fullname: 'Robert Davis', email: 'robert.davis@guardian.com', role: roleMap.caretaker }
      ];

      let usersCreated = 0;
      for (const user of userData) {
        const existingUser = await User.findOne({ email: user.email });
        if (!existingUser) {
          await User.create({ ...user, password_hash: defaultPassword });
          usersCreated++;
        }
      }
      console.log(`   ${usersCreated} users created, ${userData.length - usersCreated} already existed`);

      // Get users
      const caretakers = await User.find({}).populate('role').then(users => 
        users.filter(user => user.role?.name === 'caretaker')
      );
      const nurses = await User.find({}).populate('role').then(users => 
        users.filter(user => user.role?.name === 'nurse')
      );

      // Seed patients
      if (caretakers.length > 0 && nurses.length > 0) {
        console.log('\nSeeding patients...');
        const patientData = [
          {
            fullname: 'Eleanor Rodriguez',
            dateOfBirth: new Date('1945-03-15'),
            gender: 'female',
            caretaker: caretakers[0]._id,
            assignedNurses: [nurses[0]._id],
            healthConditions: ['hypertension', 'diabetes type 2']
          },
          {
            fullname: 'William Johnson',
            dateOfBirth: new Date('1938-11-22'),
            gender: 'male',
            caretaker: caretakers[1] ? caretakers[1]._id : caretakers[0]._id,
            assignedNurses: nurses.length > 1 ? [nurses[0]._id, nurses[1]._id] : [nurses[0]._id],
            healthConditions: ['heart disease']
          },
          {
            fullname: 'Margaret Chen',
            dateOfBirth: new Date('1942-07-08'),
            gender: 'female',
            caretaker: caretakers[0]._id,
            assignedNurses: [nurses[0]._id],
            healthConditions: ['osteoporosis']
          }
        ];

        let patientsCreated = 0;
        for (const patient of patientData) {
          const existingPatient = await Patient.findOne({ 
            fullname: patient.fullname,
            dateOfBirth: patient.dateOfBirth 
          });
          if (!existingPatient) {
            await Patient.create(patient);
            patientsCreated++;
          }
        }
        console.log(`   ${patientsCreated} patients created, ${patientData.length - patientsCreated} already existed`);
      }

      // Seed reports
      const patients = await Patient.find({}).populate('assignedNurses');
      const existingReports = await EntryReport.countDocuments();
      
      if (patients.length > 0 && nurses.length > 0 && existingReports === 0) {
        console.log('\nSeeding entry reports...');
        const activityTypes = ['wake up', 'meal', 'medication', 'exercise', 'reading', 'sleep'];
        const reportData = [];
        
        patients.forEach(patient => {
          const assignedNurses = patient.assignedNurses.length > 0 ? patient.assignedNurses : nurses;
          
          for (let day = 0; day < 3; day++) {
            const dayDate = new Date();
            dayDate.setDate(dayDate.getDate() - day);
            
            for (let i = 0; i < 2; i++) {
              const activityTime = new Date(dayDate);
              activityTime.setHours(8 + (i * 6), 0, 0, 0);
              
              const nurse = assignedNurses[Math.floor(Math.random() * assignedNurses.length)];
              const activityType = activityTypes[Math.floor(Math.random() * activityTypes.length)];
              
              reportData.push({
                patient: patient._id,
                nurse: nurse._id || nurse,
                activityType,
                comment: `${patient.fullname} completed ${activityType} activity successfully.`,
                activityTimestamp: activityTime
              });
            }
          }
        });

        if (reportData.length > 0) {
          await EntryReport.insertMany(reportData);
          console.log(`   ${reportData.length} entry reports created`);
        }
      }

      // Final validation and summary
      const stats = {
        roles: await Role.countDocuments(),
        users: await User.countDocuments(),
        patients: await Patient.countDocuments(),
        reports: await EntryReport.countDocuments()
      };

      console.log('\n=== Database Seeding Summary ===');
      console.log(`Total Records:`);
      console.log(`   Roles: ${stats.roles}`);
      console.log(`   Users: ${stats.users}`);
      console.log(`   Patients: ${stats.patients}`);
      console.log(`   Reports: ${stats.reports}`);

      const isValid = await this.validateDatabase();
      
      if (isValid) {
        console.log('\nDatabase seeding completed successfully');
      } else {
        console.log('\nDatabase seeding completed with validation warnings');
      }
      
    } catch (error) {
      console.error('\nDatabase seeding failed:', error.message);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  async resetDatabase() {
    console.log('Resetting database...');
    
    try {
      await this.connect();
      
      await EntryReport.deleteMany({});
      await Patient.deleteMany({});
      await User.deleteMany({});
      await Role.deleteMany({});
      
      console.log('Database reset completed');
      
      return await this.fullSeed();
    } catch (error) {
      console.error('Database reset failed:', error.message);
      throw error;
    }
  }
}

class SeedingCLI {
  constructor() {
    this.dbManager = new DatabaseManager();
    this.args = process.argv.slice(2);
  }

  showHelp() {
    console.log(`
Guardian Backend Database Seeding Tool

Usage: node seed-database.js [options]

Options:
  --reset      Reset database completely before seeding
  --validate   Only validate existing data integrity
  --help       Show this help message

Examples:
  node seed-database.js                 # Seed missing data only
  node seed-database.js --reset         # Reset and seed all data
  node seed-database.js --validate      # Validate data integrity only

Default behavior: Seeds only missing data, preserves existing records.
`);
  }

  async run() {
    try {
      if (this.args.includes('--help')) {
        this.showHelp();
        return;
      }

      console.log('Guardian Backend Database Seeding Tool');
      console.log('==========================================\n');

      if (this.args.includes('--validate')) {
        await this.validateOnly();
      } else if (this.args.includes('--reset')) {
        await this.resetAndSeed();
      } else {
        await this.seedMissing();
      }
    } catch (error) {
      console.error('\nFatal Error:', error.message);

      if (process.env.NODE_ENV === 'development') {
        console.error('\nStack trace:', error.stack);
      }

      process.exit(1);
    }
  }

  async validateOnly() {
    console.log('Running database validation only...\n');

    await this.dbManager.connect();
    const isValid = await this.dbManager.validateDatabase();
    await this.dbManager.disconnect();

    if (isValid) {
      console.log('\nDatabase validation passed - no issues found');
      process.exit(0);
    } else {
      console.log(
        '\nDatabase validation found issues - consider running with --reset'
      );
      process.exit(1);
    }
  }

  async resetAndSeed() {
    console.log('Resetting database and seeding fresh data...\n');

    if (process.env.NODE_ENV === 'production') {
      console.log('WARNING: This will delete ALL existing data!');
      console.log('This operation cannot be undone.');
      console.log(
        'To proceed in production, set CONFIRM_RESET=true environment variable'
      );

      if (process.env.CONFIRM_RESET !== 'true') {
        console.log('Reset cancelled for safety');
        process.exit(1);
      }
    }

    await this.dbManager.resetDatabase();
  }

  async seedMissing() {
    console.log('Seeding missing data (preserving existing records)...\n');
    await this.dbManager.fullSeed();
  }
}

if (require.main === module) {
  const cli = new SeedingCLI();
  cli.run();
}

module.exports = SeedingCLI;