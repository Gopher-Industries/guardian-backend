const user = require('../models/user');

const bcrypt = require('bcrypt');

const helpers = require('../utils/helperFunctions');

exports.signUp = async ({ name, email, password, contact }) => {
    
    const existingUser = await user.findOne({ where: { email } });
    if (existingUser) return {message: "User with this email already exists"};
    
  
    const hashedPassword = await bcrypt.hash(password, 10);
  
    const newUser = await user.create({
      name,
      email,
      password: hashedPassword,
      contact,
    });
  
    return { user: newUser };
};

exports.signIn = async ({ email, password }) => {
  
  const userExists = await user.findOne({ where: { email } });
 
  if (!userExists) return {message: "User does not exist"}

  const isPasswordValid = await bcrypt.compare(password, userExists.password);
  
  if (!isPasswordValid) return {message: "Invalid Email or Password"};
  
  const token = helpers.generateToken(userExists.email);

  return { user: userExists, token };
};
