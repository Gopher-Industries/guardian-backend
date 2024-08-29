const express = require("express");
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const {verifySignUp} = require("../middlewares/verifySignup");
const {verifySignIn} = require("../middlewares/verifySignin");
const authenticateToken = require("../middlewares/authenticateToken");

const userController = require("../controllers/userController");

const router = express.Router();

router.post("/create", upload.none(), verifySignUp, userController.signUp);
router.post("/signin", upload.none(), verifySignIn, userController.signIn);

module.exports = router;
