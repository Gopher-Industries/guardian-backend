const { DataTypes } = require("sequelize");
const sequelize = require("../configs/dbConfig");

const user = sequelize.define("user", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    email: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    otp: {
        type: DataTypes.INTEGER,
      },
    
    otpExpiry: {
        type: DataTypes.DATE,
      },
    
    otpRetries: {
        type: DataTypes.INTEGER,
      },
    
    otpDisabledTime: {
        type: DataTypes.DATE,
      },
});

module.exports = user;