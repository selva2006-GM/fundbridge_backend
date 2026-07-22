const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const pool = require("../database");
const authenticateToken = require("../middleware/auth");

const {
    createAndSendOTP,
    verifyOTP
} = require("../services/otpService");

const router = express.Router();


// SEND PASSWORD CHANGE OTP

router.post(
    "/send-otp",
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
                purpose: "password_change"
            });

            return res.json({
                message:
                    "Verification code sent successfully."
            });

        } catch (error) {
            console.error(
                "PASSWORD OTP ERROR:",
                error
            );

            return res.status(500).json({
                message:
                    "Unable to send verification code."
            });
        }
    }
);


// VERIFY PASSWORD CHANGE OTP

router.post(
    "/verify-otp",
    authenticateToken,
    async (req, res) => {
        try {
            const userId = req.user.userId;
            const { otp } = req.body;

            if (!otp) {
                return res.status(400).json({
                    message: "OTP is required"
                });
            }

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

            const valid = await verifyOTP({
                email,
                otp,
                purpose: "password_change"
            });

            if (!valid) {
                return res.status(400).json({
                    message:
                        "Invalid or expired OTP"
                });
            }

            const passwordChangeToken =
                jwt.sign(
                    {
                        userId,
                        purpose:
                            "password_change"
                    },
                    process.env.JWT_SECRET,
                    {
                        expiresIn: "10m"
                    }
                );

            return res.json({
                message:
                    "OTP verified successfully",

                passwordChangeToken
            });

        } catch (error) {
            console.error(
                "VERIFY PASSWORD OTP ERROR:",
                error
            );

            return res.status(500).json({
                message:
                    "Unable to verify OTP"
            });
        }
    }
);


// CHANGE PASSWORD

router.put(
    "/change",
    authenticateToken,
    async (req, res) => {
        try {
            const userId = req.user.userId;

            const {
                newPassword
            } = req.body;

            const passwordChangeToken =
                req.headers[
                    "x-password-change-token"
                ];

            if (!passwordChangeToken) {
                return res.status(403).json({
                    message:
                        "Password verification required"
                });
            }

            let decoded;

            try {
                decoded = jwt.verify(
                    passwordChangeToken,
                    process.env.JWT_SECRET
                );
            } catch {
                return res.status(403).json({
                    message:
                        "Verification expired. Please verify again."
                });
            }

            if (
                decoded.userId !== userId ||
                decoded.purpose !==
                    "password_change"
            ) {
                return res.status(403).json({
                    message:
                        "Invalid verification"
                });
            }

            if (
                !newPassword ||
                newPassword.length < 8
            ) {
                return res.status(400).json({
                    message:
                        "Password must be at least 8 characters"
                });
            }

            const passwordHash =
                await bcrypt.hash(
                    newPassword,
                    10
                );

            await pool.query(
                `
                UPDATE users
                SET password_hash = $1
                WHERE id = $2
                `,
                [
                    passwordHash,
                    userId
                ]
            );

            return res.json({
                message:
                    "Password changed successfully"
            });

        } catch (error) {
            console.error(
                "CHANGE PASSWORD ERROR:",
                error
            );

            return res.status(500).json({
                message:
                    "Unable to change password"
            });
        }
    }
);


module.exports = router;