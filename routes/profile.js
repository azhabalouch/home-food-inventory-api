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
      profileImageUrl: "",
      locationAddress: null,
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

    // Achievements are served from /profile/achievements — omit here
    const { earnedAchievementIds: _omit, ...profileData } = doc.data();
    res.status(200).json(profileData);
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
      "locationAddress",
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

    if (
      updateData.locationAddress !== undefined &&
      updateData.locationAddress !== null
    ) {
      const loc = updateData.locationAddress;
      if (typeof loc !== "object") {
        return res.status(400).json({ error: "Invalid locationAddress" });
      }

      const { latitude, longitude } = loc;
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

      const line1 = String(loc.line1 ?? "").trim();
      const city = String(loc.city ?? "").trim();
      const postalCode = String(loc.postalCode ?? "").trim();
      const country = String(loc.country ?? "").trim();
      const line2 = String(loc.line2 ?? "").trim();

      if (!line1 || !city || !postalCode || !country) {
        return res.status(400).json({
          error:
            "Invalid locationAddress: line1, city, postalCode, and country are required",
        });
      }

      updateData.locationAddress = {
        line1,
        line2: line2 || undefined,
        city,
        postalCode,
        country,
        latitude,
        longitude,
      };
    }

    const existingDoc = await profileRef(uid).get();
    const existing = existingDoc.exists ? existingDoc.data() : {};

    const merged = { ...existing, ...updateData };

    updateData.isProfileComplete = !!(
      merged.firstName &&
      merged.lastName &&
      merged.locationAddress &&
      merged.profileImageUrl
    );

    await profileRef(uid).set(updateData, { merge: true });

    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /achievements — return only the earned achievement IDs
router.get("/achievements", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const doc = await profileRef(uid).get();
    const earnedAchievementIds = doc.exists
      ? (doc.data().earnedAchievementIds ?? [])
      : [];
    res.status(200).json({ earnedAchievementIds });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /achievements — update only the earned achievement IDs
router.put("/achievements", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { earnedAchievementIds } = req.body;

    if (
      !Array.isArray(earnedAchievementIds) ||
      earnedAchievementIds.some(
        (id) => typeof id !== "string" || id.length > 64,
      )
    ) {
      return res
        .status(400)
        .json({ error: "Invalid earnedAchievementIds: must be string[]" });
    }

    const VALID_IDS = new Set([
      "first-item",
      "inventory-pro",
      "first-donation",
      "community-hero",
      "zero-waste",
    ]);
    const sanitized = [
      ...new Set(earnedAchievementIds.filter((id) => VALID_IDS.has(id))),
    ];

    await profileRef(uid).set(
      { earnedAchievementIds: sanitized },
      { merge: true },
    );
    res.status(200).json({ earnedAchievementIds: sanitized });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
