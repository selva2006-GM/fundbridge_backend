const express = require("express");
const pool = require("../database");
const authenticateToken = require("../middleware/auth");

const router  = express.Router();


router.get("/", authenticateToken, async(req,res)=>{
    try{
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
            WHERE user_id = $1`,
            [req.user.userId]
        );
        res.json({
            payout: result.rows[0] || null
        });
    }catch(error){
        console.error(
            "GET PAYOUT ERROR:",
            error
        );

        res.status(500).json({
            message : "Server error"
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