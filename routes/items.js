const authenticate = require("../middleware/auth");
const express = require("express");
const router = express.Router();
const { db, bucket } = require("../firebase");

// Helper: reference to the Items subcollection for a given user
const itemsRef = (uid) => db.collection("users").doc(uid).collection("Items");

/**
 * Extracts the Storage object path from a Firebase download URL and deletes it.
 * Silently ignores errors (e.g. file already deleted).
 */
async function deleteStorageImage(imageUrl) {
  try {
    if (!imageUrl) return;
    // Download URLs are encoded — decode before extracting the path
    const decoded = decodeURIComponent(imageUrl);
    const match = decoded.match(/\/o\/(.+?)\?/);
    if (match) {
      const filePath = match[1];
      await bucket.file(filePath).delete();
    }
  } catch {
    // Non-fatal: missing image should not block the delete
  }
}

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
      name: name.trim(),
      quantity: parsedQuantity,
      expiryDate,
      description: typeof description === "string" ? description.trim() : "",
      imageUrl: imageUrl || "",
      createdAt: new Date().toISOString(),
    };

    // Store under users/{uid}/Items subcollection
    const docRef = await itemsRef(uid).add(newItem);

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

    // All documents in the subcollection already belong to this user
    const snapshot = await itemsRef(uid).get();

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

    const docRef = itemsRef(uid).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Item not found" });
    }

    const { imageUrl } = doc.data();

    // Delete Firestore document and Storage image in parallel
    await Promise.all([docRef.delete(), deleteStorageImage(imageUrl)]);

    res.status(200).json({ message: "Item deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
