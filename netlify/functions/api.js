const express = require("express");
const serverless = require("serverless-http");
const mongoose = require("mongoose");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
const router = express.Router();

app.use(express.json({ limit: "50mb" }));
app.use(cors());

/* ================= DATABASE ================= */
const mongoURI = "mongodb+srv://mahesh_21:teI4gVKu0Vnzqy2y@cluster0.gnikcjh.mongodb.net/vbelievers?retryWrites=true&w=majority&appName=Cluster0";

const connectToDatabase = async () => {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 });
};

/* ================= SCHEMAS ================= */
const appSchema = new mongoose.Schema({
  regNo: String, name: String, fatherName: String, dob: String,
  qualification: String, circleDate: String, gender: String,
  branch: String, email: String, district: String, phone: String,
  bridge: String, status: String,
  isDeleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
const Application = mongoose.models.Application || mongoose.model("Application", appSchema);

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String
});
const User = mongoose.models.User || mongoose.model("User", userSchema);

const logSchema = new mongoose.Schema({
  action: String, details: String, timestamp: { type: Date, default: Date.now }
});
const Log = mongoose.models.Log || mongoose.model("Log", logSchema);

/* ================= MAIL ================= */
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "vbmarketingpvt.ltd@gmail.com",
    pass: "fhrg yvvp rvfo gybp"
  }
});

/* ================= AUTH ================= */
router.post("/auth/register", async (req, res) => {
  try {
    await User.create(req.body);
    res.json({ message: "Account created" });
  } catch {
    res.status(400).json({ error: "User already exists" });
  }
});

router.post("/auth/login", async (req, res) => {
  const user = await User.findOne(req.body);
  user ? res.json({ success: true }) : res.status(401).json({ error: "Invalid login" });
});

/* ================= APPLICATION ROUTES ================= */

// Duplicate check
router.get("/check-duplicate/:regNo", async (req, res) => {
  const existing = await Application.findOne({ regNo: req.params.regNo, isDeleted: false });
  res.json({ exists: !!existing, name: existing ? existing.name : null });
});

// Get applications (active or bin)
router.get("/applications", async (req, res) => {
  const isBin = req.query.bin === "true";
  const apps = await Application.find({ isDeleted: isBin }).sort({ regNo: 1 });
  res.json(apps);
});

// Save or update application
router.post("/applications", async (req, res) => {
  const { id, ...data } = req.body;

  if (id && mongoose.Types.ObjectId.isValid(id)) {
    await Application.findByIdAndUpdate(id, data);
    res.json({ message: "Updated" });
  } else {
    await Application.create(data);
    res.json({ message: "Saved" });
  }
});

// Move to bin
router.delete("/applications/:id", async (req, res) => {
  await Application.findByIdAndUpdate(req.params.id, { isDeleted: true });
  res.json({ message: "Deleted" });
});

// Restore from bin
router.post("/applications/restore/:id", async (req, res) => {
  await Application.findByIdAndUpdate(req.params.id, { isDeleted: false });
  res.json({ message: "Restored" });
});

/* ================= EMAIL WITH PDF ================= */
router.post("/send-mail", async (req, res) => {
  try {
    const { email, name, pdfData } = req.body;

    if (!email || !pdfData) {
      return res.status(400).json({ error: "Missing email or PDF data" });
    }

    // pdfData comes as a base64 data URI: "data:application/pdf;base64,XXXX..."
    // We must strip the prefix and decode it into a Buffer
    const base64String = pdfData.includes("base64,")
      ? pdfData.split("base64,")[1]
      : pdfData;

    const pdfBuffer = Buffer.from(base64String, "base64");

    await transporter.sendMail({
      from: '"V Believers HR" <vbmarketingpvt.ltd@gmail.com>',
      to: email,
      subject: `Selection Letter - ${name}`,
      text: `Dear ${name},

Congratulations!

Respected Sir/Madam,

We are pleased to inform you that you have been selected at V Believers Marketing Private Limited.

Please find attached the detailed Selection Letter in PDF format, which includes all terms and conditions of your appointment along with other important information.

You are requested to carefully read the attached document and confirm your acceptance by replying to this email.

We welcome you to the V Believers family and look forward to a long and successful professional association.


Warm Regards,
HR Department
V Believers Marketing Pvt Ltd.`,
      attachments: [
        {
          filename: `${name}_Selection_Letter.pdf`,
          content: pdfBuffer,        // ✅ Buffer, not path or raw base64 string
          contentType: "application/pdf"
        }
      ]
    });

    await Log.create({ action: "EMAIL_SENT", details: email });

    res.json({ message: "Email sent successfully" });

  } catch (err) {
    console.error("MAIL ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= EXPORT ================= */
app.use("/api", router);

module.exports.handler = async (event, context) => {
  await connectToDatabase();
  return serverless(app)(event, context);
};
