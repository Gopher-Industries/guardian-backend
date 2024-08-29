const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1]; // Extract the token part
  
    if (token == null) {
      return res
        .status(401)
        .json({ status: false, message: "No token provided" });
    }
  
    jwt.verify(token, process.env.JWT_SECRET_KEY, (err, data) => {
      if (err) {
        return res.status(403).json({ status: false, message: "Invalid token" });
      }
      
      req.userEmail = data.email;
      next();
    });
};

module.exports = authenticateToken;