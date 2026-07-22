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

            console.log(
                "Fetching donations for user:",
                userId
            );

            const result = await pool.query(
                `
                SELECT
                    d.id,
                    d.amount,
                    d.payment_status,
                    d.created_at,
                    d.campaign_id,
                    c.title AS campaign_title
                FROM donations d
                LEFT JOIN campaigns c
                    ON d.campaign_id = c.id
                WHERE d.user_id = $1
                ORDER BY d.created_at DESC
                `,
                [userId]
            );
            
            console.log("ALL DONATIONS:", result.rows);
            console.log("JWT USER:", req.user);
            console.log("JWT USER ID:", req.user.userId);
            console.log("JWT USER ID TYPE:", typeof req.user.userId);
            
            res.json(result.rows);

        } catch (error) {
            console.error(
                "Fetch donations error:",
                error
            );

            res.status(500).json({
                message: "Failed to fetch donations"
            });
        }
    }
);

module.exports = router;