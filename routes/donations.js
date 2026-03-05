const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");
const { db } = require("../firebase");
const authenticate = require("../middleware/auth");

const donationsRef = db.collection("donations");

router.post("/", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userName =
      req.user.name || req.user.email?.split("@")[0] || "Anonymous";

    const { title, description, quantity, expiryDate, location, address } =
      req.body;

    if (!title || !quantity || !expiryDate || !location) {
      return res.status(400).json({
        error: "title, quantity, expiryDate and location are required",
      });
    }

    if (
      typeof title !== "string" ||
      title.trim().length === 0 ||
      title.length > 100
    ) {
      return res.status(400).json({
        error: "title must be a non-empty string under 100 characters",
      });
    }

    if (
      typeof quantity !== "string" ||
      quantity.trim().length === 0 ||
      quantity.length > 100
    ) {
      return res.status(400).json({
        error: "quantity must be a non-empty string under 100 characters",
      });
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) ||
      isNaN(Date.parse(expiryDate))
    ) {
      return res.status(400).json({
        error: "expiryDate must be a valid date in YYYY-MM-DD format",
      });
    }

    const { latitude, longitude } = location;
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

    const newDonation = {
      userId: uid,
      userName,
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : "",
      quantity: quantity.trim(),
      expiryDate,
      status: "available",
      location: { latitude, longitude },
      address: typeof address === "string" ? address.trim() : "",
      createdAt: new Date().toISOString(),

      claimedAt: null,
      claimedByUserId: null,
      claimedByName: null,
      posterConfirmed: false,
      posterConfirmedAt: null,
      claimerConfirmed: false,
      claimerConfirmedAt: null,

      unreadMessages: {},
    };

    const docRef = await donationsRef.add(newDonation);
    res.status(201).json({ id: docRef.id, ...newDonation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/", authenticate, async (req, res) => {
  try {
    const snapshot = await donationsRef
      .where("status", "==", "available")
      .get();

    const donations = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json(donations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/my-active", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;

    const [postedSnap, claimedSnap] = await Promise.all([
      donationsRef.where("userId", "==", uid).get(),
      donationsRef.where("claimedByUserId", "==", uid).get(),
    ]);

    const seen = new Set();
    const donations = [];

    postedSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.status === "available") return;
      seen.add(doc.id);
      const unreadCount = (data.unreadMessages || {})[uid] || 0;
      donations.push({ id: doc.id, ...data, unreadCount });
    });

    claimedSnap.docs.forEach((doc) => {
      if (seen.has(doc.id)) return;
      const data = doc.data();
      const unreadCount = (data.unreadMessages || {})[uid] || 0;
      donations.push({ id: doc.id, ...data, unreadCount });
    });

    donations.sort(
      (a, b) =>
        new Date(b.claimedAt || b.createdAt) -
        new Date(a.claimedAt || a.createdAt),
    );

    res.status(200).json(donations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/pending-count", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const now = Date.now();
    const THIRTY_MIN_MS = 30 * 60 * 1000;

    const [postedSnap, claimedSnap] = await Promise.all([
      donationsRef.where("userId", "==", uid).get(),
      donationsRef.where("claimedByUserId", "==", uid).get(),
    ]);

    let confirmCount = 0;
    let unreadTotal = 0;

    postedSnap.docs.forEach((doc) => {
      const d = doc.data();
      unreadTotal += (d.unreadMessages || {})[uid] || 0;
      if (d.status !== "claimed") return;
      if (d.posterConfirmed) return;
      if (
        d.claimedAt &&
        now - new Date(d.claimedAt).getTime() >= THIRTY_MIN_MS
      ) {
        confirmCount++;
      }
    });

    claimedSnap.docs.forEach((doc) => {
      const d = doc.data();
      unreadTotal += (d.unreadMessages || {})[uid] || 0;
      if (d.status !== "claimed") return;
      if (d.posterConfirmed && !d.claimerConfirmed) {
        confirmCount++;
      }
    });

    res.status(200).json({ count: confirmCount + unreadTotal });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id/claim", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const claimedByName =
      req.user.name || req.user.email?.split("@")[0] || "Anonymous";

    const docRef = donationsRef.doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Donation not found" });
    }

    const donation = doc.data();

    if (donation.status !== "available") {
      return res.status(409).json({ error: "Donation is no longer available" });
    }

    if (donation.userId === uid) {
      return res
        .status(403)
        .json({ error: "You cannot claim your own donation" });
    }

    await docRef.update({
      status: "claimed",
      claimedByUserId: uid,
      claimedByName,
      claimedAt: new Date().toISOString(),
    });

    res.status(200).json({ message: "Donation claimed successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id/confirm-given", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const docRef = donationsRef.doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Donation not found" });
    }

    const data = doc.data();

    if (data.userId !== uid) {
      return res
        .status(403)
        .json({ error: "Only the poster can confirm this" });
    }

    if (data.status !== "claimed") {
      return res
        .status(400)
        .json({ error: "Donation must be in claimed state" });
    }

    if (data.posterConfirmed) {
      return res.status(409).json({ error: "Already confirmed" });
    }

    await docRef.update({
      posterConfirmed: true,
      posterConfirmedAt: new Date().toISOString(),
    });

    res
      .status(200)
      .json({ message: "Confirmed. Waiting for claimer to confirm receipt." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id/confirm-received", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const docRef = donationsRef.doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Donation not found" });
    }

    const data = doc.data();

    if (data.claimedByUserId !== uid) {
      return res
        .status(403)
        .json({ error: "Only the claimer can confirm receipt" });
    }

    if (!data.posterConfirmed) {
      return res.status(400).json({ error: "The poster must confirm first" });
    }

    if (data.claimerConfirmed) {
      return res.status(409).json({ error: "Already confirmed" });
    }

    await docRef.update({
      claimerConfirmed: true,
      claimerConfirmedAt: new Date().toISOString(),
      status: "completed",
    });

    res.status(200).json({ message: "Donation completed. Thank you!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch("/:id/read", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const docRef = donationsRef.doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Donation not found" });
    }

    const data = doc.data();

    if (data.userId !== uid && data.claimedByUserId !== uid) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await docRef.update({ [`unreadMessages.${uid}`]: 0 });

    res.status(200).json({ message: "Marked as read" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id/messages", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const docRef = donationsRef.doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Donation not found" });
    }

    const data = doc.data();

    if (data.userId !== uid && data.claimedByUserId !== uid) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const messagesSnap = await docRef
      .collection("messages")
      .orderBy("createdAt", "asc")
      .get();

    const messages = messagesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/:id/messages", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const senderName =
      req.user.name || req.user.email?.split("@")[0] || "Anonymous";

    const docRef = donationsRef.doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Donation not found" });
    }

    const data = doc.data();

    if (data.userId !== uid && data.claimedByUserId !== uid) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { text } = req.body;

    if (
      !text ||
      typeof text !== "string" ||
      text.trim().length === 0 ||
      text.length > 500
    ) {
      return res.status(400).json({
        error: "text must be a non-empty string under 500 characters",
      });
    }

    const message = {
      senderId: uid,
      senderName,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };

    const msgRef = await docRef.collection("messages").add(message);

    const otherUserId =
      uid === data.userId ? data.claimedByUserId : data.userId;
    if (otherUserId) {
      await docRef.update({
        [`unreadMessages.${otherUserId}`]:
          admin.firestore.FieldValue.increment(1),
      });
    }

    res.status(201).json({ id: msgRef.id, ...message });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const docRef = donationsRef.doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Donation not found" });
    }

    if (doc.data().userId !== uid) {
      return res
        .status(403)
        .json({ error: "Forbidden: you can only delete your own donations" });
    }

    await docRef.delete();
    res.status(200).json({ message: "Donation deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
