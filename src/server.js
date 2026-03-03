const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const itemRoutes = require("./routes/items");
const profileRoutes = require("./routes/profile");

const app = express();

// Security headers
app.use(helmet());

// Restrict CORS to the known client origin
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || "http://localhost:8081",
    methods: ["GET", "POST", "PUT", "DELETE"],
  }),
);

// Rate limiting — 100 requests per 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use(limiter);

// Limit request body to 10 kb to prevent payload-flooding attacks
app.use(express.json({ limit: "10kb" }));

app.use("/items", itemRoutes);
app.use("/profile", profileRoutes);

app.get("/", (req, res) => {
  res.send("API is running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on Port ${PORT}`);
});
