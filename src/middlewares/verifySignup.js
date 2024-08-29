const verifySignUp = (req, res, next) => {
    const { name, email, password, contact } = req.body;
  
    if (!name)
      return res.status(400).json({ status: false, message: "Name is required" });
    if (!email)
      return res
        .status(400)
        .json({ status: false, message: "Email is required" });
    if (!password)
      return res
        .status(400)
        .json({ status: false, message: "Password is required" });
    
    next();
};

module.exports = {verifySignUp};