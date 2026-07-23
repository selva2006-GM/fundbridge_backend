const express = require("express");
const pool = require("../database");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

router.get(
    "/my-donations",
    authenticateToken,
    async (req, res) => {
        try {
            const userId = req.user.userId;

            const result = await pool.query(
                `
                SELECT
                    d.id,
                    d.campaign_id,
                    d.amount,
                    d.payment_status,
                    d.razorpay_order_id,
                    d.razorpay_payment_id,
                    d.transaction_id,
                    d.donor_name,
                    d.donor_email,
                    d.created_at,

                    c.title AS campaign_title,
                    c.image_url AS campaign_image,
                    c.category AS campaign_category

                FROM donations d

                JOIN campaigns c
                    ON d.campaign_id = c.id

                WHERE d.user_id = $1

                ORDER BY d.created_at DESC
                `,
                [userId]
            );

            return res.json(result.rows);

        } catch (error) {
            console.error(
                "GET MY DONATIONS ERROR:",
                error
            );

            return res.status(500).json({
                message: "Unable to fetch donations."
            });
        }
    }
);

module.exports = router;