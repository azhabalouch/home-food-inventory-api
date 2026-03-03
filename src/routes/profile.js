const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const authenticate = require("../middleware/auth");

router.post("/", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    // Email comes from the verified Firebase token � never trust req.body for this
    const email = req.user.email;

    const { firstName, lastName, username } = req.body;

    if (!firstName || !lastName || !username) {
      return res
        .status(400)
        .json({ error: "firstName, lastName and username are required" });
    }

    const existingDoc = await db.collection("users").doc(uid).get();

    if (existingDoc.exists) {
      return res.status(400).json({ error: "Profile already exists" });
    }

    await db
      .collection("users")
      .doc(uid)
      .set({
        uid,
        email,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        username: String(username).trim(),
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
    const updateData = {};

    // Whitelist writable fields � uid, email, isProfileComplete are server-managed
    const allowedFields = [
      "firstName",
      "lastName",
      "username",
      "phoneNumber",
      "address",
      "location",
      "profileImageUrl",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Validate profileImageUrl � must be a real Firebase Storage URL
    if (updateData.profileImageUrl) {
      const url = updateData.profileImageUrl;
      if (
        typeof url !== "string" ||
        (!url.startsWith("https://firebasestorage.googleapis.com/") &&
          !url.startsWith("https://storage.googleapis.com/"))
      ) {
        return res.status(400).json({ error: "Invalid profile image URL" });
      }
    }

    // Validate location shape if provided
    if (updateData.location !== undefined && updateData.location !== null) {
      const { latitude, longitude } = updateData.location;
      if (
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return res.status(400).json({ error: "Invalid location coordinates" });
      }
    }

    // Compute isProfileComplete server-side � never trust the client for this
    const existingDoc = await db.collection("users").doc(uid).get();
    const existing = existingDoc.exists ? existingDoc.data() : {};
    const merged = { ...existing, ...updateData };

    updateData.isProfileComplete = !!(
      merged.firstName &&
      merged.lastName &&
      merged.username &&
      merged.phoneNumber &&
      merged.address &&
      merged.profileImageUrl &&
      merged.location
    );

    // set + merge: creates if missing, patches if exists � safer than update()
    await db.collection("users").doc(uid).set(updateData, { merge: true });

    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
