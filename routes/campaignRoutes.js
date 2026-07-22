const express = require("express");
const pool = require("../database");
const authenticateToken = require("../middleware/auth");

const router = express.Router();


// GET ALL CAMPAIGNS
// GET ALL PUBLIC CAMPAIGNS
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                c.*,
                u.username,
                u.full_name

            FROM campaigns c

            JOIN users u
                ON c.user_id = u.id

            JOIN payout_details p
                ON p.user_id = c.user_id

            WHERE c.status = 'active'
            AND p.razorpay_account_id IS NOT NULL
            AND p.razorpay_account_status = 'connected'

            ORDER BY c.created_at DESC
            `
        );

        return res.status(200).json({
            campaigns: result.rows
        });

    } catch (error) {
        console.error(
            "GET CAMPAIGNS ERROR:",
            error
        );

        return res.status(500).json({
            message: "Server error"
        });
    }
});



// GET LOGGED-IN USER'S CAMPAIGNS
router.get("/my", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                campaigns.*,
                users.username
            FROM campaigns
            JOIN users
                ON campaigns.user_id = users.id
            WHERE campaigns.user_id = $1
            ORDER BY campaigns.created_at DESC
            `,
            [req.user.userId]
        );

        res.status(200).json({
            campaigns: result.rows
        });

    } catch (error) {
        console.error(
            "GET MY CAMPAIGNS ERROR:",
            error
        );

        res.status(500).json({
            message: "Server error"
        });
    }
});



// GET SINGLE CAMPAIGN
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `SELECT * FROM campaigns WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Campaign not found"
            });
        }

        res.status(200).json({
            campaign: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});


// CREATE CAMPAIGN
router.post("/", authenticateToken, async (req, res) => {
    try {
        const {
            title,
            description,
            category,
            goal_amount,
            image_url,
            beneficiary_name,
            beneficiary_age,
            end_date
        } = req.body;

        if (!title || !description || !goal_amount) {
            return res.status(400).json({
                message:
                    "Title, description and goal amount are required"
            });
        }

        const result = await pool.query(
            `
            INSERT INTO campaigns (
                user_id,
                title,
                description,
                category,
                goal_amount,
                image_url,
                beneficiary_name,
                beneficiary_age,
                end_date
            )
            VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9
            )
            RETURNING *
            `,
            [
                req.user.userId,
                title,
                description,
                category,
                goal_amount,
                image_url || null,
                beneficiary_name || null,
                beneficiary_age || null,
                end_date
            ]
        );

        res.status(201).json({
            message: "Campaign created successfully",
            campaign: result.rows[0]
        });

    } catch (error) {
        console.error(
            "CREATE CAMPAIGN ERROR:",
            error
        );

        res.status(500).json({
            message: "Server error"
        });
    }
});


// UPDATE CAMPAIGN
router.put("/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const {
            title,
            description,
            category,
            goal_amount,
            image_url,
            beneficiary_name,
            end_date
        } = req.body;
        
        const result = await pool.query(
            `
            UPDATE campaigns
            SET
                title = $1,
                description = $2,
                category = $3,
                goal_amount = $4,
                image_url = $5,
                beneficiary_name = $6,
                end_date = $7
            WHERE id = $8
            AND user_id = $9
            RETURNING *
            `,
            [
                title,
                description,
                category,
                goal_amount,
                image_url,
                beneficiary_name,
                end_date,
                id,
                req.user.userId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Campaign not found or unauthorized"
            });
        }

        res.json({
            message: "Campaign updated successfully",
            campaign: result.rows[0]
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});


// DELETE CAMPAIGN
router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `
            DELETE FROM campaigns
            WHERE id = $1
            AND user_id = $2
            RETURNING *
            `,
            [
                id,
                req.user.userId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Campaign not found or unauthorized"
            });
        }

        res.json({
            message: "Campaign deleted successfully"
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});


// GET CAMPAIGN DONATION DETAILS
// GET ALL PUBLIC CAMPAIGNS
// GET CAMPAIGN DONATION DETAILS
router.get("/:id/donation-details", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `
            SELECT
                c.id,
                c.title,
                c.category,
                c.goal_amount,
                c.raised_amount,
                c.end_date,
                u.username,
                p.razorpay_account_id

            FROM campaigns c

            JOIN users u
                ON c.user_id = u.id

            JOIN payout_details p
                ON p.user_id = c.user_id

            WHERE c.id = $1
            AND c.status = 'active'
            AND p.razorpay_account_id IS NOT NULL
            AND p.razorpay_account_status = 'connected'
            `,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message:
                    "Campaign not found or payout account not connected"
            });
        }

        return res.status(200).json({
            campaign: result.rows[0]
        });

    } catch (error) {
        console.error(
            "GET DONATION DETAILS ERROR:",
            error
        );

        return res.status(500).json({
            message: "Server error"
        });
    }
});





module.exports = router;