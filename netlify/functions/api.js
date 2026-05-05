const express = require("express");
const serverless = require("serverless-http");
const mongoose = require("mongoose");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
const router = express.Router();

// Netlify has a ~6MB body limit — keep this reasonable
app.use(express.json({ limit: "6mb" }));
app.use(cors());

/* ================= DATABASE ================= */
const mongoURI = "mongodb+srv://mahesh_21:teI4gVKu0Vnzqy2y@cluster0.gnikcjh.mongodb.net/vbelievers?retryWrites=true&w=majority&appName=Cluster0";

const connectToDatabase = async () => {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 8000 });
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

/* ================= AUTH ================= */
router.post("/auth/register", async (req, res) => {
  try {
    await User.create(req.body);
    res.json({ message: "Account created" });
  } catch (err) {
    console.error("REGISTER ERROR:", err.message);
    res.status(400).json({ error: "User already exists" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const user = await User.findOne(req.body);
    user ? res.json({ success: true }) : res.status(401).json({ error: "Invalid login" });
  } catch (err) {
    console.error("LOGIN ERROR:", err.message);
    res.status(500).json({ error: "Server error during login" });
  }
});

/* ================= APPLICATION ROUTES ================= */
router.get("/check-duplicate/:regNo", async (req, res) => {
  try {
    const existing = await Application.findOne({ regNo: req.params.regNo, isDeleted: false });
    res.json({ exists: !!existing, name: existing ? existing.name : null });
  } catch (err) {
    console.error("DUPLICATE CHECK ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/applications", async (req, res) => {
  try {
    const isBin = req.query.bin === "true";
    const apps = await Application.find({ isDeleted: isBin }).sort({ regNo: 1 });
    res.json(apps);
  } catch (err) {
    console.error("GET APPS ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/applications", async (req, res) => {
  try {
    const { id, ...data } = req.body;
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      await Application.findByIdAndUpdate(id, data);
      res.json({ message: "Updated" });
    } else {
      await Application.create(data);
      res.json({ message: "Saved" });
    }
  } catch (err) {
    console.error("SAVE APP ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/applications/:id", async (req, res) => {
  try {
    await Application.findByIdAndUpdate(req.params.id, { isDeleted: true });
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("DELETE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/applications/restore/:id", async (req, res) => {
  try {
    await Application.findByIdAndUpdate(req.params.id, { isDeleted: false });
    res.json({ message: "Restored" });
  } catch (err) {
    console.error("RESTORE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ================= EMAIL WITH PDF ================= */
router.post("/send-mail", async (req, res) => {
  try {
    const { email, name, pdfData } = req.body;

    console.log("SEND-MAIL called | to:", email, "| name:", name);
    console.log("pdfData received:", pdfData ? `${pdfData.length} chars` : "MISSING");

    if (!email || !name || !pdfData) {
      return res.status(400).json({ error: "Missing email, name, or PDF data" });
    }

    // Strip the data URI prefix: "data:application/pdf;base64,XXXX"
    const base64String = pdfData.includes("base64,")
      ? pdfData.split("base64,")[1]
      : pdfData;

    // Guard against Netlify's 6MB body limit
    const estimatedBytes = Math.ceil(base64String.length * 0.75);
    console.log("Estimated PDF size:", Math.round(estimatedBytes / 1024), "KB");

    if (estimatedBytes > 4 * 1024 * 1024) {
      return res.status(400).json({
        error: "PDF too large (max ~4MB). Reduce canvas scale in selection.html from 2 to 1."
      });
    }

    const pdfBuffer = Buffer.from(base64String, "base64");

    // Create transporter fresh each invocation (required for serverless)
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: "vbmarketingpvt.ltd@gmail.com",
        // Must be a Gmail App Password (16 chars, no spaces).
        // Generate at: https://myaccount.google.com/apppasswords
        pass: "fhrg yvvp rvfo gybp"
      }
    });

    // Verify SMTP before sending so we get a clear error if auth fails
    await transporter.verify();
    console.log("SMTP verified ✅");

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
          content: pdfBuffer,          // ✅ Buffer — correct for base64 input
          contentType: "application/pdf"
        }
      ]
    });

    console.log("Email sent to:", email);

    // Log — non-fatal if it fails
    try {
      await Log.create({ action: "EMAIL_SENT", details: email });
    } catch (logErr) {
      console.warn("Log write failed (non-fatal):", logErr.message);
    }

    res.json({ message: "Email sent successfully" });

  } catch (err) {
    console.error("SEND-MAIL ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ================= EXPORT ================= */
app.use("/api", router);

module.exports.handler = async (event, context) => {
  // Prevents Lambda/Netlify from waiting for the event loop to drain
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    await connectToDatabase();
  } catch (dbErr) {
    console.error("DB CONNECTION FAILED:", dbErr.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Database connection failed: " + dbErr.message })
    };
  }

  return serverless(app)(event, context);
};
