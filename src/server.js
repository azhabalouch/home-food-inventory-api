const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const itemRoutes = require("./routes/items");
const profileRoutes = require("./routes/profile");

const app = express();

app.use(helmet());

app.use(cors({ origin: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use(limiter);

app.use(express.json({ limit: "10kb" }));

app.use("/items", itemRoutes);
app.use("/profile", profileRoutes);

app.get("/", (req, res) => {
  res.send("API is running");
});

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server is running on Port ${PORT}`);
  });
}

module.exports = app;
