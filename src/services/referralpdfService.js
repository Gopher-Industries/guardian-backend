const PDFDocument = require('pdfkit');

const {
  renderReferralTemplate
} = require('../templates/referralTemplate');


function createBadRequest(message) {
  const error = new Error(message);

  error.statusCode = 400;

  return error;
}


function validateReferralData(data) {

  if (!data || typeof data !== 'object') {
    throw createBadRequest(
      'Referral data is required.'
    );
  }


  const requiredFields = [

    [
      'referralDate',
      data.referralDate
    ],

    [
      'specialist.name',
      data.specialist?.name
    ],

    [
      'specialist.department',
      data.specialist?.department
    ],

    [
      'specialist.hospital',
      data.specialist?.hospital
    ],

    [
      'specialist.addressLine1',
      data.specialist?.addressLine1
    ],

    [
      'patient.name',
      data.patient?.name
    ],

    [
      'patient.dateOfBirth',
      data.patient?.dateOfBirth
    ],

    [
      'patient.phone',
      data.patient?.phone
    ],

    [
      'patient.email',
      data.patient?.email
    ],

    [
      'clinicalDetails.presentingComplaint',
      data.clinicalDetails?.presentingComplaint
    ],

    [
      'clinicalDetails.duration',
      data.clinicalDetails?.duration
    ],

    [
      'clinicalDetails.relevantFindings',
      data.clinicalDetails?.relevantFindings
    ],

    [
      'clinicalDetails.pastMedicalHistory',
      data.clinicalDetails?.pastMedicalHistory
    ],

    [
      'clinicalDetails.currentMedications',
      data.clinicalDetails?.currentMedications
    ],

    [
      'investigations.recentTests',
      data.investigations?.recentTests
    ],

    [
      'investigations.results',
      data.investigations?.results
    ],

    [
      'reasonForReferral',
      data.reasonForReferral
    ],

    [
      'referringDoctor.name',
      data.referringDoctor?.name
    ],

    [
      'referringDoctor.title',
      data.referringDoctor?.title
    ],

    [
      'referringDoctor.phone',
      data.referringDoctor?.phone
    ],

    [
      'referringDoctor.clinic',
      data.referringDoctor?.clinic
    ]

  ];


  const missingFields = requiredFields
    .filter(
      ([, value]) =>
        value === undefined ||
        value === null ||
        String(value).trim() === ''
    )
    .map(([field]) => field);


  if (missingFields.length > 0) {

    throw createBadRequest(
      `Missing required referral field(s): ${missingFields.join(', ')}`
    );

  }
}


function generateReferralPdf(data) {

  validateReferralData(data);


  return new Promise((resolve, reject) => {

    try {

      const doc = new PDFDocument({

        size: 'A4',

        margins: {
          top: 50,
          bottom: 50,
          left: 55,
          right: 55
        },

        info: {
          Title: `Referral - ${data.patient.name}`,
          Author: data.referringDoctor.name,
          Subject: 'Medical Referral'
        }

      });


      const chunks = [];


      doc.on(
        'data',
        chunk => chunks.push(chunk)
      );


      doc.on(
        'end',
        () => {
          resolve(
            Buffer.concat(chunks)
          );
        }
      );


      doc.on(
        'error',
        reject
      );


      renderReferralTemplate(
        doc,
        data
      );


      doc.end();

    } catch (error) {

      reject(error);

    }

  });

}


module.exports = {

  generateReferralPdf,

  validateReferralData

};