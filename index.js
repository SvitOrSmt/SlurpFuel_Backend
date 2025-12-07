import express from "express";
import Stripe from "stripe";
import dotenv from "dotenv";
import cors from "cors";
import mysql from "mysql2/promise";

dotenv.config();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());

// Existing /api route
import checkoutRoute from "./checkout.js";
app.use("/api", checkoutRoute);

const db = await mysql.createPool({
  host: "localhost",
  user: "root",
  password: "user",
  database: "store",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// -----------------------------
// BUY ROUTE (UNCHANGED)
// -----------------------------
app.get("/buy", async (req, res) => {
  const { price, orderId } = req.query;

  if (!price || !orderId) {
    return res.status(400).send("Missing price or orderId");
  }

  try {
    const amountInCents = Math.round(Number(price) * 100);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `Order ${orderId}` },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      metadata: { orderId },
      success_url: "http://localhost:5173/success",
      cancel_url: "http://localhost:5173/cancel",
    });

    res.redirect(session.url);
  } catch (err) {
    console.log(err);
    res.status(500).send(err.message);
  }
});

// -----------------------------
// ADD USER (FIXED)
// -----------------------------
app.post("/api/add_user", async (req, res) => {
  console.log("Received from React:", req.body);

  const { address, postcode, country, state, email, phone, name, surname } =
    req.body;

  try {
    const [result] = await db.execute(
      "INSERT INTO user (surname, name, phone, email, state, cuntry, postcode, adress) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [surname, name, phone, email, state, country, postcode, address]
    );

    console.log("Inserted ID:", result.insertId);

    return res.json({ status: "ok", insertedId: result.insertId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

// -----------------------------
// GET USER (FIXED)
// -----------------------------
app.post("/api/get/user", async (req, res) => {
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: "Missing userId" });

  try {
    const [rows] = await db.execute(
      "SELECT * FROM user WHERE user_pk = ?",
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/check/discount", async (req, res) => {
  const { code } = req.body;

  if (!code) return res.status(400).json({ status:0, message: "Missing code" });

  try {
    const [rows] = await db.execute(
      "SELECT * FROM discounts WHERE code = ?",
      [code]
    );

    if (rows.length === 0) {
      return res.status(404).json({message: "Code not found" });
    }

    if (!rows[0].isActive) {
      return res.status(404).json({message: "Code is not active at this time" });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(404).json({ message: err.message });
  }
});

app.post("/api/get/ratings", async (req, res) => {
  const { id } = req.body;

  if (!id) return res.status(400).json({ status:0, message: "Missing item id" });

  try {
    const [rows] = await db.execute(
  `SELECT r.*
   FROM rating AS r
   JOIN rating_to_item AS ri
     ON r.rating_pk = ri.rating_fk
   WHERE ri.item_fk = ?`,
    [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({message: "Item not found" });
    }

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(404).json({ message: err.message });
  }
});

app.post("/api/get/article", async (req, res) => {
  const { id } = req.body;

  if (!id) return res.status(400).json({ status:0, message: "Missing article id" });

  try {
      const [rows] = await db.execute(
      "SELECT * FROM articles WHERE article_pk = ?",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({message: "Item not found" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(404).json({ message: err.message });
  }
});

app.post("/api/set/add_rewiew", async (req, res) => {
  const {name, email, rating, des, item_fk} = req.body;

  if (!name) return res.status(400).json({ status:0, message: "Missing name" });
  if (!email) return res.status(400).json({ status:0, message: "Missing email" });
  if (!rating) return res.status(400).json({ status:0, message: "Missing rating" });
  if (!des) return res.status(400).json({ status:0, message: "Missing description" });
  if (!item_fk) return res.status(400).json({ status:0, message: "Error retreaving the item_pk" }); if (!item_fk) return res.status(400).json({ status:0, message: "Missing item_fk" });

  try {
      const [rows1] = await db.execute(
      "SELECT * FROM user WHERE email = ?",
      [email]
    );
    if (rows1.length === 0) {
      return res.status(404).json({message: "Please use the email you purchesed the product with." });
    }
    if (!rows1[0].sale) {
      return res.status(404).json({message: "You need to purchese the product before adding a rewiew." });
    }
    const [rows2] = await db.execute(
      "SELECT * FROM rating WHERE email = ? AND item_fk = ?",
      [email, item_fk]
    );
    //console.log(rows2.length === 0);
    if (!(rows2.length === 0)) {
      return res.status(404).json({message: "You have alrady submited a rewiew for this item" });
    }
    const [result] = await db.execute(
  `INSERT INTO rating (email, rating, description, date, name, item_fk)
   VALUES (?, ?, ?, NOW(), ?, ?)`,
  [email, rating, des, name, item_fk]
  );

  await db.execute(
  `INSERT INTO rating_to_item (item_fk, rating_fk)
   VALUES (?, ?)`,
  [item_fk, result.insertId]
  );

    

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(404).json({ message: err.message });
  }
});

app.post("/api/get/article_topic", async (req, res) => {
  const { id } = req.body;

  if (!id) return res.status(400).json({ status:0, message: "Missing topic id" });

  try {
const [rows] = await db.execute(
  `SELECT a.*
   FROM articles a
   JOIN article_to_topic at ON article_pk = article_fk
   WHERE topic_fk = ?`,
  [id]   
);

    if (rows.length === 0) {
      return res.status(404).json({message: "Item not found" });
    }

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(404).json({ message: err.message });
  }
});

app.post("/api/get/topics", async (req, res) => {
  //const { id } = req.body;

  //if (!id) return res.status(400).json({ status:0, message: "Missing top" });

  try {
const [rows] = await db.execute(
  "SELECT * FROM topics",  
);

    if (rows.length === 0) {
      return res.status(404).json({message: "Item not found" });
    }

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(404).json({ message: err.message });
  }
});

app.post("/api/get/collection", async (req, res) => {
  const { id } = req.body;

  if (!id) return res.status(400).json({ status:0, message: "Missing id" });

  try {
const [rows] = await db.execute(
"SELECT * FROM collections WHERE collection_pk = ?", [id]
);

    if (rows.length === 0) {
      return res.status(404).json({message: "Item not found" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(404).json({ message: err.message });
  }
});

app.post("/api/get/collections", async (req, res) => {
  //const { id } = req.body;

  //if (!id) return res.status(400).json({ status:0, message: "Missing id" });

  try {
const [rows] = await db.execute(
"SELECT * FROM collections", 
);

    if (rows.length === 0) {
      return res.status(404).json({message: "Item not found" });
    }

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(404).json({ message: err.message });
  }
});

app.post("/api/get/item", async (req, res) => {
  const { id } = req.body;

  if (!id) return res.status(400).json({ status:0, message: "Missing id" });

  try {
const [rows] = await db.execute(
"SELECT * FROM items WHERE item_pk = ?", [id]
);

    if (rows.length === 0) {
      return res.status(404).json({message: "Item not found" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(404).json({ message: err.message });
  }
});

app.post("/api/get/items", async (req, res) => {
  //const { id } = req.body;

  //if (!id) return res.status(400).json({ status:0, message: "Missing id" });

  try {
const [rows] = await db.execute(
"SELECT * FROM items", 
);

    if (rows.length === 0) {
      return res.status(404).json({message: "Item not found" });
    }

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(404).json({ message: err.message });
  }
});

app.post("/api/get/items_collection", async (req, res) => {
  const { id } = req.body;

  if (!id) return res.status(400).json({ status:0, message: "Missing id" });

  try {
// Assuming collectionId is the given collection ID
const [rows] = await db.execute(
  `
    SELECT i.*
    FROM items i
    INNER JOIN item_to_collection ic ON i.item_pk = ic.item_fk
    WHERE ic.collection_fk = ?
  `,
  [id]
);



    if (rows.length === 0) {
      return res.status(404).json({message: "Item not found" });
    }

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(404).json({ message: err.message });
  }
});

app.post("/api/get/card_user", async (req, res) => {
  const { id } = req.body;

  if (!id) return res.status(400).json({ status:0, message: "Missing id" });

  try {
const [rows] = await db.execute(
"SELECT * FROM cart WHERE user_fk = ?", [id]
);

    if (rows.length === 0) {
      return res.status(404).json({message: "Item not found" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(404).json({ message: err.message });
  }
});

app.post("/api/get/card", async (req, res) => {
  const { id } = req.body;

  if (!id) return res.status(400).json({ status:0, message: "Missing id" });

  try {
const [rows] = await db.execute(
"SELECT * FROM cart WHERE card_pk = ?", [id]
);

    if (rows.length === 0) {
      return res.status(404).json({message: "Item not found" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(404).json({ message: err.message });
  }
});


app.post("/api/add/card_item", async (req, res) => {
  const { id, item_fk, quantity, variant } = req.body;

  if (!id) return res.status(400).json({ status:0, message: "Missing id" });



  try {

const [rows1] = await db.execute(
"SELECT * FROM items_to_card WHERE card_fk = ? AND WHERE item_fk = ?", [id, item_fk]
);

    if (rows1.length === 0) {
      return res.status(404).json({message: "Item alrady in card" });
    }


const [rows] = await db.execute(
  `INSERT INTO items_to_card (card_fk, item_fk, variant_fk, amount)
   VALUES (?, ?, ?, ?)`, [id, item_fk, variant, quantity]
);

    if (rows.length === 0) {
      return res.status(404).json({message: "Item not found" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(404).json({ message: err.message });
  }
});


app.post("/api/add/card_item", async (req, res) => {
  const { id, item_fk, quantity, variant } = req.body;

  if (!id) return res.status(400).json({ status:0, message: "Missing id" });



  try {

const [rows1] = await db.execute(
"SELECT * FROM items_to_card WHERE card_fk = ? AND WHERE item_fk = ?", [id, item_fk]
);

    if (rows1.length === 0) {
      return res.status(404).json({message: "Item alrady in card" });
    }


const [rows] = await db.execute(
  `INSERT INTO items_to_card (card_fk, item_fk, variant_fk, amount)
   VALUES (?, ?, ?, ?)`, [id, item_fk, variant, quantity]
);

    if (rows.length === 0) {
      return res.status(404).json({message: "Item not found" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(404).json({ message: err.message });
  }
});








// -----------------------------
// START SERVER
// -----------------------------
app.listen(3000, () => console.log("Server running on port 3000"));
