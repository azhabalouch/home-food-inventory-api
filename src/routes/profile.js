const express = require("express");
const router = express.Router();
const db = require("../firebase");
const authenticate = require("../middleware/auth");

router.post("/", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;

    const { email, firstName, lastName, username } = req.body;

    const existingDoc = await db.collection("users").doc(uid).get();

    if (existingDoc.exists) {
      return res.status(400).json({ error: "Profile already exists" });
    }

    await db.collection("users").doc(uid).set({
      uid,
      email,
      firstName,
      lastName,
      username,
      phoneNumber: "",
      profileImageUrl: "",
      address: "",
      location: null,
      isProfileComplete: false,
      createdAt: new Date(),
    });

    res.status(200).json({ message: "Profile created" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;

    const doc = await db.collection("users").doc(uid).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.status(200).json(doc.data());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;

    const {
      firstName,
      LastName,
      username,
      phoneNumber,
      address,
      location,
      profileImageUrl,
      isProfileComplete,
    } = req.body;

    await db.collection("users").doc(uid).update({
      firstName,
      LastName,
      username,
      phoneNumber,
      address,
      location,
      profileImageUrl,
      isProfileComplete,
    });

    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
