const authenticate = require("../middleware/auth");
const express = require("express");
const router = express.Router();
const db = require("../firebase");

router.post("/", authenticate, async (req, res) => {
  try {
    const { name, quantity, expiryDate, description, imageUrl } = req.body;

    if (!name || !quantity || !expiryDate) {
      return res.status(400).json({
        error: "Name, quantity and expiryDate are required",
      });
    }

    const newItem = {
      name,
      quantity,
      expiryDate,
      description,
      imageUrl,
      createdAt: new Date(),
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
    const snapshot = await db
      .collection("foodItems")
      .orderBy("createdAt", "desc")
      .get();

    const items = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    await db.collection("foodItems").doc(id).delete();

    res.status(200).json({ message: "Item deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
