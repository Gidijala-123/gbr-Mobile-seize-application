const express = require("express");
const router = express.Router();
const randomstring = require("randomstring");
const nodemailer = require("nodemailer");
const Cryptr = require("cryptr");
const { MongoClient } = require("mongodb");
const crypto = require("crypto");
const { promisify } = require("util");
const cryptr = new Cryptr("myTotalySecretKey");
const scrypt = promisify(crypto.scrypt);
const pbkdf2 = promisify(crypto.pbkdf2);
const PASSWORD_HASH_ITERATIONS = 60000;

function sanitizeMongoUri(rawUri) {
  if (typeof rawUri !== "string") return rawUri;
  try {
    const url = new URL(rawUri);
    if (url.searchParams.has("appName")) url.searchParams.delete("appName");
    return url.toString();
  } catch (err) {
    return rawUri;
  }
}

function createCollectionAdapter(collection) {
  return {
    async insert(doc) {
      const result = await collection.insertOne(doc);
      return { ...doc, _id: result.insertedId };
    },
    async findOne(filter) {
      return collection.findOne(filter);
    },
    async find(filter) {
      return collection.find(filter || {}).toArray();
    },
    async update(filter, updateDoc) {
      return collection.updateOne(filter, updateDoc);
    },
    async createIndex(spec, options = {}) {
      return collection.createIndex(spec, options);
    },
    async remove(filter) {
      return collection.deleteMany(filter);
    },
  };
}

let mongoClient;
let signlogColl;
let visitorsOfPage;
let errorReports;
let studentData;
let mongoReady = null;
let mongoInitError = null;

async function initializeMongo() {
  const mongoUri = sanitizeMongoUri(process.env.MONGODB_URI);
  if (!mongoUri) {
    throw new Error("MONGODB_URI must be configured before starting the application");
  }

  mongoClient = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  await mongoClient.connect();
  console.log("MongoDB Atlas is connected..!");

  const dbName = new URL(mongoUri).pathname.replace(/^\/+/, "") || "admin";
  const db = mongoClient.db(dbName);

  signlogColl = createCollectionAdapter(db.collection("registration_coll"));
  visitorsOfPage = createCollectionAdapter(db.collection("visitors_of_page"));
  errorReports = createCollectionAdapter(db.collection("error_reports"));
  studentData = createCollectionAdapter(db.collection("student_data"));

  await Promise.all([
    signlogColl.createIndex({ email: 1 }, { unique: true }),
    studentData.createIndex({ rno: 1 }),
    studentData.createIndex({ status: 1 }),
  ]);
}

mongoReady = initializeMongo().catch((err) => {
  mongoInitError = err;
  console.error("MongoDB Atlas connection failed! Please check your internet connection.", err);
  console.error("MongoDB index setup failed:", err.message);
  return false;
});

async function ensureDbReady() {
  if (mongoInitError) throw mongoInitError;
  if (!mongoReady) {
    throw new Error("MongoDB is not initialized yet.");
  }
  await mongoReady;
  if (!signlogColl || !studentData || !errorReports || !visitorsOfPage) {
    throw new Error("MongoDB collections are not ready.");
  }
}

const normalizeEnvValue = (value, fallback = "") => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.replace(/\s+/g, "") : fallback;
};

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const isEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPassword = (password) => typeof password === "string" && password.length >= 10 && password.length <= 128;
const hasSessionUser = (req) => Boolean(req && req.session && req.session.user);

function normalizeStudentRecord(body, status = null) {
  return {
    Date: body.Date,
    Time: body.Time,
    sname: body.sname,
    spno: body.spno,
    rno: body.rno,
    clg: body.clg,
    brch: body.brch,
    year: body.year,
    sec: body.sec,
    pname: body.pname,
    ppno: body.ppno,
    ename: body.ename,
    epno: body.epno,
    eid: body.eid,
    rsn: body.rsn,
    mmodel: body.mmodel,
    imei: body.imei,
    mclr: body.mclr,
    ...(status ? { status } : {}),
  };
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await pbkdf2(password, salt, PASSWORD_HASH_ITERATIONS, 64, "sha512");
  return `pbkdf2$${PASSWORD_HASH_ITERATIONS}$${salt}$${derivedKey.toString("hex")}`;
}

