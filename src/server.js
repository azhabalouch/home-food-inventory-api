const express = require("express");
const cors = require("cors");
require("dotenv").config();

const itemRoutes = require("./routes/items");
const profileRoutes = require("./routes/profile");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/items", itemRoutes);
app.use("/profile", profileRoutes);

app.get("/", (req, res) => {
  res.send("API is running");
});

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server is running on Port ${PORT}`);
});
