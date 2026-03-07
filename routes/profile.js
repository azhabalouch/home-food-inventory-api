const express = require("express");
const router = express.Router();
const { db } = require("../firebase");
const authenticate = require("../middleware/auth");

const profileRef = (uid) =>
  db.collection("users").doc(uid).collection("Profile").doc("data");

router.post("/", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const email = req.user.email;

    const { firstName, lastName } = req.body;

    if (!firstName || !lastName) {
      return res
        .status(400)
        .json({ error: "firstName and lastName are required" });
    }

    const existingDoc = await profileRef(uid).get();

    if (existingDoc.exists) {
      return res.status(400).json({ error: "Profile already exists" });
    }

    await profileRef(uid).set({
      uid,
      email,
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      phoneNumber: "",
      profileImageUrl: "",
      address: null,
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

    if (updateData.address !== undefined && updateData.address !== null) {
      const address = updateData.address;
      if (typeof address !== "object") {
        return res.status(400).json({ error: "Invalid address" });
      }
      const line1 = String(address.line1 ?? "").trim();
      const city = String(address.city ?? "").trim();
      const postalCode = String(address.postalCode ?? "").trim();
      const country = String(address.country ?? "").trim();
      const line2 = String(address.line2 ?? "").trim();

      if (!line1 || !city || !postalCode || !country) {
        return res.status(400).json({ error: "Invalid address" });
      }

      updateData.address = {
        line1,
        line2: line2 || undefined,
        city,
        postalCode,
        country,
      };
    }

    const existingDoc = await profileRef(uid).get();
    const existing = existingDoc.exists ? existingDoc.data() : {};

    const merged = { ...existing, ...updateData };

    updateData.isProfileComplete = !!(
      merged.firstName &&
      merged.lastName &&
      merged.phoneNumber &&
      merged.address &&
      merged.profileImageUrl &&
      merged.location
    );

    await profileRef(uid).set(updateData, { merge: true });

    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
