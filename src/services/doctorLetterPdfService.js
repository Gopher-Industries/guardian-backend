const PDFDocument = require('pdfkit');

const generateDoctorLetterPdf = (data) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50
      });

      const chunks = [];

      doc.on('data', (chunk) => {
        chunks.push(chunk);
      });

      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      doc.on('error', reject);

      const {
        doctorName,
        patientName,
        date,
        subject,
        letterContent
      } = data;

      doc
        .fontSize(20)
        .text('Guardian Monitor', {
          align: 'center'
        });

      doc.moveDown();

      doc
        .fontSize(16)
        .text("Doctor's Letter", {
          align: 'center'
        });

      doc.moveDown(2);

      doc.fontSize(11);

      doc.text(`Date: ${date}`);
      doc.text(`Doctor: ${doctorName}`);
      doc.text(`Patient: ${patientName}`);

      if (subject) {
        doc.text(`Subject: ${subject}`);
      }

      doc.moveDown(2);

      doc.text('To whom it may concern,');

      doc.moveDown();

      doc.text(letterContent);

      doc.moveDown(2);

      doc.text('Regards,');
      doc.text(doctorName);

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
};

module.exports = {
  generateDoctorLetterPdf
};