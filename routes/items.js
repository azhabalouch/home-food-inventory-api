const authenticate = require("../middleware/auth");
const express = require("express");
const router = express.Router();
const { db, bucket } = require("../firebase");

// Helper: reference to the Items subcollection for a given user
const itemsRef = (uid) => db.collection("users").doc(uid).collection("Items");

const ALLOWED_CATEGORIES = [
  "Vegetables",
  "Fruits",
  "Meat",
  "Dairy",
  "Pantry",
  "Beverages",
  "Snacks",
  "Frozen",
  "Other",
];

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
    const { name, quantity, expiryDate, description, imageUrl, category } =
      req.body;

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

    if (category && !ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: "Invalid category" });
    }

    const newItem = {
      name: name.trim(),
      quantity: parsedQuantity,
      expiryDate,
      description: typeof description === "string" ? description.trim() : "",
      imageUrl: imageUrl || "",
      category: category || "",
      createdAt: new Date().toISOString(),
    };

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

// GET /:category — return only items matching that category
router.get("/:category", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { category } = req.params;

    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: "Invalid category" });
    }

    const snapshot = await itemsRef(uid)
      .where("category", "==", category)
      .get();

    const items = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /:id — update an existing item
router.put("/:id", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { id } = req.params;
    const { name, quantity, expiryDate, description, imageUrl, category } =
      req.body;

    const docRef = itemsRef(uid).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Item not found" });
    }

    const updates = {};

    if (name !== undefined) {
      if (
        typeof name !== "string" ||
        name.trim().length === 0 ||
        name.length > 100
      ) {
        return res.status(400).json({
          error: "Name must be a non-empty string under 100 characters",
        });
      }
      updates.name = name.trim();
    }

    if (quantity !== undefined) {
      const parsedQuantity = Number(quantity);
      if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
        return res
          .status(400)
          .json({ error: "Quantity must be a positive number" });
      }
      updates.quantity = parsedQuantity;
    }

    if (expiryDate !== undefined) {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) ||
        isNaN(Date.parse(expiryDate))
      ) {
        return res.status(400).json({
          error: "expiryDate must be a valid date in YYYY-MM-DD format",
        });
      }
      updates.expiryDate = expiryDate;
    }

    if (description !== undefined) {
      updates.description =
        typeof description === "string" ? description.trim() : "";
    }

    if (imageUrl !== undefined) {
      if (
        imageUrl &&
        typeof imageUrl === "string" &&
        !imageUrl.startsWith("https://firebasestorage.googleapis.com/") &&
        !imageUrl.startsWith("https://storage.googleapis.com/")
      ) {
        return res.status(400).json({ error: "Invalid image URL" });
      }
      updates.imageUrl = imageUrl || "";
    }

    if (category !== undefined) {
      if (category && !ALLOWED_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }
      updates.category = category || "";
    }

    await docRef.update({ ...updates, updatedAt: new Date().toISOString() });

    const updated = await docRef.get();
    res.status(200).json({ id: updated.id, ...updated.data() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /batch-delete — delete multiple items by ID
router.post("/batch-delete", authenticate, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids must be a non-empty array" });
    }

    if (ids.length > 50) {
      return res
        .status(400)
        .json({ error: "Cannot delete more than 50 items at once" });
    }

    if (!ids.every((id) => typeof id === "string" && id.trim().length > 0)) {
      return res
        .status(400)
        .json({ error: "Each id must be a non-empty string" });
    }

    const refs = ids.map((id) => itemsRef(uid).doc(id));
    const docs = await Promise.all(refs.map((ref) => ref.get()));

    await Promise.all(
      docs.map((doc, i) => {
        if (!doc.exists) return Promise.resolve();
        const { imageUrl } = doc.data();
        return Promise.all([refs[i].delete(), deleteStorageImage(imageUrl)]);
      }),
    );

    res.status(200).json({ message: `Deleted ${ids.length} items` });
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
