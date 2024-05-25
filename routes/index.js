var express = require("express");
var router = express.Router();
var randomstring = require("randomstring");
var nodemailer = require("nodemailer");
var Cryptr = require("cryptr");
var cryptr = new Cryptr("myTotalySecretKey");
var monk = require("monk"); //its a middleware for express and mongodb
const db = monk(
  "mongodb+srv://user_gbr:user_password@gbrclustername.qzdpvo9.mongodb.net/mobile_seize_db",
  function (err, connected) {
    if (err) {
      console.log(
        "MongoDB AtlasConnection failed!\nPlease check your internet connection\n"
      );
    } else {
      console.log("MongoDB Atlas is connected..!\n");
    }
  }
);

// var db = monk('localhost:27017/Mob_db');
var signlog_coll = db.get("registration_coll");
var visitors_of_page = db.get("visitors_of_page");
var error_reports = db.get("error_reports");
var std = db.get("std");

router.get("/", function (req, res) {
  res.render("signLog_net");
});

router.get("/forgot", function (req, res) {
  res.render("forgot");
});

router.post("/postsignup", function (req, res) {
  signlog_coll.createIndex({ email: 1 }, { unique: true }); //takes only one unique record into collection
  signlog_coll.insert(
    {
      email: req.body.email,
      pwd: cryptr.encrypt(req.body.pwd),
      "Signup time": new Date(),
    },
    function (err, docs) {
      if (err) {
        console.log("email exists");
        error_reports.insert({
          email: req.body.email,
          pwd: req.body.pwd,
          "Signup error time": new Date(),
        });
      } else {
        res.send(docs);
      }
    }
  );
});

router.post("/postlogin", function (req, res) {
  visitors_of_page.insert({
    "Visitor name": req.body.uname,
    "Time of visit": new Date(),
  });
  signlog_coll.find({ email: req.body.email }, function (err, data) {
    var password1 = cryptr.decrypt(data[0].pwd);
    var password2 = req.body.pwd;
    console.log(password1 == password2);
    if (password1 == password2) {
      delete data.pwd;
      req.session.email = data;
      res.sendStatus(200);
      console.log("Passwords matched with db!");
    } else {
      error_reports.insert({
        email: req.body.email,
        pwd: req.body.pwd,
        "Login error time": new Date(),
      });
      res.sendStatus(500);
      req.session.destroy();
    }
  });
});

//----------------------------------------------OTP Email--------------------------------------------------------//
router.post("/postforgot", function (req, res) {
  var otp_email = req.body.email;
  var newpassword = randomstring.generate(7);
  signlog_coll.createIndex({ email: 1 }, { unique: true }); //takes only one unique record into collection
  signlog_coll.findOne({ email: otp_email }, function (err, data) {
    if (err) throw err;
    if (data) {
      console.log("Found: " + email);
      signlog_coll.update({ email: otp_email }, { $set: { pwd: newpassword } });
    } else {
      console.log(email + "Not found");
    }
  });

  var transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "edifakemail0@gmail.com",
      pass: "tllydjneetjlztaj",
    },
  });

  var mailOptions = {
    from: "edifakemail0@gmail.com",
    to: req.body.email,
    subject: "OTP",
    html: `<div class="container" style="max-width: 90%; margin: auto; padding-top: 20px"><h2><b>Verification code</b></h2><p>Please use the verification code below to sign in. ✔</p><h2 style="background: #00466a;margin: 0 auto;width: max-content;padding: 0 10px;color: #fff;border-radius: 4px;">${newpassword}</h2><p style="font-size:0.9em;">Regards,<br />Your Brand</p><hr style="border:none;border-top:1px solid #eee" /><div style="float:right;padding:8px 0;color:#aaa;font-size:0.8em;line-height:1;font-weight:300"><p>Your Brand Inc</p><p>Bhargava Gidijala</p><p>+91 9493818156</p></div>`,
  };

  transporter.sendMail(mailOptions, function (err, info) {
    if (err) {
      console.log(err);
    } else {
      console.log("email sent");
      res.send(info);
    }
  });
});

// rendering specific data based on 'status'
router.get("/home", function (req, res) {
  if (req.session && req.session.email) {
    res.locals.email = req.session.email;
    std.find({}, function (err, db) {
      std.find({ status: "At_office" }, function (err, db1) {
        std.find({ status: "Returned" }, function (err, db2) {
          if (err) {
            req.session.destroy();
            console.log(err);
          } else {
            // console.log(db);
            res.render("home", {
              data: db,
              data1: db1,
              data2: db2,
              data3: db,
              count: db.length,
              count1: db1.length,
              count2: db2.length,
            });
          }
        });
      });
    });
  }
});

router.post("/hh", function (req, res) {
  var data = {
    Date: req.body.Date,
    Time: req.body.Time,
    sname: req.body.sname,
    spno: req.body.spno,
    rno: req.body.rno,
    clg: req.body.clg,
    brch: req.body.brch,
    year: req.body.year,
    sec: req.body.sec,
    pname: req.body.pname,
    ppno: req.body.ppno,
    ename: req.body.ename,
    epno: req.body.epno,
    eid: req.body.eid,
    rsn: req.body.rsn,
    mmodel: req.body.mmodel,
    imei: req.body.imei,
    mclr: req.body.mclr,
    status: "At_office",
  };
  std.insert(data, function (err, db) {
    if (err) {
      req.session.destroy();
      console.log(err);
    } else {
      console.log(db);
      res.redirect("/home");
    }
  });
});

router.post("/change", function (req, res) {
  std.update(
    { rno: req.body.rno },
    { $set: { status: "Returned" } },
    function (err, docs) {
      console.log(docs);
    }
  );
  res.redirect("/home");
});

router.post("/edit", function (req, res) {
  var r = req.body.rno;
  std.find({ rno: r }, function (err, db) {
    console.log(db);
    res.send(db);
  });
});

router.post("/update", function (req, res) {
  var data3 = {
    Date: req.body.Date,
    Time: req.body.Time,
    sname: req.body.sname,
    spno: req.body.spno,
    rno: req.body.rno,
    clg: req.body.clg,
    brch: req.body.brch,
    year: req.body.year,
    sec: req.body.sec,
    pname: req.body.pname,
    ppno: req.body.ppno,
    ename: req.body.ename,
    epno: req.body.epno,
    eid: req.body.eid,
    rsn: req.body.rsn,
    mmodel: req.body.mmodel,
    imei: req.body.imei,
    mclr: req.body.mclr,
  };
  std.update({ rno: req.body.rno }, { $set: data3 }, function (err, db) {
    console.log(db);
  });

  res.redirect("/home");
});

router.get("/logout", function (req, res) {
  req.session.destroy();
  res.redirect("/");
});
module.exports = router;

////////////////////////////////////////////////////// previous data with password encryption //////////////////////////////////////////////////////
// router.post('/postlogin', function(req,res){
//   var mail = req.body.mail;
//   sign_coll.find({'mail':req.body.mail},function(err,data){
//   var password1 = crypt.decrypt(data[0].pwd);
//   var password2 = req.body.pwd;
//   console.log(password1==password2);
//   if(password1==password2)
//   {
//     res.sendStatus(200);
//     req.session.mail=data;
//     console.log("login success..!");
//     // res.redirect('/home');
//     // res.send(data);
//   }
//   else{
//     res.sendStatus(500);
//   }
//   })
// });
