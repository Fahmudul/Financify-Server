const express = require("express");
const port = 5000 || process.env.PORT;
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const bcrypt = require("bcryptjs");
require("dotenv").config();
const app = express();
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://Financify:${process.env.MONGODB_PASS}@cluster0.nkzn5jr.mongodb.net/?appName=Cluster0`;
app.get("/", (req, res) => {
  res.send("Hello World!dd");
});
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    const db = client.db("Financify");
    const acceptedUserCollection = db.collection("users");

    const requestedUserCollection = db.collection("requested-users");

    // Request User
    app.post("/request-user", async (req, res) => {
      const requestedUser = req.body;
      // console.log(requestedUser);
      // Checking is this user already requested
      const alreadyRequested = await requestedUserCollection.findOne({
        email: requestedUser.email,
        phone: requestedUser.phone,
      });
      if (alreadyRequested) {
        return res.send({ success: false, message: "Already requested" });
      }
      // Checking if the user already exist in accepted users

      const alreadyExist = await acceptedUserCollection.findOne({
        email: requestedUser.email,
        phone: requestedUser.phone,
      });
      if (alreadyExist) {
        return res.send({
          success: false,
          message: "Already exist. Please login",
        });
      }
      const result = await requestedUserCollection.insertOne(requestedUser);
      return res.send({ success: true, message: "Request sent" });
    });

    // Log in request
    app.post("/login-number-email", async (req, res) => {
      const user = req.body;
      console.log(user);
      // Checking the requested login user gave email or phone
      const text = user.phoneEmail;
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

      // Regular expression for detecting a phone number with exactly 11 digits
      const phoneRegex = /^\d{11}$/;
      let userRequestWithType;
      if (emailRegex.test(text)) {
        userRequestWithType = "Email";
        console.log(userRequestWithType);
      } else if (phoneRegex.test(text)) {
        userRequestWithType = "Phone";
        console.log(userRequestWithType);
      } else {
        console.log("Please enter a valid email or phone number");
        return res.send({
          success: false,
          message: "Please enter a valid email or phone number",
        });
      }
      // Searching by email
      if (userRequestWithType === "Email") {
        console.log("Searching by email");
        const existUser = await acceptedUserCollection.findOne({
          email: user.phoneEmail,
        });
        console.log(existUser);

        if (existUser) {
          const mathcedPassword = await bcrypt.compare(
            user.password,
            existUser.hashedPassword
          );
          if (mathcedPassword) {
            console.log("password mathced");

            return res.send({
              success: true,
              message: "Login success",
              user: { email: existUser.email, phone: existUser.phone },
            });
          } else {
            console.log("password not mathced");

            return res.send({ success: false, message: "Wrong password" });
          }
        }
      }

      // Searching by phone
      if (userRequestWithType === "Phone") {
        console.log("Searching by phone");
        const existUser = await acceptedUserCollection.findOne({
          phone: user.phoneEmail,
        });
        console.log(existUser);
        if (existUser) {
          const mathcedPassword = await bcrypt.compare(
            user.password,
            existUser.hashedPassword
          );
          if (mathcedPassword) {
            console.log("password mathced");
            return res.send({
              success: true,
              message: "Login success",
              user: { email: existUser.email, phone: existUser.phone },
            });
          } else {
            console.log("password not mathced");

            return res.send({ success: false, message: "Wrong password" });
          }
        }
      }
    });

    // Get one user
    app.get("/user-phone", async (req, res) => {
      const phone = req.query.phone;
      console.log(phone);
      const user = await acceptedUserCollection.findOne({ phone: phone });
      console.log(user);
      res.send(user);
    });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
app.listen(port, () => {
  console.log(`Financify app listening on port ${port}`);
});
