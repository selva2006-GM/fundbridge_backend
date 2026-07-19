const express = require("express");
const pool = require("../database");
const authenticateToken = require("../middleware/auth");

const router = express.Router();


// GET ALL CAMPAIGNS
router.get("/", async (req, res) => {
    try {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 6;

        const search = req.query.search || "";
        const category = req.query.category || "All";
        const sort = req.query.sort || "urgent";

        const offset = (page - 1) * limit;

        const values = [];

        let query = `
    SELECT
        campaigns.*,
        users.username
    FROM campaigns
    JOIN users
        ON campaigns.user_id = users.id
    WHERE campaigns.end_date::date >= CURRENT_DATE
`;


        // SEARCH

        if (search) {
            values.push(`%${search}%`);

            query += `
                AND (
                    campaigns.title ILIKE $${values.length}
                    OR
                    campaigns.description ILIKE $${values.length}
                    OR
                    campaigns.beneficiary_name ILIKE $${values.length}
                )
            `;
        }


        // CATEGORY

        if (category !== "All") {
            values.push(category);

            query += `
                AND campaigns.category = $${values.length}
            `;
        }


        // SORTING

        if (sort === "urgent") {
            query += `
                ORDER BY campaigns.end_date ASC
            `;
        }

        else if (sort === "newest") {
            query += `
                ORDER BY campaigns.created_at DESC
            `;
        }

        else if (sort === "youngest") {
            query += `
                ORDER BY campaigns.beneficiary_age ASC
            `;
        }

        else if (sort === "oldest") {
            query += `
                ORDER BY campaigns.beneficiary_age DESC
            `;
        }

        else if (sort === "goal_low") {
            query += `
                ORDER BY campaigns.goal_amount ASC
            `;
        }

        else if (sort === "goal_high") {
            query += `
                ORDER BY campaigns.goal_amount DESC
            `;
        }


        // PAGINATION

        values.push(limit);

        const limitPosition = values.length;

        values.push(offset);

        const offsetPosition = values.length;

        query += `
            LIMIT $${limitPosition}
            OFFSET $${offsetPosition}
        `;


        const result = await pool.query(
            query,
            values
        );


        res.status(200).json({
            campaigns: result.rows,

            hasMore:
                result.rows.length === limit
        });


    } catch (error) {

        console.error(
            "GET CAMPAIGNS ERROR:",
            error
        );

        res.status(500).json({
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
router.get("/:id/donation-details", async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `
            SELECT
                campaigns.id,
                campaigns.title,
                campaigns.category,
                campaigns.goal_amount,
                campaigns.raised_amount,

                payout_details.account_holder_name,
                payout_details.bank_name,
                payout_details.upi_id,
                payout_details.payout_method

            FROM campaigns

            LEFT JOIN payout_details
                ON campaigns.user_id = payout_details.user_id

            WHERE campaigns.id = $1
            `,
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
        console.error(
            "DONATION DETAILS ERROR:",
            error
        );

        res.status(500).json({
            message: "Server error"
        });
    }
});





module.exports = router;