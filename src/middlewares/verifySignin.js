const verifySignIn = (req, res, next) => {
    const { email, password } = req.body;

    if (!email) return res.status(400).json({ status: false, message: "Email is required" });
    
    if (!password) return res.status(400).json({ status: false, message: "Password is required" });

    next();
};
  
module.exports = {verifySignIn};