const { Resend } = require("resend");

const resend = new Resend(
    process.env.RESEND_API_KEY
);

async function sendOTPEmail({
    email,
    otp,
    purpose
}) {

    let subject = "Your FundBridge verification code";
    let title = "Verify your email";

    if (purpose === "forgot_password") {
        subject = "Reset your FundBridge password";
        title = "Reset your password";
    }

    if (purpose === "change_email") {
        subject = "Verify your new email";
        title = "Confirm your new email address";
    }


    const { data, error } =
        await resend.emails.send({

            // Development sender
            from: "FundBridge <contact@selvacodes.online>",

            to: email,

            subject,

            html: `
                <div
                    style="
                        font-family: Arial, sans-serif;
                        max-width: 500px;
                        margin: auto;
                        padding: 30px;
                    "
                >

                    <h2>
                        ${title}
                    </h2>

                    <p>
                        Your FundBridge verification
                        code is:
                    </p>

                    <div
                        style="
                            font-size: 32px;
                            font-weight: bold;
                            letter-spacing: 8px;
                            margin: 25px 0;
                        "
                    >
                        ${otp}
                    </div>

                    <p>
                        This code will expire in
                        10 minutes.
                    </p>

                    <p>
                        If you did not request this,
                        you can ignore this email.
                    </p>

                </div>
            `
        });


    if (error) {
        console.error(
            "RESEND ERROR:",
            error
        );

        throw new Error(
            "Failed to send verification email"
        );
    }


    return data;
}


module.exports = {
    sendOTPEmail
};