const userService = require('../services/userService');

exports.signUp = async (req, res) => {
    const { name, email, password, contact } = req.body;
  
    try {
      const userCreate = await userService.signUp({name,email,password,contact});
      
      if(userCreate?.message === "User with this email already exists") return res.status(409).json({status: false, message: userCreate.message});

      return res.status(201).json({message: "User created successfully", status: true,
        user: {
          id: userCreate.user.id,
          name: userCreate.user.name,
          email: userCreate.user.email,
          contact: userCreate.user.contact,
        },
      });
    } catch (error) {
      res.status(500).json({ status: false, message: error.message });
    }
};

exports.signIn = async (req, res) => {
  const { email, password } = req.body;

  try {
    const userSignIn = await userService.signIn({ email, password });

    if(userSignIn?.message === "User does not exist") return res.status(404).json({status: false, message: userSignIn.message});
    if(userSignIn?.message === "Invalid Email or Password") return res.status(401).json({status: false, message: userSignIn.message});

    res.status(200).json({
      message: "Login successful",
      status: true,
      user: {
        id: userSignIn.user.id,
        name: userSignIn.user.name,
        email: userSignIn.user.email,
        contact: userSignIn.user.contact,
      },
      token: userSignIn.token,
    });

  } catch (error) {
    res.status(500).json({ message: error.message, status: false });
  }
};