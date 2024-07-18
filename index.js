const express = require("express");
const port = process.env.PORT || 5000;
const cors = require("cors");
const jwt = require("jsonwebtoken");

const { MongoClient, ServerApiVersion } = require("mongodb");
const bcrypt = require("bcryptjs");
require("dotenv").config();
const app = express();
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());

const uri = `mongodb+srv://Financify:${process.env.MONGODB_PASS}@cluster0.nkzn5jr.mongodb.net/?appName=Cluster0`;
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
    console.log("no token");
    return res.status(401).send({ message: "Unauthorized access" });
  }
  next();
};
async function run() {
  try {
    const db = client.db("Financify");
    const acceptedUserCollection = db.collection("users");
    const transactionCollection = db.collection("transactions");
    const cashInRequestCollection = db.collection("cash-in-requests");
    const requestedUserCollection = db.collection("requested-users");

    // Registered visitor to be User or Agent
    app.post("/request-user", async (req, res) => {
      const requestedUser = req.body;
      const phone = req.body.phone;
      const accessToken = jwt.sign(
        requestedUser,
        process.env.ACCESS_TOKEN_SECRET,
        {
          expiresIn: "10d",
        }
      );
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
      const registeredUserExist = await requestedUserCollection.findOne({
        phone,
      });
      // console.log("from",registeredUser);
      const registeredUser = {
        email: registeredUserExist.email,
        phone: registeredUserExist.phone,
        role: registeredUserExist.appliedFor,
        currentRole: registeredUserExist.currentRole,
      };
      return res.send({
        success: true,
        message: "Request sent wait for approval",
        result,
        registeredUser,
        accessToken,
      });
    });
    // Get all Transactions (Admin only)
    app.get("/transactions", async (req, res) => {
      const result = await transactionCollection.find({}).toArray();
      res.send(result);
    });

    // Get transaction by phone number
    app.get("/transaction-history", async (req, res) => {
      const phone = req.query.phone;
      // console.log(phone);
      const result1 = await transactionCollection
        .find({ receiverNumber: phone })
        .toArray();
      const result2 = await transactionCollection
        .find({ senderNumber: phone })
        .toArray();
      // console.log("result from 120", result);
      const result = [...result1, ...result2];
      res.send(result);
    });
    // Send money
    app.patch("/send-money", async (req, res) => {
      const transferDetails = req.body;
      const { receiverNumber, senderNumber, amount } = req.body;
      // console.log("from line 110 transferDetails ", transferDetails);
      const SenderDetails = await acceptedUserCollection.findOne({
        phone: transferDetails.senderNumber,
      });
      // console.log("from line 114 sender", SenderDetails);
      if (SenderDetails) {
        // checking if sender typed correct pin
        const mathcedPassword = await bcrypt.compare(
          transferDetails.pin,
          SenderDetails.hashedPassword
        );
        // console.log("from line 121 pass", mathcedPassword);
        if (!mathcedPassword) {
          return res.send({ success: false, message: "Wrong pin" });
        }
        // checking if sender has enough balance
        else if (SenderDetails.accountBalance < transferDetails.amount) {
          // console.log("from line 127", SenderDetails.accountBalance);
          return res.send({ success: false, message: "Insufficient balance" });
        }
        // Checking if receiver is valid
        const ReceiverDetails = await acceptedUserCollection.findOne({
          phone: transferDetails.receiverNumber,
        });
        // console.log("from line 134 rec", ReceiverDetails);
        if (!ReceiverDetails) {
          return res.send({ success: false, message: "Receiver not found" });
        }
        const transferedDetails = await transactionCollection.insertOne({
          receiverNumber,
          senderNumber,
          transactionType: "Send Money",
          amount: parseInt(transferDetails.amount),
          date: new Date().toLocaleString("en-US"),
        });
        // console.log("reciver amount", typeof ReceiverDetails.accountBalance);
        const deductedBalanceOfSender =
          parseInt(SenderDetails.accountBalance) -
          parseInt(transferDetails.amount);

        const deductedBalanceOfReceiver =
          parseInt(ReceiverDetails.accountBalance) +
          parseInt(transferDetails.amount);
        // console.log(deductedBalanceOfReceiver, deductedBalanceOfSender);
        const deductedFromSender = await acceptedUserCollection.updateOne(
          { phone: transferDetails.senderNumber },
          {
            $set: {
              accountBalance: parseInt(deductedBalanceOfSender),
            },
          }
        );

        const addedToReceiver = await acceptedUserCollection.updateOne(
          { phone: transferDetails.receiverNumber },
          {
            $set: {
              accountBalance: parseInt(deductedBalanceOfReceiver),
            },
          }
        );

        res.send({ deductedFromSender, addedToReceiver, transferedDetails });
      }
    });

    // add Cash in request to database
    app.post("/cash-in", async (req, res) => {
      const cashInDetails = req.body;
      // console.log(typeof cashInDetails.requestedAmount);
      // Check if agent exists
      const agentExist = await acceptedUserCollection.findOne({
        phone: cashInDetails.agentNumber,
      });
      if (!agentExist) {
        return res.send({ success: false, message: "Agent not found" });
      }
      const result = await cashInRequestCollection.insertOne(cashInDetails);
      res.send({ success: true, result });
    });

    // Get all cash in/out requests
    app.get("/cash-in-requests-list", async (req, res) => {
      const result = await cashInRequestCollection.find({}).toArray();
      res.send(result);
    });

    // Accept Cashin request
    app.patch("/accept-cashin-request", async (req, res) => {
      const cashInDetails = req.body;
      const { phone, amount, agentNumber } = cashInDetails;
      // console.log(cashInDetails);
      const userDetails = await acceptedUserCollection.findOne({
        phone: cashInDetails.phone,
      });
      // Checking if agent has enough balance
      const agentExist = await acceptedUserCollection.findOne({
        phone: cashInDetails.agentNumber,
      });
      if (agentExist.accountBalance < cashInDetails.amount) {
        return res.send({ success: false, message: "Insufficient balance" });
      }
      // Add amount to user account
      const addedBalanceOfuser =
        parseInt(userDetails.accountBalance) + parseInt(cashInDetails.amount);
      const deductedBalanceOfAgent =
        parseInt(agentExist.accountBalance) - parseInt(cashInDetails.amount);
      const addedToUser = await acceptedUserCollection.updateOne(
        { phone: cashInDetails.phone },
        {
          $set: {
            accountBalance: parseInt(addedBalanceOfuser),
          },
        }
      );

      const deductedFromAgent = await acceptedUserCollection.updateOne(
        {
          phone: cashInDetails.agentNumber,
        },
        {
          $set: {
            accountBalance: parseInt(deductedBalanceOfAgent),
          },
        }
      );
      // Delete cash in request
      const deleted = await cashInRequestCollection.deleteOne({
        senderNumber: cashInDetails.phone,
      });
      // Add to transaction history
      const result = await transactionCollection.insertOne({
        receiverNumber: cashInDetails.phone,
        senderNumber: cashInDetails.agentNumber,
        amount: parseInt(cashInDetails.amount),
        transactionType: "Cash In",
        date: new Date().toLocaleString("en-US"),
      });
      res.send({ addedToUser, deductedFromAgent, deleted });
    });

    // Add cash-out requests to database
    app.post("/cash-out", async (req, res) => {
      const cashOutDetails = req.body;
      const senderDetails = await acceptedUserCollection.findOne({
        phone: cashOutDetails.senderNumber,
      });
      // Checking if sender typed invalid pin
      const mathcedPassword = await bcrypt.compare(
        cashOutDetails.pin,
        senderDetails.hashedPassword
      );
      if (!mathcedPassword) {
        return res.send({ success: false, message: "Wrong pin" });
      }

      // Check if agent exists
      const agentExist = await acceptedUserCollection.findOne({
        phone: cashOutDetails.agentNumber,
      });
      if (!agentExist) {
        return res.send({ success: false, message: "Agent not found" });
      }
      // CashoutDetails without pin
      delete cashOutDetails.pin;

      // Calculate total amount of both sender and agent balance
      const fee = parseInt(cashOutDetails.requestedAmount) * 0.015;
      const totalAmount = parseInt(cashOutDetails.requestedAmount) + fee;
      const deductedBalanceOfSender =
        senderDetails.accountBalance - totalAmount;
      const addedBalanceOfAgent = agentExist.accountBalance + fee;
      const deductedFromSender = await acceptedUserCollection.updateOne(
        {
          phone: cashOutDetails.senderNumber,
        },
        {
          $set: {
            accountBalance: parseInt(deductedBalanceOfSender),
          },
        }
      );

      const addedToAgent = await acceptedUserCollection.updateOne(
        {
          phone: cashOutDetails.agentNumber,
        },
        {
          $set: {
            accountBalance: parseInt(addedBalanceOfAgent),
          },
        }
      );
      // Add to transaction history
      const result2 = await transactionCollection.insertOne({
        receiverNumber: cashOutDetails.agentNumber,
        senderNumber: cashOutDetails.senderNumber,
        amount: parseInt(cashOutDetails.requestedAmount),
        transactionType: "Cash out",
        date: new Date().toLocaleString("en-US"),
      });
      res.send({
        success: true,

        message: "Cash out request sent. Wait for agent approval",
      });
    });

    // Accept Cashout request

    // Log in request
    app.post("/login-number-email", async (req, res) => {
      const user = req.body;
      // Checking the requested login user gave email or phone
      const text = user.phoneEmail;
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "10d",
      });
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
    app.get("/user-phone", async (req, res) => {
      const phone = req.query.phone;
      console.log("from line 414", phone);
      const user = await acceptedUserCollection.findOne({ phone: phone });
      res.send(user);
      console.log("from line 417", user);
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
      // console.log("route hitting");
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
   
  }
}
run().catch(console.dir);
app.listen(port, () => {
  console.log(`Financify app listening on port ${port}`);
});
