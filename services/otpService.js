const crypto = require("crypto");

const pool = require("../database");

const {
    sendOTPEmail
} = require("./emailService");


function generateOTP() {

    return crypto
        .randomInt(100000, 1000000)
        .toString();

}


function hashOTP(otp) {

    return crypto
        .createHash("sha256")
        .update(otp)
        .digest("hex");

}


async function createAndSendOTP({
    userId,
    email,
    purpose
}) {

    const otp = generateOTP();

    const otpHash =
        hashOTP(otp);


    // Delete old OTPs for this purpose

    await pool.query(
        `
        DELETE FROM email_otps

        WHERE email = $1
        AND purpose = $2
        `,
        [
            email,
            purpose
        ]
    );


    // OTP expires after 10 minutes

    await pool.query(
        `
        INSERT INTO email_otps (
            user_id,
            email,
            otp_hash,
            purpose,
            expires_at
        )

        VALUES (
            $1,
            $2,
            $3,
            $4,
            NOW() + INTERVAL '10 minutes'
        )
        `,
        [
            userId || null,
            email,
            otpHash,
            purpose
        ]
    );


    await sendOTPEmail({
        email,
        otp,
        purpose
    });


    return true;
}


async function verifyOTP({
    email,
    otp,
    purpose
}) {

    const otpHash =
        hashOTP(otp);


    const result =
        await pool.query(
            `
            SELECT *

            FROM email_otps

            WHERE email = $1

            AND otp_hash = $2

            AND purpose = $3

            AND expires_at > NOW()

            ORDER BY created_at DESC

            LIMIT 1
            `,
            [
                email,
                otpHash,
                purpose
            ]
        );


    if (
        result.rows.length === 0
    ) {
        return false;
    }


    // OTP can only be used once

    await pool.query(
        `
        DELETE FROM email_otps
        WHERE id = $1
        `,
        [
            result.rows[0].id
        ]
    );


    return true;
}


module.exports = {
    createAndSendOTP,
    verifyOTP
};