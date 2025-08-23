require('dotenv').config({ path: '../.env.local' });
const mongoose = require('mongoose');
const ValidationService = require('../src/utils/validation');

mongoose.set('strictQuery', false);

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database');

    console.log('\n=== Database Integrity Validation ===');
    
    const validation = await ValidationService.validateDatabaseIntegrity();
    
    console.log('\nValidation Results:');
    console.log(`   Total Issues: ${validation.summary.total}`);
    console.log(`   Critical: ${validation.summary.critical}`);
    console.log(`   Errors: ${validation.summary.errors}`);
    console.log(`   Warnings: ${validation.summary.warnings}`);

    if (validation.issues.length > 0) {
      console.log('\nIssues Found:');
      validation.issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. [${issue.severity}] ${issue.message}`);
      });

      console.log('\nOrphan Record Analysis:');
      const orphans = await ValidationService.findOrphanRecords();
      
      if (orphans.users.length > 0) {
        console.log(`   Users without valid roles: ${orphans.users.length}`);
        orphans.users.forEach(user => {
          console.log(`      - ${user.fullname} (${user.email}) - Role: ${user.role?.name || 'None'}`);
        });
      }

      if (orphans.patients.length > 0) {
        console.log(`   Patients without proper caregivers: ${orphans.patients.length}`);
        orphans.patients.forEach(patient => {
          console.log(`      - ${patient.fullname} (ID: ${patient._id})`);
        });
      }

      if (orphans.reports.length > 0) {
        console.log(`   Reports with invalid references: ${orphans.reports.length}`);
      }

      console.log('\nRecommendations:');
      console.log('   - Run: node seed-database.js to fix missing data');
      console.log('   - Run: node validate-integrity.js --cleanup to remove orphan records');
      console.log('   - Review and manually fix data integrity issues');

    } else {
      console.log('\nSUCCESS: Database integrity validation passed');
      console.log('All records have proper relationships and no orphan records found');
    }

    // Handle cleanup option
    const args = process.argv.slice(2);
    if (args.includes('--cleanup')) {
      console.log('\n=== Orphan Record Cleanup ===');
      
      if (args.includes('--dry-run') || !args.includes('--confirm')) {
        console.log('Running in DRY RUN mode (no changes will be made)');
        const cleanup = await ValidationService.cleanupOrphanRecords(true);
        console.log(`Would clean up:`);
        console.log(`   Users: ${cleanup.found.users}`);
        console.log(`   Patients: ${cleanup.found.patients}`);
        console.log(`   Reports: ${cleanup.found.reports}`);
        console.log('\nTo actually perform cleanup, use: --cleanup --confirm');
      } else {
        console.log('WARNING: This will permanently delete orphan records!');
        const cleanup = await ValidationService.cleanupOrphanRecords(false);
        console.log(`Cleaned up:`);
        console.log(`   Users: ${cleanup.cleaned.users}`);
        console.log(`   Patients: ${cleanup.cleaned.patients}`);
        console.log(`   Reports: ${cleanup.cleaned.reports}`);
      }
    }

  } catch (error) {
    console.error('Validation failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDatabase disconnected');
  }
}

// Show help
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`
Database Integrity Validation Tool

Usage: node validate-integrity.js [options]

Options:
  --cleanup         Find and clean up orphan records
  --dry-run         Show what would be cleaned up (default with --cleanup)
  --confirm         Actually perform cleanup (required with --cleanup)
  --help            Show this help message

Examples:
  node validate-integrity.js                    # Validate database integrity
  node validate-integrity.js --cleanup          # Dry run cleanup
  node validate-integrity.js --cleanup --confirm # Actually clean up orphans

WARNING: --cleanup --confirm will permanently delete orphan records!
`);
  process.exit(0);
}

main();