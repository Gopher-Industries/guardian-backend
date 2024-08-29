const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

const sequelize = require("./configs/dbConfig");

const app = express();
const server = http.createServer(app); // Ensure server is created before Socket.IO


// ALL ROUTES
const userRoutes = require("./routes/userRoutes");
const otpRoutes = require("./routes/otpRoutes");

// APP SETUP
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use("/api/v2/user", userRoutes);
app.use("/api/v2/otp", otpRoutes);


// Sequelize Connection with DB
sequelize
  .sync({force: false})
  .then(() => {
    console.log("Database synchronized successfully");
  })
  .catch((err) => {
    console.error("Unable to connect to the database:", err);
  });


server.listen(port, () => console.log(`Server running on port ${port}`));