async function verifyPassword(password, storedPassword) {
  if (typeof storedPassword !== "string") return false;

  if (storedPassword.startsWith("pbkdf2$")) {
    const [, iterations, salt, expected] = storedPassword.split("$");
    const actual = await pbkdf2(password, salt, Number(iterations), 64, "sha512");
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), actual);
  }

  if (storedPassword.startsWith("scrypt$")) {
    const [, salt, expected] = storedPassword.split("$");
    const actual = await scrypt(password, salt, 64, { N: 1024, r: 8, p: 1 });
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), actual);
  }

  try {
    return cryptr.decrypt(storedPassword) === password;
  } catch (err) {
    return false;
  }
}

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Authentication required" });
  next();
}

async function recordError(type, email, err) {
  if (!errorReports) return;
  try {
    await errorReports.insert({ type, email, message: err.message, time: new Date() });
  } catch (logError) {
    console.error("Unable to record application error:", logError.message);
  }
}

// Routes
router.get("/", (req, res) => {
  res.render("signLog_net");
});

router.get("/forgot", (req, res) => {
  res.render("forgot");
});

router.post("/postsignup", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = req.body.pwd;
  if (!isEmail(email) || !isValidPassword(password)) {
    return res.status(400).send("Enter a valid email and a password of at least 10 characters.");
  }
  try {
    await ensureDbReady();
    const doc = await signlogColl.insert({
      email,
      pwd: await hashPassword(password),
      createdAt: new Date(),
    });
    res.status(201).json({ id: doc._id, email: doc.email });
  } catch (err) {
    await recordError("signup", email, err);
    if (err.code === 11000 || /duplicate/i.test(err.message)) return res.status(409).send("An account with that email already exists.");
    res.status(500).send("Unable to create the account right now.");
  }
});

router.post("/postlogin", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = req.body.pwd;
  if (!isEmail(email) || typeof password !== "string") return res.status(400).send("Enter your email and password.");
  try {
    await ensureDbReady();
    const data = await signlogColl.findOne({ email });
    if (!data || !(await verifyPassword(password, data.pwd))) throw new Error("Invalid credentials");
    if (!data.pwd.startsWith("pbkdf2$")) await signlogColl.update({ _id: data._id }, { $set: { pwd: await hashPassword(password) } });
    await new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
    req.session.user = { id: data._id, email: data.email };
    await visitorsOfPage.insert({ name: req.body.uname, email, time: new Date() });
    res.sendStatus(204);
  } catch (err) {
    await recordError("login", email, err);
    res.status(401).send("Invalid login credentials.");
  }
});

