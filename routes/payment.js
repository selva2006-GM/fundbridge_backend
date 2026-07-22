const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const pool = require("../database");

const router = express.Router();
const authenticateToken = require("../middleware/auth");

const razorpay = new Razorpay({
    key_id:
        process.env.RAZORPAY_KEY_ID,

    key_secret:
        process.env.RAZORPAY_KEY_SECRET
});


// ========================================
// CREATE RAZORPAY ORDER
// POST /api/payments/create-order
// ========================================

router.post(
    "/create-order",
    async (req, res) => {

        try {

            const userId = req.user.userId;

            const {
                campaignId,
                amount
            } = req.body;


            const donationAmount =
                Number(amount);


            if (
                !campaignId ||
                !donationAmount ||
                donationAmount <= 0
            ) {

                return res.status(400).json({
                    message:
                        "Invalid campaign or donation amount."
                });

            }


            // Check campaign exists

            const campaignResult =
                await pool.query(
                    `
                    SELECT id, title
                    FROM campaigns
                    WHERE id = $1
                    `,
                    [campaignId]
                );


            if (
                campaignResult.rows.length === 0
            ) {

                return res.status(404).json({
                    message:
                        "Campaign not found."
                });

            }


            /*
                Razorpay uses paise.

                ₹100 = 10000 paise
            */

            const amountInPaise =
                Math.round(
                    donationAmount * 100
                );


            // Create Razorpay order

            const order =
                await razorpay.orders.create({

                    amount:
                        amountInPaise,

                    currency:
                        "INR",

                    receipt:
                        `donation_${Date.now()}`,

                    notes: {
                        campaignId:
                            String(campaignId)
                    }

                });


            // Save pending donation

            await pool.query(
                `
                INSERT INTO donations (
                    campaign_id,
                    user_id,
                    amount,
                    razorpay_order_id,
                    payment_status
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    'created'
                )
                `,
                [
                    campaignId,
                    userId,
                    donationAmount,
                    order.id
                ]
            );


            return res.json({

                orderId:
                    order.id,

                amount:
                    order.amount,

                currency:
                    order.currency,

                key:
                    process.env
                        .RAZORPAY_KEY_ID

            });


        } catch (error) {

            console.error(
                "CREATE ORDER ERROR:",
                error
            );


            return res.status(500).json({
                message:
                    "Unable to create payment order."
            });

        }

    }
);


// ========================================
// VERIFY RAZORPAY PAYMENT
// POST /api/payments/verify
// ========================================

router.post(
    "/verify",
    async (req, res) => {

        const client =
            await pool.connect();


        try {

            const {

                razorpay_order_id,

                razorpay_payment_id,

                razorpay_signature

            } = req.body;


            if (
                !razorpay_order_id ||
                !razorpay_payment_id ||
                !razorpay_signature
            ) {

                return res.status(400).json({
                    message:
                        "Missing payment information."
                });

            }


            /*
                Find the order created by
                OUR backend.
            */

            const donationResult =
                await client.query(
                    `
                    SELECT *

                    FROM donations

                    WHERE razorpay_order_id = $1
                    `,
                    [
                        razorpay_order_id
                    ]
                );


            if (
                donationResult.rows.length === 0
            ) {

                return res.status(404).json({
                    message:
                        "Donation order not found."
                });

            }


            const donation =
                donationResult.rows[0];


            /*
                Generate expected signature.

                orderId | paymentId
            */

            const expectedSignature =
                crypto
                    .createHmac(
                        "sha256",
                        process.env
                            .RAZORPAY_KEY_SECRET
                    )
                    .update(
                        donation
                            .razorpay_order_id +
                        "|" +
                        razorpay_payment_id
                    )
                    .digest("hex");


            /*
                Verify signature
            */

            if (
                expectedSignature !==
                razorpay_signature
            ) {

                return res.status(400).json({
                    message:
                        "Payment verification failed."
                });

            }


            await client.query("BEGIN");

            const updatedDonation = await client.query(
                `
                UPDATE donations
                SET
                    razorpay_payment_id = $1,
                    payment_status = 'paid'
                WHERE razorpay_order_id = $2
                AND payment_status != 'paid'
                RETURNING campaign_id, amount
                `,
                [
                    razorpay_payment_id,
                    razorpay_order_id
                ]
            );

            if (updatedDonation.rows.length === 0) {
                await client.query("ROLLBACK");

                return res.status(409).json({
                    message: "Payment already processed."
                });
            }

            const paidDonation = updatedDonation.rows[0];

            // Increase campaign raised amount
            await client.query(
                `
                UPDATE campaigns
                SET raised_amount =
                    COALESCE(raised_amount, 0) + $1
                WHERE id = $2
                `,
                [
                    paidDonation.amount,
                    paidDonation.campaign_id
                ]
            );

            await client.query("COMMIT");

            return res.json({

                success: true,

                message:
                    "Donation completed successfully."

            });


        } catch (error) {

            await client.query(
                "ROLLBACK"
            );


            console.error(
                "VERIFY PAYMENT ERROR:",
                error
            );


            return res.status(500).json({
                message:
                    "Unable to verify payment."
            });


        } finally {

            client.release();

        }

    }
);


module.exports = router;