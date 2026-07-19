const express = require("express");
const pool = require("../database");
const authenticateToken = require("../middleware/auth");

const router  = express.Router();

router.get("/", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT 
                id,
                account_holder_name,
                bank_name,
                account_number,
                ifsc_code,
                upi_id,
                payout_method
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

        // Mask account number
        if (payout.account_number) {
            const accountNumber =
                String(payout.account_number);

            payout.account_number =
                "••••••••" +
                accountNumber.slice(-4);
        }

        // Mask IFSC
        if (payout.ifsc_code) {
            payout.ifsc_code =
                payout.ifsc_code.slice(0, 4) +
                "••••••";
        }

        // Mask UPI
        if (payout.upi_id) {
            const [name, provider] =
                payout.upi_id.split("@");

            payout.upi_id =
                `${name.slice(0, 2)}••••@${provider}`;
        }

        res.json({
            payout
        });

    } catch (error) {
        console.error(
            "GET PAYOUT ERROR:",
            error
        );

        res.status(500).json({
            message: "Server error"
        });
    }
});

router.put("/", authenticateToken, async (req, res) => {
    try {
        const {
            account_holder_name,
            bank_name,
            account_number,
            ifsc_code,
            upi_id,
            payout_method
        } = req.body;


        const result = await pool.query(
            `
            INSERT INTO payout_details (
                user_id,
                account_holder_name,
                bank_name,
                account_number,
                ifsc_code,
                upi_id,
                payout_method
            )

            VALUES (
                $1, $2, $3, $4, $5, $6, $7
            )

            ON CONFLICT (user_id)

            DO UPDATE SET

                account_holder_name =
                    EXCLUDED.account_holder_name,

                bank_name =
                    EXCLUDED.bank_name,

                account_number =
                    EXCLUDED.account_number,

                ifsc_code =
                    EXCLUDED.ifsc_code,

                upi_id =
                    EXCLUDED.upi_id,

                payout_method =
                    EXCLUDED.payout_method,

                updated_at =
                    CURRENT_TIMESTAMP

            RETURNING *
            `,
            [
                req.user.userId,
                account_holder_name,
                bank_name,
                account_number,
                ifsc_code,
                upi_id,
                payout_method
            ]
        );


        res.json({
            message:
                "Payout details saved successfully",

            payout: result.rows[0]
        });


    } catch (error) {

        console.error(
            "SAVE PAYOUT ERROR:",
            error
        );

        res.status(500).json({
            message: "Server error"
        });
    }
});


module.exports = router;