const express = require("express");
const pool = require("../database");
const authenticateToken = require("../middleware/auth");

const router = express.Router();


// GET VERIFICATION STATUS
router.get("/status", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT verification_status
            FROM user_verifications
            WHERE user_id = $1
            `,
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.json({
                status: "not_started"
            });
        }

        res.json({
            status: result.rows[0].verification_status
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Server error"
        });
    }
});


// MOCK DIGILOCKER VERIFICATION
router.post(
    "/mock-digilocker",
    authenticateToken,
    async (req, res) => {
        try {
            const {
                full_name,
                phone_number,
                address
            } = req.body;

            console.log("User:", req.user);
            console.log("Body:", req.body);

            if (!full_name) {
                return res.status(400).json({
                    message: "Full name is required"
                });
            }

            const result = await pool.query(
                `
                INSERT INTO user_verifications (
                    user_id,
                    full_name,
                    phone_number,
                    address,
                    document_type,
                    verification_status
                )
                VALUES ($1, $2, $3, $4, $5, $6)

                ON CONFLICT (user_id)
                DO UPDATE SET
                    full_name = EXCLUDED.full_name,
                    phone_number = EXCLUDED.phone_number,
                    address = EXCLUDED.address,
                    document_type = EXCLUDED.document_type,
                    verification_status = EXCLUDED.verification_status

                RETURNING *
                `,
                [
                    req.user.userId,
                    full_name,
                    phone_number,
                    address,
                    "digilocker_mock",
                    "verified"
                ]
            );

            res.status(200).json({
                message: "Verification successful",
                verification: result.rows[0]
            });

        } catch (error) {
            console.error("VERIFICATION ERROR:", error);

            res.status(500).json({
                message: error.message
            });
        }
    }
);


module.exports = router;