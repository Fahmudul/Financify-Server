const express = require("express");
const port = 5000 || process.env.PORT;
const cors = require("cors");
const jwt = require("jsonwebtoken");

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

// const cookieOptions = {
//   httpOnly: true,
//   secure: process.env.NODE_ENV === "production" ? true : false,
//   sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
// };

// Middleware
const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log("token", authHeader);
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    console.log("decoded", decoded);
    console.log("verified");
    next();
  });
};
async function run() {
  try {
    const db = client.db("Financify");
    const acceptedUserCollection = db.collection("users");

    const requestedUserCollection = db.collection("requested-users");

    // Registered visitor to be User or Agent
    app.post("/request-user", async (req, res) => {
      const requestedUser = req.body;
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
      return res.send({
        success: true,
        message: "Request sent wait for approval",
        result,
      });
    });

    // Log in request
    app.post("/login-number-email", async (req, res) => {
      const user = req.body;
      // Checking the requested login user gave email or phone
      const text = user.phoneEmail;
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "10d",
      });
      // console.log(accessToken);
      // res.send({ accessToken });
      // Regular expression for detecting a phone number with exactly 11 digits
      const phoneRegex = /^\d{11}$/;
      let userRequestWithType;
      if (emailRegex.test(text)) {
        userRequestWithType = "Email";
      } else if (phoneRegex.test(text)) {
        userRequestWithType = "Phone";
      } else {
        return res.send({
          success: false,
          message: "Please enter a valid email or phone number",
        });
      }
      // Searching by email
      if (userRequestWithType === "Email") {
        const existUser = await acceptedUserCollection.findOne({
          email: user.phoneEmail,
        });

        if (existUser) {
          const mathcedPassword = await bcrypt.compare(
            user.password,
            existUser.hashedPassword
          );
          if (mathcedPassword) {
            return res.send({
              success: true,
              message: "Login success",
              user: {
                email: existUser.email,
                phone: existUser.phone,
                role: existUser.role,
              },
              accessToken,
            });
          } else {
            return res.send({ success: false, message: "Wrong password" });
          }
        }
      }

      // Searching by phone
      if (userRequestWithType === "Phone") {
        const existUser = await acceptedUserCollection.findOne({
          phone: user.phoneEmail,
        });
        if (existUser) {
          const mathcedPassword = await bcrypt.compare(
            user.password,
            existUser.hashedPassword
          );
          if (mathcedPassword) {
            return res.send({
              success: true,
              message: "Login success",
              user: {
                email: existUser.email,
                phone: existUser.phone,
                role: existUser.role,
              },
              accessToken,
            });
          } else {
            return res.send({ success: false, message: "Wrong password" });
          }
        }
      }
    });

    // Get one user
    app.get("/user-phone", verifyJWT, async (req, res) => {
      const phone = req.query.phone;
      const user = await acceptedUserCollection.findOne({ phone: phone });
      res.send(user);
    });

    // Get all  users

    app.get("/users", async (req, res) => {
      const users = await acceptedUserCollection.find({}).toArray();
      const requestedUser = await requestedUserCollection.find({}).toArray();

      res.send([...users, ...requestedUser]);
    });

    // Accept Visitor Request
    app.patch("/accept-visitor-request", async (req, res) => {
      // console.log("req.body", req.query);
      console.log("route hitting");
      const phone = req.query.phone;
      const action = req.query.action;
      if (action === "approved") {
        // Chekcing if the user already exist
        const user = await acceptedUserCollection.findOne({ phone: phone });

        if (user) {
          return res.send({
            success: false,
            message: "Already exist. Please login",
          });
        }
        const approvedUser = await requestedUserCollection.findOne({ phone });
        // console.log("got", approvedUser);
        if (approvedUser) {
          // Change Role
          let newUser = { ...approvedUser };
          newUser.role = newUser.appliedFor;
          delete newUser.appliedFor;
          // console.log("newUser", newUser);
          // Add bonus 40 to user account and 10000 for Agent
          if (newUser.role === "Agent") {
            newUser.accountBalance = 10000;
          } else {
            newUser.accountBalance = 40;
          }
          const result = await acceptedUserCollection.insertOne(newUser);
          const deleteFromRequest = await requestedUserCollection.deleteOne({
            phone,
          });
          return res.send({ success: true, result, deleteFromRequest });
        }
      } else {
        const result = await requestedUserCollection.deleteOne({ phone });
        return res.send(result);
      }
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
