const express = require("express");
const jwt = require("jsonwebtoken");

const pool = require("../database");
const authenticateToken = require("../middleware/auth");

const {
    createAndSendOTP,
    verifyOTP
} = require("../services/otpService");

const router = express.Router();


/*
========================================
SEND DELETE ACCOUNT OTP
POST /api/account/delete/send-otp
========================================
*/

router.post(
    "/delete/send-otp",
    authenticateToken,
    async (req, res) => {
        try {
            const userId = req.user.userId;

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

            const email = result.rows[0].email;

            await createAndSendOTP({
                userId,
                email,
                purpose: "account_delete"
            });

            return res.json({
                message:
                    "Verification code sent to your email."
            });

        } catch (error) {
            console.error(
                "DELETE ACCOUNT OTP ERROR:",
                error
            );

            return res.status(500).json({
                message:
                    "Unable to send verification code."
            });
        }
    }
);


/*
========================================
VERIFY DELETE ACCOUNT OTP
POST /api/account/delete/verify-otp
========================================
*/

router.post(
    "/delete/verify-otp",
    authenticateToken,
    async (req, res) => {
        try {
            const userId = req.user.userId;
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

            const email = result.rows[0].email;

            // Verify OTP

            const isValid = await verifyOTP({
                email,
                otp,
                purpose: "account_delete"
            });

            if (!isValid) {
                return res.status(400).json({
                    message:
                        "Invalid or expired verification code."
                });
            }

            // Create temporary account deletion token

            const accountDeleteToken =
                jwt.sign(
                    {
                        userId,
                        purpose:
                            "account_delete"
                    },
                    process.env.JWT_SECRET,
                    {
                        expiresIn: "10m"
                    }
                );

            return res.json({
                message:
                    "Identity verified successfully.",

                accountDeleteToken
            });

        } catch (error) {
            console.error(
                "VERIFY DELETE OTP ERROR:",
                error
            );

            return res.status(500).json({
                message:
                    "Unable to verify verification code."
            });
        }
    }
);


/*
========================================
DELETE ACCOUNT
DELETE /api/account/delete
========================================
*/

router.delete(
    "/delete",
    authenticateToken,
    async (req, res) => {

        const client =
            await pool.connect();

        try {
            const userId = req.user.userId;

            const accountDeleteToken =
                req.headers[
                    "x-account-delete-token"
                ];

            if (!accountDeleteToken) {
                return res.status(403).json({
                    message:
                        "Account deletion verification required."
                });
            }


            // Verify temporary deletion token

            let decoded;

            try {
                decoded = jwt.verify(
                    accountDeleteToken,
                    process.env.JWT_SECRET
                );

            } catch (error) {
                return res.status(403).json({
                    message:
                        "Verification expired. Please verify again."
                });
            }


            // Make sure token belongs to this user

            if (
                decoded.userId !== userId ||
                decoded.purpose !==
                    "account_delete"
            ) {
                return res.status(403).json({
                    message:
                        "Invalid account deletion verification."
                });
            }


            /*
                Start database transaction
            */

            await client.query("BEGIN");


            /*
                Delete OTP records first
            */

            await client.query(
                `
                DELETE FROM email_otps
                WHERE user_id = $1
                `,
                [userId]
            );


            /*
                Delete payout details
            */

            await client.query(
                `
                DELETE FROM payout_details
                WHERE user_id = $1
                `,
                [userId]
            );


            /*
                Finally delete user
            */

            const result =
                await client.query(
                    `
                    DELETE FROM users
                    WHERE id = $1
                    RETURNING id
                    `,
                    [userId]
                );


            if (result.rows.length === 0) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(404).json({
                    message:
                        "User account not found."
                });
            }


            await client.query("COMMIT");


            return res.json({
                message:
                    "Account deleted successfully."
            });


        } catch (error) {

            await client.query(
                "ROLLBACK"
            );


            console.error(
                "DELETE ACCOUNT ERROR:",
                error
            );


            return res.status(500).json({
                message:
                    "Unable to delete account."
            });


        } finally {

            client.release();

        }
    }
);


module.exports = router;