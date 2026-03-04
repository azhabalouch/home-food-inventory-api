const authenticate = require("../../middleware/auth");
const express = require("express");
const router = express.Router();
const { db } = require("../../firebase");

router.post("/", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { name, quantity, expiryDate, description, imageUrl } = req.body;

    if (!name || quantity === undefined || !expiryDate) {
      return res.status(400).json({
        error: "Name, quantity and expiryDate are required",
      });
    }

    if (
      typeof name !== "string" ||
      name.trim().length === 0 ||
      name.length > 100
    ) {
      return res.status(400).json({
        error: "Name must be a non-empty string under 100 characters",
      });
    }

    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      return res
        .status(400)
        .json({ error: "Quantity must be a positive number" });
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) ||
      isNaN(Date.parse(expiryDate))
    ) {
      return res.status(400).json({
        error: "expiryDate must be a valid date in YYYY-MM-DD format",
      });
    }

    if (imageUrl) {
      if (
        typeof imageUrl !== "string" ||
        (!imageUrl.startsWith("https://firebasestorage.googleapis.com/") &&
          !imageUrl.startsWith("https://storage.googleapis.com/"))
      ) {
        return res.status(400).json({ error: "Invalid image URL" });
      }
    }

    const newItem = {
      uid,
      name: name.trim(),
      quantity: parsedQuantity,
      expiryDate,
      description: typeof description === "string" ? description.trim() : "",
      imageUrl: imageUrl || "",
      createdAt: new Date().toISOString(),
    };

    const docRef = await db.collection("foodItems").add(newItem);

    res.status(201).json({
      id: docRef.id,
      ...newItem,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;

    const snapshot = await db
      .collection("foodItems")
      .where("uid", "==", uid)
      .get();

    const items = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { id } = req.params;

    const doc = await db.collection("foodItems").doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Item not found" });
    }

    if (doc.data().uid !== uid) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await db.collection("foodItems").doc(id).delete();

    res.status(200).json({ message: "Item deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
