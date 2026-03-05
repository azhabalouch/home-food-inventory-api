const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const authenticate = require("../middleware/auth");

const profileRef = (uid) =>
  db.collection("users").doc(uid).collection("Profile").doc("data");

const usernameRef = (username) =>
  db.collection("usernames").doc(username.toLowerCase());

router.get("/check-username", async (req, res) => {
  try {
    const { username } = req.query;
    if (!username || typeof username !== "string") {
      return res.status(400).json({ error: "username is required" });
    }
    const doc = await usernameRef(username.trim()).get();
    res.json({ available: !doc.exists });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const email = req.user.email;

    const { firstName, lastName, username } = req.body;

    if (!firstName || !lastName || !username) {
      return res
        .status(400)
        .json({ error: "firstName, lastName and username are required" });
    }

    const normalizedUsername = String(username).trim();

    const [existingDoc, usernameDoc] = await Promise.all([
      profileRef(uid).get(),
      usernameRef(normalizedUsername).get(),
    ]);

    if (existingDoc.exists) {
      return res.status(400).json({ error: "Profile already exists" });
    }

    if (usernameDoc.exists) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const batch = db.batch();
    batch.set(profileRef(uid), {
      uid,
      email,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      username: normalizedUsername,
      phoneNumber: "",
      profileImageUrl: "",
      address: "",
      location: null,
      isProfileComplete: false,
      createdAt: new Date(),
    });
    batch.set(usernameRef(normalizedUsername), { uid });
    await batch.commit();

    res.status(200).json({ message: "Profile created" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;

    const doc = await profileRef(uid).get();

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

    const existingDoc = await profileRef(uid).get();
    const existing = existingDoc.exists ? existingDoc.data() : {};

    if (updateData.username !== undefined) {
      const normalizedUsername = String(updateData.username).trim();
      updateData.username = normalizedUsername;

      if (normalizedUsername !== existing.username) {
        const usernameDoc = await usernameRef(normalizedUsername).get();
        if (usernameDoc.exists) {
          return res.status(409).json({ error: "Username already taken" });
        }
      }
    }

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

    if (
      updateData.username !== undefined &&
      updateData.username !== existing.username
    ) {
      const batch = db.batch();
      if (existing.username) {
        batch.delete(usernameRef(existing.username));
      }
      batch.set(usernameRef(updateData.username), { uid });
      batch.set(profileRef(uid), updateData, { merge: true });
      await batch.commit();
    } else {
      await profileRef(uid).set(updateData, { merge: true });
    }

    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
