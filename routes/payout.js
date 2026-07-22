const express = require("express");
const jwt = require("jsonwebtoken");

const pool = require("../database");
const authenticateToken = require("../middleware/auth");

const {
    createAndSendOTP,
    verifyOTP
} = require("../services/otpService");

const router = express.Router();

router.get("/", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                id,
                razorpay_account_id,
                razorpay_account_status,
                created_at,
                updated_at
            FROM payout_details
            WHERE user_id = $1
            `,
            [req.user.userId]
        );

        const payout = result.rows[0];

        if (!payout) {
            return res.json({
                payout: null
            });
        }

        
        return res.json({
            payout
        });

    } catch (error) {
        console.error("GET PAYOUT ERROR:", error);

        return res.status(500).json({
            message: "Server error"
        });
    }
});
router.put(
    "/",
    authenticateToken,
    async (req, res) => {
        try {
            const userId = req.user.userId;

            const {
                razorpay_account_id,
                razorpay_account_status
            } = req.body;

            const payoutEditToken =
                req.headers[
                    "x-payout-edit-token"
                ];


            if (!razorpay_account_id) {
                return res.status(400).json({
                    message:
                        "Razorpay account ID is required."
                });
            }


            /*
                If payout already exists,
                require OTP verification before changing it
            */

            const existing =
                await pool.query(
                    `
                    SELECT razorpay_account_id
                    FROM payout_details
                    WHERE user_id = $1
                    `,
                    [userId]
                );


            if (
                existing.rows.length > 0 &&
                existing.rows[0]
                    .razorpay_account_id
            ) {

                if (!payoutEditToken) {
                    return res.status(403).json({
                        message:
                            "Verification required before changing payout account."
                    });
                }


                try {

                    const decoded =
                        jwt.verify(
                            payoutEditToken,
                            process.env.JWT_SECRET
                        );


                    if (
                        decoded.userId !== userId ||
                        decoded.purpose !==
                            "payout_edit"
                    ) {

                        return res
                            .status(403)
                            .json({
                                message:
                                    "Invalid payout verification."
                            });

                    }

                } catch (error) {

                    return res
                        .status(403)
                        .json({
                            message:
                                "Verification expired. Please verify again."
                        });

                }
            }


            const result =
                await pool.query(
                    `
                    INSERT INTO payout_details (
                        user_id,
                        razorpay_account_id,
                        razorpay_account_status
                    )

                    VALUES (
                        $1,
                        $2,
                        $3
                    )

                    ON CONFLICT (user_id)

                    DO UPDATE SET

                        razorpay_account_id =
                            EXCLUDED.razorpay_account_id,

                        razorpay_account_status =
                            EXCLUDED.razorpay_account_status,

                        updated_at =
                            CURRENT_TIMESTAMP

                    RETURNING
                        id,
                        razorpay_account_id,
                        razorpay_account_status,
                        created_at,
                        updated_at
                    `,
                    [
                        userId,
                        razorpay_account_id,
                        razorpay_account_status ||
                            "pending"
                    ]
                );


            return res.json({
                message:
                    "Payout account updated successfully.",

                payout:
                    result.rows[0]
            });


        } catch (error) {

            console.error(
                "SAVE PAYOUT ERROR:",
                error
            );


            return res
                .status(500)
                .json({
                    message:
                        "Unable to save payout account."
                });

        }
    }
);


// ==========================================
// SEND OTP FOR PAYOUT EDITING
// POST /api/payout/send-otp
// ==========================================

router.post(
    "/send-otp",
    authenticateToken,
    async (req, res) => {

        try {

            const userId =
                req.user.userId;


            // Get logged-in user's email

            const result = await pool.query(
                `
                SELECT email
                FROM users
                WHERE id = $1
                `,
                [userId]
            );


            if (result.rows.length === 0) {

                return res.status(404).json({
                    message: "User not found"
                });

            }


            const email =
                result.rows[0].email;


            // Create and send OTP

            await createAndSendOTP({
                userId,
                email,
                purpose: "payout_edit"
            });


            return res.json({
                message:
                    "Verification code sent to your email."
            });


        } catch (error) {

            console.error(
                "SEND PAYOUT OTP ERROR:",
                error
            );


            return res.status(500).json({
                message:
                    "Unable to send verification code."
            });

        }

    }
);




// ==========================================
// VERIFY OTP FOR PAYOUT EDITING
// POST /api/payout/verify-otp
// ==========================================

router.post(
    "/verify-otp",
    authenticateToken,
    async (req, res) => {

        try {

            const userId =
                req.user.userId;

            const { otp } = req.body;


            if (!otp) {

                return res.status(400).json({
                    message:
                        "Verification code is required."
                });

            }


            // Get user's email

            const result = await pool.query(
                `
                SELECT email
                FROM users
                WHERE id = $1
                `,
                [userId]
            );


            if (result.rows.length === 0) {

                return res.status(404).json({
                    message: "User not found"
                });

            }


            const email =
                result.rows[0].email;


            // Verify OTP

            const isValid =
                await verifyOTP({
                    email,
                    otp,
                    purpose: "payout_edit"
                });


            if (!isValid) {

                return res.status(400).json({
                    message:
                        "Invalid or expired verification code."
                });

            }


            // Create temporary authorization token

            const payoutEditToken =
                jwt.sign(
                    {
                        userId,
                        purpose:
                            "payout_edit"
                    },
                    process.env.JWT_SECRET,
                    {
                        expiresIn: "10m"
                    }
                );


            return res.json({

                message:
                    "Identity verified successfully.",

                payoutEditToken

            });


        } catch (error) {

            console.error(
                "VERIFY PAYOUT OTP ERROR:",
                error
            );


            return res.status(500).json({
                message:
                    "Unable to verify verification code."
            });

        }

    }
);

module.exports = router;