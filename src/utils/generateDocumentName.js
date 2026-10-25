const generateDocumentName = (patientName, documentType) => {
  const cleanName = patientName.replace(/[^a-zA-Z0-9]/g, '');

  const today = new Date();

  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();

  return `${cleanName}_${documentType}_${day}-${month}-${year}.pdf`;
};

module.exports = generateDocumentName;