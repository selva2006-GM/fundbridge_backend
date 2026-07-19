require("dotenv").config();

const cors = require("cors");
const express = require("express")
const bcrypt = require('bcrypt')
const pool = require("./database")
const jwt = require("jsonwebtoken");
const authenticateToken = require("./middleware/auth");
const campaignRoutes = require("./routes/campaignRoutes");
const verificationRoutes = require("./routes/verificationRoutes");
const payoutRoutes = require("./routes/payout");
const {createAndSendOTP, verifyOTP } = require("./services/otpService");

    
    
    
const app = express()

app.use(cors())
app.use(express.json())
app.use("/api/campaigns", campaignRoutes);
app.use("/api/payout", payoutRoutes);
app.use("/api/verification",verificationRoutes);

app.post("/register", async (req, res) => {
    try {
        const {
            username,
            email,
            password
        } = req.body;


        if (!username || !email || !password) {
            return res.status(400).json({
                message: "All fields are required"
            });
        }


        // Normalize email
        const normalizedEmail =
            email.trim().toLowerCase();


        // Hash password
        const passwordHash =
            await bcrypt.hash(password, 10);


        // Create user
        const result = await pool.query(
            `
            INSERT INTO users (
                username,
                email,
                password_hash,
                email_verified
            )

            VALUES ($1, $2, $3, FALSE)

            RETURNING
                id,
                username,
                email,
                email_verified,
                created_at
            `,
            [
                username,
                normalizedEmail,
                passwordHash
            ]
        );


        const user = result.rows[0];


        // Send registration OTP
        await createAndSendOTP({
            userId: user.id,
            email: user.email,
            purpose: "register"
        });


        res.status(201).json({
            message:
                "Registration successful. Please verify your email.",

            requiresVerification: true,

            email: user.email
        });


    } catch (error) {

        console.error(
            "REGISTER ERROR:",
            error
        );


        if (error.code === "23505") {

            return res.status(409).json({
                message:
                    "Username or email already exists"
            });

        }


        res.status(500).json({
            message: "Server error"
        });
    }
});


app.post(
    "/verify-registration",
    async (req, res) => {
        try {

            const {
                email,
                otp
            } = req.body;


            if (!email || !otp) {

                return res.status(400).json({
                    message:
                        "Email and OTP are required"
                });

            }


            const normalizedEmail =
                email.trim().toLowerCase();


            const isValid =
                await verifyOTP({

                    email:
                        normalizedEmail,

                    otp:
                        otp.toString(),

                    purpose:
                        "register"

                });


            if (!isValid) {

                return res.status(400).json({
                    message:
                        "Invalid or expired OTP"
                });

            }


            const result =
                await pool.query(
                    `
                    UPDATE users

                    SET email_verified = TRUE

                    WHERE email = $1

                    RETURNING
                        id,
                        username,
                        email,
                        email_verified
                    `,
                    [
                        normalizedEmail
                    ]
                );


            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({
                    message:
                        "User not found"
                });

            }


            res.status(200).json({

                message:
                    "Email verified successfully",

                user:
                    result.rows[0]

            });


        } catch (error) {

            console.error(
                "VERIFY REGISTRATION ERROR:",
                error
            );


            res.status(500).json({
                message:
                    "Server error"
            });

        }
    }
);



app.post("/login", async (req, res) => {
    try {
        const {
            identifier,
            password
        } = req.body;

        if (!identifier || !password) {
            return res.status(400).json({
                message:
                    "Email/username and password are required"
            });
        }

        const normalizedIdentifier =
            identifier.trim().toLowerCase();

        // Find user using email OR username
        const result = await pool.query(
            `
            SELECT *
            FROM users
            WHERE LOWER(email) = $1
               OR LOWER(username) = $1
            `,
            [normalizedIdentifier]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message:
                    "Invalid username/email or password"
            });
        }

        const user = result.rows[0];

        const passwordMatch =
            await bcrypt.compare(
                password,
                user.password_hash
            );

        if (!passwordMatch) {
            return res.status(401).json({
                message:
                    "Invalid username/email or password"
            });
        }

        // Optional: prevent login before email verification
        if (!user.email_verified) {
            return res.status(403).json({
                message:
                    "Please verify your email before logging in",
                requiresVerification: true,
                email: user.email
            });
        }

        const token = jwt.sign(
            {
                userId: user.id
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        res.status(200).json({
            message: "Login successful",

            token,

            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error(
            "LOGIN ERROR:",
            error
        );

        res.status(500).json({
            message: "Server error"
        });
    }
});

app.get("/profile", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT
                id,
                username,
                email,
                full_name,
                phone_number
            FROM users
            WHERE id = $1
            `,
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        res.status(200).json({
            user: result.rows[0]
        });

    } catch (error) {
        console.error(
            "PROFILE ERROR:",
            error
        );

        res.status(500).json({
            message: "Server error"
        });
    }
});



app.put("/profile", authenticateToken, async (req, res) =>{
    try{
        const {
            full_name,
            phone_number
        } = req.body;

        const result = await pool.query(
            `UPDATE users
            SET 
            full_name = $1,
            phone_number = $2
        WHERE id = $3
        RETURNING 
            id,
            username,
            email,
            full_name,
            phone_number`,
            [full_name,
                phone_number,
                req.user.userId
            ]
        );

        if(result.rows.length === 0){
            return res.status(404).json({
                message : "User not found"
            });
        }

        res.status(200).json({
            message : "Profile updated successfully",
            user : result.rows[0]
        });
    }catch(error){
        console.error(
            "UPDATE PROFILE ERROR:",
            error
        );

        res.status(500).json({
            message : "Server error"
        });
    }
});


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});