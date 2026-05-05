const express = require("express");
const serverless = require("serverless-http");
const mongoose = require("mongoose");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
const router = express.Router();

app.use(express.json({ limit: '50mb' })); 
app.use(cors());

// 1. DATABASE CONNECTION
const mongoURI = "mongodb+srv://mahesh_21:teI4gVKu0Vnzqy2y@cluster0.gnikcjh.mongodb.net/vbelievers?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(mongoURI);

// 2. SCHEMAS
const appSchema = new mongoose.Schema({
  regNo: String, name: String, fatherName: String, dob: String,
  qualification: String, circleDate: String, gender: String,
  branch: String, email: String, district: String, phone: String,
  bridge: String, status: String,
  isDeleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const Application = mongoose.model("Application", appSchema);

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true }
});
const User = mongoose.model("User", userSchema);

const logSchema = new mongoose.Schema({
    action: String, details: String, timestamp: { type: Date, default: Date.now }
});
const Log = mongoose.model("Log", logSchema);

// 3. EMAIL SETUP
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com", port: 465, secure: true,
  auth: { user: "pallemaheshreddy200@gmail.com", pass: "ybdt bvjm ykpg ocai" },
  tls: { rejectUnauthorized: false }
});

// 4. ROUTES (Note: uses router.post instead of app.post)
const MASTER_RECOVERY_KEY = "VB-2026-ADMIN";

router.post("/auth/register", async (req, res) => {
    try {
        const { username, password } = req.body;
        const newUser = new User({ username, password });
        await newUser.save();
        res.json({ message: "Account created!" });
    } catch (err) { res.status(400).json({ error: "User already exists" }); }
});

router.post("/auth/login", async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (user) res.json({ success: true });
    else res.status(401).json({ error: "Invalid login" });
});

router.get("/check-duplicate/:regNo", async (req, res) => {
    const app = await Application.findOne({ regNo: req.params.regNo, isDeleted: false });
    res.json({ exists: !!app, name: app ? app.name : null });
});

router.get("/applications", async (req, res) => {
    const apps = await Application.find({ isDeleted: req.query.bin === 'true' }).sort({ regNo: 1 });
    res.json(apps);
});

router.post("/applications", async (req, res) => {
    const { id, ...data } = req.body;
    if (id && mongoose.Types.ObjectId.isValid(id)) {
        await Application.findByIdAndUpdate(id, data);
        res.json({ message: "Updated" });
    } else {
        const newApp = new Application(data);
        await newApp.save();
        res.json({ message: "Saved" });
    }
});

router.delete("/applications/:id", async (req, res) => {
    await Application.findByIdAndUpdate(req.params.id, { isDeleted: true });
    res.json({ message: "Deleted" });
});

router.post("/send-mail", async (req, res) => {
  const { email, name, pdfData } = req.body;
  
  // Validate required fields
  if (!email || !name || !pdfData) {
    return res.status(400).json({ error: "Missing email, name, or pdfData" });
  }

  try {
    // Convert Base64 data URI to Buffer
    const base64Data = pdfData.replace(/^data:application\/pdf;base64,/, "");
    const pdfBuffer = Buffer.from(base64Data, "base64");

    await transporter.sendMail({
      from: '"V Believers HR" <pallemaheshreddy200@gmail.com>',
      to: email,
      subject: `Selection Letter - ${name}`,
      text: `Dear ${name},\n\nPlease find your Selection Letter attached.`,
      attachments: [
        {
          filename: `${name}_Selection_Letter.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf"
        }
      ]
    });

    await new Log({ action: "EMAIL_SENT", details: `Sent to ${name} (${email})` }).save();
    res.json({ message: "Email Sent Successfully" });
  } catch (err) { 
    console.error("Email error:", err);
    res.status(500).json({ error: "Mail failed: " + err.message }); 
  }
});

// Mandatory for Netlify
app.use("/.netlify/functions/api", router);
module.exports.handler = serverless(app);
