


// DEPENDENCIES
// DB via knex.js to run queries
var db  = require("../server/db");

var uuid = require("node-uuid");
var emUtil = require("../utils/em-notify");

// Utility checks if a client is logged in
var utils = require("../utils/utils.js");
var pass = utils["pass"];
var hashPw = pass.hashPw;
var isLoggedIn = pass.isLoggedIn;



module.exports = function (app, passport) {



	// MAIN PAGE CURRENTLY ROUTES STRAIGHT TO LOGIN
	// TO DO: Make a splash page (GH Issue: https://github.com/slco-2016/clientcomm/issues/72)
	app.get("/", function (req, res) {
		res.redirect("/login");
	});



	// LOGIN PAGE RENDER
	app.get("/login", function (req, res) {
		// check if the user is already logged in
		if (req.hasOwnProperty("user")) { res.redirect("/cms"); } 
		else { res.render("login"); }
	});



	// FORGOT LOGIN PAGE RENDER
	app.get("/login/reset", function (req, res) {
		res.render("loginreset");
	});



	// SUBMIT REQUEST FOR PASSWORD RESET EMAIL
	app.post("/login/reset", function (req, res) {
		var em = req.body.email;

		// See if this email is even in the system
		db("cms")
		.whereRaw("LOWER(email) = LOWER('" + em + "')")
		.limit(1)
		.then(function (cms) {

			// This email is not in the system, they need to try again
			if (cms.length == 0) {
				req.flash("warning", "Could not find an account with that email.");
				res.redirect("/login/reset");

			// There is an account with this email in the system
			} else {
				var cm = cms[0];
				var uid = uuid.v1();

				// Remove all prior requests for password reset
				db("pwresets")
				.where("cmid", cm.cmid)
				.del()
				.then(function () { 

				// Create a new row with current pw request
				db("pwresets")
				.insert({
					cmid: cm.cmid,
					uid: uid,
					email: cm.email
				})
				.then(function () {

					emUtil.sendPassResetEmail(cm, uid, function () {
						// Render direction to check email card
						req.flash("success", "Reset password email was sent to " + cm.email );
						res.render("loginresetsent", {cm: cm});
					});

				}).catch(function (err) { res.redirect("/500"); }); // Query 3
				}).catch(function (err) { res.redirect("/500"); }); // Query 2

			}

		}).catch(function (err) { res.redirect("/500"); }); // Query 1
	});



	// UNIQUE KEY FROM EMAIL TO RESET PASSWORD PAGE RENDER
	app.get("/login/reset/:uid", function (req, res) {

		// Make sure that is a valid uid being provided
		db("pwresets")
		.where("uid", req.params.uid)
		.andWhere("expiration", ">", db.fn.now())
		.limit(1)
		.then(function (rows) {

			if (rows.length == 0) { 
				req.flash("warning", "That address does not point to a valid password reset link. Try again.");
				res.redirect("/login/reset");
			} else {
				var reset = rows[0];
				res.render("loginresetphasetwo", {reset: reset});
			}

		}).catch(function (err) { res.redirect("/500"); });

	});



	// SUBMIT NEW PASSWORD
	app.post("/login/reset/:uid", function (req, res) {
		// Redirect options
		var retry_loc = "/login/reset/" + req.params.uid;
		var redirect_loc = "/login/reset/";

		// Critical body elements
		var pwresid = Number(req.body.pwresid);
		var cmid    = Number(req.body.cmid);

		var uid     = String(req.body.uid);
		var uid2    = String(req.params.uid);

		var pass    = String(req.body.pass);
		var pass2   = String(req.body.pass2);


		// Make sure that passwords line up
		if (pass !== pass2) { 
			req.flash("warning", "Passwords do not match, please try again.");
			res.redirect(retry_loc);

		// Make sure key form components line up
		} else if (uid !== uid2) { 
			req.flash("warning", "Bad form entry (uid), please try applying for a new reset key.");
			res.redirect(redirect_loc);

		} else {
			// Make sure that is a valid uid being provided
			db("pwresets")
			.where("uid", uid)
			.andWhere("cmid", cmid)
			.andWhere("pwresid", pwresid)
			.andWhere("expiration", ">", db.fn.now())
			.limit(1)
			.returning("email")
			.then(function (rows) {

				// Form entry is bad, they did include correct hidden components
				if (rows.length == 0) { 
					req.flash("warning", "Bad form entry, please try applying for a new reset key.");
					res.redirect(redirect_loc);

				// Found the relevant row
				} else {

					// Query 2: Update the case manager's password
					db("cms")
					.where("cmid", cmid)
					.update({pass: hashPw(pass)})
					.then(function (rows) {
						
					// Query 3: We can delete that pw reset row now
					db("pwresets")
					.where("pwresid", pwresid)
					.del()
					.then(function () {

						// Prompt the case manager to log in with new pw
						req.flash("success", "You have updated your account password.");
						res.redirect("/login");

					}).catch(function (err) { res.redirect("/500"); }); // Query 3
					}).catch(function (err) { res.redirect("/500"); }); // Query 2

				}
			}).catch(function (err) { res.redirect("/500"); });
		}
	});



	// LOGIN REQUEST & PASSPORT LOGIN LOGIC
  app.post("/login", passport.authenticate("local-login", {
      successRedirect: "/cms",
      failureRedirect: "/login-fail"
    })
  );



	// LOGIN FAIL REROUTE LOGIC
	// TO DO: This supports the Passport POST for login, 
	//        there is likely better way to do this without reroute
	app.get("/login-fail", function (req, res) {
		req.flash("warning", "Email password combination did not work.");
		res.redirect("/login");
	});



  // LOGOUT
	app.get("/logout", isLoggedIn, function (req, res) {
		req.logout();
		req.flash("success", "Successfully logged out.");
		res.redirect("/")
	});



	// PUBLIC STATS VIEW
	// TO DO: As tool increases in size, we need this to not hit up the actual data base but to show some numbers that are crunches X times a day.
	app.get("/stats", function (req, res) {

		// Get msg counts, grouped by hour and out/inbound
		var rawQuery1 = " SELECT count(msgid), inbound, trunc(EXTRACT(HOUR FROM created)) AS date_hr " + 
										" FROM msgs " +
										" GROUP BY date_hr, inbound " +
										" ORDER BY date_hr ASC;";
		db.raw(rawQuery1).then(function (msgs) {

		// Get msg counts by day of week
		var rawQuery2 = "SELECT COUNT(to_char(created, 'dy')), extract(dow FROM created) AS dow FROM msgs GROUP BY dow ORDER BY dow ASC;";
		db.raw(rawQuery2).then(function (days) {

		// Get total msg count
		var rawQuery3 = "SELECT count(msgid) FROM msgs;";
		db.raw(rawQuery3).then(function (msgct) {

		// Get number of currently active convos
		var rawQuery4 = "SELECT count(convid) FROM convos WHERE convos.open = TRUE;";
		db.raw(rawQuery4).then(function (convosct) {

		// Get number of currently active clients
		var rawQuery5 = "SELECT count(clid) FROM clients WHERE clients.active = TRUE;";
		db.raw(rawQuery5).then(function (clsct) {

				res.render("stats", {
					msgs: msgs.rows, 
					days: days.rows, 
					overall: { 
						msgs: msgct.rows[0].count, 
						convos: convosct.rows[0].count, 
						clients: clsct.rows[0].count 
					} 
				});

		}).catch(function (err) { res.redirect("/500"); }); // Query 1
		}).catch(function (err) { res.redirect("/500"); }); // Query 2
		}).catch(function (err) { res.redirect("/500"); }); // Query 3
		}).catch(function (err) { res.redirect("/500"); }); // Query 4
		}).catch(function (err) { res.redirect("/500"); }); // Query 5
	});

};



