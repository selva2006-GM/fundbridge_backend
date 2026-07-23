const express = require("express");
const pool = require("../database");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

// GET ALL PUBLIC CAMPAIGNS
router.get("/", async (req, res) => {
    try {
        const {
            page = 1,
            limit = 6,
            search = "",
            category = "All",
            sort = "urgent"
        } = req.query;

        const pageNumber = Math.max(Number(page) || 1, 1);
        const limitNumber = Math.max(Number(limit) || 6, 1);
        const offset = (pageNumber - 1) * limitNumber;

        const values = [];
        const conditions = [
            `c.status = 'active'`,
            `p.razorpay_account_id IS NOT NULL`,
            `p.razorpay_account_status = 'connected'`
        ];


        // =========================
        // SEARCH
        // =========================

        if (search.trim()) {
            values.push(`%${search.trim()}%`);

            const index = values.length;

            conditions.push(`
                (
                    c.title ILIKE $${index}
                    OR c.description ILIKE $${index}
                    OR c.beneficiary_name ILIKE $${index}
                )
            `);
        }


        // =========================
        // CATEGORY
        // =========================

        if (category && category !== "All") {
            values.push(category);

            conditions.push(
                `c.category = $${values.length}`
            );
        }


        // =========================
        // SORTING
        // =========================

        let orderBy;

        switch (sort) {

            case "newest":
                orderBy = `c.created_at DESC`;
                break;

            case "youngest":
                orderBy = `
                    c.beneficiary_age ASC NULLS LAST
                `;
                break;

            case "oldest":
                orderBy = `
                    c.beneficiary_age DESC NULLS LAST
                `;
                break;

            case "goal_low":
                orderBy = `c.goal_amount ASC`;
                break;

            case "goal_high":
                orderBy = `c.goal_amount DESC`;
                break;

            case "urgent":
            default:
                orderBy = `
                    c.end_date ASC NULLS LAST
                `;
                break;
        }


        // =========================
        // FETCH ONE EXTRA CAMPAIGN
        // =========================
        // This helps determine hasMore.

        values.push(limitNumber + 1);
        const limitIndex = values.length;

        values.push(offset);
        const offsetIndex = values.length;


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

            WHERE ${conditions.join(" AND ")}

            ORDER BY ${orderBy}

            LIMIT $${limitIndex}
            OFFSET $${offsetIndex}
            `,
            values
        );


        // If we received more than requested,
        // another page exists.

        const hasMore =
            result.rows.length > limitNumber;

        const campaigns =
            result.rows.slice(0, limitNumber);


        return res.status(200).json({
            campaigns,
            hasMore,
            page: pageNumber
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