import express from "express";
import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post("/create-checkout-session", async (req, res) => {
  const { price, orderId } = req.body;

  if (!price || !orderId)
    return res.status(400).json({ error: "Missing price or orderId" });

  try {
    const amountInCents = Math.round(price * 100);

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

      metadata: {
        orderId: orderId,
      },

      success_url: "https://yourdomain.com/success",
      cancel_url: "https://yourdomain.com/cancel",
    });

    res.json({ url: session.url });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
