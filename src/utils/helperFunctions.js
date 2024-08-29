const cloudinary = require("../configs/cloudinaryConfig");
const jwt = require("jsonwebtoken");

// Helper function to upload files to Cloudinary
exports.uploadToCloudinary = (file, folder) => {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder: folder }, (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result.secure_url);
          }
        }
      )
      .end(file.buffer);
  });
};

exports.generateToken = (email) => {
  
    const token = jwt.sign({ email }, process.env.JWT_SECRET_KEY);
  
    return token;
};