router.post("/postforgot", async (req, res) => {
  const otpEmail = normalizeEmail(req.body.email);
  if (!isEmail(otpEmail)) return res.status(400).send("Enter a valid email address.");
  try {
    await ensureDbReady();
    const newpassword = randomstring.generate(7);

    const user = await signlogColl.findOne({ email: otpEmail });
    if (!user) {
      throw new Error(`Email ${otpEmail} not found`);
    }

    const gmailUser = normalizeEnvValue(process.env.GMAIL_USER);
    const gmailPass = normalizeEnvValue(process.env.GMAIL_PASS);

    if (!gmailUser || !gmailPass) throw new Error("Mail service is not configured");
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: gmailUser, pass: gmailPass } });

    let mailOptions = {
      from: gmailUser,
      to: otpEmail,
      subject: "OTP",
      html: `<div style="max-width: 90%; margin: auto; padding-top: 20px">
               <h2><b>Verification code</b></h2>
               <p>Please use the verification code below to sign in. ✔</p>
               <h2 style="background: #00466a; margin: 0 auto; width: max-content; padding: 0 10px; color: #fff; border-radius: 4px;">${newpassword}</h2>
               <p style="font-size: 0.9em;">Regards,<br />Your Brand</p>
               <hr style="border: none; border-top: 1px solid #eee" />
               <div style="float: right; padding: 8px 0; color: #aaa; font-size: 0.8em; line-height: 1; font-weight: 300">
                 <p>Your Brand Inc</p>
                 <p>Bhargava Gidijala</p>
                 <p>+91 9493818156</p>
               </div>
             </div>`,
    };

    await transporter.sendMail(mailOptions);
    await signlogColl.update({ email: otpEmail }, { $set: { pwd: await hashPassword(newpassword) } });
    res.sendStatus(204);
  } catch (err) {
    await recordError("password-reset", otpEmail, err);
    res.status(500).send("Unable to send the reset email. Please try again later.");
  }
});

router.get("/home", async (req, res) => {
  if (!hasSessionUser(req)) return res.redirect("/");

  res.locals.email = req.session.user.email;
  try {
    await ensureDbReady();
    const data = await studentData.find({});
    const data1 = data.filter((record) => record.status === "At_office");
    const data2 = data.filter((record) => record.status === "Returned");
    const data3 = data;
    res.render("home", {
      data,
      data1,
      data2,
      data3,
      count: data.length,
      count1: data1.length,
      count2: data2.length,
    });
  } catch (err) {
    console.error("Home page error:", err);
    req.session.destroy();
    res.status(500).send("An error occurred while loading the home page.");
  }
});

router.post("/hh", async (req, res) => {
  if (!hasSessionUser(req)) return res.redirect("/");
  try {
    await ensureDbReady();
    const data = normalizeStudentRecord(req.body, "At_office");
    const dbResponse = await studentData.insert(data);
    console.log(dbResponse);
    res.redirect("/home");
  } catch (err) {
    console.error("Insert data error:", err);
    req.session.destroy();
    res.status(500).send("An error occurred while inserting the data.");
  }
});

router.post("/change", async (req, res) => {
  if (!hasSessionUser(req)) return res.status(401).send("Authentication required.");
  try {
    await ensureDbReady();
    const docs = await studentData.update(
      { rno: req.body.rno },
      { $set: { status: "Returned" } }
    );
    console.log(docs);
    res.redirect("/home");
  } catch (err) {
    console.error("Change status error:", err);
    res.status(500).send("An error occurred while updating the status.");
  }
});

router.post("/edit", async (req, res) => {
  if (!hasSessionUser(req)) return res.status(401).send("Authentication required.");
  try {
    await ensureDbReady();
    const dbResponse = await studentData.find({ rno: req.body.rno });
    console.log(dbResponse);
    res.send(dbResponse);
  } catch (err) {
    console.error("Edit data error:", err);
    res.status(500).send("An error occurred while fetching the data.");
  }
});

router.post("/update", async (req, res) => {
  if (!hasSessionUser(req)) return res.redirect("/");
  try {
    await ensureDbReady();
    const data = normalizeStudentRecord(req.body);
    const dbResponse = await studentData.update(
      { rno: req.body.rno },
      { $set: data }
    );
    console.log(dbResponse);
    res.redirect("/home");
  } catch (err) {
    console.error("Update data error:", err);
    res.status(500).send("An error occurred while updating the data.");
  }
});

router.post("/delete", async (req, res) => {
  if (!hasSessionUser(req)) return res.status(401).json({ error: "Authentication required" });
  try {
    await ensureDbReady();
    const rno = req.body.rno;
    if (!rno) return res.status(400).json({ error: "Roll number is required" });
    const result = await studentData.remove({ rno });
    res.json({ success: true, deleted: result.deletedCount || 1, rno });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Failed to delete record" });
  }
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

module.exports = router;
